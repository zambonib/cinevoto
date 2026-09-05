// ============================================================
//  CineVoto 2.0 — Configuração do Firebase (Exemplo / Template)
//  
//  INSTRUÇÕES:
//  1. Crie uma cópia deste arquivo com o nome: firebase-config.js
//     (na mesma pasta web/)
//  2. Substitua os valores abaixo pelas credenciais do seu projeto Firebase.
//  3. O arquivo 'firebase-config.js' está no .gitignore para segurança.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Substitua com as credenciais do seu console Firebase:
// Firebase Console -> Configurações do Projeto -> Geral -> Seus Aplicativos -> Web
const firebaseConfig = {
    apiKey: "SUA_API_KEY_AQUI",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    projectId: "SEU_PROJECT_ID",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "SEU_MESSAGING_SENDER_ID",
    appId: "SEU_APP_ID"
};

// Inicialização dos serviços
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
