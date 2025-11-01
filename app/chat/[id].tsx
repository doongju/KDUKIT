// app/chat/[id].tsx
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'; // useRouter 임포트 확인
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

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

const ChatRoomScreen: React.FC = () => {
  const { id } = useLocalSearchParams();
  const chatRoomId = id as string;
  const navigation = useNavigation();
  const router = useRouter(); // useRouter 훅 사용

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatRoomDisplayName, setChatRoomDisplayName] = useState<string>('채팅방');
  const [loading, setLoading] = useState(true);

  const auth = getAuth();
  const user = auth.currentUser;
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    console.log("[DEBUG-chatid] ChatRoomScreen Mounted. Current User:", user?.uid);
    console.log("[DEBUG-chatid] ChatRoomScreen: chatRoomId from params:", chatRoomId);
  }, [user?.uid, chatRoomId]);


  const fetchChatDetails = useCallback(async (currentUserId: string) => {
    console.log("[DEBUG-chatid] fetchChatDetails called. Current User UID:", currentUserId);
    console.log("[DEBUG-chatid] Fetching chat room details for ID:", chatRoomId);

    try {
      // ✅ 'chats' 대신 'chatRooms' 컬렉션 사용
      const chatDocRef = doc(db, 'chatRooms', chatRoomId);
      const chatDoc = await getDoc(chatDocRef);

      if (chatDoc.exists()) {
        const data = chatDoc.data();
        console.log("[DEBUG-chatid] ChatRoom Document Data:", data);
        console.log("[DEBUG-chatid] ChatRoom Members:", data.members);
        console.log("[DEBUG-chatid] Is current user a member?", data.members.includes(currentUserId));
        
        if (data.type === 'party' && data.name) {
          setChatRoomDisplayName(data.name);
          navigation.setOptions({ title: data.name });
        } else if (data.type === 'private' && data.members && data.members.length === 2) {
          const otherUid = data.members.find((uid: string) => uid !== currentUserId);
          if (otherUid) {
            const userDoc = await getDoc(doc(db, 'users', otherUid));
            if (userDoc.exists()) {
              const name = userDoc.data()?.name || '상대방';
              setChatRoomDisplayName(name);
              navigation.setOptions({ title: name });
            } else {
              setChatRoomDisplayName('알 수 없는 사용자');
              navigation.setOptions({ title: '알 수 없는 사용자' });
            }
          } else {
            setChatRoomDisplayName('1:1 채팅방');
            navigation.setOptions({ title: '1:1 채팅방' });
          }
        } else {
          setChatRoomDisplayName(data.name || '채팅방');
          navigation.setOptions({ title: data.name || '채팅방' });
        }

        if (!data.members.includes(currentUserId)) {
            Alert.alert("권한 없음", "이 채팅방에 접근할 권한이 없습니다.");
            navigation.goBack();
            return;
        }

      } else {
        Alert.alert("오류", "채팅방을 찾을 수 없습니다.");
        navigation.goBack();
      }
    } catch (e: any) {
      console.error('[DEBUG-chatid] Failed to fetch chat details:', e.code, e.message);
      Alert.alert("오류", `채팅방 정보를 가져오는 데 실패했습니다: ${e.message}`);
      navigation.goBack();
    }
  }, [chatRoomId, navigation]);


  useEffect(() => {
    const currentUserId = user?.uid;
    console.log("[DEBUG-chatid] useEffect: currentUserId:", currentUserId);
    console.log("[DEBUG-chatid] useEffect: chatRoomId:", chatRoomId);

    if (!currentUserId || !chatRoomId) {
      setLoading(false);
      Alert.alert("로그인 필요", "로그인 상태를 확인해주세요.");
      router.replace('/(auth)/login'); 
      return;
    }

    fetchChatDetails(currentUserId);

    // ✅ 'chats' 대신 'chatRooms' 컬렉션 사용
    const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    console.log("[DEBUG-chatid] Setting up onSnapshot for messages in chatRoomId:", chatRoomId);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("[DEBUG-chatid] onSnapshot received data. Number of messages:", snapshot.docs.length);
      const loadedMessages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          _id: docSnap.id,
          text: data.text,
          createdAt: data.createdAt?.toDate() || new Date(),
          user: { _id: data.senderId, name: data.name || '익명' },
          senderId: data.senderId,
        } as IMessage;
      });
      setMessages(loadedMessages);
      setLoading(false);
      
      updateLastRead(currentUserId);

      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    }, (error) => {
      console.error('[DEBUG-chatid] Error in message snapshot listener:', error.code, error.message);
      Alert.alert("메시지 로드 오류", `메시지를 불러오는 데 실패했습니다: ${error.message}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [chatRoomId, user?.uid, fetchChatDetails, router, navigation]); 

  const updateLastRead = async (currentUserId: string) => {
    if (!chatRoomId || !currentUserId) return;
    console.log("[DEBUG-chatid] Attempting to update lastRead for chatRoomId:", chatRoomId, "user:", currentUserId);
    // ✅ 'chats' 대신 'chatRooms' 컬렉션 사용
    const chatDocRef = doc(db, 'chatRooms', chatRoomId);
    const lastReadField = `lastReadBy.${currentUserId}`;

    try {
        await updateDoc(chatDocRef, {
            [lastReadField]: serverTimestamp(),
        });
        console.log("[DEBUG-chatid] lastRead updated successfully.");
    } catch (e: any) {
        console.error("[DEBUG-chatid] Failed to update lastRead:", e.code, e.message);
    }
  };

  const onSend = async () => {
    if (inputMessage.trim() === '' || !user) return;
    console.log("[DEBUG-chatid] Attempting to send message. ChatRoomId:", chatRoomId, "SenderId:", user.uid);
    const messageText = inputMessage.trim();
    setInputMessage('');

    const messageData = {
      text: messageText,
      createdAt: serverTimestamp(),
      senderId: user.uid,
    };

    try {
      // ✅ 'chats' 대신 'chatRooms' 컬렉션 사용
      const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
      await addDoc(messagesRef, messageData);
      console.log("[DEBUG-chatid] Message added to messages subcollection.");

      // ✅ 'chats' 대신 'chatRooms' 컬렉션 사용
      const chatDocRef = doc(db, 'chatRooms', chatRoomId);
      await updateDoc(chatDocRef, {
        lastMessage: messageText,
        lastMessageTimestamp: serverTimestamp(),
      });
      console.log("[DEBUG-chatid] ChatRoom lastMessage updated.");
    } catch (e: any) {
      Alert.alert('전송 실패', '메시지 전송에 실패했습니다.');
      console.error('[DEBUG-chatid] Sending message failed:', e.code, e.message);
    }
  };

  // ... (renderMessage 및 styles 코드는 동일)
  const renderMessage = ({ item }: { item: IMessage }) => {
    const isMyMessage = item.senderId === user?.uid;
    const displayTime = item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
        {!isMyMessage && (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{item.user.name.charAt(0)}</Text>
          </View>
        )}

        <View
          style={[
            styles.messageContentWrapper,
            isMyMessage ? styles.myMessageContentWrapper : styles.otherMessageContentWrapper,
          ]}
        >
          <View style={styles.statusAndTimeContainer}>
            <Text style={styles.timestamp}>{displayTime}</Text>
          </View>

          <View style={isMyMessage ? styles.myBubble : styles.otherBubble}>
            <Text style={isMyMessage ? styles.myText : styles.otherText}>{item.text}</Text>
          </View>
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
          inverted={false}
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
    </SafeAreaView>
  );
};

export default ChatRoomScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  messageListContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 10,
    paddingBottom: 10,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: 'white',
    fontWeight: 'bold',
  },
  messageContentWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '80%',
  },
  myMessageContentWrapper: {
    flexDirection: 'row',
  },
  otherMessageContentWrapper: {
    flexDirection: 'row',
  },
  statusAndTimeContainer: {
    justifyContent: 'flex-end',
    marginHorizontal: 4,
    alignItems: 'flex-end',
    marginBottom: 5,
  },
  myBubble: {
    backgroundColor: '#0062ffff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderBottomRightRadius: 2,
    maxWidth: '100%',
  },
  otherBubble: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 2,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  myText: {
    color: 'white',
    fontSize: 15,
  },
  otherText: {
    color: '#333',
    fontSize: 15,
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
  },
  readStatusText: {
    fontSize: 11,
    color: '#0062ffff',
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 2,
  },
  inputWrapper: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#0062ffff',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});