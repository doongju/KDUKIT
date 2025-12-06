import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import * as React from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text as RNText,
  StyleSheet,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../firebaseConfig';

const SCHOOL_DOMAIN = '@v.kduniv.ac.kr';

export default function ForgotPasswordScreen() {
  const [studentId, setStudentId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const handleResetPassword = async () => {
    Keyboard.dismiss()
    if (!studentId.trim()) {
      Alert.alert('알림', '학번을 입력해주세요.');
      return;
    }

    setLoading(true);
    const fullEmail = `${studentId.trim()}${SCHOOL_DOMAIN}`;
    console.log('비밀번호 재설정 요청 이메일:', fullEmail);

    try {
      await sendPasswordResetEmail(auth, fullEmail);
      Alert.alert(
        '이메일 발송 성공',
        `${fullEmail}로 비밀번호 재설정 메일을 보냈습니다.\n\n스팸 메일함도 꼭 확인해주세요!`,
        [{ text: '확인', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (e: any) {
      console.log('Reset Password Error:', e);
      let errorMessage = '이메일 발송에 실패했습니다.';
      if (e.code === 'auth/user-not-found') {
        errorMessage = '등록되지 않은 학번입니다.\n회원가입을 먼저 진행해주세요.';
      } else if (e.code === 'auth/invalid-email') {
        errorMessage = '유효하지 않은 이메일 주소입니다.';
      }
      Alert.alert('오류', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            <RNText style={styles.title}>비밀번호 찾기</RNText>
            <RNText style={styles.description}>
              가입하신 학번을 입력하시면,{'\n'}
              비밀번호 재설정 링크를 이메일로 보내드립니다.
            </RNText>

            <View style={styles.inputContainer}>
              <TextInput
                label="학번"
                value={studentId}
                onChangeText={(text) => {
                  // ✨ 입력값에서 숫자(0-9)가 아닌 것은 모두 빈카드로 교체
                  const numericText = text.replace(/[^0-9]/g, '');
                  setStudentId(numericText);
                }}
                maxLength={7} // ✨ 최대 7글자까지만 입력 가능
                keyboardType="number-pad"
                autoCapitalize="none"
                style={styles.input}
                mode="outlined"
                outlineColor="transparent"
                activeOutlineColor="#0062ffff"
                textColor="#000000" // ✨ 요청하신 글자색 고정
                theme={{ colors: { onSurfaceVariant: '#888888' } }} // 라벨 색상
              />
              <RNText style={styles.domainText}>{SCHOOL_DOMAIN}</RNText>
            </View>

            <Button
              mode="contained"
              onPress={handleResetPassword}
              loading={loading}
              style={styles.button}
              buttonColor="#0062ffff"
              textColor="#fff"
              labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
            >
              재설정 이메일 보내기
            </Button>

            <Button
              mode="text"
              onPress={() => router.replace('/(auth)/login')}
              style={styles.backButton}
              textColor="#666"
            >
              로그인으로 돌아가기
            </Button>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 30,
    // ✨ 화면 중앙(center) 대신 위쪽(flex-start)으로 배치하고
    // 위쪽에 여백(paddingTop)을 주어 요소를 위로 올림
    justifyContent: 'flex-start', 
    paddingTop: 80, 
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0062ffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  input: {
    flex: 1,
    backgroundColor: '#f2f3f7',
    fontSize: 16,
  },
  domainText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#555',
    fontWeight: '500',
  },
  button: {
    borderRadius: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  backButton: {
    marginTop: 10,
  },
});