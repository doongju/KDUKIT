import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ⚠️ 본인의 Firebase 프로젝트 설정 값을 여기에 넣으세요!
const firebaseConfig = {
  apiKey: "AIzaSyABf5Q8t1WcS3tNq6JRRjToC7NhayYJfko",
  authDomain: "kdukit.firebaseapp.com",
  projectId: "kdukit",
  storageBucket: "kdukit.firebasestorage.app",
  messagingSenderId: "330967436271",
  appId: "1:330967436271:web:ca013c5d06786e7a5e441a",
  measurementId: "G-T20FGPNNQL"
};

// 이미 Firebase 앱이 초기화되어 있으면 기존 앱을 사용하고, 아니면 새로 초기화합니다.
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);

// auth, db, storage를 한 번에 내보냅니다.
// export { auth, db, storage };