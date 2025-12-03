import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, // ✨ 로딩바
  Alert,
  Dimensions,
  FlatList,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import ImageView from 'react-native-image-viewing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReviewModal from '../../components/ReviewModal';
import UserProfileModal from '../../components/UserProfileModal';
import { db } from '../../firebaseConfig';

const SCREEN_WIDTH = Dimensions.get('window').width;

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

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const currentUserId = currentUser?.uid;

  const [post, setPost] = useState<MarketPost | null>(null);
  
  // ✨ [핵심 1] 로딩 상태 시작
  const [loading, setLoading] = useState(true);
  
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [myWishlist, setMyWishlist] = useState<string[]>([]);

  // 1. 게시글 데이터 실시간 로드
  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'marketPosts', id as string);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() } as MarketPost);
      } else {
        Alert.alert("알림", "삭제된 게시글입니다.");
        router.replace('/(tabs)/marketlist');
      }
      // ✨ [핵심 3] 로딩 종료
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id, router]);

  // 2. 위시리스트 로드
  useEffect(() => {
    if (!currentUserId) return;
    const userRef = doc(db, 'users', currentUserId);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) setMyWishlist(docSnap.data().wishlist || []);
    });
    return () => unsubscribe();
  }, [currentUserId]);

  // ... (핸들러 함수들은 기존 유지) ...
  const handleToggleWish = async () => {
    if (!currentUser || !post) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const isWished = myWishlist.includes(post.id);
    try {
        if (isWished) await updateDoc(userRef, { wishlist: arrayRemove(post.id) });
        else await updateDoc(userRef, { wishlist: arrayUnion(post.id) });
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    Alert.alert("삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          try {
            await deleteDoc(doc(db, "marketPosts", id as string));
            router.replace('/(tabs)/marketlist');
          } catch { Alert.alert("오류", "삭제 실패"); }
      }}
    ]);
  };

  const handleEdit = () => {
    if (!post) return;
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

  const handleStatusChange = async () => {
    if (!post) return;
    if (post.status === '판매완료') {
      Alert.alert("변경 불가", "이미 거래가 확정된 상품입니다.");
      return;
    }
    Alert.alert("상태 변경", "상태를 선택해주세요.", [
      { text: "취소", style: "cancel" },
      { 
        text: post.status === '예약중' ? "'판매중'으로 변경" : "'예약중'으로 변경", 
        onPress: async () => {
            const nextStatus = post.status === '예약중' ? '판매중' : '예약중';
            await updateDoc(doc(db, 'marketPosts', post.id), { status: nextStatus, updatedAt: serverTimestamp() });
        }
      },
      { 
        text: "거래 확정 (판매완료)", 
        style: 'destructive',
        onPress: () => { setReviewModalVisible(true); }
      }
    ]);
  };

  const handleChat = async () => {
    if (!currentUser || !post || !currentUserId) return;
    
    if (post.creatorId === currentUserId) return Alert.alert("본인 상품", "본인 상품에는 채팅할 수 없습니다.");
    
    const sortedUids = [post.creatorId, currentUserId].sort();
    const chatRoomId = `dm_${post.id}_${sortedUids.join('_')}`;
    const chatRoomRef = doc(db, "chatRooms", chatRoomId);
    try {
      const snap = await getDoc(chatRoomRef);
      if (!snap.exists()) {
        await setDoc(chatRoomRef, {
          name: `[구매문의] ${post.title}`, 
          members: sortedUids,
          type: 'market',
          marketId: post.id,
          createdAt: serverTimestamp(),
          lastMessage: '',
          lastMessageTimestamp: null,
          lastReadBy: { [post.creatorId]: serverTimestamp(), [currentUserId]: serverTimestamp() }
        });
      } else {
        await updateDoc(chatRoomRef, { members: arrayUnion(post.creatorId, currentUserId) });
      }
      router.push(`/chat/${chatRoomId}`);
    } catch { Alert.alert("오류", "채팅방 연결 실패"); }
  };

  const handleScroll = (event: any) => {
      const slideSize = event.nativeEvent.layoutMeasurement.width;
      const index = event.nativeEvent.contentOffset.x / slideSize;
      const roundIndex = Math.round(index);
      setCurrentImageIndex(roundIndex);
  };

  // ✨ [핵심 4] 로딩 중이거나 데이터가 없으면 로딩바(ActivityIndicator) 표시
  if (loading || !post) {
    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0062ffff" />
        </View>
    );
  }

  // ... (이후 렌더링 로직은 기존과 동일) ...
  const postImages = post.imageUrls && post.imageUrls.length > 0 
    ? post.imageUrls 
    : (post.imageUrl ? [post.imageUrl] : []);

  const isMyPost = currentUserId && post.creatorId === currentUserId;
  let statusColor = '#0062ffff';
  if (post.status === '예약중') statusColor = '#f57c00';
  if (post.status === '판매완료') statusColor = '#d32f2f';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>상품 상세</Text>
        <View style={{width: 40}} /> 
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* 이미지 슬라이더 */}
            {postImages.length > 0 ? (
                <View style={styles.imageContainer}>
                    <FlatList
                        data={postImages}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(_, index) => index.toString()}
                        onMomentumScrollEnd={handleScroll}
                        renderItem={({ item }) => (
                            <TouchableOpacity 
                                activeOpacity={0.9} 
                                onPress={() => setIsImageViewerVisible(true)}
                                style={styles.imageWrapper}
                            >
                                <Image 
                                    source={{ uri: item }} 
                                    style={styles.postImage} 
                                    contentFit="contain" 
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
                <View style={[styles.imageContainer, {backgroundColor: '#f8f9fa', justifyContent:'center', alignItems:'center'}]}>
                     <Ionicons name="image-outline" size={48} color="#ccc" />
                </View>
            )}

            <View style={styles.contentSection}>
                <View style={styles.profileRow}>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <TouchableOpacity onPress={() => setProfileUserId(post.creatorId)}>
                            <Ionicons name="person-circle" size={40} color="#ccc" />
                        </TouchableOpacity>
                        <View style={{marginLeft: 10}}>
                            <Text style={styles.creatorName}>판매자</Text>
                            <Text style={styles.locationText}>학교 인증 완료</Text>
                        </View>
                    </View>
                    <View>
                         <Text style={[styles.statusText, {color: statusColor}]}>{post.status}</Text>
                    </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.title}>{post.title}</Text>
                <Text style={styles.categoryTime}>{post.category} · 최근 업데이트</Text>
                <Text style={styles.price}>{post.price.toLocaleString()}원</Text>

                <Text style={styles.description}>{post.description}</Text>
            </View>
        </ScrollView>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity onPress={handleToggleWish} style={styles.wishBtnBig}>
             <Ionicons name={myWishlist.includes(post.id) ? "heart" : "heart-outline"} size={28} color={myWishlist.includes(post.id) ? "#ff4444" : "#888"} />
        </TouchableOpacity>
        <View style={{width: 10}} />

        {isMyPost ? (
            <View style={{flex:1, flexDirection:'row', gap:8}}>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#f1f3f5'}]} onPress={handleStatusChange}>
                    <Text style={[styles.actionBtnText, {color:'#333'}]}>상태변경</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#f1f3f5'}]} onPress={handleEdit}>
                    <Text style={[styles.actionBtnText, {color:'#333'}]}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ffcdd2'}]} onPress={handleDelete}>
                    <Text style={[styles.actionBtnText, {color:'#c62828'}]}>삭제</Text>
                </TouchableOpacity>
            </View>
        ) : (
            <TouchableOpacity 
                style={[styles.chatBtn, post.status === '판매완료' && {backgroundColor:'#ccc'}]} 
                onPress={handleChat}
                disabled={post.status === '판매완료'}
            >
                <Text style={styles.chatBtnText}>{post.status === '판매완료' ? '거래 완료' : '채팅으로 거래하기'}</Text>
            </TouchableOpacity>
        )}
      </View>

      {/* 이미지 뷰어 */}
      {postImages.length > 0 && (
        <ImageView
          images={postImages.map(uri => ({ uri }))}
          imageIndex={currentImageIndex}
          visible={isImageViewerVisible}
          onRequestClose={() => setIsImageViewerVisible(false)}
          swipeToCloseEnabled={true}
          doubleTapToZoomEnabled={true}
        />
      )}

      {/* 프로필 모달 */}
      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />

      {/* 리뷰 모달 (판매자용) */}
      {currentUserId && (
        <ReviewModal
          visible={reviewModalVisible}
          postId={post.id}
          postTitle={post.title}
          sellerId={currentUserId}
          onClose={() => setReviewModalVisible(false)}
          onComplete={() => {}}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  // ✨ 로딩 화면 스타일
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f3f5'
  },
  backButton: { padding: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },

  scrollContent: { paddingBottom: 20 },
  
  imageContainer: { width: SCREEN_WIDTH, height: 350, backgroundColor: '#000', position: 'relative' },
  imageWrapper: { width: SCREEN_WIDTH, height: 350, justifyContent: 'center', alignItems: 'center' },
  postImage: { width: '100%', height: '100%' },
  
  pageIndicator: {
    position: 'absolute', bottom: 15, right: 15,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12
  },
  pageIndicatorText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  contentSection: { padding: 20 },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creatorName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  locationText: { fontSize: 12, color: '#888' },
  statusText: { fontSize: 14, fontWeight: 'bold' },

  divider: { height: 1, backgroundColor: '#f1f3f5', marginVertical: 15 },

  title: { fontSize: 22, fontWeight: '800', color: '#333', marginBottom: 5 },
  categoryTime: { fontSize: 13, color: '#999', marginBottom: 15 },
  price: { fontSize: 24, fontWeight: '900', color: '#333', marginBottom: 20 },
  description: { fontSize: 16, lineHeight: 26, color: '#444' },

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