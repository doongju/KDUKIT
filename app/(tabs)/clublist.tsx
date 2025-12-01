// app/(tabs)/clublist.tsx

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
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
}

const ClubItemBase = ({ item, onPress }: { item: ClubPost, onPress: (post: ClubPost) => void }) => {
  const isFull = item.currentMembers.length >= item.memberLimit;
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.cardInner}>
        <View style={styles.imageContainer}>
          {item.imageUrl ? (
            <Image 
              source={{ uri: item.imageUrl }} 
              style={styles.cardImage} 
              contentFit="cover"
              transition={300} 
            />
          ) : (
            <View style={styles.noImagePlaceholder}>
              <Ionicons name="people" size={32} color="#C4C4C4" />
            </View>
          )}
        </View>
        <View style={styles.textContainer}> 
          <View style={styles.cardHeaderRow}>
            <Text style={styles.clubName} numberOfLines={1}>{item.clubName}</Text>
            <View style={[styles.statusDot, { backgroundColor: isFull ? '#ff5252' : '#00c853' }]} />
          </View>
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          <View style={styles.tagRow}>
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{item.activityField}</Text>
            </View>
            <View style={[styles.memberTag, isFull && styles.memberTagFull]}>
              <Ionicons name="person" size={10} color={isFull ? '#d32f2f' : '#555'} style={{marginRight: 2}}/>
              <Text style={[styles.memberTagText, isFull && styles.memberTagTextFull]}>
                {item.currentMembers.length}/{item.memberLimit} {isFull ? '마감' : ''}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};
const ClubItem = memo(ClubItemBase);
ClubItem.displayName = 'ClubItem';

