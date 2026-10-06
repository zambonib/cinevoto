// ============================================================
//  voucher-security.js — Sistema de Voucher e Proteção Anti-Abuso
//  Controle de Acesso por Convite, Rate-Limit de IP e Bloqueio de 72h
// ============================================================

import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Lista de 20 Vouchers Temáticos + Vouchers Padrão Ativos
export const LISTA_VOUCHERS_ATIVOS = [
    "CINE-VIP-2026",
    "POPCORN-2026",
    "ESTREIA-7782",
    "SESSAO-9431",
    "CINE-TOP-5520",
    "TICKET-8819",
    "CLUBE-CINE-34",
    "CINEVOTO-PREM",
    "VIP-SESSAO-10",
    "MAGIC-FILM-99",
    "SUPER-CINE-88",
    "NOITE-FILME-4",
    "CINE-AMIGOS-7",
    "GOLD-PASS-2026",
    "CINEMA-TOP-42",
    "VIP-CINEMA-55",
    "SESSAO-VIP-88",
    "OSCAR-2026-BR",
    "CINE-CLUBE-90",
    "PREVIEW-2026",
    // Vouchers legado / mestres
    "CINEVOTO2026",
    "CINE2026",
    "VIPCINE",
    "CONVITE2026",
    "FAMILIA2026"
];

const VOUCHERS_MESTRES = new Set(LISTA_VOUCHERS_ATIVOS.map(v => v.toUpperCase()));

const STORAGE_LOCK_KEY = "cinevoto_sec_device_lock";
const STORAGE_VOUCHER_KEY = "cinevoto_voucher_verified";

/**
 * Registra os vouchers oficiais na coleção 'vouchers' do Firestore caso ainda não existam
 */
export async function sincronizarVouchersOficiais(db) {
    if (!db) return;
    try {
        for (const codigo of LISTA_VOUCHERS_ATIVOS) {
            const vRef = doc(db, 'vouchers', codigo.toUpperCase());
            const snap = await getDoc(vRef);
            if (!snap.exists()) {
                await setDoc(vRef, {
                    codigo: codigo.toUpperCase(),
                    ativo: true,
                    criadoEm: serverTimestamp(),
                    descricao: 'Voucher Oficial CineVoto'
                });
            }
        }
    } catch (e) {
        // Silencioso se não houver permissão antes de autenticar
    }
}

/**
 * Gera um identificador único de fingerprint do dispositivo
 */
