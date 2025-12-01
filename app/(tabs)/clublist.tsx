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
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// [최적화] 고성능 이미지 컴포넌트
import { Image } from 'expo-image';
// [추가] 이미지 확대 뷰어
import ImageView from 'react-native-image-viewing';

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

// ✨ 리스트 아이템 컴포넌트
const ClubItemBase = ({ item, onPress }: { item: ClubPost, onPress: (post: ClubPost) => void }) => {
  const isFull = item.currentMembers.length >= item.memberLimit;
  
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.cardInner}>
        {/* 이미지 영역 */}
        <View style={styles.imageContainer}>
          {item.imageUrl ? (
            <Image 
              source={{ uri: item.imageUrl }} 
              style={styles.cardImage} 
              contentFit="cover"
              transition={300} 
            />
          ) : (
            <View style={styles.noImagePlaceholder}>
              <Ionicons name="people" size={32} color="#C4C4C4" />
            </View>
          )}
        </View>
        
        {/* 텍스트 영역 */}
        <View style={styles.textContainer}> 
          <View style={styles.cardHeaderRow}>
            <Text style={styles.clubName} numberOfLines={1}>{item.clubName}</Text>
            {/* 모집 상태 뱃지 */}
            <View style={[styles.statusDot, { backgroundColor: isFull ? '#ff5252' : '#00c853' }]} />
          </View>

          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>

          {/* 태그 영역 */}
          <View style={styles.tagRow}>
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{item.activityField}</Text>
            </View>
            <View style={[styles.memberTag, isFull && styles.memberTagFull]}>
              <Ionicons name="person" size={10} color={isFull ? '#d32f2f' : '#555'} style={{marginRight: 2}}/>
              <Text style={[styles.memberTagText, isFull && styles.memberTagTextFull]}>
                {item.currentMembers.length}/{item.memberLimit} {isFull ? '마감' : ''}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const ClubItem = memo(ClubItemBase);
