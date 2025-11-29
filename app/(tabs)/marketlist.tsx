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
  Dimensions,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

import ImageView from 'react-native-image-viewing';
import BuyerReviewModal from '../../components/BuyerReviewModal';
import ReviewModal from '../../components/ReviewModal';
import UserProfileModal from '../../components/UserProfileModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MarketPost {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  status: '판매중' | '예약중' | '판매완료';
  creatorId: string;
  imageUrl?: string;      
  imageUrls?: string[];   
  buyerId?: string;
  isBuyerReviewed?: boolean;
  updatedAt?: any; // 시간 비교를 위해 추가
}

const MarketItem = memo(({ item, onPress, onToggleWish, onProfilePress, isWished }: any) => {
    let statusColor = '#0062ffff'; 
    let statusBg = '#e3f2fd';
    if (item.status === '예약중') { statusColor = '#f57c00'; statusBg = '#fff3e0'; }
    if (item.status === '판매완료') { statusColor = '#d32f2f'; statusBg = '#ffebee'; }

    const formattedPrice = new Intl.NumberFormat('ko-KR').format(item.price);
    const thumbnail = item.imageUrl || (item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls[0] : null);
    const moreImagesCount = item.imageUrls ? item.imageUrls.length - 1 : 0;

    return (
      <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.9}>
        <View style={styles.imageContainer}>
            {thumbnail ? (
                <>
                    <Image source={{ uri: thumbnail }} style={styles.cardImage} />
                    {moreImagesCount > 0 && (
                        <View style={styles.multipleImageIcon}>
                             <Ionicons name="copy-outline" size={12} color="#fff" />
                             <Text style={styles.multipleImageText}>+{moreImagesCount}</Text>
                        </View>
                    )}
                </>
            ) : (
                <View style={styles.noImage}>
                    <Ionicons name="image-outline" size={32} color="#ccc" />
                </View>
            )}
        </View>
        
        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
              </View>
              <Text style={styles.categoryText}>{item.category}</Text>
          </View>

          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.price}>{formattedPrice}원</Text>

          <View style={styles.footerRow}>
             <TouchableOpacity style={styles.sellerInfo} onPress={() => onProfilePress(item.creatorId)}>
                <Ionicons name="person-circle-outline" size={16} color="#888" />
                <Text style={styles.sellerText}>판매자 정보</Text>
             </TouchableOpacity>

             <TouchableOpacity onPress={() => onToggleWish(item.id)} hitSlop={{top:10, bottom:10, left:10, right:10}}>
                 <Ionicons name={isWished ? "heart" : "heart-outline"} size={22} color={isWished ? "#ff4444" : "#ccc"} />
             </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
}, (prev, next) => {
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
  const [currentImageIndex, setCurrentImageIndex] = useState(0); 
  
  const [myWishlist, setMyWishlist] = useState<string[]>([]);

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

  // ✅ 데이터 로드 및 "판매완료 24시간 경과 필터링"
  const fetchPosts = useCallback(() => {
    if (!currentUser) { setLoading(false); setPosts([]); return () => {}; }
    setLoading(true);
    let q = query(collection(db, 'marketPosts'));
    if (selectedFilter !== '전체') {
      q = query(q, where('category', '==', selectedFilter));
    }
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const rawData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MarketPost[];
      
      // ✨ [필터링 로직] 판매완료된 지 24시간(86400000ms) 지난 글 제외하기
      const now = Date.now();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      const filteredData = rawData.filter(post => {
        if (post.status === '판매완료' && post.updatedAt) {
            // Firestore Timestamp 처리
            const updatedAtMs = post.updatedAt.toMillis ? post.updatedAt.toMillis() : new Date(post.updatedAt).getTime();
            if (now - updatedAtMs > ONE_DAY_MS) {
                return false; // 24시간 지났으면 목록에서 제외 (안보임)
            }
        }
        return true;
      });

      filteredData.sort((a, b) => (b.id > a.id ? 1 : -1));
      setPosts(filteredData);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser, selectedFilter]);

  useEffect(() => { const unsub = fetchPosts(); return () => unsub(); }, [fetchPosts]);

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
      setCurrentImageIndex(0); 
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

  const handleCreate = () => {
    if (!currentUser) return Alert.alert("로그인 필요", "로그인이 필요합니다.");
    router.push({ pathname: '/create-market', params: { mode: 'new', t: Date.now().toString() } });
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
      pathname: '/create-market',
      params: {
        postId: post.id,
        initialTitle: post.title,
        initialDescription: post.description,
        initialCategory: post.category,
        initialPrice: post.price.toString(),
        initialImageUrl: post.imageUrls ? post.imageUrls : post.imageUrl, 
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
            await updateDoc(doc(db, 'marketPosts', post.id), { status: nextStatus, updatedAt: serverTimestamp() });
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

  const renderItem = useCallback(({ item }: { item: MarketPost }) => (
      <MarketItem 
        item={item} 
        onPress={handlePressItem} 
        onToggleWish={handleToggleWish}
        onProfilePress={handleProfilePress}
        isWished={myWishlist.includes(item.id)}
      />
  ), [handlePressItem, handleToggleWish, handleProfilePress, myWishlist]);

  const getPostImages = () => {
    if (!selectedPost) return [];
    if (selectedPost.imageUrls && selectedPost.imageUrls.length > 0) {
        return selectedPost.imageUrls;
    }
    if (selectedPost.imageUrl) {
        return [selectedPost.imageUrl];
    }
    return [];
  };
  const postImages = getPostImages();

  const handleScroll = useCallback((event: any) => {
      const slideSize = event.nativeEvent.layoutMeasurement.width;
      const index = event.nativeEvent.contentOffset.x / slideSize;
      const roundIndex = Math.round(index);
      setCurrentImageIndex(roundIndex);
  }, []);

  const isMyPost = currentUserId && selectedPost?.creatorId === currentUserId;
  let modalStatusColor = '#0062ffff';
  if (selectedPost?.status === '예약중') modalStatusColor = '#f57c00';
  if (selectedPost?.status === '판매완료') modalStatusColor = '#d32f2f';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {isSearching ? (
           <View style={styles.searchBar}>
             <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery(''); }} style={{padding:5}}>
                 <Ionicons name="arrow-back" size={24} color="#555" />
             </TouchableOpacity>
             <TextInput  
                value={searchQuery} 
                onChangeText={setSearchQuery} 
                autoFocus 
             />
             {searchQuery.length > 0 && (
                 <TouchableOpacity onPress={() => setSearchQuery('')} style={{padding:5}}>
                     <Ionicons name="close-circle" size={20} color="#999" />
                 </TouchableOpacity>
             )}
           </View>
        ) : (
           <>
            <Text style={styles.headerTitle}>중고장터 🛒</Text>
            <TouchableOpacity onPress={() => setIsSearching(true)} style={styles.iconButton}>
                <Ionicons name="search" size={24} color="#333" />
            </TouchableOpacity>
           </>
        )}
      </View>
      
      {!isSearching && (
        <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {['전체', '전공도서', '교양도서', '전자제품', '의류/잡화', '생활용품', '기타'].map(cat => (
                    <TouchableOpacity 
                        key={cat} 
                        style={[styles.filterBtn, selectedFilter === cat && styles.filterBtnActive]} 
                        onPress={() => setSelectedFilter(cat)}
                    >
                        <Text style={[styles.filterText, selectedFilter === cat && styles.filterTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
      )}

      <FlatList 
        data={getFilteredPosts()} 
        renderItem={renderItem} 
        keyExtractor={i => i.id} 
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1000); }} />}
        ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="chatbubble-ellipses-outline" size={60} color="#ddd" />
                <Text style={styles.emptyText}>{searchQuery ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}</Text>
            </View>
        }
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <TouchableOpacity style={styles.fab} onPress={handleCreate}>
        <Ionicons name="add" size={28} color="#fff" />
        <Text style={styles.fabText}>글쓰기</Text>
      </TouchableOpacity>

      {/* 상품 상세 모달 */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
           <TouchableOpacity style={{flex:1}} onPress={() => setModalVisible(false)} />
            <View style={styles.modalContainer}>
                <View style={styles.modalHandle} />
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={28} color="#555" />
                </TouchableOpacity>

                <ScrollView contentContainerStyle={styles.modalContent}>
                    {postImages.length > 0 ? (
                        <View style={styles.imageSwiperContainer}>
                            <FlatList
                                data={postImages}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                keyExtractor={(_, index) => index.toString()}
                                onMomentumScrollEnd={handleScroll}
                                initialNumToRender={1}
                                maxToRenderPerBatch={1}
                                windowSize={2}
                                removeClippedSubviews={true}
                                renderItem={({ item }) => (
                                    <TouchableOpacity 
                                        activeOpacity={0.9} 
                                        onPress={() => setIsImageViewerVisible(true)}
                                    >
                                        <Image 
                                            source={{ uri: item }} 
                                            style={{ 
                                                width: SCREEN_WIDTH, 
                                                height: 350, 
                                                resizeMode: 'contain', 
                                                backgroundColor: '#000' 
                                            }} 
                                        />
                                    </TouchableOpacity>
                                )}
                            />
                            
                            {postImages.length > 1 && (
                                <View style={styles.pageIndicator}>
                                    <Text style={styles.pageIndicatorText}>
                                        {currentImageIndex + 1} / {postImages.length}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        // ✅ [UI 수정] 이미지가 없을 때 빈 공간(Spacer) 추가 (X 버튼 겹침 방지)
                        <View style={{ height: 60 }} />
                    )}
                    
                    <View style={styles.modalHeaderRow}>
                        <View style={styles.userProfileRow}>
                            <TouchableOpacity onPress={() => setProfileUserId(selectedPost?.creatorId || null)}>
                                <Ionicons name="person-circle" size={40} color="#ccc" />
                            </TouchableOpacity>
                            <View style={{marginLeft: 10}}>
                                <Text style={styles.modalCreatorName}>판매자</Text>
                                <Text style={styles.modalLocation}>학교 인증 완료</Text>
                            </View>
                        </View>
                        <View style={{alignItems:'flex-end'}}>
                             <Text style={[styles.modalStatusText, {color: modalStatusColor}]}>{selectedPost?.status}</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <Text style={styles.modalTitle}>{selectedPost?.title}</Text>
                    <Text style={styles.modalCategoryTime}>{selectedPost?.category} · 최근 업데이트</Text>
                    <Text style={styles.modalPrice}>{selectedPost?.price.toLocaleString()}원</Text>

                    <Text style={styles.modalDescription}>{selectedPost?.description}</Text>
                </ScrollView>
                
                <View style={[styles.bottomBar, {paddingBottom: insets.bottom + 10}]}>
                    <TouchableOpacity onPress={() => selectedPost && handleToggleWish(selectedPost.id)} style={styles.wishBtnBig}>
                         <Ionicons name={selectedPost && myWishlist.includes(selectedPost.id) ? "heart" : "heart-outline"} size={28} color={selectedPost && myWishlist.includes(selectedPost.id) ? "#ff4444" : "#888"} />
                    </TouchableOpacity>
                    <View style={{width: 10}} />

                    {isMyPost ? (
                        <View style={{flex:1, flexDirection:'row', gap:8}}>
                            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#f1f3f5'}]} onPress={() => selectedPost && handleStatusChange(selectedPost)}>
                                <Text style={[styles.actionBtnText, {color:'#333'}]}>상태변경</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#f1f3f5'}]} onPress={() => selectedPost && handleEdit(selectedPost)}>
                                <Text style={[styles.actionBtnText, {color:'#333'}]}>수정</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ffcdd2'}]} onPress={() => selectedPost && handleDelete(selectedPost)}>
                                <Text style={[styles.actionBtnText, {color:'#c62828'}]}>삭제</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity 
                            style={[styles.chatBtn, selectedPost?.status === '판매완료' && {backgroundColor:'#ccc'}]} 
                            onPress={() => selectedPost && handleChat(selectedPost)}
                            disabled={selectedPost?.status === '판매완료'}
                        >
                            <Text style={styles.chatBtnText}>{selectedPost?.status === '판매완료' ? '거래 완료' : '채팅으로 거래하기'}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {postImages.length > 0 && (
                    <ImageView
                    images={postImages.map(uri => ({ uri }))}
                    imageIndex={currentImageIndex} 
                    visible={isImageViewerVisible}
                    onRequestClose={() => setIsImageViewerVisible(false)}
                    swipeToCloseEnabled={true}
                    />
                )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  
  // 헤더
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f1f3f5'
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#333' },
  iconButton: { padding: 5 },
  
  // 검색창
  searchBar: { 
    flex: 1, flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#f1f3f5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2
  },

  // 필터
  filterContainer: { backgroundColor: '#fff', paddingVertical: 12 },
  filterScroll: { paddingHorizontal: 20 },
  filterBtn: { 
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, 
    backgroundColor: '#f8f9fa', marginRight: 8, borderWidth: 1, borderColor: '#eee'
  },
  filterBtnActive: { backgroundColor: '#e3f2fd', borderColor: '#0062ffff' },
  filterText: { color: '#666', fontSize: 14, fontWeight: '500' },
  filterTextActive: { color: '#0062ffff', fontWeight: 'bold' },

  listContent: { padding: 20, paddingBottom: 100 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#999', fontSize: 16, marginTop: 10 },

  card: { 
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
  },
  imageContainer: { marginRight: 15, position: 'relative' },
  cardImage: { width: 100, height: 100, borderRadius: 12, backgroundColor: '#eee', resizeMode: 'cover' },
  noImage: { width: 100, height: 100, borderRadius: 12, backgroundColor: '#f1f3f5', justifyContent: 'center', alignItems: 'center' },
  
  multipleImageIcon: {
      position: 'absolute', top: 6, right: 6, 
      backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, 
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3
  },
  multipleImageText: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginLeft: 3 },

  textContainer: { flex: 1, justifyContent: 'space-between', paddingVertical: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  categoryText: { fontSize: 12, color: '#999' },
  title: { fontSize: 16, fontWeight: '600', color: '#333', lineHeight: 22 },
  price: { fontSize: 18, fontWeight: '800', color: '#333', marginTop: 4 },
  
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  sellerInfo: { flexDirection: 'row', alignItems: 'center' },
  sellerText: { fontSize: 12, color: '#888', marginLeft: 4 },

  fab: { 
    position: 'absolute', bottom: Platform.OS === 'ios' ? 90 : 30, right: 20, 
    backgroundColor: '#0062ffff', borderRadius: 30, 
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, 
    elevation: 5, shadowColor: '#0062ffff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 
  },
  fabText: { color: '#fff', fontWeight: 'bold', marginLeft: 6, fontSize: 16 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', overflow: 'hidden' },
  modalHandle: { width: 40, height: 5, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  modalCloseBtn: { position: 'absolute', top: 15, right: 15, zIndex: 10, padding: 5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 20 },
  
  modalContent: { paddingBottom: 20 },
  
  imageSwiperContainer: { position: 'relative', marginBottom: 20, backgroundColor: '#000' },
  
  pageIndicator: {
      position: 'absolute', bottom: 15, right: 15,
      backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15
  },
  pageIndicatorText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  userProfileRow: { flexDirection: 'row', alignItems: 'center' },
  modalCreatorName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  modalLocation: { fontSize: 12, color: '#888' },
  modalStatusText: { fontSize: 14, fontWeight: 'bold' },
  
  divider: { height: 1, backgroundColor: '#f1f3f5', marginHorizontal: 20, marginVertical: 10 },

  modalTitle: { fontSize: 22, fontWeight: '800', color: '#333', marginBottom: 5, paddingHorizontal: 20 },
  modalCategoryTime: { fontSize: 13, color: '#999', marginBottom: 15, paddingHorizontal: 20 },
  modalPrice: { fontSize: 24, fontWeight: '900', color: '#333', marginBottom: 20, paddingHorizontal: 20 },
  modalDescription: { fontSize: 16, lineHeight: 26, color: '#444', paddingHorizontal: 20 },

  bottomBar: { 
    flexDirection: 'row', padding: 15, borderTopWidth: 1, borderColor: '#f1f3f5', backgroundColor: '#fff',
    alignItems: 'center'
  },
  wishBtnBig: { padding: 10 },
  chatBtn: { flex: 1, backgroundColor: '#0062ffff', padding: 15, borderRadius: 12, alignItems: 'center' },
  chatBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontWeight: 'bold', fontSize: 14 },
});