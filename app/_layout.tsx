// app/_layout.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
// ✨ [필수] 키보드 컨트롤러 라이브러리 import
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';

const STORAGE_KEY_AUTO_LOGIN = 'AUTO_LOGIN_ENABLED';

export default function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  
  const isFirstCheck = useRef(true);

  // 1. Firebase 인증 상태 감지 (기존 로직 유지)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (isFirstCheck.current) {
        isFirstCheck.current = false;
        if (currentUser) {
          try {
            const autoLogin = await AsyncStorage.getItem(STORAGE_KEY_AUTO_LOGIN);
            if (autoLogin !== 'true') {
              await signOut(auth);
              setUser(null);
            } else {
              setUser(currentUser);
            }
          } catch (e) {
            await signOut(auth);
            setUser(null);
          }
        } else {
          setUser(null);
        }
        setInitializing(false);
      } else {
        setUser(currentUser);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. 네비게이션 가드 (기존 로직 유지)
  useEffect(() => {
    if (initializing || !navigationState?.key) return;

    const rootSegment = segments?.[0];

    if (user) {
      if (rootSegment === '(auth)' || !rootSegment) {
        router.replace('/(tabs)/explore');
      }
    } else {
      if (rootSegment === '(tabs)' || rootSegment === 'chat' || rootSegment === 'profile') {
        router.replace('/(auth)/login');
      }
    }
  }, [user, initializing, segments, navigationState?.key]);

  if (initializing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0062ffff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* ✨ [핵심 수정] 앱 전체를 KeyboardProvider로 감싸줍니다. 
          statusBarTranslucent: 안드로이드에서 투명 상태바 대응을 위해 켜줍니다.
      */}
      <KeyboardProvider statusBarTranslucent>
        <StatusBar style={user ? "dark" : "light"} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" /> 
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat" />
        </Stack>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});