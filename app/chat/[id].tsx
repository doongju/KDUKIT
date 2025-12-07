import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
// ✨ [수정] arrayUnion, arrayRemove 추가됨
import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
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

// ✨ [최적화] 아이콘 스타일 가져오는 함수
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

// ✨ 커스텀 헤더
const ChatHeader = memo(({ name, type }: { name: string, type?: string }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

// ✨ 메시지 아이템
const MessageItem = memo(({ item, isMyMessage, displayName, onPressAvatar, unreadCount }: any) => {
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
    prev.displayName === next.displayName &&
    prev.item.text === next.item.text 
  );
});
MessageItem.displayName = "MessageItem";

// ✨ 입력창 컴포넌트
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

  // ✨ [수정 1] 입장/퇴장 관리 (activeUsers 등록 및 해제)
  // - 입장 시: activeUsers에 내 ID 추가 + 뱃지(unreadCounts) 0으로 초기화
  // - 퇴장 시: activeUsers에서 내 ID 제거 -> 그래야 알림 다시 옴
  useEffect(() => {
    if (chatRoomId && currentUserId) {
        const roomRef = doc(db, 'chatRooms', chatRoomId);
        
        // 1. 입장 로직
        updateDoc(roomRef, {
            activeUsers: arrayUnion(currentUserId),       // 접속자 명단에 추가
            [`unreadCounts.${currentUserId}`]: 0          // 뱃지 숫자 0으로
        }).catch(err => console.log("입장 처리 실패:", err));

        // 2. 퇴장 로직 (Component Unmount 시 실행)
        return () => {
            updateDoc(roomRef, {
                activeUsers: arrayRemove(currentUserId)   // 접속자 명단에서 제거
            }).catch(err => console.log("퇴장 처리 실패:", err));
        };
    }
  }, [chatRoomId, currentUserId]);

  // ✨ 스크롤 함수 최적화
  const scrollToBottom = useCallback((animated = true) => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated });
    }
  }, [messages.length]);

  // 키보드 리스너
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

  // ✨ [수정 2] 실시간 읽음 처리 (lastReadBy + 뱃지 초기화 동시 처리)
  // 메시지가 새로 오거나 화면이 갱신될 때마다 실행
  const updateLastRead = useCallback(async () => {
    if (!chatRoomId || !currentUserId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', chatRoomId), {
        [`lastReadBy.${currentUserId}`]: serverTimestamp(),
        [`unreadCounts.${currentUserId}`]: 0  // 메시지를 보고 있는 중이므로 계속 0으로 유지
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

  // 멤버 이름 로드
  useEffect(() => {
    if (!chatRoom?.members) return;
    
    const fetchMissingNames = async () => {
      const missingMembers = chatRoom.members.filter(uid => !userDisplayNames[uid]);
      if (missingMembers.length === 0) return;

      const newNames: { [uid: string]: string } = {};
      
      await Promise.all(missingMembers.map(async (uid) => {
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
      }));
      
      setUserDisplayNames(prev => ({ ...prev, ...newNames }));
    };
    
    fetchMissingNames();
  }, [chatRoom?.members]);

  // ✨ [수정 3] 메시지 변경 감지 -> 읽음 처리 실행
  useEffect(() => {
    if (messages.length > 0) {
        updateLastRead();
    }
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
      
      setMessages(msgs);
      setLoading(false);
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
        lastMessage: text,
        lastMessageTimestamp: serverTimestamp(),
      });
      
      scrollToBottom();
    } catch (e) { console.error(e); }
  }, [chatRoom, myBlockedUsers, chatRoomId, currentUserId, user, scrollToBottom]);

  const renderItem: ListRenderItem<IMessage> = useCallback(({ item }) => {
    if (myBlockedUsers.includes(item.senderId)) return null;
    const isMyMessage = item.senderId === currentUserId;
    const displayName = userDisplayNames[item.senderId] || '...';
    
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
        item={item}
        isMyMessage={isMyMessage}
        displayName={displayName}
        onPressAvatar={setProfileUserId}
      />
    );
  }, [currentUserId, chatRoom, userDisplayNames, myBlockedUsers]);

  const keyExtractor = useCallback((item: IMessage) => item._id, []);
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
          data={reversedMessages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
          keyboardDismissMode="interactive"
        />
        
        <ChatInput onSend={handleSend} paddingBottom={inputPaddingBottom} />
      </KeyboardAvoidingView>

      <UserProfileModal visible={!!profileUserId} userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
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