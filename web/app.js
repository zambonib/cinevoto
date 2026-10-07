// ============================================================
//  app.js — CineVoto com Firebase
//  Arquitetura: ES6 Modules + Firestore onSnapshot (tempo real)
// ============================================================

import { auth, db, googleProvider } from './firebase-config.js';
import {
    getTmdbKey,
    getOmdbKey,
    salvarChavesApi,
    testarApis,
    buscarDadosFilme
} from './movie-api.js';

import {
    obterIpUsuario,
    verificarBloqueioIp,
    validarVoucher,
    usuarioTemVoucherAtivo,
    sincronizarVouchersOficiais
} from './voucher-security.js';

import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc, collection, getDoc, setDoc, addDoc, updateDoc, arrayUnion,
    onSnapshot, serverTimestamp, query, orderBy, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================
// ESTADO GLOBAL
// ============================================================
let currentUser = null;          // Usuário Firebase Auth
let voucherPendenteUser = null;  // Usuário autenticado que precisa validar voucher
let userIp = null;               // Endereço IP do visitante
let currentSalaId = null;        // ID da sala ativa
let salaUnsubscribe = null;      // Listener do Firestore (para cancelar)
let votosUnsubscribe = null;     // Listener de votos (para cancelar)
let assistidosUnsubscribe = null;// Listener de assistidos da sala (tempo real)
let usuarioUnsubscribe = null;   // Listener do perfil do usuário logado (tempo real - Opção 1)
let userFilmesAssistidos = [];   // Filmes assistidos no histórico do usuário
let roomFilmesAssistidos = [];   // Filmes assistidos na sala atual
let isAdmin = false;             // Flag: usuário é admin desta sala?
let filmesCache = [];            // Cache de filmes da rodada ativa para os modais

// ============================================================
// REFERÊNCIAS DOM — TELAS
// ============================================================
const loginScreen   = document.getElementById('login-screen');
const homeScreen    = document.getElementById('home-screen');
const roomScreen    = document.getElementById('room-screen');

// Login
const googleLoginBtn = document.getElementById('google-login-btn');

// Home
const userAvatarHome = document.getElementById('user-avatar-home');
const userNameHome   = document.getElementById('user-name-home');
const logoutBtnHome  = document.getElementById('logout-btn-home');
const createRoomBtn  = document.getElementById('create-room-btn');
const roomCodeInput  = document.getElementById('room-code-input');
const joinRoomBtn    = document.getElementById('join-room-btn');
const apiSettingsBtnHome = document.getElementById('api-settings-btn-home');

// Room — Header
const userAvatarRoom = document.getElementById('user-avatar-room');
const userNameRoom   = document.getElementById('user-name-room');
const backHomeBtn    = document.getElementById('back-home-btn');
const roomCodeBadge  = document.getElementById('room-code-badge');
const apiSettingsBtnRoom = document.getElementById('api-settings-btn-room');

// Room — Invite Banner
const inviteBanner    = document.getElementById('invite-banner');
const inviteCode      = document.getElementById('invite-code');
const inviteLinkInput = document.getElementById('invite-link-input');
const copyLinkBtn     = document.getElementById('copy-link-btn');
const qrCodeBtn       = document.getElementById('qr-code-btn');

// Room — Controles
const adminControls  = document.getElementById('admin-controls');
const activeControls = document.getElementById('active-controls');
const voterStatus    = document.getElementById('voter-status');
const finishRoundBtn = document.getElementById('finish-round-btn');
const resetAllBtn    = document.getElementById('reset-all-btn');

// Room — Votantes (admin)
const votersPanel = document.getElementById('voters-panel');
const votersList  = document.getElementById('voters-list');

// Room — Setup form
const setupSection     = document.getElementById('setup-section');
const waitingSection   = document.getElementById('waiting-section');
const setupMoviesForm  = document.getElementById('setup-movies-form');
const movieInputs      = [
    document.getElementById('movie-1-input'),
    document.getElementById('movie-2-input'),
    document.getElementById('movie-3-input')
];

// Room — Votação
const votingSection    = document.getElementById('voting-section');
const loadingSpinner   = document.getElementById('loading-spinner');
const winnerBanner     = document.getElementById('winner-banner');
const winnerTitle      = document.getElementById('winner-title');
const winnerStats      = document.getElementById('winner-stats');
const votedAlert       = document.getElementById('voted-alert');
const moviesList       = document.getElementById('movies-list');
const totalVotesBadge  = document.getElementById('total-votes-badge');
const watchedList      = document.getElementById('watched-list');
const toastContainer   = document.getElementById('toast-container');

// Modais
const qrModal           = document.getElementById('qr-modal');
const closeQrBtn        = document.getElementById('close-qr-btn');
const modalCloseQrBtn   = document.getElementById('modal-close-qr-btn');
const modalCopyLinkBtn  = document.getElementById('modal-copy-link-btn');
const qrcodeContainer   = document.getElementById('qrcode-container');
const qrModalCode       = document.getElementById('qr-modal-code');

const trailerModal      = document.getElementById('trailer-modal');
const closeTrailerBtn   = document.getElementById('close-trailer-btn');
const trailerModalTitle = document.getElementById('trailer-modal-title');
const trailerIframe     = document.getElementById('trailer-iframe');

const synopsisModal      = document.getElementById('synopsis-modal');
const closeSynopsisBtn   = document.getElementById('close-synopsis-btn');
const synopsisModalTitle = document.getElementById('synopsis-modal-title');
const synopsisModalPoster= document.getElementById('synopsis-modal-poster');
const synopsisModalMeta  = document.getElementById('synopsis-modal-meta');
const synopsisModalText  = document.getElementById('synopsis-modal-text');

const apiSettingsModal   = document.getElementById('api-settings-modal');
const closeApiSettingsBtn= document.getElementById('close-api-settings-btn');
const tmdbKeyInput       = document.getElementById('tmdb-key-input');
const omdbKeyInput       = document.getElementById('omdb-key-input');
const apiTestStatus      = document.getElementById('api-test-status');
const testApiBtn         = document.getElementById('test-api-btn');
const saveApiBtn         = document.getElementById('save-api-btn');

// Voucher e Bloqueio (Lockout)
const voucherModal             = document.getElementById('voucher-modal');
const closeVoucherBtn          = document.getElementById('close-voucher-btn');
const cancelVoucherBtn         = document.getElementById('cancel-voucher-btn');
const submitVoucherBtn         = document.getElementById('submit-voucher-btn');
const voucherCodeInput         = document.getElementById('voucher-code-input');
const voucherStatusMsg         = document.getElementById('voucher-status-msg');
const voucherRemainingAttempts = document.getElementById('voucher-remaining-attempts');

const lockoutModal       = document.getElementById('lockout-modal');
const lockoutCloseBtn    = document.getElementById('lockout-close-btn');
const lockoutMessageText = document.getElementById('lockout-message-text');
const lockoutTimeDisplay = document.getElementById('lockout-time-display');
const lockoutIpDisplay   = document.getElementById('lockout-ip-display');

// ============================================================
// UTILITÁRIOS
// ============================================================

