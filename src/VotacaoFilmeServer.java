package src;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class VotacaoFilmeServer {

    private static final String DATA_DIR = "data";

    // Representação do estado isolado de cada sala/usuário
    static class BoardState {
        final String ownerEmail;
        String ownerName;
        final List<String> movies = new CopyOnWriteArrayList<>();
        final List<AtomicInteger> votes = new CopyOnWriteArrayList<>();
        final List<String> watched = new CopyOnWriteArrayList<>();
        final List<String> votedIds = new CopyOnWriteArrayList<>();

        BoardState(String ownerEmail, String ownerName) {
            this.ownerEmail = ownerEmail;
            this.ownerName = ownerName;
        }
    }

    // Mapa em memória com cache das salas carregadas
    private static final ConcurrentHashMap<String, BoardState> boards = new ConcurrentHashMap<>();

    public static void main(String[] args) throws IOException {
        // Assegura que o diretório de dados exista
        File folder = new File(DATA_DIR);
        if (!folder.exists()) {
            folder.mkdir();
        }

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
        server.createContext("/api/login", new LoginHandler());
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
        System.out.println(" Servidor CineVoto SaaS ativo na porta " + port);
        System.out.println(" Acesse: http://localhost:" + port);
        System.out.println(" Pressione Ctrl+C para encerrar.");
        System.out.println("=================================================");
        
        server.start();
    }

    // Converte o e-mail para um nome de arquivo de texto seguro
    private static String getBoardFilename(String email) {
        String safeEmail = email.toLowerCase().replaceAll("[^a-z0-9]", "_");
        return DATA_DIR + "/usr_" + safeEmail + ".txt";
    }

    // Persistência: Carrega os dados de um usuário específico
    private static synchronized BoardState loadBoardData(String email) {
        String filename = getBoardFilename(email);
        File file = new File(filename);
        if (!file.exists()) {
            return null;
        }

        BoardState board = new BoardState(email, "Usuário");

        try (BufferedReader br = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            String section = "";
            
            while ((line = br.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;

                if (line.equals("[METADATA]")) {
                    section = "METADATA";
                    continue;
                } else if (line.equals("[ACTIVE]")) {
                    section = "ACTIVE";
                    continue;
                } else if (line.equals("[WATCHED]")) {
                    section = "WATCHED";
                    continue;
                } else if (line.equals("[VOTERS]")) {
                    section = "VOTERS";
                    continue;
                }

                if ("METADATA".equals(section)) {
                    if (line.startsWith("name=")) {
                        board.ownerName = line.substring(5).trim();
                    }
                } else if ("ACTIVE".equals(section)) {
                    String[] parts = line.split(";");
                    if (parts.length == 2) {
                        board.movies.add(parts[0]);
                        board.votes.add(new AtomicInteger(Integer.parseInt(parts[1])));
                    }
                } else if ("WATCHED".equals(section)) {
                    board.watched.add(line);
                } else if ("VOTERS".equals(section)) {
                    board.votedIds.add(line);
                }
            }
            boards.put(email.toLowerCase(), board);
            System.out.println("Dados carregados com sucesso do board: " + email);
            return board;
        } catch (IOException e) {
            System.err.println("Erro ao carregar dados do board: " + e.getMessage());
            return null;
        } catch (NumberFormatException e) {
            System.err.println("Erro de formato nos dados persistidos do board: " + e.getMessage());
            return null;
        }
    }

    // Persistência: Salva os dados de um usuário específico
    private static synchronized void saveBoardData(BoardState board) {
        String filename = getBoardFilename(board.ownerEmail);
        try (BufferedWriter bw = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(filename), StandardCharsets.UTF_8))) {
            bw.write("[METADATA]");
            bw.newLine();
            bw.write("name=" + board.ownerName);
            bw.newLine();

            bw.write("[ACTIVE]");
            bw.newLine();
            for (int i = 0; i < board.movies.size(); i++) {
                bw.write(board.movies.get(i) + ";" + board.votes.get(i).get());
                bw.newLine();
            }
            
            bw.write("[VOTERS]");
            bw.newLine();
            for (String id : board.votedIds) {
                bw.write(id);
                bw.newLine();
            }

            bw.write("[WATCHED]");
            bw.newLine();
            for (String watchedMovie : board.watched) {
                bw.write(watchedMovie);
                bw.newLine();
            }
            System.out.println("Dados salvos em " + filename);
        } catch (IOException e) {
            System.err.println("Erro ao salvar dados do board: " + e.getMessage());
        }
    }

    // Retorna o estado de uma sala específica em formato JSON
    private static String getStateJson(BoardState board, String voterId) {
        StringBuilder sb = new StringBuilder("{");
        
        sb.append(String.format("\"ownerName\":\"%s\",", board.ownerName.replace("\"", "\\\"")));
        sb.append(String.format("\"ownerEmail\":\"%s\",", board.ownerEmail.replace("\"", "\\\"")));
        
        // Verifica se o voterId do visitante já votou nesta sala
        boolean hasVoted = !voterId.isEmpty() && board.votedIds.contains(voterId);
        sb.append(String.format("\"usuarioVotou\":%b,", hasVoted));

        // Filmes ativos
        sb.append("\"ativos\":[");
        for (int i = 0; i < board.movies.size(); i++) {
            sb.append(String.format("{\"id\":%d,\"titulo\":\"%s\",\"votos\":%d}",
                    i, 
                    board.movies.get(i).replace("\\", "\\\\").replace("\"", "\\\""), 
                    board.votes.get(i).get()
            ));
            if (i < board.movies.size() - 1) {
                sb.append(",");
            }
        }
        sb.append("],");
        
        // Histórico de assistidos
        sb.append("\"assistidos\":[");
        for (int i = 0; i < board.watched.size(); i++) {
            sb.append(String.format("\"%s\"", board.watched.get(i).replace("\\", "\\\\").replace("\"", "\\\"")));
            if (i < board.watched.size() - 1) {
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

    // Extrai o voterId da URL
    private static String getVoterIdFromQuery(HttpExchange exchange) {
        String query = exchange.getRequestURI().getQuery();
        if (query != null) {
            Pattern p = Pattern.compile("voterId=([^&]+)");
            Matcher m = p.matcher(query);
            if (m.find()) {
                return m.group(1).trim();
            }
        }
        return "";
    }

    // Extrai o proprietário da sala da URL (owner)
    private static String getOwnerFromQuery(HttpExchange exchange) {
        String query = exchange.getRequestURI().getQuery();
        if (query != null) {
            Pattern p = Pattern.compile("owner=([^&]+)");
            Matcher m = p.matcher(query);
            if (m.find()) {
                try {
                    return java.net.URLDecoder.decode(m.group(1).trim(), StandardCharsets.UTF_8.toString());
                } catch (UnsupportedEncodingException e) {
                    return m.group(1).trim();
                }
            }
        }
        return "";
    }

    // Resolve a sala a ser utilizada no request
    private static BoardState resolveBoard(HttpExchange exchange) {
        String owner = getOwnerFromQuery(exchange);
        if (owner.isEmpty()) {
            return null;
        }
        
        // Tenta obter do cache em memória
        BoardState board = boards.get(owner.toLowerCase());
        if (board == null) {
            // Tenta carregar do arquivo
            board = loadBoardData(owner);
        }
        return board;
    }

    // POST /api/login
    static class LoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                try {
                    String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                    String name = "";
                    String email = "";

                    Pattern pName = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher mName = pName.matcher(body);
                    if (mName.find()) {
                        name = mName.group(1).trim();
                    }

                    Pattern pEmail = Pattern.compile("\"email\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher mEmail = pEmail.matcher(body);
                    if (mEmail.find()) {
                        email = mEmail.group(1).trim();
                    }

                    if (email.isEmpty()) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"E-mail é obrigatório para cadastro.\"}");
                        return;
                    }

                    // Tenta obter ou criar a sala do usuário
                    BoardState board = boards.get(email.toLowerCase());
                    if (board == null) {
                        board = loadBoardData(email);
                    }

                    if (board == null) {
                        // Novo usuário, cria nova sala
                        if (name.isEmpty()) {
                            name = "Cinema Club";
                        }
                        board = new BoardState(email, name);
                        saveBoardData(board);
                        boards.put(email.toLowerCase(), board);
                        System.out.println("Criada nova sala para: " + email);
                    } else if (!name.isEmpty() && !name.equals(board.ownerName)) {
                        // Atualiza o nome da sala caso tenha mudado
                        board.ownerName = name;
                        saveBoardData(board);
                    }

                    String voterId = getVoterIdFromQuery(exchange);
                    sendJsonResponse(exchange, 200, getStateJson(board, voterId));
                } catch (Exception e) {
                    sendJsonResponse(exchange, 500, "{\"error\":\"Erro ao processar login.\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // GET /api/estado?owner=email&voterId=id
    static class EstadoHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;
            
            if ("GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                BoardState board = resolveBoard(exchange);
                if (board == null) {
                    sendJsonResponse(exchange, 404, "{\"error\":\"Sala de votação não encontrada.\"}");
                    return;
                }
                String voterId = getVoterIdFromQuery(exchange);
                sendJsonResponse(exchange, 200, getStateJson(board, voterId));
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use GET.\"}");
            }
        }
    }

    // POST /api/iniciar?owner=email
    static class IniciarHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                try {
                    BoardState board = resolveBoard(exchange);
                    if (board == null) {
                        sendJsonResponse(exchange, 404, "{\"error\":\"Sala de votação não encontrada.\"}");
                        return;
                    }

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
                        for (String w : board.watched) {
                            if (w.equalsIgnoreCase(movie)) {
                                sendJsonResponse(exchange, 400, String.format("{\"error\":\"O filme '%s' já foi assistido anteriormente! Escolha outro.\"}", movie));
                                return;
                            }
                        }
                    }

                    // Inicializa a nova rodada na sala correspondente
                    board.movies.clear();
                    board.votes.clear();
                    board.votedIds.clear();
                    
                    for (String m : newMovies) {
                        board.movies.add(m);
                        board.votes.add(new AtomicInteger(0));
                    }

                    saveBoardData(board);
                    String voterId = getVoterIdFromQuery(exchange);
                    sendJsonResponse(exchange, 200, getStateJson(board, voterId));
                } catch (Exception e) {
                    sendJsonResponse(exchange, 500, "{\"error\":\"Erro ao iniciar rodada de votação.\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // POST /api/votar?owner=email
    static class VotarHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                try {
                    BoardState board = resolveBoard(exchange);
                    if (board == null) {
                        sendJsonResponse(exchange, 404, "{\"error\":\"Sala de votação não encontrada.\"}");
                        return;
                    }

                    String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                    int id = -1;
                    String voterId = "";

                    // Parse do id do filme
                    Pattern pId = Pattern.compile("\"id\"\\s*:\\s*(\\d+)");
                    Matcher mId = pId.matcher(body);
                    if (mId.find()) {
                        id = Integer.parseInt(mId.group(1));
                    }

                    // Parse do voterId
                    Pattern pVoter = Pattern.compile("\"voterId\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher mVoter = pVoter.matcher(body);
                    if (mVoter.find()) {
                        voterId = mVoter.group(1).trim();
                    }

                    if (voterId.isEmpty()) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Identificação do usuário (voterId) não fornecida.\"}");
                        return;
                    }

                    // Validação de negócio: Apenas 1 voto por Voter ID
                    if (board.votedIds.contains(voterId)) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Você já votou nesta rodada!\"}");
                        return;
                    }

                    if (id >= 0 && id < board.votes.size()) {
                        board.votes.get(id).incrementAndGet();
                        board.votedIds.add(voterId); // Registra o ID do visitante
                        
                        saveBoardData(board);
                        sendJsonResponse(exchange, 200, getStateJson(board, voterId));
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

    // POST /api/finalizar?owner=email
    static class FinalizarHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                BoardState board = resolveBoard(exchange);
                if (board == null) {
                    sendJsonResponse(exchange, 404, "{\"error\":\"Sala de votação não encontrada.\"}");
                    return;
                }

                if (board.movies.isEmpty()) {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Nenhuma votação ativa para finalizar.\"}");
                    return;
                }

                // Determinar o filme vencedor (primeiro em caso de empate)
                int maxVotes = -1;
                int winnerIdx = -1;
                for (int i = 0; i < board.votes.size(); i++) {
                    int v = board.votes.get(i).get();
                    if (v > maxVotes) {
                        maxVotes = v;
                        winnerIdx = i;
                    }
                }

                if (winnerIdx != -1) {
                    String winner = board.movies.get(winnerIdx);
                    board.watched.add(winner); // Move para a lista de assistidos
                    
                    // Limpa filmes ativos e lista de votantes
                    board.movies.clear();      
                    board.votes.clear();
                    board.votedIds.clear();

                    saveBoardData(board);
                    sendJsonResponse(exchange, 200, getStateJson(board, ""));
                } else {
                    sendJsonResponse(exchange, 500, "{\"error\":\"Não foi possível determinar o vencedor.\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // POST /api/reset?owner=email
    static class ResetHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                BoardState board = resolveBoard(exchange);
                if (board == null) {
                    sendJsonResponse(exchange, 404, "{\"error\":\"Sala de votação não encontrada.\"}");
                    return;
                }

                board.movies.clear();
                board.votes.clear();
                board.votedIds.clear();

                saveBoardData(board); // Salva mantendo o histórico de assistidos

                sendJsonResponse(exchange, 200, getStateJson(board, ""));
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
