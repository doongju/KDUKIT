// app/(auth)/_layout.tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: '로그인' }} />
      <Stack.Screen name="SignupScreen" options={{ title: '회원가입' }} />
    </Stack>
  );
}