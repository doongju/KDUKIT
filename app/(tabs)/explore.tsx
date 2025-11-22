// app/(tabs)/explore.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// --- 타입 정의 ---
interface TimetableItem {
  id: string;
  courseName: string;
  time: string; // "월 09:30-10:30" or "온라인 강의"
  location: string;
  professor: string;
  isOnline: boolean;
}

interface MarketPreview {
  id: string;
  title: string;
  price: number;
  imageUrl?: string;
  status: string;
  creatorId: string;
}

interface TaxiPartyPreview {
  id: string;
  departureTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  currentMembers: string[];
  memberLimit: number;
  creatorId: string;
}

// 요일 변환 헬퍼 (일:0 ~ 토:6)
const getTodayDayString = () => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const todayIndex = new Date().getDay();
  return days[todayIndex];
};

const ExploreScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const user = auth.currentUser;

  // ⚠️ 기능 카드 클릭 핸들러 (중복 제거 및 정리 완료)
  const handleFeaturePress = (featureName: string) => {
    switch (featureName) {
      case "택시 파티":
        // 새로운 taxiparty.tsx 경로로 이동
        router.push('/(tabs)/taxiparty');
        break;

      case "동아리 모집":
        router.push('/(tabs)/clublist');
        break;

      case "중고 마켓":
        router.push('/(tabs)/marketlist');
        break;
      
      case "분실물 센터":
        // 분실물 센터 페이지로 이동
        router.push('/(tabs)/lost-and-found');
        break;

      case "셔틀버스": 
      default:
        // 나머지 미구현 기능에 대한 알림
        Alert.alert("준비 중", `${featureName} 기능은 현재 개발 중입니다. 잠시만 기다려 주세요!`);
  // --- 상태 관리 ---
  const [todayClasses, setTodayClasses] = useState<TimetableItem[]>([]);
  const [onlineClasses, setOnlineClasses] = useState<TimetableItem[]>([]);
  const [recentMarketItems, setRecentMarketItems] = useState<MarketPreview[]>([]);
  const [recentTaxiParties, setRecentTaxiParties] = useState<TaxiPartyPreview[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const todayStr = getTodayDayString(); // 오늘 요일 (예: "월")

  // --- 데이터 불러오기 ---
  const fetchData = () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // 1. 내 시간표 (오늘 수업 & 온라인 강의)
    const timetableQuery = query(
      collection(db, 'timetables'),
      where('userId', '==', user.uid)
    );

    const unsubTimetable = onSnapshot(timetableQuery, (snapshot) => {
      const today: TimetableItem[] = [];
      const online: TimetableItem[] = [];

      snapshot.docs.forEach(doc => {
        const data = { id: doc.id, ...doc.data() } as TimetableItem;
        
        if (data.isOnline) {
          online.push(data);
        } else if (data.time.startsWith(todayStr)) {
          today.push(data);
        }
      });

      today.sort((a, b) => a.time.localeCompare(b.time));
      
      setTodayClasses(today);
      setOnlineClasses(online);
    });

    // 2. 최신 중고 장터 글
    const marketQuery = query(
      collection(db, 'marketPosts'),
      where('status', '==', '판매중'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubMarket = onSnapshot(marketQuery, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MarketPreview[];
      
      // 내 글 제외 + 4개 자르기
      const filteredItems = items
        .filter(item => item.creatorId !== user.uid)
        .slice(0, 4);

      setRecentMarketItems(filteredItems);
    });

    // 3. 최신 택시 파티
    const taxiQuery = query(
      collection(db, 'taxiParties'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubTaxi = onSnapshot(taxiQuery, (snapshot) => {
      const parties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TaxiPartyPreview[];
      
      // 내 글 제외 + 참여중인 글 제외 + 마감 안 된 것만 -> 2개 자르기
      const activeParties = parties
        .filter(p => 
          p.creatorId !== user.uid && 
          !p.currentMembers.includes(user.uid) && 
          p.currentMembers.length < p.memberLimit
        )
        .slice(0, 2);

      setRecentTaxiParties(activeParties);
      setLoading(false);
      setRefreshing(false);
    });

    return () => {
      unsubTimetable();
      unsubMarket();
      unsubTaxi();
    };
  };

  useEffect(() => {
    const unsubscribe = fetchData();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(); 
    setTimeout(() => setRefreshing(false), 1000);
  };

  // --- 기능 이동 핸들러 ---
  const handleFeaturePress = (featureName: string) => {
    switch (featureName) {
      case "택시 파티": router.push('/(tabs)/taxiparty'); break;
      case "동아리 모집": router.push('/(tabs)/clublist'); break;
      case "중고 마켓": router.push('/(tabs)/marketlist'); break;
      case "셔틀버스": 
        Alert.alert("준비 중", "셔틀버스 시간표 기능은 곧 업데이트됩니다! 🚌"); 
        break;
      default: Alert.alert("준비 중", "곧 오픈될 예정입니다!"); break;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#0062ffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.logoText}>KDUKIT</Text>
        <TouchableOpacity onPress={() => router.push('/profile')}>
           <Ionicons name="person-circle-outline" size={30} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
      >
        
        {/* 1. 오늘의 시간표 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>오늘의 수업 ({todayStr})</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/timetable')}>
            <Text style={styles.moreText}>전체보기</Text>
          </TouchableOpacity>
        </View>

        {todayClasses.length > 0 ? (
          todayClasses.map((item) => (
            <View key={item.id} style={styles.timetableItem}>
              <View style={styles.timeBar} />
              <View style={{flex: 1}}>
                <Text style={styles.courseTitle}>{item.courseName}</Text>
                <Text style={styles.courseTime}>
                  {item.time.split(' ')[1]} | {item.location}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>오늘 예정된 수업이 없습니다 😆</Text>
          </View>
        )}

        {/* 주요 기능 그리드 */}
        <View style={styles.featuresGrid}>
          {Object.entries(featureIcons).map(([feature, icon]) => (
            <TouchableOpacity 
              key={feature} 
              style={styles.featureCard}
              onPress={() => handleFeaturePress(feature)} 
            >
              <View style={styles.featureCardContent}>
                <Text style={styles.featureIcon}>{icon}</Text>
                <Text style={styles.featureText}>{feature}</Text>
        {/* 온라인 강의 표시 */}
        {onlineClasses.length > 0 && (
          <View style={{marginTop: 10}}>
             <Text style={[styles.subTitle, {marginBottom: 5}]}>💻 온라인 강의</Text>
             {onlineClasses.map(item => (
               <View key={item.id} style={styles.onlineItem}>
                 <Text style={styles.onlineText}>{item.courseName} ({item.professor})</Text>
               </View>
             ))}
          </View>
        )}

        {/* 2. 주요 기능 바로가기 (버튼 수정됨: 시간표 -> 셔틀버스) */}
        <View style={styles.gridContainer}>
          {[
            { name: "중고 마켓", icon: "cart", color: "#4CAF50" },
            { name: "택시 파티", icon: "car", color: "#2196F3" },
            { name: "동아리 모집", icon: "people", color: "#FF9800" },
            { name: "셔틀버스", icon: "bus", color: "#9C27B0" }, // ✨ 변경됨
          ].map((item, idx) => (
            <TouchableOpacity key={idx} style={styles.gridItem} onPress={() => handleFeaturePress(item.name)}>
              <View style={[styles.iconCircle, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon as any} size={24} color={item.color} />
              </View>
              <Text style={styles.gridText}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 3. 최신 중고 거래 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>방금 올라온 중고템 🔥</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/marketlist')}>
            <Text style={styles.moreText}>더보기</Text>
          </TouchableOpacity>
        </View>

        {recentMarketItems.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal: -20, paddingHorizontal: 20}}>
            {recentMarketItems.map((item) => (
              <TouchableOpacity 
                key={item.id} 
                style={styles.marketCard}
                onPress={() => {
                    router.push('/(tabs)/marketlist'); 
                }}
              >
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.marketImage} />
                ) : (
                  <View style={styles.marketNoImage}>
                    <Ionicons name="image-outline" size={24} color="#ccc" />
                  </View>
                )}
                <Text style={styles.marketTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.marketPrice}>{item.price.toLocaleString()}원</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>새로운 상품이 없습니다.</Text>
          </View>
        )}

        {/* 4. 모집 중인 택시 파티 */}
        <View style={[styles.sectionHeader, { marginTop: 25 }]}>
          <Text style={styles.sectionTitle}>지금 모집 중인 택시 🚕</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/taxiparty')}>
            <Text style={styles.moreText}>더보기</Text>
          </TouchableOpacity>
        </View>

        {recentTaxiParties.length > 0 ? (
          recentTaxiParties.map((party) => (
            <TouchableOpacity key={party.id} style={styles.taxiCard} onPress={() => router.push('/(tabs)/taxiparty')}>
              <View style={styles.taxiIcon}>
                <Ionicons name="car-sport" size={24} color="#fff" />
              </View>
              <View style={{flex: 1, marginLeft: 15}}>
                <Text style={styles.taxiRoute}>
                  {party.pickupLocation} → {party.dropoffLocation}
                </Text>
                <Text style={styles.taxiTime}>{party.departureTime} 출발</Text>
              </View>
              <View style={styles.taxiBadge}>
                <Text style={styles.taxiBadgeText}>
                  {party.currentMembers.length}/{party.memberLimit}명
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>참여 가능한 파티가 없습니다.</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
};

export default ExploreScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee'
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  logoText: { fontSize: 22, fontWeight: '900', color: '#0062ffff' },
  scrollContent: { padding: 20 },
  
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  subTitle: { fontSize: 14, fontWeight: 'bold', color: '#666', marginTop: 5 },
  moreText: { fontSize: 13, color: '#999' },

  timetableItem: { 
    flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 12, 
    marginBottom: 10, alignItems: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2 
  },
  timeBar: { width: 4, height: '100%', backgroundColor: '#0062ffff', borderRadius: 2, marginRight: 12 },
  courseTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  courseTime: { fontSize: 14, color: '#666' },
  
  onlineItem: { 
    padding: 12, backgroundColor: '#e8f0fe', borderRadius: 8, marginBottom: 6, 
    borderLeftWidth: 4, borderLeftColor: '#8ab4f8'
  },
  onlineText: { fontSize: 14, color: '#333' },

  gridContainer: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 20 },
  gridItem: { alignItems: 'center', width: '23%' },
  iconCircle: { 
    width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 8 
  },
  gridText: { fontSize: 12, fontWeight: 'bold', color: '#555' },

  marketCard: { 
    width: 140, backgroundColor: '#fff', borderRadius: 12, marginRight: 12, padding: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2
  },
  marketImage: { width: '100%', height: 100, borderRadius: 8, marginBottom: 8, backgroundColor: '#eee' },
  marketNoImage: { width: '100%', height: 100, borderRadius: 8, marginBottom: 8, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  marketTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  marketPrice: { fontSize: 13, color: '#0062ffff', fontWeight: 'bold' },

  taxiCard: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 2
  },
  timetableText: {
    fontSize: 15,
    fontWeight: "bold",
  },
  timetableSubText: {
    fontSize: 13,
    color: "#666",
  },
  otherClassItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#fffbe5",
    borderRadius: 8,
  },
  icon: {
    fontSize: 20,
    marginRight: 10,
  },
  otherClassText: {
    fontSize: 15,
  },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  featureCard: {
    width: "48%",
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  featureCardContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  featureIcon: {
    fontSize: 40,
  },
  featureText: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 8,
  },
  infoCard: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0062ffff",
    textAlign: "center",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  infoButton: {
    width: "60%",
    alignSelf: "center",
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#0062ffff",
  },
  infoButtonText: {
    color: "#fff",
    fontSize: 15,
    textAlign: "center",
  },
  taxiIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  taxiRoute: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  taxiTime: { fontSize: 13, color: '#666' },
  taxiBadge: { backgroundColor: '#e0f7fa', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  taxiBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#00796b' },

  emptyCard: { padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 12 },
  emptyText: { color: '#999', fontSize: 14 },
});