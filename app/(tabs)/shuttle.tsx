import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  doc,
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// ... (데이터 타입 및 SHUTTLE_DATA 등 위쪽 코드는 기존과 동일하므로 생략) ...
type RouteName = '도봉산역' | '양주역' | '의정부중앙역';
type Direction = 'toSchool' | 'toStation';

interface ScheduleItem {
  time: string;
  note?: string;
}

// 기존 데이터 유지
const SHUTTLE_DATA: Record<RouteName, Record<Direction, ScheduleItem[]>> = {
  '도봉산역': {
    toSchool: [
      { time: '08:50', note: '월~금 운행' },
      { time: '09:50', note: '월~목 운행 (금X)' },
      { time: '10:50', note: '월~목 운행 (금X)' },
    ],
    toStation: [
      { time: '16:30', note: '월~목 운행 (금X)' },
      { time: '17:30', note: '월~금 운행' },
      { time: '18:30', note: '월~목 운행 (금X)' },
    ]
  },
  '양주역': {
    toSchool: [
      { time: '08:00', note: '옥정 경유' },
      { time: '08:45', note: '월~목 운행 (금X)' },
      { time: '08:50', note: '월~금 운행' },
      { time: '09:10', note: '월~금 운행' },
      { time: '09:40', note: '월~금 운행' },
      { time: '09:50', note: '월~금 운행' },
      { time: '10:30', note: '월~금 운행' },
      { time: '11:10', note: '월~금 운행' },
    ],
    toStation: [
      { time: '13:30', note: '월~금 운행' },
      { time: '14:00', note: '월~금 운행' },
      { time: '14:30', note: '월~금 운행' },
      { time: '15:30', note: '월~금 운행' },
      { time: '16:10', note: '월~금 운행' },
      { time: '17:00', note: '월~금 운행' },
      { time: '17:40', note: '월~목 운행' },
      { time: '17:45', note: '월~금 운행' },
      { time: '18:30', note: '옥정 경유' },
    ]
  },
  '의정부중앙역': {
    toSchool: [
      { time: '09:00', note: '월~금 운행' },
      { time: '10:00', note: '월~금 운행' },
    ],
    toStation: [
      { time: '14:00', note: '월~금 운행' },
      { time: '15:00', note: '월~금 운행' },
    ]
  }
};

interface ShuttleStatus {
  count: number;
  isReserved: boolean;
}

const isRunningOnDay = (note: string | undefined, dayOfWeek: number) => {
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; 
  if (!note) return true;
  if (dayOfWeek === 5) { 
    if (note.includes('금X') || note.includes('월~목')) return false;
  }
  return true;
};

const ShuttleScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const user = auth.currentUser;

  const [selectedRoute, setSelectedRoute] = useState<RouteName>('도봉산역');
  const [direction, setDirection] = useState<Direction>('toSchool');
  
  const [statusMap, setStatusMap] = useState<{ [time: string]: ShuttleStatus }>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // ✅ 1. 페널티 관련 상태 추가
  const [penaltyEndTime, setPenaltyEndTime] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const todayStr = useMemo(() => {
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }, [now]);

  // 페널티 타이머 로직
  useEffect(() => {
    if (!penaltyEndTime) return;

    const interval = setInterval(() => {
      const current = Date.now();
      const diff = Math.ceil((penaltyEndTime - current) / 1000);

      if (diff <= 0) {
        setPenaltyEndTime(null);
        setSecondsLeft(0);
        clearInterval(interval);
      } else {
        setSecondsLeft(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [penaltyEndTime]);

  // 테스트용 고정 시간
  const getTestSchedules = (): ScheduleItem[] => {
    return [
      { time: '04:35', note: 'TEST (곧 도착)' },
      { time: '04:40', note: 'TEST (다음 차)' },
    ];
  };

  const upcomingSchedule = useMemo(() => {
    const dayOfWeek = now.getDay();
    let rawSchedule = [...SHUTTLE_DATA[selectedRoute][direction]];
    const testBuses = getTestSchedules();
    rawSchedule = [...rawSchedule, ...testBuses];
    
    rawSchedule.sort((a, b) => a.time.localeCompare(b.time));

    const filtered = rawSchedule.filter(item => {
      if (item.note?.includes('TEST')) return true;
      return isRunningOnDay(item.note, dayOfWeek);
    });

    const timeFiltered = filtered.filter(item => {
      const [h, m] = item.time.split(':').map(Number);
      const busTime = new Date(now);
      busTime.setHours(h, m, 0, 0);
      return busTime.getTime() > now.getTime();
    });

    return timeFiltered;
  }, [selectedRoute, direction, now]);

  const nearestBus = upcomingSchedule.length > 0 ? upcomingSchedule[0] : null;
  const nextBuses = upcomingSchedule.length > 1 ? upcomingSchedule.slice(1) : [];

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const timer = setInterval(() => setNow(new Date()), 30000);
    const unsubscribes: (() => void)[] = [];

    upcomingSchedule.forEach((item) => {
      const docId = `${todayStr}_${selectedRoute}_${direction}_${item.time}`;
      const docRef = doc(db, 'shuttle_reservations', docId);

      const unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const members = data.members || [];
          setStatusMap((prev) => ({
            ...prev,
            [item.time]: {
              count: members.length,
              isReserved: members.includes(user.uid),
            },
          }));
        } else {
          setStatusMap((prev) => ({
            ...prev,
            [item.time]: { count: 0, isReserved: false },
          }));
        }
      });
      unsubscribes.push(unsub);
    });

    setLoading(false);

    return () => {
      clearInterval(timer);
      unsubscribes.forEach((u) => u());
    };
  }, [user, todayStr, selectedRoute, direction, upcomingSchedule.length]);

  const handleReserve = async (time: string) => {
    if (!user) return;
    try {
      const docId = `${todayStr}_${selectedRoute}_${direction}_${time}`;
      const docRef = doc(db, 'shuttle_reservations', docId);

      await setDoc(docRef, {
        members: arrayUnion(user.uid),
        updatedAt: new Date(),
        route: selectedRoute,
        direction: direction,
        time: time
      }, { merge: true });
      
      Alert.alert('예약 성공', '탑승 대기열에 등록되었습니다.');
    } catch (error) {
      console.error(error);
      Alert.alert('오류', '예약 중 문제가 발생했습니다.');
    }
  };

  const handleCancel = async (time: string) => {
    if (!user) return;
    try {
      const docId = `${todayStr}_${selectedRoute}_${direction}_${time}`;
      const docRef = doc(db, 'shuttle_reservations', docId);

      await setDoc(docRef, {
        members: arrayRemove(user.uid),
        updatedAt: new Date(),
      }, { merge: true });
      
      // ✅ 2. 취소 시 페널티 적용 (60초)
      setPenaltyEndTime(Date.now() + 60000);
      setSecondsLeft(60);

      Alert.alert('취소 완료', '예약이 취소되었습니다.\n(1분간 재예약이 불가능합니다.)');
    } catch (error) {
      console.error(error);
      Alert.alert('오류', '취소 중 문제가 발생했습니다.');
    }
  };

  const getMinutesLeft = (targetTimeStr: string) => {
    const [hour, minute] = targetTimeStr.split(':').map(Number);
    const targetDate = new Date(now);
    targetDate.setHours(hour, minute, 0, 0);
    const diffMs = targetDate.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60));
  };

  // --- 3. 카드 렌더링 수정 ---
  const renderBusCard = (item: ScheduleItem, isMain: boolean) => {
    const info = statusMap[item.time] || { count: 0, isReserved: false };
    const minsLeft = getMinutesLeft(item.time);
    const isOpen = minsLeft <= 30 && minsLeft >= 0;
    const isTest = item.note?.includes('TEST'); 
    
    let buttonText = "예약 대기";
    let buttonColor = "#ccc";
    let buttonAction = () => {};
    let disabled = true;

    // ✅ 페널티 활성화 여부 확인
    const isPenaltyActive = penaltyEndTime !== null && secondsLeft > 0;

    if (isOpen) {
      if (info.isReserved) {
        // 이미 예약한 경우: 취소 가능
        buttonText = "예약 취소";
        buttonColor = "#ef5350"; 
        buttonAction = () => handleCancel(item.time);
        disabled = false;
      } else {
        // 예약 안 한 경우
        if (!isMain) {
            // ✅ 가장 가까운 버스가 아니면 예약 불가
            buttonText = "순차 예약";
            buttonColor = "#ccc";
            disabled = true;
        } else if (isPenaltyActive) {
            // ✅ 페널티 시간 중이면 예약 불가
            buttonText = `예약 제한 (${secondsLeft}초)`;
            buttonColor = "#999";
            disabled = true;
        } else {
            // 예약 가능
            buttonText = "승차 예약";
            buttonColor = "#0062ffff"; 
            buttonAction = () => handleReserve(item.time);
            disabled = false;
        }
      }
    } else {
      buttonText = `출발 ${minsLeft > 60 ? Math.floor(minsLeft/60)+'시간 ' : ''}${minsLeft%60}분 전`;
    }

    // ✅ 인원 표시 로직: 예약했으면 숫자 보임, 안 했으면 비공개
    const displayCountText = info.isReserved ? `${info.count}명` : '예약 후 확인';

    return (
      <View 
        key={item.time} 
        style={[styles.card, isMain && styles.mainCard, isTest && styles.testCard]} 
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.timeText, isMain && styles.mainTimeText]}>{item.time}</Text>
            {item.note && (
              <Text style={[styles.noteText, isTest && { color: '#FF9800' }]}>
                {item.note}
              </Text>
            )}
          </View>
          {isMain && !isTest && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>가장 빠른 버스</Text>
            </View>
          )}
          {isTest && (
            <View style={[styles.badgeContainer, { backgroundColor: '#FFF3E0' }]}>
              <Text style={[styles.badgeText, { color: '#FF9800' }]}>TEST DATA</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>현재 대기 인원</Text>
            <Text style={[styles.statusValue, !info.isReserved && { fontSize: 14, color: '#888' }]}>
              {/* 오픈 전이면 '-', 오픈 됐으면 예약 여부에 따라 표시 */}
              {isOpen ? displayCountText : '-'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: buttonColor }]}
            disabled={disabled}
            onPress={buttonAction}
          >
            <Text style={styles.buttonText}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ... 헤더 부분 동일 ... */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>셔틀버스</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.contentContainer}>
        {/* ... 탭 메뉴 부분 동일 ... */}
        <View style={styles.fixedHeader}>
          <View style={styles.tabContainer}>
            {(['도봉산역', '양주역', '의정부중앙역'] as RouteName[]).map((route) => (
              <TouchableOpacity
                key={route}
                style={[styles.tabButton, selectedRoute === route && styles.tabButtonActive]}
                onPress={() => setSelectedRoute(route)}
              >
                <Text style={[styles.tabText, selectedRoute === route && styles.tabTextActive]}>
                  {route}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.directionContainer}>
            <TouchableOpacity 
              style={[styles.dirButton, direction === 'toSchool' && styles.dirButtonActive]}
              onPress={() => setDirection('toSchool')}
            >
              <Text style={[styles.dirText, direction === 'toSchool' && styles.dirTextActive]}>학교 가는 길</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.dirButton, direction === 'toStation' && styles.dirButtonActive]}
              onPress={() => setDirection('toStation')}
            >
              <Text style={[styles.dirText, direction === 'toStation' && styles.dirTextActive]}>역으로 가는 길</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#0062ffff" style={{ marginTop: 50 }} />
        ) : (
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {nearestBus ? (
              <>
                <Text style={styles.sectionTitle}>Next Shuttle 🚌</Text>
                {/* 가장 가까운 버스는 isMain = true */}
                {renderBusCard(nearestBus, true)}
                
                {nextBuses.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Upcoming</Text>
                    {/* 그 외 버스는 isMain = false */}
                    {nextBuses.map(bus => renderBusCard(bus, false))}
                  </>
                )}
              </>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="moon-outline" size={60} color="#ccc" />
                <Text style={styles.emptyText}>오늘 운행이 종료되었습니다.</Text>
                <Text style={styles.emptySubText}>내일 첫 차를 이용해주세요.</Text>
              </View>
            )}
            
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
    </View>
  );
};

