// app/(tabs)/taxiparty.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

import TaxiFinishModal from '../../components/TaxiFinishModal';
import UserProfileModal from '../../components/UserProfileModal';

interface TaxiParty {
  id: string;
  departureTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  memberLimit: number;
  currentMembers: string[];
  creatorId: string;
  createdAt: any; 
}

// ✨ [UI 개선] 카드형 디자인 적용
const PartyItem = memo(({ item, user, onPressProfile, onJoin, onChat, onFinish, onDelete }: any) => {
    const isCreator = user && user.uid === item.creatorId;
    const isMember = user && item.currentMembers.includes(user.uid);
    const isFull = item.currentMembers.length >= item.memberLimit;

    return (
      <View style={styles.card}>
        {/* 1. 상단: 시간 및 인원 상태 */}
        <View style={styles.cardHeader}>
          <View style={styles.timeContainer}>
            <Ionicons name="time-outline" size={18} color="#0062ffff" />
            <Text style={styles.timeText}>{item.departureTime} 출발</Text>
          </View>
          <TouchableOpacity 
            style={[styles.statusBadge, isFull ? styles.statusFull : styles.statusOpen]}
            onPress={() => onPressProfile(item.creatorId)}
          >
            <Ionicons name="person" size={12} color={isFull ? "#fff" : "#0062ffff"} />
            <Text style={[styles.statusText, isFull && { color: '#fff' }]}>
               {item.currentMembers.length}/{item.memberLimit} {isCreator ? '(나)' : ''}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* 2. 중간: 경로 시각화 (출발 -> 도착) */}
        <View style={styles.routeContainer}>
          <View style={styles.timeline}>
            <View style={[styles.dot, { backgroundColor: '#0062ffff' }]} />
            <View style={styles.line} />
            <View style={[styles.dot, { backgroundColor: '#ff3b30' }]} />
          </View>
          <View style={styles.locations}>
            <View style={styles.locationItem}>
              <Text style={styles.locationLabel}>출발</Text>
              <Text style={styles.locationValue} numberOfLines={1}>{item.pickupLocation}</Text>
            </View>
            <View style={[styles.locationItem, { marginTop: 15 }]}>
              <Text style={styles.locationLabel}>도착</Text>
              <Text style={styles.locationValue} numberOfLines={1}>{item.dropoffLocation}</Text>
            </View>
          </View>
        </View>

        {/* 3. 하단: 액션 버튼 */}
        <View style={styles.actionContainer}>
          {isCreator ? (
             <View style={styles.creatorButtons}>
               <TouchableOpacity style={styles.finishBtn} onPress={() => onFinish(item)}>
                   <Text style={styles.btnText}>운행 완료</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item.id, item.creatorId)}>
                   <Ionicons name="trash-outline" size={20} color="#ff4444" />
               </TouchableOpacity>
             </View>
          ) : isMember ? (
            <TouchableOpacity style={styles.chatBtn} onPress={() => onChat(item.id, item.pickupLocation, item.dropoffLocation)}>
              <Ionicons name="chatbubbles-outline" size={18} color="#fff" style={{marginRight:5}}/>
              <Text style={styles.btnText}>채팅방으로 이동</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.joinBtn, isFull && styles.disabledBtn]} 
              onPress={() => onJoin(item)}
              disabled={isFull}
            >
              <Text style={styles.joinBtnText}>{isFull ? '마감됨' : '참여하기'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
});
PartyItem.displayName = "PartyItem";

