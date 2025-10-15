// app/(auth)/_layout.tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // ✨ 이 그룹 내의 모든 화면 헤더를 숨김
        // 아래의 다른 헤더 관련 옵션들은 headerShown: false 일 때는 적용되지 않습니다.
        // headerTitleAlign: 'center', 
        // headerBackTitle: '', 
        // headerTintColor: 'black', 
        // headerStyle: { backgroundColor: 'white' },
      }}
    >
      {/* 각 Stack.Screen에서는 개별적으로 headerShown: true 로 재정의할 수 있습니다. */}
      {/* 하지만 모든 헤더를 숨기려면 여기서 headerShown: false 를 유지하는 것이 가장 좋습니다. */}
      <Stack.Screen name="index" options={{ /* headerShown: false 는 기본으로 적용 */ }} />
      <Stack.Screen name="login" options={{ /* headerShown: false 는 기본으로 적용 */ }} />
      <Stack.Screen name="SignupScreen" options={{ /* headerShown: false 는 기본으로 적용 */ }} />
    </Stack>
  );
}