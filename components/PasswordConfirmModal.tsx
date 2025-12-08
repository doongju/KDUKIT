// components/PasswordConfirmModal.tsx

import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, getAuth, reauthenticateWithCredential } from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PasswordConfirmModal({ visible, onClose, onSuccess }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = getAuth();

  const handleReauth = async () => {
    if (!password) {
      Alert.alert("알림", "비밀번호를 입력해주세요.");
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) return;

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      
      setPassword('');
      onSuccess(); 
      onClose();
      
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        Alert.alert("인증 실패", "비밀번호가 일치하지 않습니다.");
      } else {
        Alert.alert("오류", "인증 중 문제가 발생했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* 수정 포인트: 
        1. 안드로이드도 'padding'을 사용하여 밀어 올리는 애니메이션 효과를 줌
        2. keyboardVerticalOffset에 음수 값을 주어 너무 높이 올라가는 것을 방지 (-100 ~ -200 사이 조절)
      */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -150} 
        style={styles.keyboardView}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.header}>
              <Text style={styles.title}>본인 확인</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <Text style={styles.desc}>
              안전한 회원 탈퇴를 위해{'\n'}비밀번호를 한 번 더 입력해주세요.
            </Text>

            <TextInput 
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              placeholder="비밀번호 입력"
              placeholderTextColor="#aaa"
            />

            <TouchableOpacity 
              style={[styles.confirmBtn, loading && { backgroundColor: '#ccc' }]} 
              onPress={handleReauth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>확인</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  overlay: {
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', 
    alignItems: 'center',
  },
  modalContent: {
    width: '85%', 
    backgroundColor: '#fff', 
    borderRadius: 16,
    padding: 20, 
    elevation: 5,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15
  },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  desc: { fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 20 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 15, paddingVertical: 12, fontSize: 16, marginBottom: 20,
    backgroundColor: '#f9f9f9'
  },
  confirmBtn: {
    backgroundColor: '#ff4444', borderRadius: 8, paddingVertical: 14, alignItems: 'center'
  },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});