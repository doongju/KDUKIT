// app/(tabs)/chatlist.tsx

import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../../firebaseConfig';

// 채팅방 목록 아이템 타입 정의
interface ChatRoom {
    id: string;
    users: string[];
    lastMessage: string;
    timestamp: Date;
    otherUserName: string;
}

const ChatRoomsScreen: React.FC = () => {
    const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    
    const auth = getAuth();
    const user = auth.currentUser;

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        const chatRoomsRef = collection(db, 'chats');
        const q = query(chatRoomsRef, where('users', 'array-contains', user.uid), orderBy('timestamp', 'desc'));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            setLoading(true);
            const userFetchPromises = snapshot.docs.map(async (docRef) => {
                const roomData = docRef.data();
                const otherUid = roomData.users.find((uid: string) => uid !== user.uid);
                
                let otherUserName = "알 수 없는 사용자";
                
                if (otherUid) {
                    const userDoc = await getDoc(doc(db, 'users', otherUid));
                    if (userDoc.exists()) {
                        otherUserName = userDoc.data()?.name || "익명";
                    }
                }

                return {
                    id: docRef.id,
                    users: roomData.users,
                    lastMessage: roomData.lastMessage || "대화 내용 없음",
                    timestamp: roomData.timestamp?.toDate() || new Date(),
                    otherUserName: otherUserName,
                } as ChatRoom;
            });

            try {
                const roomsWithNames = await Promise.all(userFetchPromises);
                setChatRooms(roomsWithNames);
            } catch (e) {
                console.error("채팅방 이름 조회 중 오류 발생:", e);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0062ffff" />
            </View>
        );
    }
    
    const renderItem = ({ item }: { item: ChatRoom }) => (
        <TouchableOpacity 
            style={styles.roomItem}
            // ⚠️ 경로 수정: /chat/[id]는 app/chat/[id].tsx 파일을 가리킵니다.
            onPress={() => router.push({ 
                pathname: '/chat/[id]', 
                params: { id: item.id } 
            })}
        >
            <View style={styles.avatar} />
            <View style={styles.textContainer}>
                <Text style={styles.nameText}>{item.otherUserName}</Text>
                <Text style={styles.messageText}>{item.lastMessage}</Text>
            </View>
            <Text style={styles.timeText}>
                {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.header}>채팅</Text>
            {chatRooms.length === 0 ? (
                <Text style={styles.noChats}>아직 활성화된 채팅방이 없습니다.</Text>
            ) : (
                <FlatList
                    data={chatRooms}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                />
            )}
        </View>
    );
};

export default ChatRoomsScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        paddingTop: 40,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    header: {
        fontSize: 32,
        fontWeight: 'bold',
        paddingHorizontal: 20,
        marginBottom: 15,
        color: '#0062ffff',
    },
    noChats: {
        textAlign: 'center',
        marginTop: 50,
        fontSize: 16,
        color: '#777',
    },
    roomItem: {
        flexDirection: 'row',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#ccc',
        marginRight: 15,
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    nameText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    messageText: {
        fontSize: 14,
        color: '#666',
    },
    timeText: {
        fontSize: 12,
        color: '#aaa',
    },
});