export default function ClubListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [clubPosts, setClubPosts] = useState<ClubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('전체');
  const [isSearching, setIsSearching] = useState(false); 
  const [searchQuery, setSearchQuery] = useState('');   

  const fetchClubPosts = useCallback(() => {
    if (!currentUser) { setLoading(false); setClubPosts([]); return () => {}; }
    setLoading(true);
    let q = query(collection(db, 'clubPosts'));
    if (selectedFilter !== '전체') {
      q = query(q, where('activityField', '==', selectedFilter));
    }
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const postsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          clubName: data.clubName,
          description: data.description,
          activityField: data.activityField,
          memberLimit: data.memberLimit,
          currentMembers: data.currentMembers || [],
          creatorId: data.creatorId,
          imageUrl: data.imageUrl,
        };
      }) as ClubPost[];
      postsData.sort((a, b) => (b.id > a.id ? 1 : -1));
      setClubPosts(postsData);
      setLoading(false);
      setRefreshing(false);
    }, (error) => { setLoading(false); });
    return unsubscribe;
  }, [currentUser, selectedFilter]); 

  useEffect(() => { const unsub = fetchClubPosts(); return () => unsub(); }, [fetchClubPosts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const displayedPosts = useMemo(() => {
    if (!searchQuery.trim()) return clubPosts;
    const lowerQuery = searchQuery.toLowerCase();
    return clubPosts.filter(post => 
      post.clubName.toLowerCase().includes(lowerQuery) || 
      post.description.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, clubPosts]);

  // ✨ [수정 1] router.push 타입 에러 해결 (as any 추가)
  const handlePressPost = useCallback((post: ClubPost) => {
    // TypeScript가 경로 문자열을 엄격하게 체크해서 에러가 발생하므로 'as any'로 우회합니다.
    router.push(`/club-detail/${post.id}` as any);
  }, [router]);

  // ✨ [수정 2] 누락되었던 renderItem 함수 정의 추가
  const renderItem = useCallback(({ item }: { item: ClubPost }) => (
    <ClubItem item={item} onPress={handlePressPost} />
  ), [handlePressPost]);

  const handleCreateClubPost = () => {
    if (!currentUser) return Alert.alert("로그인 필요", "로그인 후 작성할 수 있습니다.");
    router.push({ pathname: '/(tabs)/create-club', params: { mode: 'new', t: Date.now().toString() } });
  };

  if (loading) return <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator size="large" color="#0062ffff" /></View>;
  
  if (!currentUser) return (
    <View style={styles.container}>
        <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
            <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>동아리</Text>
            </View>
        </View>
        <View style={styles.emptyListContainer}>
            <Ionicons name="lock-closed-outline" size={60} color="#ccc" style={{marginBottom: 10}}/>
            <Text style={styles.emptyListText}>로그인이 필요한 서비스입니다.</Text>
            <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.loginButtonText}>로그인 하러가기</Text>
            </TouchableOpacity>
        </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}> 
        {isSearching ? (
          <View style={styles.searchBarWrapper}>
             <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery(''); }} style={{padding: 8}}>
               <Ionicons name="arrow-back" size={24} color="#333" />
             </TouchableOpacity>
             <TextInput
                style={styles.searchInput}
                placeholder="동아리 이름, 키워드 검색"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                placeholderTextColor="#999"
             />
             {searchQuery.length > 0 && (
                 <TouchableOpacity onPress={() => setSearchQuery('')} style={{padding: 8}}>
                     <Ionicons name="close-circle" size={20} color="#ccc" />
                 </TouchableOpacity>
             )}
          </View>
        ) : (
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>동아리</Text>
            <TouchableOpacity style={styles.iconButton} onPress={() => setIsSearching(true)}>
              <Ionicons name="search" size={24} color="#333" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {/* Filter Bar */}
      {!isSearching && (
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {['전체', '학술', '스포츠', '봉사', '창작', '예술', '기타'].map((field) => (
              <TouchableOpacity 
                key={field} 
                style={[styles.filterButton, selectedFilter === field && styles.filterButtonActive]} 
                onPress={() => setSelectedFilter(field)}
              >
                <Text style={[styles.filterButtonText, selectedFilter === field && styles.filterButtonTextActive]}>{field}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main List */}
      <FlatList
        data={displayedPosts}
        renderItem={renderItem} 
        keyExtractor={item => item.id}
        contentContainerStyle={styles.flatListContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
        ListEmptyComponent={
            <View style={styles.emptyListContainer}>
                <Ionicons name="search-outline" size={50} color="#ddd" />
                <Text style={styles.emptyListText}>{searchQuery ? "검색 결과가 없습니다." : "등록된 동아리가 없습니다."}</Text>
            </View>
        }
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <TouchableOpacity 
          style={[styles.fab, { bottom: 90, right: 20 }]} 
          onPress={handleCreateClubPost} 
          activeOpacity={0.9}
      >
          <Ionicons name="add" size={26} color="white" />
          <Text style={styles.fabText}>모집하기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  headerContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f3f5', zIndex: 10 },
  headerContent: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  iconButton: { padding: 8, borderRadius: 20, backgroundColor: '#f8f9fa' },
  searchBarWrapper: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  searchInput: { flex: 1, height: 40, backgroundColor: '#f1f3f5', borderRadius: 20, paddingHorizontal: 15, fontSize: 16, color: '#333', marginLeft: 5 },
  filterBar: { backgroundColor: '#fff', paddingVertical: 10 },
  filterScroll: { paddingHorizontal: 20 },
  filterButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f8f9fa', marginRight: 8, borderWidth: 1, borderColor: '#eee' },
  filterButtonActive: { backgroundColor: '#333', borderColor: '#333' },
  filterButtonText: { color: '#666', fontWeight: '600', fontSize: 14 },
  filterButtonTextActive: { color: '#fff' },
  flatListContent: { paddingHorizontal: 20, paddingVertical: 15, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#f5f5f5', overflow: 'hidden' },
  cardInner: { flexDirection: 'row', padding: 16 },
  imageContainer: { marginRight: 16 },
  cardImage: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#f1f3f5' },
  noImagePlaceholder: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#f8f9fa', justifyContent: 'center', alignItems: 'center' },
  textContainer: { flex: 1, justifyContent: 'space-between' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  clubName: { fontSize: 17, fontWeight: 'bold', color: '#222', flex: 1, marginRight: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  description: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 8 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryTag: { backgroundColor: '#eef4ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  categoryTagText: { color: '#0062ffff', fontSize: 11, fontWeight: '700' },
  memberTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  memberTagFull: { backgroundColor: '#ffebee' },
  memberTagText: { color: '#666', fontSize: 11, fontWeight: '600' },
  memberTagTextFull: { color: '#d32f2f' },
  emptyListContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
  emptyListText: { fontSize: 16, color: '#999', marginTop: 10 },
  loginButton: { backgroundColor: '#0062ffff', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginTop: 20 },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 90, right: 20, backgroundColor: '#0062ffff', borderRadius: 30, paddingHorizontal: 20, height: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', shadowColor: '#0062ffff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10, zIndex: 9999 },
  fabText: { color: 'white', fontSize: 16, fontWeight: 'bold', marginLeft: 6 },
});