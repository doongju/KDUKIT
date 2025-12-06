import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { deleteDoc, doc, getDoc, increment, updateDoc } from 'firebase/firestore'; // ✨ batch 제거, 개별 update 사용
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../firebaseConfig';
// ✨ 신뢰도 서비스 import (경로 확인!)
import { checkTrustScoreEligibility, logTrustScoreTransaction } from '@/app/services/trustScoreService';

interface TaxiFinishModalProps {
  visible: boolean;
  partyId: string;
  members: string[]; 
  onClose: () => void;
  onComplete: () => void;
}

interface MemberData {
  uid: string;
  displayName: string;
  isPresent: boolean;
}

export default function TaxiFinishModal({ visible, partyId, members, onClose, onComplete }: TaxiFinishModalProps) {
  const [loading, setLoading] = useState(false);
  const [memberList, setMemberList] = useState<MemberData[]>([]);
  const auth = getAuth();
  const currentUser = auth.currentUser;

  // 1. 멤버 정보 불러오기
  useEffect(() => {
    if (visible && members.length > 0) {
      fetchMembers();
    }
  }, [visible, members]);

  const fetchMembers = async () => {
    setLoading(true);
    const list: MemberData[] = [];
    
    for (const uid of members) {
      try {
        const userSnap = await getDoc(doc(db, "users", uid));
        let name = "알 수 없음";

        if (userSnap.exists()) {
          const d = userSnap.data();
          // ✨ [수정] displayId 우선 사용
          name = d.displayId || "익명 사용자";
        }
        list.push({ uid, displayName: name, isPresent: true }); 
      } catch (e) { console.error(e); }
    }
    setMemberList(list);
    setLoading(false);
  };

  const toggleAttendance = (index: number) => {
    const newList = [...memberList];
    newList[index].isPresent = !newList[index].isPresent;
    setMemberList(newList);
  };

  const handleSubmit = async () => {
    const presentCount = memberList.filter(m => m.isPresent).length;
    
    let message = `체크된 인원(${presentCount}명)은 신뢰도 +2점,\n노쇼 인원은 -7점 처리됩니다.\n`;
    message += `(일일 3회 제한 및 7일 쿨타임이 적용됩니다.)\n\n`;
    
    Alert.alert("최종 확정", message, [
        { text: "취소", style: "cancel" },
        { text: "확정", onPress: processResults }
    ]);
  };

  const processResults = async () => {
    if (!currentUser) return;
    setLoading(true);

    try {
        // (1) 참여자 점수 처리 (반복문으로 개별 처리)
        // ✨ 중요: 택시는 다수이므로 batch 대신 하나씩 검사하고 업데이트합니다.
        for (const member of memberList) {
            const userRef = doc(db, "users", member.uid);
            
            if (member.isPresent) {
                // 👍 출석 -> 신뢰도 검사 수행
                // "이 멤버(member.uid)가 나(currentUser.uid)로부터 점수를 받을 자격이 있나?"
                const eligibility = await checkTrustScoreEligibility(member.uid, currentUser.uid, 'taxi');

                if (eligibility.allowed) {
                    await updateDoc(userRef, { trustScore: increment(2) });
                    await logTrustScoreTransaction(member.uid, currentUser.uid, 'taxi', 2);
                    console.log(`[Taxi] ${member.displayName} 점수 지급 완료`);
                } else {
                    console.log(`[Taxi] ${member.displayName} 점수 지급 스킵 (${eligibility.reason})`);
                }

            } else {
                // 👎 노쇼 -> 검사 없이 즉시 차감
                await updateDoc(userRef, { trustScore: increment(-7) });
            }
        }

        // (2) 방장(나) 점수 처리
        // 방장은 '셀프'로 점수를 받습니다. (sourceUserId = 본인 ID)
        // 이렇게 하면 '내가 나에게 주는' 기록이 남아서 일일 제한(3회)에 카운트됩니다.
        const myRef = doc(db, "users", currentUser.uid);
        const myEligibility = await checkTrustScoreEligibility(currentUser.uid, currentUser.uid, 'taxi');
        
        if (myEligibility.allowed) {
             await updateDoc(myRef, { trustScore: increment(2) });
             await logTrustScoreTransaction(currentUser.uid, currentUser.uid, 'taxi', 2);
        }

        // (3) 파티 삭제
        await deleteDoc(doc(db, "taxiParties", partyId));

        Alert.alert("완료", "정산이 완료되었습니다!\n(어뷰징 방지 규칙에 따라 점수가 반영되었습니다)");
        onComplete();
        onClose();
    } catch (error) {
        console.error("Finish party error:", error);
        Alert.alert("오류", "처리 중 문제가 발생했습니다.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>🚖 탑승 인원 체크</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#999" /></TouchableOpacity>
          </View>
          
          <Text style={styles.desc}>
            함께 탑승한 학우를 체크해주세요.{'\n'}
            <Text style={{color:'#0062ffff'}}>출석(+2)</Text> / <Text style={{color:'red'}}>노쇼(-7)</Text>
          </Text>
          <Text style={styles.limitInfo}>* 일일 3회 제한 / 동일인물 7일 쿨타임 적용</Text>

          {loading ? <ActivityIndicator size="large" color="#0062ffff" /> : (
            <FlatList
                data={memberList}
                keyExtractor={item => item.uid}
                renderItem={({ item, index }) => (
                    <TouchableOpacity style={styles.itemRow} onPress={() => toggleAttendance(index)}>
                        <Ionicons 
                            name={item.isPresent ? "checkbox" : "square-outline"} 
                            size={24} 
                            color={item.isPresent ? "#0062ffff" : "#ccc"} 
                        />
                        <Text style={[styles.itemName, !item.isPresent && {color:'#aaa', textDecorationLine:'line-through'}]}>
                            {item.displayName}
                        </Text>
                        {!item.isPresent && <Text style={styles.noShowBadge}>노쇼</Text>}
                    </TouchableOpacity>
                )}
            />
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Text style={styles.submitText}>확정 및 종료</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  container: { backgroundColor: '#fff', borderRadius: 15, padding: 20, maxHeight: '70%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  desc: { fontSize: 14, color: '#666', marginBottom: 5, lineHeight: 20 },
  limitInfo: { fontSize: 12, color: '#999', marginBottom: 15 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  itemName: { fontSize: 16, marginLeft: 10, flex: 1, color: '#333' },
  noShowBadge: { fontSize: 12, color: '#ff3b30', fontWeight: 'bold', backgroundColor: '#ffebee', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  submitBtn: { backgroundColor: '#0062ffff', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 20 },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});