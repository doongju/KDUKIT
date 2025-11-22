// app/profile/wishlist.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayRemove, doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

export default function WishlistScreen() {
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 찜 목록 데이터 가져오기
  const fetchWishlist = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      // 1. 내 정보에서 wishlist 배열 가져오기
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      // 찜한 게 없으면 빈 배열
      const wishlistIds = userSnap.exists() ? (userSnap.data().wishlist || []) : [];

      if (wishlistIds.length === 0) {
          setPosts([]);
          setLoading(false);
          return;
      }

      // 2. 게시글 ID들로 실제 상품 데이터 가져오기 (병렬 처리)
      const promises = wishlistIds.map(async (id: string) => {
          try {
            const postSnap = await getDoc(doc(db, 'marketPosts', id));
            // 게시글이 삭제되지 않고 존재할 때만 반환
            if (postSnap.exists()) {
                return { id: postSnap.id, ...postSnap.data() };
            }
            return null; 
          } catch { return null; }
      });

      const results = await Promise.all(promises);
      // null 값(삭제된 글) 제거
      setPosts(results.filter(p => p !== null));

    } catch (error) {
      console.error("Wishlist fetch error:", error);
      Alert.alert("오류", "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWishlist();
  };

  // 찜 해제 (목록에서 제거)
  const handleRemoveWish = async (postId: string) => {
      try {
          if(!user) return;
          
          // 1. DB에서 제거
          await updateDoc(doc(db, 'users', user.uid), {
              wishlist: arrayRemove(postId)
          });
          
          // 2. 화면 목록에서 즉시 제거 (새로고침 없이)
          setPosts(prev => prev.filter(p => p.id !== postId));
          
      } catch(e) { 
          Alert.alert("오류", "찜 해제 실패"); 
      }
  };

  const renderItem = ({ item }: { item: any }) => {
    // 판매 상태에 따른 색상
    let statusColor = '#0062ffff';
    if (item.status === '예약중') statusColor = '#ffc107';
    if (item.status === '판매완료') statusColor = '#dc3545';

    return (
        <View style={styles.card}>
        {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} />
        ) : (
            <View style={styles.noImage}><Ionicons name="image-outline" size={24} color="#ccc"/></View>
        )}
        
        <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.price}>{item.price.toLocaleString()}원</Text>
            <View style={styles.row}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={[styles.status, { color: statusColor }]}>{item.status}</Text>
            </View>
        </View>
        
        {/* 찜 해제 버튼 (빨간 하트) */}
        <TouchableOpacity onPress={() => handleRemoveWish(item.id)} style={styles.heartBtn}>
            <Ionicons name="heart" size={26} color="#ff3b30" />
        </TouchableOpacity>
        </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{padding: 5}}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>관심 목록</Text>
        <View style={{width: 30}}/>
      </View>

      {loading ? (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#0062ffff" />
        </View>
      ) : (
        <FlatList
            data={posts}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={{padding: 20}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
            ListEmptyComponent={
                <View style={styles.center}>
                    <Ionicons name="heart-dislike-outline" size={60} color="#ddd" />
                    <Text style={styles.emptyText}>찜한 상품이 없습니다.</Text>
                </View>
            }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
  header: { 
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
      paddingHorizontal: 15, paddingVertical: 15, backgroundColor: '#fff', 
      borderBottomWidth: 1, borderBottomColor: '#eee' 
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  
  card: { 
      flexDirection: 'row', backgroundColor: '#fff', padding: 15, 
      borderRadius: 12, marginBottom: 12, alignItems: 'center',
      elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width:0, height:2 }
  },
  image: { width: 70, height: 70, borderRadius: 8, marginRight: 15, resizeMode: 'cover', backgroundColor: '#eee' },
  noImage: { width: 70, height: 70, borderRadius: 8, marginRight: 15, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  textContainer: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 4, color: '#333' },
  price: { fontSize: 15, fontWeight: 'bold', color: '#0062ffff', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  category: { fontSize: 12, color: '#888', marginRight: 8 },
  status: { fontSize: 12, fontWeight: 'bold' },
  
  heartBtn: { padding: 5 },
  emptyText: { textAlign: 'center', marginTop: 15, color: '#999', fontSize: 15 },
});