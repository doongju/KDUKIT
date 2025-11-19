// app/(tabs)/taxiparty.tsx

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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

// 모달 임포트
import TaxiFinishModal from '../../components/TaxiFinishModal'; // ✨ 새로 만든 모달
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

export default function TaxiPartyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const user = auth.currentUser;

  const [parties, setParties] = useState<TaxiParty[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 모달 상태
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [finishParty, setFinishParty] = useState<TaxiParty | null>(null); // 운행 종료할 파티

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
    const chatRoomId = `party-${partyId}`;
    const chatRoomRef = doc(db, "chatRooms", chatRoomId);
    try {
        const partySnap = await getDoc(doc(db, "taxiParties", partyId));
        if (!partySnap.exists()) return;
        
        const creatorId = partySnap.data().creatorId;
        const initialMembers = Array.from(new Set([user!.uid, creatorId])); // 중복 제거

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

  const renderPartyItem = ({ item }: { item: TaxiParty }) => {
    const isCreator = user && user.uid === item.creatorId;
    const isMember = user && item.currentMembers.includes(user.uid);
    const isFull = item.currentMembers.length >= item.memberLimit;

    return (
      <View style={styles.partyItem}>
        <View style={styles.partyHeader}>
          <Text style={styles.partyTime}>{item.departureTime} 출발</Text>
          {/* ✨ 아이콘 누르면 방장 프로필(신뢰도/신고) 확인 가능 */}
          <TouchableOpacity 
            style={styles.partyMembers} 
            onPress={() => setProfileUserId(item.creatorId)}
          >
            <Ionicons name="person" size={16} color="#fff" />
            <Text style={styles.partyMembersText}>
                {item.currentMembers.length} / {item.memberLimit} (방장 확인)
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.locationContainer}>
          <Text style={styles.locationLabel}>출발</Text>
          <Text style={styles.locationText}>{item.pickupLocation}</Text>
        </View>
        <View style={styles.locationContainer}>
          <Text style={styles.locationLabel}>도착</Text>
          <Text style={styles.locationText}>{item.dropoffLocation}</Text>
        </View>

        {isCreator ? (
           <View style={styles.buttonRow}>
              {/* ✨ [추가] 운행 완료 버튼 */}
              <TouchableOpacity style={styles.finishButton} onPress={() => setFinishParty(item)}>
                  <Text style={styles.finishButtonText}>운행 완료 (출석체크)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteParty(item.id, item.creatorId)}>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
              </TouchableOpacity>
           </View>
        ) : isMember ? (
          <TouchableOpacity style={styles.chatButton} onPress={() => navigateToPartyChat(item.id, item.pickupLocation, item.dropoffLocation)}>
            <Text style={styles.chatButtonText}>채팅방으로 이동</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.joinButton, isFull && styles.disabledButton]} 
            onPress={() => handleJoinParty(item)}
            disabled={isFull}
          >
            <Text style={styles.joinButtonText}>{isFull ? '모집 완료' : '참여하기'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.header}>택시 파티</Text>
      <Text style={styles.subHeader}>같이 택시를 탈 사람을 찾아보세요!</Text>
      
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
        />
      )}

      {/* 프로필 모달 */}
      <UserProfileModal 
        visible={!!profileUserId}
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
      />

      {/* ✨ 운행 종료(출석 체크) 모달 */}
      {finishParty && (
        <TaxiFinishModal
            visible={!!finishParty}
            partyId={finishParty.id}
            members={finishParty.currentMembers.filter(uid => uid !== user?.uid)} // 본인 제외 멤버 리스트
            onClose={() => setFinishParty(null)}
            onComplete={() => setFinishParty(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { fontSize: 28, fontWeight: 'bold', paddingHorizontal: 20, marginBottom: 5, color: '#0062ffff' },
  subHeader: { fontSize: 16, paddingHorizontal: 20, marginBottom: 15, color: '#777' },
  createPartyButton: { backgroundColor: '#0062ffff', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, alignSelf: 'flex-end', marginRight: 20, marginBottom: 10 },
  createPartyButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  listContentContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
  
  partyItem: { backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2 },
  partyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  partyTime: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  partyMembers: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0062ffff', borderRadius: 15, paddingVertical: 5, paddingHorizontal: 10 },
  partyMembersText: { color: '#fff', fontWeight: 'bold', marginLeft: 5, fontSize: 12 },
  
  locationContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  locationLabel: { fontSize: 14, fontWeight: 'bold', color: '#888', width: 40 },
  locationText: { fontSize: 15, color: '#444', flex: 1 },

  buttonRow: { flexDirection: 'row', marginTop: 10 },
  finishButton: { flex: 1, backgroundColor: '#28a745', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginRight: 10 },
  finishButtonText: { color: '#fff', fontWeight: 'bold' },
  deleteButton: { width: 50, backgroundColor: '#dc3545', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  
  chatButton: { backgroundColor: '#17a2b8', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  chatButtonText: { color: '#fff', fontWeight: 'bold' },
  joinButton: { backgroundColor: '#0062ffff', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  joinButtonText: { color: '#fff', fontWeight: 'bold' },
  disabledButton: { backgroundColor: '#ccc' },
});