package src;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/**
 * CineVoto — Servidor de Arquivos Estáticos
 *
 * NOTA: Toda a lógica de negócio (autenticação, votação, salas) foi migrada
 * para o Firebase (Authentication + Firestore) e é executada diretamente no
 * navegador via Firebase Web SDK no arquivo web/app.js.
 *
 * Este servidor tem única responsabilidade: servir os arquivos da pasta web/.
 */
public class VotacaoFilmeServer {

    public static void main(String[] args) throws IOException {
        int port = 8080;

        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                System.err.println("Porta inválida. Usando 8080.");
            }
        } else {
            String envPort = System.getenv("PORT");
            if (envPort != null) {
                try { port = Integer.parseInt(envPort); } catch (NumberFormatException ignored) {}
            }
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", new StaticFileHandler());
        server.setExecutor(Executors.newFixedThreadPool(10));

        System.out.println("=================================================");
        System.out.println(" Servidor CineVoto ativo na porta " + port);
        System.out.println(" Acesse: http://localhost:" + port);
        System.out.println(" Pressione Ctrl+C para encerrar.");
        System.out.println("=================================================");

        server.start();
    }

    /** Serve os arquivos estáticos da pasta web/ */
    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/")) path = "/index.html";

            File file = new File("web" + path);
            if (!file.exists() || file.isDirectory()) {
                byte[] response = "404 Not Found".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(404, response.length);
                try (OutputStream os = exchange.getResponseBody()) { os.write(response); }
                return;
            }

            String mime = "text/plain; charset=utf-8";
            if (path.endsWith(".html"))       mime = "text/html; charset=utf-8";
            else if (path.endsWith(".css"))   mime = "text/css; charset=utf-8";
            else if (path.endsWith(".js"))    mime = "application/javascript; charset=utf-8";
            else if (path.endsWith(".png"))   mime = "image/png";
            else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) mime = "image/jpeg";
            else if (path.endsWith(".ico"))   mime = "image/x-icon";
            else if (path.endsWith(".svg"))   mime = "image/svg+xml";

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
