import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// 메시지 인터페이스
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

// ChatRoom 인터페이스
interface ChatRoom {
    id: string;
    name: string;
    members: string[];
    partyId?: string;
    type: 'party' | 'direct' | 'private';
    createdAt: Timestamp;
    lastMessage: string;
    lastMessageTimestamp: Timestamp | null;
    lastReadBy: { [uid: string]: Timestamp | null };
}

// UserProfile 인터페이스
interface UserProfile {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
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

    const auth = getAuth();
    const user = auth.currentUser;
    const currentUserId = user?.uid;
    const flatListRef = useRef<FlatList>(null);

    // ------------------------------------------------------------------
    // 1. lastReadBy 업데이트 함수 (useCallback으로 감싸 의존성 확보)
    // ------------------------------------------------------------------
    const updateLastRead = useCallback(async (userId: string) => {
        if (!chatRoomId || !userId) return;
        const chatDocRef = doc(db, 'chatRooms', chatRoomId);
        const lastReadField = `lastReadBy.${userId}`;

        try {
            await updateDoc(chatDocRef, {
                [lastReadField]: serverTimestamp(),
            });
            //console.log(`[DEBUG-chatid] lastRead updated successfully for user ${userId}.`);
        } catch (e: any) {
            console.error(`[DEBUG-chatid] Failed to update lastRead for ${userId}:`, e.code, e.message);
        }
    }, [chatRoomId]);

    // ------------------------------------------------------------------
    // 2. 채팅방 상세 정보 리스너 (setupChatRoomListener)
    // ------------------------------------------------------------------
    const setupChatRoomListener = useCallback((currentUserId: string) => {
        if (!chatRoomId || !currentUserId) return () => {};

        const chatDocRef = doc(db, 'chatRooms', chatRoomId);

        const unsubscribe = onSnapshot(chatDocRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() } as ChatRoom;
                setChatRoom(data);

                // 멤버 이름 가져오기 로직
                const names: { [uid: string]: string } = {};
                const fetchNamePromises = data.members.map(async (memberUid) => {
                    const userDoc = await getDoc(doc(db, 'users', memberUid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data() as UserProfile;
                        names[memberUid] = userData.displayName || (userData.email ? userData.email.split('@')[0] : '익명');
                    } else {
                        // ⚠️ '탈퇴한 사용자' 대신 '알 수 없음' 등으로 표시하거나, 더 나은 처리를 고려
                        names[memberUid] = '알 수 없음'; 
                    }
                });
                await Promise.all(fetchNamePromises);
                setUserDisplayNames(prev => ({ ...prev, ...names }));


                // UI 이름 설정
                navigation.setOptions({ title: data.name || '채팅방' });
                
                // 채팅방 진입 시 자신의 lastReadBy 업데이트 (5초 체크 로직은 제거하여 매번 업데이트)
                await updateLastRead(currentUserId);

            } else {
                Alert.alert("오류", "채팅방을 찾을 수 없습니다.");
                router.replace('/(tabs)/taxiparty');
            }
            setLoading(false);
        }, (error) => {
            console.error("[DEBUG-chatid] Error in chatRoom snapshot listener:", error.code, error.message);
            Alert.alert("오류", `채팅방 정보를 가져오는 데 실패했습니다: ${error.message}`);
            setLoading(false);
        });