export default function TaxiPartyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [parties, setParties] = useState<TaxiParty[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [finishParty, setFinishParty] = useState<TaxiParty | null>(null); 

  useEffect(() => {
    const q = query(collection(db, "taxiParties"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const partiesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TaxiParty[];
      setParties(partiesData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleCreateParty = () => {
    router.push('/(tabs)/create-party');
  };

  const handleDeleteParty = (partyId: string, creatorId: string) => {
    if (!user || user.uid !== creatorId) return;
    Alert.alert("파티 삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          await deleteDoc(doc(db, "taxiParties", partyId));
      }}
    ]);
  };

  const handleJoinParty = async (party: TaxiParty) => {
    if (!user) { Alert.alert("로그인 필요", "로그인이 필요합니다."); return; }
    if (party.currentMembers.includes(user.uid)) {
        navigateToPartyChat(party.id, party.pickupLocation, party.dropoffLocation);
        return;
    }
    if (party.currentMembers.length >= party.memberLimit) {
        Alert.alert("인원 초과", "모집 인원이 가득 찼습니다.");
        return;
    }
    Alert.alert("참여", "파티에 참여하시겠습니까?", [
        { text: "취소", style: "cancel" },
        { text: "참여", onPress: async () => {
            await updateDoc(doc(db, "taxiParties", party.id), { currentMembers: arrayUnion(user.uid) });
            navigateToPartyChat(party.id, party.pickupLocation, party.dropoffLocation);
        }}
    ]);
  };

  const navigateToPartyChat = async (partyId: string, pickupLocation: string, dropoffLocation: string) => {
    if (!user) return;

    const chatRoomId = `party-${partyId}`;
    const chatRoomRef = doc(db, "chatRooms", chatRoomId);
    try {
        const partySnap = await getDoc(doc(db, "taxiParties", partyId));
        if (!partySnap.exists()) return;
        
        const creatorId = partySnap.data().creatorId;
        const initialMembers = Array.from(new Set([user.uid, creatorId]));

        await setDoc(chatRoomRef, {
            name: `${pickupLocation} → ${dropoffLocation}`,
            members: arrayUnion(...initialMembers),
            partyId: partyId,
            type: 'party',
            createdAt: serverTimestamp(),
            lastReadBy: initialMembers.reduce((acc, uid) => ({...acc, [uid]: serverTimestamp()}), {})
        }, { merge: true });

        router.push(`/chat/${chatRoomId}`);
    } catch (e) { console.error(e); }
  };

  const renderPartyItem = useCallback(({ item }: { item: TaxiParty }) => (
      <PartyItem 
        item={item} 
        user={user} 
        onPressProfile={setProfileUserId}
        onJoin={handleJoinParty}
        onChat={navigateToPartyChat}
        onFinish={setFinishParty}
        onDelete={handleDeleteParty}
      />
  ), [user]);

  return (
    <View style={[styles.container]}>
      {/* 헤더 부분 */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>택시 파티</Text>
        <Text style={styles.headerSubtitle}>함께 타면 요금이 절반! 💸</Text>
      </View>
      
      {loading ? <ActivityIndicator size="large" color="#0062ffff" style={{marginTop: 50}} /> : (
        <FlatList
          data={parties}
          renderItem={renderPartyItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContentContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="car-sport-outline" size={60} color="#ddd" />
                <Text style={styles.emptyText}>진행 중인 파티가 없습니다.</Text>
                <Text style={styles.emptySubText}>오른쪽 아래 + 버튼을 눌러 만들어보세요!</Text>
            </View>
          }
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
        />
      )}

      {/* ✨ [UI 개선] 플로팅 액션 버튼 (FAB) */}
      <TouchableOpacity style={styles.fab} onPress={handleCreateParty}>
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

      <UserProfileModal 
        visible={!!profileUserId}
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
      />

      {finishParty && (
        <TaxiFinishModal
            visible={!!finishParty}
            partyId={finishParty.id}
            members={finishParty.currentMembers.filter(uid => uid !== user?.uid)}
            onClose={() => setFinishParty(null)}
            onComplete={() => setFinishParty(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { 
    paddingHorizontal: 20, 
    paddingBottom: 15, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee' 
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  headerSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  
  listContentContainer: { padding: 16, paddingBottom: 100 },
  
  // ✨ 카드 스타일 개선
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    padding: 20, 
    marginBottom: 16, 
    elevation: 3, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 6 
  },
  cardHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  timeContainer: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 6 },
  
  statusBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 20 
  },
  statusOpen: { backgroundColor: '#e8f0fe' },
  statusFull: { backgroundColor: '#ccc' },
  statusText: { fontSize: 12, fontWeight: 'bold', color: '#0062ffff', marginLeft: 4 },

  // 경로 시각화 스타일
  routeContainer: { flexDirection: 'row', marginBottom: 20 },
  timeline: { alignItems: 'center', marginRight: 12, paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 2, height: 24, backgroundColor: '#e0e0e0', marginVertical: 4 },
  locations: { flex: 1 },
  locationItem: { justifyContent: 'center' },
  locationLabel: { fontSize: 11, color: '#999', marginBottom: 2 },
  locationValue: { fontSize: 16, color: '#333', fontWeight: '500' },

  actionContainer: { marginTop: 5 },
  creatorButtons: { flexDirection: 'row', gap: 10 },
  
  // 버튼 스타일들
  finishBtn: { 
    flex: 1, 
    backgroundColor: '#0062ffff', 
    borderRadius: 10, 
    paddingVertical: 12, 
    alignItems: 'center' 
  },
  deleteBtn: { 
    width: 48, 
    backgroundColor: '#ffebee', 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  chatBtn: { 
    backgroundColor: '#17a2b8', 
    borderRadius: 10, 
    paddingVertical: 12, 
    alignItems: 'center', 
    flexDirection: 'row', 
    justifyContent: 'center' 
  },
  joinBtn: { 
    backgroundColor: '#0062ffff', 
    borderRadius: 10, 
    paddingVertical: 12, 
    alignItems: 'center' 
  },
  disabledBtn: { backgroundColor: '#ccc' },
  
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  joinBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // 빈 화면 스타일
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 18, color: '#555', marginTop: 10, fontWeight: 'bold' },
  emptySubText: { fontSize: 14, color: '#999', marginTop: 5 },

  // ✨ FAB 스타일
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0062ffff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    zIndex: 999,
  },
});