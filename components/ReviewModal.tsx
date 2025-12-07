import { checkTrustScoreEligibility, logTrustScoreTransaction } from '@/app/services/trustScoreService';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, increment, query, updateDoc, where } from 'firebase/firestore';
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

interface ReviewModalProps {
  visible: boolean;
  postId: string;
  postTitle: string;
  sellerId: string; 
  onClose: () => void;
  onComplete: () => void; 
}

interface Candidate {
  uid: string;
  displayName: string;
}

export default function ReviewModal({ visible, postId, postTitle, sellerId, onClose, onComplete }: ReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [step, setStep] = useState<'selectBuyer' | 'rate'>('selectBuyer');
  const [selectedBuyer, setSelectedBuyer] = useState<Candidate | null>(null);

  // 1. 이 상품(postId)으로 채팅을 건 사람 목록 가져오기
  useEffect(() => {
    if (visible && postId) {
      fetchChatCandidates();
      setStep('selectBuyer');
    }
  }, [visible, postId]);

  const fetchChatCandidates = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'chatRooms'),
        where('marketId', '==', postId),
        where('members', 'array-contains', sellerId)
      );
      const snap = await getDocs(q);
      
      const list: Candidate[] = [];
      
      for (const chatDoc of snap.docs) {
        const data = chatDoc.data();
        const otherUid = data.members.find((m: string) => m !== sellerId);
        
        if (otherUid) {
          const userSnap = await getDoc(doc(db, 'users', otherUid));
          let name = "알 수 없음";
          
          if (userSnap.exists()) {
            const d = userSnap.data();
            name = d.displayId || "익명 사용자";
          }
          list.push({ uid: otherUid, displayName: name });
        }
      }
      setCandidates(list);
    } catch (e) {
      console.error("후보 로드 실패", e);
    } finally {
      setLoading(false);
    }
  };

  // 2. 평가 및 점수 업데이트 (✨ 수정된 로직)
  const handleReview = async (isGood: boolean) => {
    if (!selectedBuyer) return;
    setLoading(true);
    
    try {
      // A. 게시글 상태 변경 (점수 지급 여부와 상관없이 '판매완료' 처리)
      const postRef = doc(db, 'marketPosts', postId);
      await updateDoc(postRef, {
        status: '판매완료',
        buyerId: selectedBuyer.uid,
        isBuyerReviewed: false 
      });

      const buyerRef = doc(db, 'users', selectedBuyer.uid);

      // B. 점수 로직 분기
      if (isGood) {
        // 👍 [좋았어요 +3점] -> 어뷰징 체크 필요
        const eligibility = await checkTrustScoreEligibility(selectedBuyer.uid, sellerId, 'market');

        if (eligibility.allowed) {
            // 1) 점수 지급
            await updateDoc(buyerRef, { trustScore: increment(3) });
            // 2) 로그 기록 (쿨타임 적용을 위해 필수)
            await logTrustScoreTransaction(selectedBuyer.uid, sellerId, 'market', 3);
            
            Alert.alert("거래 완료", `${selectedBuyer.displayName}님과의 거래를 확정했습니다.\n신뢰도 점수(+3)가 반영되었습니다.`);
        } else {
            // 3) 자격 미달 (일일 제한 or 쿨타임) -> 점수 지급 안 함
            Alert.alert(
                "거래 완료", 
                `${selectedBuyer.displayName}님과의 거래가 확정되었습니다.\n\n(점수 미반영 사유: ${eligibility.reason})`
            );
        }

      } else {
        // 👎 [별로예요 -15점] -> 어뷰징 체크 없이 즉시 처벌 (신고 성격)
        await updateDoc(buyerRef, { trustScore: increment(-15) });
        
        // *참고: 차감 기록은 로그에 남기지 않습니다 (일일 획득 제한 3회에 포함되지 않게 하기 위함)
        Alert.alert("거래 완료", `${selectedBuyer.displayName}님과의 거래를 확정했습니다.\n상대방의 신뢰도가 차감되었습니다.`);
      }

      onComplete(); 
      onClose(); 

    } catch (error) {
      console.error("Error finalizing trade:", error);
      Alert.alert("오류", "거래 완료 처리 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 'selectBuyer' ? "누구와 거래하셨나요?" : "거래 후기를 남겨주세요"}
            </Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#999" /></TouchableOpacity>
          </View>

          {loading ? <ActivityIndicator size="large" color="#0062ffff" style={{margin:20}} /> : (
            <>
              {step === 'selectBuyer' && (
                <>
                  <Text style={styles.subTitle}>채팅했던 학우 목록</Text>
                  {candidates.length === 0 ? (
                    <Text style={styles.emptyText}>채팅한 기록이 없습니다.</Text>
                  ) : (
                    <FlatList
                      data={candidates}
                      keyExtractor={item => item.uid}
                      renderItem={({ item }) => (
                        <TouchableOpacity style={styles.userItem} onPress={() => { setSelectedBuyer(item); setStep('rate'); }}>
                          <Ionicons name="person-circle" size={40} color="#ccc" />
                          <View style={{marginLeft: 10}}>
                            <Text style={styles.userName}>{item.displayName}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color="#ccc" style={{marginLeft: 'auto'}} />
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </>
              )}

              {step === 'rate' && selectedBuyer && (
                <View style={styles.rateContainer}>
                  <Text style={styles.targetName}>{selectedBuyer.displayName}님과의 거래</Text>
                  
                  <TouchableOpacity style={[styles.rateButton, {backgroundColor: '#e8f5e9'}]} onPress={() => handleReview(true)}>
                    <Ionicons name="happy" size={40} color="#28a745" />
                    <Text style={[styles.rateText, {color: '#28a745'}]}>좋았어요 (+3점)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.rateButton, {backgroundColor: '#ffebee'}]} onPress={() => handleReview(false)}>
                    <Ionicons name="sad" size={40} color="#ff3b30" />
                    <Text style={[styles.rateText, {color: '#ff3b30'}]}>별로예요 (-15점)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setStep('selectBuyer')} style={{marginTop: 20}}>
                    <Text style={{color: '#999', textDecorationLine: 'underline'}}>다른 사람 선택하기</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  container: { backgroundColor: '#fff', borderRadius: 15, padding: 20, maxHeight: '60%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  subTitle: { fontSize: 14, color: '#666', marginBottom: 10 },
  emptyText: { textAlign: 'center', color: '#999', marginVertical: 20 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  userName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  rateContainer: { alignItems: 'center', paddingVertical: 10 },
  targetName: { fontSize: 16, fontWeight: 'bold', marginBottom: 20 },
  rateButton: { flexDirection: 'row', alignItems: 'center', width: '100%', padding: 15, borderRadius: 12, marginBottom: 10, justifyContent: 'center' },
  rateText: { fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
});