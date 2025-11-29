// app/chat/[id].tsx

import { useLocalSearchParams, useNavigation } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import UserProfileModal from '../../components/UserProfileModal';
import { db } from '../../firebaseConfig';

// --- 타입 정의 ---
interface IMessage {
  _id: string;
  text: string;
  createdAt: Date;
  senderId: string;
}

interface ChatRoom {
  id: string;
  members: string[];
  name: string;
  lastReadBy: { [uid: string]: Timestamp | null };
}

// [최적화 1] 메시지 아이템
const MessageItem = memo(({ item, isMyMessage, displayName, onPressAvatar, unreadCount }: any) => {
  const displayTime = item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
      {!isMyMessage && (
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={() => onPressAvatar(item.senderId)} style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{displayName.charAt(0)}</Text>
          </TouchableOpacity>
          <Text style={styles.senderName} numberOfLines={1}>{displayName}</Text>
        </View>
      )}
      <View style={[styles.messageContentWrapper, isMyMessage ? styles.myMessageContentWrapper : styles.otherMessageContentWrapper]}>
        {isMyMessage && (
          <View style={styles.statusAndTimeContainer}>
            {unreadCount > 0 && <Text style={styles.readCountText}>{unreadCount}</Text>}
            <Text style={styles.timestamp}>{displayTime}</Text>
          </View>
        )}
        <View style={isMyMessage ? styles.myBubble : styles.otherBubble}>
          <Text style={isMyMessage ? styles.myText : styles.otherText}>{item.text}</Text>
        </View>
        {!isMyMessage && (
          <View style={styles.statusAndTimeContainer}>
            <Text style={styles.timestamp}>{displayTime}</Text>
          </View>
        )}
      </View>
    </View>
  );
}, (prev, next) => {
  return (
    prev.item._id === next.item._id &&
    prev.unreadCount === next.unreadCount &&
    prev.displayName === next.displayName
  );
});
MessageItem.displayName = "MessageItem";

// [최적화 2] 입력창 분리
const ChatInput = memo(({ onSend, bottomInset }: { onSend: (text: string) => void, bottomInset: number }) => {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (text.trim() === '') return;
    onSend(text);
    setText('');
  };

  const paddingBottom = Platform.OS === 'ios' ? bottomInset : 10;

  return (
    <View style={[styles.inputWrapper, { paddingBottom }]}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="메시지를 입력하세요..."
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>전송</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});
ChatInput.displayName = "ChatInput";