/** Escape de caracteres HTML para evitar XSS */
function escapeHtml(text) {
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/** Gera um código aleatório de N caracteres (ex: "AB3X7F") */
function gerarCodigo(n = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < n; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/** Mostra toast de notificação no lugar de alert() */
function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    // Animação de entrada
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    // Auto-remove
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

/** Normaliza títulos para comparação (ignora maiúsculas/minúsculas, acentos e espaços) */
function normalizarTitulo(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove acentos
        .trim()
        .replace(/\s+/g, ' '); // remove múltiplos espaços
}

/** Chave do localStorage para lembrar a última sala do usuário */
const STORAGE_LAST_ROOM = 'cinevoto_last_room';

/** Mostra/esconde telas */
function showScreen(screen) {
    loginScreen.classList.add('hidden');
    homeScreen.classList.add('hidden');
    roomScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

/** Verifica se a URL contém o parâmetro ?sala=CODIGO */
function getSalaFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('sala');
}

/** Atualiza a URL sem reload */
function updateUrl(salaId) {
    if (salaId) {
        localStorage.setItem(STORAGE_LAST_ROOM, salaId);
        window.history.pushState({}, '', `?sala=${salaId}`);
    } else {
        localStorage.removeItem(STORAGE_LAST_ROOM);
        window.history.pushState({}, '', window.location.pathname);
    }
}

// ============================================================
// MODAIS (QR Code, Trailer, Sinopse, Configurações de API)
// ============================================================

/** Abre o modal de QR Code com o link direto da sala */
function abrirModalQRCode() {
    if (!currentSalaId) return;
    const link = `${window.location.origin}${window.location.pathname}?sala=${currentSalaId}`;
    if (qrModalCode) qrModalCode.textContent = currentSalaId;
    if (qrcodeContainer) {
        qrcodeContainer.innerHTML = '';
        try {
            if (window.QRCode) {
                new window.QRCode(qrcodeContainer, {
                    text: link,
                    width: 200,
                    height: 200,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: window.QRCode.CorrectLevel.H
                });
            } else {
                qrcodeContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}" alt="QR Code">`;
            }
        } catch (e) {
            qrcodeContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}" alt="QR Code">`;
        }
    }
    qrModal.classList.remove('hidden');
}

function fecharModalQRCode() {
    qrModal.classList.add('hidden');
}

/** Abre o modal do player de trailer do YouTube */
function abrirModalTrailer(titulo, trailerUrl) {
    if (!trailerUrl) {
        showToast('Trailer não disponível para este filme.', 'info');
        return;
    }
    trailerModalTitle.innerHTML = `<i class="fa-brands fa-youtube"></i> Trailer: ${escapeHtml(titulo)}`;
    trailerIframe.src = trailerUrl;
    trailerModal.classList.remove('hidden');
}

function fecharModalTrailer() {
    trailerIframe.src = '';
    trailerModal.classList.add('hidden');
}

/** Abre o modal com a sinopse em português e ficha do filme */
function abrirModalSinopse(filme) {
    if (!filme) return;
    synopsisModalTitle.innerHTML = `<i class="fa-solid fa-film"></i> ${escapeHtml(filme.tituloPt || filme.titulo)}`;
    
    if (filme.posterUrl) {
        synopsisModalPoster.src = filme.posterUrl;
        synopsisModalPoster.classList.remove('hidden');
    } else {
        synopsisModalPoster.classList.add('hidden');
    }

    const metas = [];
    if (filme.ano) metas.push(`<span><i class="fa-regular fa-calendar"></i> ${escapeHtml(filme.ano)}</span>`);
    if (filme.duracao) metas.push(`<span><i class="fa-regular fa-clock"></i> ${escapeHtml(filme.duracao)}</span>`);
    if (filme.generos && filme.generos.length > 0) metas.push(`<span><i class="fa-solid fa-tags"></i> ${escapeHtml(filme.generos.join(', '))}</span>`);
    if (filme.imdbRating) metas.push(`<span><i class="fa-solid fa-star" style="color:#f5c518"></i> IMDb: ${escapeHtml(filme.imdbRating)}/10</span>`);
    if (filme.rottenTomatoes) metas.push(`<span>🍅 RT: ${escapeHtml(filme.rottenTomatoes)}</span>`);
    if (filme.metascore) metas.push(`<span>Ⓜ️ Metascore: ${escapeHtml(filme.metascore)}</span>`);
    synopsisModalMeta.innerHTML = metas.join(' • ');

    synopsisModalText.textContent = filme.sinopse || 'Nenhuma sinopse disponível em português para este filme.';
    synopsisModal.classList.remove('hidden');
}

function fecharModalSinopse() {
    synopsisModal.classList.add('hidden');
}

const MASK_PLACEHOLDER = '••••••••••••••••';

/** Abre o modal de configurações de APIs com chaves mascaradas */
function abrirModalConfigApis() {
    const tmdbAtiva = getTmdbKey();
    const omdbAtiva = getOmdbKey();

    // Se já houver chave configurada, exibe apenas a máscara de proteção
    tmdbKeyInput.value = tmdbAtiva ? MASK_PLACEHOLDER : '';
    omdbKeyInput.value = omdbAtiva ? MASK_PLACEHOLDER : '';
    tmdbKeyInput.dataset.configured = tmdbAtiva ? 'true' : 'false';
    omdbKeyInput.dataset.configured = omdbAtiva ? 'true' : 'false';

    apiTestStatus.classList.add('hidden');
    apiTestStatus.textContent = '';
    apiSettingsModal.classList.remove('hidden');
}

function fecharModalConfigApis() {
    apiSettingsModal.classList.add('hidden');
}

/** Testa as chaves inseridas nos campos */
async function testarConfigApis() {
    const rawTmdb = tmdbKeyInput.value.trim();
    const rawOmdb = omdbKeyInput.value.trim();

    // Se o valor estiver mascarado, usa a chave interna ativa
    const tmdb = (rawTmdb === MASK_PLACEHOLDER && tmdbKeyInput.dataset.configured === 'true')
        ? getTmdbKey()
        : rawTmdb;

    const omdb = (rawOmdb === MASK_PLACEHOLDER && omdbKeyInput.dataset.configured === 'true')
        ? getOmdbKey()
        : rawOmdb;

    apiTestStatus.classList.remove('hidden');
    apiTestStatus.innerHTML = '<div class="api-status-item"><i class="fa-solid fa-spinner fa-spin"></i> Testando conexão com APIs...</div>';
    const res = await testarApis(tmdb, omdb);
    let html = '';
    html += `<div class="api-status-item ${res.tmdbOk ? 'status-ok' : 'status-err'}">
        <i class="fa-solid ${res.tmdbOk ? 'fa-check' : 'fa-xmark'}"></i> ${escapeHtml(res.tmdbMsg)}
    </div>`;
    html += `<div class="api-status-item ${res.omdbOk ? 'status-ok' : 'status-err'}">
        <i class="fa-solid ${res.omdbOk ? 'fa-check' : 'fa-xmark'}"></i> ${escapeHtml(res.omdbMsg)}
    </div>`;
    apiTestStatus.innerHTML = html;
}

/** Salva as chaves de forma ofuscada */
function salvarConfigApis() {
    const rawTmdb = tmdbKeyInput.value.trim();
    const rawOmdb = omdbKeyInput.value.trim();

    // Se manteve os pontos, preserva a chave atual
    const tmdbSalvar = (rawTmdb === MASK_PLACEHOLDER && tmdbKeyInput.dataset.configured === 'true')
        ? getTmdbKey()
        : rawTmdb;

    const omdbSalvar = (rawOmdb === MASK_PLACEHOLDER && omdbKeyInput.dataset.configured === 'true')
        ? getOmdbKey()
        : rawOmdb;

    salvarChavesApi(tmdbSalvar, omdbSalvar);
    showToast('Chaves de API atualizadas com sucesso!', 'success');
    fecharModalConfigApis();
}

// Listeners dos Modais
qrCodeBtn?.addEventListener('click', abrirModalQRCode);
closeQrBtn?.addEventListener('click', fecharModalQRCode);
modalCloseQrBtn?.addEventListener('click', fecharModalQRCode);
modalCopyLinkBtn?.addEventListener('click', () => {
    if (inviteLinkInput) {
        navigator.clipboard.writeText(inviteLinkInput.value).then(() => {
            showToast('Link da sala copiado!', 'success');
        });
    }
});
qrModal?.addEventListener('click', (e) => { if (e.target === qrModal) fecharModalQRCode(); });

closeTrailerBtn?.addEventListener('click', fecharModalTrailer);
trailerModal?.addEventListener('click', (e) => { if (e.target === trailerModal) fecharModalTrailer(); });

