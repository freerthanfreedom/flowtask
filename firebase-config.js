// =========================================================
//  Firebase 설정 파일
//  ⚠️ 아래 firebaseConfig 값을 본인의 Firebase 프로젝트 설정으로
//     교체하세요. Firebase Console → 프로젝트 설정 → 웹 앱에서
//     확인할 수 있습니다.
// =========================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBdcwSJQnNsQ2-TSROammGpNZgT_8q2IS0",
    authDomain: "flowtask-8fbab.firebaseapp.com",
    projectId: "flowtask-8fbab",
    storageBucket: "flowtask-8fbab.firebasestorage.app",
    messagingSenderId: "468064753730",
    appId: "1:468064753730:web:19a2c7cf10c5d3f0eeb5db"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firestore
export const db = getFirestore(app);
