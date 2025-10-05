// app/chat/[id].tsx (전체 코드)

import { useLocalSearchParams, useNavigation } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, Platform, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
    const { height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [messages, setMessages] = useState<IMessage[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [otherUserName, setOtherUserName] = useState<string>('상대방');
    const [loading, setLoading] = useState(true);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    const auth = getAuth();
    const user = auth.currentUser;
    const flatListRef = useRef<FlatList>(null);
    const inputContainerRef = useRef<View>(null); 
    const [inputContainerMeasuredHeight, setInputContainerMeasuredHeight] = useState(60); 

    // ------------------------------------------------------------------
    // 1. 채팅방 정보 로드 (상대방 이름)
    // ------------------------------------------------------------------
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
            console.error("Failed to fetch chat details:", e);
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
        const q = query(messagesRef, orderBy('createdAt', 'desc')); // ⚠️ 최신 메시지가 위로 오도록 내림차순 정렬

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedMessages = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    _id: doc.id,
                    text: data.text,
                    createdAt: data.createdAt?.toDate() || new Date(),
                    user: { _id: data.senderId, name: data.name }, 
                    senderId: data.senderId,
                } as IMessage;
            });
            setMessages(loadedMessages);
            setLoading(false);

            updateLastRead(currentUserId);
        });

        return () => unsubscribe();
    }, [chatRoomId, user?.uid, fetchChatDetails]);
    
    // ⚠️ 마지막 읽은 시간 업데이트 (읽음 상태 처리 기반)
    const updateLastRead = async (currentUserId: string) => {
        if (!chatRoomId || !currentUserId) return;
        
        const chatDocRef = doc(db, 'chats', chatRoomId);
        const lastReadField = `lastReadBy.${currentUserId}`; 
        
        await updateDoc(chatDocRef, {
            [lastReadField]: serverTimestamp()
        });
    };

    // ------------------------------------------------------------------
    // 3. 메시지 전송 로직
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // 4. 키보드 이벤트 리스너 (하단 입력창 조절)
    // ------------------------------------------------------------------
    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener(
            'keyboardDidShow',
            (e) => {
                setKeyboardHeight(e.endCoordinates.height);
            }
        );
        const keyboardDidHideListener = Keyboard.addListener(
            'keyboardDidHide',
            () => {
                setKeyboardHeight(0);
            }
        );

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    // ⚠️ 입력창 컨테이너 높이 측정 (정확한 패딩을 위해)
    const onInputContainerLayout = useCallback((event: any) => {
        const { height } = event.nativeEvent.layout;
        setInputContainerMeasuredHeight(height);
    }, []);


    if (loading) {
        return <ActivityIndicator style={styles.loading} size="large" color="#0062ffff" />;
    }
    
    const renderMessage = ({ item }: { item: IMessage }) => {
        const isMyMessage = item.senderId === user?.uid;
        const readStatus = isMyMessage ? '1' : null; 
        const displayTime = item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
            // ⚠️ 메시지 정렬 순서가 바뀌었으므로, 메시지 컨테이너의 정렬도 다시 설정해야 합니다.
            // inverted FlatList에서는 가장 아래 요소가 첫 번째로 렌더링되므로, 
            // 실제 메시지는 여전히 상단에서 하단으로 보이도록 합니다.
            <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
                {!isMyMessage && (
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>{otherUserName.charAt(0)}</Text>
                    </View>
                )}
                <View style={[styles.messageContent, isMyMessage ? styles.myMessageContent : styles.otherMessageContent]}>
                    <View style={[styles.statusAndTimeContainer, isMyMessage ? styles.myStatusAndTimeContainer : styles.otherStatusAndTimeContainer]}>
                        {isMyMessage && readStatus && (
                            <Text style={styles.readStatusText}>{readStatus}</Text>
                        )}
                        <Text style={styles.timestamp}>{displayTime}</Text>
                    </View>
                    
                    <View style={isMyMessage ? styles.myBubble : styles.otherBubble}>
                        <Text style={isMyMessage ? styles.myText : styles.otherText}>{item.text}</Text>
                    </View>
                </View>
            </View>
        );
    };

    // ⚠️ FlatList의 contentContainerStyle에 추가할 패딩 계산
    // inputContainer 높이만큼 패딩을 줍니다. 키보드 높이는 bottom에서 처리됩니다.
    const flatListPaddingBottom = inputContainerMeasuredHeight;


    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}> 
            <View style={styles.fullScreenContainer}>
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={item => item._id}
                    renderItem={renderMessage}
                    // ⚠️ FlatList를 뒤집어서 최신 메시지가 하단에 오도록 합니다.
                    inverted={true} 
                    // onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} // inverted 시에는 필요 없음
                    // onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })} // inverted 시에는 필요 없음
                    style={styles.messageList}
                    // ⚠️ FlatList의 contentContainerStyle에 하단 패딩 추가
                    contentContainerStyle={{ paddingBottom: flatListPaddingBottom + insets.bottom }} 
                />
                
                <View 
                    ref={inputContainerRef}
                    onLayout={onInputContainerLayout}
                    style={[
                        styles.inputContainer, 
                        { bottom: keyboardHeight + insets.bottom } // ⚠️ 키보드 높이 + SafeArea 하단 인셋
                    ]}
                > 
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
        </SafeAreaView>
    );
};

export default ChatRoomScreen;

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    fullScreenContainer: { 
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loading: {
        flex: 1,
        justifyContent: 'center',
    },
    messageList: {
        paddingHorizontal: 10,
        // inverted FlatList를 사용하기 때문에 flexGrow를 사용하지 않습니다.
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
    messageContent: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        maxWidth: '80%',
    },
    myMessageContent: {
        flexDirection: 'row-reverse',
    },
    otherMessageContent: {
        flexDirection: 'row',
    },
    statusAndTimeContainer: {
        justifyContent: 'flex-end',
        marginBottom: 5,
        marginHorizontal: 4,
    },
    myStatusAndTimeContainer: {
        alignItems: 'flex-end',
    },
    otherStatusAndTimeContainer: {
        alignItems: 'flex-start',
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
    inputContainer: {
        flexDirection: 'row',
        padding: 10,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderColor: '#eee',
        position: 'absolute',
        left: 0,
        right: 0,
    },
    input: {
        flex: 1,
        minHeight: 40, 
        maxHeight: 120,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingTop: Platform.OS === 'ios' ? 10 : 8,
        paddingBottom: Platform.OS === 'ios' ? 10 : 8,
        marginRight: 10,
    },
    sendButton: {
        backgroundColor: '#0062ffff',
        borderRadius: 20,
        paddingHorizontal: 15,
        justifyContent: 'center',
    },
    sendButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
});