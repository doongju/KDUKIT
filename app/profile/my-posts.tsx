// app/profile/my-posts.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

export default function MyPostsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [activeTab, setActiveTab] = useState<'market' | 'club'>('market');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const collectionName = activeTab === 'market' ? 'marketPosts' : 'clubPosts';
      
      // ✨ [핵심] 내가 작성한 글만 가져오기 (creatorId == 내 UID)
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
                const collectionName = activeTab === 'market' ? 'marketPosts' : 'clubPosts';
                await deleteDoc(doc(db, collectionName, id));
                // 목록에서 즉시 제거
                setPosts(prev => prev.filter(p => p.id !== id));
            } catch(e) { Alert.alert("오류", "삭제 실패"); }
        }}
    ]);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={{flex: 1}}>
            <Text style={styles.title} numberOfLines={1}>
                {/* 마켓이면 title, 동아리면 clubName 표시 */}
                {activeTab === 'market' ? item.title : item.clubName}
            </Text>
            <Text style={styles.desc} numberOfLines={1}>
                {activeTab === 'market' ? `${item.price?.toLocaleString()}원` : item.activityField}
            </Text>
            <Text style={styles.date}>
                {item.createdAt?.toDate().toLocaleDateString()}
            </Text>
        </View>
        
        {/* 마켓일 경우 판매 상태 표시 */}
        {activeTab === 'market' && (
            <Text style={[styles.status, item.status === '판매완료' ? {color:'red'} : {color:'#0062ffff'}]}>
                {item.status}
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

      {/* 탭 버튼 (중고마켓 / 동아리) */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, activeTab === 'market' && styles.activeTab]} onPress={() => setActiveTab('market')}>
            <Text style={[styles.tabText, activeTab === 'market' && styles.activeTabText]}>중고마켓</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'club' && styles.activeTab]} onPress={() => setActiveTab('club')}>
            <Text style={[styles.tabText, activeTab === 'club' && styles.activeTabText]}>동아리</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#0062ffff" style={{marginTop:50}} /> : (
        <FlatList
            data={posts}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{padding:20}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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