closeSynopsisBtn?.addEventListener('click', fecharModalSinopse);
synopsisModal?.addEventListener('click', (e) => { if (e.target === synopsisModal) fecharModalSinopse(); });

apiSettingsBtnHome?.addEventListener('click', abrirModalConfigApis);
apiSettingsBtnRoom?.addEventListener('click', abrirModalConfigApis);
closeApiSettingsBtn?.addEventListener('click', fecharModalConfigApis);
testApiBtn?.addEventListener('click', testarConfigApis);
saveApiBtn?.addEventListener('click', salvarConfigApis);
apiSettingsModal?.addEventListener('click', (e) => { if (e.target === apiSettingsModal) fecharModalConfigApis(); });

// ============================================================
// SISTEMA DE VOUCHER & CONTROLE DE BLOQUEIO POR IP (72 HORAS)
// ============================================================

/** Carrega o IP público e verifica se o usuário/dispositivo está bloqueado */
async function carregarEVerificarIp() {
    if (!userIp) {
        userIp = await obterIpUsuario();
    }
    const status = await verificarBloqueioIp(userIp, db);
    if (status.bloqueado) {
        exibirModalBloqueio(status);
        return false;
    }
    return true;
}

/** Exibe a tela de IP/Dispositivo Bloqueado com contagem de horas */
function exibirModalBloqueio(statusBloqueio) {
    if (lockoutMessageText) {
        lockoutMessageText.textContent = statusBloqueio.motivo || 'Acesso bloqueado por segurança.';
    }
    if (lockoutTimeDisplay) {
        lockoutTimeDisplay.textContent = statusBloqueio.permanente ? 'Permanente' : `${statusBloqueio.horasRestantes || 72} Horas restantes`;
    }
    if (lockoutIpDisplay) {
        lockoutIpDisplay.textContent = userIp || 'Detectado';
    }
    lockoutModal.classList.remove('hidden');
    if (currentUser) {
        signOut(auth).catch(() => {});
    }
}

/** Abre o modal de digitação de voucher */
function abrirModalVoucher() {
    if (voucherStatusMsg) {
        voucherStatusMsg.classList.add('hidden');
        voucherStatusMsg.textContent = '';
        voucherStatusMsg.className = 'voucher-status-msg hidden';
    }
    if (voucherCodeInput) {
        voucherCodeInput.value = '';
    }
    voucherModal.classList.remove('hidden');
    setTimeout(() => voucherCodeInput?.focus(), 150);
}

/** Fecha o modal de voucher */
function fecharModalVoucher() {
    voucherModal.classList.add('hidden');
}

/** Submete o voucher para validação com controle de 3 tentativas */
async function submeterVoucher() {
    const codigo = voucherCodeInput?.value?.trim();
    if (!codigo) {
        if (voucherStatusMsg) {
            voucherStatusMsg.textContent = 'Por favor, digite o código do seu voucher de convite.';
            voucherStatusMsg.className = 'voucher-status-msg error';
            voucherStatusMsg.classList.remove('hidden');
        }
        return;
    }

    if (!userIp) {
        userIp = await obterIpUsuario();
    }

    if (submitVoucherBtn) submitVoucherBtn.disabled = true;

    try {
        const resultado = await validarVoucher(codigo, userIp, currentUser || voucherPendenteUser, db);

        if (resultado.valido) {
            if (voucherStatusMsg) {
                voucherStatusMsg.textContent = resultado.mensagem;
                voucherStatusMsg.className = 'voucher-status-msg success';
                voucherStatusMsg.classList.remove('hidden');
            }
            showToast('Voucher validado com sucesso! Acesso liberado. 🎉', 'success', 4000);
            setTimeout(async () => {
                fecharModalVoucher();
                if (currentUser) {
                    await liberarAcessoUsuario(currentUser);
                }
            }, 800);
        } else {
            // Inválido
            if (resultado.bloqueado) {
                fecharModalVoucher();
                exibirModalBloqueio({
                    motivo: resultado.mensagem,
                    horasRestantes: 72,
                    permanente: false
                });
            } else {
                if (voucherRemainingAttempts) {
                    voucherRemainingAttempts.textContent = `${resultado.tentativasRestantes} de 3`;
                }
                if (voucherStatusMsg) {
                    voucherStatusMsg.textContent = resultado.mensagem;
                    voucherStatusMsg.className = 'voucher-status-msg error';
                    voucherStatusMsg.classList.remove('hidden');
                }
            }
        }
    } catch (err) {
        console.error('Erro ao validar voucher:', err);
        showToast('Erro ao validar voucher. Tente novamente.', 'error');
    } finally {
        if (submitVoucherBtn) submitVoucherBtn.disabled = false;
    }
}

// Listeners do Voucher & Lockout
submitVoucherBtn?.addEventListener('click', submeterVoucher);
voucherCodeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        submeterVoucher();
    }
});
cancelVoucherBtn?.addEventListener('click', () => {
    fecharModalVoucher();
    handleLogout();
});
closeVoucherBtn?.addEventListener('click', () => {
    fecharModalVoucher();
    handleLogout();
});
lockoutCloseBtn?.addEventListener('click', () => {
    lockoutModal.classList.add('hidden');
    showScreen(loginScreen);
});

// ============================================================
// AUTENTICAÇÃO
// ============================================================

/** Checagem rápida e síncrona de bloqueio local (não quebra o gesto de clique no iOS/Safari) */
function ipEstaBloqueadoLocalmente() {
    const lock = localStorage.getItem("cinevoto_sec_device_lock");
    if (lock) {
        try {
            const data = JSON.parse(lock);
            if (data.permanente || (data.bloqueadoAte && data.bloqueadoAte > Date.now())) {
                return true;
            }
        } catch (e) {}
    }
    return false;
}

/** Login com Google (otimizado para Desktop e Mobile/Safari) */
async function handleGoogleLogin() {
    // 1. Checagem síncrona instantânea (não faz fetch para não quebrar o gesto de clique no iOS)
    if (ipEstaBloqueadoLocalmente()) {
        exibirModalBloqueio({ motivo: "Acesso bloqueado por segurança (72 horas após tentativas inválidas)." });
        return;
    }

    try {
        // Dispara o popup no mesmo tick do evento de toque/clique
        await signInWithPopup(auth, googleProvider);
    } catch (err) {
        console.warn('signInWithPopup falhou ou foi bloqueado pelo navegador:', err?.code, err);

        // Fallback automático para redirect caso o navegador mobile (Safari iOS / Chrome) bloqueie popups
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
            try {
                showToast('Redirecionando para login seguro com o Google...', 'info', 3000);
                await signInWithRedirect(auth, googleProvider);
                return;
            } catch (redirErr) {
                console.error('Erro no signInWithRedirect:', redirErr);
            }
        }

        if (err.code === 'auth/unauthorized-domain') {
            showToast('Domínio não autorizado no Firebase Console. Adicione dalzam.com.br em Authorized Domains.', 'error', 8000);
        } else if (err.code === 'auth/popup-closed-by-user') {
            showToast('Login cancelado: janela do Google foi fechada.', 'warning', 3000);
        } else {
            showToast(`Erro ao fazer login (${err.code || 'Google Auth'}): ${err.message || 'Tente novamente.'}`, 'error', 6000);
        }
    }
}

document.querySelectorAll('.google-login-trigger').forEach(btn => {
    btn.addEventListener('click', handleGoogleLogin);
});
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleLogin);
}

/** Logout */
async function handleLogout() {
    cancelarListeners();
    if (usuarioUnsubscribe) {
        usuarioUnsubscribe();
        usuarioUnsubscribe = null;
    }
    userFilmesAssistidos = [];
    roomFilmesAssistidos = [];
    currentSalaId = null;
    voucherPendenteUser = null;
    await signOut(auth);
}

logoutBtnHome.addEventListener('click', handleLogout);
backHomeBtn.addEventListener('click', () => {
    cancelarListeners();
    currentSalaId = null;
    updateUrl(null);
    preencherInfoUsuario();
    showScreen(homeScreen);
});

