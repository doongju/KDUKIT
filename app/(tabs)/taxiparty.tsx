// app/(tabs)/taxiparty.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';


// --- 파티 데이터 타입 정의 ---
interface TaxiParty {
    id: string;
    departureTime: string;
    pickupLocation: string;
    dropoffLocation: string;
    memberLimit: number;
    currentMembers: string[];
    creatorId: string;
    createdAt: any; // Firestore Timestamp 타입이므로, 실제 데이터에는 `serverTimestamp()`로 저장될 것
}

export default function TaxiPartyScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const auth = getAuth();
    const user = auth.currentUser;

    // ✨ 디버깅용 로그: 현재 로그인된 사용자 정보 확인
    useEffect(() => {
        console.log("[DEBUG-taxiparty-AUTH] User object:", user);
        if (user) {
            console.log("[DEBUG-taxiparty-AUTH] User UID:", user.uid);
            console.log("[DEBUG-taxiparty-AUTH] User email:", user.email);
        } else {
            console.log("[DEBUG-taxiparty-AUTH] No user is logged in.");
        }
    }, [user]); 


    const [parties, setParties] = useState<TaxiParty[]>([]);
    const [loading, setLoading] = useState(true);
    
    // 파티 목록 실시간 감지
    useEffect(() => {
        // createdAt 필드를 기준으로 최신 파티가 먼저 보이도록 정렬
        const q = query(collection(db, "taxiParties"), orderBy("createdAt", "desc"));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const partiesData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as TaxiParty[];
            
            setParties(partiesData);
            setLoading(false);
        });

        // 컴포넌트 언마운트 시 구독 해제
        return () => unsubscribe();
    }, []);


    // 파티 생성 화면으로 이동
    const handleCreateParty = () => {
        router.push('/(tabs)/create-party');
    };

    // 파티 삭제 처리
    const handleDeleteParty = (partyId: string, creatorId: string) => {
        if (!user || user.uid !== creatorId) {
            Alert.alert("권한 없음", "이 파티를 삭제할 권한이 없습니다.");
            return;
        }

        Alert.alert(
            "파티 삭제",
            "정말로 이 파티를 삭제하시겠습니까?",
            [
                {
                    text: "취소",
                    style: "cancel"
                },
                {
                    text: "삭제",
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, "taxiParties", partyId));
                            Alert.alert("삭제 완료", "파티가 성공적으로 삭제되었습니다.");
                        } catch (error) {
                            console.error("파티 삭제 오류: ", error);
                            Alert.alert("오류", "파티를 삭제하는 중 오류가 발생했습니다.");
                        }
                    },
                    style: "destructive"
                }
            ]
        );
    };

    // ✨ --- 파티 참여 및 채팅방 연결 함수 ---
    const handleJoinParty = async (party: TaxiParty) => {
        // 로그인 여부 확인
        if (!user) {
            Alert.alert("로그인 필요", "파티에 참여하려면 로그인이 필요합니다.");
            router.replace('/(auth)/login');
            return;
        }

        console.log("[DEBUG-taxiparty] handleJoinParty called for partyId:", party.id);
        console.log("[DEBUG-taxiparty] Current User UID:", user.uid);

        // 이미 참여 중인 파티인지 확인
        if (party.currentMembers.includes(user.uid)) {
            console.log("[DEBUG-taxiparty] User is already a member. Navigating to chat.");
            Alert.alert("이미 참여 중", "이미 이 파티에 참여하고 있습니다. 채팅방으로 이동합니다.");
            // 이미 참여 중이면 바로 채팅방으로 이동
            await navigateToPartyChat(party.id, party.pickupLocation, party.dropoffLocation);
            return;
        }

        // 인원 제한 확인
        if (party.currentMembers.length >= party.memberLimit) {
            console.log("[DEBUG-taxiparty] Party is full.");
            Alert.alert("인원 초과", "이 파티는 이미 모집 인원이 가득 찼습니다.");
            return;
        }

        Alert.alert(
            "파티 참여",
            `'${party.pickupLocation}'에서 '${party.dropoffLocation}'으로 가는 파티에 참여하시겠습니까?`,
            [
                { text: "취소", style: "cancel" },
                { 
                    text: "참여", 
                    onPress: async () => {
                        try {
                            const partyRef = doc(db, "taxiParties", party.id);
                            // 1. taxiParties 문서 업데이트 (currentMembers에 현재 사용자 UID 추가)
                            await updateDoc(partyRef, {
                                currentMembers: arrayUnion(user.uid)
                            });
                            console.log("[DEBUG-taxiparty] taxiParties document updated successfully for partyId:", party.id);
                            Alert.alert("참여 완료", "파티에 성공적으로 참여했습니다!");
                            
                            // 2. 채팅방 생성 또는 업데이트 후 이동
                            await navigateToPartyChat(party.id, party.pickupLocation, party.dropoffLocation);

                        } catch (error: any) { 
                            console.error("[DEBUG-taxiparty] Error joining taxi party:", error.code, error.message);
                            Alert.alert("참여 실패", `파티 참여에 실패했습니다: ${error.message}`);
                        }
                    } 
                }
            ]
        );
    };

    // ✨ 파티 채팅방으로 이동하는 함수 (생성 또는 조회/업데이트) - 파티 생성자와 참여자 모두 추가
    const navigateToPartyChat = async (partyId: string, pickupLocation: string, dropoffLocation: string) => {
        if (!user) {
            console.warn("[DEBUG-taxiparty] navigateToPartyChat called without a user.");
            Alert.alert("로그인 필요", "채팅방에 접근하려면 로그인이 필요합니다.");
            router.replace('/(auth)/login');
            return;
        }

        const chatRoomId = `party-${partyId}`;
        const chatRoomRef = doc(db, "chatRooms", chatRoomId);
        
        console.log(`[DEBUG-taxiparty] Checking chatRoom ${chatRoomId}`);

        try {
            // 🚨 파티 데이터를 다시 가져와서 creatorId를 얻습니다. (중요)
            const partyRef = doc(db, "taxiParties", partyId);
            const partySnap = await getDoc(partyRef);
            
            if (!partySnap.exists()) {
                Alert.alert("오류", "해당 파티를 찾을 수 없습니다.");
                return;
            }
            const partyData = partySnap.data() as TaxiParty;
            const creatorId = partyData.creatorId; // 파티 생성자의 UID

            // 채팅방 멤버 목록에 현재 사용자(참여자)와 파티 생성자를 모두 추가합니다.
            // Set을 사용하여 중복을 자동으로 제거합니다 (ex: 생성자가 본인 파티에 참여하는 경우).
            const initialMembers = [user.uid, creatorId];
            const uniqueMembers = Array.from(new Set(initialMembers)); // 중복 제거된 멤버 목록

            // `setDoc` with `merge: true`를 사용하여 문서가 없으면 생성하고, 있으면 지정된 필드를 병합 업데이트합니다.
            await setDoc(chatRoomRef, {
                name: `${pickupLocation} - ${dropoffLocation} 파티 채팅`,
                members: arrayUnion(...uniqueMembers), // arrayUnion 사용하여 기존 멤버와 새 멤버를 중복 없이 추가
                partyId: partyId,
                type: 'party',
                createdAt: serverTimestamp(), // 문서 생성 시점 타임스탬프 (최초 생성 시에만 유효)
                lastMessage: '',
                lastMessageTimestamp: null,
                // `lastReadBy` 필드를 초기화하여 모든 멤버가 메시지 읽음 상태를 추적할 수 있도록 합니다.
                lastReadBy: uniqueMembers.reduce((acc, memberId) => ({ ...acc, [memberId]: serverTimestamp() }), {})
            }, { merge: true }); // 이 옵션 덕분에 `chatRoomSnap.exists()` 확인 로직이 필요 없어짐

            console.log(`[DEBUG-taxiparty] chatRoom ${chatRoomId} created or updated successfully with members:`, uniqueMembers);
            
            // 채팅방 화면으로 이동합니다. (Expo Router의 경로)
            router.push(`/chat/${chatRoomId}`); 

        } catch (error: any) {
            console.error("[DEBUG-taxiparty] Error in navigateToPartyChat (creating/updating chat room):", error.code, error.message);
            Alert.alert("채팅방 오류", `채팅방 생성/접근에 실패했습니다: ${error.message}`);
        }
    };
    // --- ✨ 여기까지 최종 수정된 함수 ---

    // 파티 아이템 렌더링 함수
    const renderPartyItem = ({ item }: { item: TaxiParty }) => {
        const isCreator = user && user.uid === item.creatorId;
        const isMember = user && item.currentMembers.includes(user.uid);
        const isFull = item.currentMembers.length >= item.memberLimit;

        return (
            <View style={styles.partyItem}>
                <View style={styles.partyHeader}>
                    <Text style={styles.partyTime}>{item.departureTime} 출발</Text>
                    <View style={styles.partyMembers}>
                        <Ionicons name="person" size={16} color="#fff" />
                        <Text style={styles.partyMembersText}>
                            {item.currentMembers.length} / {item.memberLimit}
                        </Text>
                    </View>
                </View>
                <View style={styles.locationContainer}>
                    <Text style={styles.locationLabel}>출발</Text>
                    <Text style={styles.locationText} numberOfLines={1}>{item.pickupLocation}</Text>
                </View>
                <View style={styles.locationContainer}>
                    <Text style={styles.locationLabel}>도착</Text>
                    <Text style={styles.locationText} numberOfLines={1}>{item.dropoffLocation}</Text>
                </View>

                {isCreator ? (
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteParty(item.id, item.creatorId)}
                    >
                        <Text style={styles.deleteButtonText}>파티 삭제하기</Text>
                    </TouchableOpacity>
                ) : isMember ? (
                    <TouchableOpacity 
                        style={styles.chatButton}
                        onPress={() => navigateToPartyChat(item.id, item.pickupLocation, item.dropoffLocation)}
                    >
                        <Text style={styles.chatButtonText}>채팅방으로 이동</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity 
                        style={[styles.joinButton, isFull && styles.disabledButton]} 
                        onPress={() => handleJoinParty(item)} // 전체 party 객체를 전달
                        disabled={isFull}
                    >
                        <Text style={styles.joinButtonText}>{isFull ? '모집 완료' : '참여하기'}</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <Text style={styles.header}>택시 파티</Text>
            <Text style={styles.subHeader}>같이 택시를 탈 사람을 찾아보세요!</Text>
            
            <TouchableOpacity 
                style={styles.createPartyButton}
                onPress={handleCreateParty}
            >
                <Text style={styles.createPartyButtonText}>택시파티+</Text>
            </TouchableOpacity>
            
            {loading ? (
                <ActivityIndicator style={{ flex: 1 }} size="large" color="#0062ffff" />
            ) : (
                <FlatList
                    data={parties}
                    renderItem={renderPartyItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContentContainer}
                    ListEmptyComponent={
                        <View style={styles.content}>
                            <Text style={styles.emptyText}>아직 생성된 파티가 없어요.</Text>
                            <Text style={styles.emptySubText}>새로운 파티를 만들어보세요!</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        fontSize: 28,
        fontWeight: 'bold',
        paddingHorizontal: 20,
        marginBottom: 10,
        color: '#0062ffff',
    },
    subHeader: {
        fontSize: 16,
        paddingHorizontal: 20,
        marginBottom: 20,
        color: '#777',
    },
    createPartyButton: {
        backgroundColor: '#0062ffff',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        alignSelf: 'flex-end',
        marginRight: 20,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 4,
    },
    createPartyButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    listContentContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    partyItem: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 15,
        marginBottom: 15,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    partyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    partyTime: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    partyMembers: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0062ffff',
        borderRadius: 15,
        paddingVertical: 5,
        paddingHorizontal: 10,
    },
    partyMembersText: {
        color: '#fff',
        fontWeight: 'bold',
        marginLeft: 5,
    },
    locationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    locationLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#888',
        width: 40,
    },
    locationText: {
        fontSize: 15,
        color: '#444',
        flex: 1,
    },
    joinButton: {
        backgroundColor: '#0062ffff',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    joinButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    chatButton: {
        backgroundColor: '#28a745',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    chatButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    deleteButton: {
        backgroundColor: '#dc3545',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    deleteButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    disabledButton: {
        backgroundColor: '#cccccc',
    },
    emptyText: {
        fontSize: 16,
        color: '#888',
        fontWeight: 'bold',
    },
    emptySubText: {
        fontSize: 14,
        color: '#aaa',
        marginTop: 8,
    }
});