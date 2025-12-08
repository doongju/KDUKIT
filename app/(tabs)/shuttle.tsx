import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  doc,
  increment,
  onSnapshot,
  setDoc,
  updateDoc
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

// --- 데이터 타입 정의 ---
type RouteName = '도봉산역' | '양주역' | '의정부중앙역';
type Direction = 'toSchool' | 'toStation';

interface ScheduleItem {
  time: string;
  note?: string;
}

// --- 🚍 버스 시간표 데이터 ---
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
  totalCount: number; // 예약자 + 탑승자
  isReserved: boolean; // 예약 명단에 있는가?
  isBoarded: boolean;  // 이미 탑승 했는가?
}

// --- 유틸리티 함수 ---
const isRunningOnDay = (note: string | undefined, dayOfWeek: number) => {
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; 
  if (!note) return true;
  if (dayOfWeek === 5) { 
    if (note.includes('금X') || note.includes('월~목')) return false;
  }
  return true;
};

// 🚍 버스 운행 대수 계산 함수
const getBusCount = (route: RouteName, direction: Direction, time: string, day: number): number => {
  if (day === 0 || day === 6) return 0; 

  if (route === '도봉산역') {
    if (direction === 'toSchool') {
      if (time === '08:50') return day === 5 ? 1 : 3; 
      if (time === '09:50') return day === 5 ? 0 : 3; 
      if (time === '10:50') return day === 5 ? 0 : 2; 
    } else {
      if (time === '16:30') return day === 5 ? 0 : 2;
      if (time === '17:30') return day === 5 ? 1 : 2;
      if (time === '18:30') return day === 5 ? 0 : 1;
    }
  }
  if (route === '양주역') {
    if (direction === 'toSchool') {
        if (time === '08:45' && day === 5) return 0;
    } else {
        if (time === '17:40' && day === 5) return 0;
    }
    return 1;
  }
  if (route === '의정부중앙역') return 1;

  return 1;
};