/** Libera acesso do usuário à Home ou à Sala após autenticação e voucher */
async function liberarAcessoUsuario(user) {
    // Inicia listener em tempo real do perfil do usuário para filmes assistidos (Opção 1)
    iniciarListenerUsuario(user.uid);

    // Salva/atualiza perfil no Firestore e recupera a última sala salva no banco
    const dadosUsuario = await salvarUsuario(user);
    preencherInfoUsuario();

    // Sincroniza vouchers oficiais no Firestore em background
    sincronizarVouchersOficiais(db).catch(() => {});

    // 1º: Checa se veio com ?sala= na URL
    const salaUrl = getSalaFromUrl();
    // 2º: Checa no localStorage
    const lastRoomLocal = localStorage.getItem(STORAGE_LAST_ROOM);
    // 3º: Checa no banco de dados do Firestore (caso tenha limpado o navegador)
    const lastRoomBanco = dadosUsuario?.ultimaSalaId;

    const salaAlvo = salaUrl || lastRoomLocal || lastRoomBanco;

    // Migra histórico de filmes assistidos de sessões anteriores caso ainda não estejam no perfil
    if (salaAlvo) {
        migrarAssistidosDeSala(salaAlvo.toUpperCase());
    }

    if (salaAlvo) {
        await entrarNaSala(salaAlvo.toUpperCase());
    } else {
        showScreen(homeScreen);
    }
}

/** Observador de estado de autenticação — ponto de entrada principal */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;

        // 1. Checa se o IP está bloqueado
        const ipPermitido = await carregarEVerificarIp();
        if (!ipPermitido) return;

        // 2. Checa se o usuário já possui voucher validado
        const temVoucher = await usuarioTemVoucherAtivo(user, db);
        if (!temVoucher) {
            voucherPendenteUser = user;
            abrirModalVoucher();
            return;
        }

        // 3. Acesso liberado
        await liberarAcessoUsuario(user);
    } else {
        currentUser = null;
        voucherPendenteUser = null;
        cancelarListeners();
        if (usuarioUnsubscribe) {
            usuarioUnsubscribe();
            usuarioUnsubscribe = null;
        }
        userFilmesAssistidos = [];
        roomFilmesAssistidos = [];
        showScreen(loginScreen);
    }
});

// Trata retorno de redirecionamento caso o navegador móvel tenha utilizado signInWithRedirect
getRedirectResult(auth).catch((err) => {
    if (err && err.code) {
        console.warn('getRedirectResult avisou:', err.code, err);
    }
});

// Verificação proativa de IP ao inicializar a página
carregarEVerificarIp();

// ============================================================
// FIRESTORE — USUÁRIOS
// ============================================================

/** Escuta em tempo real o perfil do usuário logado (Opção 1 - Histórico Global) */
function iniciarListenerUsuario(uid) {
    if (usuarioUnsubscribe) {
        usuarioUnsubscribe();
        usuarioUnsubscribe = null;
    }
    const userDocRef = doc(db, 'usuarios', uid);
    usuarioUnsubscribe = onSnapshot(userDocRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        userFilmesAssistidos = data.filmesAssistidos || [];
        renderizarColunaAssistidos();
    }, (err) => {
        console.error('Erro no listener de usuário:', err);
    });
}

/** Migra filmes assistidos de uma sala para o perfil do usuário logado */
async function migrarAssistidosDeSala(salaId) {
    if (!currentUser || !salaId) return;
    try {
        const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const assistidosRef = collection(db, 'salas', salaId, 'assistidos');
        const snap = await getDocs(assistidosRef);
        if (snap.empty) return;

        const userRef = doc(db, 'usuarios', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const atuais = (userSnap.exists() && userSnap.data().filmesAssistidos) || [];
        const setNorm = new Set(atuais.map(f => f.tituloNorm || normalizarTitulo(f.titulo)));

        for (const docFilme of snap.docs) {
            const data = docFilme.data();
            const norm = normalizarTitulo(data.titulo);
            if (norm && !setNorm.has(norm)) {
                await updateDoc(userRef, {
                    filmesAssistidos: arrayUnion({
                        titulo: data.titulo,
                        tituloNorm: norm,
                        data: new Date().toISOString()
                    })
                });
                setNorm.add(norm);
            }
        }
    } catch (e) {
        console.warn('Migração de sala anterior ignorada:', e);
    }
}

/** Cria ou atualiza o documento do usuário em /usuarios/{uid} */
async function salvarUsuario(user) {
    const userRef = doc(db, 'usuarios', user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
        // Primeiro acesso
        const novoPerfil = {
            nome: user.displayName,
            email: user.email,
            fotoUrl: user.photoURL,
            primeiroAcesso: serverTimestamp(),
            ultimoAcesso: serverTimestamp(),
            filmesAssistidos: []
        };
        await setDoc(userRef, novoPerfil);
        return novoPerfil;
    } else {
        // Atualiza último acesso e assegura voucher de membro para usuários pré-existentes
        const dados = snap.data();
        const camposAtualizar = {
            ultimoAcesso: serverTimestamp(),
            nome: user.displayName,
            fotoUrl: user.photoURL
        };
        if (dados.voucherAtivo !== true) {
            camposAtualizar.voucherAtivo = true;
            camposAtualizar.voucherCodigo = 'MEMBRO_FUNDADOR';
        }
        await updateDoc(userRef, camposAtualizar);
        return { ...dados, ...camposAtualizar };
    }
}

/** Preenche avatar e nome nas telas Home e Room */
function preencherInfoUsuario() {
    if (!currentUser) return;
    const foto = currentUser.photoURL || '';
    const nome = currentUser.displayName || currentUser.email;

    userAvatarHome.src = foto;
    userNameHome.textContent = nome;
    userAvatarRoom.src = foto;
    userNameRoom.textContent = nome;
}

// ============================================================
// CRIAÇÃO DE SALA
// ============================================================

createRoomBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    createRoomBtn.disabled = true;
    createRoomBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando...';

    try {
        const codigo = gerarCodigo(6);
        const salaRef = doc(db, 'salas', codigo);

        await setDoc(salaRef, {
            adminId: currentUser.uid,
            adminNome: currentUser.displayName,
            adminEmail: currentUser.email,
            adminFoto: currentUser.photoURL,
            status: 'aguardando',  // 'aguardando' | 'ativa' | 'encerrada'
            filmes: [],
            criadaEm: serverTimestamp()
        });

        await entrarNaSala(codigo);
    } catch (err) {
        showToast('Erro ao criar a sala. Tente novamente.', 'error');
        console.error(err);
    } finally {
        createRoomBtn.disabled = false;
        createRoomBtn.innerHTML = '<i class="fa-solid fa-clapperboard"></i> Criar Sala';
    }
});

// ============================================================
// ENTRAR EM SALA (por código ou URL)
// ============================================================

joinRoomBtn.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length < 6) {
        showToast('Digite um código de sala válido (6 caracteres).', 'warning');
        return;
    }
    await entrarNaSala(code);
});

roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoomBtn.click();
});

/** Verifica se a sala existe e inicia os listeners em tempo real */
async function entrarNaSala(salaId) {
    showScreen(roomScreen);
    showLoading(true);

    try {
        const salaRef = doc(db, 'salas', salaId);
        const snap = await getDoc(salaRef);

        if (!snap.exists()) {
            showToast(`Sala "${salaId}" não encontrada. Verifique o código.`, 'error');
            cancelarListeners();
            updateUrl(null);
            showScreen(homeScreen);
            return;
        }

        currentSalaId = salaId;
        updateUrl(salaId);

        // Salva a sala também no perfil do usuário na nuvem
        try {
            const userDocRef = doc(db, 'usuarios', currentUser.uid);
            await updateDoc(userDocRef, { ultimaSalaId: salaId });
        } catch (ignored) {}

        const sala = snap.data();
        isAdmin = sala.adminId === currentUser.uid;

        // Configura a UI de acordo com o papel
        configurarPapel(salaId, isAdmin);

        // Renderiza assistidos imediatamente com o histórico do perfil do usuário
        renderizarColunaAssistidos();

        // Inicia listener em tempo real da sala
        iniciarListenerSala(salaId);
        // Inicia listener de votos (para painel admin)
        if (isAdmin) iniciarListenerVotos(salaId);
    } catch (err) {
        showToast('Erro ao entrar na sala.', 'error');
        console.error(err);
        showScreen(homeScreen);
    }
}

