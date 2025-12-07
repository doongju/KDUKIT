// app/(tabs)/chatlist.tsx

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayRemove, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { memo, useCallback, useState } from 'react';
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

interface ChatRoom {
  id: string;
  partyId?: string;
  name: string;
  lastMessage?: string;
  lastMessageTimestamp?: any;
  members: string[];
  type: 'private' | 'party' | 'dm' | 'club' | 'market' | 'lost-item' | string;
  // ✨ [추가] 각 유저별 안 읽은 메시지 수 { "uid1": 3, "uid2": 0 }
  unreadCounts?: Record<string, number>; 
}

const ChatRoomItem = memo(({ item, currentUserId, onPress, onLongPress }: { 
    item: ChatRoom, 
    currentUserId: string,
    onPress: (id: string) => void, 
    onLongPress: (id: string, name: string) => void 
}) => {
  
  // 기본 설정 (1:1 채팅)
  let iconName: keyof typeof Ionicons.glyphMap = "chatbubble-ellipses";
  let iconColor = "#0062ffff"; 
  let iconBg = "#e8f0fe";
  let badgeText = "1:1";
  let badgeColor = "#f0f8ff";
  let badgeTextColor = "#0062ffff";

  switch (item.type) {
    case 'party':
      iconName = "car";
      iconColor = "#2196F3";
      iconBg = iconColor + '15';
      badgeText = "택시";
      badgeColor = iconColor + '15';
      badgeTextColor = "#2196F3";
      break;
    case 'club':
      iconName = "people"; 
      iconColor = "#FF9800";
      iconBg = iconColor + '15';
      badgeText = "동아리";
      badgeColor = iconColor + '15';
      badgeTextColor = "#FF9800";
      break;
    case 'market':
      iconName = "cart"; 
      iconColor = "#4CAF50";
      iconBg = iconColor + '15';
      badgeText = "장터";
      badgeColor = iconColor + '15';
      badgeTextColor = "#4CAF50";
      break;
    case 'lost-item': 
      iconName = "search"; 
      iconColor = "#FF5252";
      iconBg = iconColor + '15';
      badgeText = "분실물";
      badgeColor = iconColor + '15';
      badgeTextColor = "#FF5252";
      break;
  }

  const timeString = item.lastMessageTimestamp
    ? new Date(item.lastMessageTimestamp.toDate()).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';

  // ✨ [추가] 내 안 읽은 갯수 가져오기
  const myUnreadCount = item.unreadCounts ? (item.unreadCounts[currentUserId] || 0) : 0;

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={() => onPress(item.id)}
      onLongPress={() => onLongPress(item.id, item.name)}
      delayLongPress={500}
      activeOpacity={0.7}
    >
      {/* 아이콘 영역 */}
      <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={26} color={iconColor} />
      </View>

      {/* 정보 영역 */}
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
            <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badgeText}</Text>
            </View>
            <Text style={styles.roomName} numberOfLines={1}>{item.name}</Text>
          </View>
          {/* 시간 표시 */}
          <Text style={styles.timestamp}>{timeString}</Text>
        </View>

        <View style={styles.messageRow}>
            <Text style={[styles.lastMessage, myUnreadCount > 0 && styles.lastMessageBold]} numberOfLines={1}>
                {item.lastMessage || "대화 내용이 없습니다."}
            </Text>
            
            {/* ✨ [추가] 카카오톡 스타일 빨간 뱃지 */}
            {myUnreadCount > 0 && (
                <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>
                        {myUnreadCount > 99 ? '99+' : myUnreadCount}
                    </Text>
                </View>
            )}
        </View>
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => {
  return prev.item.lastMessage === next.item.lastMessage &&
         prev.item.lastMessageTimestamp?.toMillis() === next.item.lastMessageTimestamp?.toMillis() &&
         // 뱃지 숫자 바뀌면 리렌더링 해야 함
         JSON.stringify(prev.item.unreadCounts) === JSON.stringify(next.item.unreadCounts);
});
ChatRoomItem.displayName = 'ChatRoomItem';

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!currentUser) {
        setLoading(false);
        setChatRooms([]);
        return;
      }

      const q = query(
        collection(db, 'chatRooms'),
        where('members', 'array-contains', currentUser.uid)
      );

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const rooms: ChatRoom[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            let roomName = data.name;
            if (data.type === 'dm' && !roomName) roomName = '알 수 없는 대화';
            if (!roomName) roomName = '채팅방';

            rooms.push({
                id: doc.id,
                partyId: data.partyId,
                name: roomName,
                lastMessage: data.lastMessage,
                lastMessageTimestamp: data.lastMessageTimestamp,
                members: data.members,
                type: data.type || 'dm', 
                unreadCounts: data.unreadCounts || {}, // ✨ 데이터 연동
            });
        });
        rooms.sort((a, b) => (b.lastMessageTimestamp?.toMillis() || 0) - (a.lastMessageTimestamp?.toMillis() || 0));
        setChatRooms(rooms);
        setLoading(false);
      });
      return () => unsubscribe();
    }, [currentUser])
  );

  const handleChatRoomPress = useCallback(async (chatRoomId: string) => {
    if (!currentUser) return;
    
    // ✨ [추가] 입장 시 '내 안 읽은 갯수'를 0으로 초기화
    // (Firestore update는 비동기지만, 화면 이동을 먼저 시켜서 쾌적하게 만듦)
    router.push(`/chat/${chatRoomId}`);

    try {
        await updateDoc(doc(db, 'chatRooms', chatRoomId), {
            [`unreadCounts.${currentUser.uid}`]: 0 
        });
    } catch (e) {
        console.error("읽음 처리 실패", e);
    }
  }, [router, currentUser]);

  const handleLongPressChatRoom = useCallback((chatRoomId: string, roomName: string) => {
    Alert.alert("나가기", `'${roomName}' 방을 나가시겠습니까?`, [
        { text: "취소", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: async () => {
            if (!currentUser) return;
            try {
              await updateDoc(doc(db, 'chatRooms', chatRoomId), { members: arrayRemove(currentUser.uid) });
            } catch {}
        }}
    ]);
  }, [currentUser]);

  const renderItem = useCallback(({ item }: { item: ChatRoom }) => (
    currentUser ? 
    <ChatRoomItem 
        item={item} 
        currentUserId={currentUser.uid} 
        onPress={handleChatRoomPress} 
        onLongPress={handleLongPressChatRoom} 
    /> : null
  ), [handleChatRoomPress, handleLongPressChatRoom, currentUser]);

  if (!currentUser) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>채팅 목록</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0062ffff" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={chatRooms}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={80} color="#ccc" />
                <Text style={styles.emptyText}>참여 중인 대화가 없습니다.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerContainer: { paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#f5f5f5' },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#111' },
  listContent: { paddingHorizontal: 16 },
  
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    // 그림자 좀 더 부드럽게 수정
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardIcon: {
    width: 54, height: 54, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 15,
  },
  cardContent: { flex: 1, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', justifyContent:'space-between', alignItems: 'center', marginBottom: 4 },
  
  badge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginRight: 8 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  
  roomName: { fontSize: 16, fontWeight: '700', color: '#222', flex: 1, marginRight: 10 },
  timestamp: { fontSize: 11, color: '#999', fontWeight: '500' },

  messageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastMessage: { fontSize: 14, color: '#666', flex: 1, marginRight: 10 },
  lastMessageBold: { color: '#333', fontWeight: '600' }, // 안 읽으면 글씨 진하게

  // ✨ [추가] 빨간 뱃지 스타일
  unreadBadge: {
    backgroundColor: '#ff3b30', // 카카오톡 빨강
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: 50 },
  emptyText: { fontSize: 16, color: '#888', marginTop: 15 },
});