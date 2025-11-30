// app/(tabs)/explore.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// --- (인터페이스 정의는 기존과 동일하므로 생략 가능, 필요시 유지) ---
// (복붙 시 위 코드의 interface 부분들을 그대로 두시면 됩니다)
// ... interface TimetableItem, MarketPreview, TaxiPartyPreview, LostItemPreview, ClubPreview ...

// 요일 변환 헬퍼
const getTodayDayString = () => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date().getDay()];
};

const ExploreScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const user = auth.currentUser;

  // --- 상태 및 데이터 로직 (기존과 동일) ---
  const [todayClasses, setTodayClasses] = useState<any[]>([]);
  const [onlineClasses, setOnlineClasses] = useState<any[]>([]);
  const [recentMarketItems, setRecentMarketItems] = useState<any[]>([]);
  const [recentTaxiParties, setRecentTaxiParties] = useState<any[]>([]);
  const [recentLostItem, setRecentLostItem] = useState<any>(null);
  const [recentClubs, setRecentClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const todayStr = getTodayDayString();

  const handleFeaturePress = (feature: string) => {
    if (feature === '중고장터') router.push('/(tabs)/marketlist');
    else if (feature === '택시파티') router.push('/(tabs)/taxiparty');
    else if (feature === '동아리') router.push('/(tabs)/clublist');
    else if (feature === '분실물') router.push('/(tabs)/lost-and-found');
  };

  const fetchData = () => {
    if (!user) { setLoading(false); return; }
    
    // (기존 데이터 페칭 로직 유지 - 너무 길어서 생략하지만 실제 코드엔 있어야 합니다)
    // 1. 시간표
    const timetableQuery = query(collection(db, 'timetables'), where('userId', '==', user.uid));
    const unsubTimetable = onSnapshot(timetableQuery, (snapshot) => {
       const today: any[] = []; const online: any[] = [];
       snapshot.docs.forEach(doc => {
         const d = { id: doc.id, ...doc.data() } as any;
         if(d.isOnline) online.push(d); else if(d.time.startsWith(todayStr)) today.push(d);
       });
       today.sort((a,b)=>a.time.localeCompare(b.time));
       setTodayClasses(today); setOnlineClasses(online);
    });
    // 2. 장터
    const marketQuery = query(collection(db, 'marketPosts'), where('status', '==', '판매중'), orderBy('createdAt', 'desc'), limit(5));
    const unsubMarket = onSnapshot(marketQuery, (sn) => setRecentMarketItems(sn.docs.map(d=>({id:d.id,...d.data()})).filter((i:any)=>i.creatorId!==user.uid).slice(0,4)));
    // 3. 택시
    const taxiQuery = query(collection(db, 'taxiParties'), orderBy('createdAt', 'desc'), limit(5));
    const unsubTaxi = onSnapshot(taxiQuery, (sn) => setRecentTaxiParties(sn.docs.map(d=>({id:d.id,...d.data()})).filter((p:any)=>p.creatorId!==user.uid && !p.currentMembers.includes(user.uid)).slice(0,2)));
    // 4. 분실물
    const lostQuery = query(collection(db, 'lostAndFoundItems'), orderBy('createdAt', 'desc'), limit(1));
    const unsubLost = onSnapshot(lostQuery, (sn) => setRecentLostItem(sn.empty?null:{id:sn.docs[0].id,...sn.docs[0].data()}));
    // 5. 동아리
    const clubQuery = query(collection(db, 'clubPosts'), orderBy('createdAt', 'desc'), limit(5));
    const unsubClub = onSnapshot(clubQuery, (sn) => {
      setRecentClubs(sn.docs.map(d=>({id:d.id,...d.data()})));
      setLoading(false); setRefreshing(false);
    });

    return () => { unsubTimetable(); unsubMarket(); unsubTaxi(); unsubLost(); unsubClub(); };
  };

  useEffect(() => { const u = fetchData(); return () => { if(u) u(); }; }, [user]);
  const onRefresh = () => { setRefreshing(true); fetchData(); setTimeout(() => setRefreshing(false), 1000); };

  if (loading) return <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator size="large" color="#0062ffff" /></View>;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.logoText}>KDUKIT</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]} // 탭바 공간 확보
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0062ffff']} />}
      >
        
        {/* ✨ 상단 메뉴: 하단 탭바에 없는 기능 4가지만 배치 */}
        <View style={styles.menuGrid}>
          {[
            { name: '중고장터', icon: 'cart', color: '#4CAF50' },
            { name: '택시파티', icon: 'car', color: '#2196F3' },
            { name: '동아리', icon: 'people', color: '#FF9800' },
            { name: '분실물', icon: 'search', color: '#FF5252' },
          ].map((item, idx) => (
            <TouchableOpacity key={idx} style={styles.menuItem} onPress={() => handleFeaturePress(item.name)}>
              <View style={[styles.iconBox, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon as any} size={26} color={item.color} />
              </View>
              <Text style={styles.menuText}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 1. 오늘의 수업 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>오늘의 수업 ({todayStr})</Text>
          {/* 시간표는 하단 탭에 있으므로 '전체보기' 버튼 생략 가능하지만, 빠른 이동을 위해 유지해도 됨 */}
        </View>

        {todayClasses.length > 0 ? (
          todayClasses.map((item) => (
            <View key={item.id} style={styles.timetableItem}>
              <View style={styles.timeBar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.courseTitle}>{item.courseName}</Text>
                <Text style={styles.courseTime}>{item.time.split(' ')[1]} | {item.location}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>오늘 수업이 없습니다 😆</Text>
          </View>
        )}
        
        {/* 온라인 강의가 있다면 표시 */}
        {onlineClasses.length > 0 && (
          <View style={{marginTop: 8}}>
             {onlineClasses.map((item) => (
               <View key={item.id} style={styles.onlineItem}>
                  <Text style={styles.onlineText}>💻 {item.courseName}</Text>
               </View>
             ))}
          </View>
        )}

        {/* 2. 동아리 */}
        <View style={[styles.sectionHeader, { marginTop: 25 }]}>
          <Text style={styles.sectionTitle}>동아리 모집 👥</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/clublist')}><Text style={styles.moreText}>더보기</Text></TouchableOpacity>
        </View>
        {recentClubs.length > 0 ? (
           <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
            {recentClubs.map((club) => (
              <TouchableOpacity key={club.id} style={styles.marketCard} onPress={() => router.push('/(tabs)/clublist')}>
                {club.imageUrl ? <Image source={{ uri: club.imageUrl }} style={styles.marketImage} /> : <View style={[styles.marketNoImage, { backgroundColor: '#fff3e0' }]}><Ionicons name="people" size={24} color="#ff9800" /></View>}
                <Text style={styles.marketTitle} numberOfLines={1}>{club.clubName}</Text>
                <Text style={[styles.clubCategory, { color: '#ff9800', marginTop: 2 }]}>{club.activityField}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : <View style={styles.emptyCard}><Text style={styles.emptyText}>모집 중인 동아리가 없습니다.</Text></View>}

        {/* 3. 택시 파티 */}
        <View style={[styles.sectionHeader, { marginTop: 25 }]}>
          <Text style={styles.sectionTitle}>모집 중인 택시 🚕</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/taxiparty')}><Text style={styles.moreText}>더보기</Text></TouchableOpacity>
        </View>
        {recentTaxiParties.length > 0 ? (
          recentTaxiParties.map((party) => (
            <TouchableOpacity key={party.id} style={styles.taxiCard} onPress={() => router.push('/(tabs)/taxiparty')}>
              <View style={styles.taxiIcon}><Ionicons name="car-sport" size={24} color="#fff" /></View>
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={styles.taxiRoute}>{party.pickupLocation} → {party.dropoffLocation}</Text>
                <Text style={styles.taxiTime}>{party.departureTime} 출발</Text>
              </View>
              <View style={styles.taxiBadge}><Text style={styles.taxiBadgeText}>{party.currentMembers.length}/{party.memberLimit}</Text></View>
            </TouchableOpacity>
          ))
        ) : <View style={styles.emptyCard}><Text style={styles.emptyText}>파티가 없습니다.</Text></View>}

      </ScrollView>
    </View>
  );
};

export default ExploreScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { justifyContent: 'center', alignItems: 'center', paddingVertical: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  logoText: { fontSize: 22, fontWeight: '900', color: '#0062ffff' },
  scrollContent: { padding: 20 },

  // ✨ 상단 4칸 메뉴 스타일
  menuGrid: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.03, elevation: 2 },
  menuItem: { alignItems: 'center', width: '23%' },
  iconBox: { width: 50, height: 50, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  menuText: { fontSize: 12, fontWeight: '600', color: '#333' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  moreText: { fontSize: 13, color: '#999' },

  timetableItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  timeBar: { width: 4, height: '100%', backgroundColor: '#0062ffff', borderRadius: 2, marginRight: 12 },
  courseTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  courseTime: { fontSize: 14, color: '#666' },
  
  onlineItem: { padding: 10, backgroundColor: '#e8f0fe', borderRadius: 8, marginBottom: 5 },
  onlineText: { fontSize: 13, color: '#333' },

  marketCard: { width: 130, backgroundColor: '#fff', borderRadius: 12, marginRight: 12, padding: 10, shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  marketImage: { width: '100%', height: 90, borderRadius: 8, marginBottom: 8, backgroundColor: '#eee' },
  marketNoImage: { width: '100%', height: 90, borderRadius: 8, marginBottom: 8, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  marketTitle: { fontSize: 13, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  marketPrice: { fontSize: 12, color: '#0062ffff', fontWeight: 'bold' },
  clubCategory: { fontSize: 11, fontWeight: 'bold' },

  taxiCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  taxiIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  taxiRoute: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  taxiTime: { fontSize: 12, color: '#666' },
  taxiBadge: { backgroundColor: '#e0f7fa', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  taxiBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#00796b' },

  emptyCard: { padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 12 },
  emptyText: { color: '#999', fontSize: 14 },
});