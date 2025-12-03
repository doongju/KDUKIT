// app/chat/[id].tsx

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  ListRenderItem,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  type?: string;
  lastReadBy: { [uid: string]: Timestamp | null };
}

// ✨ [최적화] 아이콘 스타일 가져오는 함수 - useMemo로 감싸지 않아도 컴포넌트 밖이라 괜찮지만,
// ChatHeader 내부에서 호출될 때 불필요한 연산을 줄이기 위해 로직은 그대로 유지.
const getChatIconStyle = (type: string | undefined) => {
  let iconName: keyof typeof Ionicons.glyphMap = "chatbubble-ellipses";
  let iconColor = "#0062ffff";
  let iconBg = "#e8f0fe";

  switch (type) {
    case 'party':
      iconName = "car";
      iconColor = "#2196F3";
      iconBg = "#E3F2FD";
      break;
    case 'club':
      iconName = "people";
      iconColor = "#FF9800";
      iconBg = "#FFF3E0";
      break;
    case 'market':
      iconName = "cart";
      iconColor = "#4CAF50";
      iconBg = "#E8F5E9";
      break;
    case 'lost-item':
      iconName = "search";
      iconColor = "#F44336";
      iconBg = "#FFEBEE";
      break;
  }
  return { iconName, iconColor, iconBg };
};

