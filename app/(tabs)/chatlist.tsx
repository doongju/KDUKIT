// app/(tabs)/chatlist.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
// ✨ [추가됨] doc, updateDoc, arrayRemove
import { arrayRemove, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
  otherMemberName?: string;
}

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

      setLoading(true);

      const q = query(
        collection(db, 'chatRooms'),
        where('members', 'array-contains', currentUser.uid)
      );

      const unsubscribe = onSnapshot(q, async (querySnapshot) => {
        const rooms: ChatRoom[] = [];
        
        for (const docSnap of querySnapshot.docs) {
          const data = docSnap.data();
          let roomName = data.name;

          // 이름 결정 로직
          if (data.type === 'private' && data.members.length === 2) {
            const otherMemberId = data.members.find((id: string) => id !== currentUser.uid);
            roomName = otherMemberId ? `상대방 (${otherMemberId.substring(0, 5)}...)` : '알 수 없음';
          } else if (data.type === 'party' && data.partyId) {
            roomName = `택시 파티 (${data.partyId.substring(0, 5)}...)`; 
          } else if (data.type === 'dm') {
            roomName = data.name || '동아리 문의 채팅';
          }

          rooms.push({
            id: docSnap.id,
            partyId: data.partyId,
            name: roomName,
            lastMessage: data.lastMessage,
            lastMessageTimestamp: data.lastMessageTimestamp,
            members: data.members,
            type: data.type,
          });
        }
        
        // 최신순 정렬
        rooms.sort((a, b) => {
            const timeA = a.lastMessageTimestamp?.toMillis() || 0;
            const timeB = b.lastMessageTimestamp?.toMillis() || 0;
            return timeB - timeA;
        });

        setChatRooms(rooms);
        setLoading(false);
      }, (error) => {
        console.error("Error fetching chat rooms: ", error);
        setLoading(false);
      });

      return () => unsubscribe();
    }, [currentUser])
  );

  const handleChatRoomPress = (chatRoomId: string) => {
    router.push(`/chat/${chatRoomId}`); 
  };

  // ✨ [기능 추가] 채팅방 나가기 (삭제) 함수
  const handleLongPressChatRoom = (chatRoomId: string, roomName: string) => {
    Alert.alert(
      "채팅방 나가기",
      `'${roomName}' 채팅방을 나가시겠습니까?\n(나간 후에는 대화 목록에서 사라집니다.)`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "나가기",
          style: "destructive", // 빨간색 버튼 스타일
          onPress: async () => {
            if (!currentUser) return;
            try {
              const chatRef = doc(db, 'chatRooms', chatRoomId);
              // members 배열에서 내 UID를 제거 -> 쿼리 조건 불일치 -> 목록에서 사라짐
              await updateDoc(chatRef, {
                members: arrayRemove(currentUser.uid)
              });
            } catch (error) {
              console.error("Error leaving chat room:", error);
              Alert.alert("오류", "채팅방을 나가는 중 오류가 발생했습니다.");
            }
          }
        }
      ]
    );
  };

  const renderChatRoomItem = ({ item }: { item: ChatRoom }) => {
    let iconName: keyof typeof Ionicons.glyphMap = "person";
    
    if (item.type === 'party') {
        iconName = "car-sport";
    } else if (item.type === 'dm') {
        iconName = "people";
    }

    return (
      <TouchableOpacity
        style={styles.chatRoomItem}
        onPress={() => handleChatRoomPress(item.id)}
        // ✨ 길게 누르면 나가기 팝업 호출
        onLongPress={() => handleLongPressChatRoom(item.id, item.name)}
        delayLongPress={500} // 0.5초 이상 눌러야 동작
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
        
        {item.lastMessageTimestamp && (
          <Text style={styles.timestamp}>
            {new Date(item.lastMessageTimestamp.toDate()).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (!currentUser) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.header}>채팅 목록</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>로그인이 필요합니다.</Text>
          <TouchableOpacity 
            style={styles.loginButton} 
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>로그인하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.header}>채팅 목록</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#0062ffff" style={{ marginTop: 50 }} />
      ) : chatRooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>아직 참여 중인 채팅방이 없어요.</Text>
          <Text style={styles.emptySubText}>동아리나 택시 파티에 참여해보세요!</Text>
        </View>
      ) : (
        <FlatList
          data={chatRooms}
          renderItem={renderChatRoomItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContentContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    marginBottom: 15,
    color: '#0062ffff',
  },
  listContentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  chatRoomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  chatRoomIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e8f0fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  chatRoomInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  chatRoomName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginLeft: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#555',
    fontWeight: 'bold',
    marginTop: 20,
  },
  emptySubText: {
    fontSize: 14,
    color: '#888',
    marginTop: 10,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: '#0062ffff',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});