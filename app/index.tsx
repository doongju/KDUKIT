import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

// ✨ 앱이 켜지자마자 바로 로그인 화면으로 이동시킵니다.
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // 컴포넌트가 마운트되면 즉시 로그인 화면으로 이동
    // setTimeout 없이 즉시 실행하여 깜빡임을 최소화합니다.
    router.replace('/(auth)/login');
  }, []);

  return <View />; // 이동하는 동안 빈 화면 표시
}