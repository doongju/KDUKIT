import { Stack } from 'expo-router';
import React from 'react';
// 1. StatusBar 가져오기
import { StatusBar } from 'expo-status-bar';
// 2. (선택) SafeAreaProvider는 안전 영역 관리를 도와줍니다.
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    // SafeAreaProvider로 감싸주면 앱 전반적으로 안전 영역 계산이 정확해집니다.
    <SafeAreaProvider>
      
      {/* ✨ 핵심: 여기서 style="dark"를 주면 모든 화면에서 시간/배터리가 검은색이 됩니다. */}
      <StatusBar style="dark" />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="+not-found" />
      </Stack>
      
    </SafeAreaProvider>
  );
}