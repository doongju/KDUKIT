// app/(tabs)/lost-and-found.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { memo, useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    BackHandler,
    FlatList,
    Image,
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

interface LostItem {
  id: string;
  type: 'lost' | 'found';
  itemName: string;
  location: string;
  createdAt: any;
  status: string;
  imageUrl?: string;    // 대표 이미지 (하위 호환용)
  imageUrls?: string[]; // ✨ 전체 이미지 목록
}

// ✨ [수정] 리스트 아이템: 사진이 여러 장이면 가로 스크롤 가능
const ItemCard = memo(({ item, onPress }: { item: LostItem, onPress: (id: string) => void }) => {
    
    // 보여줄 이미지 목록 정리 (imageUrls가 없으면 imageUrl 사용, 둘 다 없으면 빈 배열)
    const images = item.imageUrls && item.imageUrls.length > 0 
        ? item.imageUrls 
        : (item.imageUrl ? [item.imageUrl] : []);

    return (
      <TouchableOpacity 
          style={styles.itemCard}
          onPress={() => onPress(item.id)}
          activeOpacity={0.9} // 스크롤 중 실수로 눌리는 것 방지 위해 투명도 조절
      >
          <View style={styles.topContainer}>
            {/* ✨ 이미지가 있을 때: 가로 스크롤 뷰 렌더링 */}
            {images.length > 0 ? (
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    style={styles.imageScroll}
                    contentContainerStyle={styles.imageScrollContent}
                >
                    {images.map((url, index) => (
                        <Image 
                            key={index} 
                            source={{ uri: url }} 
                            style={styles.thumbnailImage} 
                        />
                    ))}
                </ScrollView>
            ) : (
                // 이미지가 없을 때: 기존 아이콘 박스
                <View style={[styles.iconBox, item.type === 'lost' ? styles.lostIcon : styles.foundIcon]}>
                    <Ionicons 
                        name={item.type === 'lost' ? "search" : "gift"} 
                        size={24} 
                        color="#fff" 
                    />
                </View>
            )}
          </View>

          <View style={styles.itemInfo}>
              <View style={styles.itemHeader}>
                  <Text style={[styles.typeTag, { color: item.type === 'lost' ? '#ff6b6b' : '#4d96ff' }]}>
                      {item.type === 'lost' ? '분실' : '습득'}
                  </Text>
                  <Text style={styles.dateText}>
                      {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ''}
                  </Text>
              </View>
              <Text style={styles.itemName} numberOfLines={1}>{item.itemName}</Text>
              <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
          </View>
          
          {/* 화살표 아이콘 (우측 중앙 정렬) */}
          <View style={styles.arrowContainer}>
             <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </View>
      </TouchableOpacity>
    );
});
ItemCard.displayName = "ItemCard";

