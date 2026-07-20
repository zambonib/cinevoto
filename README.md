# 🍿 CineVoto

![Java](https://img.shields.io/badge/Java-21%2B-orange?style=for-the-badge&logo=openjdk)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

O **CineVoto** é uma aplicação web moderna e leve desenvolvida para votação de filmes em noites de cinema. 

O grande diferencial técnico do projeto é a sua **arquitetura de zero dependências externas no backend**: o servidor de arquivos estáticos e os endpoints da API REST foram criados utilizando apenas a biblioteca padrão do JDK (`com.sun.net.httpserver.HttpServer`), dispensando frameworks pesados (como Spring Boot) ou gerenciadores de pacotes (como Maven/Gradle). Isso resulta em uma compilação instantânea e consumo mínimo de memória.

---

## ✨ Funcionalidades

- **Configuração Dinâmica**: Cada rodada de votação inicia com o cadastro de exatamente 3 filmes sugeridos pelos usuários.
- **Limitação de 1 Voto por Usuário**: O backend rastreia de forma segura o endereço IP dos votantes de cada sessão ativa. Ao votar, o usuário tem a interface travada e novos votos do mesmo IP são bloqueados pelo servidor.
- **Histórico de Filmes Assistidos**: Ao finalizar a rodada, o filme vencedor é movido automaticamente para uma lista lateral direita de "Filmes Assistidos" estilizada como tickets de cinema antigos.
- **Regra de Não-Repetição**: Filmes presentes no histórico de assistidos são validados e bloqueados caso alguém tente inseri-los em futuras rodadas.
- **Persistência Local Integrada**: Toda a sessão ativa (filmes, votos e IPs que já votaram) e o histórico de assistidos são salvos em formato de texto estruturado (`cinevoto_data.txt`), sobrevivendo a desligamentos ou reinicializações do servidor.
- **Interface Premium**: Design com tema de cinema escuro (Dark Cinema) utilizando HSL, gradientes vibrantes, efeitos de *glassmorphism* (blur translúcido) e barras de progresso animadas proporcionalmente em tempo real.

---

## 🚀 Execução Local (Quick Start)

### Pré-requisitos
- Ter o **JDK 21** ou superior instalado no PATH da sua máquina.

### No Windows
1. Dê dois cliques no arquivo `run.bat` (ou execute-o pelo prompt).
2. Acesse no navegador: `http://localhost:8080`

### No Linux / macOS
1. Dê permissão de execução ao script: `chmod +x run.sh`
2. Execute o script: `./run.sh` (você pode alterar a porta padrão passando um argumento, ex: `./run.sh 9090`).
3. Acesse no navegador: `http://localhost:8080` (ou na porta configurada).

---

## 🛠️ Implantação em Servidor de Produção (Ubuntu 24.04 LTS)

Siga o passo a passo a seguir para rodar a aplicação em segundo plano na porta padrão HTTP (`80`).

### 1. Atualizar Pacotes e Instalar o Java
```bash
sudo apt update
sudo apt install -y openjdk-21-jdk
```

### 2. Configurar a Pasta da Aplicação
Copie os arquivos do projeto para o diretório `/var/www/cinevoto` do seu servidor e conceda permissões ao script de execução:
```bash
sudo mkdir -p /var/www/cinevoto
sudo chown -R $USER:$USER /var/www/cinevoto
# Copie os arquivos da pasta local para o servidor
chmod +x /var/www/cinevoto/run.sh
```

### 3. Configurar Execução em Segundo Plano com Systemd
Para que o serviço inicie sozinho no boot do sistema e se recupere em caso de falhas, crie o seguinte serviço:

```bash
sudo nano /etc/systemd/system/cinevoto.service
```

Cole o conteúdo abaixo:
```ini
[Unit]
Description=Servidor CineVoto
After=network.target

[Service]
User=seu_usuario_ubuntu
WorkingDirectory=/var/www/cinevoto
ExecStart=/var/www/cinevoto/run.sh
SuccessExitStatus=143
TimeoutStopSec=10
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ative e inicie o serviço:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cinevoto.service
sudo systemctl start cinevoto.service
```

### 4. Configurar Proxy Reverso Nginx (Porta 80)
Para escutar conexões externas na porta padrão `80` de forma segura (sem expor a porta `8080` diretamente para a internet e sem precisar rodar o Java como root):

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/cinevoto
```

Cole a configuração do proxy reverso:
```nginx
server {
    listen 80;
    server_name seu_ip_ou_dominio;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative o site no Nginx e reinicie-o:
```bash
sudo ln -s /etc/nginx/sites-available/cinevoto /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo systemctl restart nginx
```

Libere o tráfego de rede no Firewall (`ufw`):
```bash
sudo ufw allow 'Nginx Full'
```

---

## 🔌 Referência da API REST

A comunicação entre a interface web e o backend Java ocorre por meio de rotas JSON nativas:

| Rota | Método | Descrição | Payload (Entrada) | Resposta (Saída) |
| :--- | :--- | :--- | :--- | :--- |
| `/api/estado` | `GET` | Lê o estado atual da votação e o histórico | N/A | Estado JSON |
| `/api/iniciar` | `POST` | Inicia uma nova sessão de votação | `["Filme A", "Filme B", "Filme C"]` | Estado JSON |
| `/api/votar` | `POST` | Computa um voto para um filme ativo | `{"id": <indice_filme>}` | Estado JSON |
| `/api/finalizar` | `POST` | Apura o vencedor e move-o para o histórico | N/A | Estado JSON |
| `/api/reset` | `POST` | Cancela a rodada ativa sem apagar o histórico | N/A | Estado JSON |

### Formato do Objeto de Estado (JSON)
```json
{
  "usuarioVotou": false,
  "ativos": [
    { "id": 0, "titulo": "A Origem", "votos": 2 },
    { "id": 1, "titulo": "Clube da Luta", "votos": 0 },
    { "id": 2, "titulo": "Forrest Gump", "votos": 1 }
  ],
  "assistidos": [
    "O Poderoso Chefão",
    "Matrix"
  ]
}
```

---

## 📄 Licença
Este projeto é de código aberto e livre para uso comercial ou pessoal sob a licença [MIT](https://choosealicense.com/licenses/mit/).
