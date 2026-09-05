# 🍿 CineVoto 2.0

![Java](https://img.shields.io/badge/Java-21%2B-orange?style=for-the-badge&logo=openjdk)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Firestore](https://img.shields.io/badge/Firestore-039BE5?style=for-the-badge&logo=firebase&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

O **CineVoto 2.0** é uma aplicação web moderna e em tempo real desenvolvida para votação de filmes em noites de cinema entre amigos e família.

Na **versão 2.0**, o projeto passou por uma evolução arquitetural completa: migrou de um estado local em arquivos de texto para a infraestrutura moderna do **Google Firebase (Authentication + Cloud Firestore)**, proporcionando sincronização instantânea em tempo real, login seguro com conta Google e persistência permanente do histórico de filmes assistidos.

---

## 🌟 Novidades da Versão 2.0

- 🔐 **Autenticação com Google (Firebase Auth)**: Login seguro em um clique utilizando a conta Google. Cada participante é identificado por seu nome, e-mail e avatar oficial.
- ⚡ **Banco de Dados em Tempo Real (Cloud Firestore)**: Votos, filmes e resultados sincronizam instantaneamente entre todos os participantes sem necessidade de recarregar a página (F5) ou fazer polling.
- 👥 **Salas Dinâmicas com Papéis (Admin vs Votantes)**:
  - **Criador (Admin)**: Gera a sala com código de 6 caracteres, cadastra os filmes da rodada, acompanha em tempo real quem votou (com avatares) e finaliza a rodada.
  - **Participantes (Votantes)**: Entram digitando o código ou acessando o link compartilhado (`?sala=CODIGO`), votam em seus filmes favoritos e acompanham a apuração ao vivo.
- 🏆 **Histórico de Filmes Assistidos Permanente**: Os filmes vencedores são salvos permanentemente no perfil do usuário (`usuarios/{uid}.filmesAssistidos`). Mesmo após logout ou ao criar salas novas, seu histórico pessoal é preservado.
- 🚫 **Bloqueio Inteligente de Duplicatas**: Validação insensível a maiúsculas, minúsculas, acentos e espaços (`A Origem`, `a origem`, `À Origem` são identificados como o mesmo filme). Filmes já assistidos não podem ser cadastrados novamente em nenhuma rodada.
- 🛡️ **Segurança de Credenciais**: As chaves da API do Firebase são protegidas e isoladas via `.gitignore`. O projeto disponibiliza um arquivo modelo (`web/firebase-config.example.js`) para rápida configuração.
- 🚀 **Backend Ultraleve**: Servidor HTTP embutido em Java nativo (`com.sun.net.httpserver`) sem frameworks externos pesados (sem Spring, sem Maven/Gradle), garantindo inicialização instantânea e consumo mínimo de recursos.

---

## 📁 Estrutura do Projeto

```text
cinevoto/
├── .gitignore                     # Proteção de credenciais e arquivos compilados
├── firestore.rules                # Regras de segurança prontas para o Cloud Firestore
├── README.md                      # Documentação completa do projeto
├── run.bat                        # Script de inicialização rápida no Windows
├── run.sh                         # Script de inicialização rápida no Linux / macOS
├── src/
│   └── VotacaoFilmeServer.java    # Servidor estático de alta performance em Java puro
└── web/
    ├── app.js                     # Aplicação frontend (ES6 Modules + Firebase Firestore)
    ├── firebase-config.example.js # Template de configuração com credenciais do Firebase
    ├── index.html                 # Interface moderna com 3 telas (Login, Home, Sala)
    └── styles.css                 # Tema Dark Cinema, responsivo e com efeitos neon
```

---

## 🚀 Como Baixar e Executar o Projeto

### 1. Pré-requisitos
- **Java JDK 21** ou superior instalado e configurado no `PATH` do sistema.
- Uma conta no [Google Firebase Console](https://console.firebase.google.com/).
- Git instalado na máquina.

---

### 2. Clonar o Repositório
Abra o terminal e execute:
```bash
git clone https://github.com/zambonib/cinevoto.git
cd cinevoto
```

---

### 3. Configurar o Firebase

#### A) Criar o Projeto no Firebase Console
1. Acesse o [Firebase Console](https://console.firebase.google.com/) e clique em **Adicionar projeto** (ex: `cinevoto`).
2. Desative o Google Analytics (opcional) e crie o projeto.

#### B) Ativar a Autenticação (Google Sign-In)
1. No menu lateral, acesse **Criação** -> **Authentication**.
2. Clique em **Vamos começar** e selecione o provedor **Google**.
3. Ative o provedor, selecione o seu e-mail de suporte e clique em **Salvar**.

#### C) Ativar o Cloud Firestore
1. No menu lateral, acesse **Criação** -> **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha uma região próxima (ex: `southamerica-east1` em São Paulo) e inicie em modo de teste ou produção.
4. Vá na aba **Regras** (Rules) do Firestore e cole as regras contidas no arquivo [`firestore.rules`](./firestore.rules):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{userId} {
      allow read, write: if request.auth != null;
    }
    match /salas/{salaId} {
      allow read, write: if request.auth != null;
      match /assistidos/{docId} {
        allow read, write: if request.auth != null;
      }
      match /votos/{docId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```
5. Clique em **Publicar**.

#### D) Configurar as Credenciais no Projeto
1. No Firebase Console, vá em **Configurações do Projeto** (ícone de engrenagem) -> **Geral**.
2. Em **Seus aplicativos**, clique no ícone **Web** (`</>`), digite um apelido (ex: `cinevoto-web`) e registre o app.
3. Copie o objeto `firebaseConfig`.
4. Na pasta `web/` do projeto, faça uma cópia do arquivo de exemplo:
   - No Windows (PowerShell):
     ```powershell
     Copy-Item web/firebase-config.example.js web/firebase-config.js
     ```
   - No Linux / macOS:
     ```bash
     cp web/firebase-config.example.js web/firebase-config.js
     ```
5. Abra o arquivo `web/firebase-config.js` e cole suas credenciais reais.
   *(Nota: O arquivo `web/firebase-config.js` está no `.gitignore` e nunca será enviado para o GitHub).*

---

### 4. Executar Localmente

#### No Windows
Dê um duplo clique no arquivo `run.bat` ou execute no terminal:
```cmd
run.bat
```

#### No Linux / macOS
Conceda permissão de execução e inicie o script:
```bash
chmod +x run.sh
./run.sh
```
*(Para usar uma porta alternativa, passe o número como parâmetro: `./run.sh 9090`)*

Acesse no navegador:
👉 **`http://localhost:8080`**

---

## 🛠️ Implantação em Servidor de Produção (Ubuntu / VPS)

Para manter a aplicação ativa 24/7 em uma VPS (ex: Ubuntu 24.04 LTS):

### 1. Instalar o JDK e o Nginx
```bash
sudo apt update
sudo apt install -y openjdk-21-jdk nginx
```

### 2. Copiar a Aplicação
```bash
sudo mkdir -p /var/www/cinevoto
sudo chown -R $USER:$USER /var/www/cinevoto
# Clone o repositório ou copie os arquivos para /var/www/cinevoto
chmod +x /var/www/cinevoto/run.sh
```
*Não se esqueça de criar o arquivo `/var/www/cinevoto/web/firebase-config.js` no servidor com suas chaves.*

### 3. Serviço Systemd (Execução em Segundo Plano)
Crie o arquivo de serviço:
```bash
sudo nano /etc/systemd/system/cinevoto.service
```

Cole o conteúdo:
```ini
[Unit]
Description=Servidor CineVoto 2.0
After=network.target

[Service]
User=seu_usuario
WorkingDirectory=/var/www/cinevoto
ExecStart=/var/www/cinevoto/run.sh
SuccessExitStatus=143
Restart=on-failure
RestartSec=5

# Configurações de Envio de E-mail (SMTP)
# Substitua pelos seus dados (Para Gmail/Google Workspace, use uma Senha de App de 16 caracteres)
Environment="SMTP_HOST=smtp.gmail.com"
Environment="SMTP_PORT=587"
Environment="SMTP_USER=seu_email@dominio.com"
Environment="SMTP_PASS=sua_senha_de_app"
Environment="SMTP_FROM=seu_email@dominio.com"

[Install]
WantedBy=multi-user.target
```

Ative o serviço:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cinevoto.service
sudo systemctl start cinevoto.service
```

### 4. Proxy Reverso Nginx com HTTPS (Let's Encrypt)
Configure o virtual host do Nginx:
```bash
sudo nano /etc/nginx/sites-available/cinevoto
```

```nginx
server {
    listen 80;
    server_name seu-dominio.com.br;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative e instale o certificado SSL gratuito com Certbot:
```bash
sudo ln -s /etc/nginx/sites-available/cinevoto /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com.br
```

> **Importante para o Google Sign-In em Produção**: No Firebase Console -> Authentication -> **Settings** -> **Authorized domains**, adicione o domínio do seu site (ex: `seu-dominio.com.br`).

### 5. Configurar HTTPS Gratuito (Let's Encrypt + Certbot)
Para ativar a conexão segura (`https://`) com certificado gratuito e renovação automática:

1. Instale o Certbot e o plugin do Nginx:
```bash
sudo apt install -y certbot python3-certbot-nginx
```

2. Execute o Certbot apontando para o seu domínio (certifique-se de que o domínio aponta para o IP do seu servidor):
```bash
sudo certbot --nginx -d seu_dominio.com
```
*Siga as instruções na tela inserindo seu e-mail e concordando com as diretrizes. O Certbot irá alterar a configuração do Nginx automaticamente e configurar o redirecionamento automático de HTTP para HTTPS.*

3. Teste o temporizador de renovação automática do certificado:
```bash
sudo certbot renew --dry-run
```

---

## 🔒 Segurança e Privacidade

- **Proteção de Credenciais**: Chaves de API e arquivos de ambiente são ignorados pelo Git através do `.gitignore`.
- **Regras Firestore**: Apenas usuários autenticados têm permissão de leitura e escrita.
- **Isolamento de Votos**: Cada usuário autenticado pode computar no máximo 1 voto por rodada.

---

## 👨‍💻 Autor e Licença

Desenvolvido por **Bruno Zamboni**.  
Distribuído sob a licença **MIT**. Sinta-se livre para contribuir e utilizar! 🍿🎬