function obterDeviceFingerprint() {
    const raw = `${navigator.userAgent}_${screen.width}x${screen.height}_${navigator.language}_${navigator.hardwareConcurrency || 2}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
    }
    return 'dev_' + Math.abs(hash).toString(36);
}

/**
 * Obtém o IP público do usuário via api externa confiável
 */
export async function obterIpUsuario() {
    try {
        const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data.ip) return data.ip.trim();
        }
    } catch (e) {
        // Fallback para api64
        try {
            const res2 = await fetch('https://api64.ipify.org?format=json', { cache: 'no-store' });
            if (res2.ok) {
                const data2 = await res2.json();
                if (data2.ip) return data2.ip.trim();
            }
        } catch (e2) {
            console.warn('Não foi possível obter IP público, usando identificador de dispositivo.');
        }
    }
    return obterDeviceFingerprint();
}

/**
 * Sanitiza o IP para ser uma chave válida de documento no Firestore
 */
function sanitizarIpId(ip) {
    return String(ip).replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Verifica se o IP ou dispositivo atual está bloqueado
 */
export async function verificarBloqueioIp(ip, db) {
    const agora = Date.now();
    const deviceLockLocal = localStorage.getItem(STORAGE_LOCK_KEY);

    // 1. Checa trava local do dispositivo
    if (deviceLockLocal) {
        try {
            const lockData = JSON.parse(deviceLockLocal);
            if (lockData.permanente) {
                return {
                    bloqueado: true,
                    permanente: true,
                    motivo: "Este computador/celular foi bloqueado permanentemente por excesso de tentativas suspeitas."
                };
            }
            if (lockData.bloqueadoAte && lockData.bloqueadoAte > agora) {
                const msRestantes = lockData.bloqueadoAte - agora;
                const horasRestantes = Math.ceil(msRestantes / (1000 * 60 * 60));
                return {
                    bloqueado: true,
                    permanente: false,
                    horasRestantes,
                    bloqueadoAte: lockData.bloqueadoAte,
                    motivo: `Acesso bloqueado por 72 horas após 3 tentativas inválidas de voucher. Restam aproximadamente ${horasRestantes} hora(s).`
                };
            }
        } catch (err) {
            console.warn('Erro ao ler trava local:', err);
        }
    }

    // 2. Checa trava no banco de dados Firestore (por IP)
    if (db && ip) {
        try {
            const ipId = sanitizarIpId(ip);
            const ipDocRef = doc(db, 'seguranca_ips', ipId);
            const ipSnap = await getDoc(ipDocRef);

            if (ipSnap.exists()) {
                const data = ipSnap.data();

                if (data.bloqueadoPermanente) {
                    // Sincroniza trava local
                    localStorage.setItem(STORAGE_LOCK_KEY, JSON.stringify({ permanente: true }));
                    return {
                        bloqueado: true,
                        permanente: true,
                        motivo: "Seu IP foi bloqueado permanentemente por excesso de tentativas recorrentes de voucher."
                    };
                }

                if (data.bloqueadoAte && data.bloqueadoAte > agora) {
                    const msRestantes = data.bloqueadoAte - agora;
                    const horasRestantes = Math.ceil(msRestantes / (1000 * 60 * 60));
                    // Sincroniza trava local
                    localStorage.setItem(STORAGE_LOCK_KEY, JSON.stringify({
                        bloqueadoAte: data.bloqueadoAte,
                        permanente: false
                    }));
                    return {
                        bloqueado: true,
                        permanente: false,
                        horasRestantes,
                        bloqueadoAte: data.bloqueadoAte,
                        motivo: `Seu IP foi bloqueado temporariamente por 72 horas após 3 tentativas inválidas. Restam aproximadamente ${horasRestantes} hora(s).`
                    };
                }

                return {
                    bloqueado: false,
                    tentativasFalhas: data.tentativasFalhas || 0
                };
            }
        } catch (errDb) {
            console.warn('Erro ao consultar segurança de IP no Firestore:', errDb);
        }
    }

    return { bloqueado: false, tentativasFalhas: 0 };
}

/**
 * Registra uma tentativa com erro e bloqueia se atingir 3
 */
export async function registrarTentativaInvalida(ip, db) {
    const agora = Date.now();
    const ipId = sanitizarIpId(ip);
    let tentativas = 1;
    let bloqueiosRecorrentes = 0;

    if (db && ip) {
        try {
            const ipDocRef = doc(db, 'seguranca_ips', ipId);
            const ipSnap = await getDoc(ipDocRef);
            if (ipSnap.exists()) {
                const data = ipSnap.data();
                tentativas = (data.tentativasFalhas || 0) + 1;
                bloqueiosRecorrentes = data.bloqueiosRecorrentes || 0;
            }
        } catch (e) {
            console.warn('Aviso ao consultar IP:', e);
        }
    }

    // Se atingiu 3 tentativas inválidas
    if (tentativas >= 3) {
        bloqueiosRecorrentes += 1;
        const ehPermanente = bloqueiosRecorrentes >= 2;
        const duracao72h = 72 * 60 * 60 * 1000;
        const bloqueadoAte = agora + duracao72h;

        // Salva trava no Firestore
        if (db && ip) {
            try {
                const ipDocRef = doc(db, 'seguranca_ips', ipId);
                await setDoc(ipDocRef, {
                    ip,
                    tentativasFalhas: 3,
                    bloqueadoAte: ehPermanente ? null : bloqueadoAte,
                    bloqueadoPermanente: ehPermanente,
                    bloqueiosRecorrentes,
                    atualizadoEm: serverTimestamp()
                }, { merge: true });
            } catch (err) {
                console.warn('Erro ao gravar bloqueio:', err);
            }
        }

        // Salva trava no LocalStorage
        localStorage.setItem(STORAGE_LOCK_KEY, JSON.stringify({
            bloqueadoAte: ehPermanente ? null : bloqueadoAte,
            permanente: ehPermanente
        }));

        if (ehPermanente) {
            return {
                bloqueado: true,
                permanente: true,
                mensagem: "❌ 3 tentativas inválidas recorrentes! Seu IP e dispositivo foram bloqueados permanentemente."
            };
        } else {
            return {
                bloqueado: true,
                permanente: false,
                horasRestantes: 72,
                mensagem: "❌ 3 tentativas incorretas atingidas! Seu IP foi bloqueado por 72 horas para segurança da plataforma."
            };
        }
    }

    // Ainda tem tentativas restantes
    if (db && ip) {
        try {
            const ipDocRef = doc(db, 'seguranca_ips', ipId);
            await setDoc(ipDocRef, {
                ip,
                tentativasFalhas: tentativas,
                atualizadoEm: serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn('Aviso ao atualizar falha:', e);
        }
    }

    const restantes = 3 - tentativas;
    return {
        bloqueado: false,
        tentativasFalhas: tentativas,
        tentativasRestantes: restantes,
        mensagem: `Código de voucher inválido! Você tem mais ${restantes} tentativa(s) antes do bloqueio de 72 horas.`
    };
}

/**
 * Valida o código do voucher digitado pelo usuário
 */
export async function validarVoucher(codigoVoucher, ip, user, db) {
    if (!codigoVoucher) {
        return { valido: false, mensagem: "Por favor, digite o código do voucher." };
    }

    const codigoNorm = codigoVoucher.trim().toUpperCase();

    // 1. Verifica se o IP está bloqueado antes de validar
    const statusBloqueio = await verificarBloqueioIp(ip, db);
    if (statusBloqueio.bloqueado) {
        return { valido: false, bloqueado: true, mensagem: statusBloqueio.motivo };
    }

    let voucherValido = false;

    // 2. Checa contra os vouchers mestres
    if (VOUCHERS_MESTRES.has(codigoNorm)) {
        voucherValido = true;
    }

    // 3. Checa na coleção 'vouchers' do Firestore
    if (!voucherValido && db) {
        try {
            const voucherDocRef = doc(db, 'vouchers', codigoNorm);
            const voucherSnap = await getDoc(voucherDocRef);
            if (voucherSnap.exists()) {
                const vData = voucherSnap.data();
                if (vData.ativo !== false) {
                    voucherValido = true;
                }
            }
        } catch (err) {
            console.warn('Aviso ao consultar voucher no Firestore:', err);
        }
    }

    // SE VOUCHER INVÁLIDO -> Registra falha e aplica trava de 3 tentativas
    if (!voucherValido) {
        const resultadoFalha = await registrarTentativaInvalida(ip, db);
        return {
            valido: false,
            bloqueado: resultadoFalha.bloqueado,
            mensagem: resultadoFalha.mensagem,
            tentativasRestantes: resultadoFalha.tentativasRestantes
        };
    }

    // SE VOUCHER VÁLIDO -> Reseta falhas e libera acesso permanente
    if (db && ip) {
        try {
            const ipDocRef = doc(db, 'seguranca_ips', sanitizarIpId(ip));
            await setDoc(ipDocRef, {
                ip,
                tentativasFalhas: 0,
                atualizadoEm: serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn('Aviso ao resetar falhas:', e);
        }
    }
    localStorage.removeItem(STORAGE_LOCK_KEY);
    localStorage.setItem(STORAGE_VOUCHER_KEY, codigoNorm);

    // Salva no perfil do usuário no Firestore
    if (db && user) {
        try {
            const userDocRef = doc(db, 'usuarios', user.uid);
            await setDoc(userDocRef, {
                voucherAtivo: true,
                voucherCodigo: codigoNorm,
                voucherValidadoEm: serverTimestamp()
            }, { merge: true });
        } catch (err) {
            console.warn('Aviso ao salvar voucher no perfil do usuário:', err);
        }
    }

    return {
        valido: true,
        mensagem: "Voucher validado com sucesso! Acesso liberado ao CineVoto. 🎉"
    };
}

/**
 * Verifica se o usuário atual já está liberado por voucher.
 * Usuários que já possuem conta prévia no sistema são liberados automaticamente
 * sem necessidade de digitar voucher.
 * Apenas usuários novos (sem documento anterior em /usuarios) precisam inserir voucher no 1º acesso.
 */
export async function usuarioTemVoucherAtivo(user, db) {
    if (localStorage.getItem(STORAGE_VOUCHER_KEY)) {
        return true;
    }
    if (db && user) {
        try {
            const userDocRef = doc(db, 'usuarios', user.uid);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.voucherAtivo === true) {
                    localStorage.setItem(STORAGE_VOUCHER_KEY, data.voucherCodigo || 'VERIFIED');
                    return true;
                }

                // Usuário pré-existente (já tinha conta antes):
                // Configura automaticamente o voucher para ele nunca precisar digitar!
                try {
                    await setDoc(userDocRef, {
                        voucherAtivo: true,
                        voucherCodigo: 'MEMBRO_FUNDADOR',
                        voucherValidadoEm: serverTimestamp()
                    }, { merge: true });
                } catch (saveErr) {
                    console.warn('Aviso ao registrar voucher automático no perfil pré-existente:', saveErr);
                }

                localStorage.setItem(STORAGE_VOUCHER_KEY, 'MEMBRO_FUNDADOR');
                return true;
            }
        } catch (e) {
            console.warn('Erro ao consultar status de voucher do usuário:', e);
        }
    }
    return false;
}
