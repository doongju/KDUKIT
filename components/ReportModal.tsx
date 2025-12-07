// components/ReportModal.tsx

import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, doc, getDoc, getDocs, increment, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { auth, db } from '../firebaseConfig';

interface ReportModalProps {
  visible: boolean;
  targetUserId: string; 
  targetUserName: string; 
  onClose: () => void;
}

const REPORT_REASONS = [
  "사기 / 거래 불이행",
  "욕설 / 비하 발언",
  "노쇼 (약속 장소에 안 나타남)",
  "도배 / 광고 / 스팸",
  "성희롱 / 불쾌감 조성",
  "기타 사유"
];

export default function ReportModal({ visible, targetUserId, targetUserName, onClose }: ReportModalProps) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReport = async () => {
    if (!description.trim()) {
      Alert.alert("내용 입력", "상세 내용을 간략히 적어주세요.");
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      // 1. 중복 신고 방지
      const checkQuery = query(
        collection(db, 'reports'),
        where('reporterId', '==', currentUser.uid),
        where('targetId', '==', targetUserId)
      );
      
      const checkSnap = await getDocs(checkQuery);
      
      if (!checkSnap.empty) {
        Alert.alert("신고 불가", "이미 신고한 사용자입니다.");
        setLoading(false);
        return;
      }

      const targetUserRef = doc(db, "users", targetUserId);
      
      // 2. 현재 신고 횟수 가져오기
      const targetSnap = await getDoc(targetUserRef);
      
      if (targetSnap.exists()) {
          const userData = targetSnap.data();
          const currentCount = userData.reportCount || 0;
          const nextCount = currentCount + 1; // 이번에 신고하면 될 숫자

          const updates: any = {
              reportCount: increment(1) 
          };

          // ✨ [확인용] 개발 중에만 띄우는 알림 (테스트 후 주석 처리하세요)
          console.log(`현재 ${currentCount}회 -> 이번 신고로 ${nextCount}회가 됩니다.`);

          // 3. 3회 이상이면 무조건 정지 (>= 3)
          if (nextCount >= 3) {
              updates.isSuspended = true;
              
              // 정지 시간 기록 (최초 정지 시에만)
              if (!userData.isSuspended) {
                  updates.suspendedAt = serverTimestamp();
              }
              console.log("🚨 3회 누적! 정지 처리 실행됨");
          }

          // 4. DB 반영
          await updateDoc(targetUserRef, updates);
      }

      // 5. 신고 내역 저장
      await addDoc(collection(db, "reports"), {
        reporterId: currentUser.uid,
        targetId: targetUserId,
        reason: reason,
        description: description,
        createdAt: serverTimestamp(),
        status: 'pending'
      });

      Alert.alert("신고 접수", "정상적으로 접수되었습니다.");
      setDescription("");
      onClose();

    } catch (error) {
      console.error("Report error:", error);
      Alert.alert("오류", "신고 처리 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>🚨 사용자 신고</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#999" /></TouchableOpacity>
          </View>

          <Text style={styles.targetText}>신고 대상: <Text style={{fontWeight:'bold', color:'#333'}}>{targetUserName}</Text></Text>

          <ScrollView style={styles.scroll}>
            <Text style={styles.label}>신고 사유</Text>
            <View style={styles.reasonContainer}>
                {REPORT_REASONS.map((r, idx) => (
                    <TouchableOpacity 
                        key={idx} 
                        style={[styles.reasonBtn, reason === r && styles.reasonBtnSelected]}
                        onPress={() => setReason(r)}
                    >
                        <Text style={[styles.reasonText, reason === r && styles.reasonTextSelected]}>{r}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>상세 내용</Text>
            <TextInput 
                style={styles.input}
                placeholder="상황을 자세히 설명해주세요."
                multiline
                value={description}
                onChangeText={setDescription}
            />
            
            <Text style={styles.warning}>
                * 3회 이상 신고 누적 시 해당 사용자는 즉시 이용이 정지됩니다.
            </Text>
          </ScrollView>

          <TouchableOpacity style={styles.submitBtn} onPress={handleReport} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>신고하기</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  container: { backgroundColor: '#fff', borderRadius: 15, padding: 20, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#ff3b30' },
  targetText: { fontSize: 16, marginBottom: 20, color: '#555' },
  scroll: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  reasonContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 },
  reasonBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', marginRight: 8, marginBottom: 8 },
  reasonBtnSelected: { backgroundColor: '#ff3b30', borderColor: '#ff3b30' },
  reasonText: { color: '#555', fontSize: 13 },
  reasonTextSelected: { color: '#fff', fontWeight: 'bold' },
  input: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 15, height: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#eee' },
  warning: { fontSize: 12, color: '#888', marginTop: 10 },
  submitBtn: { backgroundColor: '#ff3b30', borderRadius: 10, padding: 15, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});