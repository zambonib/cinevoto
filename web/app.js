document.addEventListener('DOMContentLoaded', () => {
    // Endpoints da API
    const API_SOLICITAR_CODIGO = '/api/solicitar-codigo';
    const API_CONFIRMAR_CODIGO = '/api/confirmar-codigo';
    const API_ESTADO = '/api/estado';
    const API_INICIAR = '/api/iniciar';
    const API_VOTAR = '/api/votar';
    const API_FINALIZAR = '/api/finalizar';
    const API_RESET = '/api/reset';

    // Elementos da Interface
    const landingSection = document.getElementById('landing-section');
    const appLayout = document.getElementById('app-layout');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    // Área de Apresentação & Autenticação
    const presentationArea = document.getElementById('presentation-area');
    const btnShowRegister = document.getElementById('btn-show-register');
    const btnShowLogin = document.getElementById('btn-show-login');
    
    const authFormArea = document.getElementById('auth-form-area');
    const authTitle = document.getElementById('auth-title');
    const authDesc = document.getElementById('auth-desc');
    const authForm = document.getElementById('auth-form');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const registerFieldsGroup = document.getElementById('register-fields-group');
    const loginNameInput = document.getElementById('login-name');
    const loginEmailInput = document.getElementById('login-email');
    const btnBackToPresentation = document.getElementById('btn-back-to-presentation');
    
    // Área de Verificação do Código
    const verificationCodeArea = document.getElementById('verification-code-area');
    const verificationForm = document.getElementById('verification-form');
    const verificationCodeInput = document.getElementById('verification-code');
    const verifyingEmailSpan = document.getElementById('verifying-email');
    const btnBackToAuth = document.getElementById('btn-back-to-auth');
    
    // Seção Interna da Sala
    const setupSection = document.getElementById('setup-section');
    const setupForm = document.getElementById('setup-movies-form');
    const movieInputs = [
        document.getElementById('movie-1-input'),
        document.getElementById('movie-2-input'),
        document.getElementById('movie-3-input')
    ];
    
    const visitorWaitSection = document.getElementById('visitor-wait-section');
    const votingSection = document.getElementById('voting-section');
    
    // Informações da Sala
    const boardOwnerName = document.getElementById('board-owner-name');
    const boardOwnerEmail = document.getElementById('board-owner-email');
    const myBoardBtn = document.getElementById('my-board-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Painel Administrativo
    const adminControlsCard = document.getElementById('admin-controls-card');
    const activeControls = document.getElementById('active-controls');
    const finishRoundBtn = document.getElementById('finish-round-btn');
    const resetAllBtn = document.getElementById('reset-all-btn');
    
    // Compartilhamento
    const shareLinkInput = document.getElementById('share-link-input');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    
    // Dados Dinâmicos
    const moviesList = document.getElementById('movies-list');
    const totalVotesBadge = document.getElementById('total-votes-badge');
    const watchedList = document.getElementById('watched-list');
    
    const winnerBanner = document.getElementById('winner-banner');
    const winnerTitle = document.getElementById('winner-title');
    const winnerStats = document.getElementById('winner-stats');
    const votedAlert = document.getElementById('voted-alert');

    // Leitura dos parâmetros da URL
    const urlParams = new URLSearchParams(window.location.search);
    const boardOwner = urlParams.get('board');

    // Dados do Usuário Logado
    const localUserEmail = localStorage.getItem('cinevoto_user_email');
    const localUserName = localStorage.getItem('cinevoto_user_name');

    // Variáveis de fluxo temporárias
    let authMode = 'register'; // 'register' ou 'login'
    let tempEmail = '';
    let tempName = '';

    // Estado da Sala Atual
    let state = {
        ownerName: 'Carregando...',
        ownerEmail: '',
        ativos: [],
        assistidos: [],
        usuarioVotou: false
    };

    // Gera ou obtém o identificador exclusivo deste navegador
    function getVoterId() {
        let voterId = localStorage.getItem('cinevoto_voter_id');
        if (!voterId) {
            voterId = 'usr_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('cinevoto_voter_id', voterId);
        }
        return voterId;
    }

    // Inicialização da Tela
    function init() {
        if (!boardOwner) {
            if (localUserEmail) {
                // Redireciona para a própria sala do usuário logado
                window.location.search = `?board=${encodeURIComponent(localUserEmail)}`;
            } else {
                // Exibe a Landing Page de Apresentação
                landingSection.classList.remove('hidden');
                appLayout.classList.add('hidden');
                loadingSpinner.classList.add('hidden');
                
                presentationArea.classList.remove('hidden');
                authFormArea.classList.add('hidden');
                verificationCodeArea.classList.add('hidden');
            }
        } else {
            // Carrega os dados da sala informada na URL
            landingSection.classList.add('hidden');
            appLayout.classList.remove('hidden');
            loadState();
        }
    }

    // Gerenciador de Exibição das telas de autenticação
    btnShowRegister.addEventListener('click', () => {
        authMode = 'register';
        presentationArea.classList.add('hidden');
        authFormArea.classList.remove('hidden');
        
        // Exibe campos de nome
        registerFieldsGroup.classList.remove('hidden');
        loginNameInput.required = true;
        
        authTitle.textContent = "Criar Minha Sala";
        authDesc.textContent = "Insira seus dados para criar sua sala e validar seu e-mail:";
        authSubmitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Código de Confirmação';
    });

    btnShowLogin.addEventListener('click', () => {
        authMode = 'login';
        presentationArea.classList.add('hidden');
        authFormArea.classList.remove('hidden');
        
        // Oculta campos de nome
        registerFieldsGroup.classList.add('hidden');
        loginNameInput.required = false;
        
        authTitle.textContent = "Acessar Minha Sala";
        authDesc.textContent = "Informe seu e-mail de cadastro para receber o código de acesso:";
        authSubmitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Código de Acesso';
    });

    btnBackToPresentation.addEventListener('click', () => {
        authFormArea.classList.add('hidden');
        presentationArea.classList.remove('hidden');
    });

    btnBackToAuth.addEventListener('click', () => {
        verificationCodeArea.classList.add('hidden');
        authFormArea.classList.remove('hidden');
    });

    // Envio do formulário inicial (Solicita código OTP)
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginEmailInput.value.trim();
        const name = authMode === 'register' ? loginNameInput.value.trim() : '';

        if (!email) return;

        // Validação simples no lado do cliente
        if (!email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
            alert('Por favor, digite um endereço de e-mail válido!');
            return;
        }

        try {
            showLoading(true);
            const response = await fetch(API_SOLICITAR_CODIGO, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, name: name })
            });

            const data = await response.json();
            showLoading(false);

            if (!response.ok) {
                alert(data.error || 'Erro ao solicitar código.');
                return;
            }

            // Armazena temporariamente para o próximo passo
            tempEmail = email;
            tempName = name;

            // Transiciona para a tela de preenchimento do código
            verifyingEmailSpan.textContent = email;
            authFormArea.classList.add('hidden');
            verificationCodeArea.classList.remove('hidden');
            verificationCodeInput.value = '';
            verificationCodeInput.focus();
        } catch (error) {
            alert('Erro de conexão ao solicitar o código.');
            showLoading(false);
        }
    });

    // Confirmação do código OTP
    verificationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = verificationCodeInput.value.trim();

        if (code.length !== 6) {
            alert('Por favor, digite o código de 6 dígitos.');
            return;
        }

        try {
            showLoading(true);
            const response = await fetch(`${API_CONFIRMAR_CODIGO}?voterId=${getVoterId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: tempEmail, code: code })
            });

            const data = await response.json();
            showLoading(false);

            if (!response.ok) {
                alert(data.error || 'Código incorreto ou expirado.');
                return;
            }

            // Login bem sucedido! Salva os dados localmente
            localStorage.setItem('cinevoto_user_email', data.ownerEmail);
            localStorage.setItem('cinevoto_user_name', data.ownerName);

            // Redireciona para a sala criada/acessada
            window.location.search = `?board=${encodeURIComponent(data.ownerEmail)}`;
        } catch (error) {
            alert('Erro ao validar o código.');
            showLoading(false);
        }
    });

    // Busca o estado completo do proprietário da sala especificada
    async function loadState() {
        showLoading(true);
        try {
            const voterId = getVoterId();
            const response = await fetch(`${API_ESTADO}?owner=${encodeURIComponent(boardOwner)}&voterId=${voterId}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    alert('Sala de votação não encontrada. Redirecionando para a página inicial.');
                    logout();
                    return;
                }
                throw new Error('Falha ao conectar com o servidor.');
            }

            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error(error);
            showErrorState();
        } finally {
            showLoading(false);
        }
    }

    // Atualiza toda a interface com base no estado recebido da sala
    function updateUI(newState) {
        state = newState;

        // Atualiza cabeçalhos da sala
        boardOwnerName.textContent = `Sala de ${state.ownerName}`;
        boardOwnerEmail.textContent = state.ownerEmail;

        // Configura link de compartilhamento
        const shareLink = `${window.location.origin}${window.location.pathname}?board=${encodeURIComponent(state.ownerEmail)}`;
        shareLinkInput.value = shareLink;

        // Verifica se o usuário logado localmente é o proprietário da sala
        const isOwner = localUserEmail && localUserEmail.toLowerCase() === state.ownerEmail.toLowerCase();

        // Gerencia exibição do botão "Minha Sala"
        if (localUserEmail && !isOwner) {
            myBoardBtn.classList.remove('hidden');
        } else {
            myBoardBtn.classList.add('hidden');
        }

        renderWatchedList();

        // Gerencia painel administrativo
        if (isOwner) {
            adminControlsCard.classList.remove('hidden');
        } else {
            adminControlsCard.classList.add('hidden');
        }

        // Determina o fluxo da tela central (Cadastro ou Votação)
        if (state.ativos && state.ativos.length > 0) {
            setupSection.classList.add('hidden');
            visitorWaitSection.classList.add('hidden');
            votingSection.classList.remove('hidden');
            activeControls.classList.remove('hidden');

            if (state.usuarioVotou) {
                votedAlert.classList.remove('hidden');
            } else {
                votedAlert.classList.add('hidden');
            }
            
            renderVotingSection();
        } else {
            votingSection.classList.add('hidden');
            activeControls.classList.add('hidden');
            votedAlert.classList.add('hidden');

            if (isOwner) {
                setupSection.classList.remove('hidden');
                visitorWaitSection.classList.add('hidden');
            } else {
                setupSection.classList.add('hidden');
                visitorWaitSection.classList.remove('hidden');
            }
        }
    }

    // Renderiza a lista de filmes ativos e atualiza a barra de progresso
    function renderVotingSection() {
        moviesList.innerHTML = '';
        
        const totalVotes = state.ativos.reduce((acc, m) => acc + m.votos, 0);
        totalVotesBadge.textContent = `Total: ${totalVotes} ${totalVotes === 1 ? 'voto' : 'votos'}`;

        let maxVotes = 0;
        let winners = [];

        state.ativos.forEach(movie => {
            if (movie.votos > maxVotes) {
                maxVotes = movie.votos;
                winners = [movie.titulo];
            } else if (movie.votos === maxVotes && maxVotes > 0) {
                winners.push(movie.titulo);
            }
        });

        if (maxVotes > 0) {
            winnerBanner.classList.remove('hidden');
            if (winners.length === 1) {
                winnerTitle.textContent = winners[0];
                winnerStats.textContent = `Liderando com ${maxVotes} ${maxVotes === 1 ? 'voto' : 'votos'} (${Math.round((maxVotes / totalVotes) * 100)}%)`;
            } else {
                winnerTitle.textContent = "Empate!";
                winnerStats.textContent = `Filmes empatados: ${winners.join(' | ')} (${maxVotes} votos cada)`;
            }
        } else {
            winnerBanner.classList.add('hidden');
        }

        const isVoted = state.usuarioVotou;
        state.ativos.forEach((movie, index) => {
            const percentage = totalVotes > 0 ? Math.round((movie.votos / totalVotes) * 100) : 0;
            
            const movieItem = document.createElement('div');
            movieItem.className = 'movie-item';
            movieItem.id = `movie-card-${movie.id}`;
            
            movieItem.innerHTML = `
                <div class="movie-info">
                    <div class="movie-details">
                        <span class="movie-rank">#${index + 1}</span>
                        <span class="movie-title-text">${escapeHtml(movie.titulo)}</span>
                    </div>
                    <span class="movie-votes-count">${movie.votos} ${movie.votos === 1 ? 'voto' : 'votos'}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${percentage}%"></div>
                </div>
                <div class="vote-btn-container">
                    <button class="btn btn-vote" data-id="${movie.id}" ${isVoted ? 'disabled' : ''}>
                        <i class="fa-solid ${isVoted ? 'fa-check' : 'fa-thumbs-up'}"></i> ${isVoted ? 'Votado' : 'Votar'}
                    </button>
                </div>
            `;
            
            moviesList.appendChild(movieItem);
        });

        document.querySelectorAll('.btn-vote').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                castVote(id);
            });
        });
    }

    // Renderiza a lista de filmes assistidos (histórico à direita)
    function renderWatchedList() {
        watchedList.innerHTML = '';

        if (!state.assistidos || state.assistidos.length === 0) {
            watchedList.innerHTML = `
                <div class="watched-empty">
                    <i class="fa-solid fa-ghost"></i>
                    <p>Nenhum filme assistido ainda nesta sala.</p>
                </div>
            `;
            return;
        }

        state.assistidos.forEach(movieTitle => {
            const watchedItem = document.createElement('div');
            watchedItem.className = 'watched-item';
            watchedItem.innerHTML = `
                <i class="fa-solid fa-ticket"></i>
                <span class="watched-title-text" title="${escapeHtml(movieTitle)}">${escapeHtml(movieTitle)}</span>
            `;
            watchedList.appendChild(watchedItem);
        });
    }

    // Envia requisição de voto ao servidor
    async function castVote(id) {
        try {
            const card = document.getElementById(`movie-card-${id}`);
            if (card) {
                card.classList.add('pulse-highlight');
                setTimeout(() => card.classList.remove('pulse-highlight'), 500);
            }

            const response = await fetch(`${API_VOTAR}?owner=${encodeURIComponent(boardOwner)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, voterId: getVoterId() })
            });

            if (!response.ok) throw new Error('Erro ao registrar voto.');
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            alert('Não foi possível registrar o seu voto. O servidor está ativo?');
        }
    }

    // Submete os 3 filmes iniciais
    setupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const moviesArray = movieInputs.map(input => input.value.trim()).filter(v => v !== '');
        
        if (moviesArray.length !== 3) {
            alert('Por favor, preencha o nome dos 3 filmes!');
            return;
        }

        try {
            showLoading(true);
            const response = await fetch(`${API_INICIAR}?owner=${encodeURIComponent(boardOwner)}&voterId=${getVoterId()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(moviesArray)
            });

            const data = await response.json();
            
            if (!response.ok) {
                alert(data.error || 'Erro ao iniciar votação.');
                showLoading(false);
                return;
            }

            movieInputs.forEach(input => input.value = '');
            updateUI(data);
        } catch (error) {
            alert('Erro de conexão ao iniciar a votação.');
            showLoading(false);
        }
    });

    // Finaliza a rodada (apenas dono)
    finishRoundBtn.addEventListener('click', async () => {
        if (state.ativos.length === 0) return;

        let maxVotes = -1;
        let winnerName = "";
        state.ativos.forEach(m => {
            if (m.votos > maxVotes) {
                maxVotes = m.votos;
                winnerName = m.titulo;
            }
        });

        const confirmationMsg = maxVotes > 0 
            ? `Deseja encerrar a votação de hoje?\nO filme vencedor é: "${winnerName}" com ${maxVotes} votos.\n\nEle será adicionado à lista de assistidos e uma nova rodada poderá ser criada.`
            : `Deseja encerrar a votação?\nNenhum voto foi registrado ainda. O primeiro filme da lista ("${state.ativos[0].titulo}") será considerado o vencedor por padrão.\n\nConfirmar encerramento?`;

        if (!confirm(confirmationMsg)) return;

        try {
            showLoading(true);
            const response = await fetch(`${API_FINALIZAR}?owner=${encodeURIComponent(boardOwner)}`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Erro ao finalizar rodada.');
            const data = await response.json();
            
            alert(`Rodada finalizada com sucesso! Bom filme! 🎬🍿`);
            updateUI(data);
        } catch (error) {
            alert('Erro ao finalizar a votação.');
            showLoading(false);
        }
    });

    // Cancela a rodada ativa (apenas dono)
    resetAllBtn.addEventListener('click', async () => {
        if (!confirm('Tem certeza de que deseja cancelar a rodada de votação atual? O histórico de filmes assistidos será mantido.')) {
            return;
        }

        try {
            showLoading(true);
            const response = await fetch(`${API_RESET}?owner=${encodeURIComponent(boardOwner)}`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Erro ao cancelar votação.');
            const data = await response.json();
            updateUI(data);
            alert('A votação ativa foi cancelada com sucesso!');
        } catch (error) {
            alert('Erro ao cancelar a rodada.');
            showLoading(false);
        }
    });

    // Copiar link de compartilhamento
    copyLinkBtn.addEventListener('click', () => {
        shareLinkInput.select();
        shareLinkInput.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(shareLinkInput.value)
            .then(() => {
                const origIcon = copyLinkBtn.innerHTML;
                copyLinkBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #000"></i>';
                setTimeout(() => {
                    copyLinkBtn.innerHTML = origIcon;
                }, 2000);
            })
            .catch(() => {
                alert('Não foi possível copiar o link automaticamente. Copie manualmente.');
            });
    });

    // Ação do botão "Minha Sala"
    myBoardBtn.addEventListener('click', () => {
        if (localUserEmail) {
            window.location.search = `?board=${encodeURIComponent(localUserEmail)}`;
        }
    });

    // Ação do botão Logout / Sair
    logoutBtn.addEventListener('click', () => {
        logout();
    });

    function logout() {
        localStorage.removeItem('cinevoto_user_email');
        localStorage.removeItem('cinevoto_user_name');
        window.location.href = window.location.origin + window.location.pathname;
    }

    // Exibição de erro
    function showErrorState() {
        showLoading(false);
        appLayout.classList.remove('hidden');
        landingSection.classList.add('hidden');
        votingSection.classList.remove('hidden');
        setupSection.classList.add('hidden');
        visitorWaitSection.classList.add('hidden');
        adminControlsCard.classList.add('hidden');
        
        moviesList.innerHTML = `
            <div class="loading-state" style="color: var(--accent-neon-red); flex-direction: column; text-align: center;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; margin-bottom: 1rem;"></i>
                <strong>Falha na conexão com o servidor CineVoto.</strong>
                <p style="font-size: 0.9rem; margin-top: 0.5rem; color: var(--text-secondary);">Verifique se o backend Java foi iniciado e está rodando na porta correta.</p>
            </div>
        `;
    }

    // Escape simples contra XSS
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Inicialização do app
    init();
});
