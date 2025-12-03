import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, increment, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { db } from '../firebaseConfig';

interface BuyerReviewModalProps {
  visible: boolean;
  postData: any; // 리뷰해야 할 게시글 데이터
  onClose: () => void;
}

export default function BuyerReviewModal({ visible, postData, onClose }: BuyerReviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [sellerName, setSellerName] = useState("판매자");

  // 판매자 정보(학번, 학과, 닉네임) 가져오기
  useEffect(() => {
    if (visible && postData) {
        const fetchSellerName = async () => {
            try {
                const userSnap = await getDoc(doc(db, "users", postData.creatorId));
                if (userSnap.exists()) {
                    const d = userSnap.data();
                    
                    // ✨ [수정] 학번 + 학과 + 닉네임 조합하기
                    let displayName = "판매자";
                    
                    if (d.department && d.nickname) {
                        let entryYear = "";
                        // 이메일에서 학번(앞 2자리) 추출
                        if (d.email) {
                            const prefix = d.email.split('@')[0];
                            const two = prefix.substring(0, 2);
                            if (!isNaN(Number(two)) && two.length === 2) {
                                entryYear = two;
                            }
                        }
                        // 예: "21 컴퓨터공학과 동동주"
                        displayName = `${entryYear} ${d.department} ${d.nickname}`;
                    } else if (d.nickname) {
                        displayName = d.nickname;
                    }

                    setSellerName(displayName); 
                }
            } catch(e) {
                console.log("Seller fetch error", e);
            }
        };
        fetchSellerName();
    }
  }, [visible, postData]);

  // 평가 로직 (0점 초기화 방지 포함)
  const handleReview = async (isGood: boolean) => {
    setLoading(true);
    try {
        // 1. 판매자 점수 업데이트
        const sellerRef = doc(db, 'users', postData.creatorId);
        const sellerSnap = await getDoc(sellerRef);
        
        if (sellerSnap.exists()) {
            const userData = sellerSnap.data();
            // ✨ 점수 설정: 좋아요(+3), 별로예요(-15)
            const scoreDelta = isGood ? 3 : -15;

            // 점수가 없으면 50점 기준, 있으면 기존 점수에서 증감
            if (userData.trustScore === undefined) {
                await updateDoc(sellerRef, { trustScore: 50 + scoreDelta });
            } else {
                await updateDoc(sellerRef, { trustScore: increment(scoreDelta) });
            }
        }

        // 2. 게시글의 'isBuyerReviewed'를 true로 변경 (더 이상 알림 안 뜨게)
        const postRef = doc(db, 'marketPosts', postData.id);
        await updateDoc(postRef, {
            isBuyerReviewed: true
        });

        Alert.alert("평가 완료", "판매자에 대한 후기가 등록되었습니다.\n감사합니다!");
        onClose();

    } catch (error) {
        console.error("Review error:", error);
        Alert.alert("오류", "평가 저장 실패");
    } finally {
        setLoading(false);
    }
  };

  if (!postData) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>구매 후기</Text>
          </View>

          {loading ? <ActivityIndicator size="large" color="#0062ffff" /> : (
            <View style={styles.content}>
                <Text style={styles.desc}>
                    <Text style={{fontWeight:'bold', color:'#0062ffff'}}>{postData.title}</Text>
                    {"\n"}거래는 어떠셨나요?
                </Text>
                
                {/* ✨ 수정된 판매자 정보 표시 */}
                <Text style={styles.subDesc}>'{sellerName}' 님에 대한 평가를 남겨주세요.</Text>

                <TouchableOpacity style={[styles.rateButton, {backgroundColor: '#e8f5e9'}]} onPress={() => handleReview(true)}>
                    <Ionicons name="happy" size={40} color="#28a745" />
                    <Text style={[styles.rateText, {color: '#28a745'}]}>좋았어요 (+3점)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.rateButton, {backgroundColor: '#ffebee'}]} onPress={() => handleReview(false)}>
                    <Ionicons name="sad" size={40} color="#ff3b30" />
                    <Text style={[styles.rateText, {color: '#ff3b30'}]}>별로예요 (-15점)</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={onClose} style={{marginTop: 15}}>
                    <Text style={{color:'#999', textDecorationLine:'underline'}}>나중에 하기</Text>
                </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  container: { backgroundColor: '#fff', borderRadius: 15, padding: 20, alignItems: 'center' },
  header: { marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  content: { width: '100%', alignItems: 'center' },
  desc: { fontSize: 16, textAlign: 'center', marginBottom: 5, lineHeight: 24 },
  subDesc: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
  rateButton: { flexDirection: 'row', alignItems: 'center', width: '100%', padding: 15, borderRadius: 12, marginBottom: 10, justifyContent: 'center' },
  rateText: { fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
});