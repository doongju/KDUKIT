import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import UserProfileModal from '../../components/UserProfileModal';

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
  type: string;
  createdAt: any;
  creatorName?: string;
}

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [post, setPost] = useState<ClubPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // ✨ 중복 네비게이션 방지 상태 및 Ref
  const [isNavigating, setIsNavigating] = useState(false);
  const isNavigatingRef = useRef(false);

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'clubPosts', id as string);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (isDeleting) return;

      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() } as ClubPost);
      } else {
        Alert.alert("알림", "삭제된 게시글입니다.");
        router.back();
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id, router, isDeleting]);

  const handleDeletePost = () => {
    Alert.alert("삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          try {
            setIsDeleting(true);
            await deleteDoc(doc(db, "clubPosts", id as string));
            router.back();
          } catch (error) {
            console.error(error);
            setIsDeleting(false);
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
        postId: post.id,
        initialClubName: post.clubName,
        initialDescription: post.description,
        initialActivityField: post.activityField,
        initialMemberLimit: post.memberLimit.toString(),
        initialImageUrl: post.imageUrls ? post.imageUrls[0] : (post.imageUrl || ''),
      }
    });
  };

  const handleApplyAndChat = async () => {
    // ✨ 이미 네비게이션 중이면 중단 (중복 클릭 방지)
    if (!currentUser || !post || isNavigatingRef.current) return;

    if (post.creatorId === currentUser.uid) {
       return Alert.alert("알림", "본인이 개설한 동아리입니다.");
    }

    // ✨ [수정됨] 안전한 접근 (post나 currentUser가 null일 때 에러 방지)
    const isUserMember = post.currentMembers?.includes(currentUser.uid) ?? false;
    
    // 이미 멤버가 아닌데 정원이 꽉 찼다면 차단
    if (!isUserMember && post.currentMembers.length >= post.memberLimit) {
        return Alert.alert("마감", "모집 인원이 가득 찼습니다.");
    }

    // ✨ 네비게이션 잠금 시작
    isNavigatingRef.current = true;
    setIsNavigating(true);

    try {
        // 1. 멤버가 아니라면 추가 (신청 처리)
        if (!isUserMember) {
            await updateDoc(doc(db, 'clubPosts', post.id), {
                currentMembers: arrayUnion(currentUser.uid)
            });
        }

        // 2. 채팅방 생성 또는 이동 (1:1 문의방)
        const sortedUids = [post.creatorId, currentUser.uid].sort();
        const chatRoomId = `dm_${post.id}_${sortedUids.join('_')}`;
        const chatRoomRef = doc(db, 'chatRooms', chatRoomId);

        const roomSnap = await getDoc(chatRoomRef);
        
        if (!roomSnap.exists()) {
            await setDoc(chatRoomRef, {
                name: `[동아리 문의] ${post.clubName}`,
                members: sortedUids,
                type: 'club',
                clubId: post.id,
                createdAt: serverTimestamp(),
                lastMessage: '',
                lastMessageTimestamp: null,
                lastReadBy: { 
                    [post.creatorId]: serverTimestamp(), 
                    [currentUser.uid]: serverTimestamp() 
                }
            });
        } else {
            // 혹시 멤버가 빠져있다면 다시 추가
            await updateDoc(chatRoomRef, { members: arrayUnion(post.creatorId, currentUser.uid) });
        }

        // 3. 채팅방으로 이동
        router.push(`/chat/${chatRoomId}`);

        // ✨ 화면 전환 애니메이션 시간 동안 잠금 유지 (1.5초)
        setTimeout(() => {
            isNavigatingRef.current = false;
            setIsNavigating(false);
        }, 1500);

    } catch (e) {
        console.error(e);
        Alert.alert("오류", "처리에 실패했습니다.");
        // 에러 발생 시 즉시 잠금 해제
        isNavigatingRef.current = false;
        setIsNavigating(false);
    }
  };

  const handleScroll = (event: any) => {
      const slideSize = event.nativeEvent.layoutMeasurement.width;
      const index = event.nativeEvent.contentOffset.x / slideSize;
      setCurrentImageIndex(Math.round(index));
  };

  if (loading || !post) {
    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0062ffff" />
        </View>
    );
  }

  const postImages = post.imageUrls && post.imageUrls.length > 0 
    ? post.imageUrls 
    : (post.imageUrl ? [post.imageUrl] : []);

  const isOwner = currentUser?.uid === post.creatorId;
  
  // ✨ [수정됨] 안전한 접근 (Red line fix)
  // post나 currentUser가 null이면 false로 처리
  const isMember = post?.currentMembers?.includes(currentUser?.uid || '') ?? false;
  
  const isFull = post.currentMembers.length >= post.memberLimit;

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
                      <Ionicons name="people-outline" size={48} color="#ccc" />
                </View>
            )}

            <View style={styles.contentSection}>
                <View style={styles.headerRow}>
                    <View style={styles.categoryBadge}>
                        <Text style={styles.categoryText}>{post.activityField}</Text>
                    </View>
                    <View style={[styles.statusBadge, isFull ? {backgroundColor:'#ffebee'} : {backgroundColor:'#e8f5e9'}]}>
                        <Text style={[styles.statusText, isFull ? {color:'#c62828'} : {color:'#2e7d32'}]}>
                            {isFull ? '모집마감' : '모집중'}
                        </Text>
                    </View>
                </View>

                <Text style={styles.title}>{post.clubName}</Text>
                
                <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={16} color="#666" />
                    <Text style={styles.infoText}>
                        현재 {post.currentMembers.length}명 / 정원 {post.memberLimit}명
                    </Text>
                </View>

                <View style={styles.divider} />

                <TouchableOpacity 
                    style={styles.creatorRow} 
                    onPress={() => setProfileUserId(post.creatorId)}
                >
                    <Ionicons name="person-circle" size={40} color="#ccc" />
                    <View style={{marginLeft: 10}}>
                        <Text style={styles.creatorName}>{post.creatorName || '익명'}</Text>
                        <Text style={styles.creatorLabel}>모임장</Text>
                    </View>
                    <View style={{flex:1}} />
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>

                <View style={styles.divider} />

                <Text style={styles.sectionTitle}>모임 소개</Text>
                <Text style={styles.description}>{post.description}</Text>
            </View>
        </ScrollView>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        {isOwner ? (
            <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#f1f3f5'}]} onPress={handleEditPost}>
                    <Text style={[styles.actionBtnText, {color:'#333'}]}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#ffcdd2'}]} onPress={handleDeletePost}>
                    <Text style={[styles.actionBtnText, {color:'#c62828'}]}>삭제</Text>
                </TouchableOpacity>
            </View>
        ) : (
            <TouchableOpacity 
                // ✨ [수정] 네비게이션 중이면 비활성화 스타일
                style={[
                    styles.mainButton, 
                    (isFull && !isMember) || isNavigating ? {backgroundColor:'#ccc'} : {backgroundColor:'#0062ffff'}
                ]}
                onPress={handleApplyAndChat}
                // ✨ [수정] 버튼 비활성화
                disabled={(isFull && !isMember) || isNavigating}
            >
                {/* ✨ [수정] 로딩 인디케이터 표시 */}
                {isNavigating ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <Text style={styles.mainButtonText}>
                        {isMember ? '💬 채팅방 입장' : (isFull ? '🚫 모집 완료' : '👋 신청하고 채팅하기')}
                    </Text>
                )}
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

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />
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
  
  imageContainer: { width: SCREEN_WIDTH, height: 300, backgroundColor: '#000', position: 'relative' },
  imageWrapper: { width: SCREEN_WIDTH, height: 300, justifyContent: 'center', alignItems: 'center' },
  postImage: { width: '100%', height: '100%' },
  
  pageIndicator: {
    position: 'absolute', bottom: 15, right: 15,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12
  },
  pageIndicatorText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  contentSection: { padding: 20 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  categoryBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  categoryText: { fontSize: 13, color: '#555', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 13, fontWeight: 'bold' },

  title: { fontSize: 24, fontWeight: '800', color: '#333', marginBottom: 10 },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoText: { fontSize: 15, color: '#555', marginLeft: 6 },

  divider: { height: 1, backgroundColor: '#f1f3f5', marginVertical: 20 },

  creatorRow: { flexDirection: 'row', alignItems: 'center' },
  creatorName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  creatorLabel: { fontSize: 13, color: '#888' },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  description: { fontSize: 16, lineHeight: 26, color: '#444' },

  bottomBar: { 
    padding: 15, borderTopWidth: 1, borderColor: '#f1f3f5', backgroundColor: '#fff',
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontWeight: 'bold', fontSize: 16 },

  mainButton: { 
      paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3
  },
  mainButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
});