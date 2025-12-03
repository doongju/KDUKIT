import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { memo, useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// ✨ 프로필 모달 import
import UserProfileModal from '../../components/UserProfileModal';

interface LostItem {
  id: string;
  type: string;
  postType?: 'lost' | 'found'; 
  itemName: string;
  location: string;
  createdAt: any;
  status: string;
  imageUrl?: string;    
  imageUrls?: string[]; 
  creatorId: string;
  creatorName?: string;
}

// ✨ [수정] ItemCard: 로직 단순화 (바로 모달 열기)
const ItemCard = memo(({ item, onPress, currentUserId, onProfilePress }: { 
    item: LostItem, 
    onPress: (id: string) => void, 
    currentUserId?: string,
    onProfilePress: (userId: string) => void 
}) => {
  const thumbnail = item.imageUrls && item.imageUrls.length > 0 
      ? item.imageUrls[0] 
      : (item.imageUrl ? item.imageUrl : null);
  
  const moreImagesCount = item.imageUrls ? item.imageUrls.length - 1 : 0;

  // 날짜 포맷 (YYYY/MM/DD)
  let dateString = '';
  if (item.createdAt?.toDate) {
      const d = item.createdAt.toDate();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dateString = `${year}/${month}/${day}`;
  }

  const displayType = item.postType || item.type;
  const isMyPost = currentUserId && item.creatorId === currentUserId;

  return (
    <TouchableOpacity 
        style={styles.card}
        onPress={() => onPress(item.id)}
        activeOpacity={0.9} 
    >
        <View style={styles.imageContainer}>
          {thumbnail ? (
              <>
                  <Image source={{ uri: thumbnail }} style={styles.cardImage} />
                  {moreImagesCount > 0 && (
                      <View style={styles.multipleImageIcon}>
                           <Ionicons name="layers" size={12} color="#fff" />
                      </View>
                  )}
              </>
          ) : (
              <View style={[styles.noImageContainer, displayType === 'lost' ? styles.bgLostLight : styles.bgFoundLight]}>
                  <Ionicons 
                      name={displayType === 'lost' ? "search" : "gift-outline"} 
                      size={32} 
                      color={displayType === 'lost' ? "#ff6b6b" : "#4d96ff"} 
                  />
              </View>
          )}
        </View>

        <View style={styles.textContainer}>
            {/* Header Row */}
            <View style={styles.headerRow}>
                <View style={styles.badgesContainer}>
                    <View style={[styles.badge, displayType === 'lost' ? styles.badgeLost : styles.badgeFound]}>
                        <Text style={[styles.badgeText, displayType === 'lost' ? styles.textLost : styles.textFound]}>
                            {displayType === 'lost' ? '분실' : '습득'}
                        </Text>
                    </View>
                    {isMyPost && (
                        <View style={styles.myPostBadge}>
                            <Text style={styles.myPostBadgeText}>내 글</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.dateText}>{dateString}</Text>
            </View>

            <Text style={styles.title} numberOfLines={1}>{item.itemName}</Text>
            
            <View style={styles.locationRow}>
                <Ionicons name="location-sharp" size={14} color="#888" style={{marginRight: 4}} />
                <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
            </View>

            {/* ✨ [수정] 작성자 프로필 버튼 (즉시 모달 실행) */}
            <View style={styles.authorRow}>
                <TouchableOpacity 
                    style={styles.authorInfoButton} 
                    onPress={(e) => {
                        e.stopPropagation(); // 카드 클릭 방지
                        onProfilePress(item.creatorId); // 바로 모달 열기
                    }}
                    hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                >
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Ionicons name="person-circle-outline" size={14} color="#555" style={{marginRight: 4}}/>
                        <Text style={styles.authorInfoText}>작성자 프로필</Text>
                        <Ionicons name="chevron-forward" size={12} color="#999" style={{marginLeft: 2}}/>
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    </TouchableOpacity>
  );
});
ItemCard.displayName = "ItemCard";

export default function LostAndFoundScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [filter, setFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [writeModalVisible, setWriteModalVisible] = useState(false);
  
  // 프로필 모달 상태
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  useEffect(() => {
      const backAction = () => {
          if (profileUserId) {
              setProfileUserId(null);
              return true;
          }
          if (writeModalVisible) {
              setWriteModalVisible(false);
              return true;
          }
          if (isSearching) {
              setIsSearching(false);
              setSearchQuery('');
              return true;
          }
          return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
  }, [isSearching, writeModalVisible, profileUserId]);

  useEffect(() => {
      const q = query(collection(db, "lostAndFoundItems"), orderBy("createdAt", "desc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const loadedItems = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              creatorName: doc.data().creatorName || null
          })) as LostItem[];
          setItems(loadedItems);
          setLoading(false);
          setRefreshing(false);
      });
      return () => unsubscribe();
  }, []);

  const filteredItems = items.filter(item => {
      const itemType = item.postType || item.type;
      const matchesType = filter === 'all' || itemType === filter;
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
          item.itemName.toLowerCase().includes(query) || 
          item.location.toLowerCase().includes(query);
      return matchesType && matchesSearch;
  });

  const onRefresh = useCallback(() => {
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handlePressItem = useCallback((id: string) => {
      router.push(`/lost-item/${id}`);
  }, [router]);

  const handleNavigateToWrite = (type: 'lost' | 'found') => {
      setWriteModalVisible(false);
      router.push(`/create-lost-item?type=${type}`);
  };

  const renderItem = useCallback(({ item }: { item: LostItem }) => (
      <ItemCard 
        item={item} 
        onPress={handlePressItem} 
        currentUserId={currentUser?.uid} 
        onProfilePress={(uid) => setProfileUserId(uid)}
      />
  ), [handlePressItem, currentUser]);

  return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
          
          {/* Header */}
          <View style={styles.headerContainer}>
              {isSearching ? (
                  <View style={styles.searchBarWrapper}>
                      <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery(''); }} style={{padding: 5}}>
                          <Ionicons name="arrow-back" size={24} color="#555" />
                      </TouchableOpacity>
                      <TextInput 
                          style={styles.searchInput}
                          placeholder="물건 이름, 장소 검색"
                          placeholderTextColor="#999"
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          autoFocus
                      />
                      {searchQuery.length > 0 && (
                          <TouchableOpacity onPress={() => setSearchQuery('')} style={{padding: 5}}>
                              <Ionicons name="close-circle" size={20} color="#ccc" />
                          </TouchableOpacity>
                      )}
                  </View>
              ) : (
                  <View style={styles.headerContent}>
                      <Text style={styles.headerTitle}>분실물 센터</Text>
                      <TouchableOpacity 
                          onPress={() => setIsSearching(true)} 
                          style={styles.iconButton}
                      >
                          <Ionicons name="search" size={24} color="#333" />
                      </TouchableOpacity>
                  </View>
              )}
          </View>

          {/* Filter Tabs */}
          {!isSearching && (
            <View style={styles.filterContainer}>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScroll}
                >
                    {['all', 'lost', 'found'].map((f) => (
                        <TouchableOpacity
                            key={f}
                            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
                            onPress={() => setFilter(f as any)}
                        >
                            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                {f === 'all' ? '전체' : f === 'lost' ? '분실물' : '습득물'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
          )}

          {/* List */}
          {loading ? (
              <ActivityIndicator size="large" color="#0062ffff" style={{ marginTop: 40 }} />
          ) : (
              <FlatList
                  data={filteredItems}
                  renderItem={renderItem}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.listContent}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                  ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                          <Ionicons name={searchQuery ? "search-outline" : "file-tray-outline"} size={60} color="#ddd" />
                          <Text style={styles.emptyText}>
                              {searchQuery ? "검색 결과가 없습니다." : "등록된 분실물이 없습니다."}
                          </Text>
                      </View>
                  }
                  initialNumToRender={8}
                  maxToRenderPerBatch={8}
              />
          )}

          {/* FAB */}
          {!writeModalVisible && (
            <TouchableOpacity 
              style={styles.fab} 
              onPress={() => setWriteModalVisible(true)}
              activeOpacity={0.9}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Write Type Modal */}
          <Modal
            animationType="fade"
            transparent={true}
            visible={writeModalVisible}
            onRequestClose={() => setWriteModalVisible(false)}
          >
            <TouchableOpacity 
                style={styles.modalOverlay} 
                activeOpacity={1} 
                onPress={() => setWriteModalVisible(false)}
            >
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>어떤 글을 작성하시나요?</Text>
                    
                    <TouchableOpacity 
                        style={[styles.modalButton, styles.modalButtonLost]} 
                        onPress={() => handleNavigateToWrite('lost')}
                        activeOpacity={0.8}
                    >
                        <View style={styles.modalIconBox}>
                            <Ionicons name="search" size={24} color="#ff6b6b" />
                        </View>
                        <View>
                            <Text style={styles.modalButtonTitle}>물건을 잃어버렸어요</Text>
                            <Text style={styles.modalButtonDesc}>분실물 등록하기</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.modalButton, styles.modalButtonFound]} 
                        onPress={() => handleNavigateToWrite('found')}
                        activeOpacity={0.8}
                    >
                        <View style={styles.modalIconBox}>
                            <Ionicons name="gift" size={24} color="#4d96ff" />
                        </View>
                        <View>
                            <Text style={styles.modalButtonTitle}>물건을 주웠어요</Text>
                            <Text style={styles.modalButtonDesc}>습득물 등록하기</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.modalCancelButton} 
                        onPress={() => setWriteModalVisible(false)}
                    >
                        <Text style={styles.modalCancelText}>닫기</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
          </Modal>

          {/* 프로필 모달 컴포넌트 */}
          <UserProfileModal 
            visible={!!profileUserId} 
            userId={profileUserId} 
            onClose={() => setProfileUserId(null)} 
          />

      </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  headerContainer: { 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f3f5',
    paddingVertical: 10,
  },
  headerContent: {
    height: 50,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  iconButton: { padding: 8, borderRadius: 20, backgroundColor: '#f8f9fa' },
  
  searchBarWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#f1f3f5', 
    borderRadius: 12, 
    marginHorizontal: 15,
    paddingHorizontal: 10, 
    height: 46 
  },
  searchInput: { flex: 1, fontSize: 16, color: '#333', marginLeft: 8 },

  filterContainer: { backgroundColor: '#fff', paddingVertical: 12 },
  filterScroll: { paddingHorizontal: 20 },
  filterButton: { 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 20, 
    backgroundColor: '#f8f9fa', 
    marginRight: 8, 
    borderWidth: 1, 
    borderColor: '#eee' 
  },
  filterButtonActive: { backgroundColor: '#333', borderColor: '#333' },
  filterText: { color: '#666', fontWeight: '600', fontSize: 14 },
  filterTextActive: { color: '#fff' },
  
  listContent: { padding: 20, paddingBottom: 100 },
  
  card: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    marginBottom: 16, 
    padding: 12, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 8, 
    elevation: 2 
  },
  imageContainer: { marginRight: 15, position: 'relative' },
  cardImage: { width: 90, height: 90, borderRadius: 12, backgroundColor: '#eee', resizeMode: 'cover' },
  
  noImageContainer: { 
    width: 90, height: 90, borderRadius: 12, 
    justifyContent: 'center', alignItems: 'center' 
  },
  bgLostLight: { backgroundColor: '#ffebee' },
  bgFoundLight: { backgroundColor: '#e3f2fd' },
  
  multipleImageIcon: {
      position: 'absolute', top: 6, right: 6, 
      backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, 
      padding: 4
  },

  textContainer: { flex: 1, justifyContent: 'space-between', paddingVertical: 2 },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badgesContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeLost: { backgroundColor: '#ffebee' },
  badgeFound: { backgroundColor: '#e3f2fd' },
  badgeText: { fontSize: 11, fontWeight: 'bold' },
  textLost: { color: '#ff6b6b' },
  textFound: { color: '#4d96ff' },
  
  myPostBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bbdefb'
  },
  myPostBadgeText: { color: '#1976d2', fontSize: 10, fontWeight: '700' },

  dateText: { fontSize: 12, color: '#999' },
  title: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 4 },
  
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  locationText: { fontSize: 13, color: '#666', flex: 1 },

  // ✨ 작성자 버튼 스타일 (간결화)
  authorRow: { alignItems: 'flex-end' },
  authorInfoButton: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f1f3f5'
  },
  authorInfoText: { fontSize: 11, color: '#888', fontWeight: '600' },

  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#999', fontSize: 16, marginTop: 10 },

  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 90,
    right: 20,
    width: 56,
    height: 56, borderRadius: 28,
    backgroundColor: '#0062ffff',
    justifyContent: 'center', alignItems: 'center',
    elevation: 5, shadowColor: '#0062ffff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    width: '85%', backgroundColor: '#fff', borderRadius: 24, padding: 24,
    alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity:0.2, shadowRadius:12
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#333', marginBottom: 20 },
  
  modalButton: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', padding: 16, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#f1f3f5'
  },
  modalButtonLost: { backgroundColor: '#fff' },
  modalButtonFound: { backgroundColor: '#fff' },
  
  modalIconBox: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#f8f9fa',
    justifyContent: 'center', alignItems: 'center', marginRight: 15
  },
  modalButtonTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  modalButtonDesc: { fontSize: 13, color: '#888' },

  modalCancelButton: { marginTop: 10, padding: 10 },
  modalCancelText: { color: '#999', fontSize: 15, fontWeight: '600' },
});