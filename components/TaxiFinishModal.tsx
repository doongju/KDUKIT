import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, increment, writeBatch } from 'firebase/firestore';
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
  lastTaxiDate?: string; // ✨ 마지막으로 점수 받은 날짜 (YYYY-MM-DD)
}

// 오늘 날짜 구하는 함수 (YYYY-MM-DD)
const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export default function TaxiFinishModal({ visible, partyId, members, onClose, onComplete }: TaxiFinishModalProps) {
  const [loading, setLoading] = useState(false);
  const [memberList, setMemberList] = useState<MemberData[]>([]);
  const auth = getAuth();

  // 1. 멤버 정보 및 '마지막 점수 받은 날짜' 불러오기
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
        let lastDate = "";

        if (userSnap.exists()) {
          const d = userSnap.data();
          lastDate = d.lastTaxiDate || ""; // 기존 기록 가져오기

          if (d.department) {
             let entryYear = "00";
             if (d.email) {
                 const prefix = d.email.split('@')[0];
                 const two = prefix.substring(0, 2);
                 if (!isNaN(Number(two)) && two.length === 2) entryYear = two;
             }
             name = `${entryYear}학번 ${d.department}`;
          }
        }
        list.push({ uid, displayName: name, isPresent: true, lastTaxiDate: lastDate }); 
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
    message += `(단, 하루 1회만 점수가 오릅니다.)\n\n`;
    
    if (presentCount > 0) {
        message += "✅ 정상 운행되어 본인(방장)도 +2점을 받습니다.";
    } else {
        message += "⚠️ 탑승자가 없어 본인(방장) 점수는 오르지 않습니다.";
    }

    Alert.alert("최종 확정", message, [
        { text: "취소", style: "cancel" },
        { text: "확정", onPress: processResults }
    ]);
  };

  const processResults = async () => {
    setLoading(true);
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const today = getTodayString(); // "2024-11-29"

    try {
        const batch = writeBatch(db);

        // (1) 참여자 점수 처리
        let actualPassengers = 0;
        
        memberList.forEach(member => {
            const userRef = doc(db, "users", member.uid);
            
            if (member.isPresent) {
                // ✨ 출석했지만, 오늘 이미 점수를 받았다면? -> 점수 안 줌
                if (member.lastTaxiDate === today) {
                    console.log(`${member.displayName}님은 오늘 이미 점수를 받음.`);
                } else {
                    // 오늘 처음 -> 점수 주고, 날짜 갱신
                    batch.update(userRef, { 
                        trustScore: increment(2),
                        lastTaxiDate: today 
                    });
                }
                actualPassengers++;
            } else {
                // ✨ 노쇼는 하루 제한 없이 무조건 깎아버림 (참교육)
                batch.update(userRef, { trustScore: increment(-7) });
            }
        });

        // (2) 방장(나) 점수 처리
        if (actualPassengers > 0) {
            const myRef = doc(db, "users", currentUser.uid);
            const mySnap = await getDoc(myRef);
            
            // 방장도 오늘 이미 받았는지 확인
            if (mySnap.exists() && mySnap.data().lastTaxiDate === today) {
                 console.log("방장도 오늘 이미 점수 받음.");
            } else {
                 batch.update(myRef, { 
                     trustScore: increment(2),
                     lastTaxiDate: today 
                 });
            }
        }

        // (3) 파티 삭제
        const partyRef = doc(db, "taxiParties", partyId);
        batch.delete(partyRef); 

        await batch.commit();

        Alert.alert("완료", "정산이 완료되었습니다!\n(하루 1회 제한이 적용되었습니다)");
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
          <Text style={styles.limitInfo}>* 신뢰도 상승은 하루 1회만 가능합니다.</Text>

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