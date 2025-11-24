// app/index.tsx

import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import * as React from 'react';
import { ActivityIndicator, ImageBackground, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

export default function WelcomeScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [isSplash, setIsSplash] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        // ✨ [수정됨] 로그인 상태면 메인(explore)으로 이동
        router.replace('/(tabs)/explore');
      } else {
        // 로그인 안 되어 있으면 버튼 보여주기
        setIsSplash(false);
      }
    }, 2000); 

    return () => clearTimeout(timer);
  }, [user]);

  // 1. 스플래시 화면
  if (isSplash) {
    return (
       <ImageBackground
        source={{ uri: 'https://www.kduniv.ac.kr/attach/IMAGE/mimban/TMPL00/2021/9/GfnCrGlJ8SfmAPFIgpT5.jpg' }}
        style={styles.background}
        blurRadius={2}
      >
        <View style={styles.overlay}>
            <Text style={styles.title}>KDU KIT.</Text>
            <Text style={styles.subtitle}>편리한 경동대 생활 도우미</Text>
            <ActivityIndicator size="large" color="#0062ffff" style={{marginTop: 20}} />
        </View>
      </ImageBackground>
    );
  }

  // 2. 버튼 화면
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
});