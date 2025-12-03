import AsyncStorage from '@react-native-async-storage/async-storage';
// ✨ [추가] 알림 라이브러리 (에러 방지를 위해 * as 사용)
import * as Notifications from 'expo-notifications';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
// ✨ [수정] React Hook 에러 방지를 위한 import
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';

const STORAGE_KEY_AUTO_LOGIN = 'AUTO_LOGIN_ENABLED';

// ✨ [추가] 알림 핸들러 (문법 에러 방지용 return 명시)
// @ts-ignore
Notifications.setNotificationHandler({
  handleNotification: async () => {
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
}as any);

export default function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  
  // 친구 코드: 앱 실행 감지 변수
  const isFirstCheck = useRef(true);
  
  // ✨ [추가] 알림 리스너 변수 (any 타입 + null 초기화로 에러 방지)
  const responseListener = useRef<any>(null);

  // 1. Firebase 인증 상태 감지
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

  // 2. 네비게이션 가드
  useEffect(() => {
    if (initializing || !navigationState?.key) return;
    
    // ✨ segments가 준비되지 않았을 때 에러 방지
    if (!segments || !Array.isArray(segments)) return;

    const rootSegment = segments[0];
    
    if (user) {

      // 로그인 됨 -> 메인으로 이동

      if (rootSegment === '(auth)' || !rootSegment) {
        router.replace('/(tabs)/explore');
      }
    } else {
      if (rootSegment === '(tabs)' || rootSegment === 'chat' || rootSegment === 'profile') {
        router.replace('/(auth)/login');
      }
    }
  }, [user, initializing, segments, navigationState?.key]);

  // ✨ [추가] 3. 알림 클릭 리스너 (우리가 만든 기능)
  useEffect(() => {
    // 사용자가 알림을 '클릭'했을 때 실행
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      // any로 변환하여 데이터 타입 에러 방지
      const data = response.notification.request.content.data as any;
      
      if (data && data.url) {
        console.log("👉 알림 클릭! 이동:", data.url);
        router.push(data.url);
      }
    });

    return () => {
      // 리스너 제거 (최신 방식인 .remove() 사용 -> 에러 해결)
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  if (initializing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0062ffff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider statusBarTranslucent>
        <StatusBar style={user ? "dark" : "light"} />
        
        <Stack screenOptions={{ headerShown: false }}>
          {/* 기본 화면들 */}
          <Stack.Screen name="index" /> 
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat" />

          {/* ✨ 글쓰기 화면 애니메이션 설정 ✨
            - presentation: 'card' (페이지 스타일)
            - animation: 'slide_from_right' (진입: 우 -> 좌)
            - gestureDirection: 'horizontal' (퇴장: 좌 -> 우) 
              -> 이 옵션이 있어야 뒤로가기 시 들어왔던 방향의 반대로 자연스럽게 나갑니다.
          */}
          
          <Stack.Screen 
            name="create-lost-item" 
            options={{
              presentation: 'card', 
              animation: 'slide_from_right', 
              gestureDirection: 'horizontal', 
              headerShown: false, 
            }}
          />

          <Stack.Screen 
            name="create-market" 
            options={{
              presentation: 'card', 
              animation: 'slide_from_right', 
              gestureDirection: 'horizontal', 
              headerShown: false, 
            }}
          />

          <Stack.Screen 
            name="create-club" 
            options={{
              presentation: 'card', 
              animation: 'slide_from_right', 
              gestureDirection: 'horizontal', 
              headerShown: false, 
            }}
          />
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