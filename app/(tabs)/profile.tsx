// app/(tabs)/profile.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth, signOut } from 'firebase/auth';
import { arrayRemove, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// ✨ [최적화] 단순 데이터 조회를 위한 getDoc 임포트 (렌더링과 분리)
import { getDoc } from 'firebase/firestore';

interface UserProfile {
  name: string;
  department: string;
  email: string;
  trustScore: number;
  blockedUsers?: string[];
}

interface BlockedUserInfo {
  uid: string;
  displayName: string;
}

export default function ProfileScreen() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [blockedList, setBlockedList] = useState<BlockedUserInfo[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [showBlockedSection, setShowBlockedSection] = useState(false); 

  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;
  const insets = useSafeAreaInsets();

  // 1. 내 프로필 실시간 감지 (가볍게 유지)
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const userDocRef = doc(db, "users", user.uid);
    
    const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile({
                name: data.name || '이름 없음',
                department: data.department || '소속 없음',
                email: user.email || '',
                trustScore: data.trustScore ?? 50,
                blockedUsers: data.blockedUsers || []
            });
            
            // ✨ [최적화] 차단 목록이 '열려 있을 때만' 리스트 갱신 (닫혀있으면 무시)
            if (showBlockedSection) {
               // 실시간 갱신은 하지 않고, 아래 fetchBlockedUsers를 수동으로 부르는게 성능상 좋음
            }
        }
        setLoading(false);
    }, (error) => {
        if (error.code === 'permission-denied') return;
    });

    return () => unsubscribeProfile();
  }, [user, showBlockedSection]);

  // 2. 차단 목록 정보 가져오기 (병렬 처리 + 에러 방지)
  const fetchBlockedUsers = useCallback(async (blockedIds: string[]) => {
    if (!blockedIds || blockedIds.length === 0) {
        setBlockedList([]);
        return;
    }
    
    setLoadingBlocked(true);
    try {
        // ✨ [최적화] Promise.all로 동시에 요청하여 대기 시간 단축
        const promises = blockedIds.map(async (uid) => {
            try {
                const userSnap = await getDoc(doc(db, "users", uid));
                if (userSnap.exists()) {
                    const d = userSnap.data();
                    let name = "알 수 없음";
                    if (d.department) {
                        if (d.email) {
                            const prefix = d.email.split('@')[0];
                            const two = prefix.substring(0, 2);
                            if (!isNaN(Number(two)) && two.length === 2) name = `${two}학번 ${d.department}`;
                            else name = `${prefix}님 ${d.department}`;
                        } else {
                            name = d.department;
                        }
                    }
                    return { uid, displayName: name };
                }
            } catch (e) { return null; }
            return null;
        });

        const results = await Promise.all(promises);
        const validUsers = results.filter((u): u is BlockedUserInfo => u !== null);
        setBlockedList(validUsers);

    } catch (error) {
        console.error("Error fetching blocked users:", error);
    } finally {
        setLoadingBlocked(false);
    }
  }, []);

  // 토글 핸들러 (열 때만 로드)
  const toggleBlockedSection = () => {
      const nextState = !showBlockedSection;
      setShowBlockedSection(nextState);
      if (nextState && userProfile?.blockedUsers) {
          fetchBlockedUsers(userProfile.blockedUsers);
      }
  };

  // ✨ [핵심 최적화] 낙관적 업데이트 (Optimistic Update)
  // 서버 응답을 기다리지 않고 UI부터 갱신
  const handleUnblock = async (targetUid: string, targetName: string) => {
      Alert.alert("차단 해제", `'${targetName}'님을 차단 해제하시겠습니까?`, [
          { text: "취소", style: "cancel" },
          { text: "해제", onPress: async () => {
              if(!user) return;

              // 1. UI 먼저 갱신 (즉시 반응)
              setBlockedList(prev => prev.filter(u => u.uid !== targetUid));
              Alert.alert("완료", "차단이 해제되었습니다.");

              // 2. 서버 작업은 뒤에서 조용히 수행
              try {
                  const myRef = doc(db, "users", user.uid);
                  await updateDoc(myRef, {
                      blockedUsers: arrayRemove(targetUid)
                  });
              } catch(e) {
                  // 만약 서버 에러나면? 사용자에게 알리고 롤백(선택사항)
                  console.error("Unblock failed on server:", e);
                  // 실패 시 다시 목록을 불러와서 원복하거나 에러 알림
              }
          }}
      ]);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/(auth)/login'); 
    } catch (error: any) {
      // Alert.alert("실패", error.message);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (showBlockedSection && userProfile?.blockedUsers) {
        fetchBlockedUsers(userProfile.blockedUsers).then(() => setRefreshing(false));
    } else {
        // 프로필 정보는 자동 갱신되므로 시간차만 둠
        setTimeout(() => setRefreshing(false), 800);
    }
  }, [showBlockedSection, userProfile, fetchBlockedUsers]);

  // useMemo로 계산 비용 절약
  const scoreInfo = useMemo(() => {
    const score = userProfile?.trustScore ?? 50;
    let info = { color: '#ff3b30', icon: 'warning', label: '주의 요망 😱', bg: '#ffebee' };
    
    if (score >= 90) info = { color: '#FFD700', icon: 'trophy', label: '명예 학우 👑', bg: '#fffbe6' };
    else if (score >= 70) info = { color: '#0062ffff', icon: 'medal', label: '우수 학우 😎', bg: '#e6f0ff' };
    else if (score >= 50) info = { color: '#28a745', icon: 'happy', label: '일반 학우 🙂', bg: '#e6f8e9' };
    else if (score >= 30) info = { color: '#ffcc00', icon: 'alert-circle', label: '노력 필요 😐', bg: '#fff8e6' };
    
    return { ...info, score, barWidth: Math.min(Math.max(score, 0), 100) + '%' };
  }, [userProfile?.trustScore]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#0062ffff" /></View>;
  if (!userProfile || !user) return <View style={styles.center}><ActivityIndicator size="small" color="#ccc" /></View>;

  return (
    <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
    >
        <View style={[styles.headerContainer, { paddingTop: insets.top }]}> 
            <Text style={styles.header}>내 정보</Text>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#fff" />
                <Text style={styles.logoutText}>로그아웃</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.profileCard}>
            <View style={styles.avatarContainer}>
                <Ionicons name="person-circle" size={70} color="#ccc" />
            </View>
            <View style={styles.profileInfo}>
                <Text style={styles.nameText}>{userProfile.name} 님</Text>
                <Text style={styles.deptText}>{userProfile.department}</Text>
                <Text style={styles.emailText}>{userProfile.email}</Text>
            </View>
        </View>

        <View style={[styles.scoreCard, { backgroundColor: scoreInfo.bg, borderColor: scoreInfo.color }]}>
            <View style={styles.scoreHeader}>
                <Text style={[styles.scoreTitle, {color: scoreInfo.color}]}>나의 신뢰 점수</Text>
                <View style={styles.badge}>
                    <Ionicons name={scoreInfo.icon as any} size={16} color={scoreInfo.color} style={{marginRight:4}} />
                    <Text style={[styles.badgeText, {color: scoreInfo.color}]}>{scoreInfo.label}</Text>
                </View>
            </View>
            <Text style={[styles.scoreValue, {color: scoreInfo.color}]}>{scoreInfo.score}점</Text>
            
            <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: scoreInfo.barWidth as any, backgroundColor: scoreInfo.color }]} />
            </View>
            <Text style={styles.scoreDesc}>
                매너 있는 활동으로 점수를 올려보세요!
            </Text>
        </View>

        <View style={styles.menuSection}>
            {/* 1. 내가 쓴 게시글 (my-posts로 이동해야 함!) */}
            <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => router.push('/profile/my-posts')} // 👈 여기가 my-posts 인지 확인!
            >
                <Ionicons name="document-text-outline" size={24} color="#555" />
                <Text style={styles.menuText}>내가 쓴 게시글</Text>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
            
            {/* 2. 관심 목록 (wishlist로 이동) */}
            <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => router.push('/profile/wishlist')} // 👈 여기는 wishlist
            >
                <Ionicons name="heart-outline" size={24} color="#555" />
                <Text style={styles.menuText}>관심 목록 (찜)</Text>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
        </View>

        <View style={styles.blockSection}>
            <TouchableOpacity style={styles.blockHeader} onPress={toggleBlockedSection}>
                <Text style={styles.blockTitle}>차단 관리</Text>
                <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Text style={styles.blockCount}>{userProfile.blockedUsers?.length || 0}명</Text>
                    <Ionicons name={showBlockedSection ? "chevron-up" : "chevron-down"} size={20} color="#666" />
                </View>
            </TouchableOpacity>
            
            {showBlockedSection && (
                <View style={styles.blockList}>
                    {loadingBlocked ? (
                        <ActivityIndicator color="#0062ffff" style={{padding: 10}} />
                    ) : blockedList.length === 0 ? (
                        <Text style={styles.emptyBlockText}>차단한 사용자가 없습니다.</Text>
                    ) : (
                        blockedList.map((blockedUser) => (
                            <View key={blockedUser.uid} style={styles.blockItem}>
                                <Text style={styles.blockName}>{blockedUser.displayName}</Text>
                                <TouchableOpacity 
                                    style={styles.unblockBtn} 
                                    onPress={() => handleUnblock(blockedUser.uid, blockedUser.displayName)}
                                >
                                    <Text style={styles.unblockText}>해제</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </View>
            )}
        </View>
        
        <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#fff' },
  header: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ff5c5c', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 13, marginLeft: 4 },
  
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 20, marginTop: 10, padding: 20, borderRadius: 15, elevation: 3 },
  avatarContainer: { marginRight: 20 },
  profileInfo: { flex: 1 },
  nameText: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  deptText: { fontSize: 16, color: '#555', marginBottom: 2 },
  emailText: { fontSize: 13, color: '#999' },

  scoreCard: { marginHorizontal: 20, marginBottom: 20, padding: 20, borderRadius: 15, borderWidth: 1 },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  scoreTitle: { fontSize: 16, fontWeight: 'bold' },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: 'bold' },
  scoreValue: { fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  progressBarBg: { height: 10, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', borderRadius: 5 },
  scoreDesc: { fontSize: 12, color: '#666' },

  menuSection: { backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 15, padding: 10, marginBottom: 20, elevation: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuText: { flex: 1, fontSize: 16, color: '#333', marginLeft: 15 },

  blockSection: { marginHorizontal: 20, backgroundColor: '#fff', borderRadius: 15, padding: 15, elevation: 2, marginBottom: 30 },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  blockCount: { fontSize: 14, color: '#888', marginRight: 5 },
  blockList: { marginTop: 15, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
  emptyBlockText: { textAlign: 'center', color: '#999', paddingVertical: 10 },
  blockItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
  blockName: { fontSize: 15, color: '#555' },
  unblockBtn: { backgroundColor: '#eee', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  unblockText: { fontSize: 12, color: '#333', fontWeight: '600' },
});