/** Configura visibilidade de elementos de acordo com admin/votante */
function configurarPapel(salaId, admin) {
    roomCodeBadge.textContent = salaId;

    if (admin) {
        adminControls.classList.remove('hidden');
        voterStatus.classList.add('hidden');
        votersPanel.classList.remove('hidden');
        inviteBanner.classList.remove('hidden');
        apiSettingsBtnRoom?.classList.remove('hidden');
        inviteCode.textContent = salaId;
        const link = `${window.location.origin}${window.location.pathname}?sala=${salaId}`;
        inviteLinkInput.value = link;
    } else {
        adminControls.classList.add('hidden');
        voterStatus.classList.remove('hidden');
        votersPanel.classList.add('hidden');
        inviteBanner.classList.add('hidden');
        apiSettingsBtnRoom?.classList.add('hidden');
    }
}

/** Copia link de convite */
copyLinkBtn.addEventListener('click', () => {
    inviteLinkInput.select();
    navigator.clipboard.writeText(inviteLinkInput.value)
        .then(() => showToast('Link copiado para a área de transferência!', 'success'))
        .catch(() => showToast('Não foi possível copiar automaticamente.', 'warning'));
});

// ============================================================
// LISTENERS EM TEMPO REAL (Firestore onSnapshot)
// ============================================================

/** Cancela todos os listeners ativos */
function cancelarListeners() {
    if (salaUnsubscribe) { salaUnsubscribe(); salaUnsubscribe = null; }
    if (votosUnsubscribe) { votosUnsubscribe(); votosUnsubscribe = null; }
    if (assistidosUnsubscribe) { assistidosUnsubscribe(); assistidosUnsubscribe = null; }
    roomFilmesAssistidos = [];
}

/** Escuta mudanças na sala em tempo real */
function iniciarListenerSala(salaId) {
    cancelarListeners();
    const salaRef = doc(db, 'salas', salaId);

    salaUnsubscribe = onSnapshot(salaRef, async (snap) => {
        if (!snap.exists()) return;
        const sala = snap.data();
        await renderizarSala(sala, salaId);
        showLoading(false);
    }, (err) => {
        console.error('Erro no listener da sala:', err);
        showToast('Conexão perdida com a sala.', 'error');
    });

    // Inicia listener de filmes assistidos em tempo real
    iniciarListenerAssistidos(salaId);
}

/** Escuta mudanças no histórico de assistidos em tempo real */
function iniciarListenerAssistidos(salaId) {
    if (assistidosUnsubscribe) {
        assistidosUnsubscribe();
        assistidosUnsubscribe = null;
    }
    const assistidosRef = collection(db, 'salas', salaId, 'assistidos');

    assistidosUnsubscribe = onSnapshot(assistidosRef, async (snapshot) => {
        roomFilmesAssistidos = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
        // Auto-sincroniza filmes assistidos da sala com o perfil do usuário logado
        await sincronizarAssistidosComPerfilUsuario();
        renderizarColunaAssistidos();
    }, (err) => {
        console.error('Erro no listener de assistidos:', err);
    });
}

/** Escuta mudanças nos votos em tempo real (admin) */
function iniciarListenerVotos(salaId) {
    const votosRef = collection(db, 'salas', salaId, 'votos');

    votosUnsubscribe = onSnapshot(votosRef, (snapshot) => {
        renderizarVotantes(snapshot.docs);
    });
}

// ============================================================
// RENDERIZAÇÃO DA SALA
// ============================================================

async function renderizarSala(sala, salaId) {
    const status = sala.status;

    // Voto do usuário atual nesta sala
    const meuVotoRef = doc(db, 'salas', salaId, 'votos', currentUser.uid);
    const meuVotoSnap = await getDoc(meuVotoRef);
    const jáVotei = meuVotoSnap.exists();

    if (status === 'aguardando' || status === 'encerrada') {
        // Não há votação ativa
        votingSection.classList.add('hidden');
        winnerBanner.classList.add('hidden');
        votedAlert.classList.add('hidden');

        if (isAdmin) {
            setupSection.classList.remove('hidden');
            waitingSection.classList.add('hidden');
            activeControls.classList.add('hidden');
        } else {
            setupSection.classList.add('hidden');
            waitingSection.classList.remove('hidden');
        }
    } else if (status === 'ativa') {
        // Votação ativa
        setupSection.classList.add('hidden');
        waitingSection.classList.add('hidden');
        votingSection.classList.remove('hidden');

        if (isAdmin) {
            activeControls.classList.remove('hidden');
        }

        // Alerta de já votou
        if (jáVotei) {
            votedAlert.classList.remove('hidden');
        } else {
            votedAlert.classList.add('hidden');
        }

        renderizarFilmes(sala.filmes, jáVotei);
    }
}

