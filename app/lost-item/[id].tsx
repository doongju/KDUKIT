import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayUnion, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
// ✨ [수정] useRef import 추가
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import ImageView from 'react-native-image-viewing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

import UserProfileModal from '../../components/UserProfileModal';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ... (인터페이스 생략 - 기존과 동일) ...
interface LostItem {
  id: string;
  postType: string; 
  type: string; 
  itemName: string;
  description: string;
  location: string;
  status: string;
  creatorId: string;
  creatorName?: string;
  imageUrl?: string;
  imageUrls?: string[];
  createdAt: any;
}

export default function LostItemDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  const [item, setItem] = useState<LostItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // UI 표시용 상태
  const [isNavigating, setIsNavigating] = useState(false);
  // ✨ [수정] 즉시 차단을 위한 Ref
  const isNavigatingRef = useRef(false);

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  // ... (useEffect 등 기존 로직 동일) ...
  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'lostAndFoundItems', id as string);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (isDeleting) return;
        if (docSnap.exists()) {
            setItem({ id: docSnap.id, ...docSnap.data() } as LostItem);
        } else {
            Alert.alert("알림", "삭제된 게시물입니다.");
            router.back();
        }
        setLoading(false);
    });
    return () => unsubscribe();
  }, [id, router, isDeleting]);

  const handleDelete = () => { /* 기존 코드 동일 */
      Alert.alert("삭제", "정말 삭제하시겠습니까?", [
          { text: "취소", style: "cancel" },
          { text: "삭제", style: 'destructive', onPress: async () => {
              try {
                  setIsDeleting(true);
                  await deleteDoc(doc(db, "lostAndFoundItems", id as string));
                  router.back();
              } catch(e) { 
                  setIsDeleting(false);
                  Alert.alert("오류", "삭제 실패"); 
              }
          }}
      ]);
  };

  const handleEdit = () => { /* 기존 코드 동일 */
      if (!item) return;
      router.push({
          pathname: '/create-lost-item',
          params: {
              mode: 'edit',
              postId: item.id,
              initialItemName: item.itemName,
              initialDescription: item.description,
              initialLocation: item.location,
              initialImageUrls: JSON.stringify(item.imageUrls || []),
              initialType: item.postType || 'lost'
          }
      });
  };

  const handleChat = async () => {
      // ✨ [수정] Ref로 즉시 차단
      if (!currentUser || !item || isNavigatingRef.current) return;

      const userId = currentUser.uid;
      const creatorId = item.creatorId;

      if (userId === creatorId) {
          return Alert.alert("알림", "본인이 작성한 글입니다.");
      }

      // ✨ [수정] 잠금 걸기
      isNavigatingRef.current = true;
      setIsNavigating(true);

      const sortedUids = [creatorId, userId].sort();
      const chatRoomId = `lost_${item.id}_${sortedUids.join('_')}`;
      const chatRoomRef = doc(db, "chatRooms", chatRoomId);

      try {
          const roomSnap = await getDoc(chatRoomRef);
          if (!roomSnap.exists()) {
              await setDoc(chatRoomRef, {
                  name: `[${item.postType === 'lost' ? '분실' : '습득'}] ${item.itemName}`,
                  members: sortedUids,
                  type: 'lost-item', 
                  lostItemId: item.id,
                  createdAt: serverTimestamp(),
                  lastMessage: '',
                  lastMessageTimestamp: null,
                  lastReadBy: { [creatorId]: serverTimestamp(), [userId]: serverTimestamp() }
              });
          } else {
              await updateDoc(chatRoomRef, { members: arrayUnion(creatorId, userId) });
          }
          
          router.push(`/chat/${chatRoomId}`);
          
          // ✨ [수정] 1.5초 후 잠금 해제 (화면 전환 동안 터치 방지)
          setTimeout(() => {
             isNavigatingRef.current = false;
             setIsNavigating(false);
          }, 1500);

      } catch (e) {
          console.error(e);
          Alert.alert("오류", "채팅방 연결 실패");
          // 에러 시 즉시 해제
          isNavigatingRef.current = false;
          setIsNavigating(false);
      }
  };

  const handleScroll = (event: any) => { /* 기존 코드 동일 */
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    setCurrentImageIndex(Math.round(index));
  };

  if (loading || !item) {
      return (
          <View style={styles.center}>
              <ActivityIndicator size="large" color="#0062ffff" />
          </View>
      );
  }

  const isOwner = currentUser?.uid === item.creatorId;
  const displayImages = item.imageUrls && item.imageUrls.length > 0 
      ? item.imageUrls 
      : (item.imageUrl ? [item.imageUrl] : []);
  
  const themeColor = (item.postType || item.type) === 'lost' ? '#ff6b6b' : '#4d96ff';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
             <Ionicons name="chevron-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>상세 정보</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
         {/* 이미지 슬라이더 */}
         {displayImages.length > 0 ? (
            <View style={styles.sliderContainer}>
                <FlatList
                    data={displayImages}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(_, i) => i.toString()}
                    onMomentumScrollEnd={handleScroll}
                    renderItem={({ item: uri }) => (
                        <TouchableOpacity 
                            activeOpacity={0.9} 
                            onPress={() => setIsImageViewerVisible(true)}
                            style={styles.slide}
                        >
                            <Image source={{ uri }} style={styles.slideImage} resizeMode="contain" />
                        </TouchableOpacity>
                    )}
                />
                {displayImages.length > 1 && (
                    <View style={styles.pagination}>
                        <Text style={styles.paginationText}>
                            {currentImageIndex + 1} / {displayImages.length}
                        </Text>
                    </View>
                )}
            </View>
         ) : (
            <View style={styles.noImageContainer}>
                <Ionicons 
                    name={(item.postType || item.type) === 'lost' ? "search" : "gift-outline"} 
                    size={60} 
                    color="#ddd" 
                />
                <Text style={styles.noImageText}>이미지가 없습니다</Text>
            </View>
         )}

         <View style={styles.contentContainer}>
             <View style={styles.badgeRow}>
                 <View style={[styles.typeBadge, { backgroundColor: themeColor + '20' }]}>
                     <Text style={[styles.typeText, { color: themeColor }]}>
                         {(item.postType || item.type) === 'lost' ? '분실물' : '습득물'}
                     </Text>
                 </View>
                 <Text style={styles.dateText}>
                    {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ''}
                 </Text>
             </View>

             <Text style={styles.title}>{item.itemName}</Text>
             
             <View style={styles.locationRow}>
                 <Ionicons name="location-sharp" size={18} color="#666" />
                 <Text style={styles.locationText}>{item.location}</Text>
             </View>

             <View style={styles.divider} />
             
             <View style={styles.creatorRow}>
                 <TouchableOpacity onPress={() => setProfileUserId(item.creatorId)} style={styles.profileTouch}>
                    <Ionicons name="person-circle" size={40} color="#ccc" />
                    <View style={{marginLeft: 10}}>
                        <Text style={styles.creatorName}>
                            {item.creatorName || '익명'}
                        </Text>
                        <Text style={styles.creatorSub}>작성자</Text>
                    </View>
                 </TouchableOpacity>
             </View>

             <View style={styles.descBox}>
                 <Text style={styles.descTitle}>상세 내용</Text>
                 <Text style={styles.descText}>{item.description}</Text>
             </View>
         </View>
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
         {isOwner ? (
             <View style={styles.ownerButtonRow}>
                 <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={handleEdit}>
                     <Text style={styles.actionBtnText}>수정</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
                     <Text style={[styles.actionBtnText, {color: '#fff'}]}>삭제</Text>
                 </TouchableOpacity>
             </View>
         ) : (
             <TouchableOpacity 
                // ✨ [수정] 네비게이션 중일 때 비활성화 스타일 적용
                style={[
                    styles.chatButton, 
                    { backgroundColor: themeColor },
                    isNavigating && { opacity: 0.7 } 
                ]} 
                onPress={handleChat}
                // ✨ [수정] 버튼 비활성화
                disabled={isNavigating}
             >
                {/* ✨ [수정] 로딩 인디케이터 */}
                {isNavigating ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <>
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" style={{marginRight: 6}} />
                        <Text style={styles.chatButtonText}>작성자와 대화하기</Text>
                    </>
                )}
             </TouchableOpacity>
         )}
      </View>

      {/* 이미지 뷰어 */}
      {displayImages.length > 0 && (
          <ImageView
              images={displayImages.map(uri => ({ uri }))}
              imageIndex={currentImageIndex}
              visible={isImageViewerVisible}
              onRequestClose={() => setIsImageViewerVisible(false)}
          />
      )}

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 10, paddingBottom: 10, backgroundColor: '#fff',
      borderBottomWidth: 1, borderBottomColor: '#f1f3f5'
  },
  iconButton: { padding: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  
  scrollContent: { paddingBottom: 100 },
  
  sliderContainer: { height: 300, backgroundColor: '#000', position: 'relative' },
  slide: { width: SCREEN_WIDTH, height: 300, justifyContent: 'center', alignItems: 'center' },
  slideImage: { width: '100%', height: '100%' },
  pagination: {
      position: 'absolute', bottom: 15, right: 15,
      backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12
  },
  paginationText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  noImageContainer: {
      height: 200, backgroundColor: '#f8f9fa',
      justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee'
  },
  noImageText: { color: '#999', marginTop: 10 },
  
  contentContainer: { padding: 20 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 12, fontWeight: 'bold' },
  dateText: { color: '#999', fontSize: 12 },
  
  title: { fontSize: 22, fontWeight: '800', color: '#333', marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  locationText: { color: '#555', fontSize: 15, marginLeft: 4 },
  
  divider: { height: 1, backgroundColor: '#f1f3f5', marginBottom: 20 },
  
  creatorRow: { marginBottom: 20 },
  profileTouch: { flexDirection: 'row', alignItems: 'center' },
  creatorName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  creatorSub: { fontSize: 12, color: '#888' },
  
  descBox: { backgroundColor: '#f8f9fa', padding: 15, borderRadius: 12 },
  descTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  descText: { fontSize: 16, lineHeight: 24, color: '#333' },
  
  bottomBar: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee',
      padding: 15,
  },
  ownerButtonRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editBtn: { backgroundColor: '#f1f3f5' },
  deleteBtn: { backgroundColor: '#ff5252' },
  actionBtnText: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  
  chatButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 14, borderRadius: 12
  },
  chatButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});