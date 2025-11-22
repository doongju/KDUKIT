import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

// ⚠️ 학과 목록 정의
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

// ⚠️ 이메일 도메인 고정
const SCHOOL_DOMAIN = '@v.kduniv.ac.kr';
const RESEND_TIME_SECONDS = 300; // 5분 타이머

export default function SignupScreen() {
  const [emailId, setEmailId] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState(DEPARTMENTS[0]);
  const [verificationCode, setVerificationCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [name, setName] = useState("");
  
  // ✨ [추가] 닉네임 상태
  const [nickname, setNickname] = useState("");

  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [resendTimer, setResendTimer] = useState(0); 

  const router = useRouter();

  // 타이머 로직
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

  // 초기 입력 유효성 검사
  const validateInitialInputs = () => {
    const nameRegex = /^[가-힣\s]{1,}$/; 
    if (!nameRegex.test(name) || name.trim().length === 0) {
        Alert.alert("오류", "이름은 한글만 입력 가능하며 공백이 아니어야 합니다.");
        return false;
    }

    // ✨ [추가] 닉네임 유효성 검사 (2~10자)
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

  // 가상 인증번호 요청 로직
  const requestVerification = () => {
    if (!validateInitialInputs()) return;

    setSendingCode(true); 
    setResendTimer(RESEND_TIME_SECONDS); 

    setTimeout(() => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(code);
      
      console.log("가상 발송된 인증번호:", code);
      Alert.alert("인증번호 전송 완료", `인증번호는 [${code}] 입니다. 확인 후 입력해주세요.`);
      
      setSendingCode(false); 
      setCodeSent(true);      
    }, 2000);
  };


  // 최종 회원가입 시 유효성 검사
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


  // 회원가입 처리
  const handleSignup = async () => {
    const fullEmail = emailId + SCHOOL_DOMAIN;
    
    if (!validateInitialInputs() || !validateFinalInputs()) return;
    
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, fullEmail, password);
      const userId = userCredential.user.uid;

      // ✨ [수정] nickname 필드 추가 저장 + trustScore 초기화
      await setDoc(doc(db, "users", userId), {
        name: name.trim(),
        nickname: nickname.trim(), // 닉네임 저장
        department: selectedDepartment,
        email: fullEmail,
        createdAt: new Date().toISOString(),
        trustScore: 50, // 초기 신뢰도 50점
      });

      Alert.alert("회원가입 성공", "가입이 완료되었습니다!");
      router.replace('/(tabs)/explore');
      
    } catch (e: any) {
      Alert.alert("회원가입 실패", e.message);
    }
    setLoading(false);
  };


  // ⚠️ 타이머 표시 형식 (MM:SS)
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };
  
  // ⚠️ Picker 렌더링 함수
  const renderDepartmentPicker = () => (
    <View style={styles.pickerWrapper}>
        <Picker
            selectedValue={selectedDepartment}
            onValueChange={(itemValue) => setSelectedDepartment(itemValue)}
            style={styles.picker}
            itemStyle={styles.pickerItem} // ⚠️ iOS Picker 텍스트 색상 보정을 위한 itemStyle
        >
            {DEPARTMENTS.map((dept) => (
                <Picker.Item key={dept} label={dept} value={dept} />
            ))}
        </Picker>
    </View>
  );


  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>회원가입</Text>
        
        {/* 이름 입력 필드 */}
        <TextInput
          placeholder="이름 (한글만 입력 가능)"
          placeholderTextColor="#A9A9A9" // ✨ placeholderTextColor 명시
          value={name}
          onChangeText={setName}
          style={styles.input}
          autoCapitalize="words"
        />

        {/* ✨ [추가] 닉네임 입력 필드 */}
        <TextInput
          placeholder="닉네임 (2~10자)"
          placeholderTextColor="#A9A9A9"
          value={nickname}
          onChangeText={setNickname}
          style={styles.input}
          autoCapitalize="none"
        />

        {/* 학과 드롭다운 */}
        <View style={styles.inputLabelContainer}>
            <Text style={styles.inputLabel}>학과</Text>
        </View>
        {renderDepartmentPicker()}


        {/* 이메일 ID 입력 필드 */}
        <View style={styles.emailGroup}>
            <TextInput
                placeholder="학교 이메일 ID"
                placeholderTextColor="#A9A9A9" // ✨ placeholderTextColor 명시
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
            placeholderTextColor="#A9A9A9" // ✨ placeholderTextColor 명시
            value={verificationCode}
            onChangeText={setVerificationCode}
            editable={codeSent}
            style={[styles.input, styles.verificationInput]}
          />
          
          {/* 버튼 렌더링 로직: 타이머/재전송/받기 */}
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

        {/* 상태 메시지 및 재전송 안내 텍스트 추가 */}
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
          placeholderTextColor="#A9A9A9" // ✨ placeholderTextColor 명시
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        <TextInput
          placeholder="비밀번호 확인"
          placeholderTextColor="#A9A9A9" // ✨ placeholderTextColor 명시
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
    </View>
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
    color: '#333', // ⚠️ 입력될 텍스트 색상도 명시
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
  // 이메일 도메인 표시 그룹
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
    color: '#333', // ⚠️ 입력될 텍스트 색상도 명시
  },
  emailDomainText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '600',
  },
  // 학과 Picker 스타일
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
    color: '#333', // ⚠️ Picker.Item 텍스트 색상 명시
  },
  // 나머지 스타일
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
    color: '#333', // ⚠️ 입력될 텍스트 색상 명시
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
  }
});