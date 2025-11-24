// app/(tabs)/profile.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { deleteUser, getAuth, signOut } from 'firebase/auth';
import { arrayRemove, deleteDoc, doc, getDoc as getDocLite, onSnapshot, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

// ... (인터페이스 정의 동일)
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
  const [loading, setLoading] = useState(true); // 초기 로딩
  const [refreshing, setRefreshing] = useState(false);
  
  const [blockedList, setBlockedList] = useState<BlockedUserInfo[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [showBlockedSection, setShowBlockedSection] = useState(false); 

  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;
  const insets = useSafeAreaInsets();

  // 유저가 없으면 로딩 (이건 로그아웃 직후라 괜찮음)
  if (!user) {
    return (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#0062ffff" />
        </View>
    );
  }

  // 1. 내 프로필 실시간 감지
  useEffect(() => {
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
        } else {
            // ✨ [핵심] 문서가 없어도 로딩을 끝내야 화면이 나옴
            setUserProfile(null); 
        }
        setLoading(false);
    }, (error) => {
        if (error.code === 'permission-denied') return;
        console.error("Profile listener error:", error);
        setLoading(false); // 에러나도 로딩 끝냄
    });

    return () => unsubscribeProfile();
  }, [user]);

  // ... (fetchBlockedUsers, toggleBlockedSection, handleUnblock 등 함수들은 기존과 동일) ...
  const fetchBlockedUsers = useCallback(async (blockedIds: string[]) => {
    if (!blockedIds || blockedIds.length === 0) { setBlockedList([]); return; }
    setLoadingBlocked(true);
    try {
        const promises = blockedIds.map(async (uid) => {
            try {
                const userSnap = await getDocLite(doc(db, "users", uid));
                if (userSnap.exists()) {
                    const d = userSnap.data();
                    let name = "알 수 없음";
                    if (d.department) {
                        if (d.email) {
                            const prefix = d.email.split('@')[0];
                            const two = prefix.substring(0, 2);
                            if (!isNaN(Number(two)) && two.length === 2) name = `${two}학번 ${d.department}`;
                            else name = `${prefix}님 ${d.department}`;
                        } else { name = d.department; }
                    }
                    return { uid, displayName: name };
                }
            } catch (e) { return null; }
            return null;
        });
        const results = await Promise.all(promises);
        setBlockedList(results.filter((u): u is BlockedUserInfo => u !== null));
    } catch (error) { console.error(error); } finally { setLoadingBlocked(false); }
  }, []);

  const toggleBlockedSection = () => {
      const nextState = !showBlockedSection;
      setShowBlockedSection(nextState);
      if (nextState && userProfile?.blockedUsers) fetchBlockedUsers(userProfile.blockedUsers);
  };

  const handleUnblock = async (targetUid: string, targetName: string) => {
      Alert.alert("차단 해제", `'${targetName}'님을 차단 해제하시겠습니까?`, [
          { text: "취소", style: "cancel" },
          { text: "해제", onPress: async () => {
              if(!user) return;
              setBlockedList(prev => prev.filter(u => u.uid !== targetUid));
              try {
                  const myRef = doc(db, "users", user.uid);
                  await updateDoc(myRef, { blockedUsers: arrayRemove(targetUid) });
                  Alert.alert("완료", "차단이 해제되었습니다.");
              } catch(e) { console.error(e); }
          }}
      ]);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error: any) {
      Alert.alert("실패", error.message);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert("회원 탈퇴", "정말로 탈퇴하시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "탈퇴", style: 'destructive', onPress: async () => {
            if(!user) return;
            try {
                await deleteDoc(doc(db, "users", user.uid));
                await deleteUser(user);
                Alert.alert("탈퇴 완료");
            } catch(e: any) {
                if (e.code === 'auth/requires-recent-login') {
                    Alert.alert("인증 만료", "재로그인 후 시도해주세요.");
                    await signOut(auth);
                }
            }
        }}
    ]);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (showBlockedSection && userProfile?.blockedUsers) {
        fetchBlockedUsers(userProfile.blockedUsers).then(() => setRefreshing(false));
    } else { setTimeout(() => setRefreshing(false), 800); }
  }, [showBlockedSection, userProfile, fetchBlockedUsers]);

  const scoreInfo = useMemo(() => {
    const score = userProfile?.trustScore ?? 50;
    let info = { color: '#ff3b30', icon: 'warning', label: '주의 요망 😱', bg: '#ffebee' };
    if (score >= 90) info = { color: '#FFD700', icon: 'trophy', label: '명예 학우 👑', bg: '#fffbe6' };
    else if (score >= 70) info = { color: '#0062ffff', icon: 'medal', label: '우수 학우 😎', bg: '#e6f0ff' };
    else if (score >= 50) info = { color: '#28a745', icon: 'happy', label: '일반 학우 🙂', bg: '#e6f8e9' };
    else if (score >= 30) info = { color: '#ffcc00', icon: 'alert-circle', label: '노력 필요 😐', bg: '#fff8e6' };
    return { ...info, score, barWidth: Math.min(Math.max(score, 0), 100) + '%' };
  }, [userProfile?.trustScore]);

  const { color, icon, label, bg, score, barWidth } = scoreInfo;

  return (
    <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
    >
        {/* ✨ [핵심 수정] 헤더는 데이터 로딩 여부와 상관없이 무조건 렌더링 */}
        <View style={[styles.headerContainer, { paddingTop: insets.top }]}> 
            <Text style={styles.header}>내 정보</Text>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#fff" />
                <Text style={styles.logoutText}>로그아웃</Text>
            </TouchableOpacity>
        </View>

        {/* ✨ 데이터가 로딩 중이거나 없을 때의 처리 분기 */}
        {loading ? (
            <View style={{ marginTop: 100 }}>
                <ActivityIndicator size="large" color="#0062ffff" />
            </View>
        ) : !userProfile ? (
            // 유저 데이터가 없는 경우 (임시 계정 등)
            <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={50} color="#ff5c5c" />
                <Text style={styles.errorText}>사용자 정보를 불러올 수 없습니다.</Text>
                <Text style={styles.errorSubText}>회원가입이 정상적으로 되지 않았거나{'\n'}데이터가 삭제된 계정입니다.</Text>
            </View>
        ) : (
            // 정상 데이터가 있을 때
            <>
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

                <View style={[styles.scoreCard, { backgroundColor: bg, borderColor: color }]}>
                    <View style={styles.scoreHeader}>
                        <Text style={[styles.scoreTitle, {color}]}>나의 신뢰 점수</Text>
                        <View style={styles.badge}>
                            <Ionicons name={icon as any} size={16} color={color} style={{marginRight:4}} />
                            <Text style={[styles.badgeText, {color}]}>{label}</Text>
                        </View>
                    </View>
                    <Text style={[styles.scoreValue, {color}]}>{score}점</Text>
                    
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: barWidth as any, backgroundColor: color }]} />
                    </View>
                    <Text style={styles.scoreDesc}>매너 있는 활동으로 점수를 올려보세요!</Text>
                </View>

                <View style={styles.menuSection}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/profile/my-posts')}>
                        <Ionicons name="document-text-outline" size={24} color="#555" />
                        <Text style={styles.menuText}>내가 쓴 게시글</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/profile/wishlist')}>
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
                                        <TouchableOpacity style={styles.unblockBtn} onPress={() => handleUnblock(blockedUser.uid, blockedUser.displayName)}>
                                            <Text style={styles.unblockText}>해제</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </View>
                    )}
                </View>
                
                <View style={styles.footerSection}>
                    <TouchableOpacity onPress={handleDeleteAccount}>
                        <Text style={styles.deleteAccountText}>회원 탈퇴</Text>
                    </TouchableOpacity>
                </View>
            </>
        )}
        
        <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', minHeight: 60, paddingTop: 10 },
  header: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ff5c5c', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 13, marginLeft: 4 },
  
  // 에러 카드 스타일
  errorCard: { margin: 20, padding: 30, backgroundColor: '#fff', borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 10 },
  errorSubText: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 5 },

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
  footerSection: { alignItems: 'center', paddingVertical: 20, marginTop: 10 },
  deleteAccountText: { color: '#999', textDecorationLine: 'underline', fontSize: 14 },
});