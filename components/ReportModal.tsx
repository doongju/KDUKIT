// components/ReportModal.tsx

import { Ionicons } from '@expo/vector-icons';
// ✨ getDocs, query, where 추가됨
import { addDoc, collection, doc, getDoc, getDocs, increment, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import React, { useState } from 'react';
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

      // ✨ [핵심 추가] 중복 신고 방지 로직
      // 내가 이 사람을 신고한 적이 있는지 DB 조회
      const checkQuery = query(
        collection(db, 'reports'),
        where('reporterId', '==', currentUser.uid),
        where('targetId', '==', targetUserId)
      );
      
      const checkSnap = await getDocs(checkQuery);
      
      // 이미 신고 내역이 있다면 차단
      if (!checkSnap.empty) {
        Alert.alert("신고 불가", "이미 신고한 사용자입니다.\n중복 신고는 불가능합니다.");
        setLoading(false);
        return;
      }

      // --- 이하 기존 신고 로직 실행 ---

      // 1. 신고 내역 저장
      await addDoc(collection(db, "reports"), {
        reporterId: currentUser.uid,
        targetId: targetUserId,
        reason: reason,
        description: description,
        createdAt: serverTimestamp(),
        status: 'pending'
      });

      // 2. 신고 카운트 증가
      const targetUserRef = doc(db, "users", targetUserId);
      await updateDoc(targetUserRef, {
        reportCount: increment(1)
      });

      // 3. 자동 처벌 (3회 누적 시 점수 차감)
      const targetSnap = await getDoc(targetUserRef);
      if (targetSnap.exists()) {
        const userData = targetSnap.data();
        const currentReports = userData.reportCount || 0;

        if (currentReports % 3 === 0) {
             // 점수 필드가 없으면 50점 기준 차감, 있으면 기존 점수 차감
             const currentScore = userData.trustScore !== undefined ? userData.trustScore : 50;
             await updateDoc(targetUserRef, {
                 trustScore: currentScore - 5
             });
        }
      }

      Alert.alert("신고 접수", "신고가 정상적으로 접수되었습니다.");
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
                * 허위 신고 시 불이익을 받을 수 있습니다.
                {'\n'}* 동일인에 대한 중복 신고는 불가능합니다.
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