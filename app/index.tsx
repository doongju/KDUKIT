import { useRouter } from 'expo-router';
import * as React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper'; // ActivityIndicator 추가

export default function WelcomeScreen() {
  const router = useRouter();
  // 1. 로딩 상태 관리 (처음에는 true)
  const [isLoading, setIsLoading] = React.useState(true);

  // 2. 컴포넌트가 마운트되면 타이머 시작
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false); // 2초 뒤 로딩 해제
    }, 2000);

    // 화면이 사라질 때 타이머 정리 (메모리 누수 방지)
    return () => clearTimeout(timer);
  }, []);

  // 3. 로딩 중일 때 보여줄 화면
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        {/* 로딩 중에도 로고를 보여주거나, 스피너만 보여줄 수 있습니다 */}
        <Text style={styles.title}>KDU KIT.</Text>
        <Text style={styles.subtitle}>편리한 경동대 생활 도우미</Text>
      </View>
    );
  }

  // 4. 로딩이 끝나면 보여줄 기존 화면 (기존 코드 그대로)
  return (
    <ImageBackground
      source={{ uri: 'https://www.kduniv.ac.kr/attach/IMAGE/mimban/TMPL00/2021/9/GfnCrGlJ8SfmAPFIgpT5.jpg' }}
      style={styles.background}
      blurRadius={2}
    >
      <View style={styles.overlay}>
        <Text style={styles.title}>KDU KIT.</Text>
        <Button
          mode="contained"
          style={styles.button}
          labelStyle={{ fontSize: 17, fontWeight: 'bold' }}
          buttonColor="#0062ffff"
          textColor="#fff"
          onPress={() => {
            router.push('/(auth)/login');
          }}
        >
          로그인
        </Button>
        <Button
          mode="text"
          style={styles.signupButton}
          labelStyle={{ fontSize: 15 }}
          textColor="#0062ffff"
          onPress={() => {
            router.push('/(auth)/SignupScreen');
          }}
        >
          회원가입
        </Button>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // ... 기존 스타일 유지 ...
  background: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0062ffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#333',
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    width: '80%',
    paddingVertical: 8,
    borderRadius: 10,
    elevation: 2,
    marginBottom: 10,
  },
  signupButton: {
    marginTop: 10,
  },
  // ✨ 로딩 화면 전용 스타일 추가
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff', // 깔끔한 흰색 배경
  },
});