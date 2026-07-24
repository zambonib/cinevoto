package src;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.SSLSocketFactory;

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

    // Estrutura para os códigos de verificação pendentes
    static class VerificationCode {
        final String email;
        final String name;
        final String code;
        final long expiresAt;

        VerificationCode(String email, String name, String code, long expiresAt) {
            this.email = email;
            this.name = name;
            this.code = code;
            this.expiresAt = expiresAt;
        }
    }

    // Mapa em memória com cache das salas carregadas
    private static final ConcurrentHashMap<String, BoardState> boards = new ConcurrentHashMap<>();
    
    // Mapa em memória para os códigos de verificação ativos
    private static final ConcurrentHashMap<String, VerificationCode> verificationCodes = new ConcurrentHashMap<>();

    public static void main(String[] args) throws IOException {
        // Assegura que o diretório de dados exista
        File folder = new File(DATA_DIR);
        if (!folder.exists()) {
            folder.mkdir();
        }

        int port = 8080;
        
        // Permite definir a porta via argumento ou variável de ambiente
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
        server.createContext("/api/solicitar-codigo", new SolicitarCodigoHandler());
        server.createContext("/api/confirmar-codigo", new ConfirmarCodigoHandler());
        
        // Mantém por compatibilidade ou redundância
        server.createContext("/api/login", new LoginHandler());
        
        server.createContext("/api/estado", new EstadoHandler());
        server.createContext("/api/iniciar", new IniciarHandler());
        server.createContext("/api/votar", new VotarHandler());
        server.createContext("/api/finalizar", new FinalizarHandler());
        server.createContext("/api/reset", new ResetHandler());

        // Servidor de arquivos estáticos
        server.createContext("/", new StaticFileHandler());

        // Executor multi-thread
        server.setExecutor(Executors.newFixedThreadPool(10));
        
        System.out.println("=================================================");
        System.out.println(" Servidor CineVoto SaaS ativo na porta " + port);
        System.out.println(" Acesse: http://localhost:" + port);
        System.out.println(" Pressione Ctrl+C para encerrar.");
        System.out.println("=================================================");
        
        server.start();
    }

    // Converte o e-mail para um nome de arquivo seguro
    private static String getBoardFilename(String email) {
        String safeEmail = email.toLowerCase().replaceAll("[^a-z0-9]", "_");
        return DATA_DIR + "/usr_" + safeEmail + ".txt";
    }

    // Persistência: Carrega os dados de um usuário
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
            System.err.println("Erro de formato nos dados do board: " + e.getMessage());
            return null;
        }
    }

    // Persistência: Salva os dados de um usuário
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
        
        BoardState board = boards.get(owner.toLowerCase());
        if (board == null) {
            board = loadBoardData(owner);
        }
        return board;
    }

    // Cliente SMTP nativo em Java puro (sem dependências externas)
    private static void sendEmailNativo(String toEmail, String code) {
        String host = System.getenv("SMTP_HOST");
        String portStr = System.getenv("SMTP_PORT");
        String user = System.getenv("SMTP_USER");
        String pass = System.getenv("SMTP_PASS");
        String from = System.getenv("SMTP_FROM");

        if (host == null || portStr == null || user == null || pass == null || from == null) {
            return; // Permanece operando apenas em simulação de console
        }

        int port = Integer.parseInt(portStr);
        new Thread(() -> {
            try {
                System.out.println("[SMTP] Enviando e-mail para " + toEmail + " via " + host + "...");
                Socket socket;
                if (port == 465) {
                    socket = SSLSocketFactory.getDefault().createSocket(host, port);
                } else {
                    socket = new Socket(host, port);
                }

                try (BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                     OutputStreamWriter writer = new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8)) {

                    readResponse(reader);
                    
                    writeCommand(writer, "EHLO " + host);
                    readResponse(reader);
                    
                    writeCommand(writer, "AUTH LOGIN");
                    readResponse(reader);
                    
                    writeCommand(writer, Base64.getEncoder().encodeToString(user.getBytes(StandardCharsets.UTF_8)));
                    readResponse(reader);
                    
                    writeCommand(writer, Base64.getEncoder().encodeToString(pass.getBytes(StandardCharsets.UTF_8)));
                    readResponse(reader);
                    
                    writeCommand(writer, "MAIL FROM:<" + from + ">");
                    readResponse(reader);
                    
                    writeCommand(writer, "RCPT TO:<" + toEmail + ">");
                    readResponse(reader);
                    
                    writeCommand(writer, "DATA");
                    readResponse(reader);
                    
                    writer.write("From: CineVoto <" + from + ">\r\n");
                    writer.write("To: " + toEmail + "\r\n");
                    writer.write("Subject: Código de Verificação - CineVoto\r\n");
                    writer.write("Content-Type: text/plain; charset=UTF-8\r\n\r\n");
                    writer.write("Olá!\r\n\r\n");
                    writer.write("Seu código de verificação para acessar o CineVoto é: " + code + "\r\n\r\n");
                    writer.write("Este código expira em 10 minutos.\r\n\r\n");
                    writer.write("Aproveite o seu filme! 🎬🍿\r\n.\r\n");
                    writer.flush();
                    
                    readResponse(reader);
                    
                    writeCommand(writer, "QUIT");
                    readResponse(reader);
                }
                socket.close();
                System.out.println("[SMTP] E-mail enviado com sucesso para: " + toEmail);
            } catch (Exception e) {
                System.err.println("[SMTP] Erro ao enviar e-mail: " + e.getMessage());
            }
        }).start();
    }

    private static void writeCommand(OutputStreamWriter writer, String cmd) throws IOException {
        writer.write(cmd + "\r\n");
        writer.flush();
    }

    private static void readResponse(BufferedReader reader) throws IOException {
        String line = reader.readLine();
        while (line != null) {
            if (line.length() >= 4 && line.charAt(3) == '-') {
                line = reader.readLine();
            } else {
                break;
            }
        }
    }

    // POST /api/solicitar-codigo
    static class SolicitarCodigoHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                try {
                    String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                    String email = "";
                    String name = "";

                    Pattern pEmail = Pattern.compile("\"email\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher mEmail = pEmail.matcher(body);
                    if (mEmail.find()) {
                        email = mEmail.group(1).trim();
                    }

                    Pattern pName = Pattern.compile("\"name\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher mName = pName.matcher(body);
                    if (mName.find()) {
                        name = mName.group(1).trim();
                    }

                    if (email.isEmpty()) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"O e-mail é obrigatório.\"}");
                        return;
                    }

                    // Validação de sintaxe de e-mail simples
                    if (!email.matches("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Por favor, digite um e-mail válido.\"}");
                        return;
                    }

                    // Gera código de 6 dígitos
                    String code = String.format("%06d", (int) (Math.random() * 1000000));
                    long expiresAt = System.currentTimeMillis() + 10 * 60 * 1000; // 10 minutos

                    verificationCodes.put(email.toLowerCase(), new VerificationCode(email, name, code, expiresAt));

                    // LOG DE TESTE: Sempre exibido para testes locais sem configuração de SMTP
                    System.out.println("\n=======================================================");
                    System.out.println("[CineVoto - Validação] Código gerado para: " + email);
                    System.out.println("CÓDIGO DE VERIFICAÇÃO: " + code);
                    System.out.println("=======================================================\n");

                    // Tenta enviar o e-mail real via SMTP nativo
                    sendEmailNativo(email, code);

                    sendJsonResponse(exchange, 200, "{\"success\":true,\"message\":\"Código de verificação gerado.\"}");
                } catch (Exception e) {
                    sendJsonResponse(exchange, 500, "{\"error\":\"Erro ao gerar código de acesso.\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // POST /api/confirmar-codigo
    static class ConfirmarCodigoHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                try {
                    String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                    String email = "";
                    String code = "";

                    Pattern pEmail = Pattern.compile("\"email\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher mEmail = pEmail.matcher(body);
                    if (mEmail.find()) {
                        email = mEmail.group(1).trim();
                    }

                    Pattern pCode = Pattern.compile("\"code\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher mCode = pCode.matcher(body);
                    if (mCode.find()) {
                        code = mCode.group(1).trim();
                    }

                    if (email.isEmpty() || code.isEmpty()) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"E-mail e código são obrigatórios.\"}");
                        return;
                    }

                    VerificationCode activeCode = verificationCodes.get(email.toLowerCase());

                    if (activeCode == null || !activeCode.code.equals(code)) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Código de verificação incorreto.\"}");
                        return;
                    }

                    if (System.currentTimeMillis() > activeCode.expiresAt) {
                        verificationCodes.remove(email.toLowerCase());
                        sendJsonResponse(exchange, 400, "{\"error\":\"Este código expirou. Solicite um novo código.\"}");
                        return;
                    }

                    // Código válido! Remove do mapa de verificação
                    verificationCodes.remove(email.toLowerCase());

                    // Verifica se o usuário/sala já existe
                    BoardState board = boards.get(email.toLowerCase());
                    if (board == null) {
                        board = loadBoardData(email);
                    }

                    if (board == null) {
                        // Novo usuário, cria nova sala
                        String name = activeCode.name;
                        if (name == null || name.trim().isEmpty()) {
                            name = "Cinema Club";
                        }
                        board = new BoardState(email, name);
                        saveBoardData(board);
                        boards.put(email.toLowerCase(), board);
                    } else if (activeCode.name != null && !activeCode.name.trim().isEmpty()) {
                        // Atualiza o nome da sala se um novo nome foi passado
                        board.ownerName = activeCode.name;
                        saveBoardData(board);
                    }

                    String voterId = getVoterIdFromQuery(exchange);
                    sendJsonResponse(exchange, 200, getStateJson(board, voterId));
                } catch (Exception e) {
                    sendJsonResponse(exchange, 500, "{\"error\":\"Erro ao confirmar código de segurança.\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Método não permitido. Use POST.\"}");
            }
        }
    }

    // Mantido por compatibilidade
    static class LoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptions(exchange)) return;
            sendJsonResponse(exchange, 400, "{\"error\":\"Login direto desativado. Use /api/solicitar-codigo.\"}");
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

                    if (newMovies.size() != 3) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Você deve sugerir exatamente 3 filmes para iniciar a votação.\"}");
                        return;
                    }

                    for (String movie : newMovies) {
                        for (String w : board.watched) {
                            if (w.equalsIgnoreCase(movie)) {
                                sendJsonResponse(exchange, 400, String.format("{\"error\":\"O filme '%s' já foi assistido anteriormente! Escolha outro.\"}", movie));
                                return;
                            }
                        }
                    }

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

                    Pattern pId = Pattern.compile("\"id\"\\s*:\\s*(\\d+)");
                    Matcher mId = pId.matcher(body);
                    if (mId.find()) {
                        id = Integer.parseInt(mId.group(1));
                    }

                    Pattern pVoter = Pattern.compile("\"voterId\"\\s*:\\s*\"([^\"]+)\"");
                    Matcher mVoter = pVoter.matcher(body);
                    if (mVoter.find()) {
                        voterId = mVoter.group(1).trim();
                    }

                    if (voterId.isEmpty()) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Identificação do usuário (voterId) não fornecida.\"}");
                        return;
                    }

                    if (board.votedIds.contains(voterId)) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Você já votou nesta rodada!\"}");
                        return;
                    }

                    if (id >= 0 && id < board.votes.size()) {
                        board.votes.get(id).incrementAndGet();
                        board.votedIds.add(voterId);
                        
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
                    board.watched.add(winner);
                    
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

                saveBoardData(board);

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
