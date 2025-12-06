import { EmailAuthProvider, getAuth, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';

interface ChangePasswordModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function ChangePasswordModal({ visible, onClose }: ChangePasswordModalProps) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const auth = getAuth();
    const user = auth.currentUser;

    const handleChange = async () => {
        if (!currentPassword || !newPassword) {
            Alert.alert("알림", "모든 항목을 입력해주세요.");
            return;
        }
        if (newPassword.length < 6) {
            Alert.alert("알림", "새 비밀번호는 6자 이상이어야 합니다.");
            return;
        }
        if (!user || !user.email) return;

        setLoading(true);
        try {
            // 1. 현재 비밀번호로 재인증 (보안 필수 절차)
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            // 2. 비밀번호 업데이트
            await updatePassword(user, newPassword);

            Alert.alert("성공", "비밀번호가 변경되었습니다. 다시 로그인해주세요.", [
                { 
                    text: "확인", 
                    onPress: () => {
                        onClose();
                        auth.signOut(); // 변경 후 로그아웃 처리 (보안 권장)
                    }
                }
            ]);
        } catch (error: any) {
            console.error(error);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                Alert.alert("오류", "현재 비밀번호가 일치하지 않습니다.");
            } else if (error.code === 'auth/weak-password') {
                Alert.alert("오류", "비밀번호가 너무 쉽습니다.");
            } else {
                Alert.alert("오류", "비밀번호 변경 중 문제가 발생했습니다.");
            }
        } finally {
            setLoading(false);
            setCurrentPassword('');
            setNewPassword('');
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                        <View style={styles.modalContainer}>
                            <Text style={styles.title}>비밀번호 변경</Text>
                            <Text style={styles.subTitle}>보안을 위해 현재 비밀번호를 확인합니다.</Text>

                            <Text style={styles.label}>현재 비밀번호</Text>
                            <TextInput 
                                style={styles.input} 
                                secureTextEntry 
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                                placeholder="사용 중인 비밀번호 입력"
                            />

                            <Text style={styles.label}>새 비밀번호</Text>
                            <TextInput 
                                style={styles.input} 
                                secureTextEntry 
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder="새로운 비밀번호 입력"
                            />

                            <View style={styles.buttonRow}>
                                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                                    <Text style={styles.cancelText}>취소</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.confirmButton} onPress={handleChange} disabled={loading}>
                                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>변경하기</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContainer: { backgroundColor: '#fff', borderRadius: 15, padding: 25 },
    title: { fontSize: 20, fontWeight: 'bold', marginBottom: 5, color: '#333' },
    subTitle: { fontSize: 13, color: '#666', marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15 },
    buttonRow: { flexDirection: 'row', marginTop: 30, justifyContent: 'flex-end' },
    cancelButton: { paddingVertical: 10, paddingHorizontal: 20, marginRight: 10, borderRadius: 8, backgroundColor: '#f0f0f0' },
    cancelText: { color: '#666', fontWeight: 'bold' },
    confirmButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#0062ffff', minWidth: 80, alignItems: 'center' },
    confirmText: { color: '#fff', fontWeight: 'bold' },
});