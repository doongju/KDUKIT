// components/UserProfileModal.tsx

import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { arrayRemove, arrayUnion, doc, onSnapshot, updateDoc } from 'firebase/firestore';
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
import ReportModal from './ReportModal';

interface UserProfileModalProps {
  visible: boolean;
  userId: string | null; // 조회할 상대방 UID
  onClose: () => void;
}

// ✨ UserData 인터페이스
interface UserData {
  department?: string; 
  email?: string;
  name?: string;       
  trustScore?: number; 
  reportCount?: number;
  blockedUsers?: string[]; 
  wishlist?: string[]; 
  nickname?: string;
}

export default function UserProfileModal({ visible, userId, onClose }: UserProfileModalProps) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);
  
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);
  const auth = getAuth();
  const currentUserId = auth.currentUser?.uid;

  useEffect(() => {
    if (!visible || !userId) {
      setUserData(null);
      setMyBlockedUsers([]);
      // 모달이 닫히거나 ID가 없으면 로딩 초기화
      setLoading(true);
      return;
    }

    if (!currentUserId) return;

    setLoading(true);

    // 1. 상대방 프로필 데이터 리스너
    const userDocRef = doc(db, "users", userId);
    const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserData(docSnap.data() as UserData);
      } else {
        // ✨ 데이터가 없으면 null (탈퇴한 사용자)
        setUserData(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching user profile:", error);
      setUserData(null);
      setLoading(false);
    });

    // 2. 현재 사용자(나)의 차단 목록 리스너
    const currentUserDocRef = doc(db, "users", currentUserId);
    const unsubscribeMyBlocked = onSnapshot(currentUserDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const myData = docSnap.data() as UserData;
        setMyBlockedUsers(myData.blockedUsers || []);
      } else {
        setMyBlockedUsers([]);
      }
    }, (error) => {
      console.error("Error fetching my blocked users:", error);
      setMyBlockedUsers([]);
    });

    return () => {
      unsubscribeUser();
      unsubscribeMyBlocked();
    };
  }, [visible, userId, currentUserId]);


  // 차단/해제 로직
  const handleToggleBlock = async () => {
    if (!currentUserId || !userId) return;

    const myDocRef = doc(db, "users", currentUserId);
    const isBlocked = myBlockedUsers.includes(userId);

    try {
      if (isBlocked) {
        await updateDoc(myDocRef, {
          blockedUsers: arrayRemove(userId)
        });
        Alert.alert("차단 해제", "차단이 해제되었습니다.");
      } else {
        await updateDoc(myDocRef, {
          blockedUsers: arrayUnion(userId)
        });
        Alert.alert("차단 완료", "해당 유저를 차단했습니다.");
      }
    } catch (error) {
      console.error("Error toggling block status:", error);
      Alert.alert("오류", "차단 상태 변경에 실패했습니다.");
    }
  };


  // 점수 및 레벨 로직
  const getScoreInfo = (score: number) => {
    if (score >= 90) return { color: '#FFD700', icon: 'trophy', label: '명예 학우 👑' };
    if (score >= 70) return { color: '#0062ffff', icon: 'medal', label: '우수 학우 😎' };
    if (score >= 50) return { color: '#28a745', icon: 'happy', label: '일반 학우 🙂' };
    if (score >= 30) return { color: '#ffcc00', icon: 'alert-circle', label: '노력 필요 😐' };
    return { color: '#ff3b30', icon: 'warning', label: '주의 요망 😱' };
  };

  const score = userData?.trustScore ?? 50; 
  const { color, icon, label } = getScoreInfo(score);
  const barWidth = Math.min(Math.max(score, 0), 100) + '%'; 
  
  const reportCount = userData?.reportCount ?? 0;
  const isWarningUser = reportCount >= 3; 

  // ✨ 표시 이름 생성 로직
  let displayName = "알 수 없음";

  if (userData) {
      let emailPrefix = "";
      if (userData.email) {
          const fullId = userData.email.split('@')[0];   
          emailPrefix = fullId.substring(0, 2);          
      }

      const dept = userData.department || "학과 미정";
      const nick = userData.nickname || (userData.name ? userData.name : "");

      displayName = `${emailPrefix} ${dept} ${nick}님`;
  }

  const canBlock = userId && currentUserId && userId !== currentUserId;
  const isBlocked = canBlock && myBlockedUsers.includes(userId);


  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContainer}>
          
          <TouchableOpacity style={styles.closeIcon} onPress={onClose}>
            <Ionicons name="close" size={24} color="#999" />
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator size="large" color="#0062ffff" style={{ marginVertical: 20 }} />
          ) : !userData ? (
            // ✅ [수정된 부분] 데이터가 없을 때 (탈퇴한 계정) 표시되는 화면
            <View style={styles.deletedContainer}>
                <Ionicons name="person-remove-outline" size={60} color="#bbb" />
                <Text style={styles.deletedTitle}>알 수 없음</Text>
                <View style={styles.deletedBadge}>
                    <Text style={styles.deletedText}>탈퇴한 계정입니다</Text>
                </View>
                <Text style={styles.deletedDesc}>
                    사용자가 탈퇴하여{'\n'}정보를 확인할 수 없습니다.
                </Text>
            </View>
          ) : (
            // ✅ 데이터가 있을 때 (정상 계정) 표시되는 화면
            <>
              <View style={styles.avatarContainer}>
                <Ionicons name="person-circle" size={80} color={isWarningUser ? "#ff3b30" : "#ccc"} />
              </View>

              <Text style={styles.userName}>{displayName}</Text>
              
              <View style={styles.verifiedContainer}>
                <Ionicons name="checkmark-circle" size={14} color="#28a745" />
                <Text style={styles.verifiedText}>학교 인증된 사용자</Text>
              </View>

              {isWarningUser && (
                <View style={styles.warningBox}>
                    <Ionicons name="warning" size={16} color="#d32f2f" />
                    <Text style={styles.warningText}>신고가 누적된 사용자입니다 ({reportCount}회)</Text>
                </View>
              )}

              <View style={styles.divider} />

              <View style={styles.scoreContainer}>
                <View style={styles.scoreHeader}>
                    <Text style={styles.scoreTitle}>신뢰 점수</Text>
                    <View style={styles.scoreBadge}>
                        <Text style={[styles.scoreValue, { color }]}>{score}점</Text>
                        <Ionicons name={icon as any} size={18} color={color} style={{marginLeft: 4}} />
                    </View>
                </View>
                
                <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: barWidth as any, backgroundColor: color }]} />
                </View>
                <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
                
                <Text style={styles.scoreDesc}>
                  기본 50점부터 시작하며, 거래/합승 후 평가에 따라 변동됩니다.
                </Text>
              </View>
              
              {canBlock && (
                <TouchableOpacity 
                    style={[styles.blockButton, isBlocked ? styles.unblockButton : {}]} 
                    onPress={handleToggleBlock}
                >
                    <Text style={[styles.blockButtonText, isBlocked ? styles.unblockButtonText : {}]}>
                        {isBlocked ? '차단 해제하기' : '이 사용자 차단하기'}
                    </Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={styles.reportButton} onPress={() => setReportVisible(true)}>
                <Text style={styles.reportText}>🚨 비매너 사용자 신고하기</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>

      {reportVisible && (
        <ReportModal 
            visible={reportVisible}
            targetUserId={userId || ""}
            targetUserName={displayName}
            onClose={() => setReportVisible(false)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalContainer: {
    width: '85%', 
    backgroundColor: '#fff', borderRadius: 20,
    padding: 20, alignItems: 'center', elevation: 5,
  },
  closeIcon: {
    position: 'absolute', top: 15, right: 15, zIndex: 1,
  },
  avatarContainer: {
    marginBottom: 10,
  },
  userName: {
    fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 4, 
    textAlign: 'center', paddingHorizontal: 5, 
  },
  
  verifiedContainer: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
    backgroundColor: '#f0f9f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12
  },
  verifiedText: {
    fontSize: 12, color: '#28a745', marginLeft: 4, fontWeight: '600'
  },

  warningBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffebee', paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 20, marginBottom: 10,
  },
  warningText: {
    color: '#d32f2f', fontSize: 13, fontWeight: 'bold', marginLeft: 5,
  },

  divider: {
    width: '100%', height: 1, backgroundColor: '#eee', marginVertical: 10,
  },
  scoreContainer: {
    width: '100%', marginBottom: 20,
  },
  scoreHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8,
  },
  scoreTitle: {
    fontSize: 14, color: '#555', fontWeight: 'bold',
  },
  scoreBadge: {
    flexDirection: 'row', alignItems: 'center',
  },
  scoreValue: {
    fontSize: 20, fontWeight: 'bold',
  },
  progressBarBg: {
    width: '100%', height: 10, backgroundColor: '#eee', borderRadius: 5, overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%', borderRadius: 5,
  },
  scoreLabel: {
    fontSize: 13, marginTop: 8, textAlign: 'right', fontWeight: 'bold',
  },
  scoreDesc: {
    fontSize: 11, color: '#aaa', marginTop: 5, textAlign: 'center'
  },

  blockButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#ff3b30', 
  },
  blockButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  unblockButton: {
    backgroundColor: '#888', 
  },
  unblockButtonText: {
    color: 'white',
  },
  
  reportButton: {
    paddingVertical: 10,
  },
  reportText: {
    fontSize: 13, color: '#ff3b30', textDecorationLine: 'underline',
  },

  // ✅ 탈퇴 계정 스타일 추가
  deletedContainer: {
    alignItems: 'center', paddingVertical: 20,
  },
  deletedTitle: {
    fontSize: 18, fontWeight: 'bold', color: '#999', marginTop: 10, marginBottom: 10,
  },
  deletedBadge: {
    backgroundColor: '#f5f5f5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 15,
  },
  deletedText: {
    color: '#ff5c5c', fontWeight: 'bold', fontSize: 14,
  },
  deletedDesc: {
    textAlign: 'center', color: '#bbb', fontSize: 13, lineHeight: 18,
  },
});