ClubItem.displayName = 'ClubItem';

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
  
  // 모달 상태
  const [modalVisible, setModalVisible] = useState(false);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);

  // 검색/필터 상태
  const [selectedFilter, setSelectedFilter] = useState('전체');
  const [isSearching, setIsSearching] = useState(false); 
  const [searchQuery, setSearchQuery] = useState('');   

  // ✅ 뒤로가기 핸들링
  useEffect(() => {
    const backAction = () => {
      if (isImageViewerVisible) { 
        setIsImageViewerVisible(false); 
        return true; 
      }
      if (modalVisible) { 
        setModalVisible(false); 
        return true; 
      }
      if (isSearching) { 
        setIsSearching(false); 
        setSearchQuery(''); 
        return true; 
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isSearching, modalVisible, isImageViewerVisible]);

  // 데이터 로드
  const fetchClubPosts = useCallback(() => {
    if (!currentUser) { setLoading(false); setClubPosts([]); return () => {}; }
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
      
      postsData.sort((a, b) => (b.id > a.id ? 1 : -1));
      setClubPosts(postsData);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser, selectedFilter]); 

  useEffect(() => { const unsub = fetchClubPosts(); return () => unsub(); }, [fetchClubPosts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // 검색 필터링
  const displayedPosts = useMemo(() => {
    if (!searchQuery.trim()) return clubPosts;
    const lowerQuery = searchQuery.toLowerCase();
    return clubPosts.filter(post => 
      post.clubName.toLowerCase().includes(lowerQuery) || 
      post.description.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, clubPosts]);

  const handlePressPost = useCallback((post: ClubPost) => {
    setSelectedPost(post);
    setModalVisible(true);
  }, []);

  const renderItem = useCallback(({ item }: { item: ClubPost }) => (
    <ClubItem item={item} onPress={handlePressPost} />
  ), [handlePressPost]);

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
    
    if (post.currentMembers.includes(currentUserId)) {
      Alert.alert("알림", "이미 가입된 채팅방으로 이동합니다.");
      navigateToDmChat(post.creatorId, currentUserId, post.clubName, post.id);
      setModalVisible(false);
      return;
    }

    if (post.currentMembers.length >= post.memberLimit) return Alert.alert("모집 완료", "인원이 가득 찼습니다.");

    Alert.alert("동아리 신청", `'${post.clubName}'에 신청하고 채팅을 시작할까요?`, [
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
           roomName = `${prefix}님 ${department} 문의`;
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

  if (loading) return <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator size="large" color="#0062ffff" /></View>;
  
  if (!currentUser) return (
    <View style={styles.container}>
        <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
            <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>동아리</Text>
            </View>
        </View>
        <View style={styles.emptyListContainer}>
            <Ionicons name="lock-closed-outline" size={60} color="#ccc" style={{marginBottom: 10}}/>
            <Text style={styles.emptyListText}>로그인이 필요한 서비스입니다.</Text>
            <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.loginButtonText}>로그인 하러가기</Text>
            </TouchableOpacity>
        </View>
    </View>
  );

  const isMyPost = currentUserId && selectedPost?.creatorId === currentUserId;
  const isSelectedPostFull = selectedPost ? selectedPost.currentMembers.length >= selectedPost.memberLimit : false;
  const isSelectedPostJoined = selectedPost && currentUserId ? selectedPost.currentMembers.includes(currentUserId) : false;
  
  const getModalButtonState = () => {
    if (isSelectedPostJoined) return { text: "💬 채팅방 입장", disabled: false, style: modalStyles.applyButtonJoined };
    if (isSelectedPostFull) return { text: "🚫 모집 완료", disabled: true, style: modalStyles.applyButtonDisabled };
    return { text: "👋 신청하고 채팅하기", disabled: false, style: modalStyles.applyButton };
  };
  const modalBtnState = getModalButtonState();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* 1. Header */}
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}> 
        {isSearching ? (
          <View style={styles.searchBarWrapper}>
             <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery(''); }} style={{padding: 8}}>
               <Ionicons name="arrow-back" size={24} color="#333" />
             </TouchableOpacity>
             <TextInput
                style={styles.searchInput}
                placeholder="동아리 이름, 키워드 검색"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                placeholderTextColor="#999"
             />
             {searchQuery.length > 0 && (
                 <TouchableOpacity onPress={() => setSearchQuery('')} style={{padding: 8}}>
                     <Ionicons name="close-circle" size={20} color="#ccc" />
                 </TouchableOpacity>
             )}
          </View>
        ) : (
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>동아리</Text>
            <TouchableOpacity style={styles.iconButton} onPress={() => setIsSearching(true)}>
              <Ionicons name="search" size={24} color="#333" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {/* 2. Filter Bar */}
      {!isSearching && (
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {['전체', '학술', '스포츠', '봉사', '창작', '예술', '기타'].map((field) => (
              <TouchableOpacity 
                key={field} 
                style={[styles.filterButton, selectedFilter === field && styles.filterButtonActive]} 
                onPress={() => setSelectedFilter(field)}
              >
                <Text style={[styles.filterButtonText, selectedFilter === field && styles.filterButtonTextActive]}>{field}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 3. Main List */}
      <FlatList
        data={displayedPosts}
        renderItem={renderItem} 
        keyExtractor={item => item.id}
        contentContainerStyle={styles.flatListContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
        ListEmptyComponent={
            <View style={styles.emptyListContainer}>
                <Ionicons name="search-outline" size={50} color="#ddd" />
                <Text style={styles.emptyListText}>{searchQuery ? "검색 결과가 없습니다." : "등록된 동아리가 없습니다."}</Text>
            </View>
        }
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      {/* 4. FAB (모달 없을 때만 표시) */}
      {!modalVisible && (
        <TouchableOpacity 
            style={[styles.fab, { bottom: 90, right: 20 }]} 
            onPress={handleCreateClubPost} 
            activeOpacity={0.9}
        >
            <Ionicons name="add" size={26} color="white" />
            <Text style={styles.fabText}>모집하기</Text>
        </TouchableOpacity>
      )}

      {/* 5. Detail View (Fake Modal) */}
      {modalVisible && (
        <View style={styles.fakeModalContainer}>
            <View style={modalStyles.overlay}>
              <TouchableOpacity style={modalStyles.backdrop} onPress={() => setModalVisible(false)} activeOpacity={1} />
              
              <View style={modalStyles.modalContainer}>
                {/* Modal Handle */}
                <View style={modalStyles.handleBarContainer}>
                    <View style={modalStyles.handleBar} />
                </View>

                {/* 닫기 버튼 */}
                <TouchableOpacity onPress={() => setModalVisible(false)} style={modalStyles.modalCloseBtn}>
                    <Ionicons name="close" size={28} color="#555" />
                </TouchableOpacity>

                <View style={modalStyles.modalContent}>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 40}}>
                        {/* ✨ [핵심 수정] 중고장터처럼 'contain' 비율로 변경 & 높이 350 */}
                        {selectedPost?.imageUrl && (
                            <TouchableOpacity 
                                onPress={() => setIsImageViewerVisible(true)} 
                                activeOpacity={0.9}
                                style={{backgroundColor: '#000'}} // 배경색 검정
                            >
                                <Image 
                                    source={{ uri: selectedPost.imageUrl }} 
                                    style={{ 
                                        width: '100%', 
                                        height: 350, // 높이 증가
                                    }} 
                                    contentFit="contain" // 🔥 원본 비율 유지
                                    cachePolicy="memory-disk"
                                />
                                <View style={modalStyles.imageZoomHint}>
                                    <Ionicons name="expand-outline" size={16} color="white" />
                                </View>
                            </TouchableOpacity>
                        )}
                        
                        <View style={modalStyles.modalHeaderSection}>
                            <View style={modalStyles.modalBadgeRow}>
                                <View style={modalStyles.modalCategoryBadge}>
                                    <Text style={modalStyles.modalCategoryText}>{selectedPost?.activityField}</Text>
                                </View>
                                <View style={[modalStyles.modalStatusBadge, isSelectedPostFull && {backgroundColor:'#ffebee'}]}>
                                    <Text style={[modalStyles.modalStatusText, isSelectedPostFull && {color:'#c62828'}]}>
                                        {isSelectedPostFull ? '모집마감' : '모집중'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={modalStyles.modalTitle}>{selectedPost?.clubName}</Text>
                            
                            <View style={modalStyles.infoRow}>
                                <Ionicons name="people-outline" size={18} color="#666" />
                                <Text style={modalStyles.infoText}>
                                    현재 {selectedPost?.currentMembers.length}명 / 정원 {selectedPost?.memberLimit}명
                                </Text>
                            </View>
                        </View>

                        <View style={modalStyles.divider} />

                        <Text style={modalStyles.descriptionTitle}>소개</Text>
                        <Text style={modalStyles.modalDescription}>{selectedPost?.description}</Text>
                    </ScrollView>
                </View>

                {/* Bottom Actions */}
                <View style={[modalStyles.bottomActionContainer, { paddingBottom: insets.bottom + 75 }]}>
                    {isMyPost ? (
                    <View style={modalStyles.ownerButtonContainer}>
                        <TouchableOpacity 
                            style={[modalStyles.actionButton, modalStyles.editButton]} 
                            onPress={() => selectedPost && handleEditPost(selectedPost)}
                        >
                            <Text style={modalStyles.editButtonText}>수정</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[modalStyles.actionButton, modalStyles.deleteButton]} 
                            onPress={() => selectedPost && handleDeletePost(selectedPost)}
                        >
                            <Text style={modalStyles.deleteButtonText}>삭제</Text>
                        </TouchableOpacity>
                    </View>
                    ) : (
                    <TouchableOpacity
                        style={[modalStyles.applyButton, modalBtnState.style]}
                        onPress={() => selectedPost && handleApplyAndChat(selectedPost)}
                        disabled={modalBtnState.disabled}
                    >
                        <Text style={modalStyles.applyButtonText}>{modalBtnState.text}</Text>
                    </TouchableOpacity>
                    )}
                </View>

              </View>
            </View>
        </View>
      )}

      {/* 6. ImageViewer (전체 화면 이미지 뷰어) */}
      {selectedPost?.imageUrl && (
        <ImageView
          images={[{ uri: selectedPost.imageUrl }]}
          imageIndex={0}
          visible={isImageViewerVisible}
          onRequestClose={() => setIsImageViewerVisible(false)}
          swipeToCloseEnabled={true}
          presentationStyle="overFullScreen"
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  
  /* Header UI Fixed */
  headerContainer: { 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f3f5',
    zIndex: 10
  },
  headerContent: {
    height: 56,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  iconButton: { padding: 8, borderRadius: 20, backgroundColor: '#f8f9fa' },
  
  /* Search Bar */
  searchBarWrapper: { 
    height: 56,
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 15,
  },
  searchInput: { 
    flex: 1, 
    height: 40,
    backgroundColor: '#f1f3f5',
    borderRadius: 20,
    paddingHorizontal: 15,
    fontSize: 16, 
    color: '#333', 
    marginLeft: 5 
  },

  /* Filter */
  filterBar: { backgroundColor: '#fff', paddingVertical: 10 },
  filterScroll: { paddingHorizontal: 20 },
  filterButton: { 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: '#f8f9fa', 
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#eee'
  },
  filterButtonActive: { backgroundColor: '#0062ffff', borderColor: '#0062ffff' },
  filterButtonText: { color: '#666', fontWeight: '600', fontSize: 14 },
  filterButtonTextActive: { color: '#fff' },

  /* List */
  flatListContent: { paddingHorizontal: 20, paddingVertical: 15, paddingBottom: 100 },
  
  /* Card Style */
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    marginBottom: 16, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.06, 
    shadowRadius: 8, 
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f5f5f5',
    overflow: 'hidden'
  },
  cardInner: { flexDirection: 'row', padding: 16 },
  imageContainer: { marginRight: 16 },
  cardImage: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#f1f3f5' },
  noImagePlaceholder: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#f8f9fa', justifyContent: 'center', alignItems: 'center' },
  
  textContainer: { flex: 1, justifyContent: 'space-between' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  clubName: { fontSize: 17, fontWeight: 'bold', color: '#222', flex: 1, marginRight: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  
  description: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 8 },
  
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryTag: { backgroundColor: '#eef4ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  categoryTagText: { color: '#0062ffff', fontSize: 11, fontWeight: '700' },
  memberTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  memberTagFull: { backgroundColor: '#ffebee' },
  memberTagText: { color: '#666', fontSize: 11, fontWeight: '600' },
  memberTagTextFull: { color: '#d32f2f' },

  /* Empty State */
  emptyListContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
  emptyListText: { fontSize: 16, color: '#999', marginTop: 10 },
  loginButton: { backgroundColor: '#0062ffff', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 20 },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  /* FAB */
  fab: { 
    position: 'absolute', bottom: 90, right: 20, 
    backgroundColor: '#0062ffff', borderRadius: 30, 
    paddingHorizontal: 20, 
    height: 52, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    shadowColor: '#0062ffff', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 8, 
    elevation: 10, 
    zIndex: 9999,
  },
  fabText: { color: 'white', fontSize: 16, fontWeight: 'bold', marginLeft: 6 },
  
  /* Fake Modal Styles */
  fakeModalContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100, 
  },
});

/* Modal Styles */
const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  modalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '77%', width: '100%', overflow: 'hidden' },
  
  // ✨ [통일] 핸들 바 스타일
  handleBarContainer: { alignItems: 'center', paddingVertical: 12 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0' },
  
  modalCloseBtn: { position: 'absolute', top: 15, right: 15, zIndex: 10, padding: 5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 20 },

  modalContent: { flex: 1 },
  // ✨ [수정] 모달 이미지는 인라인 스타일로 제어하므로 기본값만 설정
  modalImage: { width: '100%', height: 350, backgroundColor: '#000' },
  
  imageZoomHint: { position: 'absolute', right: 15, bottom: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 20 },
  
  modalHeaderSection: { padding: 24, paddingBottom: 15 },
  modalBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  modalCategoryBadge: { backgroundColor: '#0062ffff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  modalCategoryText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  modalStatusBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  modalStatusText: { color: '#2e7d32', fontSize: 12, fontWeight: 'bold' },
  
  modalTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 8, lineHeight: 32 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  infoText: { fontSize: 15, color: '#666', marginLeft: 6, fontWeight: '500' },
  
  divider: { height: 8, backgroundColor: '#f8f9fa' },
  
  descriptionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', paddingHorizontal: 24, marginTop: 24, marginBottom: 10 },
  modalDescription: { fontSize: 16, color: '#444', lineHeight: 26, paddingHorizontal: 24, marginBottom: 40 },
  
  bottomActionContainer: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  
  applyButton: { backgroundColor: '#0062ffff', paddingVertical: 16, borderRadius: 16, alignItems: 'center', shadowColor: '#0062ffff', shadowOpacity: 0.2, shadowOffset:{width:0, height:4}, shadowRadius:8 },
  applyButtonJoined: { backgroundColor: '#4CAF50' },
  applyButtonDisabled: { backgroundColor: '#e0e0e0', shadowOpacity: 0 },
  applyButtonText: { color: 'white', fontWeight: 'bold', fontSize: 17 },
  
  ownerButtonContainer: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  editButton: { backgroundColor: '#f1f3f5' },
  editButtonText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
  deleteButton: { backgroundColor: '#ffebee' },
  deleteButtonText: { color: '#d32f2f', fontWeight: 'bold', fontSize: 16 },
});