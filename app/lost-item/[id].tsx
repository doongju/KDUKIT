// app/lost-item/[id].tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ScrollView,
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
const IMAGE_WIDTH = SCREEN_WIDTH - (CONTENT_PADDING * 2); // 패딩을 뺀 실제 이미지 너비

interface ItemDetail {
  type: 'lost' | 'found';
  itemName: string;
  location: string;
  description: string;
  imageUrl?: string;
  imageUrls?: string[]; // ✨ 여러 장의 이미지
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
  
  // ✨ 이미지 뷰어 상태
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // 현재 보고 있는 이미지 번호

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  
  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    const fetchItem = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, "lostAndFoundItems", id as string);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setItem(docSnap.data() as ItemDetail);
        } else {
          Alert.alert("오류", "존재하지 않는 게시물입니다.");
          router.back();
        }
      } catch (error) {
        console.error("상세 정보 로드 실패:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchItem();
  }, [id]);

  const handleDelete = async () => {
    Alert.alert("게시물 삭제", "정말로 이 게시물을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          try {
            if (id) {
              await deleteDoc(doc(db, "lostAndFoundItems", id as string));
              Alert.alert("삭제 완료", "게시물이 삭제되었습니다.");
              router.replace('/(tabs)/lost-and-found');
            }
          } catch (error) { Alert.alert("오류", "삭제 중 문제가 발생했습니다."); }
      }}
    ]);
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

  // ✨ 스크롤 시 현재 페이지 번호 업데이트
  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / IMAGE_WIDTH);
    setCurrentImageIndex(index);
  };

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#0062ffff" /></View>;
  if (!item) return null;

  const isLost = item.type === 'lost';
  const themeColor = isLost ? '#ff6b6b' : '#4d96ff';
  const isOwner = user?.uid === item.creatorId;

  // ✨ 이미지 목록 정리 (배열이 없으면 단일 이미지라도 배열로 만듦)
  const images = item.imageUrls && item.imageUrls.length > 0 
    ? item.imageUrls 
    : (item.imageUrl ? [item.imageUrl] : []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>상세 정보</Text>
        {isOwner && (
          <TouchableOpacity onPress={handleDelete} style={{ marginLeft: 'auto', padding: 10 }}>
            <Ionicons name="trash-outline" size={24} color="#ff4444" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* ✨ 이미지 슬라이드 영역 */}
        {images.length > 0 && (
          <View style={styles.imageWrapper}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScroll} // 스크롤 끝나면 페이지 번호 업데이트
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

            {/* 페이지 번호 표시 (1/3) */}
            {images.length > 1 && (
              <View style={styles.pageIndicator}>
                <Text style={styles.pageIndicatorText}>
                  {currentImageIndex + 1} / {images.length}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: themeColor }]}>
            <Text style={styles.badgeText}>{isLost ? '분실' : '습득'}</Text>
          </View>
          <View style={[styles.badge, styles.statusBadge]}>
            <Text style={styles.statusText}>{item.status === 'resolved' ? '해결됨' : '미해결'}</Text>
          </View>
        </View>

        <Text style={styles.title}>{item.itemName}</Text>
        <Text style={styles.date}>{item.createdAt?.toDate().toLocaleString()} 등록</Text>

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

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        {isOwner ? (
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#ff4444' }]} onPress={handleDelete}>
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>게시물 삭제하기</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: themeColor }]} onPress={handleChat}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>작성자와 대화하기</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ✨ 이미지 확대 뷰어 (전체 사진 보기) */}
      {images.length > 0 && (
        <ImageView
          images={images.map(uri => ({ uri }))}
          imageIndex={currentImageIndex} // 현재 보고 있는 사진부터 열기
          visible={isImageViewerVisible}
          onRequestClose={() => setIsImageViewerVisible(false)}
          swipeToCloseEnabled={true}
        />
      )}

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { padding: 10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 5 },
  
  content: { padding: CONTENT_PADDING, paddingBottom: 100 },
  
  // ✨ 이미지 슬라이드 스타일
  imageWrapper: { 
    width: IMAGE_WIDTH, 
    height: 300, 
    borderRadius: 12, 
    overflow: 'hidden', 
    marginBottom: 20, 
    backgroundColor: '#f0f0f0', 
    elevation: 3,
    position: 'relative', // 페이지 번호를 위해
  },
  imageScrollView: { width: '100%', height: '100%' },
  detailImage: { width: IMAGE_WIDTH, height: 300, resizeMode: 'cover' },
  
  // ✨ 페이지 번호 스타일 (우측 하단)
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

  badgeRow: { flexDirection: 'row', marginBottom: 15, gap: 8 },
  badge: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 6 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  statusBadge: { backgroundColor: '#f0f0f0' },
  statusText: { color: '#666', fontSize: 12, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  date: { fontSize: 14, color: '#999', marginBottom: 20 },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginBottom: 20 },
  section: { marginBottom: 25 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { fontSize: 16, color: '#444' },
  descriptionBox: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, minHeight: 100 },
  description: { fontSize: 15, color: '#444', lineHeight: 22 },
  bottomBar: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' },
  actionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 15, borderRadius: 12, gap: 8 },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});