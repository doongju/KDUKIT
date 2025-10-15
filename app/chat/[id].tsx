import { useLocalSearchParams, useNavigation } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// 메시지 타입 정의
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

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [otherUserName, setOtherUserName] = useState<string>('상대방');
  const [loading, setLoading] = useState(true);

  const auth = getAuth();
  const user = auth.currentUser;
  const flatListRef = useRef<FlatList>(null);

  // ------------------------------------------------------------------
  // 1. 채팅방 정보 로드
  // ------------------------------------------------------------------x
  const fetchChatDetails = useCallback(async (currentUserId: string) => {
    try {
      const chatDocRef = doc(db, 'chats', chatRoomId);
      const chatDoc = await getDoc(chatDocRef);

      if (chatDoc.exists()) {
        const data = chatDoc.data();
        const otherUid = data.users.find((uid: string) => uid !== currentUserId);

        if (otherUid) {
          const userDoc = await getDoc(doc(db, 'users', otherUid));
          if (userDoc.exists()) {
            const name = userDoc.data()?.name || '상대방';
            setOtherUserName(name);
            navigation.setOptions({ title: name });
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch chat details:', e);
    }
  }, [chatRoomId, navigation]);

  // ------------------------------------------------------------------
  // 2. 실시간 메시지 리스너 및 읽음 상태 업데이트
  // ------------------------------------------------------------------
  useEffect(() => {
    const currentUserId = user?.uid;
    if (!currentUserId || !chatRoomId) {
      setLoading(false);
      return;
    }

    fetchChatDetails(currentUserId);

    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMessages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          _id: docSnap.id,
          text: data.text,
          createdAt: data.createdAt?.toDate() || new Date(),
          user: { _id: data.senderId, name: data.name },
          senderId: data.senderId,
        } as IMessage;
      });
      setMessages(loadedMessages);
      setLoading(false);
      updateLastRead(currentUserId);

      // 자동 스크롤
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    });

    return () => unsubscribe();
  }, [chatRoomId, user?.uid, fetchChatDetails]);

  const updateLastRead = async (currentUserId: string) => {
    if (!chatRoomId || !currentUserId) return;

    const chatDocRef = doc(db, 'chats', chatRoomId);
    const lastReadField = `lastReadBy.${currentUserId}`;

    await updateDoc(chatDocRef, {
      [lastReadField]: serverTimestamp(),
    });
  };

  const onSend = async () => {
    if (inputMessage.trim() === '' || !user) return;

    const messageText = inputMessage.trim();
    setInputMessage('');

    const messageData = {
      text: messageText,
      createdAt: serverTimestamp(),
      senderId: user.uid,
    };

    try {
      const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
      await addDoc(messagesRef, messageData);

      const chatDocRef = doc(db, 'chats', chatRoomId);
      await updateDoc(chatDocRef, {
        lastMessage: messageText,
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert('전송 실패', '메시지 전송에 실패했습니다.');
      console.error('Sending message failed:', e);
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.loading} size="large" color="#0062ffff" />;
  }

  const renderMessage = ({ item }: { item: IMessage }) => {
    const isMyMessage = item.senderId === user?.uid;
    const readStatus = isMyMessage ? '1' : null;
    const displayTime = item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
        {!isMyMessage && (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{otherUserName.charAt(0)}</Text>
          </View>
        )}

        <View
          style={[
            styles.messageContentWrapper,
            isMyMessage ? styles.myMessageContentWrapper : styles.otherMessageContentWrapper,
          ]}
        >
          <View style={styles.statusAndTimeContainer}>
            {isMyMessage && readStatus && <Text style={styles.readStatusText}>{readStatus}</Text>}
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
        keyboardVerticalOffset={0} // ✅ 불필요한 offset 제거
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

        {/* ✅ insets.bottom 대신 고정 padding으로 여백 문제 해결 */}
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
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  messageListContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 10,
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
    paddingVertical: 8, // ✅ 고정 패딩 (insets.bottom 제거)
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
