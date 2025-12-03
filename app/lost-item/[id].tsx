// app/lost-item/[id].tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import UserProfileModal from '../../components/UserProfileModal';
import { db } from '../../firebaseConfig';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_PADDING = 20;
const IMAGE_WIDTH = SCREEN_WIDTH - (CONTENT_PADDING * 2);

interface ItemDetail {
  id: string;
  postType?: string;
  type: 'lost' | 'found';
  itemName: string;
  location: string;
  description: string;
  imageUrl?: string;
  imageUrls?: string[]; 
  createdAt: any;
  creatorName?: string;
  creatorId: string;
  status: string;
}

export default function LostItemDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0); 

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  
  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, "lostAndFoundItems", id as string);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (isDeleting) return;

        if (docSnap.exists()) {
            setItem({ id: docSnap.id, ...docSnap.data() } as ItemDetail);
        } else {
            Alert.alert("알림", "삭제된 게시물입니다.");
            router.back();
        }
        setLoading(false);
    });
    return () => unsubscribe();
  }, [id, isDeleting]);

  const handleDelete = async () => {
    Alert.alert("게시물 삭제", "정말로 이 게시물을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          try {
            setIsDeleting(true); 
            if (id) {
              await deleteDoc(doc(db, "lostAndFoundItems", id as string));
              router.back();
            }
          } catch (error) { 
             setIsDeleting(false);
             Alert.alert("오류", "삭제 중 문제가 발생했습니다."); 
          }
      }}
    ]);
  };

  const handleEdit = () => {
    if (!item) return;
    router.push({
      pathname: '/create-lost-item',
      params: {
        mode: 'edit',
        postId: item.id,
        initialItemName: item.itemName,
        initialLocation: item.location,
        initialDescription: item.description,
        initialType: item.postType || item.type,
        initialImageUrls: JSON.stringify(item.imageUrls || (item.imageUrl ? [item.imageUrl] : [])),
      }
    });
  };

  const handleChat = async () => {
    if (!user || !item || !id) {
      Alert.alert("오류", "로그인이 필요하거나 정보가 부족합니다.");
      return;
    }
    const chatRoomId = `lost_${id}_${user.uid}`;
    try {
      const chatRoomRef = doc(db, "chatRooms", chatRoomId);
      await setDoc(chatRoomRef, {
        type: 'lost-item',
        partyId: null,
        name: `${item.itemName}`,
        members: [user.uid, item.creatorId],
        relatedItemId: id,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      router.push(`/chat/${chatRoomId}`);
    } catch (error) { Alert.alert("오류", "채팅방을 여는 중 문제가 발생했습니다."); }
  };

  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / IMAGE_WIDTH);
    setCurrentImageIndex(index);
  };

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#0062ffff" /></View>;
  if (!item) return null;

  const isLost = (item.postType === 'lost' || item.type === 'lost');
  const themeColor = isLost ? '#ff6b6b' : '#4d96ff';
  const isOwner = user?.uid === item.creatorId;

  const images = item.imageUrls && item.imageUrls.length > 0 
    ? item.imageUrls 
    : (item.imageUrl ? [item.imageUrl] : []);

  let dateString = '';
  if (item.createdAt?.toDate) {
      const d = item.createdAt.toDate();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dateString = `${year}/${month}/${day}`;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" />

      {/* 헤더 */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>상세 정보</Text>
        <View style={{width: 40}} /> 
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* 이미지 슬라이드 */}
        {images.length > 0 && (
          <View style={styles.imageWrapper}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScroll} 
              style={styles.imageScrollView}
            >
              {images.map((uri, index) => (
                <TouchableOpacity 
                  key={index} 
                  activeOpacity={0.9} 
                  onPress={() => setIsImageViewerVisible(true)}
                >
                  <Image source={{ uri }} style={styles.detailImage} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            {images.length > 1 && (
              <View style={styles.pageIndicator}>
                <Text style={styles.pageIndicatorText}>
                  {currentImageIndex + 1} / {images.length}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* 배지 및 날짜 */}
        <View style={styles.metaRow}>
          <View style={styles.badgesContainer}>
              <View style={[styles.badge, { backgroundColor: themeColor }]}>
                <Text style={styles.badgeText}>{isLost ? '분실' : '습득'}</Text>
              </View>
              
              {isOwner && (
                <View style={styles.myPostBadge}>
                    <Text style={styles.myPostBadgeText}>내 글</Text>
                </View>
              )}
          </View>
          <Text style={styles.date}>{dateString}</Text>
        </View>

        <Text style={styles.title}>{item.itemName}</Text>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.label}>위치</Text>
          <View style={styles.row}>
            <Ionicons name="location-sharp" size={20} color="#666" />
            <Text style={styles.value}>{item.location}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>상세 설명</Text>
          <View style={styles.descriptionBox}>
            <Text style={styles.description}>{item.description || "상세 설명이 없습니다."}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>작성자</Text>
          <TouchableOpacity 
            style={styles.row} 
            onPress={() => setProfileUserId(item.creatorId)}
          >
            <Ionicons name="person-circle-outline" size={24} color="#666" />
            <Text style={[styles.value, {textDecorationLine:'underline', color:'#0062ffff'}]}>
                {item.creatorName || '익명'} {isOwner && " (나)"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ✨ [수정] 하단 버튼 영역 (스타일 강화) */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        {isOwner ? (
          <View style={styles.ownerButtonContainer}>
             <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={handleEdit}>
                <Text style={styles.editButtonText}>수정</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
                <Text style={styles.deleteButtonText}>삭제</Text>
             </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.bigChatButton, { backgroundColor: themeColor }]} 
            onPress={handleChat}
            activeOpacity={0.8}
          >
            {/* View로 감싸서 레이아웃 안정화 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.bigChatButtonText}>작성자와 대화하기</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <ImageView
        images={images.map(uri => ({ uri }))}
        imageIndex={currentImageIndex} 
        visible={isImageViewerVisible}
        onRequestClose={() => setIsImageViewerVisible(false)}
        swipeToCloseEnabled={true}
      />

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { padding: 10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },

  content: { padding: CONTENT_PADDING, paddingBottom: 100 },
  
  imageWrapper: { 
    width: IMAGE_WIDTH, 
    height: 300, 
    borderRadius: 16, 
    overflow: 'hidden', 
    marginBottom: 20, 
    backgroundColor: '#f0f0f0', 
    elevation: 2,
    position: 'relative', 
  },
  imageScrollView: { width: '100%', height: '100%' },
  detailImage: { width: IMAGE_WIDTH, height: 300, resizeMode: 'cover' },
  
  pageIndicator: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  pageIndicatorText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badgesContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  statusBadge: { backgroundColor: '#f0f0f0' },
  statusText: { color: '#666', fontSize: 12, fontWeight: '600' },
  
  myPostBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbdefb'
  },
  myPostBadgeText: { color: '#1976d2', fontSize: 11, fontWeight: '700' },

  date: { fontSize: 13, color: '#999' },

  title: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 8 },
  
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
  section: { marginBottom: 25 },
  label: { fontSize: 15, fontWeight: 'bold', color: '#888', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { fontSize: 16, color: '#333' },
  descriptionBox: { backgroundColor: '#f9f9f9', padding: 16, borderRadius: 12, minHeight: 100 },
  description: { fontSize: 15, color: '#444', lineHeight: 24 },
  
  bottomBar: { 
    padding: 20, 
    borderTopWidth: 1, 
    borderTopColor: '#f0f0f0', 
    backgroundColor: '#fff',
  },
  ownerButtonContainer: { flexDirection: 'row', gap: 12 },
  actionButton: { 
    flex: 1, 
    paddingVertical: 16, 
    borderRadius: 16, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  editButton: { backgroundColor: '#f1f3f5' },
  editButtonText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
  deleteButton: { backgroundColor: '#ffebee' },
  deleteButtonText: { color: '#d32f2f', fontWeight: 'bold', fontSize: 16 },

  // ✨ 채팅 신청 버튼 스타일 (텍스트 스타일 명시)
  bigChatButton: {
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center', // 중앙 정렬
    justifyContent: 'center'
  },
  bigChatButtonText: { 
    color: '#fff', // 흰색 텍스트 강제
    fontSize: 17, 
    fontWeight: 'bold',
    includeFontPadding: false, // 안드로이드 수직 정렬 이슈 방지
  },
});