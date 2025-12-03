import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

// 멤버 슬롯 시각화 컴포넌트
const MemberSlots = ({ current, limit }: { current: number, limit: number }) => {
  const slots = Array.from({ length: limit }, (_, i) => i < current);
  
  return (
    <View style={styles.slotContainer}>
      {slots.map((isFilled, index) => (
        <Ionicons 
          key={index}
          name={isFilled ? "person" : "person-outline"} 
          size={16} 
          color={isFilled ? "#0062ffff" : "#ccc"} 
          style={{ marginRight: 4 }}
        />
      ))}
      <Text style={styles.slotText}>
        {current}/{limit}명
      </Text>
    </View>
  );
};

const PartyItem = memo(({ item, user, onPressProfile, onJoin, onChat, onFinish, onDelete }: any) => {
    const isCreator = user && user.uid === item.creatorId;
    const isMember = user && item.currentMembers.includes(user.uid);
    const isFull = item.currentMembers.length >= item.memberLimit;
    
    let statusText = "모집중";
    let statusColor = "#E3F2FD"; 
    let statusTextColor = "#0062ffff";

    if (isFull) {
      statusText = "마감됨";
      statusColor = "#F5F5F5";
      statusTextColor = "#999";
    } else if (item.currentMembers.length >= item.memberLimit - 1) {
      statusText = "마감임박";
      statusColor = "#FFEBEE";
      statusTextColor = "#FF5252";
    }

    return (
      <View style={[styles.card, isCreator && styles.myCard]}>
        {/* 1. 헤더 */}
        <View style={styles.cardHeader}>
          {isCreator ? (
            <View style={styles.myBadge}>
              <Text style={styles.myBadgeText}>MY PARTY</Text>
            </View>
          ) : <View />} 
          
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusTextColor }]}>{statusText}</Text>
          </View>
        </View>

        {/* 2. 메인 정보 */}
        <View style={styles.mainInfo}>
            <View style={styles.timeSection}>
                <Text style={styles.timeLabel}>출발 시간</Text>
                <Text style={styles.timeText}>{item.departureTime}</Text>
            </View>
            <View style={styles.dividerVertical} />
            <View style={styles.routeSection}>
                <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: '#0062ffff' }]} />
                    <Text style={styles.routeText} numberOfLines={1}>{item.pickupLocation}</Text>
                </View>
                <View style={styles.routeLineContainer}>
                    <View style={styles.routeLine} />
                </View>
                <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: '#FF5252' }]} />
                    <Text style={[styles.routeText, styles.destText]} numberOfLines={1}>{item.dropoffLocation}</Text>
                </View>
            </View>
        </View>

        {/* 3. 인원 현황 */}
        <View style={styles.slotRow}>
            <Text style={styles.slotLabel}>참여 현황</Text>
            <TouchableOpacity onPress={() => onPressProfile(item.creatorId)}>
                <MemberSlots current={item.currentMembers.length} limit={item.memberLimit} />
            </TouchableOpacity>
        </View>

        <View style={styles.dividerHorizontal} />

        {/* 4. 액션 버튼 */}
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
              <Ionicons name="chatbubbles" size={18} color="#fff" style={{marginRight:6}}/>
              <Text style={styles.btnText}>채팅방 입장</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.joinBtn, isFull && styles.disabledBtn]} 
              onPress={() => onJoin(item)}
              disabled={isFull}
            >
              <Text style={styles.joinBtnText}>{isFull ? '모집이 마감되었습니다' : '이 파티에 참여하기'}</Text>
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

  const handleFinishParty = (party: TaxiParty) => {
    setFinishParty(party);
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
        onFinish={handleFinishParty}
        onDelete={handleDeleteParty}
      />
  ), [user]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>택시 파티</Text>
        <Text style={styles.subHeader}>같이 택시를 탈 사람을 찾아보세요!</Text>
      </View>
      
      <TouchableOpacity style={styles.createPartyButton} onPress={handleCreateParty}>
        <Text style={styles.createPartyButtonText}>택시파티+</Text>
      </TouchableOpacity>
      
      {loading ? <ActivityIndicator size="large" color="#0062ffff" /> : (
        <FlatList
          data={parties}
          renderItem={renderPartyItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContentContainer}
          ListEmptyComponent={<Text style={styles.emptyText}>진행 중인 파티가 없습니다.</Text>}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
        />
      )}

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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingHorizontal: 20, marginBottom: 5 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#0062ffff' },
  subHeader: { fontSize: 16, color: '#777', marginBottom: 15 },
  
  createPartyButton: { 
    backgroundColor: '#0062ffff', 
    paddingVertical: 10, 
    paddingHorizontal: 15, 
    borderRadius: 8, 
    alignSelf: 'flex-end', 
    marginRight: 20, 
    marginBottom: 10 
  },
  createPartyButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  listContentContainer: { paddingHorizontal: 20, paddingBottom: 100 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
  
  // --- Card Styles ---
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: 15, 
    marginBottom: 15, 
    elevation: 2 
  },
  myCard: {
    borderColor: '#0062ffff',
    borderWidth: 1.5,
    backgroundColor: '#fdfdff'
  },
  
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    height: 24,
  },
  myBadge: {
    backgroundColor: '#0062ffff',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  myBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    justifyContent: 'center',
    marginLeft: 'auto'
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },

  // --- Main Info ---
  mainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  timeSection: {
    alignItems: 'center',
    paddingRight: 15,
    minWidth: 80,
  },
  timeLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  timeText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  
  dividerVertical: {
    width: 1,
    height: '80%',
    backgroundColor: '#eee',
    marginRight: 15,
  },

  routeSection: { flex: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  routeLineContainer: { paddingLeft: 3.5 },
  routeLine: { width: 1, height: 16, backgroundColor: '#eee', marginVertical: 2 },
  routeText: { fontSize: 15, color: '#555', flex: 1 },
  destText: { fontSize: 16, fontWeight: 'bold', color: '#333' },

  // --- Slot Row ---
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 10,
  },
  slotLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  slotContainer: { flexDirection: 'row', alignItems: 'center' },
  slotText: { fontSize: 12, color: '#444', fontWeight: 'bold', marginLeft: 6 },

  dividerHorizontal: { height: 1, backgroundColor: '#f0f0f0', marginBottom: 15 },

  // --- Buttons ---
  actionContainer: { flexDirection: 'row' },
  creatorButtons: { flexDirection: 'row', flex: 1, gap: 10 },
  finishBtn: { 
    flex: 1, 
    backgroundColor: '#28a745', 
    borderRadius: 8, 
    paddingVertical: 12, 
    alignItems: 'center'
  },
  deleteBtn: { 
    width: 50, 
    backgroundColor: '#dc3545', 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  chatBtn: { 
    flex: 1,
    backgroundColor: '#17a2b8', 
    borderRadius: 8, 
    paddingVertical: 12, 
    alignItems: 'center', 
    flexDirection: 'row', 
    justifyContent: 'center' 
  },
  joinBtn: { 
    flex: 1,
    backgroundColor: '#0062ffff', 
    borderRadius: 8, 
    paddingVertical: 12, 
    alignItems: 'center'
  },
  disabledBtn: { 
    backgroundColor: '#ccc',
    shadowOpacity: 0 
  },
  
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  joinBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});