/** Renderiza os cards de filmes com votos, dados do TMDb/OMDb e barra de progresso */
function renderizarFilmes(filmes, jáVotei) {
    moviesList.innerHTML = '';
    if (!filmes || filmes.length === 0) return;
    filmesCache = filmes;

    const totalVotos = filmes.reduce((acc, f) => acc + (f.votos || 0), 0);
    totalVotesBadge.textContent = `Total: ${totalVotos} ${totalVotos === 1 ? 'voto' : 'votos'}`;

    // Determina o(s) vencedor(es) atual
    let maxVotos = 0;
    let vencedores = [];
    filmes.forEach(f => {
        const t = f.tituloPt || f.titulo;
        if (f.votos > maxVotos) { maxVotos = f.votos; vencedores = [t]; }
        else if (f.votos === maxVotos && maxVotos > 0) { vencedores.push(t); }
    });

    // Banner do vencedor atual
    if (maxVotos > 0) {
        winnerBanner.classList.remove('hidden');
        if (vencedores.length === 1) {
            winnerTitle.textContent = vencedores[0];
            winnerStats.textContent = `Liderando com ${maxVotos} ${maxVotos === 1 ? 'voto' : 'votos'} (${Math.round((maxVotos / totalVotos) * 100)}%)`;
        } else {
            winnerTitle.textContent = 'Empate!';
            winnerStats.textContent = `Filmes empatados: ${vencedores.join(' | ')} (${maxVotos} votos cada)`;
        }
    } else {
        winnerBanner.classList.add('hidden');
    }

    // Cards de filmes
    filmes.forEach((filme, idx) => {
        const pct = totalVotos > 0 ? Math.round(((filme.votos || 0) / totalVotos) * 100) : 0;
        const votantes = filme.votantes || [];
        const tituloPrincipal = filme.tituloPt || filme.titulo;
        const subTitulo = (filme.tituloPt && filme.tituloPt.toLowerCase() !== filme.titulo.toLowerCase()) ? `(${filme.titulo})` : '';

        const card = document.createElement('div');
        card.className = 'movie-item';
        card.id = `movie-card-${idx}`;

        // Monta lista de avatares de quem votou
        const avatarHtml = votantes.map(v =>
            `<img src="${escapeHtml(v.fotoUrl || '')}" alt="${escapeHtml(v.nome)}" title="${escapeHtml(v.nome)}" class="voter-avatar-mini">`
        ).join('');

        // Monta tags de notas e metadados
        let tagsHtml = '';
        if (filme.ano) tagsHtml += `<span class="rating-tag rating-time"><i class="fa-regular fa-calendar"></i> ${escapeHtml(filme.ano)}</span>`;
        if (filme.duracao) tagsHtml += `<span class="rating-tag rating-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(filme.duracao)}</span>`;
        if (filme.imdbRating) tagsHtml += `<span class="rating-tag rating-imdb" title="Nota no IMDb"><i class="fa-solid fa-star"></i> ${escapeHtml(filme.imdbRating)}</span>`;
        if (filme.rottenTomatoes) tagsHtml += `<span class="rating-tag rating-rt" title="Aprovação no Rotten Tomatoes">🍅 ${escapeHtml(filme.rottenTomatoes)}</span>`;
        if (filme.metascore) tagsHtml += `<span class="rating-tag rating-meta" title="Metascore">Ⓜ️ ${escapeHtml(filme.metascore)}</span>`;

        // Pôster ou placeholder
        const posterHtml = filme.posterUrl
            ? `<div class="movie-poster-wrap"><img src="${escapeHtml(filme.posterUrl)}" alt="${escapeHtml(tituloPrincipal)}" class="movie-poster-img" loading="lazy"></div>`
            : `<div class="movie-poster-wrap"><div class="movie-poster-placeholder"><i class="fa-solid fa-film"></i></div></div>`;

        // Ações de mídia (Trailer e Sinopse)
        let actionsHtml = '';
        if (filme.trailerUrl) {
            actionsHtml += `<button type="button" class="btn-trailer" data-trailer-idx="${idx}"><i class="fa-brands fa-youtube"></i> Trailer</button>`;
        }
        if (filme.sinopse) {
            actionsHtml += `<button type="button" class="btn-synopsis-more" data-synopsis-idx="${idx}">Ver sinopse</button>`;
        }

        // Trecho de sinopse
        const synopsisSnippetHtml = filme.sinopse
            ? `<p class="movie-synopsis-text">${escapeHtml(filme.sinopse)}</p>`
            : '';

        card.innerHTML = `
            <div class="movie-card-enhanced">
                ${posterHtml}
                <div class="movie-card-body">
                    <div class="movie-info" style="margin-bottom: 0.2rem;">
                        <div class="movie-details">
                            <span class="movie-rank">#${idx + 1}</span>
                            <span class="movie-title-text" title="${escapeHtml(tituloPrincipal)}">${escapeHtml(tituloPrincipal)}</span>
                            ${subTitulo ? `<small style="color: var(--text-muted); font-size: 0.8rem; margin-left: 0.35rem;">${escapeHtml(subTitulo)}</small>` : ''}
                        </div>
                        <span class="movie-votes-count">${filme.votos || 0} ${(filme.votos || 0) === 1 ? 'voto' : 'votos'}</span>
                    </div>

                    ${tagsHtml ? `<div class="movie-ratings-row">${tagsHtml}</div>` : ''}
                    ${synopsisSnippetHtml}
                    ${actionsHtml ? `<div class="movie-actions-row">${actionsHtml}</div>` : ''}

                    <div class="progress-container" style="margin-top: 0.5rem;">
                        <div class="progress-bar" style="width: ${pct}%"></div>
                    </div>

                    <div class="movie-footer" style="margin-top: 0.25rem;">
                        <div class="voter-avatars-row">${avatarHtml}</div>
                        <div class="vote-btn-container">
                            <button class="btn btn-vote" data-idx="${idx}" ${jáVotei ? 'disabled' : ''}>
                                <i class="fa-solid ${jáVotei ? 'fa-check' : 'fa-thumbs-up'}"></i>
                                ${jáVotei ? 'Votado' : 'Votar'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        moviesList.appendChild(card);

        // Se o filme não veio com pôster ou sinopse (ex: rodada criada antes das chaves de API), enriquece agora em tempo real
        if (!filme.posterUrl && filme.titulo) {
            buscarDadosFilme(filme.titulo).then(dadosRicos => {
                if (dadosRicos && (dadosRicos.posterUrl || dadosRicos.sinopse)) {
                    Object.assign(filme, dadosRicos);
                    filmesCache[idx] = filme;

                    // Atualiza pôster
                    const posterWrap = card.querySelector('.movie-poster-wrap');
                    if (posterWrap && dadosRicos.posterUrl) {
                        posterWrap.innerHTML = `<img src="${escapeHtml(dadosRicos.posterUrl)}" alt="${escapeHtml(dadosRicos.tituloPt || filme.titulo)}" class="movie-poster-img" loading="lazy">`;
                    }

                    // Atualiza título se encontrou o oficial em português
                    const titleText = card.querySelector('.movie-title-text');
                    if (titleText && dadosRicos.tituloPt && dadosRicos.tituloPt !== filme.titulo) {
                        titleText.textContent = dadosRicos.tituloPt;
                    }

                    // Atualiza tags de avaliação
                    const ratingsRow = card.querySelector('.movie-ratings-row');
                    if (ratingsRow) {
                        let newTags = '';
                        if (dadosRicos.ano) newTags += `<span class="rating-tag rating-time"><i class="fa-regular fa-calendar"></i> ${escapeHtml(dadosRicos.ano)}</span>`;
                        if (dadosRicos.duracao) newTags += `<span class="rating-tag rating-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(dadosRicos.duracao)}</span>`;
                        if (dadosRicos.imdbRating) newTags += `<span class="rating-tag rating-imdb" title="Nota no IMDb"><i class="fa-solid fa-star"></i> ${escapeHtml(dadosRicos.imdbRating)}</span>`;
                        if (dadosRicos.rottenTomatoes) newTags += `<span class="rating-tag rating-rt" title="Aprovação no Rotten Tomatoes">🍅 ${escapeHtml(dadosRicos.rottenTomatoes)}</span>`;
                        if (dadosRicos.metascore) newTags += `<span class="rating-tag rating-meta" title="Metascore">Ⓜ️ ${escapeHtml(dadosRicos.metascore)}</span>`;
                        ratingsRow.innerHTML = newTags;
                    }

                    // Atualiza sinopse e botões
                    const cardBody = card.querySelector('.movie-card-body');
                    if (cardBody && dadosRicos.sinopse && !card.querySelector('.movie-synopsis-text')) {
                        const synP = document.createElement('p');
                        synP.className = 'movie-synopsis-text';
                        synP.textContent = dadosRicos.sinopse;

                        const actionsDiv = document.createElement('div');
                        actionsDiv.className = 'movie-actions-row';

                        if (dadosRicos.trailerUrl) {
                            actionsDiv.innerHTML += `<button type="button" class="btn-trailer" data-trailer-idx="${idx}"><i class="fa-brands fa-youtube"></i> Trailer</button>`;
                        }
                        actionsDiv.innerHTML += `<button type="button" class="btn-synopsis-more" data-synopsis-idx="${idx}">Ver sinopse</button>`;

                        actionsDiv.querySelectorAll('[data-trailer-idx]').forEach(b => {
                            b.onclick = (e) => { e.stopPropagation(); abrirModalTrailer(dadosRicos.tituloPt || filme.titulo, dadosRicos.trailerUrl); };
                        });
                        actionsDiv.querySelectorAll('[data-synopsis-idx]').forEach(b => {
                            b.onclick = (e) => { e.stopPropagation(); abrirModalSinopse(filme); };
                        });

                        const progressCont = card.querySelector('.progress-container');
                        if (progressCont) {
                            cardBody.insertBefore(synP, progressCont);
                            cardBody.insertBefore(actionsDiv, progressCont);
                        }
                    }
                }
            }).catch(errEnrich => console.warn('Aviso ao enriquecer filme:', errEnrich));
        }
    });

    // Vincula eventos de voto
    document.querySelectorAll('.btn-vote').forEach(btn => {
        btn.addEventListener('click', e => {
            const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
            registrarVoto(idx);
        });
    });

    // Vincula eventos de trailer
    document.querySelectorAll('[data-trailer-idx]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.getAttribute('data-trailer-idx'));
            const f = filmesCache[idx];
            if (f && f.trailerUrl) {
                abrirModalTrailer(f.tituloPt || f.titulo, f.trailerUrl);
            }
        });
    });

    // Vincula eventos de sinopse
    document.querySelectorAll('[data-synopsis-idx]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.getAttribute('data-synopsis-idx'));
            const f = filmesCache[idx];
            if (f) {
                abrirModalSinopse(f);
            }
        });
    });
}

