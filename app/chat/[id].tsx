// app/chat/[id].tsx

import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

import UserProfileModal from '../../components/UserProfileModal';

interface IMessage {
  _id: string;
  text: string;
  createdAt: Date;
  user: {
    _id: string;
    name: string;
  };
  senderId: string;
}

interface ChatRoom {
  id: string;
  name: string;
  members: string[];
  partyId?: string;
  type: 'party' | 'direct' | 'private' | 'dm';
  createdAt: Timestamp;
  lastMessage: string;
  lastMessageTimestamp: Timestamp | null;
  lastReadBy: { [uid: string]: Timestamp | null };
}

interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

interface MyProfileData {
  blockedUsers?: string[];
}

// ✨ [최적화] 메시지 아이템 컴포넌트 (읽음 표시 로직 변경됨)
const MessageItem = memo(({ item, isMyMessage, displayName, onPressAvatar, unreadCount }: any) => {
    const displayTime = item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
        {!isMyMessage && (
          <View style={styles.avatarContainer}>
            <TouchableOpacity 
                onPress={() => onPressAvatar(item.senderId)}
                style={styles.avatarPlaceholder}
            >
                <Text style={styles.avatarText}>{displayName.charAt(0)}</Text>
            </TouchableOpacity>
            <Text style={styles.senderName} numberOfLines={1}>{displayName}</Text>
          </View>
        )}

        <View style={[styles.messageContentWrapper, isMyMessage ? styles.myMessageContentWrapper : styles.otherMessageContentWrapper]}>
          {isMyMessage && (
            <View style={styles.statusAndTimeContainer}>
              {/* ✨ [수정] 숫자가 0보다 클 때만 표시 (다 읽으면 사라짐) */}
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
        prev.unreadCount === next.unreadCount && // 읽음 숫자 바뀌면 리렌더링
        prev.displayName === next.displayName
    );
});

const ChatRoomScreen: React.FC = () => {
  const { id } = useLocalSearchParams();
  const chatRoomId = id as string;
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDisplayNames, setUserDisplayNames] = useState<{ [uid: string]: string }>({});
  
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);

  const auth = getAuth();
  const user = auth.currentUser;
  const currentUserId = user?.uid;
  const flatListRef = useRef<FlatList>(null);

  const updateLastRead = useCallback(async (userId: string) => {
    if (!chatRoomId || !userId) return;
    const chatDocRef = doc(db, 'chatRooms', chatRoomId);
    try {
      await updateDoc(chatDocRef, { [`lastReadBy.${userId}`]: serverTimestamp() });
    } catch (e) {}
  }, [chatRoomId]);

  useEffect(() => {
    if (!chatRoomId || !currentUserId) return;

    const chatDocRef = doc(db, 'chatRooms', chatRoomId);
    const myDocRef = doc(db, 'users', currentUserId);

    // 1. 채팅방 정보 & 멤버 이름
    const unsubChat = onSnapshot(chatDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as ChatRoom;
        setChatRoom(data);

        const newNames: { [uid: string]: string } = {};
        const membersToFetch = data.members.filter(uid => !userDisplayNames[uid]);

        if (membersToFetch.length > 0) {
            const promises = membersToFetch.map(async (uid) => {
                try {
                    const uSnap = await getDoc(doc(db, 'users', uid));
                    if (uSnap.exists()) {
                        const d = uSnap.data();
                        let name = '익명';
                        if (d.department) {
                             if (d.email) {
                                 const prefix = d.email.split('@')[0];
                                 const two = prefix.substring(0, 2);
                                 if (!isNaN(Number(two)) && two.length === 2) name = `${two}학번 ${d.department}`;
                                 else name = `${prefix}님 ${d.department}`;
                             } else { name = d.department; }
                        } else if (d.displayName) { name = d.displayName; }
                        else if (d.email) { name = d.email.split('@')[0]; }
                        newNames[uid] = name;
                    } else { newNames[uid] = '알 수 없음'; }
                } catch(e) { newNames[uid] = '익명'; }
            });
            await Promise.all(promises);
            setUserDisplayNames(prev => ({ ...prev, ...newNames }));
        }

        navigation.setOptions({ title: data.name || '채팅방' });
        updateLastRead(currentUserId);
      }
      setLoading(false);
    });

    // 2. 차단 목록
    const unsubBlock = onSnapshot(myDocRef, (docSnap) => {
        if(docSnap.exists()) {
            const d = docSnap.data() as MyProfileData;
            setMyBlockedUsers(d.blockedUsers || []);
        }
    });

    // 3. 메시지 로드
    const q = query(collection(db, 'chatRooms', chatRoomId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubMsg = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                _id: doc.id,
                text: d.text,
                createdAt: d.createdAt?.toDate() || new Date(),
                user: { _id: d.senderId, name: 'User' },
                senderId: d.senderId,
            } as IMessage;
        });
        setMessages(msgs);
        setLoading(false);
    });

    return () => { unsubChat(); unsubBlock(); unsubMsg(); };
  }, [chatRoomId, currentUserId]);

  const onSend = async () => {
    if (inputMessage.trim() === '' || !user || !currentUserId) return;
    if (chatRoom && chatRoom.members.some(mid => myBlockedUsers.includes(mid) && mid !== currentUserId)) {
      Alert.alert("전송 불가", "차단 관계에 있는 사용자에게는 메시지를 보낼 수 없습니다.");
      setInputMessage('');
      return;
    }

    const text = inputMessage.trim();
    setInputMessage(''); 

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
      updateLastRead(currentUserId);
      // 전송 후 스크롤 내리기
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { console.error(e); }
  };

  // 렌더링 함수
  const renderItem = useCallback(({ item }: { item: IMessage }) => {
    if (myBlockedUsers.includes(item.senderId)) return null;

    const isMyMessage = item.senderId === currentUserId;
    const displayName = userDisplayNames[item.senderId] || '익명';

    // ✨ 읽음 숫자 계산
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
        unreadCount={unreadCount} // 숫자 전달
      />
    );
  }, [currentUserId, chatRoom, userDisplayNames, myBlockedUsers]);

  if (loading) return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#0062ffff" /></View>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          // ✨ [수정] 콘텐츠 크기가 바뀌면(메시지 로드 시) 자동으로 맨 아래로
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })} // 초기 레이아웃 시 스크롤
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent} // 스타일 적용
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
        />

        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputMessage}
              onChangeText={setInputMessage}
              placeholder="메시지를 입력하세요..."
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={onSend}>
              <Text style={styles.sendButtonText}>전송</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <UserProfileModal 
        visible={!!profileUserId}
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
      />
    </SafeAreaView>
  );
};

export default ChatRoomScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { flex: 1 },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { flex: 1, paddingHorizontal: 10 },
  // ✨ [수정] flexGrow: 1, justifyContent: 'flex-end' -> 메시지를 항상 아래부터 채움
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
  // ✨ [수정] 읽음 숫자 스타일 (노란색)
  readCountText: { fontSize: 11, color: '#0777ffff', fontWeight: 'bold', textAlign: 'right', marginBottom: 2 },
  inputWrapper: { backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, marginRight: 10 },
  sendButton: { backgroundColor: '#0062ffff', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8 },
  sendButtonText: { color: 'white', fontWeight: 'bold' },
});