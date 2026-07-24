import javax.mail.*;
import javax.mail.internet.*;
import java.util.Properties;

public class TesteSMTP {
    public static void main(String[] args) {
        if (args.length < 5) {
            System.out.println("Uso: java -cp \".:lib/*\" TesteSMTP <HOST> <PORTA> <USUARIO> <SENHA> <REMETENTE> <DESTINATARIO_TESTE>");
            System.out.println("Ex: java -cp \".:lib/*\" TesteSMTP smtp.gmail.com 587 meu@email.com senha meu@email.com destino@email.com");
            return;
        }

        String host = args[0];
        String portStr = args[1];
        String user = args[2];
        String pass = args[3];
        String from = args[4];
        String toEmail = args.length > 5 ? args[5] : from; // se não passar destinatário, manda pra si mesmo

        System.out.println("==================================================");
        System.out.println(" INICIANDO TESTE DE CONEXÃO SMTP COM JAVAMAIL");
        System.out.println(" Host: " + host + " | Porta: " + portStr);
        System.out.println(" Usuário: " + user);
        System.out.println("==================================================");

        try {
            Properties props = new Properties();
            props.put("mail.smtp.host", host);
            props.put("mail.smtp.port", portStr);
            props.put("mail.smtp.auth", "true");
            
            // ATIVA O MODO DEBUG PARA MOSTRAR TODO O LOG NO CONSOLE
            props.put("mail.debug", "true");
            
            if ("465".equals(portStr)) {
                props.put("mail.smtp.ssl.enable", "true");
                props.put("mail.smtp.socketFactory.port", "465");
                props.put("mail.smtp.socketFactory.class", "javax.net.ssl.SSLSocketFactory");
            } else {
                props.put("mail.smtp.starttls.enable", "true");
            }

            Session session = Session.getInstance(props, new Authenticator() {
                protected PasswordAuthentication getPasswordAuthentication() {
                    return new PasswordAuthentication(user, pass);
                }
            });

            Message message = new MimeMessage(session);
            message.setFrom(new InternetAddress(from, "Teste CineVoto"));
            message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(toEmail));
            message.setSubject("CineVoto - Teste de Envio SMTP");
            message.setText("Olá! Se você recebeu este e-mail, as suas configurações SMTP estão funcionando perfeitamente!");

            System.out.println("\nConectando ao servidor e enviando e-mail...");
            Transport.send(message);
            
            System.out.println("\n==================================================");
            System.out.println("✅ SUCESSO! E-mail de teste enviado com sucesso!");
            System.out.println("==================================================");
        } catch (Exception e) {
            System.err.println("\n==================================================");
            System.err.println("❌ FALHA AO ENVIAR E-MAIL");
            System.err.println("Motivo do Erro: " + e.getMessage());
            e.printStackTrace();
            System.err.println("==================================================");
            System.err.println("DICA: Se você usa o Google Workspace/Gmail, verifique:");
            System.err.println("1. Se a 'Verificação em Duas Etapas' está ativada na sua conta Google.");
            System.err.println("2. Se você gerou uma 'Senha de App' (App Password) de 16 letras para colocar na senha.");
            System.err.println("3. Se o host é smtp.gmail.com e a porta é 587.");
        }
    }
}
