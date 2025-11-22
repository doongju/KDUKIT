import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import * as React from 'react';
import {
  Alert,
  Keyboard,
  StyleSheet,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { auth } from '../../firebaseConfig';

export default function LoginScreen() {
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    Keyboard.dismiss(); 
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      router.replace('/(tabs)/explore');
    } catch (e: any) {
      Alert.alert('로그인 실패', e.message);
    }
    setLoading(false);
  };

  return (
    // 화면 빈 곳 터치 시 키보드 내리기
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <Text style={styles.title}>로그인</Text>
        <TextInput
          label="이메일"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          textColor="#000000"
          theme={{ colors: { onSurfaceVariant: '#888888' } }}
        />
        <TextInput
          label="비밀번호"
          value={pw}
          onChangeText={setPw}
          secureTextEntry
          style={styles.input}
          textColor="#000000"
          theme={{ colors: { onSurfaceVariant: '#888888' } }}
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
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    
    // ✨ 변경된 부분: 중앙 정렬을 풀고 위쪽 여백을 줍니다.
    // justifyContent: 'center',  <-- 이걸 지웁니다.
    justifyContent: 'flex-start', // 위쪽부터 배치
    paddingTop: 195, // 위에서 140px 만큼 내려온 곳에 위치 (수치를 조절해서 높이 맞추세요)
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