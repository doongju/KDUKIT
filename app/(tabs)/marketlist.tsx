// app/(tabs)/marketlist.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  arrayRemove,
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
import { memo, useCallback, useEffect, useState } from 'react';
import {
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

import ImageView from 'react-native-image-viewing';
import BuyerReviewModal from '../../components/BuyerReviewModal';
import ReviewModal from '../../components/ReviewModal';
import UserProfileModal from '../../components/UserProfileModal';

interface MarketPost {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  status: '판매중' | '예약중' | '판매완료';
  creatorId: string;
  imageUrl?: string;
  buyerId?: string;
  isBuyerReviewed?: boolean;
}

// ✨ [최적화 1] 리스트 아이템 컴포넌트 분리 & 메모이제이션
// (스크롤 할 때마다 불필요하게 다시 그려지는 것을 방지)
const MarketItem = memo(({ item, onPress, onToggleWish, onProfilePress, isWished }: any) => {
    let statusColor = '#0062ffff';
    if (item.status === '예약중') statusColor = '#ffc107';
    if (item.status === '판매완료') statusColor = '#dc3545';

    return (
      <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.8}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.cardImage} /> : 
          <View style={styles.noImage}><Ionicons name="image-outline" size={30} color="#ccc" /></View>}
        
        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <TouchableOpacity onPress={() => onToggleWish(item.id)} style={styles.wishButton}>
                  <Ionicons name={isWished ? "heart" : "heart-outline"} size={22} color={isWished ? "#ff3b30" : "#aaa"} />
              </TouchableOpacity>
          </View>
          
          <Text style={styles.price}>{item.price.toLocaleString()}원</Text>
          <View style={styles.infoRow}>
              <Text style={styles.category}>{item.category}</Text>
              <Text style={[styles.status, { color: statusColor }]}>{item.status}</Text>
          </View>
          <TouchableOpacity style={styles.profileLink} onPress={() => onProfilePress(item.creatorId)}>
              <Ionicons name="person-circle-outline" size={16} color="#555" />
              <Text style={styles.profileLinkText}>판매자 신뢰도</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
}, (prev, next) => {
    // 리렌더링 방지 조건: 데이터가 같고 찜 상태가 같으면 다시 안 그림
    return prev.item === next.item && prev.isWished === next.isWished;
});
MarketItem.displayName = "MarketItem";

