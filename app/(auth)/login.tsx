import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import * as React from 'react';
import {
  Alert,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text as RNText,
  StyleSheet,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { Button, Switch, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../firebaseConfig';
import { registerForPushNotificationsAsync } from '../../utils/registerForPushNotificationsAsync';

const SCHOOL_DOMAIN = '@v.kduniv.ac.kr';
const STORAGE_KEY_ID = 'SAVED_STUDENT_ID'; 
const STORAGE_KEY_AUTO_LOGIN = 'AUTO_LOGIN_ENABLED'; 

const BACKGROUND_IMAGE = require('../../assets/images/login-bg.jpg');

export default function LoginScreen() {
  const [studentId, setStudentId] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [rememberId, setRememberId] = React.useState(false); 

  const router = useRouter();

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedId = await AsyncStorage.getItem(STORAGE_KEY_ID);
        if (savedId) {
          setStudentId(savedId);
        }
        
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
      const userCredential = await signInWithEmailAndPassword(auth, fullEmail, pw);
      
      try {
         const user = userCredential.user;
         const token = await registerForPushNotificationsAsync();
         if (token) {
            await updateDoc(doc(db, "users", user.uid), {
                pushToken: token
            });
            console.log("✅ 로그인 토큰 저장 완료");
         }
      } catch (tokenError) {
         console.log("⚠️ 토큰 저장 실패 (로그인은 성공):", tokenError);
      }

      if (rememberId) {
        await AsyncStorage.setItem(STORAGE_KEY_ID, studentId.trim());
        await AsyncStorage.setItem(STORAGE_KEY_AUTO_LOGIN, 'true');
      } else {
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
    <ImageBackground
        source={BACKGROUND_IMAGE}
        style={styles.background}
        blurRadius={1}
    >
        <StatusBar style="dark" />
        <View style={styles.overlay}>
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingView}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                
                    <SafeAreaView style={styles.safeArea}>
                        <View style={styles.contentContainer}>
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
                                        underlineColor="transparent" 
                                        activeUnderlineColor="transparent"
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
                                    // ✨ 투명 밑줄 속성 제거 -> 기본 스타일로 복귀
                                />

                                <View style={styles.autoLoginContainer}>
                                    <RNText style={styles.autoLoginText}>자동 로그인</RNText>
                                    <Switch
                                        value={rememberId}
                                        onValueChange={setRememberId}
                                        color="#0062ffff"
                                    />
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

                                <Button
                                  mode="text"
                                  onPress={() => router.push('/(auth)/ForgotPasswordScreen')}
                                  style={{ marginTop: 5 }} // 간격 조절
                                  textColor="#555" // 회원가입보다 덜 강조되게 회색 계열 사용
                                  labelStyle={{ fontSize: 14, fontWeight: '500' }}
                                >
                                  비밀번호를 잊으셨나요? 비밀번호 찾기
                                </Button>
                            </View>
                        </View>
                    </SafeAreaView>
                
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
        </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  contentContainer: {
    width: '100%',
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
  // ✨ 스타일 원상 복구 (처음 주셨던 코드의 스타일)
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
  // ✨ 비밀번호 입력창 스타일 원상 복구
  input: {
    marginBottom: 10,
    backgroundColor: '#f2f3f7',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderRadius: 8,
  },
  autoLoginContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  autoLoginText: {
    fontSize: 16,
    color: '#444',
    fontWeight: '600',
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