export default ShuttleScreen;

const styles = StyleSheet.create({
  // ... 기존 스타일 동일 ...
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  contentContainer: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
    zIndex: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  fixedHeader: { backgroundColor: '#f8f9fa', zIndex: 5 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff' },
  tabButton: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabButtonActive: { borderBottomColor: '#0062ffff' },
  tabText: { fontSize: 14, color: '#999', fontWeight: '600' },
  tabTextActive: { color: '#0062ffff', fontWeight: 'bold' },
  directionContainer: { flexDirection: 'row', margin: 15, backgroundColor: '#e9ecef', borderRadius: 8, padding: 4 },
  dirButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  dirButtonActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  dirText: { fontSize: 13, color: '#666', fontWeight: '500' },
  dirTextActive: { color: '#333', fontWeight: 'bold' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#333', marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  mainCard: { backgroundColor: '#fff', borderColor: '#0062ffff', borderWidth: 2, shadowColor: '#0062ffff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  testCard: { borderColor: '#FF9800', borderStyle: 'dashed', borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  timeText: { fontSize: 20, fontWeight: '700', color: '#333' },
  mainTimeText: { fontSize: 32, fontWeight: '900', color: '#0062ffff' },
  noteText: { fontSize: 12, color: '#ff5252', marginTop: 4, fontWeight: '600' },
  badgeContainer: { backgroundColor: '#e3f2fd', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#0062ffff', fontSize: 11, fontWeight: 'bold' },
  cardBody: { gap: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 14, color: '#666' },
  statusValue: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  button: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#555', marginTop: 15 },
  emptySubText: { fontSize: 14, color: '#999', marginTop: 5 },
});