export default function MarketListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const currentUserId = currentUser?.uid;

  const [posts, setPosts] = useState<MarketPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<MarketPost | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  const [selectedFilter, setSelectedFilter] = useState('전체');
  const [isSearching, setIsSearching] = useState(false); 
  const [searchQuery, setSearchQuery] = useState('');
  
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [pendingReviewPost, setPendingReviewPost] = useState<MarketPost | null>(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [myWishlist, setMyWishlist] = useState<string[]>([]);

  // 뒤로가기 핸들링
  useEffect(() => {
    const backAction = () => {
      if (isImageViewerVisible) { setIsImageViewerVisible(false); return true; }
      if (pendingReviewPost) { setPendingReviewPost(null); return true; }
      if (reviewModalVisible) { setReviewModalVisible(false); return true; }
      if (profileUserId) { setProfileUserId(null); return true; }
      if (isSearching) { setIsSearching(false); setSearchQuery(''); return true; }
      if (modalVisible) { setModalVisible(false); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isSearching, modalVisible, profileUserId, reviewModalVisible, pendingReviewPost, isImageViewerVisible]);

  // 데이터 로드
  const fetchPosts = useCallback(() => {
    if (!currentUser) { setLoading(false); setPosts([]); return () => {}; }
    setLoading(true);
    let q = query(collection(db, 'marketPosts'));
    if (selectedFilter !== '전체') {
      q = query(q, where('category', '==', selectedFilter));
    }
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MarketPost[];
      data.sort((a, b) => (b.id > a.id ? 1 : -1));
      setPosts(data);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser, selectedFilter]);

  useEffect(() => { const unsub = fetchPosts(); return () => unsub(); }, [fetchPosts]);

  // 구매자 리뷰 대기 체크
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'marketPosts'),
      where('buyerId', '==', currentUser.uid),
      where('status', '==', '판매완료'),
      where('isBuyerReviewed', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const postData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MarketPost;
        setPendingReviewPost(postData);
      } else {
        setPendingReviewPost(null);
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 찜 목록 실시간 감지
  useEffect(() => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            setMyWishlist(docSnap.data().wishlist || []);
        }
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 핸들러들 (useCallback으로 감싸서 최적화)
  const handleToggleWish = useCallback(async (postId: string) => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const isWished = myWishlist.includes(postId);
    try {
        if (isWished) await updateDoc(userRef, { wishlist: arrayRemove(postId) });
        else await updateDoc(userRef, { wishlist: arrayUnion(postId) });
    } catch (e) { console.error(e); }
  }, [currentUser, myWishlist]);

  const handlePressItem = useCallback((item: MarketPost) => {
      setSelectedPost(item);
      setModalVisible(true);
  }, []);

  const handleProfilePress = useCallback((creatorId: string) => {
      setProfileUserId(creatorId);
  }, []);

  const getFilteredPosts = () => {
    if (!searchQuery.trim()) return posts;
    const lower = searchQuery.toLowerCase();
    return posts.filter(p => p.title.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower));
  };

  // ... (Create, Delete, Edit, StatusChange, Chat 핸들러들은 기존과 동일하게 유지)
  const handleCreate = () => {
    if (!currentUser) return Alert.alert("로그인 필요", "로그인이 필요합니다.");
    router.push({ pathname: '/(tabs)/create-market', params: { mode: 'new', t: Date.now().toString() } });
  };

  const handleDelete = async (post: MarketPost) => {
    Alert.alert("삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          try {
            await deleteDoc(doc(db, "marketPosts", post.id));
            Alert.alert("삭제 완료", "게시글이 삭제되었습니다.");
            setModalVisible(false);
          } catch { Alert.alert("오류", "삭제 실패"); }
      }}
    ]);
  };

  const handleEdit = (post: MarketPost) => {
    setModalVisible(false);
    router.push({
      pathname: '/(tabs)/create-market',
      params: {
        postId: post.id,
        initialTitle: post.title,
        initialDescription: post.description,
        initialCategory: post.category,
        initialPrice: post.price.toString(),
        initialImageUrl: post.imageUrl || '',
      }
    });
  };

  const handleStatusChange = async (post: MarketPost) => {
    if (post.status === '판매완료') {
      Alert.alert("변경 불가", "이미 거래가 확정된 상품입니다.\n재판매 하시려면 새로운 게시글을 작성해주세요.");
      return;
    }
    Alert.alert("상태 변경", "상태를 선택해주세요.", [
      { text: "취소", style: "cancel" },
      { 
        text: post.status === '예약중' ? "'판매중'으로 변경" : "'예약중'으로 변경", 
        onPress: async () => {
            const nextStatus = post.status === '예약중' ? '판매중' : '예약중';
            await updateDoc(doc(db, 'marketPosts', post.id), { status: nextStatus });
            setSelectedPost(prev => prev ? { ...prev, status: nextStatus } : null);
            setPosts(currentPosts => currentPosts.map(p => p.id === post.id ? { ...p, status: nextStatus } : p));
        }
      },
      { 
        text: "거래 확정 (판매완료)", 
        style: 'destructive',
        onPress: () => { setReviewModalVisible(true); }
      }
    ]);
  };

  const handleChat = async (post: MarketPost) => {
    if (!currentUser) return;
    if (post.creatorId === currentUserId) return Alert.alert("본인 상품", "본인 상품에는 채팅할 수 없습니다.");
    
    const sortedUids = [post.creatorId, currentUserId!].sort();
    const chatRoomId = `dm_${post.id}_${sortedUids.join('_')}`;
    const chatRoomRef = doc(db, "chatRooms", chatRoomId);

    try {
      const snap = await getDoc(chatRoomRef);
      if (!snap.exists()) {
        let buyerName = "익명";
        try {
            const userSnap = await getDoc(doc(db, "users", currentUserId!));
            if(userSnap.exists()) {
                const d = userSnap.data();
                if(d.department) {
                    let entryYear = "00";
                    if (currentUser.email) {
                        const prefix = currentUser.email.split('@')[0];
                        const two = prefix.substring(0, 2);
                        if (!isNaN(Number(two)) && two.length === 2) entryYear = two;
                    }
                    buyerName = `${entryYear}학번 ${d.department} 학우`;
                }
            }
        } catch {}
        
        await setDoc(chatRoomRef, {
          name: `[구매문의] ${post.title}`, 
          members: sortedUids,
          type: 'dm',
          marketId: post.id,
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastMessageTimestamp: null,
          lastReadBy: { [post.creatorId]: serverTimestamp(), [currentUserId!]: serverTimestamp() }
        });
      } else {
        await updateDoc(chatRoomRef, { members: arrayUnion(post.creatorId, currentUserId!) });
      }
      setModalVisible(false);
      router.push(`/chat/${chatRoomId}`);
    } catch  {
      Alert.alert("오류", "채팅방 연결 실패");
    }
  };

  // ✨ [최적화 2] 렌더 함수 (메모이제이션 컴포넌트 사용)
  const renderItem = useCallback(({ item }: { item: MarketPost }) => (
      <MarketItem 
        item={item} 
        onPress={handlePressItem} 
        onToggleWish={handleToggleWish}
        onProfilePress={handleProfilePress}
        isWished={myWishlist.includes(item.id)}
      />
  ), [handlePressItem, handleToggleWish, handleProfilePress, myWishlist]);

  const isMyPost = currentUserId && selectedPost?.creatorId === currentUserId;
  let modalStatusColor = '#0062ffff';
  if (selectedPost?.status === '예약중') modalStatusColor = '#ffc107';
  if (selectedPost?.status === '판매완료') modalStatusColor = '#dc3545';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {isSearching ? (
           <View style={styles.searchBar}>
             <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery(''); }}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
             <TextInput style={styles.searchInput} placeholder="상품 검색" value={searchQuery} onChangeText={setSearchQuery} autoFocus />
             {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><Ionicons name="close-circle" size={20} color="#999" /></TouchableOpacity>}
           </View>
        ) : (
           <>
            <Text style={styles.headerTitle}>중고 마켓</Text>
            <TouchableOpacity onPress={() => setIsSearching(true)} style={{padding:5}}><Ionicons name="search-outline" size={24} color="#555" /></TouchableOpacity>
           </>
        )}
      </View>
      
      {!isSearching && (
        <View style={styles.filterBar}>
            {['전체', ...['전공도서', '교양도서', '전자제품', '의류/잡화', '생활용품', '기타']].map(cat => (
                <TouchableOpacity key={cat} style={[styles.filterBtn, selectedFilter === cat && styles.filterBtnActive]} onPress={() => setSelectedFilter(cat)}>
                    <Text style={[styles.filterText, selectedFilter === cat && {color:'#fff', fontWeight:'bold'}]}>{cat}</Text>
                </TouchableOpacity>
            ))}
        </View>
      )}

      {/* ✨ [최적화 3] FlatList 성능 옵션 적용 */}
      <FlatList 
        data={getFilteredPosts()} 
        renderItem={renderItem} 
        keyExtractor={i => i.id} 
        contentContainerStyle={{padding: 15, paddingBottom: 100}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1000); }} />}
        ListEmptyComponent={<View style={{alignItems:'center', marginTop:50}}><Text style={{color:'#999'}}>{searchQuery ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}</Text></View>}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <TouchableOpacity style={styles.fab} onPress={handleCreate}>
        <Ionicons name="add" size={30} color="#fff" />
        <Text style={styles.fabText}>판매하기</Text>
      </TouchableOpacity>

      {/* 상품 상세 모달 (높이 수정됨) */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
            <View style={styles.modalContainer}>
                {/* 헤더 (X 버튼) */}
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                        <Ionicons name="close" size={32} color="#333" />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{paddingHorizontal:20, paddingBottom: 20}}>
                    {selectedPost?.imageUrl && (
                        <TouchableOpacity onPress={() => setIsImageViewerVisible(true)}>
                            <Image source={{ uri: selectedPost.imageUrl }} style={styles.modalImage} />
                        </TouchableOpacity>
                    )}
                    
                    <View style={styles.modalInfoRow}>
                        <Text style={styles.modalCategory}>{selectedPost?.category}</Text>
                        <Text style={[styles.modalStatus, { color: modalStatusColor }]}>{selectedPost?.status}</Text>
                    </View>

                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                        <Text style={styles.modalTitle}>{selectedPost?.title}</Text>
                        {selectedPost && (
                            <TouchableOpacity onPress={() => handleToggleWish(selectedPost.id)}>
                                <Ionicons name={myWishlist.includes(selectedPost.id) ? "heart" : "heart-outline"} size={28} color={myWishlist.includes(selectedPost.id) ? "#ff3b30" : "#aaa"} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <Text style={styles.modalPrice}>{selectedPost?.price.toLocaleString()}원</Text>
                    
                    <TouchableOpacity 
                        style={styles.modalProfileBtn} 
                        onPress={() => setProfileUserId(selectedPost?.creatorId || null)}
                    >
                        <Ionicons name="person-circle" size={20} color="#0062ffff" />
                        <Text style={styles.modalProfileText}>판매자 정보 보기</Text>
                    </TouchableOpacity>

                    <Text style={styles.modalDesc}>{selectedPost?.description}</Text>
                </ScrollView>
                
                <View style={styles.bottomBar}>
                    {isMyPost ? (
                        <>
                            <TouchableOpacity 
                            style={[
                                styles.actionBtn, 
                                { backgroundColor: selectedPost?.status === '판매중' ? '#17a2b8' : (selectedPost?.status === '예약중' ? '#ffc107' : '#6c757d') }
                            ]} 
                            onPress={() => selectedPost && handleStatusChange(selectedPost)}
                            >
                                <Text style={[styles.btnText, selectedPost?.status === '예약중' && {color: '#000'}]}>
                                {selectedPost?.status === '판매완료' ? '거래 완료됨' : '상태 변경'}
                                </Text>
                            </TouchableOpacity>
                            
                            <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#f8f9fa', borderWidth:1, borderColor:'#ddd', marginHorizontal:5}]} onPress={() => selectedPost && handleEdit(selectedPost)}>
                                <Text style={[styles.btnText, {color:'#333'}]}>수정</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#dc3545'}]} onPress={() => selectedPost && handleDelete(selectedPost)}>
                                <Text style={styles.btnText}>삭제</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity 
                            style={[styles.chatBtn, selectedPost?.status === '판매완료' && {backgroundColor:'#ccc'}]} 
                            onPress={() => selectedPost && handleChat(selectedPost)}
                            disabled={selectedPost?.status === '판매완료'}
                        >
                            <Text style={styles.chatBtnText}>{selectedPost?.status === '판매완료' ? '판매 완료된 상품' : '채팅으로 구매하기'}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
      </Modal>

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />

      {selectedPost && currentUserId && (
        <ReviewModal
          visible={reviewModalVisible}
          postId={selectedPost.id}
          postTitle={selectedPost.title}
          sellerId={currentUserId}
          onClose={() => setReviewModalVisible(false)}
          onComplete={() => {
              setModalVisible(false);
              setPosts(prev => prev.map(p => p.id === selectedPost.id ? {...p, status: '판매완료'} : p));
          }}
        />
      )}

      {pendingReviewPost && (
        <BuyerReviewModal visible={!!pendingReviewPost} postData={pendingReviewPost} onClose={() => setPendingReviewPost(null)} />
      )}

      {selectedPost?.imageUrl && (
        <ImageView
          images={[{ uri: selectedPost.imageUrl }]}
          imageIndex={0}
          visible={isImageViewerVisible}
          onRequestClose={() => setIsImageViewerVisible(false)}
          swipeToCloseEnabled={true}
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 10 },
  searchInput: { flex: 1, padding: 10, fontSize: 16 },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, borderBottomWidth: 1, borderColor: '#f5f5f5' },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 8, marginBottom: 5 },
  filterBtnActive: { backgroundColor: '#0062ffff' },
  filterText: { color: '#555' },
  card: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  cardImage: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#eee' },
  noImage: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' },
  textContainer: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 5, flex: 1, marginRight: 5 },
  wishButton: { padding: 2 }, 
  price: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  category: { fontSize: 12, color: '#888' },
  status: { fontSize: 12, fontWeight: 'bold' }, 
  profileLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  profileLinkText: { fontSize: 11, color: '#555', marginLeft: 4 },
  
  // ✨ [수정] iOS 탭바 회피를 위해 높이 110으로 설정
  fab: { position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 20, right: 20, backgroundColor: '#0062ffff', borderRadius: 30, flexDirection: 'row', alignItems: 'center', padding: 15, elevation: 5, zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  fabText: { color: '#fff', fontWeight: 'bold', marginLeft: 5, fontSize: 16 },
  
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  // ✨ [수정] 높이 60% 제한 (바텀 시트 스타일)
  modalContainer: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 15, paddingTop: 15, paddingBottom: 5 },
  closeButton: { padding: 10, marginLeft: -10 },
  modalImage: { width: '100%', height: 300, resizeMode: 'cover', borderRadius: 10 },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  modalCategory: { color: '#888' },
  modalStatus: { fontWeight: 'bold' }, 
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 10, flex: 1 },
  modalPrice: { fontSize: 22, fontWeight: 'bold', marginTop: 5, color: '#0062ffff' },
  modalDesc: { fontSize: 16, marginTop: 20, lineHeight: 24, color: '#333' },
  modalProfileBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10, padding: 10, backgroundColor: '#f0f8ff', borderRadius: 8, alignSelf: 'flex-start' },
  modalProfileText: { color: '#0062ffff', fontWeight: 'bold', marginLeft: 5 },
  bottomBar: { flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#eee' },
  chatBtn: { flex: 1, backgroundColor: '#0062ffff', padding: 15, borderRadius: 10, alignItems: 'center' },
  chatBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  actionBtn: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
});