// app/(tabs)/chatlist.tsx

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayRemove, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { memo, useCallback, useRef, useState } from 'react';
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
  // ✨ [복구] 안 읽은 갯수 필드 추가
  unreadCounts?: { [uid: string]: number }; 
}

// ✨ [수정] unreadCount prop 추가
const ChatRoomItem = memo(({ item, onPress, onLongPress, unreadCount }: { item: ChatRoom, onPress: (id: string) => void, onLongPress: (id: string, name: string) => void, unreadCount: number }) => {
  
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
      badgeText = "중고장터";
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
    case 'dm':
    default:
      break;
  }

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={() => onPress(item.id)}
      onLongPress={() => onLongPress(item.id, item.name)}
      delayLongPress={500}
      activeOpacity={0.7}
    >
      <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={26} color={iconColor} />
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          {/* 타입 표시 (택시, 동아리 등) */}
          <View style={[styles.badge, { backgroundColor: badgeColor }]}>
            <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badgeText}</Text>
          </View>
          
          <Text style={styles.roomName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>

        <View style={styles.messageRow}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage || "대화 내용이 없습니다."}
            </Text>

            {/* ✨ [복구] 안 읽은 메시지 뱃지 (빨간색) */}
            {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
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
         prev.unreadCount === next.unreadCount; // ✨ 뱃지 숫자 바뀌면 리렌더링
});
ChatRoomItem.displayName = 'ChatRoomItem';

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);

  // 중복 진입 방지용 Ref (유지됨)
  const isNavigatingRef = useRef(false);

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
                unreadCounts: data.unreadCounts, // ✨ 데이터 가져오기
            });
        });
        rooms.sort((a, b) => (b.lastMessageTimestamp?.toMillis() || 0) - (a.lastMessageTimestamp?.toMillis() || 0));
        setChatRooms(rooms);
        setLoading(false);
      });
      return () => unsubscribe();
    }, [currentUser])
  );

  const handleChatRoomPress = useCallback((chatRoomId: string) => {
    if (isNavigatingRef.current) return;

    isNavigatingRef.current = true;

    router.push(`/chat/${chatRoomId}`);

    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 1500);
  }, [router]);

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

  const renderItem = useCallback(({ item }: { item: ChatRoom }) => {
    // ✨ 내 안 읽은 갯수 계산
    const myUnreadCount = item.unreadCounts?.[currentUser?.uid || ''] || 0;

    return (
        <ChatRoomItem 
            item={item} 
            onPress={handleChatRoomPress} 
            onLongPress={handleLongPressChatRoom} 
            unreadCount={myUnreadCount} // ✨ prop 전달
        />
    );
  }, [handleChatRoomPress, handleLongPressChatRoom, currentUser]);

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
  container: { 
    flex: 1, 
    backgroundColor: '#f5f5f5' 
  },
  headerContainer: {
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: '#f5f5f5',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roomName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
    flexShrink: 1,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    marginRight: 10,
  },
  
  // ✨ [복구] 빨간색 뱃지 스타일
  unreadBadge: {
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },

  timestamp: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyText: { fontSize: 16, color: '#888', marginTop: 15 },
});