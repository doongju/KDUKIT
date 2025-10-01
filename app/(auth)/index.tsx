import { useRouter } from 'expo-router';
import * as React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ImageBackground
      source={{ uri: 'https://www.kduniv.ac.kr/attach/IMAGE/mimban/TMPL00/2021/9/GfnCrGlJ8SfmAPFIgpT5.jpg' }}
      style={styles.background}
      blurRadius={2}
    >
      <View style={styles.overlay}>
        <Text style={styles.title}>환영합니다!</Text>
        <Text style={styles.subtitle}>우리 앱에 오신 것을 환영해요.</Text>
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
});