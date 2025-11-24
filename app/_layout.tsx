import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, User } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';

export default function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  // 1. Firebase 인증 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (initializing) setInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. 네비게이션 가드 (로그인/로그아웃 감지 및 납치)
  useEffect(() => {
    // 네비게이션이나 인증이 아직 로딩 중이면 스톱
    if (initializing || !navigationState?.key) return;

    // ✨ [핵심 수정] .length 대신 안전하게 첫 번째 경로만 확인합니다.
    // segments가 없거나 빈 배열([])이면 rootSegment는 undefined가 됩니다.
    const rootSegment = segments?.[0]; 

    if (user) {
      // [로그인 상태]
      // 현재 위치가 로그인 화면(auth)이거나, 첫 화면(undefined)이라면 -> 메인으로 이동
      if (rootSegment === '(auth)' || !rootSegment) {
        router.replace('/(tabs)/explore');
      }
    } else {
      // [비로그인 상태]
      // 현재 위치가 메인(tabs), 채팅(chat), 프로필(profile)이라면 -> 첫 화면으로 쫓아냄
      // (index 화면은 허용)
      if (rootSegment === '(tabs)' || rootSegment === 'chat' || rootSegment === 'profile') {
        router.replace('/');
      }
    }
  }, [user, initializing, segments, navigationState?.key]);

  // 로딩 중 화면
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
        <Stack.Screen name="profile" />
        <Stack.Screen name="+not-found" />
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