// app/chatlist.tsx 파일
import { router, useNavigation } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AlertButton, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'; // AlertButton 추가
import { auth, db } from '../../firebaseConfig'; // db와 auth 인스턴스를 가져옵니다.


interface ChatRoom {
  id: string;
  lastMessage: string;
  timestamp: Date;
  otherUserName: string;
}

const ChatListScreen: React.FC = () => {
  const navigation = useNavigation();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedInUser, setLoggedInUser] = useState<any | null>(undefined); // undefined: 로딩 중, null: 로그아웃, User: 로그인됨

  // ------------------------------------------------------------------
  // Auth 상태 리스너: 앱 시작 시 한 번만 실행하여 로그인 상태를 추적
  // ------------------------------------------------------------------
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setLoggedInUser(user); // 로그인 상태 업데이트
      if (user) {
        console.log("DEBUG: ChatListScreen - Auth State Changed. Logged In User UID:", user.uid);
      } else {
        console.log("DEBUG: ChatListScreen - Auth State Changed. User is Logged Out.");
      }
    });

    return () => unsubscribeAuth(); // 컴포넌트 언마운트 시 리스너 해제
  }, []); // 의존성 배열을 비워 앱 시작 시 한 번만 실행되도록 함

  // ------------------------------------------------------------------
  // 채팅방 목록 로드: loggedInUser 상태가 변경될 때마다 실행
  // ------------------------------------------------------------------
  useEffect(() => {
    // loggedInUser가 아직 undefined (로딩 중) 이면 아무것도 하지 않음
    if (loggedInUser === undefined) {
      return; 
    }

    // loggedInUser가 null (로그아웃 상태) 이면 로딩 완료 처리하고 리턴
    if (loggedInUser === null) {
      setChatRooms([]); // 채팅방 목록 비우기
      setLoading(false);
      return;
    }

    // 로그인된 사용자 (loggedInUser가 User 객체)
    setLoading(true); // 채팅방 로딩 시작

    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('users', 'array-contains', loggedInUser.uid), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const loadedChatRooms: ChatRoom[] = [];
      for (const docSnap of snapshot.docs) {
        const roomData = docSnap.data();
        const otherUid = roomData.users.find((uid: string) => uid !== loggedInUser.uid); // 다른 사용자 UID 찾기

        let otherUserName = "알 수 없는 사용자";
        if (otherUid) {
          const userDoc = await getDoc(doc(db, 'users', otherUid));
          if (userDoc.exists()) {
            otherUserName = userDoc.data()?.name || "익명";
          } else {
            console.warn(`WARN: User document not found for otherUid: ${otherUid} in chat room ${docSnap.id}`);
          }
        } else {
             console.warn(`WARN: Could not find 'otherUid' in chat room ${docSnap.id} for user ${loggedInUser.uid}. Is 'users' array correctly populated with two UIDs?`);
        }
        
        loadedChatRooms.push({
          id: docSnap.id,
          lastMessage: roomData.lastMessage || "대화 내용 없음",
          timestamp: roomData.timestamp?.toDate() || new Date(),
          otherUserName: otherUserName,
        });
      }
      setChatRooms(loadedChatRooms);
      setLoading(false);
    }, (error) => {
      console.error("ERROR: Failed to fetch chat rooms:", error);
      Alert.alert("채팅 목록 오류", `채팅방 목록을 불러오는데 실패했습니다: ${error.message}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loggedInUser]); // 로그인 상태 (loggedInUser)가 변경될 때마다 이펙트 재실행

  const generateRandomUid = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  const createTestChatRoom = async () => {
    if (!loggedInUser) {
      Alert.alert('로그인 필요', '테스트 채팅방을 만들려면 먼저 로그인해야 합니다.');
      return;
    }

    const testOtherUserUid = generateRandomUid(); 
    const chatRoomUsers = [loggedInUser.uid, testOtherUserUid].sort(); 
    const chatRoomId = chatRoomUsers.join('_'); 

    try {
      const otherUserDocRef = doc(db, 'users', testOtherUserUid);
      await setDoc(otherUserDocRef, { name: '테스트상대', email: `${testOtherUserUid}@test.com` }, { merge: true }); 

      const newChatRoomRef = doc(db, 'chats', chatRoomId);
      await setDoc(newChatRoomRef, {
        users: chatRoomUsers,
        lastMessage: '새로운 테스트 채팅방이 생성되었습니다.',
        timestamp: serverTimestamp(),
        lastReadBy: {
          [loggedInUser.uid]: serverTimestamp(), 
          [testOtherUserUid]: serverTimestamp(), 
        },
      });
      
      Alert.alert('성공', `테스트 채팅방 '${chatRoomId}'이(가) 생성되었습니다.`);
      router.push(`/chat/${chatRoomId}`);

    } catch (e: any) {
      console.error("Error creating test chat room:", e);
      Alert.alert('오류', `테스트 채팅방 생성 실패: ${e.message}`);
    }
  };

  const goToSpecificChatRoom = () => {
    Alert.prompt(
      '채팅방 ID 입력',
      '접속할 채팅방의 정확한 ID를 입력하세요 (예: UID1_UID2):',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '이동',
          // ✨ AlertButton의 onPress 타입으로 단언
          onPress: ((inputChatId: string) => { 
            if (inputChatId && inputChatId.trim() !== '') {
              router.push(`/chat/${inputChatId.trim()}`);
            } else {
              Alert.alert('오류', '채팅방 ID를 입력해주세요.');
            }
          }) as AlertButton['onPress'], // ✨ as AlertButton['onPress']
        },
      ],
      'plain-text'
    );
  };
  
  if (loading || loggedInUser === undefined) {
    return <ActivityIndicator style={styles.loading} size="large" color="#0062ffff" />;
  }

  if (loggedInUser === null) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.noChatsText}>로그인 후 채팅 목록을 볼 수 있습니다.</Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/')}>
          <Text style={styles.loginButtonText}>로그인 화면으로 이동</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.testButtonsContainer}>
        <TouchableOpacity style={styles.testButton} onPress={createTestChatRoom}>
          <Text style={styles.testButtonText}>테스트 채팅방 생성</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.testButton} onPress={goToSpecificChatRoom}>
          <Text style={styles.testButtonText}>ID로 채팅방 이동</Text>
        </TouchableOpacity>
      </View>

      {chatRooms.length === 0 ? (
        <View style={styles.centeredContainer}>
          <Text style={styles.noChatsText}>아직 채팅방이 없습니다.</Text>
          <Text style={styles.noChatsSubText}>위 버튼으로 테스트 채팅방을 만들어보세요!</Text>
        </View>
      ) : (
        <FlatList
          data={chatRooms}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.chatItem}
              onPress={() => router.push(`/chat/${item.id}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.otherUserName.charAt(0)}</Text>
              </View>
              <View style={styles.chatContent}>
                <Text style={styles.chatTitle}>{item.otherUserName}</Text>
                <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
              </View>
              <Text style={styles.timestamp}>
                {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

export default ChatListScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f2f5' },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    noChatsText: { fontSize: 18, color: '#666', marginBottom: 10, fontWeight: 'bold' },
    noChatsSubText: { fontSize: 14, color: '#888', marginBottom: 20, textAlign: 'center' },
    loginButton: { backgroundColor: '#007bff', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5 },
    loginButtonText: { color: 'white', fontSize: 16 },
    chatItem: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0062ffff', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    avatarText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    chatContent: { flex: 1, justifyContent: 'center' },
    chatTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
    lastMessage: { fontSize: 14, color: '#777', marginTop: 2 },
    timestamp: { fontSize: 12, color: '#999' },
    testButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', backgroundColor: '#fff' },
    testButton: { backgroundColor: '#28a745', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, marginHorizontal: 5 },
    testButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
});