/** Renderiza o painel de votantes (admin only) */
function renderizarVotantes(docs) {
    if (!docs || docs.length === 0) {
        votersList.innerHTML = '<p class="voters-empty"><i class="fa-solid fa-hourglass-half"></i> Nenhum voto ainda.</p>';
        return;
    }
    votersList.innerHTML = '';
    docs.forEach(d => {
        const v = d.data();
        const item = document.createElement('div');
        item.className = 'voter-item';
        item.innerHTML = `
            <img src="${escapeHtml(v.fotoUrl || '')}" alt="${escapeHtml(v.nome)}" class="voter-avatar-small">
            <div class="voter-details">
                <span class="voter-name">${escapeHtml(v.nome)}</span>
                <span class="voter-film"><i class="fa-solid fa-film"></i> ${escapeHtml(v.filmeEscolhido || '—')}</span>
            </div>
        `;
        votersList.appendChild(item);
    });
}

/** Auto-sincroniza filmes da sala atual para o perfil permanente do usuário (Opção 1) */
async function sincronizarAssistidosComPerfilUsuario() {
    if (!currentUser || !roomFilmesAssistidos || roomFilmesAssistidos.length === 0) return;

    const titulosUsuario = new Set(
        (userFilmesAssistidos || []).map(f => f.tituloNorm || normalizarTitulo(f.titulo))
    );

    const userDocRef = doc(db, 'usuarios', currentUser.uid);

    for (const filmeSala of roomFilmesAssistidos) {
        const norm = normalizarTitulo(filmeSala.titulo);
        if (norm && !titulosUsuario.has(norm)) {
            try {
                await updateDoc(userDocRef, {
                    filmesAssistidos: arrayUnion({
                        titulo: filmeSala.titulo,
                        tituloNorm: norm,
                        data: new Date().toISOString()
                    })
                });
                titulosUsuario.add(norm);
            } catch (err) {
                console.warn('Aviso ao sincronizar filme com perfil do usuário:', err);
            }
        }
    }
}

/** Renderiza a coluna de filmes assistidos (Opção 1 - Histórico Pessoal + Sala) */
function renderizarColunaAssistidos() {
    if (!watchedList) return;
    watchedList.innerHTML = '';

    const filmesMap = new Map();

    // 1. Filmes do histórico pessoal permanente do usuário logado (todas as salas)
    (userFilmesAssistidos || []).forEach(f => {
        const norm = f.tituloNorm || normalizarTitulo(f.titulo);
        if (norm && !filmesMap.has(norm)) {
            filmesMap.set(norm, {
                titulo: f.titulo,
                origem: 'pessoal'
            });
        }
    });

    // 2. Filmes assistidos da sala atual
    (roomFilmesAssistidos || []).forEach(f => {
        const norm = normalizarTitulo(f.titulo);
        if (norm && !filmesMap.has(norm)) {
            filmesMap.set(norm, {
                titulo: f.titulo,
                origem: 'sala'
            });
        }
    });

    if (filmesMap.size === 0) {
        watchedList.innerHTML = `
            <div class="watched-empty">
                <i class="fa-solid fa-ghost"></i>
                <p>Nenhum filme assistido ainda.</p>
                <small style="color: var(--text-muted); font-size: 0.8rem; display: block; margin-top: 0.4rem;">
                    Os filmes vencedores ficam salvos no seu perfil e não podem ser repetidos.
                </small>
            </div>`;
        return;
    }

    filmesMap.forEach((info) => {
        const item = document.createElement('div');
        item.className = 'watched-item';
        item.innerHTML = `
            <i class="fa-solid fa-ticket"></i>
            <span class="watched-title-text" title="${escapeHtml(info.titulo)}">${escapeHtml(info.titulo)}</span>
            <span class="watched-badge"><i class="fa-solid fa-check"></i> Assistido</span>
        `;
        watchedList.appendChild(item);
    });
}

// ============================================================
// AÇÕES DE VOTAÇÃO
// ============================================================

/** Registra o voto de um usuário em um filme */
async function registrarVoto(filmeIdx) {
    if (!currentSalaId || !currentUser) return;

    try {
        const salaRef = doc(db, 'salas', currentSalaId);
        const salaSnap = await getDoc(salaRef);
        if (!salaSnap.exists()) return;

        const sala = salaSnap.data();
        if (sala.status !== 'ativa') {
            showToast('A votação não está ativa no momento.', 'warning');
            return;
        }

        // Verifica se já votou
        const meuVotoRef = doc(db, 'salas', currentSalaId, 'votos', currentUser.uid);
        const meuVotoSnap = await getDoc(meuVotoRef);
        if (meuVotoSnap.exists()) {
            showToast('Você já votou nesta rodada!', 'warning');
            return;
        }

        const filmes = [...sala.filmes];
        if (filmeIdx < 0 || filmeIdx >= filmes.length) return;

        // Incrementa votos e adiciona votante ao array do filme
        filmes[filmeIdx].votos = (filmes[filmeIdx].votos || 0) + 1;
        filmes[filmeIdx].votantes = filmes[filmeIdx].votantes || [];
        filmes[filmeIdx].votantes.push({
            userId: currentUser.uid,
            nome: currentUser.displayName,
            email: currentUser.email,
            fotoUrl: currentUser.photoURL || ''
        });

        // Atualiza sala (array de filmes com novo voto)
        await updateDoc(salaRef, { filmes });

        // Registra o voto individual em /votos/{userId}
        await setDoc(meuVotoRef, {
            filmeIdx,
            filmeEscolhido: filmes[filmeIdx].titulo,
            nome: currentUser.displayName,
            email: currentUser.email,
            fotoUrl: currentUser.photoURL || '',
            votadoEm: serverTimestamp()
        });

        showToast(`Voto registrado em "${filmes[filmeIdx].titulo}"! 🎬`, 'success');
    } catch (err) {
        showToast('Erro ao registrar voto. Tente novamente.', 'error');
        console.error(err);
    }
}

// ============================================================
// FORMULÁRIO DE SETUP (Admin inicia rodada)
// ============================================================

setupMoviesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin || !currentSalaId) return;

    const titulos = movieInputs.map(i => i.value.trim()).filter(v => v !== '');
    if (titulos.length !== 3) {
        showToast('Por favor, preencha os 3 filmes!', 'warning');
        return;
    }

    // 1. Verifica se o usuário não digitou o mesmo filme mais de uma vez no formulário
    const titulosNormalizados = titulos.map(t => normalizarTitulo(t));
    const setTitulos = new Set(titulosNormalizados);
    if (setTitulos.size !== titulos.length) {
        showToast('Você sugeriu filmes repetidos nesta rodada! Escolha 3 filmes diferentes.', 'warning');
        return;
    }

    // 2. Coleta TODOS os filmes já assistidos (sala atual + histórico pessoal em todas as salas)
    const todosAssistidos = new Set();

    // Do histórico pessoal do usuário logado (persistente em todas as salas)
    (userFilmesAssistidos || []).forEach(f => {
        const norm = f.tituloNorm || normalizarTitulo(f.titulo);
        if (norm) todosAssistidos.add(norm);
    });

    // Da sala atual
    (roomFilmesAssistidos || []).forEach(f => {
        const norm = normalizarTitulo(f.titulo);
        if (norm) todosAssistidos.add(norm);
    });

    // Busca fresca no Firestore por garantia
    try {
        const userDocRef = doc(db, 'usuarios', currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.filmesAssistidos && Array.isArray(userData.filmesAssistidos)) {
                userData.filmesAssistidos.forEach(f => {
                    const norm = f.tituloNorm || normalizarTitulo(f.titulo);
                    if (norm) todosAssistidos.add(norm);
                });
            }
        }
    } catch (e) {
        console.warn('Aviso ao consultar perfil:', e);
    }

    try {
        const assistidosRef = collection(db, 'salas', currentSalaId, 'assistidos');
        const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const assistSnap = await getDocs(assistidosRef);
        assistSnap.docs.forEach(d => {
            const norm = normalizarTitulo(d.data().titulo);
            if (norm) todosAssistidos.add(norm);
        });
    } catch (e) {
        console.warn('Aviso ao consultar assistidos da sala:', e);
    }

    for (let i = 0; i < titulos.length; i++) {
        const tOriginal = titulos[i];
        const tNorm = titulosNormalizados[i];

        if (todosAssistidos.has(tNorm)) {
            showToast(`O filme "${tOriginal}" já foi assistido anteriormente (você ou sua sala já viram)! Escolha outro.`, 'error', 6000);
            return;
        }
    }

    const submitBtn = setupMoviesForm.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Consultando TMDb e OMDb...';
    }

    try {
        // Busca informações ricas no TMDb e OMDb (em paralelo)
        let filmesDados = [];
        try {
            filmesDados = await Promise.all(titulos.map(t => buscarDadosFilme(t)));
        } catch (apiErr) {
            console.warn('Aviso ao consultar APIs de filmes:', apiErr);
            filmesDados = titulos.map(t => ({ titulo: t, tituloPt: t }));
        }

        const filmes = filmesDados.map((info, idx) => ({
            titulo: titulos[idx],
            tituloPt: info.tituloPt || titulos[idx],
            tituloOriginal: info.tituloOriginal || '',
            ano: info.ano || '',
            sinopse: info.sinopse || '',
            posterUrl: info.posterUrl || '',
            backdropUrl: info.backdropUrl || '',
            generos: info.generos || [],
            duracao: info.duracao || '',
            imdbId: info.imdbId || '',
            imdbRating: info.imdbRating || '',
            rottenTomatoes: info.rottenTomatoes || '',
            metascore: info.metascore || '',
            trailerKey: info.trailerKey || '',
            trailerUrl: info.trailerUrl || '',
            votos: 0,
            votantes: []
        }));

        const salaRef = doc(db, 'salas', currentSalaId);

        // Limpa votos da rodada anterior
        const votosRef = collection(db, 'salas', currentSalaId, 'votos');
        const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const votosSnap = await getDocs(votosRef);
        for (const votoDoc of votosSnap.docs) {
            await deleteDoc(votoDoc.ref);
        }

        await updateDoc(salaRef, { filmes, status: 'ativa' });

        movieInputs.forEach(i => i.value = '');
        showToast('Votação iniciada com sucesso! 🎉', 'success');
    } catch (err) {
        showToast('Erro ao iniciar votação.', 'error');
        console.error(err);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }
    }
});

// ============================================================
// FINALIZAR VOTAÇÃO (Admin)
// ============================================================

finishRoundBtn.addEventListener('click', async () => {
    if (!isAdmin || !currentSalaId) return;

    const salaRef = doc(db, 'salas', currentSalaId);
    const salaSnap = await getDoc(salaRef);
    if (!salaSnap.exists()) return;

    const sala = salaSnap.data();
    const filmes = sala.filmes || [];

    let maxVotos = -1;
    let vencedor = null;
    filmes.forEach(f => {
        if ((f.votos || 0) > maxVotos) {
            maxVotos = f.votos || 0;
            vencedor = f;
        }
    });

    const tituloExibicao = vencedor ? (vencedor.tituloPt || vencedor.titulo) : '';
    const confirmMsg = maxVotos > 0
        ? `Encerrar votação?\nVencedor: "${tituloExibicao}" com ${maxVotos} votos.`
        : `Nenhum voto registrado. O primeiro filme "${filmes[0]?.tituloPt || filmes[0]?.titulo}" será o vencedor padrão.`;

    if (!confirm(confirmMsg)) return;

    if (!vencedor && filmes.length > 0) vencedor = filmes[0];
    if (!vencedor) { showToast('Nenhum filme para finalizar.', 'warning'); return; }

    const tituloFinalVencedor = vencedor.tituloPt || vencedor.titulo;

    try {
        // Adiciona vencedor à sub-coleção de assistidos da sala
        const assistidosRef = collection(db, 'salas', currentSalaId, 'assistidos');
        await addDoc(assistidosRef, {
            titulo: tituloFinalVencedor,
            votos: vencedor.votos || 0,
            votantes: vencedor.votantes || [],
            vencedoraEm: serverTimestamp()
        });

        // Grava no perfil pessoal de cada participante (admin + votantes) que ele já assistiu esse filme
        const infoAssistidoPessoal = {
            titulo: tituloFinalVencedor,
            tituloNorm: normalizarTitulo(tituloFinalVencedor),
            data: new Date().toISOString()
        };

        // 1. Grava no perfil do criador/admin
        try {
            const adminDocRef = doc(db, 'usuarios', currentUser.uid);
            await updateDoc(adminDocRef, {
                filmesAssistidos: arrayUnion(infoAssistidoPessoal)
            });
        } catch (errAdmin) {
            console.warn('Erro ao atualizar assistidos do admin:', errAdmin);
        }

        // 2. Grava no perfil de cada participante que votou na rodada
        try {
            const votosRef = collection(db, 'salas', currentSalaId, 'votos');
            const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
            const votosSnap = await getDocs(votosRef);
            for (const votoDoc of votosSnap.docs) {
                const votanteUid = votoDoc.id;
                if (votanteUid && votanteUid !== currentUser.uid) {
                    try {
                        const votanteDocRef = doc(db, 'usuarios', votanteUid);
                        await updateDoc(votanteDocRef, {
                            filmesAssistidos: arrayUnion(infoAssistidoPessoal)
                        });
                    } catch (errVotante) {
                        console.warn('Aviso ao atualizar perfil do votante:', errVotante);
                    }
                }
            }
        } catch (errVotos) {
            console.warn('Erro ao ler votos para atualizar votantes:', errVotos);
        }

        // Reseta a sala para aguardando nova rodada
        await updateDoc(salaRef, { filmes: [], status: 'aguardando' });

        // Limpa votos individuais
        const votosRef = collection(db, 'salas', currentSalaId, 'votos');
        const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const votosSnap = await getDocs(votosRef);
        for (const votoDoc of votosSnap.docs) {
            await deleteDoc(votoDoc.ref);
        }

        showToast(`Rodada encerrada! "${tituloFinalVencedor}" venceu! 🏆🍿`, 'success', 6000);
    } catch (err) {
        showToast('Erro ao finalizar a votação.', 'error');
        console.error(err);
    }
});

// ============================================================
// CANCELAR VOTAÇÃO (Admin)
// ============================================================

resetAllBtn.addEventListener('click', async () => {
    if (!isAdmin || !currentSalaId) return;
    if (!confirm('Cancelar a rodada ativa? O histórico de assistidos será mantido.')) return;

    try {
        const salaRef = doc(db, 'salas', currentSalaId);
        await updateDoc(salaRef, { filmes: [], status: 'aguardando' });

        const votosRef = collection(db, 'salas', currentSalaId, 'votos');
        const { getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const votosSnap = await getDocs(votosRef);
        for (const votoDoc of votosSnap.docs) {
            await deleteDoc(votoDoc.ref);
        }

        showToast('Votação cancelada. Histórico preservado.', 'info');
    } catch (err) {
        showToast('Erro ao cancelar votação.', 'error');
        console.error(err);
    }
});

// ============================================================
// LOADING
// ============================================================

function showLoading(visible) {
    if (visible) {
        loadingSpinner.classList.remove('hidden');
        setupSection.classList.add('hidden');
        waitingSection.classList.add('hidden');
        votingSection.classList.add('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
}
