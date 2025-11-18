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
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler, // ✨ BackHandler 추가
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

export default function ClubListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const currentUserId = currentUser?.uid;

  const [clubPosts, setClubPosts] = useState<ClubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ClubPost | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  const [selectedFilter, setSelectedFilter] = useState('전체');
  const [isSearching, setIsSearching] = useState(false); 
  const [searchQuery, setSearchQuery] = useState('');   

  // ✨ [추가됨] 하드웨어 뒤로 가기 버튼 핸들링
  useEffect(() => {
    const backAction = () => {
      // 검색 모드가 켜져 있거나, 모달이 켜져 있으면 -> 닫고 true 반환 (앱 종료 방지)
      if (isSearching) {
        setIsSearching(false);
        setSearchQuery(''); // 검색어도 초기화 (선택사항)
        return true; 
      }
      if (modalVisible) {
        setModalVisible(false);
        return true;
      }
      // 아무것도 안 켜져 있으면 -> 기본 동작 (앱 종료 or 이전 화면)
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [isSearching, modalVisible]); // 의존성 배열에 상태 추가


  // ------------------------------------------------------------------
  // 1. 데이터 로드
  // ------------------------------------------------------------------
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

      setClubPosts(postsData);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      console.error("Error fetching club posts:", error);
      Alert.alert("오류", "데이터를 불러오지 못했습니다.");
      setLoading(false);
      setRefreshing(false);
    });

    return unsubscribe;
  }, [currentUser, selectedFilter]); 

  useEffect(() => {
    const unsubscribe = fetchClubPosts();
    return () => unsubscribe();
  }, [fetchClubPosts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // ------------------------------------------------------------------
  // 2. 검색 로직
  // ------------------------------------------------------------------
  const getFilteredPosts = () => {
    if (!searchQuery.trim()) {
      return clubPosts; 
    }
    const lowerQuery = searchQuery.toLowerCase();
    return clubPosts.filter(post => 
      post.clubName.toLowerCase().includes(lowerQuery) || 
      post.description.toLowerCase().includes(lowerQuery)
    );
  };

  const displayedPosts = getFilteredPosts();


  // ------------------------------------------------------------------
  // 3. 이벤트 핸들러
  // ------------------------------------------------------------------
  const handlePressPost = (post: ClubPost) => {
    setSelectedPost(post);
    setModalVisible(true);
  };

  const handleCreateClubPost = () => {
    if (!currentUser) {
      Alert.alert("로그인 필요", "로그인 후 작성할 수 있습니다.");
      return;
    }
    router.push({
      pathname: '/(tabs)/create-club',
      params: { mode: 'new', t: Date.now().toString() }
    });
  };

  const handleDeletePost = async (post: ClubPost) => {
    Alert.alert(
      "게시글 삭제",
      "정말로 이 모집글을 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "clubPosts", post.id));
              Alert.alert("삭제 완료", "게시글이 삭제되었습니다.");
              setModalVisible(false);
            } catch (error) {
              console.error("Delete error:", error);
              Alert.alert("오류", "삭제 중 문제가 발생했습니다.");
            }
          }
        }
      ]
    );
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
        initialImageUrl: post.imageUrl || '',
      }
    });
  };

  const handleApplyAndChat = async (post: ClubPost) => {
    if (!currentUser || !currentUserId) return Alert.alert("로그인 필요", "로그인이 필요합니다.");

    const creatorId = post.creatorId;
    const isCreator = currentUserId === creatorId;
    const isJoined = currentUserId && post.currentMembers.includes(currentUserId);

    if (isCreator) {
      Alert.alert("내 게시글", "본인이 작성한 글입니다.\n지원자들의 문의는 '채팅' 탭에서 확인하세요.");
      setModalVisible(false); 
      return; 
    } 
    
    if (isJoined) {
      Alert.alert("이미 신청 완료", "이미 신청하셨습니다. 채팅방으로 이동합니다.");
      navigateToDmChat(creatorId, currentUserId, post.clubName, post.id);
      setModalVisible(false);
      return;
    }

    if (post.currentMembers.length >= post.memberLimit) {
      Alert.alert("모집 완료", "모집 인원이 가득 찼습니다.");
      return;
    }

    Alert.alert(
      "동아리 신청",
      `'${post.clubName}'에 신청하고 문의 채팅을 시작하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "신청 및 채팅",
          onPress: async () => {
            try {
              const clubRef = doc(db, "clubPosts", post.id);
              await updateDoc(clubRef, {
                currentMembers: arrayUnion(currentUserId)
              });
              await navigateToDmChat(creatorId, currentUserId, post.clubName, post.id);
              setModalVisible(false);
            } catch (error) {
              console.error("Error applying:", error);
              Alert.alert("오류", "신청 중 오류가 발생했습니다.");
            }
          }
        }
      ]
    );
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
          const userDocRef = doc(db, "users", currentUserId);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.department) department = userData.department;
          }
        } catch (err) { console.log("유저 정보 로드 실패", err); }

        let roomName = `${department} 문의`;
        const userEmail = currentUser?.email;

        if (userEmail) {
           const emailPrefix = userEmail.split('@')[0];
           const twoChars = emailPrefix.substring(0, 2);
           if (!isNaN(Number(twoChars)) && twoChars.length === 2) {
             roomName = `${twoChars}학번 ${department} 문의`;
           } else {
             roomName = `${emailPrefix}님 ${department} 문의`;
           }
        }

        await setDoc(chatRoomRef, {
          name: roomName,
          members: sortedUids,
          type: 'dm',
          clubId: postId,
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastMessageTimestamp: null,
          lastReadBy: { 
            [targetUserId]: serverTimestamp(),
            [currentUserId]: serverTimestamp(),
          },
        });
      } else {
        await updateDoc(chatRoomRef, {
          members: arrayUnion(targetUserId, currentUserId)
        });
      }
      router.push(`/chat/${chatRoomId}`);
    } catch (error: any) {
      console.error("Error navigating to DM chat:", error);
      Alert.alert("오류", "채팅방 연결에 실패했습니다.");
    }
  };


  // ------------------------------------------------------------------
  // 4. UI 렌더링
  // ------------------------------------------------------------------
  const renderItem = ({ item: post }: { item: ClubPost }) => {
    const isFull = post.currentMembers.length >= post.memberLimit;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePressPost(post)}
        activeOpacity={0.8}
      >
        <View style={styles.cardContent}>
          {post.imageUrl ? (
            <Image source={{ uri: post.imageUrl }} style={styles.cardImage} />
          ) : (
            <View style={styles.noImagePlaceholder}>
              <Ionicons name="image-outline" size={30} color="#ccc" />
            </View>
          )}
          
          <View style={styles.textContainer}> 
            <Text style={styles.clubName} numberOfLines={1}>{post.clubName}</Text>
            <View style={styles.tagContainer}>
              <Text style={styles.activityFieldTag}>{post.activityField}</Text>
              <View style={[styles.memberStatusTag, isFull && styles.memberStatusFull]}>
                <Text style={styles.memberStatusText}>
                  {post.currentMembers.length} / {post.memberLimit}명 {isFull ? '(완료)' : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.description} numberOfLines={2}>{post.description}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { paddingTop: insets.top, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#0062ffff" />
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaView style={[styles.container, { paddingTop: 0 }]}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}> 
          <Text style={styles.headerTitle}>동아리·학회</Text>
        </View>
        <View style={styles.emptyListContainer}>
          <Text style={styles.emptyListText}>로그인 후 이용해주세요.</Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.loginButtonText}>로그인하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isMyPost = currentUserId && selectedPost?.creatorId === currentUserId;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: 0 }]}> 
      
      {/* 헤더 영역 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}> 
        {isSearching ? (
          <View style={styles.searchBarContainer}>
             {/* 여기 화살표를 눌러도 닫히고, 폰의 뒤로가기 버튼을 눌러도 닫힘 */}
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
            <TouchableOpacity 
              style={styles.searchButton}
              onPress={() => setIsSearching(true)}
            >
              <Ionicons name="search-outline" size={24} color="#555" />
            </TouchableOpacity>
          </>
        )}
      </View>
      
      {/* 카테고리 필터 (검색 중엔 숨김) */}
      {!isSearching && (
        <View style={styles.filterBar}>
          {['전체', '학술', '스포츠', '봉사', '창작', '예술', '기타'].map((field) => (
            <TouchableOpacity
              key={field}
              style={[styles.filterButton, selectedFilter === field && styles.filterButtonActive]}
              onPress={() => setSelectedFilter(field)}
            >
              <Text style={[styles.filterButtonText, selectedFilter === field && styles.filterButtonTextActive]}>
                {field}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={displayedPosts}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.flatListContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyListContainer}>
            <Text style={styles.emptyListText}>
               {searchQuery ? "검색 결과가 없습니다." : "등록된 모집글이 없습니다."}
            </Text>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={handleCreateClubPost}>
        <Ionicons name="pencil" size={24} color="white" />
        <Text style={styles.fabText}> 글 쓰기</Text>
      </TouchableOpacity>

      {/* 상세 모달 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
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
              {selectedPost?.imageUrl && (
                <Image source={{ uri: selectedPost.imageUrl }} style={modalStyles.modalImage} />
              )}
              <Text style={modalStyles.modalSubTitle}>분야: <Text style={{fontWeight: 'normal'}}>{selectedPost?.activityField}</Text></Text> 
              <Text style={modalStyles.modalSubTitle}>
                인원: <Text style={{fontWeight: 'normal'}}>
                  {selectedPost?.currentMembers.length} / {selectedPost?.memberLimit}명
                </Text>
              </Text>
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
                style={[
                  modalStyles.applyButton,
                  (currentUserId && selectedPost?.currentMembers.includes(currentUserId)) && modalStyles.applyButtonJoined,
                  (selectedPost?.currentMembers.length === selectedPost?.memberLimit) && (!currentUserId || !selectedPost?.currentMembers.includes(currentUserId)) && modalStyles.applyButtonDisabled
                ]}
                onPress={() => selectedPost && handleApplyAndChat(selectedPost)}
                disabled={(selectedPost?.currentMembers.length === selectedPost?.memberLimit) && (!currentUserId || !selectedPost?.currentMembers.includes(currentUserId))}
              >
                <Text style={modalStyles.applyButtonText}>
                  {currentUserId && selectedPost?.currentMembers.includes(currentUserId)
                    ? "채팅방으로 이동"
                    : (selectedPost?.currentMembers.length === selectedPost?.memberLimit
                      ? "모집 완료"
                      : "신청하고 채팅하기"
                    )}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  searchButton: { padding: 5 },
  
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 5,
  },

  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 10,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    marginBottom: 8,
  },
  filterButtonActive: { backgroundColor: '#0062ffff' },
  filterButtonText: { color: '#555', fontWeight: '500' },
  filterButtonTextActive: { color: '#fff', fontWeight: 'bold' },
  flatListContent: { paddingHorizontal: 15, paddingBottom: 100 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  cardContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  noImagePlaceholder: {
    width: 80, height: 80, borderRadius: 8, backgroundColor: '#f5f5f5',
    justifyContent: 'center', alignItems: 'center', marginRight: 15,
    borderWidth: 1, borderColor: '#ddd',
  },
  cardImage: { width: 80, height: 80, borderRadius: 8, marginRight: 15, resizeMode: 'cover' },
  textContainer: { flex: 1 },
  clubName: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  tagContainer: { flexDirection: 'row', marginBottom: 5 },
  activityFieldTag: {
    backgroundColor: '#e0f7fa', color: '#00796b', fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginRight: 8,
  },
  memberStatusTag: {
    backgroundColor: '#ffe0b2', fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5,
  },
  memberStatusFull: { backgroundColor: '#ffcdd2' },
  memberStatusText: { fontSize: 12, color: '#333' },
  description: { fontSize: 14, color: '#555', marginBottom: 5 },
  fab: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 30 : 20, right: 20,
    backgroundColor: '#0062ffff', borderRadius: 30, width: 120, height: 50,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5,
  },
  fabText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },
  emptyListContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 50 },
  emptyListText: { fontSize: 16, color: '#666', marginTop: 10 },
  loginButton: { backgroundColor: '#0062ffff', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, marginTop: 20 },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end', alignItems: 'center',
  },
  modalContainer: {
    width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', paddingBottom: Platform.OS === 'ios' ? 30 : 0,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee',
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  closeButton: { padding: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1, textAlign: 'center', marginHorizontal: 10 },
  scrollViewContent: { padding: 20 },
  modalImage: { width: '100%', height: 200, borderRadius: 10, marginBottom: 15, resizeMode: 'cover' },
  modalSubTitle: { fontSize: 16, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  modalDescription: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 20 },
  
  applyButton: {
    backgroundColor: '#0062ffff', paddingVertical: 15, borderRadius: 10, alignItems: 'center',
    marginHorizontal: 20, marginBottom: 20,
  },
  applyButtonJoined: { backgroundColor: '#1E88E5' },
  applyButtonDisabled: { backgroundColor: '#cccccc' },
  applyButtonText: { color: 'white', fontWeight: 'bold', fontSize: 18 },

  ownerButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    marginLeft: 10,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
});