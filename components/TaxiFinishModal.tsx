// components/TaxiFinishModal.tsx

import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, increment, writeBatch } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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

interface TaxiFinishModalProps {
  visible: boolean;
  partyId: string;
  members: string[]; // 참여자 UID 목록
  onClose: () => void;
  onComplete: () => void;
}

interface MemberData {
  uid: string;
  displayName: string;
  isPresent: boolean; // 출석 여부 체크 상태
}

export default function TaxiFinishModal({ visible, partyId, members, onClose, onComplete }: TaxiFinishModalProps) {
  const [loading, setLoading] = useState(false);
  const [memberList, setMemberList] = useState<MemberData[]>([]);

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
      // 본인(방장)은 제외하고 평가
      try {
        const userSnap = await getDoc(doc(db, "users", uid));
        let name = "알 수 없음";
        if (userSnap.exists()) {
          const d = userSnap.data();
          if (d.department) {
              // 학번 파싱 로직 재사용
              let entryYear = "00";
              if (d.email) {
                  const prefix = d.email.split('@')[0];
                  const two = prefix.substring(0, 2);
                  if (!isNaN(Number(two)) && two.length === 2) entryYear = two;
              }
              name = `${entryYear}학번 ${d.department}`;
          }
        }
        list.push({ uid, displayName: name, isPresent: true }); // 기본값: 출석
      } catch (e) { console.error(e); }
    }
    setMemberList(list);
    setLoading(false);
  };

  // 2. 출석 체크 토글
  const toggleAttendance = (index: number) => {
    const newList = [...memberList];
    newList[index].isPresent = !newList[index].isPresent;
    setMemberList(newList);
  };

  // 3. 결과 제출 (점수 반영)
  const handleSubmit = async () => {
    Alert.alert("운행 완료", "체크된 인원은 점수가 오르고(+1),\n체크되지 않은 인원은 '노쇼' 페널티(-4)를 받습니다.\n진행하시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "확정", onPress: processResults }
    ]);
  };

  const processResults = async () => {
    setLoading(true);
    try {
        const batch = writeBatch(db);

        memberList.forEach(member => {
            const userRef = doc(db, "users", member.uid);
            // 출석: +1점, 노쇼: -4점
            const scoreChange = member.isPresent ? 1 : -4; 
            batch.update(userRef, { trustScore: increment(scoreChange) });
        });

        // 파티 삭제 (또는 완료 상태로 변경)
        // 여기서는 '삭제' 처리로 깔끔하게 정리 (정책에 따라 status 변경으로 해도 됨)
        const partyRef = doc(db, "taxiParties", partyId);
        batch.delete(partyRef); 

        await batch.commit();

        Alert.alert("완료", "택시 파티가 성공적으로 종료되었습니다.\n신뢰도가 반영되었습니다.");
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
          
          <Text style={styles.desc}>실제로 함께 탑승한 학우를 체크해주세요.{'\n'}체크 해제 시 <Text style={{color:'red', fontWeight:'bold'}}>노쇼(No-Show)</Text>로 간주됩니다.</Text>

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
  desc: { fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 20 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  itemName: { fontSize: 16, marginLeft: 10, flex: 1, color: '#333' },
  noShowBadge: { fontSize: 12, color: '#ff3b30', fontWeight: 'bold', backgroundColor: '#ffebee', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  submitBtn: { backgroundColor: '#0062ffff', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 20 },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});