import { useRouter } from 'expo-router'; // useRouter 임포트
import { signInWithEmailAndPassword } from 'firebase/auth';
import * as React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { auth } from '../../firebaseConfig';

export default function LoginScreen() {
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const router = useRouter(); // useRouter 초기화

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      // Alert.alert('로그인 성공', '환영합니다!'); // Alert 대신
      router.replace('/(tabs)/explore'); // 메인 화면으로 이동
    } catch (e: any) {
      Alert.alert('로그인 실패', e.message);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>로그인</Text>
      <TextInput
        label="이메일"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        label="비밀번호"
        value={pw}
        onChangeText={setPw}
        secureTextEntry
        style={styles.input}
      />
      <Button
        mode="contained"
        onPress={handleLogin}
        loading={loading}
        style={styles.button}
        buttonColor="#0062ffff"
        textColor="#fff"
      >
        로그인
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0062ffff',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    marginBottom: 18,
    backgroundColor: '#f2f3f7',
  },
  button: {
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 6,
  },
});