export default function LostAndFoundScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [filter, setFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
      const backAction = () => {
          if (isSearching) {
              setIsSearching(false);
              setSearchQuery('');
              return true;
          }
          return false;
      };
      const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
      return () => backHandler.remove();
  }, [isSearching]);

  useEffect(() => {
      const q = query(collection(db, "lostAndFoundItems"), orderBy("createdAt", "desc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const loadedItems = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
          })) as LostItem[];
          setItems(loadedItems);
          setLoading(false);
          setRefreshing(false);
      });
      return () => unsubscribe();
  }, []);

  const filteredItems = items.filter(item => {
      const matchesType = filter === 'all' || item.type === filter;
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

  const renderItem = useCallback(({ item }: { item: LostItem }) => (
      <ItemCard item={item} onPress={handlePressItem} />
  ), [handlePressItem]);

  return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
          
          {/* 헤더 */}
          <View style={styles.headerBar}>
              {isSearching ? (
                  <View style={styles.searchBarContainer}>
                      <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery(''); }}>
                          <Ionicons name="arrow-back" size={24} color="#333" />
                      </TouchableOpacity>
                      <TextInput 
                          style={styles.searchInput}
                          placeholder="물건 이름, 장소 검색"
                          placeholderTextColor="#999"
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          autoFocus
                          returnKeyType="search"
                      />
                      {searchQuery.length > 0 && (
                          <TouchableOpacity onPress={() => setSearchQuery('')}>
                              <Ionicons name="close-circle" size={20} color="#ccc" />
                          </TouchableOpacity>
                      )}
                  </View>
              ) : (
                  <View style={styles.defaultHeaderContainer}>
                      <Text style={styles.headerTitle}>분실물 센터</Text>
                      <TouchableOpacity 
                          onPress={() => setIsSearching(true)} 
                          style={styles.searchIconBtn}
                      >
                          <Ionicons name="search-outline" size={26} color="#333" />
                      </TouchableOpacity>
                  </View>
              )}
          </View>

          {/* 필터 및 등록 버튼 */}
          <View style={styles.controlContainer}>
              <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.scrollContentContainer}
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

                  <View style={styles.verticalDivider} />

                  <TouchableOpacity 
                      style={[styles.actionButton, styles.actionLost]}
                      onPress={() => router.push('/(tabs)/create-lost-item?type=lost')}
                  >
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={styles.actionText}>분실 등록</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                      style={[styles.actionButton, styles.actionFound]}
                      onPress={() => router.push('/(tabs)/create-lost-item?type=found')}
                  >
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={styles.actionText}>습득 등록</Text>
                  </TouchableOpacity>
              </ScrollView>
          </View>

          {/* 리스트 */}
          {loading ? (
              <ActivityIndicator size="large" color="#0062ffff" style={{ marginTop: 20 }} />
          ) : (
              <FlatList
                  data={filteredItems}
                  renderItem={renderItem}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.listContent}
                  refreshControl={
                      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                  }
                  ListEmptyComponent={
                      <View style={styles.emptyContainer}>
                          {searchQuery ? (
                              <>
                                  <Ionicons name="search-outline" size={50} color="#ddd" />
                                  <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
                              </>
                          ) : (
                              <Text style={styles.emptyText}>등록된 물건이 없습니다.</Text>
                          )}
                      </View>
                  }
                  initialNumToRender={8}
                  maxToRenderPerBatch={5}
                  windowSize={5}
              />
          )}
      </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerBar: {
      height: 60, justifyContent: 'center', paddingHorizontal: 20,
      borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff',
  },
  defaultHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  searchIconBtn: { padding: 5 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f2f3f7', borderRadius: 10, paddingHorizontal: 10, height: 40 },
  searchInput: { flex: 1, fontSize: 16, color: '#333', marginLeft: 10, paddingVertical: 0 },
  controlContainer: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  scrollContentContainer: { paddingHorizontal: 20, alignItems: 'center', gap: 8 },
  filterButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#eee' },
  filterButtonActive: { backgroundColor: '#333', borderColor: '#333' },
  filterText: { color: '#666', fontWeight: '600', fontSize: 14 },
  filterTextActive: { color: '#fff' },
  verticalDivider: { width: 1, height: 20, backgroundColor: '#ddd', marginHorizontal: 5 },
  actionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, gap: 4, elevation: 2 },
  actionLost: { backgroundColor: '#ff6b6b' },
  actionFound: { backgroundColor: '#4d96ff' },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  listContent: { padding: 20, paddingBottom: 50, backgroundColor: '#f5f5f5' },
  
  // ✨ [수정] 카드 레이아웃 스타일 개선
  itemCard: { 
      flexDirection: 'row', // 가로 배치 유지하되 내부에서 구역 나눔
      alignItems: 'center', 
      backgroundColor: '#fff', 
      borderRadius: 12, 
      padding: 12, 
      marginBottom: 12, 
      elevation: 2, 
      shadowColor: '#000', 
      shadowOpacity: 0.1, 
      shadowOffset: { width: 0, height: 1 } 
  },
  
  // 왼쪽 영역 (이미지 또는 아이콘)
  topContainer: { marginRight: 15 },

  // 이미지 없을 때 아이콘 박스
  iconBox: { width: 65, height: 65, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  lostIcon: { backgroundColor: '#ff6b6b' },
  foundIcon: { backgroundColor: '#4d96ff' },
  
  // ✨ [추가] 이미지 가로 스크롤 스타일
  imageScroll: { width: 70, height: 70 }, // 스크롤 영역 크기 지정
  imageScrollContent: { alignItems: 'center' },
  thumbnailImage: { width: 65, height: 65, borderRadius: 12, marginRight: 8, backgroundColor: '#eee', resizeMode: 'cover' },

  // 가운데 정보 영역
  itemInfo: { flex: 1, justifyContent: 'center' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  typeTag: { fontSize: 12, fontWeight: 'bold' },
  dateText: { fontSize: 12, color: '#999' },
  itemName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  locationText: { fontSize: 14, color: '#666' },
  
  // 오른쪽 화살표 영역
  arrowContainer: { justifyContent: 'center', paddingLeft: 5 },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#999', fontSize: 16, marginTop: 10 },
});