        return unsubscribe;
    }, [chatRoomId, navigation, router, updateLastRead]);


    // ------------------------------------------------------------------
    // 3. 메인 useEffect (메시지 리스너)
    // ------------------------------------------------------------------
    useEffect(() => {
        let unsubscribeChatRoom: () => void | undefined;
        let unsubscribeMessages: () => void | undefined;

        if (!currentUserId || !chatRoomId) {
            if (!currentUserId) {
                Alert.alert("로그인 필요", "로그인 상태를 확인해주세요.");
                router.replace('/(auth)/login');
            }
            setLoading(false);
            return;
        }

        unsubscribeChatRoom = setupChatRoomListener(currentUserId);

        const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const loadedMessages = snapshot.docs.map((docSnap) => {
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
            setMessages(loadedMessages);
            setLoading(false);
            
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

        return () => {
            if (unsubscribeChatRoom) unsubscribeChatRoom();
            if (unsubscribeMessages) unsubscribeMessages();
        };
    }, [chatRoomId, currentUserId, router, navigation, setupChatRoomListener, userDisplayNames]); 

    // ------------------------------------------------------------------
    // 4. 메시지 전송 함수 (권한 오류 해결 집중)
    // ------------------------------------------------------------------
    const onSend = async () => {
        if (inputMessage.trim() === '' || !user || !currentUserId) return;
        const messageText = inputMessage.trim();
        setInputMessage('');

        const messageData = {
            text: messageText,
            createdAt: serverTimestamp(),
            senderId: user.uid,
            senderNameFull: user.displayName || (user.email ? user.email.split('@')[0] : '익명'), 
        };

        try {
            // 1. 메시지 추가 (messages 서브컬렉션)
            const messagesRef = collection(db, 'chatRooms', chatRoomId, 'messages');
            await addDoc(messagesRef, messageData);
            
            // 2. chatRooms 문서 업데이트 (lastMessage, lastMessageTimestamp)
            const chatDocRef = doc(db, 'chatRooms', chatRoomId);
            await updateDoc(chatDocRef, {
                lastMessage: messageText,
                lastMessageTimestamp: serverTimestamp(),
            });

            // 3. 자신의 lastReadBy 업데이트
            await updateLastRead(currentUserId);

        } catch (e: any) {
            Alert.alert('전송 실패', '메시지 전송에 실패했습니다.');
            console.error('[DEBUG-chatid] Sending message failed:', e.code, e.message);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingScreen}>
                <ActivityIndicator size="large" color="#0062ffff" />
                <Text style={styles.loadingText}>채팅방 로딩 중...</Text>
            </View>
        );
    }

    // ⚠️ renderMessage 함수: 읽음 상태 및 UI 로직 (오류 수정)
    const renderMessage = ({ item: message }: { item: IMessage }) => {
        const isMyMessage = message.senderId === currentUserId;
        const displayTime = message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let readStatusText = '';
        if (isMyMessage && chatRoom) {
            // ⚠️ 1. 읽지 않은 멤버 수 계산
            const otherMembers = chatRoom.members.filter(memberId => memberId !== currentUserId);
            let unreadCount = 0;
            
            otherMembers.forEach(memberId => {
                const memberLastReadTime = chatRoom.lastReadBy?.[memberId]?.toDate();
                
                // 메시지 생성 시각이 상대방의 마지막 읽음 시각보다 '이후'인 경우 (안 읽음)
                if (!memberLastReadTime || message.createdAt.getTime() > memberLastReadTime.getTime()) {
                    unreadCount++;
                }
            });

            // ⚠️ 2. 숫자 또는 '읽음' 텍스트 결정
            if (otherMembers.length === 0) {
                 readStatusText = '';
            } else if (unreadCount === 0) {
                // 모두 읽었을 경우 (0명이 안 읽음)
                readStatusText = '읽음';
            } else {
                // 안 읽은 사람이 1명 이상일 때 숫자 표시
                readStatusText = `${unreadCount}`;
            }
        }

        const senderDisplayName = userDisplayNames[message.senderId] || message.senderNameFull || '익명';

        return (
            <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
                {!isMyMessage && (
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>{senderDisplayName.charAt(0)}</Text>
                        </View>
                        <Text style={styles.senderName}>{senderDisplayName}</Text>
                    </View>
                )}

                <View
                    style={[
                        styles.messageContentWrapper,
                        isMyMessage ? styles.myMessageContentWrapper : styles.otherMessageContentWrapper,
                    ]}
                >
                    {isMyMessage && (
                        <View style={styles.statusAndTimeContainer}>
                            {readStatusText !== '' && (
                                <Text style={styles.readStatusText}>{readStatusText}</Text>
                            )}
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
    loadingScreen: { // 로딩 화면 전체 스타일
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    loadingText: { // 로딩 텍스트 스타일
        marginTop: 10,
        fontSize: 16,
        color: '#555',
    },
    messageList: {
        flex: 1,
        paddingHorizontal: 10,
    },
    messageListContent: { // FlatList의 contentContainerStyle
        flexGrow: 1,
        justifyContent: 'flex-end', // ⚠️ 메시지들을 아래쪽으로 정렬
        paddingTop: 10, // 상단 여백
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
    avatarContainer: { // 아바타와 이름 컨테이너 (상대방 메시지에만 사용)
        marginRight: 8,
        alignItems: 'center',
    },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#ccc',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4, // 이름과의 간격
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
    senderName: { // 아바타 옆 이름 (기존 아바타 로직에서 사용)
        fontSize: 12,
        color: '#666',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    senderNameInBubble: { // 버블 위 이름 (파티 채팅용)
        fontSize: 12,
        color: '#666',
        marginBottom: 3,
        fontWeight: 'bold',
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