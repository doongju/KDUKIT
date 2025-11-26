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
  type: 'private' | 'party' | 'dm';
}

// ✨ [최적화] 리스트 아이템 컴포넌트 분리 (메모이제이션)
const ChatRoomItem = memo(({ item, onPress, onLongPress }: { item: ChatRoom, onPress: (id: string) => void, onLongPress: (id: string, name: string) => void }) => {
    let iconName: keyof typeof Ionicons.glyphMap = "person";
    if (item.type === 'party') iconName = "car-sport";
    else if (item.type === 'dm') iconName = "people";

    const timeString = item.lastMessageTimestamp 
        ? new Date(item.lastMessageTimestamp.toDate()).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
      <TouchableOpacity
        style={styles.chatRoomItem}
        onPress={() => onPress(item.id)}
        onLongPress={() => onLongPress(item.id, item.name)}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        <View style={styles.chatRoomIcon}>
          <Ionicons name={iconName} size={24} color="#0062ffff" />
        </View>
        
        <View style={styles.chatRoomInfo}>
          <Text style={styles.chatRoomName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.lastMessage ? (
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage}
            </Text>
          ) : (
            <Text style={[styles.lastMessage, { color: '#aaa' }]}>
              대화 내용이 없습니다.
            </Text>
          )}
        </View>
        
        <Text style={styles.timestamp}>{timeString}</Text>
      </TouchableOpacity>
    );
}, (prev, next) => {
    // ✨ [핵심] 메시지 내용이나 시간이 바뀌지 않으면 리렌더링 안 함
    return prev.item.lastMessage === next.item.lastMessage && 
           prev.item.lastMessageTimestamp?.toMillis() === next.item.lastMessageTimestamp?.toMillis();
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
      // 로딩 상태를 다시 true로 바꾸지 않음 (화면 깜빡임 방지)
      // setLoading(true); 

      const q = query(
        collection(db, 'chatRooms'),
        where('members', 'array-contains', currentUser.uid)
      );

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const rooms: ChatRoom[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            let roomName = data.name;
            if (data.type === 'dm') roomName = data.name || '문의 채팅';
            
            rooms.push({
                id: doc.id,
                partyId: data.partyId,
                name: roomName,
                lastMessage: data.lastMessage,
                lastMessageTimestamp: data.lastMessageTimestamp,
                members: data.members,
                type: data.type,
            });
        });
        // 최신순 정렬
        rooms.sort((a, b) => (b.lastMessageTimestamp?.toMillis() || 0) - (a.lastMessageTimestamp?.toMillis() || 0));
        setChatRooms(rooms);
        setLoading(false);
      });
      return () => unsubscribe();
    }, [currentUser])
  );

  const handleChatRoomPress = useCallback((chatRoomId: string) => {
    router.push(`/chat/${chatRoomId}`); 
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

  const renderItem = useCallback(({ item }: { item: ChatRoom }) => (
    <ChatRoomItem item={item} onPress={handleChatRoomPress} onLongPress={handleLongPressChatRoom} />
  ), [handleChatRoomPress, handleLongPressChatRoom]);

  if (!currentUser) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.header}>채팅 목록</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#0062ffff" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={chatRooms}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContentContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={80} color="#ccc" />
                <Text style={styles.emptyText}>대화가 없습니다.</Text>
            </View>
          }
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { fontSize: 28, fontWeight: 'bold', paddingHorizontal: 20, marginBottom: 15, color: '#0062ffff' },
  listContentContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  chatRoomItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  chatRoomIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e8f0fe', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  chatRoomInfo: { flex: 1, justifyContent: 'center' },
  chatRoomName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
  lastMessage: { fontSize: 14, color: '#666' },
  timestamp: { fontSize: 12, color: '#999', marginLeft: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: 50 },
  emptyText: { fontSize: 16, color: '#555', marginTop: 10 },
});