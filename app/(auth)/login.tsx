import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import * as React from 'react';
import {
  Alert,
  ImageBackground,
  Keyboard,
  Text as RNText,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { Button, Checkbox, TextInput } from 'react-native-paper';
import { auth } from '../../firebaseConfig';

const SCHOOL_DOMAIN = '@v.kduniv.ac.kr';
const STORAGE_KEY_ID = 'SAVED_STUDENT_ID'; // 학번 저장 키
const STORAGE_KEY_AUTO_LOGIN = 'AUTO_LOGIN_ENABLED'; // ✨ 자동 로그인 여부 저장 키

const BACKGROUND_IMAGE_URL = 'https://www.kduniv.ac.kr/attach/IMAGE/mimban/TMPL00/2021/9/GfnCrGlJ8SfmAPFIgpT5.jpg';

export default function LoginScreen() {
  const [studentId, setStudentId] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [rememberId, setRememberId] = React.useState(false); // '자동 로그인' 체크 상태

  const router = useRouter();

  // 화면이 처음 켜질 때 저장된 설정 불러오기
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        // 1. 저장된 학번 불러오기
        const savedId = await AsyncStorage.getItem(STORAGE_KEY_ID);
        if (savedId) {
          setStudentId(savedId);
        }
        
        // 2. 자동 로그인 설정 불러오기 (기본값 false)
        const autoLogin = await AsyncStorage.getItem(STORAGE_KEY_AUTO_LOGIN);
        if (autoLogin === 'true') {
            setRememberId(true);
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    };
    loadSettings();
  }, []);

  const handleLogin = async () => {
    if (!studentId.trim()) {
        Alert.alert('알림', '학번을 입력해주세요.');
        return;
    }
    if (!pw.trim()) {
        Alert.alert('알림', '비밀번호를 입력해주세요.');
        return;
    }

    setLoading(true);
    Keyboard.dismiss(); 
    
    const fullEmail = `${studentId.trim()}${SCHOOL_DOMAIN}`;

    try {
      await signInWithEmailAndPassword(auth, fullEmail, pw);
      
      // ✨ 로그인 성공 시 설정 저장 로직
      if (rememberId) {
        // 체크됨: 학번 저장 & 자동 로그인 활성화 (true)
        await AsyncStorage.setItem(STORAGE_KEY_ID, studentId.trim());
        await AsyncStorage.setItem(STORAGE_KEY_AUTO_LOGIN, 'true');
      } else {
        // 체크 해제됨: 학번 삭제 & 자동 로그인 비활성화 (false)
        await AsyncStorage.removeItem(STORAGE_KEY_ID);
        await AsyncStorage.setItem(STORAGE_KEY_AUTO_LOGIN, 'false');
      }

      router.replace('/(tabs)/explore');
    } catch (e: any) {
      let errorMessage = '로그인 실패';
      if (e.code === 'auth/invalid-email') {
          errorMessage = '잘못된 이메일 형식입니다.';
      } else if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
          errorMessage = '학번 또는 비밀번호가 잘못되었습니다.';
      } else {
          errorMessage = e.message;
      }
      Alert.alert('로그인 실패', errorMessage);
    }
    setLoading(false);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ImageBackground
        source={{ uri: BACKGROUND_IMAGE_URL }}
        style={styles.background}
        blurRadius={3}
      >
        <View style={styles.overlay}>
          <RNText style={styles.mainTitle}>KDU KIT.</RNText>
          <RNText style={styles.subTitle}>편리한 경동대 생활 도우미</RNText>

          <View style={styles.formContainer}>
            <View style={styles.emailInputContainer}>
                <TextInput
                    label="학번"
                    value={studentId}
                    onChangeText={setStudentId}
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    style={styles.studentIdInput}
                    textColor="#000000"
                    theme={{ colors: { onSurfaceVariant: '#888888' } }}
                />
                <View style={styles.domainContainer}>
                    <RNText style={styles.domainText}>{SCHOOL_DOMAIN}</RNText>
                </View>
            </View>

            <TextInput
              label="비밀번호"
              value={pw}
              onChangeText={setPw}
              secureTextEntry
              style={styles.input}
              textColor="#000000"
              theme={{ colors: { onSurfaceVariant: '#888888' } }}
            />

            {/* ✨ 자동 로그인 체크박스 */}
            <View style={styles.checkboxContainer}>
              <TouchableOpacity 
                style={styles.checkboxRow} 
                onPress={() => setRememberId(!rememberId)}
              >
                <Checkbox
                  status={rememberId ? 'checked' : 'unchecked'}
                  onPress={() => setRememberId(!rememberId)}
                  color="#0062ffff"
                />
                <RNText style={styles.checkboxLabel}>자동 로그인 (아이디 기억하기)</RNText>
              </TouchableOpacity>
            </View>
            
            <Button
              mode="contained"
              onPress={handleLogin}
              loading={loading}
              style={styles.loginButton}
              contentStyle={{ height: 50 }}
              labelStyle={{ fontSize: 18, fontWeight: 'bold' }}
              buttonColor="#0062ffff"
              textColor="#fff"
            >
              로그인
            </Button>

            <Button
              mode="text"
              onPress={() => router.push('/(auth)/SignupScreen')}
              style={{ marginTop: 15 }}
              textColor="#0062ffff"
              labelStyle={{ fontSize: 16, fontWeight: '600' }}
            >
              계정이 없으신가요? 회원가입
            </Button>
          </View>
        </View>
      </ImageBackground>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  mainTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#0062ffff',
    textAlign: 'center',
    marginBottom: 5,
  },
  subTitle: {
    fontSize: 18,
    color: '#555',
    textAlign: 'center',
    marginBottom: 40,
    fontWeight: '600',
  },
  formContainer: {
    width: '100%',
  },
  emailInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: '#f2f3f7',
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  },
  studentIdInput: {
    flex: 1,
    backgroundColor: 'transparent',
    height: 56,
    fontSize: 16,
  },
  domainContainer: {
    justifyContent: 'center',
    paddingRight: 15,
    height: 56,
    backgroundColor: 'transparent',
  },
  domainText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
    paddingTop: 16,
  },
  input: {
    marginBottom: 10,
    backgroundColor: '#f2f3f7',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderRadius: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 20,
    marginLeft: -5,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#444',
    fontWeight: '500',
  },
  loginButton: {
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});