const ShuttleScreen = () => {
  //const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const user = auth.currentUser;

  const [selectedRoute, setSelectedRoute] = useState<RouteName>('도봉산역');
  const [direction, setDirection] = useState<Direction>('toSchool');
  
  const [statusMap, setStatusMap] = useState<{ [time: string]: ShuttleStatus }>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // 페널티 및 신뢰도 관련 상태
  const [penaltyEndTime, setPenaltyEndTime] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [myCancelCount, setMyCancelCount] = useState(0); 
  const [myTrustScore, setMyTrustScore] = useState(100); 
  const [lastCancelDate, setLastCancelDate] = useState<string>(""); 

  const todayStr = useMemo(() => {
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }, [now]);

  // 페널티 타이머
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

  // 유저 정보 감시
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    
    const unsub = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const storedDate = data.lastCancelDate || "";
        
        if (storedDate !== todayStr) {
            setMyCancelCount(0);
        } else {
            setMyCancelCount(data.cancelCount || 0);
        }
        
        setLastCancelDate(storedDate);
        setMyTrustScore(data.trustScore !== undefined ? data.trustScore : 100);
      } else {
        setDoc(userRef, { cancelCount: 0, trustScore: 100, lastCancelDate: todayStr }, { merge: true });
      }
    });
    return () => unsub();
  }, [user, todayStr]);

  // 테스트 데이터
  const getTestSchedules = (): ScheduleItem[] => {
    return [
      { time: '01:54', note: 'TEST (곧 도착)' },
      { time: '01:55', note: 'TEST (다음 차)' },
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

  // 셔틀 예약 현황 실시간 감시
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
          const boarded = data.boarded || [];

          setStatusMap((prev) => ({
            ...prev,
            [item.time]: {
              totalCount: members.length + boarded.length,
              isReserved: members.includes(user.uid),
              isBoarded: boarded.includes(user.uid),
            },
          }));
        } else {
          setStatusMap((prev) => ({
            ...prev,
            [item.time]: { totalCount: 0, isReserved: false, isBoarded: false },
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

  // --- 예약 함수 ---
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
      
      Alert.alert('예약 성공', '승차 예약되었습니다.\n(탑승 후에는 꼭 [탑승 완료]를 눌러주세요!)');
    } catch (error) {
      console.error(error);
      Alert.alert('오류', '예약 중 문제가 발생했습니다.');
    }
  };

  // 탑승 완료 함수
  const handleBoarding = async (time: string) => {
    if (!user) return;
    try {
        const docId = `${todayStr}_${selectedRoute}_${direction}_${time}`;
        const shuttleRef = doc(db, 'shuttle_reservations', docId);
        
        await setDoc(shuttleRef, {
            members: arrayRemove(user.uid),
            boarded: arrayUnion(user.uid), 
            updatedAt: new Date(),
        }, { merge: true });

        Alert.alert("탑승 확인", "탑승 처리가 완료되었습니다.\n즐거운 등하교길 되세요! 👋");

    } catch (error) {
        console.error(error);
        Alert.alert("오류", "처리 중 문제가 발생했습니다.");
    }
  };

  // 예약 취소 함수
  const handleCancel = async (time: string) => {
    if (!user) return;
    try {
      const docId = `${todayStr}_${selectedRoute}_${direction}_${time}`;
      const shuttleRef = doc(db, 'shuttle_reservations', docId);
      
      await setDoc(shuttleRef, {
        members: arrayRemove(user.uid),
        updatedAt: new Date(),
      }, { merge: true });

      const userRef = doc(db, 'users', user.uid);
      
      if (lastCancelDate !== todayStr) {
          await updateDoc(userRef, {
              cancelCount: 1, 
              lastCancelDate: todayStr
          });
          Alert.alert('취소 완료', '예약이 취소되었습니다.\n(60초간 재예약 불가)');
      } else {
          if (myCancelCount >= 3) {
            await updateDoc(userRef, {
                cancelCount: increment(1),
                trustScore: increment(-15) 
            });
            Alert.alert('신뢰도 차감', '반복된 취소로 신뢰도가 차감되었습니다.');
          } else {
            await updateDoc(userRef, {
                cancelCount: increment(1)
            });
            Alert.alert('취소 완료', '예약이 취소되었습니다.\n(60초간 재예약 불가)');
          }
      }
      
      setPenaltyEndTime(Date.now() + 60000);
      setSecondsLeft(60);

    } catch (error) {
      console.error(error);
      Alert.alert('오류', '취소 중 문제가 발생했습니다.');
    }
  };

  // 액션 시트
  const handleActionSheet = (time: string) => {
    Alert.alert(
        "상태 변경",
        "버스를 탑승하셨나요, 아니면 예약을 취소하시나요?",
        [
            { 
                text: "닫기", 
                style: "cancel" 
            },
            { 
                text: "예약 취소 (못 탐)", 
                style: "destructive", 
                onPress: () => confirmCancel(time) 
            },
            { 
                text: "🚌 탑승 완료", 
                onPress: () => handleBoarding(time) 
            }
        ]
    );
  };

  const confirmCancel = (time: string) => {
    const effectiveCount = (lastCancelDate !== todayStr) ? 0 : myCancelCount;

    if (effectiveCount >= 3) {
        Alert.alert(
            "⚠️ 신뢰도 차감 경고", 
            `오늘 이미 ${effectiveCount}회 취소하셨습니다.\n취소 시 '신뢰도'가 차감됩니다.`, 
            [
              { text: "아니요", style: "cancel" },
              { text: "네 (차감 동의)", style: "destructive", onPress: () => handleCancel(time) }
            ]
        );
    } else {
        handleCancel(time);
    }
  };

  const getMinutesLeft = (targetTimeStr: string) => {
    const [hour, minute] = targetTimeStr.split(':').map(Number);
    const targetDate = new Date(now);
    targetDate.setHours(hour, minute, 0, 0);
    const diffMs = targetDate.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60));
  };

  // --- 카드 렌더링 ---
  const renderBusCard = (item: ScheduleItem, isMain: boolean) => {
    const dayOfWeek = now.getDay();
    const isTest = item.note?.includes('TEST'); 
    let busCount = getBusCount(selectedRoute, direction, item.time, dayOfWeek);
    
    if (isTest && busCount === 0) {
    busCount = 1;
    }

    if (busCount === 0) return null;

    const BUS_CAPACITY = 45;
    const totalCapacity = busCount * BUS_CAPACITY;

    const info = statusMap[item.time] || { totalCount: 0, isReserved: false, isBoarded: false };
    const minsLeft = getMinutesLeft(item.time);
    const isOpen = minsLeft <= 30 && minsLeft >= 0;
 
    
    const isFull = info.totalCount >= totalCapacity;

    let buttonText = "예약 대기";
    let buttonColor = "#ccc";
    let buttonAction = () => {};
    let disabled = true;
    
    const isPenaltyActive = penaltyEndTime !== null && secondsLeft > 0;

    if (isOpen) {
      if (info.isBoarded) {
        buttonText = "탑승 완료됨";
        buttonColor = "#4CAF50"; // 초록색
        buttonAction = () => Alert.alert("알림", "이미 탑승 처리가 완료되었습니다.");
        disabled = false;
      } else if (info.isReserved) {
        buttonText = "탑승 완료 / 취소";
        buttonColor = "#ef5350"; 
        buttonAction = () => handleActionSheet(item.time); 
        disabled = false;
      } else {
        if (!isMain) {
            buttonText = "순차 예약";
            buttonColor = "#ccc";
            disabled = true;
        } else if (isPenaltyActive) {
            buttonText = `예약 제한 (${secondsLeft}초)`;
            buttonColor = "#999";
            disabled = true;
        } else {
            buttonText = isFull ? "대기 예약 (만원)" : "승차 예약";
            buttonColor = isFull ? "#FF9800" : "#0062ffff"; 
            buttonAction = () => handleReserve(item.time);
            disabled = false;
        }
      }
    } else {
      buttonText = `출발 ${minsLeft > 60 ? Math.floor(minsLeft/60)+'시간 ' : ''}${minsLeft%60}분 전`;
    }

    const showCount = info.isReserved || info.isBoarded;

    const displayCountText = showCount 
        ? `${info.totalCount}명 / ${totalCapacity}명` 
        : `예약 후 확인가능`;

    return (
      <View 
        key={item.time} 
        style={[styles.card, isMain && styles.mainCard, isTest && styles.testCard]} 
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.timeText, isMain && styles.mainTimeText]}>{item.time}</Text>
            
            <View style={{flexDirection:'row', gap: 5, marginTop: 4, flexWrap:'wrap'}}>
                {busCount > 1 && (
                    <View style={{backgroundColor: '#E8F5E9', paddingHorizontal:6, paddingVertical:2, borderRadius:4}}>
                        <Text style={{color: '#2E7D32', fontSize: 11, fontWeight: 'bold'}}>
                        🚌 버스 {busCount}대 ({totalCapacity}석)
                        </Text>
                    </View>
                )}
                {item.note && (
                    <Text style={[styles.noteText, isTest && { color: '#000000', marginTop:0 }]}>
                        {item.note}
                    </Text>
                )}
            </View>
          </View>

          {isMain && !isTest && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>이번버스</Text>
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
            <Text style={styles.statusLabel}>예상 대기 인원</Text>
            <View style={{alignItems: 'flex-end'}}>
                <Text style={[styles.statusValue, !showCount && { fontSize: 14, color: '#888' }]}>
                {isOpen ? displayCountText : '-'}
                </Text>
                {isOpen && isFull && showCount && (
                    <Text style={{fontSize: 11, color: '#FF5252', fontWeight:'bold'}}>
                        정원 초과 (탑승 불가 가능성 높음)
                    </Text>
                )}
            </View>
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
      {/* 헤더: 뒤로가기 버튼 삭제됨 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={[styles.headerTitle, { marginLeft: 10 }]}>셔틀버스</Text>
        <View style={{ alignItems: 'flex-end' }}>
             <Text style={{ fontSize: 10, color: '#666' }}>내 신뢰도</Text>
             <Text style={{ fontSize: 14, fontWeight: 'bold', color: myTrustScore < 80 ? '#f44336' : '#0062ffff' }}>
                {myTrustScore}점
             </Text>
        </View>
      </View>

      <View style={styles.contentContainer}>
        {/* 탭 헤더 */}
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
                <Text style={styles.sectionTitle}>이번버스</Text>
                {renderBusCard(nearestBus, true)}
                
                {nextBuses.length > 0 && (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: 20 }]}>다음버스</Text>
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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  contentContainer: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
    zIndex: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' }, // 폰트 사이즈 키우고 bold 처리
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