// --- 메인 화면 ---
const ChatRoomScreen: React.FC = () => {
  const { id } = useLocalSearchParams();
  const chatRoomId = id as string;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDisplayNames, setUserDisplayNames] = useState<{ [uid: string]: string }>({});

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);

  const auth = getAuth();
  const user = auth.currentUser;
  const currentUserId = user?.uid;
  const flatListRef = useRef<FlatList>(null);

  // 1. 읽음 처리 함수
  const updateLastRead = useCallback(async () => {
    if (!chatRoomId || !currentUserId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', chatRoomId), {
        [`lastReadBy.${currentUserId}`]: serverTimestamp()
      });
    } catch (e) {
      console.log("Update read failed", e);
    }
  }, [chatRoomId, currentUserId]);

  // 2. 채팅방 정보 리스너
  // [수정] navigation을 의존성에 추가하여 경고 제거
  useEffect(() => {
    if (!chatRoomId) return;
    const chatDocRef = doc(db, 'chatRooms', chatRoomId);

    const unsubChat = onSnapshot(chatDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as ChatRoom;
        setChatRoom(data);
        navigation.setOptions({ title: data.name || '채팅방' });
      }
      setLoading(false);
    });

    return () => unsubChat();
  }, [chatRoomId, navigation]);

  // 3. 멤버 이름 가져오기
  // [수정] chatRoom 전체가 바뀔 때(읽음처리 등)마다 실행되지 않도록 'members' 배열만 문자열로 만들어 비교
  const membersHash = JSON.stringify(chatRoom?.members || []);

  useEffect(() => {
    if (!chatRoom || !chatRoom.members) return;

    const fetchMissingNames = async () => {
      // 의존성에 userDisplayNames가 들어갔으므로, 
      // 여기서 실제로 없는지 체크 후 없으면 early return하여 무한루프 방지
      const missingMembers = chatRoom.members.filter(uid => !userDisplayNames[uid]);
      
      if (missingMembers.length === 0) return;

      const newNames: { [uid: string]: string } = {};
      const promises = missingMembers.map(async (uid) => {
        try {
          const uSnap = await getDoc(doc(db, 'users', uid));
          let name = '알 수 없음';
          if (uSnap.exists()) {
            const d = uSnap.data();
            if (d.department) {
              if (d.email) {
                const prefix = d.email.split('@')[0];
                const two = prefix.substring(0, 2);
                if (!isNaN(Number(two)) && two.length === 2) name = `${two}학번 ${d.department}`;
                else name = `${prefix}님 ${d.department}`;
              } else { name = d.department; }
            } else if (d.displayName) name = d.displayName;
          }
          newNames[uid] = name;
        } catch { newNames[uid] = '익명'; }
      });
      await Promise.all(promises);
      setUserDisplayNames(prev => ({ ...prev, ...newNames }));
    };

    fetchMissingNames();
  }, [membersHash, userDisplayNames, chatRoom]); 
  // membersHash로 멤버 변경 감지, userDisplayNames는 로직 내 필터링으로 무한루프 방지됨

  // 4. 메시지 읽음 처리 업데이트
  useEffect(() => {
    if (messages.length > 0) {
      updateLastRead();
    }
  }, [messages.length, updateLastRead]);

  // 5. 메시지 & 차단 리스너
  useEffect(() => {
    if (!chatRoomId || !currentUserId) return;

    const myDocRef = doc(db, 'users', currentUserId);
    const unsubBlock = onSnapshot(myDocRef, (docSnap) => {
      if (docSnap.exists()) setMyBlockedUsers(docSnap.data().blockedUsers || []);
    });

    const q = query(collection(db, 'chatRooms', chatRoomId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubMsg = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          _id: doc.id,
          text: d.text,
          createdAt: d.createdAt?.toDate() || new Date(),
          senderId: d.senderId,
        } as IMessage;
      });
      setMessages(msgs);
      setLoading(false);
    });

    return () => { unsubBlock(); unsubMsg(); };
  }, [chatRoomId, currentUserId]);

  // [수정] user 객체가 사용되므로 의존성에 추가
  const handleSend = useCallback(async (text: string) => {
    if (!user || !currentUserId) return;
    if (chatRoom && chatRoom.members.some(mid => myBlockedUsers.includes(mid) && mid !== currentUserId)) {
      Alert.alert("전송 불가", "차단 관계에 있는 사용자에게는 메시지를 보낼 수 없습니다.");
      return;
    }
    try {
      await addDoc(collection(db, 'chatRooms', chatRoomId, 'messages'), {
        text,
        createdAt: serverTimestamp(),
        senderId: user.uid,
      });
      await updateDoc(doc(db, 'chatRooms', chatRoomId), {
        lastMessage: text,
        lastMessageTimestamp: serverTimestamp(),
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { console.error(e); }
  }, [chatRoom, myBlockedUsers, chatRoomId, currentUserId, user]);

  // [수정] 렌더링 최적화
  const renderItem = useCallback(({ item }: { item: IMessage }) => {
    if (myBlockedUsers.includes(item.senderId)) return null;
    const isMyMessage = item.senderId === currentUserId;
    const displayName = userDisplayNames[item.senderId] || '익명';
    let unreadCount = 0;
    if (isMyMessage && chatRoom) {
      const others = chatRoom.members.filter(id => id !== currentUserId);
      others.forEach(uid => {
        const last = chatRoom.lastReadBy?.[uid]?.toDate();
        if (!last || item.createdAt.getTime() > last.getTime()) unreadCount++;
      });
    }
    return (
      <MessageItem
        item={item} isMyMessage={isMyMessage} displayName={displayName}
        onPressAvatar={setProfileUserId} unreadCount={unreadCount}
      />
    );
  }, [currentUserId, chatRoom, userDisplayNames, myBlockedUsers]);

  if (loading) return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#0062ffff" /></View>;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {Platform.OS === 'android' ? (
        <View style={styles.container}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item._id}
            renderItem={renderItem}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            style={styles.messageList}
            contentContainerStyle={[styles.messageListContent, { paddingBottom: 10 }]}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={true}
          />
          <ChatInput onSend={handleSend} bottomInset={0} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.container}
          behavior="padding"
          keyboardVerticalOffset={60}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item._id}
            renderItem={renderItem}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={true}
          />
          <ChatInput onSend={handleSend} bottomInset={insets.bottom} />
        </KeyboardAvoidingView>
      )}

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </SafeAreaView>
  );
};

export default ChatRoomScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { flex: 1 },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { flex: 1, paddingHorizontal: 10 },
  messageListContent: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 10, paddingBottom: 10 },
  messageRow: { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-end' },
  myMessageRow: { justifyContent: 'flex-end' },
  otherMessageRow: { justifyContent: 'flex-start' },
  avatarContainer: { marginRight: 8, alignItems: 'center', width: 40 },
  avatarPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarText: { color: 'white', fontWeight: 'bold' },
  messageContentWrapper: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '75%' },
  myMessageContentWrapper: { flexDirection: 'row' },
  otherMessageContentWrapper: { flexDirection: 'row' },
  statusAndTimeContainer: { justifyContent: 'flex-end', marginHorizontal: 4, alignItems: 'flex-end', marginBottom: 5 },
  myBubble: { backgroundColor: '#0062ffff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderBottomRightRadius: 2 },
  otherBubble: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderBottomLeftRadius: 2, borderWidth: 1, borderColor: '#e0e0e0' },
  senderName: { fontSize: 10, color: '#666', textAlign: 'center', width: '100%' },
  myText: { color: 'white', fontSize: 15 },
  otherText: { color: '#333', fontSize: 15 },
  timestamp: { fontSize: 11, color: '#999', textAlign: 'right' },
  readCountText: { fontSize: 11, color: '#1c40f3ff', fontWeight: 'bold', textAlign: 'right', marginBottom: 2 },
  inputWrapper: { backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee', paddingTop: 8, paddingHorizontal: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  input: { flex: 1, minHeight: 50, maxHeight: 120, borderWidth: 1, borderColor: '#0000', borderRadius: 25, paddingHorizontal: 20, paddingVertical: 10, marginRight: 10, backgroundColor: '#f9f9f9', fontSize: 16 },
  sendButton: { backgroundColor: '#0062ffff', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 12, justifyContent: 'center' },
  sendButtonText: { color: 'white', fontWeight: 'bold' },
});