import Ionicons from '@expo/vector-icons/Ionicons';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useEffect, useState } from "react";
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
import { registerForPushNotificationsAsync } from '../../utils/registerForPushNotificationsAsync';


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
  
  const [isAgree, setIsAgree] = useState(false); 
  
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0); 
  
  const [isVerified, setIsVerified] = useState(false);
  const [showIosPicker, setShowIosPicker] = useState(false);

  const router = useRouter();

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null; 
    if (codeSent && resendTimer > 0 && !isVerified) {
      timerId = setTimeout(() => {
        setResendTimer(resendTimer - 1);
      }, 1000);
    } else if (resendTimer === 0 && codeSent && !isVerified) {
      setCodeSent(false);
      setGeneratedCode(null); 
      Alert.alert("시간 초과", "인증 시간이 만료되었습니다. 다시 시도해주세요.");
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [codeSent, resendTimer, isVerified]);

  const handleViewPolicy = () => {
      Alert.alert("개인정보 처리 방침", "이곳에 개인정보 수집 및 이용 목적, 항목, 보유 및 이용 기간 등의 상세 약관 내용이 들어갑니다.");
  }


  const validateInitialInputs = () => {
    const nameRegex = /^[가-힣\s]{1,}$/;
    // ✨ [추가] 학번 정규식: 숫자(\d)가 정확히 7개({7})여야 함
    const studentIdRegex = /^\d{7}$/;

    if (!nameRegex.test(name) || name.trim().length === 0) {
        Alert.alert("오류", "이름은 한글만 입력 가능하며 공백이 아니어야 합니다.");
        return false;
    }
    if (selectedDepartment === DEPARTMENTS[0]) {
        Alert.alert("오류", "학과를 선택해주세요.");
        return false;
    }
    // ✨ [수정] 학번 유효성 검사 로직 강화
    const trimmedEmail = emailId.trim();
    if (trimmedEmail.length === 0) {
        Alert.alert("오류", "학번(이메일 ID)을 입력해주세요.");
        return false;
    }
    
    // 숫자가 아니거나 7자리가 아니면 차단
    if (!studentIdRegex.test(trimmedEmail)) {
        Alert.alert("오류", "학번은 7자리 숫자여야 합니다.\n(예: 2025123)");
        return false;
    }
    
    if (!isAgree) {
        Alert.alert("동의 필요", "개인정보 수집 및 이용에 동의해야 회원가입이 가능합니다.");
        return false;
    }

    return true;
  };

  const requestVerification = async () => {
    // 인증 요청 시에는 동의 여부를 체크하지 않음 (가입 버튼 누를 때 체크)
    // 하지만 validateInitialInputs에 포함되어 있으므로, 
    // 여기서는 isAgree 체크를 빼고 싶은 경우 별도 검증 함수를 만들거나 
    // validateInitialInputs를 수정해야 합니다. 
    // 일단 현재 구조상 인증 요청 시에도 동의를 요구하게 됩니다.
    // 사용자 경험상 인증 먼저 하고 나중에 동의해도 되지만, 
    // 코드가 복잡해지지 않게 그대로 두거나, 
    // 필요하다면 requestVerification용 검증 로직을 분리해 드릴 수 있습니다.
    // 여기서는 일단 기존 로직 유지 (동의 안 하면 인증번호도 안 옴) -> 이게 더 깔끔할 수 있습니다.
    if (!validateInitialInputs()) return;

    setSendingCode(true); 
    setIsVerified(false); 
    setVerificationCode(""); 
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

  const handleCheckCode = () => {
    if (!verificationCode) {
      Alert.alert("알림", "인증번호를 입력해주세요.");
      return;
    }
    if (verificationCode === generatedCode) {
      setIsVerified(true); 
      setResendTimer(0); 
      Alert.alert("인증 성공", "인증이 완료되었습니다. 비밀번호를 설정해주세요.");
    } else {
      Alert.alert("오류", "인증번호가 일치하지 않습니다.");
    }
  };

  const validateFinalInputs = () => {
    const passwordRegex = /^(?=.*[A-Za-z]).{6,}$/;
    
    if (!isVerified) {
        Alert.alert("오류", "이메일 인증을 먼저 완료해주세요.");
        return false;
    }

    if (password !== confirmPw) {
      Alert.alert("오류", "비밀번호가 일치하지 않습니다.");
      return false;
    }
    if (!passwordRegex.test(password)) {
        Alert.alert("오류", "비밀번호는 영문을 포함하여 6자리 이상이어야 합니다.");
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

      let token = null;
      try {
         token = await registerForPushNotificationsAsync();
      } catch(e) { console.log("토큰 발급 실패:", e); }

      // ✨ [로직 추가] 학번(앞 2자리) 추출 및 고유 코드 생성
      // 1. 학번 추출: 입력받은 이메일 아이디의 앞에서 2글자 (예: 1234567 -> 12)
      const studentYear = emailId.substring(0, 2); 
      
      // 2. 고유 코드 생성: 랜덤 4자리 (예: #A1B2)
      const uniqueCode = Math.random().toString(36).substring(2, 6).toUpperCase();

      // 3. 전체 표시용 ID 조합 (예: 12학번 컴퓨터공학과 #A1B2)
      const compositeId = `${studentYear}학번 ${selectedDepartment}#${uniqueCode}`;

      // ✨ [수정] 회원 정보 DB 저장 (토큰, 학번, 고유코드 포함)
      await setDoc(doc(db, "users", userId), {
        name: name.trim(),
        department: selectedDepartment,
        
        // ✨ 익명/식별용 필드 추가
        studentYear: studentYear,   // 학번 (12)
        uniqueCode: uniqueCode,     // 고유코드 (A1B2)
        displayId: compositeId,     // 조합된 전체 ID
        
        email: fullEmail,
        createdAt: new Date().toISOString(),
        
        trustScore: 50,      
        reportCount: 0,      
        blockedUsers: [],    
        wishlist: [],
        
        pushToken: token || null 
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
                mode="dropdown"
            >
                {DEPARTMENTS.map((dept) => (
                    <Picker.Item 
                        key={dept} 
                        label={dept} 
                        value={dept} 
                        style={{ color: '#333', fontSize: 16 }} 
                    />
                ))}
            </Picker>
        </View>
      );
    }

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

        <View style={styles.inputLabelContainer}>
            <Text style={styles.inputLabel}>학과</Text>
        </View>
        {renderDepartmentPicker()}

        <View style={styles.emailGroup}>
            <TextInput
                placeholder="학번 (7자리)"
                placeholderTextColor="#A9A9A9"
                value={emailId}
                onChangeText={setEmailId}
                autoCapitalize="none"
                // ✨ [수정] 숫자 키패드만 나오게 설정
                keyboardType="number-pad" 
                // ✨ [수정] 최대 7글자까지만 입력 가능하게 제한
                maxLength={7}
                style={[styles.input, styles.emailIdInput]}
                editable={!isVerified} 
            />
            <Text style={styles.emailDomainText}>{SCHOOL_DOMAIN}</Text>
        </View>

        <View style={styles.verificationGroup}>
          <TextInput
            placeholder={isVerified ? "인증이 완료되었습니다" : "인증번호"}
            placeholderTextColor="#A9A9A9"
            value={verificationCode}
            onChangeText={setVerificationCode}
            editable={!isVerified && codeSent} 
            style={[
                styles.input, 
                styles.verificationInput, 
                isVerified && { backgroundColor: '#e8f5e9', color: '#2e7d32', fontWeight: 'bold' }
            ]}
          />
          
          {isVerified ? (
             <View style={[styles.verifyButton, { backgroundColor: '#4caf50' }]}>
                <Text style={styles.verifyButtonText}>완료</Text>
             </View>
          ) : resendTimer > 0 ? (
            <TouchableOpacity
              style={[styles.verifyButton, { backgroundColor: "#0062ffff" }]}
              onPress={handleCheckCode}
            >
              <Text style={styles.verifyButtonText}>확인 ({formatTime(resendTimer)})</Text>
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
                  {codeSent ? '재전송' : '인증번호 받기'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {!isVerified && resendTimer > 0 && (
            <Text style={styles.statusText}>
              인증번호가 전송되었습니다. 입력 후 확인 버튼을 눌러주세요.
            </Text>
        )}
        {!isVerified && !codeSent && (
              <Text style={[styles.statusText, {color: '#999'}]}>
                학교 이메일을 입력하고 인증번호를 받아주세요.
              </Text>
        )}

        <View style={{ opacity: isVerified ? 1 : 0.5 }}>
            <TextInput
              placeholder={isVerified ? "비밀번호 (영문 포함 6자리 이상)" : "이메일 인증 후 입력 가능"}
              placeholderTextColor="#A9A9A9"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              editable={isVerified} 
            />
            <TextInput
              placeholder={isVerified ? "비밀번호 확인" : "이메일 인증 후 입력 가능"}
              placeholderTextColor="#A9A9A9"
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry
              style={styles.input}
              editable={isVerified} 
            />
        </View>

        {/* ✨ [이동 완료] 개인정보 동의 체크박스 위치 변경 (맨 아래) */}
        <View style={styles.policyContainer}>
          <TouchableOpacity 
            style={styles.policyCheckboxRow}
            onPress={() => setIsAgree(!isAgree)}
          >
            <Ionicons 
                name={isAgree ? "checkmark-circle" : "ellipse-outline"} 
                size={22} 
                color={isAgree ? "#0062ffff" : "#ccc"} 
                style={styles.checkboxIcon}
            />
            <Text style={styles.policyText}>개인정보 수집 및 이용 동의 (필수)</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleViewPolicy} style={styles.policyViewButton}>
             <Text style={styles.policyViewText}>약관 보기</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, (loading || !isVerified || !isAgree) && { backgroundColor: "#ccc" }]}
          onPress={handleSignup}
          disabled={loading || !isVerified || !isAgree}
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
    fontSize: 14,
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
  policyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 25,
    paddingHorizontal: 5,
    marginTop: 10, // ✨ 위쪽 간격 살짝 추가
  },
  policyCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxIcon: {
      marginRight: 6
  },
  policyText: {
    fontSize: 15,
    color: '#444',
    fontWeight: '500',
  },
  policyViewButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  policyViewText: {
    fontSize: 14,
    color: '#0062ffff',
    textDecorationLine: 'underline',
    fontWeight: '600',
  }
});