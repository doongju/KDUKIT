import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

const DEPARTMENTS = [
    '학과 선택', 
    '건설시스템공학과',
    '건축공학과',
    '건축디자인학과',
    '경영학과',
    '경찰학과',
    '국제융합학부',
    '군사학과',
    '디자인학과',
    '보건행정학과',
    '사회복지학과',
    '소프트웨어융합보안학과',
    '스포츠마케팅학과',
    '외식사업학과',
    '유아교육과 * 사범계열',
    '체육학과',
    '컴퓨터공학과',
    '항공서비스학과',
    '행정학과',
    '호텔관광경영학과',
    '호텔조리학과',
];

const SCHOOL_DOMAIN = '@v.kduniv.ac.kr';
const RESEND_TIME_SECONDS = 300;

export default function SignupScreen() {
  const [emailId, setEmailId] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState(DEPARTMENTS[0]);
  const [verificationCode, setVerificationCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [name, setName] = useState("");
  
  const [nickname, setNickname] = useState("");

  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0); 
  
  const [showIosPicker, setShowIosPicker] = useState(false);

  const router = useRouter();

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null; 
    if (codeSent && resendTimer > 0) {
      timerId = setTimeout(() => {
        setResendTimer(resendTimer - 1);
      }, 1000);
    } else if (resendTimer === 0 && codeSent) {
      setCodeSent(false);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [codeSent, resendTimer]);

  const validateInitialInputs = () => {
    const nameRegex = /^[가-힣\s]{1,}$/; 
    if (!nameRegex.test(name) || name.trim().length === 0) {
        Alert.alert("오류", "이름은 한글만 입력 가능하며 공백이 아니어야 합니다.");
        return false;
    }

    if (nickname.trim().length < 2 || nickname.trim().length > 10) {
        Alert.alert("오류", "닉네임은 2자 이상 10자 이하로 입력해주세요.");
        return false;
    }

    if (selectedDepartment === DEPARTMENTS[0]) {
        Alert.alert("오류", "학과를 선택해주세요.");
        return false;
    }
    if (emailId.trim().length === 0) {
        Alert.alert("오류", "이메일 ID를 입력해주세요.");
        return false;
    }
    return true;
  };

  const requestVerification = async () => {
    if (!validateInitialInputs()) return;

    setSendingCode(true); 
    setResendTimer(RESEND_TIME_SECONDS); 

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(code);
    const fullEmail = emailId + SCHOOL_DOMAIN;

    try {
      console.log(`[발송 시작] 이메일: ${fullEmail}, 코드: ${code}`);

      const functions = getFunctions();
      const sendEmailFn = httpsCallable(functions, 'sendVerificationCode'); 

      const result = await sendEmailFn({
        email: fullEmail,
        code: code
      });

      // @ts-ignore
      if (result.data.success) {
        console.log("[발송 성공]");
        Alert.alert("전송 완료", `${fullEmail}로 인증번호가 발송되었습니다.\n메일함을 확인해주세요.`);
        setCodeSent(true);
      }
    } catch (error: any) {
      console.error("[발송 실패]", error);
      Alert.alert(
        "전송 실패", 
        "이메일 전송 중 오류가 발생했습니다.\n네트워크 상태를 확인하거나 잠시 후 다시 시도해주세요."
      );
      setResendTimer(0);
      setCodeSent(false);
    } finally {
      setSendingCode(false);
    }
  };

  const validateFinalInputs = () => {
    const passwordRegex = /^(?=.*[A-Za-z]).{6,}$/;
    if (password !== confirmPw) {
      Alert.alert("오류", "비밀번호가 일치하지 않습니다.");
      return false;
    }
    if (!passwordRegex.test(password)) {
        Alert.alert("오류", "비밀번호는 영문을 포함하여 6자리 이상이어야 합니다.");
        return false;
    }
    if (!verificationCode || verificationCode !== generatedCode) {
      Alert.alert("오류", "인증번호가 올바르지 않습니다.");
      return false;
    }
    return true;
  }

  const handleSignup = async () => {
    const fullEmail = emailId + SCHOOL_DOMAIN;
    if (!validateInitialInputs() || !validateFinalInputs()) return;
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, fullEmail, password);
      const userId = userCredential.user.uid;

      // ✨ [수정] 모든 필드 완벽 초기화
      await setDoc(doc(db, "users", userId), {
        name: name.trim(),
        nickname: nickname.trim(),
        department: selectedDepartment,
        email: fullEmail,
        createdAt: new Date().toISOString(),
        
        // 👇 초기값 설정 (매우 중요)
        trustScore: 50,      // 신뢰도 50점 시작
        reportCount: 0,      // 신고 횟수 0회 시작
        blockedUsers: [],    // 차단 목록 빈 배열
        wishlist: []         // 찜 목록 빈 배열
      });
      
      Alert.alert("회원가입 성공", "가입이 완료되었습니다!");
      router.replace('/(tabs)/explore');
    } catch (e: any) {
      Alert.alert("회원가입 실패", e.message);
    }
    setLoading(false);
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };
  
  const renderDepartmentPicker = () => {
    if (Platform.OS === 'android') {
      return (
        <View style={styles.pickerWrapper}>
            <Picker
                selectedValue={selectedDepartment}
                onValueChange={(itemValue) => setSelectedDepartment(itemValue)}
                style={styles.picker}
                itemStyle={styles.pickerItem}
                // ✨ [추가] 안드로이드에서 아이템 목록 렌더링
                mode="dropdown"
            >
                {DEPARTMENTS.map((dept) => (
                    <Picker.Item 
                        key={dept} 
                        label={dept} 
                        value={dept} 
                        style={{ color: '#333', fontSize: 16 }} // 안드로이드 아이템 스타일
                    />
                ))}
            </Picker>
        </View>
      );
    }

    // iOS 코드는 그대로 유지
    return (
      <>
        <TouchableOpacity 
          style={styles.pickerWrapper} 
          onPress={() => setShowIosPicker(true)}
        >
          <Text style={[styles.pickerItem, { paddingLeft: 16, lineHeight: 50 }]}>
            {selectedDepartment}
          </Text>
        </TouchableOpacity>

        <Modal
          animationType="slide"
          transparent={true}
          visible={showIosPicker}
          onRequestClose={() => setShowIosPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowIosPicker(false)}>
                  <Text style={styles.modalDoneText}>완료</Text>
                </TouchableOpacity>
              </View>
              <Picker
                selectedValue={selectedDepartment}
                onValueChange={(itemValue) => setSelectedDepartment(itemValue)}
                style={{ height: 200 }} 
              >
                {DEPARTMENTS.map((dept) => (
                  <Picker.Item key={dept} label={dept} value={dept} color="#000"/>
                ))}
              </Picker>
            </View>
          </View>
        </Modal>
      </>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>회원가입</Text>
        
        <TextInput
          placeholder="이름 (한글만 입력 가능)"
          placeholderTextColor="#A9A9A9"
          value={name}
          onChangeText={setName}
          style={styles.input}
          autoCapitalize="words"
        />

        <TextInput
          placeholder="닉네임 (2~10자)"
          placeholderTextColor="#A9A9A9"
          value={nickname}
          onChangeText={setNickname}
          style={styles.input}
          autoCapitalize="none"
        />

        <View style={styles.inputLabelContainer}>
            <Text style={styles.inputLabel}>학과</Text>
        </View>
        {renderDepartmentPicker()}

        <View style={styles.emailGroup}>
            <TextInput
                placeholder="학교 이메일 ID"
                placeholderTextColor="#A9A9A9"
                value={emailId}
                onChangeText={setEmailId}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[styles.input, styles.emailIdInput]}
            />
            <Text style={styles.emailDomainText}>{SCHOOL_DOMAIN}</Text>
        </View>

        <View style={styles.verificationGroup}>
          <TextInput
            placeholder="인증번호"
            placeholderTextColor="#A9A9A9"
            value={verificationCode}
            onChangeText={setVerificationCode}
            editable={codeSent}
            style={[styles.input, styles.verificationInput]}
          />
          
          {resendTimer > 0 ? (
            <TouchableOpacity
              style={[styles.verifyButton, styles.timerButton]}
              disabled={true}
            >
              <Text style={styles.verifyButtonText}>{formatTime(resendTimer)}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.verifyButton,
                sendingCode && { backgroundColor: "#ccc" },
              ]}
              onPress={requestVerification}
              disabled={sendingCode}
            >
              {sendingCode ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.verifyButtonText}>
                  {'인증번호 받기'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {resendTimer > 0 ? (
            <Text style={styles.statusText}>
              인증번호가 전송되었습니다. {formatTime(resendTimer)} 남았습니다.
            </Text>
        ) : codeSent ? ( 
            <Text style={[styles.statusText, {color: '#0062ffff', fontWeight: 'bold'}]}>
              인증번호를 받지 못하셨나요? 재전송 버튼을 눌러주세요.
            </Text>
        ) : (
             <Text style={[styles.statusText, {color: '#999'}]}>
               학교 이메일을 입력하고 인증번호를 받아주세요.
             </Text>
        )}

        <TextInput
          placeholder="비밀번호 (영문 포함 6자리 이상)"
          placeholderTextColor="#A9A9A9"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        <TextInput
          placeholder="비밀번호 확인"
          placeholderTextColor="#A9A9A9"
          value={confirmPw}
          onChangeText={setConfirmPw}
          secureTextEntry
          style={styles.input}
        />

        <TouchableOpacity
          style={[styles.button, loading && { backgroundColor: "#ccc" }]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>가입하기</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 32,
    paddingBottom: 100, 
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#0062ffff",
    marginBottom: 32,
    textAlign: "center",
  },
  input: {
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: "#f2f3f7",
    marginBottom: 18,
    fontSize: 16,
    color: '#333',
  },
  inputLabelContainer: {
    paddingHorizontal: 5,
    marginBottom: 5,
  },
  inputLabel: {
    fontSize: 14,
    color: '#555',
    fontWeight: 'bold',
  },
  emailGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    backgroundColor: "#f2f3f7",
    borderRadius: 8,
    height: 50,
    paddingRight: 16,
  },
  emailIdInput: {
    flex: 1,
    height: '100%',
    marginBottom: 0,
    paddingRight: 5,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    color: '#333',
  },
  emailDomainText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '600',
  },
  pickerWrapper: {
    marginBottom: 18,
    backgroundColor: "#f2f3f7",
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden', 
  },
  picker: {
    width: '100%',
    height: 50,
  },
  pickerItem: {
    color: '#333',
    fontSize: 16,
  },
  button: {
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 14,
    backgroundColor: "#0062ffff",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  verificationGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 5, 
  },
  verificationInput: {
    flex: 1,
    marginBottom: 0,
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: "#f2f3f7",
    fontSize: 16,
    color: '#333',
  },
  verifyButton: {
    backgroundColor: "#4a90e2",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
    minWidth: 100,
  },
  timerButton: {
    backgroundColor: "#ccc",
  },
  verifyButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  statusText: {
    fontSize: 13,
    marginBottom: 18,
    textAlign: 'left',
    paddingLeft: 5,
    marginTop: 5,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', 
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    height: 45,
    backgroundColor: '#f2f3f7',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalDoneText: {
    color: '#0062ffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});