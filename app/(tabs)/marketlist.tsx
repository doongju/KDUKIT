// app/(tabs)/marketlist.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { memo, useCallback, useEffect, useState } from 'react';
import {
  Alert, // ✨ [수정] Alert 추가됨
  BackHandler,
  FlatList,
  Image,
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

import BuyerReviewModal from '../../components/BuyerReviewModal';
import UserProfileModal from '../../components/UserProfileModal';

// --- 인터페이스 ---
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
  updatedAt?: any; 
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

  const [posts, setPosts] = useState<MarketPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [selectedFilter, setSelectedFilter] = useState('전체');
  const [isSearching, setIsSearching] = useState(false); 
  const [searchQuery, setSearchQuery] = useState('');
  
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [pendingReviewPost, setPendingReviewPost] = useState<MarketPost | null>(null);
  const [myWishlist, setMyWishlist] = useState<string[]>([]);

  useEffect(() => {
    const backAction = () => {
      if (pendingReviewPost) { setPendingReviewPost(null); return true; }
      if (profileUserId) { setProfileUserId(null); return true; }
      if (isSearching) { setIsSearching(false); setSearchQuery(''); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isSearching, profileUserId, pendingReviewPost]);

  const fetchPosts = useCallback(() => {
    if (!currentUser) { setLoading(false); setPosts([]); return () => {}; }
    setLoading(true);
    let q = query(collection(db, 'marketPosts'));
    if (selectedFilter !== '전체') {
      q = query(q, where('category', '==', selectedFilter));
    }
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const rawData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MarketPost[];
      // ... (필터 로직 생략 없이 그대로 유지)
      const now = Date.now();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const filteredData = rawData.filter(post => {
        if (!post.updatedAt) return true;
        if (post.status === '판매완료') {
            const updatedAtMs = post.updatedAt.toMillis ? post.updatedAt.toMillis() : new Date(post.updatedAt).getTime();
            if (isNaN(updatedAtMs)) return true;
            if (now - updatedAtMs > ONE_DAY_MS) return false; 
        }
        return true;
      });
      filteredData.sort((a, b) => (b.id > a.id ? 1 : -1));
      setPosts(filteredData);
      setLoading(false);
      setRefreshing(false);
    }, () => setLoading(false));
    return unsubscribe;
  }, [currentUser, selectedFilter]);

  useEffect(() => { const unsub = fetchPosts(); return () => unsub(); }, [fetchPosts]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'marketPosts'), where('buyerId', '==', currentUser.uid), where('status', '==', '판매완료'), where('isBuyerReviewed', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) setPendingReviewPost({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MarketPost);
      else setPendingReviewPost(null);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) setMyWishlist(docSnap.data().wishlist || []);
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
      // ✨ [수정] 타입 에러 방지 (as any)
      router.push(`/market-detail/${item.id}` as any);
  }, [router]);

  const handleProfilePress = useCallback((creatorId: string) => { setProfileUserId(creatorId); }, []);

  const getFilteredPosts = () => {
    if (!searchQuery.trim()) return posts;
    const lower = searchQuery.toLowerCase();
    return posts.filter(p => p.title.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower));
  };

  const handleCreate = () => {
    if (!currentUser) return Alert.alert("로그인 필요", "로그인이 필요합니다.");
    router.push({ pathname: '/create-market', params: { mode: 'new', t: Date.now().toString() } });
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

  return (
    <View style={styles.container}>
      {/* 헤더 및 검색창 UI */}
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
                style={{flex:1, paddingHorizontal:10}}
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
        removeClippedSubviews={true}
      />

      <TouchableOpacity style={styles.fab} onPress={handleCreate}>
        <Ionicons name="add" size={28} color="#fff" />
        <Text style={styles.fabText}>글쓰기</Text>
      </TouchableOpacity>

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />

      {pendingReviewPost && (
        <BuyerReviewModal visible={!!pendingReviewPost} postData={pendingReviewPost} onClose={() => setPendingReviewPost(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f1f3f5'
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#333' },
  iconButton: { padding: 5 },
  searchBar: { 
    flex: 1, flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#f1f3f5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2
  },
  filterContainer: { backgroundColor: '#fff', paddingVertical: 12 },
  filterScroll: { paddingHorizontal: 20 },
  filterBtn: { 
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, 
    backgroundColor: '#f8f9fa', marginRight: 8, borderWidth: 1, borderColor: '#eee'
  },
  filterBtnActive: { backgroundColor: '#333', borderColor: '#333' },
  filterText: { color: '#666', fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
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
});