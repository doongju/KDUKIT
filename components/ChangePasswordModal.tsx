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
    Text,
    TextInput,
    TouchableOpacity,
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
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const auth = getAuth();
    const user = auth.currentUser;

    const passwordRegex = /^(?=.*[A-Za-z]).{6,}$/;

    const handleChange = async () => {
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            Alert.alert("알림", "모든 항목을 입력해주세요.");
            return;
        }

        if (newPassword !== confirmNewPassword) {
            Alert.alert("오류", "비밀번호가 일치하지 않습니다.");
            return;
        }

        if (!passwordRegex.test(newPassword)) {
            Alert.alert("오류", "비밀번호는 영문을 포함하여 6자리 이상이어야 합니다.");
            return;
        }

        if (!user || !user.email) return;

        setLoading(true);
        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            await updatePassword(user, newPassword);

            Alert.alert("성공", "비밀번호가 변경되었습니다. 다시 로그인해주세요.", [
                { 
                    text: "확인", 
                    onPress: () => {
                        resetState();
                        onClose();
                        auth.signOut();
                    }
                }
            ]);
        } catch (error: any) {
            // ✨ 에러 로그만 남기고 화면에는 띄우지 않음 (console.error 제거)
            console.log("Password change error:", error.code);

            if (
                error.code === 'auth/invalid-credential' || 
                error.code === 'auth/wrong-password' || 
                error.code === 'auth/user-mismatch'
            ) {
                Alert.alert("오류", "현재 비밀번호가 일치하지 않습니다.");
            } else if (error.code === 'auth/weak-password') {
                Alert.alert("오류", "비밀번호가 너무 쉽습니다.");
            } else if (error.code === 'auth/too-many-requests') {
                Alert.alert("오류", "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.");
            } else {
                Alert.alert("오류", "비밀번호 변경 중 문제가 발생했습니다.");
            }
        } finally {
            setLoading(false);
        }
    };

    const resetState = () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
    };

    const handleClose = () => {
        if (loading) return; // 로딩 중엔 닫기 방지 (선택 사항)
        resetState();
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
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
                                placeholder="영문 포함 6자리 이상"
                            />

                            <Text style={styles.label}>새 비밀번호 확인</Text>
                            <TextInput 
                                style={styles.input} 
                                secureTextEntry 
                                value={confirmNewPassword}
                                onChangeText={setConfirmNewPassword}
                                placeholder="새로운 비밀번호 한 번 더 입력"
                            />

                            <View style={styles.buttonRow}>
                                <TouchableOpacity 
                                    style={[styles.button, styles.cancelButton]} 
                                    onPress={handleClose}
                                    disabled={loading}
                                >
                                    <Text style={styles.cancelText}>취소</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity 
                                    style={[styles.button, styles.confirmButton]} 
                                    onPress={handleChange} 
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={styles.confirmText}>변경하기</Text>
                                    )}
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
    
    // ✨ [스타일 수정] 버튼 영역 개선
    buttonRow: { 
        flexDirection: 'row', 
        marginTop: 30, 
        justifyContent: 'space-between', // 양쪽으로 균등 배치
        gap: 10 // 버튼 사이 간격 (RN 0.71+ 지원, 안되면 margin 사용)
    },
    // 공통 버튼 스타일 (높이 고정, flex 1로 너비 균등 분할)
    button: {
        flex: 1, 
        height: 50, // 높이 고정 (중요)
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    cancelButton: { 
        backgroundColor: '#f0f0f0',
        // marginRight: 10, // gap이 작동 안 하는 구버전 RN일 경우 주석 해제
    },
    confirmButton: { 
        backgroundColor: '#0062ffff', 
    },
    cancelText: { color: '#666', fontWeight: 'bold', fontSize: 15 },
    confirmText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});