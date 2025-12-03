// components/ReviewModal.tsx

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
  sellerId: string; // 판매자(나) ID
  onClose: () => void;
  onComplete: () => void; // 완료 후 목록 새로고침용
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

  // 1. 이 상품으로 채팅한 사람 목록 가져오기
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
            const uData = userSnap.data();
            if (uData.department) {
                 let entryYear = "00";
                 if (uData.email) {
                     const prefix = uData.email.split('@')[0];
                     const two = prefix.substring(0, 2);
                     if (!isNaN(Number(two)) && two.length === 2) entryYear = two;
                 }
                 name = `${entryYear}학번 ${uData.department}`;
            } else if (uData.name) {
                name = uData.name;
            }
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

  // 2. 평가 및 점수 업데이트 (0점 초기화 방지 로직 포함)
  const handleReview = async (isGood: boolean) => {
    if (!selectedBuyer) return;
    setLoading(true);
    
    try {
      // A. 게시글 상태 변경
      const postRef = doc(db, 'marketPosts', postId);
      await updateDoc(postRef, {
        status: '판매완료',
        buyerId: selectedBuyer.uid,
        isBuyerReviewed: false 
      });

      // B. 구매자의 신뢰 점수 업데이트
      try {
        const buyerRef = doc(db, 'users', selectedBuyer.uid);
        const buyerSnap = await getDoc(buyerRef);

        if (buyerSnap.exists()) {
            const userData = buyerSnap.data();
            const scoreDelta = isGood ? 3 : -15;

            // ✨ 핵심: 점수가 없으면 50점 기준, 있으면 기존 점수에 increment
            if (userData.trustScore === undefined) {
                await updateDoc(buyerRef, { trustScore: 50 + scoreDelta });
            } else {
                await updateDoc(buyerRef, { trustScore: increment(scoreDelta) });
            }
        }
      } catch (scoreError) {
        console.error("점수 반영 실패 (무시함):", scoreError);
      }

      Alert.alert("거래 완료", `${selectedBuyer.displayName}님과의 거래를 확정했습니다.\n구매자에게도 후기 요청을 보냈습니다.`);
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
                  <Text style={styles.subTitle}>채팅했던 이웃 목록</Text>
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
                            <Text style={styles.userHint}>이웃 선택하기</Text>
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
                  <Text style={styles.targetName}>'{selectedBuyer.displayName}'님과의 거래</Text>
                  
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
  userHint: { fontSize: 12, color: '#888' },
  
  rateContainer: { alignItems: 'center', paddingVertical: 10 },
  targetName: { fontSize: 16, fontWeight: 'bold', marginBottom: 20 },
  rateButton: { flexDirection: 'row', alignItems: 'center', width: '100%', padding: 15, borderRadius: 12, marginBottom: 10, justifyContent: 'center' },
  rateText: { fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
});