// ✨ 커스텀 헤더 - Memoization 적용
const ChatHeader = memo(({ name, type }: { name: string, type?: string }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // useMemo를 사용하여 icon 스타일 계산 최적화
  const { iconName, iconColor, iconBg } = useMemo(() => getChatIconStyle(type), [type]);

  return (
    <View style={[styles.customHeaderContainer, { paddingTop: insets.top }]}>
      <View style={styles.customHeaderContent}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <View style={[styles.headerIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={20} color={iconColor} />
          </View>
          <Text style={styles.headerTitleText} numberOfLines={1}>{name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
    </View>
  );
});
ChatHeader.displayName = 'ChatHeader';

// ✨ 메시지 아이템 - Memoization 유지
const MessageItem = memo(({ item, isMyMessage, displayName, onPressAvatar, unreadCount }: any) => {
  // 날짜 포맷팅 연산 최적화 (Intl.DateTimeFormat 사용 고려 가능하나 현재 방식도 무방)
  const displayTime = useMemo(() => 
    item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
  [item.createdAt]);

  return (
    <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
      {!isMyMessage && (
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={() => onPressAvatar(item.senderId)} style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{displayName.charAt(0)}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.contentColumn}>
        {!isMyMessage && <Text style={styles.senderName}>{displayName}</Text>}
        <View style={[styles.bubbleWrapper, isMyMessage ? styles.myBubbleWrapper : styles.otherBubbleWrapper]}>
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
    </View>
  );
}, (prev, next) => {
  return (
    prev.item._id === next.item._id && 
    prev.unreadCount === next.unreadCount && 
    prev.displayName === next.displayName &&
    prev.item.text === next.item.text // 텍스트 변경 여부도 확인
  );
});
MessageItem.displayName = "MessageItem";

// ✨ 입력창 컴포넌트 - Memoization 유지
const ChatInput = memo(({ onSend, paddingBottom }: { onSend: (text: string) => void, paddingBottom: number }) => {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmedText = text.trim();
    if (trimmedText === '') return;
    onSend(trimmedText);
    setText('');
  };

  return (
    <View style={[styles.inputWrapper, { paddingBottom: paddingBottom }]}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="메시지 입력"
          placeholderTextColor="#999"
          multiline
          textAlignVertical="center"
        />
      </View>
      <TouchableOpacity
        style={[styles.sendButton, text.trim() ? styles.sendButtonActive : styles.sendButtonInactive]}
        onPress={handleSend}
        disabled={!text.trim()}
      >
        <Ionicons name="arrow-up" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
});
ChatInput.displayName = "ChatInput";

// --- 메인 화면 ---
export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams();
  const chatRoomId = id as string;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
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

  // ✨ 스크롤 함수 최적화 - useCallback 사용
  const scrollToBottom = useCallback((animated = true) => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated });
    }
  }, [messages.length]);

  // 키보드 리스너 최적화
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        scrollToBottom(true);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, [scrollToBottom]);

  // 읽음 처리 최적화
  const updateLastRead = useCallback(async () => {
    if (!chatRoomId || !currentUserId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', chatRoomId), {
        [`lastReadBy.${currentUserId}`]: serverTimestamp()
      });
    } catch (e) { console.log("Update read failed", e); }
  }, [chatRoomId, currentUserId]);

  // 채팅방 정보 로드
  useEffect(() => {
    if (!chatRoomId) return;
    const unsub = onSnapshot(doc(db, 'chatRooms', chatRoomId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as ChatRoom;
        setChatRoom(data);
        navigation.setOptions({ headerShown: false });
      }
      setLoading(false);
    });
    return () => unsub();
  }, [chatRoomId, navigation]);

  // 멤버 이름 로드 최적화 - members 배열이 변경될 때만 실행
  useEffect(() => {
    if (!chatRoom?.members) return;
    
    const fetchMissingNames = async () => {
      // 이미 이름이 있는 멤버는 제외하여 불필요한 요청 방지
      const missingMembers = chatRoom.members.filter(uid => !userDisplayNames[uid]);
      if (missingMembers.length === 0) return;

      const newNames: { [uid: string]: string } = {};
      
      // Promise.allSettled를 사용하여 일부 요청 실패 시에도 나머지 처리 가능하도록 개선 가능하나
      // 현재 구조상 Promise.all 유지
      await Promise.all(missingMembers.map(async (uid) => {
        try {
          const uSnap = await getDoc(doc(db, 'users', uid));
          let name = '알 수 없음';
          if (uSnap.exists()) {
            const d = uSnap.data();
            // 이름 생성 로직
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
      }));
      
      setUserDisplayNames(prev => ({ ...prev, ...newNames }));
    };
    
    fetchMissingNames();
  }, [chatRoom?.members]); // 의존성 배열 간소화

  // 메시지 업데이트 시 읽음 처리 - messages 의존성
  useEffect(() => {
    if (messages.length > 0) updateLastRead();
  }, [messages, updateLastRead]);

  // 메시지 및 차단 리스너
  useEffect(() => {
    if (!chatRoomId || !currentUserId) return;

    const unsubBlock = onSnapshot(doc(db, 'users', currentUserId), (snap) => {
      if (snap.exists()) setMyBlockedUsers(snap.data().blockedUsers || []);
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
      
      // 상태 업데이트 함수형으로 변경하여 의존성 문제 최소화
      setMessages(msgs);
      setLoading(false);
      // 메시지 로드 시 스크롤 최적화: requestAnimationFrame 사용 고려
      setTimeout(() => scrollToBottom(false), 100);
    });

    return () => { unsubBlock(); unsubMsg(); };
  }, [chatRoomId, currentUserId, scrollToBottom]);

  const handleSend = useCallback(async (text: string) => {
    if (!user || !currentUserId) return;
    if (chatRoom && chatRoom.members.some(mid => myBlockedUsers.includes(mid) && mid !== currentUserId)) {
      Alert.alert("전송 불가", "차단 관계에 있는 사용자에게는 메시지를 보낼 수 없습니다.");
      return;
    }
    try {
      await addDoc(collection(db, 'chatRooms', chatRoomId, 'messages'), {
        text, createdAt: serverTimestamp(), senderId: user.uid,
      });
      await updateDoc(doc(db, 'chatRooms', chatRoomId), {
        lastMessage: text, lastMessageTimestamp: serverTimestamp(),
      });
      scrollToBottom();
    } catch (e) { console.error(e); }
  }, [chatRoom, myBlockedUsers, chatRoomId, currentUserId, user, scrollToBottom]);

  // renderItem 최적화 - useCallback 사용
  const renderItem: ListRenderItem<IMessage> = useCallback(({ item }) => {
    if (myBlockedUsers.includes(item.senderId)) return null;
    const isMyMessage = item.senderId === currentUserId;
    const displayName = userDisplayNames[item.senderId] || '...';
    
    let unreadCount = 0;
    if (isMyMessage && chatRoom) {
      const others = chatRoom.members.filter(id => id !== currentUserId);
      others.forEach(uid => {
        const last = chatRoom.lastReadBy?.[uid]?.toDate();
        // 읽음 카운트 계산 로직
        if (!last || item.createdAt.getTime() > last.getTime()) unreadCount++;
      });
    }
    return (
      <MessageItem
        item={item}
        isMyMessage={isMyMessage}
        displayName={displayName}
        onPressAvatar={setProfileUserId}
        unreadCount={unreadCount}
      />
    );
  }, [currentUserId, chatRoom, userDisplayNames, myBlockedUsers]); // 필요한 의존성만 포함

  // FlatList용 keyExtractor 최적화
  const keyExtractor = useCallback((item: IMessage) => item._id, []);

  // 메시지 데이터 뒤집기 최적화 - 렌더링 시마다 매번 reverse() 하지 않도록 useMemo 사용
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  if (loading) return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#0062ffff" /></View>;

  const inputPaddingBottom = isKeyboardVisible ? 8 : (insets.bottom > 0 ? insets.bottom : 10);

  return (
    <View style={styles.container}>
      {chatRoom && <ChatHeader name={chatRoom.name} type={chatRoom.type} />}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          inverted
          data={reversedMessages} // 최적화된 데이터 사용
          keyExtractor={keyExtractor} // 최적화된 keyExtractor 사용
          renderItem={renderItem}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true} // 화면 밖 아이템 메모리 해제 (성능 향상)
          keyboardDismissMode="interactive"
        />
        
        <ChatInput onSend={handleSend} paddingBottom={inputPaddingBottom} />
      </KeyboardAvoidingView>

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  // ... 기존 스타일 유지 ...
  container: { flex: 1, backgroundColor: '#fff' },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  customHeaderContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    zIndex: 1,
  },
  customHeaderContent: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, 
    justifyContent: 'flex-start',
    marginLeft: 5,
  },
  headerIcon: {
    width: 32, height: 32,
    borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
    flexShrink: 1,
  },

  messageList: { flex: 1, backgroundColor: '#f5f5f5' },
  messageListContent: { 
    paddingHorizontal: 10, 
    paddingVertical: 8,
  },

  messageRow: { 
    flexDirection: 'row', 
    marginVertical: 6, 
    alignItems: 'flex-start' 
  },
  myMessageRow: { justifyContent: 'flex-end' },
  otherMessageRow: { justifyContent: 'flex-start' },

  avatarContainer: { marginRight: 10, marginTop: 0 },
  avatarPlaceholder: { 
    width: 36, height: 36, 
    borderRadius: 14, 
    backgroundColor: '#ddd', 
    justifyContent: 'center', alignItems: 'center' 
  },
  avatarText: { color: '#555', fontWeight: 'bold', fontSize: 14 },

  contentColumn: { flex: 1, maxWidth: '80%' },
  senderName: { fontSize: 12, color: '#666', marginBottom: 4, marginLeft: 1 },

  bubbleWrapper: { flexDirection: 'row', alignItems: 'flex-end' },
  myBubbleWrapper: { justifyContent: 'flex-end' },
  otherBubbleWrapper: { justifyContent: 'flex-start' },

  myBubble: { 
    backgroundColor: '#0062ffff', 
    paddingVertical: 10, paddingHorizontal: 14, 
    borderRadius: 18, 
    borderTopRightRadius: 2, 
  },
  otherBubble: { 
    backgroundColor: '#fff', 
    paddingVertical: 10, paddingHorizontal: 14, 
    borderRadius: 18, 
    borderTopLeftRadius: 2, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },

  myText: { color: 'white', fontSize: 15, lineHeight: 20 },
  otherText: { color: '#222', fontSize: 15, lineHeight: 20 },

  statusAndTimeContainer: { 
    marginHorizontal: 6, 
    marginBottom: 2,
    alignItems: 'flex-end' 
  },
  timestamp: { fontSize: 10, color: '#aaa' },
  readCountText: { fontSize: 10, color: '#0062ffff', fontWeight: 'bold', marginBottom: 2 },

  inputWrapper: { 
    backgroundColor: '#fff', 
    borderTopWidth: 1, 
    borderColor: '#eee', 
    paddingTop: 8, 
    paddingHorizontal: 10,
    flexDirection: 'row', 
    alignItems: 'flex-end', 
  },
  inputContainer: { 
    flex: 1, 
    backgroundColor: '#f2f2f2', 
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8, 
  },
  input: { 
    minHeight: 36, 
    maxHeight: 100, 
    paddingTop: 8, 
    paddingBottom: 8,
    paddingHorizontal: 4,
    fontSize: 16,
    color: '#333',
  },
  sendButton: { 
    width: 40, height: 40, 
    borderRadius: 20, 
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4, 
  },
  sendButtonActive: { backgroundColor: '#0062ffff' },
  sendButtonInactive: { backgroundColor: '#ccc' },
});