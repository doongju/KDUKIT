import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
// ✨ initializeAuth, getReactNativePersistence 그대로 사용
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
// ✨ [수정] getFirestore 대신 initializeFirestore를 가져옵니다
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ⚠️ 본인의 Firebase 프로젝트 설정 값 (그대로 유지)
const firebaseConfig = {
  apiKey: "AIzaSyABf5Q8t1WcS3tNq6JRRjToC7NhayYJfko",
  authDomain: "kdukit.firebaseapp.com",
  projectId: "kdukit",
  storageBucket: "kdukit.firebasestorage.app",
  messagingSenderId: "330967436271",
  appId: "1:330967436271:web:ca013c5d06786e7a5e441a",
  measurementId: "G-T20FGPNNQL"
};

// 앱 초기화
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// 인증 초기화 (AsyncStorage 사용 - 기존 유지)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// ✨ [핵심 수정] 데이터베이스 초기화 설정 변경
// getFirestore(app) 대신 아래 코드를 사용해야 React Native에서 렉이 안 걸립니다.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, // 🚀 이게 속도 해결의 열쇠입니다!
  ignoreUndefinedProperties: true,    // (선택) undefined 값 무시하여 에러 방지
});

// 스토리지 초기화
export const storage = getStorage(app);