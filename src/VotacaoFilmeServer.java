package src;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class VotacaoFilmeServer {

    private static final String DATA_FILE = "cinevoto_data.txt";

    // Listas thread-safe para suportar acessos concorrentes
    private static final List<String> movies = new CopyOnWriteArrayList<>();
    private static final List<AtomicInteger> votes = new CopyOnWriteArrayList<>();
    private static final List<String> watched = new CopyOnWriteArrayList<>();
    // IPs que já votaram na rodada ativa
    private static final List<String> votedIps = new CopyOnWriteArrayList<>();

    public static void main(String[] args) throws IOException {
        // Carrega dados persistidos ao iniciar
        loadData();

        int port = 8080;
        
        // Permite definir a porta via argumento ou variável de ambiente (bom para o Ubuntu)
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                System.err.println("Porta inválida. Usando a porta padrão 8080.");
            }
        } else {
            String envPort = System.getenv("PORT");
            if (envPort != null) {
                try {
                    port = Integer.parseInt(envPort);
                } catch (NumberFormatException ignored) {}
            }
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        // Endpoints de API
        server.createContext("/api/estado", new EstadoHandler());
        server.createContext("/api/iniciar", new IniciarHandler());
        server.createContext("/api/votar", new VotarHandler());
        server.createContext("/api/finalizar", new FinalizarHandler());
        server.createContext("/api/reset", new ResetHandler());

        // Servidor de arquivos estáticos
        server.createContext("/", new StaticFileHandler());

        // Executor multi-thread para lidar com múltiplos acessos em paralelo
        server.setExecutor(Executors.newFixedThreadPool(10));
        
        System.out.println("=================================================");
        System.out.println(" Servidor CineVoto ativo na porta " + port);
        System.out.println(" Acesse: http://localhost:" + port);
        System.out.println(" Pressione Ctrl+C para encerrar.");
        System.out.println("=================================================");
        
        server.start();
    }

    // Persistência: Carrega os dados do arquivo cinevoto_data.txt
    private static synchronized void loadData() {
        File file = new File(DATA_FILE);
        if (!file.exists()) {
            return;
        }

        try (BufferedReader br = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            String section = "";
            movies.clear();
            votes.clear();
            watched.clear();
            votedIps.clear();

            while ((line = br.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;

                if (line.equals("[ACTIVE]")) {
                    section = "ACTIVE";
                    continue;
                } else if (line.equals("[WATCHED]")) {
                    section = "WATCHED";
                    continue;
                } else if (line.equals("[VOTERS]")) {
                    section = "VOTERS";
                    continue;
                }

                if ("ACTIVE".equals(section)) {
                    String[] parts = line.split(";");
                    if (parts.length == 2) {
                        movies.add(parts[0]);
                        votes.add(new AtomicInteger(Integer.parseInt(parts[1])));
                    }
                } else if ("WATCHED".equals(section)) {
                    watched.add(line);
                } else if ("VOTERS".equals(section)) {
                    votedIps.add(line);
                }
            }
            System.out.println("Dados carregados com sucesso de " + DATA_FILE);
        } catch (IOException e) {
            System.err.println("Erro ao carregar dados: " + e.getMessage());
        } catch (NumberFormatException e) {
            System.err.println("Erro de formato nos dados persistidos: " + e.getMessage());
        }
    }

    // Persistência: Salva os dados no arquivo cinevoto_data.txt
    private static synchronized void saveData() {
        try (BufferedWriter bw = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(DATA_FILE), StandardCharsets.UTF_8))) {
            bw.write("[ACTIVE]");
            bw.newLine();
            for (int i = 0; i < movies.size(); i++) {
                bw.write(movies.get(i) + ";" + votes.get(i).get());
                bw.newLine();
            }
            
            bw.write("[VOTERS]");
            bw.newLine();
            for (String ip : votedIps) {
                bw.write(ip);
                bw.newLine();
            }

            bw.write("[WATCHED]");
            bw.newLine();
            for (String watchedMovie : watched) {
                bw.write(watchedMovie);
                bw.newLine();
            }
            System.out.println("Dados salvos em " + DATA_FILE);
        } catch (IOException e) {
            System.err.println("Erro ao salvar dados: " + e.getMessage());
        }
    }

    // Retorna o estado completo da aplicação em JSON, indicando se o IP do cliente já votou
    private static String getStateJson(String clientIp) {
        StringBuilder sb = new StringBuilder("{");
        
        // Verifica se o IP do cliente já votou
        boolean hasVoted = votedIps.contains(clientIp);
        sb.append(String.format("\"usuarioVotou\":%b,", hasVoted));

        // Filmes ativos
        sb.append("\"ativos\":[");
        for (int i = 0; i < movies.size(); i++) {
            sb.append(String.format("{\"id\":%d,\"titulo\":\"%s\",\"votos\":%d}",
                    i, 
                    movies.get(i).replace("\\", "\\\\").replace("\"", "\\\""), 
                    votes.get(i).get()
            ));
            if (i < movies.size() - 1) {
                sb.append(",");
            }
        }
        sb.append("],");
        
        // Histórico de assistidos
        sb.append("\"assistidos\":[");
        for (int i = 0; i < watched.size(); i++) {
            sb.append(String.format("\"%s\"", watched.get(i).replace("\\", "\\\\").replace("\"", "\\\"")));
            if (i < watched.size() - 1) {
                sb.append(",");
            }
        }
        sb.append("]");
        
        sb.append("}");
        return sb.toString();
    }

    // Envia resposta JSON padrão
    private static void sendJsonResponse(HttpExchange exchange, int statusCode, String jsonResponse) throws IOException {
        byte[] bytes = jsonResponse.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
        
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    // Handler para OPTIONS (CORS preflight)
    private static boolean handleOptions(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
            exchange.sendResponseHeaders(204, -1);
            return true;
        }
        return false;
    }

    // GET /api/estado
    static class EstadoHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;
            
            if ("GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                String clientIp = exchange.getRemoteAddress().getAddress().getHostAddress();
                sendJsonResponse(exchange, 200, getStateJson(clientIp));
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use GET.\"}");
            }
        }
    }

    // POST /api/iniciar
    static class IniciarHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                try {
                    String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                    List<String> newMovies = new ArrayList<>();

                    // Parse simples de array JSON ["A", "B", "C"]
                    int startIdx = body.indexOf('[');
                    int endIdx = body.indexOf(']');
                    if (startIdx != -1 && endIdx != -1 && endIdx > startIdx) {
                        String arrayContent = body.substring(startIdx + 1, endIdx);
                        String[] items = arrayContent.split(",");
                        for (String item : items) {
                            String clean = item.trim();
                            if (clean.startsWith("\"") && clean.endsWith("\"")) {
                                clean = clean.substring(1, clean.length() - 1);
                            }
                            clean = clean.replace("\\\"", "\"").trim();
                            if (!clean.isEmpty()) {
                                newMovies.add(clean);
                            }
                        }
                    }

                    // Validação de negócio 1: Exatamente 3 filmes
                    if (newMovies.size() != 3) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Você deve sugerir exatamente 3 filmes para iniciar a votação.\"}");
                        return;
                    }

                    // Validação de negócio 2: Nenhum pode ser repetido nos assistidos
                    for (String movie : newMovies) {
                        for (String w : watched) {
                            if (w.equalsIgnoreCase(movie)) {
                                sendJsonResponse(exchange, 400, String.format("{\"error\":\"O filme '%s' já foi assistido anteriormente! Escolha outro.\"}", movie));
                                return;
                            }
                        }
                    }

                    // Inicializa a nova rodada e limpa os IPs votantes da rodada anterior
                    movies.clear();
                    votes.clear();
                    votedIps.clear();
                    
                    for (String m : newMovies) {
                        movies.add(m);
                        votes.add(new AtomicInteger(0));
                    }

                    saveData();
                    String clientIp = exchange.getRemoteAddress().getAddress().getHostAddress();
                    sendJsonResponse(exchange, 200, getStateJson(clientIp));
                } catch (Exception e) {
                    sendJsonResponse(exchange, 500, "{\"error\":\"Erro ao iniciar rodada de votação.\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // POST /api/votar
    static class VotarHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                try {
                    String clientIp = exchange.getRemoteAddress().getAddress().getHostAddress();

                    // Validação de negócio: Apenas 1 voto por IP
                    if (votedIps.contains(clientIp)) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Você já votou nesta rodada!\"}");
                        return;
                    }

                    String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                    int id = -1;
                    
                    Pattern p = Pattern.compile("\"id\"\\s*:\\s*(\\d+)");
                    Matcher m = p.matcher(body);
                    if (m.find()) {
                        id = Integer.parseInt(m.group(1));
                    }

                    if (id >= 0 && id < votes.size()) {
                        votes.get(id).incrementAndGet();
                        votedIps.add(clientIp); // Registra que este IP já votou
                        
                        saveData();
                        sendJsonResponse(exchange, 200, getStateJson(clientIp));
                    } else {
                        sendJsonResponse(exchange, 400, "{\"error\":\"ID de filme inválido.\"}");
                    }
                } catch (Exception e) {
                    sendJsonResponse(exchange, 500, "{\"error\":\"Erro ao registrar voto.\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // POST /api/finalizar
    static class FinalizarHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                if (movies.isEmpty()) {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Nenhuma votação ativa para finalizar.\"}");
                    return;
                }

                // Determinar o filme vencedor (primeiro em caso de empate)
                int maxVotes = -1;
                int winnerIdx = -1;
                for (int i = 0; i < votes.size(); i++) {
                    int v = votes.get(i).get();
                    if (v > maxVotes) {
                        maxVotes = v;
                        winnerIdx = i;
                    }
                }

                if (winnerIdx != -1) {
                    String winner = movies.get(winnerIdx);
                    watched.add(winner); // Move para a lista de assistidos
                    
                    // Limpa filmes ativos e lista de votantes para a próxima rodada
                    movies.clear();      
                    votes.clear();
                    votedIps.clear();

                    saveData();
                    String clientIp = exchange.getRemoteAddress().getAddress().getHostAddress();
                    sendJsonResponse(exchange, 200, getStateJson(clientIp));
                } else {
                    sendJsonResponse(exchange, 500, "{\"error\":\"Não foi possível determinar o vencedor.\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // POST /api/reset
    static class ResetHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                // Limpa apenas a rodada ativa. A lista de filmes assistidos é preservada!
                movies.clear();
                votes.clear();
                votedIps.clear();

                saveData(); // Salva o novo estado mantendo o histórico de assistidos

                String clientIp = exchange.getRemoteAddress().getAddress().getHostAddress();
                sendJsonResponse(exchange, 200, getStateJson(clientIp));
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // Servidor de Arquivos Estáticos
    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/")) {
                path = "/index.html";
            }

            File file = new File("web" + path);
            if (!file.exists() || file.isDirectory()) {
                byte[] response = "404 Not Found".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(404, response.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(response);
                }
                return;
            }

            String mime = "text/plain; charset=utf-8";
            if (path.endsWith(".html")) mime = "text/html; charset=utf-8";
            else if (path.endsWith(".css")) mime = "text/css; charset=utf-8";
            else if (path.endsWith(".js")) mime = "application/javascript; charset=utf-8";
            else if (path.endsWith(".png")) mime = "image/png";
            else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) mime = "image/jpeg";
            else if (path.endsWith(".ico")) mime = "image/x-icon";
            else if (path.endsWith(".svg")) mime = "image/svg+xml";

            exchange.getResponseHeaders().set("Content-Type", mime);
            exchange.sendResponseHeaders(200, file.length());
            
            try (FileInputStream fis = new FileInputStream(file);
                 OutputStream os = exchange.getResponseBody()) {
                byte[] buffer = new byte[4096];
                int bytesRead;
                while ((bytesRead = fis.read(buffer)) != -1) {
                    os.write(buffer, 0, bytesRead);
                }
            }
        }
    }
}
