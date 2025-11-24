// app/(tabs)/clublist.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// --- Types ---
interface ClubPost {
  id: string;
  clubName: string;
  description: string;
  activityField: string;
  memberLimit: number;
  currentMembers: string[];
  creatorId: string;
  imageUrl?: string;
}

// ✨ [수정됨] ClubItem 컴포넌트 정의 분리 및 memo 적용
const ClubItemBase = ({ item, onPress }: { item: ClubPost, onPress: (post: ClubPost) => void }) => {
  const isFull = item.currentMembers.length >= item.memberLimit;
  
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={styles.noImagePlaceholder}>
            <Ionicons name="image-outline" size={30} color="#ccc" />
          </View>
        )}
        
        <View style={styles.textContainer}> 
          <Text style={styles.clubName} numberOfLines={1}>{item.clubName}</Text>
          <View style={styles.tagContainer}>
            <Text style={styles.activityFieldTag}>{item.activityField}</Text>
            <View style={[styles.memberStatusTag, isFull && styles.memberStatusFull]}>
              <Text style={styles.memberStatusText}>
                {item.currentMembers.length} / {item.memberLimit}명 {isFull ? '(완료)' : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// 여기서 이름을 명시적으로 부여하고 memo를 적용합니다.
const ClubItem = memo(ClubItemBase);
ClubItem.displayName = 'ClubItem'; // ✨ 이 줄이 에러를 확실하게 해결합니다.

// --- Main Screen ---
export default function ClubListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const currentUserId = currentUser?.uid;

  // State
  const [clubPosts, setClubPosts] = useState<ClubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ClubPost | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  const [selectedFilter, setSelectedFilter] = useState('전체');
  const [isSearching, setIsSearching] = useState(false); 
  const [searchQuery, setSearchQuery] = useState('');   

  // BackHandler Logic
  useEffect(() => {
    const backAction = () => {
      if (isSearching) {
        setIsSearching(false);
        setSearchQuery('');
        return true; 
      }
      if (modalVisible) {
        setModalVisible(false);
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isSearching, modalVisible]);

  // Data Fetching
  const fetchClubPosts = useCallback(() => {
    if (!currentUser) { 
      setLoading(false);
      setClubPosts([]);
      return () => {};
    }

    setLoading(true);
    let q = query(collection(db, 'clubPosts'));

    if (selectedFilter !== '전체') {
      q = query(q, where('activityField', '==', selectedFilter));
    }

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const postsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          clubName: data.clubName,
          description: data.description,
          activityField: data.activityField,
          memberLimit: data.memberLimit,
          currentMembers: data.currentMembers || [],
          creatorId: data.creatorId,
          imageUrl: data.imageUrl,
        };
      }) as ClubPost[];
      
      // 최신순 정렬
      postsData.sort((a, b) => (b.id > a.id ? 1 : -1));

      setClubPosts(postsData);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      console.log("Firestore Error:", error);
      setLoading(false);
      setRefreshing(false);
    });

    return unsubscribe;
  }, [currentUser, selectedFilter]); 

  useEffect(() => { 
    const unsub = fetchClubPosts(); 
    return () => unsub(); 
  }, [fetchClubPosts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // [최적화] 검색 필터링 useMemo 적용
  const displayedPosts = useMemo(() => {
    if (!searchQuery.trim()) return clubPosts;
    const lowerQuery = searchQuery.toLowerCase();
    return clubPosts.filter(post => 
      post.clubName.toLowerCase().includes(lowerQuery) || 
      post.description.toLowerCase().includes(lowerQuery)
    );
  }, [clubPosts, searchQuery]);

  // Event Handlers
  const handlePressPost = useCallback((post: ClubPost) => {
    setSelectedPost(post);
    setModalVisible(true);
  }, []);

  const handleCreateClubPost = () => {
    if (!currentUser) return Alert.alert("로그인 필요", "로그인 후 작성할 수 있습니다.");
    router.push({ pathname: '/(tabs)/create-club', params: { mode: 'new', t: Date.now().toString() } });
  };

  const handleDeletePost = async (post: ClubPost) => {
    Alert.alert("게시글 삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          try {
            await deleteDoc(doc(db, "clubPosts", post.id));
            Alert.alert("삭제 완료", "게시글이 삭제되었습니다.");
            setModalVisible(false);
          } catch  { Alert.alert("오류", "삭제 실패"); }
      }}
    ]);
  };

  const handleEditPost = (post: ClubPost) => {
    setModalVisible(false);
    router.push({
      pathname: '/(tabs)/create-club',
      params: {
        mode: 'edit',
        postId: post.id,
        initialClubName: post.clubName,
        initialDescription: post.description,
        initialActivityField: post.activityField,
        initialMemberLimit: post.memberLimit.toString(),
        initialImageUrl: post.imageUrl ? encodeURIComponent(post.imageUrl) : '',
      }
    });
  };

  const handleApplyAndChat = async (post: ClubPost) => {
    if (!currentUser || !currentUserId) return Alert.alert("로그인 필요", "로그인이 필요합니다.");
    if (post.creatorId === currentUserId) return Alert.alert("내 게시글", "본인 글입니다.");
    
    // 이미 가입된 경우
    if (post.currentMembers.includes(currentUserId)) {
      Alert.alert("이미 신청 완료", "채팅방으로 이동합니다.");
      navigateToDmChat(post.creatorId, currentUserId, post.clubName, post.id);
      setModalVisible(false);
      return;
    }

    // 인원 초과 확인
    if (post.currentMembers.length >= post.memberLimit) return Alert.alert("모집 완료", "인원이 가득 찼습니다.");

    Alert.alert("동아리 신청", `'${post.clubName}'에 신청하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      { text: "신청", onPress: async () => {
          await updateDoc(doc(db, "clubPosts", post.id), { currentMembers: arrayUnion(currentUserId) });
          await navigateToDmChat(post.creatorId, currentUserId, post.clubName, post.id);
          setModalVisible(false);
      }}
    ]);
  };

  const navigateToDmChat = async (targetUserId: string, currentUserId: string, postTitle: string, postId: string) => {
    const sortedUids = [targetUserId, currentUserId].sort();
    const chatRoomId = `dm_${postId}_${sortedUids.join('_')}`; 
    const chatRoomRef = doc(db, "chatRooms", chatRoomId);
    try {
      const chatRoomSnap = await getDoc(chatRoomRef);
      if (!chatRoomSnap.exists()) {
        let department = "학과미정";
        try {
          const userSnap = await getDoc(doc(db, "users", currentUserId));
          if (userSnap.exists() && userSnap.data().department) department = userSnap.data().department;
        } catch {}

        let roomName = `${department} 문의`;
        if (currentUser?.email) {
           const prefix = currentUser.email.split('@')[0];
           const two = prefix.substring(0, 2);
           if (!isNaN(Number(two)) && two.length === 2) roomName = `${two}학번 ${department} 문의`;
           else roomName = `${prefix}님 ${department} 문의`;
        }

        await setDoc(chatRoomRef, {
          name: roomName,
          members: sortedUids,
          type: 'dm',
          clubId: postId,
          createdAt: serverTimestamp(),
          lastReadBy: {[targetUserId]: serverTimestamp(), [currentUserId]: serverTimestamp()}
        });
      } else {
        await updateDoc(chatRoomRef, { members: arrayUnion(targetUserId, currentUserId) });
      }
      router.push(`/chat/${chatRoomId}`);
    } catch { Alert.alert("오류", "채팅방 연결 실패"); }
  };

  // ✨ [최적화 2] 렌더링 함수
  const renderItem = useCallback(({ item }: { item: ClubPost }) => (
    <ClubItem item={item} onPress={handlePressPost} />
  ), [handlePressPost]);


  // --- Render ---
  if (loading) return <SafeAreaView style={[styles.centerContainer]}><ActivityIndicator size="large" color="#0062ffff" /></SafeAreaView>;
  
  if (!currentUser) return (
    <SafeAreaView style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <Text style={styles.headerTitle}>동아리·학회</Text>
        </View>
        <View style={styles.emptyListContainer}>
            <Text style={styles.emptyListText}>로그인 필요</Text>
            <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.loginButtonText}>로그인</Text>
            </TouchableOpacity>
        </View>
    </SafeAreaView>
  );

  // Modal Render Logic Helpers
  const isMyPost = currentUserId && selectedPost?.creatorId === currentUserId;
  const isSelectedPostFull = selectedPost ? selectedPost.currentMembers.length >= selectedPost.memberLimit : false;
  const isSelectedPostJoined = selectedPost && currentUserId ? selectedPost.currentMembers.includes(currentUserId) : false;
  
  // 버튼 텍스트 및 활성화 상태 결정
  const getModalButtonState = () => {
    if (isSelectedPostJoined) return { text: "채팅방으로 이동", disabled: false };
    if (isSelectedPostFull) return { text: "모집 완료", disabled: true };
    return { text: "신청하고 채팅하기", disabled: false };
  };
  const modalBtnState = getModalButtonState();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}> 
        {isSearching ? (
          <View style={styles.searchBarContainer}>
             <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery(''); }} style={{marginRight: 10}}>
               <Ionicons name="arrow-back" size={24} color="#333" />
             </TouchableOpacity>
             <TextInput
               style={styles.searchInput}
               placeholder="동아리 이름, 내용 검색"
               value={searchQuery}
               onChangeText={setSearchQuery}
               autoFocus
             />
             {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
             )}
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>동아리·학회</Text>
            <TouchableOpacity style={styles.searchButton} onPress={() => setIsSearching(true)}>
              <Ionicons name="search-outline" size={24} color="#555" />
            </TouchableOpacity>
          </>
        )}
      </View>
      
      {/* Filter Bar */}
      {!isSearching && (
        <View style={styles.filterBar}>
          {['전체', '학술', '스포츠', '봉사', '창작', '예술', '기타'].map((field) => (
            <TouchableOpacity 
                key={field} 
                style={[styles.filterButton, selectedFilter === field && styles.filterButtonActive]} 
                onPress={() => setSelectedFilter(field)}
            >
              <Text style={[styles.filterButtonText, selectedFilter === field && styles.filterButtonTextActive]}>{field}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* List */}
      <FlatList
        data={displayedPosts} 
        renderItem={renderItem} 
        keyExtractor={item => item.id}
        contentContainerStyle={styles.flatListContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
        ListEmptyComponent={
            <View style={styles.emptyListContainer}>
                <Text style={styles.emptyListText}>{searchQuery ? "검색 결과 없음" : "내용 없음"}</Text>
            </View>
        }
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleCreateClubPost}>
        <Ionicons name="pencil" size={24} color="white" />
        <Text style={styles.fabText}> 글 쓰기</Text>
      </TouchableOpacity>

      {/* Detail Modal */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modalContainer}>
            <View style={[modalStyles.modalHeader, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={modalStyles.closeButton}>
                <Ionicons name="arrow-back" size={28} color="#999" />
              </TouchableOpacity>
              <Text style={modalStyles.modalTitle} numberOfLines={1}>{selectedPost?.clubName}</Text>
              <View style={modalStyles.closeButton} />
            </View>
            
            <ScrollView contentContainerStyle={modalStyles.scrollViewContent}>
              {selectedPost?.imageUrl && <Image source={{ uri: selectedPost.imageUrl }} style={modalStyles.modalImage} />}
              <Text style={modalStyles.modalSubTitle}>분야: {selectedPost?.activityField}</Text>
              <Text style={modalStyles.modalSubTitle}>인원: {selectedPost?.currentMembers.length} / {selectedPost?.memberLimit}명</Text>
              <Text style={modalStyles.modalDescription}>{selectedPost?.description}</Text>
            </ScrollView>

            {isMyPost ? (
               <View style={modalStyles.ownerButtonContainer}>
                  <TouchableOpacity 
                    style={[modalStyles.actionButton, modalStyles.editButton]} 
                    onPress={() => selectedPost && handleEditPost(selectedPost)}
                  >
                    <Text style={modalStyles.actionButtonText}>수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[modalStyles.actionButton, modalStyles.deleteButton]} 
                    onPress={() => selectedPost && handleDeletePost(selectedPost)}
                  >
                    <Text style={[modalStyles.actionButtonText, {color: '#fff'}]}>삭제</Text>
                  </TouchableOpacity>
               </View>
            ) : (
              <TouchableOpacity
                style={[modalStyles.applyButton, modalBtnState.disabled && modalStyles.applyButtonDisabled]}
                onPress={() => selectedPost && handleApplyAndChat(selectedPost)}
                disabled={modalBtnState.disabled}
              >
                <Text style={modalStyles.applyButtonText}>{modalBtnState.text}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5' },
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff', 
    borderBottomWidth: 1, borderBottomColor: '#eee' 
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  searchButton: { padding: 5 },
  searchBarContainer: { 
    flex: 1, flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#f5f5f5', borderRadius: 20, 
    paddingHorizontal: 10, paddingVertical: 5 
  },
  searchInput: { flex: 1, fontSize: 16, color: '#333', paddingVertical: 5 },
  filterBar: { 
    flexDirection: 'row', flexWrap: 'wrap', 
    paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#fff', 
    borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 10 
  },
  filterButton: { 
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, 
    backgroundColor: '#f0f0f0', marginRight: 8, marginBottom: 8 
  },
  filterButtonActive: { backgroundColor: '#0062ffff' },
  filterButtonText: { color: '#555', fontWeight: '500' },
  filterButtonTextActive: { color: '#fff', fontWeight: 'bold' },
  flatListContent: { paddingHorizontal: 15, paddingBottom: 100 },
  card: { 
    backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, padding: 15, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.1, shadowRadius: 2, elevation: 3 
  },
  cardContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  noImagePlaceholder: { 
    width: 80, height: 80, borderRadius: 8, backgroundColor: '#f5f5f5', 
    justifyContent: 'center', alignItems: 'center', marginRight: 15, 
    borderWidth: 1, borderColor: '#ddd' 
  },
  cardImage: { width: 80, height: 80, borderRadius: 8, marginRight: 15, resizeMode: 'cover' },
  textContainer: { flex: 1 },
  clubName: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  tagContainer: { flexDirection: 'row', marginBottom: 5 },
  activityFieldTag: { 
    backgroundColor: '#e0f7fa', color: '#00796b', fontSize: 12, 
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginRight: 8 
  },
  // [수정] View 스타일 (fontSize 제거)
  memberStatusTag: { 
    backgroundColor: '#ffe0b2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 
  },
  memberStatusFull: { backgroundColor: '#ffcdd2' },
  memberStatusText: { fontSize: 12, color: '#333' },
  description: { fontSize: 14, color: '#555', marginBottom: 5 },
  
  // [수정] fab 중복 제거 및 통합
  fab: { 
    position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 20, right: 20, 
    backgroundColor: '#0062ffff', borderRadius: 30, width: 120, height: 50, 
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', 
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5, zIndex: 9999 
  },
  fabText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },
  emptyListContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 50 },
  emptyListText: { fontSize: 16, color: '#666', marginTop: 10 },
  loginButton: { backgroundColor: '#0062ffff', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, marginTop: 20 },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  modalContainer: { 
    width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, 
    maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 30 : 0 
  },
  modalHeader: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', 
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 
  },
  closeButton: { padding: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1, textAlign: 'center', marginHorizontal: 10 },
  scrollViewContent: { padding: 20 },
  modalImage: { width: '100%', height: 200, borderRadius: 10, marginBottom: 15, resizeMode: 'cover' },
  modalSubTitle: { fontSize: 16, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  modalDescription: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 20 },
  applyButton: { backgroundColor: '#0062ffff', paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginHorizontal: 20, marginBottom: 20 },
  applyButtonJoined: { backgroundColor: '#1E88E5' },
  applyButtonDisabled: { backgroundColor: '#cccccc' },
  applyButtonText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  ownerButtonContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
  actionButton: { flex: 1, paddingVertical: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  editButton: { backgroundColor: '#f0f0f0', marginRight: 10, borderWidth: 1, borderColor: '#ddd' },
  deleteButton: { backgroundColor: '#dc3545', marginLeft: 10 },
  actionButtonText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
});