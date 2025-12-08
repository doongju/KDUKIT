import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayUnion, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, // ✨ 로딩바 컴포넌트
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
import { db } from '../../firebaseConfig';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface ClubPost {
  id: string;
  clubName: string;
  description: string;
  activityField: string;
  memberLimit: number;
  currentMembers: string[];
  creatorId: string;
  imageUrl?: string;
  imageUrls?: string[];
}

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const currentUserId = currentUser?.uid;

  const [post, setPost] = useState<ClubPost | null>(null);
  
  // ✨ [핵심 1] 로딩 상태 true로 시작
  const [loading, setLoading] = useState(true);
  
  // ✨ [핵심 2] 삭제 중인지 확인하는 상태 추가
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'clubPosts', id as string);
    
    // ✨ [핵심 3] 데이터 가져오는 로직
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      // 내가 삭제 중이라면 스냅샷 로직 무시
      if (isDeleting) return;

      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() } as ClubPost);
      } else {
        // 내가 아닌 다른 이유로 삭제되었을 때만 알림
        Alert.alert("알림", "삭제된 게시글입니다.");
        router.back();
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id, isDeleting]); // 의존성 배열에 isDeleting 추가

  const handleDeletePost = async () => {
    Alert.alert("게시글 삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          try {
            // ✨ [핵심 4] 삭제 플래그 켜기 (스냅샷 무시)
            setIsDeleting(true);
            
            await deleteDoc(doc(db, "clubPosts", id as string));
            
            // ✨ [핵심 5] 알림 없이 목록으로 바로 이동 (경로가 다르다면 수정해주세요)
            router.back(); 
            
          } catch (error) { 
            console.error(error);
            setIsDeleting(false); // 실패 시 플래그 끄기
            Alert.alert("오류", "삭제 실패"); 
          }
      }}
    ]);
  };

  const handleEditPost = () => {
    if (!post) return;
    router.push({
      pathname: '/create-club',
      params: {
        mode: 'edit',
        postId: post.id,
        initialClubName: post.clubName,
        initialDescription: post.description,
        initialActivityField: post.activityField,
        initialMemberLimit: post.memberLimit.toString(),
        initialImageUrl: post.imageUrls && post.imageUrls.length > 0 
            ? post.imageUrls[0] 
            : (post.imageUrl || ''),
      }
    });
  };

  const handleApplyAndChat = async () => {
    if (!currentUser || !currentUserId || !post) return Alert.alert("로그인 필요", "로그인이 필요합니다.");
    
    if (post.currentMembers.includes(currentUserId)) {
      Alert.alert("알림", "이미 가입된 채팅방으로 이동합니다.");
      navigateToDmChat(post.creatorId, currentUserId, post.clubName, post.id);
      return;
    }

    if (post.currentMembers.length >= post.memberLimit) return Alert.alert("모집 완료", "인원이 가득 찼습니다.");

    Alert.alert("동아리 신청", `'${post.clubName}'에 신청하고 채팅을 시작할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "신청", onPress: async () => {
          await updateDoc(doc(db, "clubPosts", post.id), { currentMembers: arrayUnion(currentUserId) });
          await navigateToDmChat(post.creatorId, currentUserId, post.clubName, post.id);
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
        
        let roomName = "문의 채팅방";

        try {
          // ✨ [수정] 상대방 유저 정보 가져오기
          // (내 이름이 아니라, 글 작성자의 displayId로 방 이름을 만들어야 헷갈리지 않음)
          // 혹은, '내' 정보를 가져와서 상대방에게 내 이름을 보여주고 싶다면 currentUserId 사용.
          // 보통 1:1 채팅방 이름은 "상대방 이름"으로 설정하는 게 일반적입니다.
          // 여기서는 "신청자(나)"의 정보를 가져와서 방 이름으로 설정하는 것 같네요.
          const userSnap = await getDoc(doc(db, "users", currentUserId));
          
          if (userSnap.exists()) {
            const userData = userSnap.data();
            
            // ✨ [핵심] displayId가 있으면 그걸 씀!
            if (userData.displayId) {
                roomName = `${userData.displayId} 문의`;
            } 
            // displayId가 없으면 기존 로직 (학번 + 학과)
            else if (userData.department && currentUser?.email) {
               const prefix = currentUser.email.split('@')[0];
               roomName = `${prefix}님 ${userData.department} 문의`;
            }
          }
        } catch (e) {
            console.error("유저 정보 조회 실패", e);
        }

        await setDoc(chatRoomRef, {
          name: roomName, // ✨ 수정된 이름 저장
          members: sortedUids,
          type: 'club',
          clubId: postId,
          createdAt: serverTimestamp(),
          lastReadBy: {[targetUserId]: serverTimestamp(), [currentUserId]: serverTimestamp()}
        });
      } else {
        // 이미 방이 있으면 멤버만 업데이트 (혹시나 해서)
        await updateDoc(chatRoomRef, { members: arrayUnion(targetUserId, currentUserId) });
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

  // ✨ [핵심 6] 로딩 중이거나 데이터가 없으면 로딩바(ActivityIndicator) 표시
  if (loading || !post) {
    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0062ffff" />
        </View>
    );
  }

  const isMyPost = currentUserId && post.creatorId === currentUserId;
  const isFull = post.currentMembers.length >= post.memberLimit;
  const isJoined = currentUserId ? post.currentMembers.includes(currentUserId) : false;

  const getButtonState = () => {
    if (isJoined) return { text: "💬 채팅방 입장", disabled: false, style: styles.applyButtonJoined };
    if (isFull) return { text: "🚫 모집 완료", disabled: true, style: styles.applyButtonDisabled };
    return { text: "👋 신청하고 채팅하기", disabled: false, style: styles.applyButton };
  };
  const btnState = getButtonState();

  const images = post.imageUrls && post.imageUrls.length > 0 
    ? post.imageUrls 
    : (post.imageUrl ? [post.imageUrl] : []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>모집 상세</Text>
        <View style={{width: 40}} /> 
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* 이미지 슬라이더 */}
            {images.length > 0 ? (
                <View style={styles.imageContainer}>
                    <FlatList
                        data={images}
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
                    {images.length > 1 && (
                        <View style={styles.pageIndicator}>
                            <Text style={styles.pageIndicatorText}>{currentImageIndex + 1} / {images.length}</Text>
                        </View>
                    )}
                    <View style={styles.zoomHint}>
                        <Ionicons name="expand-outline" size={16} color="white" />
                    </View>
                </View>
            ) : (
                <View style={[styles.imageContainer, {backgroundColor: '#f8f9fa', justifyContent:'center', alignItems:'center'}]}>
                      <Ionicons name="image-outline" size={48} color="#ccc" />
                </View>
            )}

            <View style={styles.contentSection}>
                <View style={styles.badgeRow}>
                    <View style={styles.categoryBadge}>
                        <Text style={styles.categoryText}>{post.activityField}</Text>
                    </View>
                    <View style={[styles.statusBadge, isFull && {backgroundColor:'#ffebee'}]}>
                        <Text style={[styles.statusText, isFull && {color:'#c62828'}]}>
                            {isFull ? '모집마감' : '모집중'}
                        </Text>
                    </View>
                </View>

                <Text style={styles.title}>{post.clubName}</Text>

                <View style={styles.infoRow}>
                    <Ionicons name="people-outline" size={18} color="#666" />
                    <Text style={styles.infoText}>
                        현재 {post.currentMembers.length}명 / 정원 {post.memberLimit}명
                    </Text>
                </View>

                <View style={styles.divider} />

                <Text style={styles.sectionTitle}>소개</Text>
                <Text style={styles.description}>{post.description}</Text>
            </View>
        </ScrollView>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        {isMyPost ? (
            <View style={styles.ownerButtonContainer}>
                <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={handleEditPost}>
                    <Text style={styles.editButtonText}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDeletePost}>
                    <Text style={styles.deleteButtonText}>삭제</Text>
                </TouchableOpacity>
            </View>
        ) : (
            <TouchableOpacity 
                style={[styles.applyButton, btnState.style]} 
                onPress={handleApplyAndChat}
                disabled={btnState.disabled}
            >
                <Text style={styles.applyButtonText}>{btnState.text}</Text>
            </TouchableOpacity>
        )}
      </View>

      {images.length > 0 && (
        <ImageView
          images={images.map(uri => ({ uri }))}
          imageIndex={currentImageIndex}
          visible={isImageViewerVisible}
          onRequestClose={() => setIsImageViewerVisible(false)}
          swipeToCloseEnabled={true}
          doubleTapToZoomEnabled={true}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
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
  
  zoomHint: { position: 'absolute', right: 15, bottom: 15, backgroundColor: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 20 },

  contentSection: { padding: 24 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  categoryBadge: { backgroundColor: '#0062ffff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  categoryText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  statusBadge: { backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#2e7d32', fontSize: 12, fontWeight: 'bold' },

  title: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  infoText: { fontSize: 15, color: '#666', marginLeft: 6, fontWeight: '500' },
  
  divider: { height: 8, backgroundColor: '#f8f9fa', marginVertical: 24, marginHorizontal: -24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  description: { fontSize: 16, color: '#444', lineHeight: 26 },

  bottomBar: { 
    padding: 20, borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff',
  },
  ownerButtonContainer: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  editButton: { backgroundColor: '#f1f3f5' },
  editButtonText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
  deleteButton: { backgroundColor: '#ffebee' },
  deleteButtonText: { color: '#d32f2f', fontWeight: 'bold', fontSize: 16 },

  applyButton: { paddingVertical: 16, borderRadius: 16, alignItems: 'center',backgroundColor: '#0062ffff' },
  applyButtonJoined: { backgroundColor: '#4CAF50' },
  applyButtonDisabled: { backgroundColor: '#e0e0e0' },
  applyButtonText: { color: 'white', fontWeight: 'bold', fontSize: 17 },
});