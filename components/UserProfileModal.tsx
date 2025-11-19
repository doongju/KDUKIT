// components/UserProfileModal.tsx

import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth'; // ✨ [추가] 현재 사용자 UID 가져오기
import { arrayRemove, arrayUnion, doc, onSnapshot, updateDoc } from 'firebase/firestore'; // ✨ [수정] onSnapshot 추가
import React, { useEffect, useState } from 'react';
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

interface UserData {
  department?: string; 
  email?: string;
  name?: string;       
  trustScore?: number; 
  reportCount?: number;
  blockedUsers?: string[]; // ✨ [추가] 차단 목록 필드
  wishlist?: string[]; // ✨ [추가] 찜 목록 필드 (이 모달에서는 사용 안하지만 타입은 미리 정의)
}

export default function UserProfileModal({ visible, userId, onClose }: UserProfileModalProps) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);
  
  // ✨ [추가] 현재 사용자의 차단 목록을 실시간으로 가져오기
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);
  const auth = getAuth();
  const currentUserId = auth.currentUser?.uid;

  // ✨ [수정] useEffect: 상대방 데이터와 내 차단 목록을 동시에 리스너로 가져옴
  useEffect(() => {
    if (!visible || !userId || !currentUserId) {
      setUserData(null);
      setMyBlockedUsers([]);
      return;
    }

    setLoading(true);

    // 1. 상대방 프로필 데이터 리스너
    const userDocRef = doc(db, "users", userId);
    const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserData(docSnap.data() as UserData);
      } else {
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

    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      unsubscribeUser();
      unsubscribeMyBlocked();
    };
  }, [visible, userId, currentUserId]);


  // ✨ [추가] 사용자 차단/차단 해제 핸들러
  const handleToggleBlock = async () => {
    if (!currentUserId || !userId) return;

    const myDocRef = doc(db, "users", currentUserId);
    const isBlocked = myBlockedUsers.includes(userId);

    try {
      if (isBlocked) {
        // 차단 해제
        await updateDoc(myDocRef, {
          blockedUsers: arrayRemove(userId)
        });
        Alert.alert("차단 해제", `${displayName}님에 대한 차단이 해제되었습니다.`);
      } else {
        // 차단
        await updateDoc(myDocRef, {
          blockedUsers: arrayUnion(userId)
        });
        Alert.alert("차단 완료", `${displayName}님을 차단했습니다.\n해당 유저의 게시글과 메시지는 더 이상 보이지 않습니다.`);
      }
    } catch (error) {
      console.error("Error toggling block status:", error);
      Alert.alert("오류", "차단 상태 변경에 실패했습니다.");
    }
  };


  // 점수 로직
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
  
  // 신고 누적 횟수 체크
  const reportCount = userData?.reportCount ?? 0;
  const isWarningUser = reportCount >= 3; 

  let displayName = "알 수 없음"; // 모달 제목으로 사용할 이름
  
  if (userData?.department) {
      if (userData.email) {
          const prefix = userData.email.split('@')[0]; 
          const two = prefix.substring(0, 2); 

          if (!isNaN(Number(two)) && two.length === 2) {
             displayName = `${two}학번 ${userData.department}`;
          } 
          else {
             displayName = `${prefix}님 ${userData.department}`;
          }
      } else {
          displayName = userData.department;
      }
  } else if (userData?.email) {
      displayName = userData.email.split('@')[0];
  } else if (userData?.name) {
      displayName = userData.name;
  }

  // 나 자신은 차단할 수 없도록
  const canBlock = userId && currentUserId && userId !== currentUserId;
  const isBlocked = canBlock && myBlockedUsers.includes(userId);


  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          
          <TouchableOpacity style={styles.closeIcon} onPress={onClose}>
            <Ionicons name="close" size={24} color="#999" />
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator size="large" color="#0062ffff" style={{ marginVertical: 20 }} />
          ) : (
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
              
              {/* ✨ [추가] 차단/차단 해제 버튼 */}
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
      </View>

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
    width: '80%', backgroundColor: '#fff', borderRadius: 20,
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

  // ✨ [추가] 차단 버튼 스타일
  blockButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#ff3b30', // 빨간색
  },
  blockButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  unblockButton: {
    backgroundColor: '#888', // 회색
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
});