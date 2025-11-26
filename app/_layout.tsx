import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';

const STORAGE_KEY_AUTO_LOGIN = 'AUTO_LOGIN_ENABLED';

export default function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  
  // ✨ [핵심] 앱 실행 후 첫 번째 검사인지 확인하는 변수
  const isFirstCheck = useRef(true);

  // 1. Firebase 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      
      if (isFirstCheck.current) {
        // 🟢 [앱 실행 시 최초 1회만 실행]
        isFirstCheck.current = false;

        if (currentUser) {
          // 로그인 되어 있다면 '자동 로그인 설정'을 확인
          try {
            const autoLogin = await AsyncStorage.getItem(STORAGE_KEY_AUTO_LOGIN);
            if (autoLogin !== 'true') {
              // 설정이 꺼져있으면 -> 과감하게 로그아웃 (앱 껐다 켰을 때 로그인 풀리게 함)
              await signOut(auth);
              setUser(null);
            } else {
              // 설정이 켜져있으면 -> 로그인 유지
              setUser(currentUser);
            }
          } catch (e) {
            await signOut(auth);
            setUser(null);
          }
        } else {
          setUser(null);
        }
        setInitializing(false); // 로딩 끝

      } else {
        // 🟢 [앱 사용 중 로그인/로그아웃 발생 시]
        // 설정 검사 없이 그냥 로그인 상태만 업데이트 (그래야 방금 로그인한 게 안 튕김)
        setUser(currentUser);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. 네비게이션 가드 (납치 로직)
  useEffect(() => {
    if (initializing || !navigationState?.key) return;

    const rootSegment = segments?.[0];

    if (user) {
      // 로그인 됨 -> 메인으로 이동
      // ✨ [수정] 'index' 문자열 비교 제거 ( !rootSegment 가 이미 index 화면을 포함함)
      if (rootSegment === '(auth)' || !rootSegment) {
        router.replace('/(tabs)/explore');
      }
    } else {
      // 로그인 안됨 -> 로그인 화면으로 이동
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
      <StatusBar style={user ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" /> 
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat" />
      </Stack>
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