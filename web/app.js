document.addEventListener('DOMContentLoaded', () => {
    // Endpoints da API
    const API_ESTADO = '/api/estado';
    const API_INICIAR = '/api/iniciar';
    const API_VOTAR = '/api/votar';
    const API_FINALIZAR = '/api/finalizar';
    const API_RESET = '/api/reset';

    // Elementos do DOM
    const setupSection = document.getElementById('setup-section');
    const votingSection = document.getElementById('voting-section');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    const setupForm = document.getElementById('setup-movies-form');
    const movieInputs = [
        document.getElementById('movie-1-input'),
        document.getElementById('movie-2-input'),
        document.getElementById('movie-3-input')
    ];
    
    const activeControls = document.getElementById('active-controls');
    const finishRoundBtn = document.getElementById('finish-round-btn');
    const resetAllBtn = document.getElementById('reset-all-btn');
    
    const moviesList = document.getElementById('movies-list');
    const totalVotesBadge = document.getElementById('total-votes-badge');
    const watchedList = document.getElementById('watched-list');
    
    const winnerBanner = document.getElementById('winner-banner');
    const winnerTitle = document.getElementById('winner-title');
    const winnerStats = document.getElementById('winner-stats');
    const votedAlert = document.getElementById('voted-alert');

    // Estado local da aplicação
    let state = {
        ativos: [],
        assistidos: []
    };

    // Busca o estado completo do backend
    async function loadState() {
        showLoading(true);
        try {
            const response = await fetch(API_ESTADO);
            if (!response.ok) throw new Error('Falha ao conectar com o servidor.');
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error(error);
            showErrorState();
        } finally {
            showLoading(false);
        }
    }

    // Exibe ou oculta a tela de carregamento
    function showLoading(isLoading) {
        if (isLoading) {
            loadingSpinner.classList.remove('hidden');
            setupSection.classList.add('hidden');
            votingSection.classList.add('hidden');
        } else {
            loadingSpinner.classList.add('hidden');
        }
    }

    // Atualiza toda a interface com base no estado recebido
    function updateUI(newState) {
        state = newState;

        // Renderiza o histórico de filmes assistidos (canto direito)
        renderWatchedList();

        // Determina qual seção exibir no painel central (cadastro ou votação)
        if (state.ativos && state.ativos.length > 0) {
            setupSection.classList.add('hidden');
            votingSection.classList.remove('hidden');
            activeControls.classList.remove('hidden');

            // Exibe ou esconde o alerta de "Já Votou"
            if (state.usuarioVotou) {
                votedAlert.classList.remove('hidden');
            } else {
                votedAlert.classList.add('hidden');
            }
            
            renderVotingSection();
        } else {
            votingSection.classList.add('hidden');
            setupSection.classList.remove('hidden');
            activeControls.classList.add('hidden');
            votedAlert.classList.add('hidden');
        }
    }

    // Renderiza a lista de filmes ativos e atualiza a barra de progresso
    function renderVotingSection() {
        moviesList.innerHTML = '';
        
        const totalVotes = state.ativos.reduce((acc, m) => acc + m.votos, 0);
        totalVotesBadge.textContent = `Total: ${totalVotes} ${totalVotes === 1 ? 'voto' : 'votos'}`;

        // Determina o vencedor atual em tempo real
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

        // Atualiza o banner do vencedor atual
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

        // Renderiza cada card de filme
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

        // Vincula eventos aos novos botões de voto
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
                    <p>Nenhum filme assistido ainda. Que tal iniciar uma rodada?</p>
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
            // Animação de clique imediata
            const card = document.getElementById(`movie-card-${id}`);
            if (card) {
                card.classList.add('pulse-highlight');
                setTimeout(() => card.classList.remove('pulse-highlight'), 500);
            }

            const response = await fetch(API_VOTAR, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });

            if (!response.ok) throw new Error('Erro ao registrar voto.');
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            alert('Não foi possível registrar o seu voto. O servidor está ativo?');
        }
    }

    // Submete o formulário dos 3 filmes iniciais
    setupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const moviesArray = movieInputs.map(input => input.value.trim()).filter(v => v !== '');
        
        if (moviesArray.length !== 3) {
            alert('Por favor, preencha o nome dos 3 filmes!');
            return;
        }

        try {
            showLoading(true);
            const response = await fetch(API_INICIAR, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(moviesArray)
            });

            const data = await response.json();
            
            if (!response.ok) {
                // Se o backend retornar erro (ex: filme já assistido)
                alert(data.error || 'Erro ao iniciar votação.');
                showLoading(false);
                return;
            }

            // Limpa os campos do formulário
            movieInputs.forEach(input => input.value = '');
            updateUI(data);
        } catch (error) {
            alert('Erro de conexão ao iniciar a votação.');
            showLoading(false);
        }
    });

    // Finaliza a rodada e declara o vencedor
    finishRoundBtn.addEventListener('click', async () => {
        if (state.ativos.length === 0) return;

        // Determinar vencedor localmente para mostrar no alerta
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
            const response = await fetch(API_FINALIZAR, {
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

    // Cancela a rodada ativa (mantém o histórico de assistidos)
    resetAllBtn.addEventListener('click', async () => {
        if (!confirm('Tem certeza de que deseja cancelar a rodada de votação atual? O histórico de filmes assistidos será mantido.')) {
            return;
        }

        try {
            showLoading(true);
            const response = await fetch(API_RESET, {
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

    // Estado de erro de conexão
    function showErrorState() {
        showLoading(false);
        votingSection.classList.remove('hidden');
        setupSection.classList.add('hidden');
        activeControls.classList.add('hidden');
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

    // Inicialização
    loadState();
});
