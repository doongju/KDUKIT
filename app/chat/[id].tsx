// app/chat/[id].tsx

import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  senderNameFull?: string;
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

// 내 프로필 데이터 타입 (차단 목록 확인용)
interface MyProfileData {
  blockedUsers?: string[];
}

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
  
  // ✨ 내 차단 목록 상태
  const [myBlockedUsers, setMyBlockedUsers] = useState<string[]>([]);

  const auth = getAuth();
  const user = auth.currentUser;
  const currentUserId = user?.uid;
  const flatListRef = useRef<FlatList>(null);

  // 1. 읽음 처리 업데이트
  const updateLastRead = useCallback(async (userId: string) => {
    if (!chatRoomId || !userId) return;
    const chatDocRef = doc(db, 'chatRooms', chatRoomId);
    const lastReadField = `lastReadBy.${userId}`;

    try {
      await updateDoc(chatDocRef, {
        [lastReadField]: serverTimestamp(),
      });
    } catch (e: any) {
      console.error("Failed to update lastRead:", e);
    }
  }, [chatRoomId]);

  // 2. 채팅방 정보 및 내 차단 목록 리스너
  const setupListeners = useCallback((currentUserId: string) => {
    if (!chatRoomId || !currentUserId) return () => {};

    const chatDocRef = doc(db, 'chatRooms', chatRoomId);
    const myDocRef = doc(db, 'users', currentUserId);

    // 채팅방 정보 구독
    const unsubChat = onSnapshot(chatDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as ChatRoom;
        setChatRoom(data);

        const names: { [uid: string]: string } = {};
        const fetchNamePromises = data.members.map(async (memberUid) => {
          try {
             const userDoc = await getDoc(doc(db, 'users', memberUid));
             if (userDoc.exists()) {
               const userData = userDoc.data() as UserProfile;
               let displayName = userData.displayName || '익명';
               if ((userData as any).department) {
                   displayName = (userData as any).department;
               } else if (userData.email) {
                   displayName = userData.email.split('@')[0];
               }
               names[memberUid] = displayName;
             } else {
               names[memberUid] = '알 수 없음'; 
             }
          } catch(e) { names[memberUid] = '익명'; }
        });
        await Promise.all(fetchNamePromises);
        setUserDisplayNames(prev => ({ ...prev, ...names }));

        navigation.setOptions({ title: data.name || '채팅방' });
        await updateLastRead(currentUserId);
      } else {
        Alert.alert("오류", "채팅방을 찾을 수 없습니다.");
        router.back();
      }
      setLoading(false);
    }, (error) => {
      console.error("Chat listener error:", error);
      setLoading(false);
    });

    // 내 차단 목록 구독
    const unsubBlock = onSnapshot(myDocRef, (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data() as MyProfileData;
            setMyBlockedUsers(data.blockedUsers || []);
        }
    });

    return () => {
      unsubChat();
      unsubBlock();
    };
  }, [chatRoomId, navigation, router, updateLastRead]);


  // 3. 메시지 리스너 (차단 목록 변경 시 재실행하여 필터링 적용)
  useEffect(() => {
    let unsubListeners: () => void | undefined;
    let unsubMessages: () => void | undefined;

    if (!currentUserId || !chatRoomId) {
      if (!currentUserId) {
        Alert.alert("로그인 필요", "로그인 상태를 확인해주세요.");
        router.replace('/(auth)/login');
      }
      setLoading(false);
      return;
    }

    unsubListeners = setupListeners(currentUserId);

    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    unsubMessages = onSnapshot(q, (snapshot) => {
      const rawMessages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          _id: docSnap.id,
          text: data.text,
          createdAt: data.createdAt?.toDate() || new Date(),
          user: { _id: data.senderId, name: userDisplayNames[data.senderId] || data.senderNameFull || '익명' },
          senderId: data.senderId,
          senderNameFull: userDisplayNames[data.senderId] || data.senderNameFull || '익명', 
        } as IMessage;
      });

      // ✨ [핵심] 차단된 유저의 메시지는 화면에서 제외
      const filteredMessages = rawMessages.filter(msg => !myBlockedUsers.includes(msg.senderId));
      setMessages(filteredMessages);
      
      setLoading(false);
      
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    }, (error) => {
      console.error('Message listener error:', error);
    });

    return () => {
      if (unsubListeners) unsubListeners();
      if (unsubMessages) unsubMessages();
    };
  }, [chatRoomId, currentUserId, router, navigation, setupListeners, userDisplayNames, myBlockedUsers]); 

  // 4. 메시지 전송
  const onSend = async () => {
    if (inputMessage.trim() === '' || !user || !currentUserId) return;

    // ✨ 차단 체크: 내가 차단한 사람에게는 메시지 전송 불가 (선택사항, 보통 안 보이게만 해도 됨)
    // 여기서는 경고 없이 그냥 보내지게 하거나, 경고를 띄울 수 있음
    
    const messageText = inputMessage.trim();
    setInputMessage('');

    const messageData = {
      text: messageText,
      createdAt: serverTimestamp(),
      senderId: user.uid,
      senderNameFull: user.displayName || (user.email ? user.email.split('@')[0] : '익명'), 
    };

    try {
      const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
      await addDoc(messagesRef, messageData);
      
      const chatDocRef = doc(db, 'chatRooms', chatRoomId);
      await updateDoc(chatDocRef, {
        lastMessage: messageText,
        lastMessageTimestamp: serverTimestamp(),
      });

      await updateLastRead(currentUserId);

    } catch (e: any) {
      Alert.alert('전송 실패', '메시지 전송에 실패했습니다.');
      console.error('Sending failed:', e);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#0062ffff" />
      </View>
    );
  }

  const renderMessage = ({ item: message }: { item: IMessage }) => {
    const isMyMessage = message.senderId === currentUserId;
    const displayTime = message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let readStatusText = '';
    if (isMyMessage && chatRoom) {
      const otherMembers = chatRoom.members.filter(memberId => memberId !== currentUserId);
      let unreadCount = 0;
      otherMembers.forEach(memberId => {
        const memberLastReadTime = chatRoom.lastReadBy?.[memberId]?.toDate();
        if (!memberLastReadTime || message.createdAt.getTime() > memberLastReadTime.getTime()) {
          unreadCount++;
        }
      });
      if (otherMembers.length === 0) readStatusText = '';
      else if (unreadCount === 0) readStatusText = '읽음';
      else readStatusText = `${unreadCount}`;
    }

    const senderDisplayName = userDisplayNames[message.senderId] || message.senderNameFull || '익명';

    return (
      <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
        {!isMyMessage && (
          <View style={styles.avatarContainer}>
            {/* ✨ 프사 클릭 시 프로필 모달 호출 */}
            <TouchableOpacity 
                onPress={() => setProfileUserId(message.senderId)}
                style={styles.avatarPlaceholder}
            >
                <Text style={styles.avatarText}>{senderDisplayName.charAt(0)}</Text>
            </TouchableOpacity>
            <Text style={styles.senderName} numberOfLines={1}>{senderDisplayName}</Text>
          </View>
        )}

        <View style={[styles.messageContentWrapper, isMyMessage ? styles.myMessageContentWrapper : styles.otherMessageContentWrapper]}>
          {isMyMessage && (
            <View style={styles.statusAndTimeContainer}>
              {readStatusText !== '' && <Text style={styles.readStatusText}>{readStatusText}</Text>}
              <Text style={styles.timestamp}>{displayTime}</Text>
            </View>
          )}

          <View style={isMyMessage ? styles.myBubble : styles.otherBubble}>
            {!isMyMessage && chatRoom && chatRoom.members.length > 2 && (
               <Text style={styles.senderNameInBubble}>{senderDisplayName}</Text>
            )}
            <Text style={isMyMessage ? styles.myText : styles.otherText}>{message.text}</Text>
          </View>

          {!isMyMessage && (
            <View style={styles.statusAndTimeContainer}>
              <Text style={styles.timestamp}>{displayTime}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

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
          keyExtractor={(item) => item._id}
          renderItem={renderMessage}
          keyboardDismissMode="on-drag"
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
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

      {/* ✨ 프로필 모달 (차단/신고 가능) */}
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
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
  myBubble: { backgroundColor: '#0062ffff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderBottomRightRadius: 2, maxWidth: '100%' },
  otherBubble: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, borderBottomLeftRadius: 2, maxWidth: '100%', borderWidth: 1, borderColor: '#e0e0e0' },
  senderName: { fontSize: 10, color: '#666', textAlign: 'center', width: '100%' },
  senderNameInBubble: { fontSize: 12, color: '#666', marginBottom: 3, fontWeight: 'bold' },
  myText: { color: 'white', fontSize: 15 },
  otherText: { color: '#333', fontSize: 15 },
  timestamp: { fontSize: 11, color: '#999', textAlign: 'right' },
  readStatusText: { fontSize: 11, color: '#0062ffff', fontWeight: 'bold', textAlign: 'right', marginBottom: 2 },
  inputWrapper: { backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 10 : 8, marginRight: 10 },
  sendButton: { backgroundColor: '#0062ffff', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, justifyContent: 'center' },
  sendButtonText: { color: 'white', fontWeight: 'bold' },
});