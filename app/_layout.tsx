import { Stack } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { auth } from '../firebaseConfig';

export default function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // onAuthStateChanged 리스너를 설정하여 로그인 상태를 추적
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setIsAuthLoading(false);
    });

    // 컴포넌트 언마운트 시 리스너 해제
    return () => unsubscribe();
  }, []);

  // 인증 상태를 확인하는 동안 로딩 화면을 표시
  if (isAuthLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ff8a3d" />
      </View>
    );
  }

  // user 상태에 따라 렌더링할 Stack 컴포넌트 정의
  return (
    <Stack>
      {user ? (
        // 사용자가 로그인되어 있으면 (tabs) 그룹을 보여줌
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      ) : (
        // 사용자가 로그인되어 있지 않으면 (auth) 그룹을 보여줌
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      )}
      {/* 404 페이지도 명시적으로 여기에 포함시키는 것이 좋습니다. */}
      <Stack.Screen name="+not-found" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});