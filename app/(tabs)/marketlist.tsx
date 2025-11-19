// app/(tabs)/marketlist.tsx

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
  Alert,
  BackHandler,
  FlatList,
  Image,
  Modal,
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

// 컴포넌트 임포트
import BuyerReviewModal from '../../components/BuyerReviewModal';
import ReviewModal from '../../components/ReviewModal';
import UserProfileModal from '../../components/UserProfileModal';

// ✨ [추가] 이미지 확대 라이브러리
import ImageView from 'react-native-image-viewing';

interface MarketPost {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  status: '판매중' | '예약중' | '판매완료';
  creatorId: string;
  imageUrl?: string; // 현재는 단일 이미지 (문자열)
  buyerId?: string;
  isBuyerReviewed?: boolean;
}

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

  // ✨ [추가] 이미지 뷰어 상태
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);

  // 뒤로가기 핸들링
  useEffect(() => {
    const backAction = () => {
      if (isImageViewerVisible) { setIsImageViewerVisible(false); return true; } // 이미지 뷰어 닫기
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
      setPosts(data);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      console.error("Fetch error:", error);
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

  const getFilteredPosts = () => {
    if (!searchQuery.trim()) return posts;
    const lower = searchQuery.toLowerCase();
    return posts.filter(p => p.title.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower));
  };

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
          } catch(e) { Alert.alert("오류", "삭제 실패"); }
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
        } catch(e) {}
        
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
    } catch (e) {
      Alert.alert("오류", "채팅방 연결 실패");
    }
  };

  const renderItem = ({ item }: { item: MarketPost }) => {
    let statusColor = '#0062ffff';
    if (item.status === '예약중') statusColor = '#ffc107';
    if (item.status === '판매완료') statusColor = '#dc3545';

    return (
      <TouchableOpacity style={styles.card} onPress={() => { setSelectedPost(item); setModalVisible(true); }}>
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.cardImage} /> : 
          <View style={styles.noImage}><Ionicons name="image-outline" size={30} color="#ccc" /></View>}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.price}>{item.price.toLocaleString()}원</Text>
          <View style={styles.infoRow}>
              <Text style={styles.category}>{item.category}</Text>
              <Text style={[styles.status, { color: statusColor }]}>{item.status}</Text>
          </View>
          <TouchableOpacity style={styles.profileLink} onPress={() => setProfileUserId(item.creatorId)}>
              <Ionicons name="person-circle-outline" size={16} color="#555" />
              <Text style={styles.profileLinkText}>판매자 신뢰도</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

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

      <FlatList 
        data={getFilteredPosts()} 
        renderItem={renderItem} 
        keyExtractor={i => i.id} 
        contentContainerStyle={{padding: 15, paddingBottom: 100}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1000); }} />}
        ListEmptyComponent={<View style={{alignItems:'center', marginTop:50}}><Text style={{color:'#999'}}>{searchQuery ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}</Text></View>}
      />

      <TouchableOpacity style={styles.fab} onPress={handleCreate}>
        <Ionicons name="add" size={30} color="#fff" />
        <Text style={styles.fabText}>판매하기</Text>
      </TouchableOpacity>

      {/* 상품 상세 모달 */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={28} color="#333" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{padding:20}}>
                {selectedPost?.imageUrl && (
                    // ✨ [수정] 이미지를 누르면 확대 뷰어 열림
                    <TouchableOpacity onPress={() => setIsImageViewerVisible(true)}>
                        <Image source={{ uri: selectedPost.imageUrl }} style={styles.modalImage} />
                    </TouchableOpacity>
                )}
                
                <View style={styles.modalInfoRow}>
                    <Text style={styles.modalCategory}>{selectedPost?.category}</Text>
                    <Text style={[styles.modalStatus, { color: modalStatusColor }]}>{selectedPost?.status}</Text>
                </View>

                <Text style={styles.modalTitle}>{selectedPost?.title}</Text>
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
      </Modal>

      {/* 모달들 */}
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
        <BuyerReviewModal 
          visible={!!pendingReviewPost}
          postData={pendingReviewPost}
          onClose={() => setPendingReviewPost(null)}
        />
      )}

      {/* ✨ [추가] 이미지 확대 뷰어 */}
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
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  price: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  category: { fontSize: 12, color: '#888' },
  status: { fontSize: 12, fontWeight: 'bold' }, 
  profileLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  profileLinkText: { fontSize: 11, color: '#555', marginLeft: 4 },
  fab: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#0062ffff', borderRadius: 30, flexDirection: 'row', alignItems: 'center', padding: 15, elevation: 5 },
  fabText: { color: '#fff', fontWeight: 'bold', marginLeft: 5 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { padding: 15, alignItems: 'flex-end' },
  modalImage: { width: '100%', height: 300, resizeMode: 'cover', borderRadius: 10 },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  modalCategory: { color: '#888' },
  modalStatus: { fontWeight: 'bold' }, 
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 10 },
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