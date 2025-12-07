// app/profile/my-posts.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

export default function MyPostsScreen() {
  // ✨ [수정 1] 탭 상태에 'lost' 추가
  const [activeTab, setActiveTab] = useState<'market' | 'club' | 'lost'>('market');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      let collectionName = '';

      if (activeTab === 'market') {
        collectionName = 'marketPosts';
      } else if (activeTab === 'club') {
        collectionName = 'clubPosts';
      } else if (activeTab === 'lost') { // ✨ [수정 2] 분실물 컬렉션 추가
        collectionName = 'lostAndFoundItems';
      }
      
      // ✨ [수정 3] timetables 외에는 모두 creatorId를 사용하며, lostAndFoundItems도 creatorId를 사용함
      const q = query(
        collection(db, collectionName),
        where('creatorId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPosts(data);
    } catch (error) {
      console.error("Fetch my posts error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    Alert.alert("삭제", "정말 삭제하시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "삭제", style: 'destructive', onPress: async () => {
            try {
                let collectionName = '';
                if (activeTab === 'market') collectionName = 'marketPosts';
                else if (activeTab === 'club') collectionName = 'clubPosts';
                else if (activeTab === 'lost') collectionName = 'lostAndFoundItems'; // ✨ [수정 4] 삭제 대상 추가

                if (collectionName) {
                    await deleteDoc(doc(db, collectionName, id));
                    // 목록에서 즉시 제거
                    setPosts(prev => prev.filter(p => p.id !== id));
                }
            } catch(e) { 
                Alert.alert("오류", "삭제 실패"); 
            }
        }}
    ]);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={{flex: 1}}>
            <Text style={styles.title} numberOfLines={1}>
                {/* ✨ [수정 5] 타이틀 표시 로직 (분실물 추가) */}
                {activeTab === 'market' 
                    ? item.title 
                    : activeTab === 'club' 
                    ? item.clubName 
                    : item.itemName // 분실물은 itemName 사용
                }
            </Text>
            <Text style={styles.desc} numberOfLines={1}>
                {/* ✨ [수정 6] 상세 정보 표시 로직 (분실물 추가) */}
                {activeTab === 'market' 
                    ? `${item.price?.toLocaleString() || 0}원` 
                    : activeTab === 'club' 
                    ? item.activityField 
                    : `${item.location} (${item.type === 'lost' ? '분실' : '습득'})` // 분실물 위치/타입 표시
                }
            </Text>
            <Text style={styles.date}>
                {item.createdAt?.toDate().toLocaleDateString()}
            </Text>
        </View>
        
        {/* 마켓일 경우 판매 상태 표시 / 분실물일 경우 해결 상태 표시 */}
        {(activeTab === 'market' || activeTab === 'lost') && (
            <Text style={[
                styles.status, 
                (item.status === '판매완료' || item.status === 'resolved') ? {color:'red'} : {color:'#0062ffff'}
            ]}>
                {item.status === '판매완료' ? '거래완료' : item.status === 'resolved' ? '해결됨' : item.status === 'unresolved' ? '미해결' : item.status}
            </Text>
        )}
      </View>
      
      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
        <Ionicons name="trash-outline" size={20} color="#666" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>내가 쓴 게시글</Text>
        <View style={{width:24}}/>
      </View>

      {/* ✨ [수정 7] 탭 버튼에 '분실물' 추가 */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, activeTab === 'market' && styles.activeTab]} onPress={() => setActiveTab('market')}>
            <Text style={[styles.tabText, activeTab === 'market' && styles.activeTabText]}>중고마켓</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'club' && styles.activeTab]} onPress={() => setActiveTab('club')}>
            <Text style={[styles.tabText, activeTab === 'club' && styles.activeTabText]}>동아리</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'lost' && styles.activeTab]} onPress={() => setActiveTab('lost')}>
            <Text style={[styles.tabText, activeTab === 'lost' && styles.activeTabText]}>분실물</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#0062ffff" style={{marginTop:50}} /> : (
        <FlatList
            data={posts}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{padding:20}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
            ListEmptyComponent={<Text style={styles.emptyText}>작성한 게시글이 없습니다.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#fff', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 20 },
  tab: { marginRight: 20, paddingVertical: 10 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#0062ffff' },
  tabText: { fontSize: 16, color: '#aaa' },
  activeTabText: { color: '#0062ffff', fontWeight: 'bold' },
  card: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, alignItems: 'center' },
  cardContent: { flex: 1 },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  desc: { fontSize: 14, color: '#666', marginBottom: 4 },
  date: { fontSize: 12, color: '#999' },
  status: { position: 'absolute', top: 0, right: 10, fontSize: 12, fontWeight: 'bold' },
  deleteBtn: { padding: 10 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
});