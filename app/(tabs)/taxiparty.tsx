// app/(tabs)/taxiparty.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
// ✨ 필요한 기능들 임포트 추가
import { getAuth } from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert, // Alert 임포트 추가
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Firebase 설정 파일 임포트 추가
import { db } from '../../firebaseConfig';


// --- 파티 데이터 타입 정의 추가 ---
interface TaxiParty {
    id: string;
    departureTime: string;
    pickupLocation: string;
    dropoffLocation: string;
    memberLimit: number;
    currentMembers: string[];
    creatorId: string; // ✨ 파티 생성자 ID 필드 추가
}
// --- 여기까지 추가 ---

export default function TaxiPartyScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // --- 상태 변수 추가: 파티 목록 및 로딩 상태 ---
    const [parties, setParties] = useState<TaxiParty[]>([]);
    const [loading, setLoading] = useState(true);
    
    // ✨ 현재 로그인된 사용자 정보를 가져오기
    const auth = getAuth();
    const user = auth.currentUser;


    // --- useEffect 추가: Firestore에서 실시간으로 파티 목록 가져오기 ---
    useEffect(() => {
        // 'taxiParties' 컬렉션을 'createdAt' 필드 기준으로 내림차순 정렬하여 쿼리
        const q = query(collection(db, "taxiParties"), orderBy("createdAt", "desc"));
        
        // onSnapshot으로 실시간 변경 감지
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const partiesData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as TaxiParty[];
            
            setParties(partiesData); // 상태 업데이트
            setLoading(false); // 로딩 완료
        });

        // 컴포넌트가 사라질 때 리스너 정리
        return () => unsubscribe();
    }, []);
    // --- 여기까지 추가 ---


    // (기존 코드)
    const handleCreateParty = () => {
        router.push('/(tabs)/create-party');
    };

    // ✨ --- 파티 삭제 함수 추가 ---
    const handleDeleteParty = (partyId: string) => {
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
                            // Firestore에서 해당 ID의 문서를 삭제
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
    // --- 여기까지 추가 ---

    // --- 파티 목록 아이템을 렌더링하는 함수 추가 ---
    const renderPartyItem = ({ item }: { item: TaxiParty }) => (
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

            {/* ✨ --- 버튼 UI 수정: 삭제 버튼을 위에 작게 추가 --- */}
            {/* 내가 만든 파티인 경우 '삭제하기' 버튼을 위에 작게 표시 */}
            {user && user.uid === item.creatorId && (
                <TouchableOpacity
                    style={styles.smallDeleteButton}
                    onPress={() => handleDeleteParty(item.id)}
                >
                    <Text style={styles.smallDeleteButtonText}>삭제하기</Text>
                </TouchableOpacity>
            )}

            {/* '참여하기' 버튼은 항상 표시 */}
            <TouchableOpacity style={styles.joinButton}>
                <Text style={styles.joinButtonText}>참여하기</Text>
            </TouchableOpacity>
            {/* --- 여기까지 수정 --- */}
        </View>
    );
    // --- 여기까지 추가 ---

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <Text style={styles.header}>택시 파티</Text>
            <Text style={styles.subHeader}>같이 택시를 탈 사람을 찾아보세요!</Text>
            
            <TouchableOpacity 
                style={styles.createButton} 
                onPress={handleCreateParty}
            >
                <Text style={styles.createButtonText}>택시파티+</Text>
            </TouchableOpacity>
            
            {/* --- 기존 content View를 FlatList와 조건부 렌더링으로 변경 --- */}
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
            {/* --- 여기까지 변경 --- */}
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
    createButton: {
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
    createButtonText: {
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
    // --- 스타일 추가 ---
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
        backgroundColor: '#e8f0fe',
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 5, // ✨ smallDeleteButton 과의 간격을 위해 marginTop 조정
    },
    joinButtonText: {
        color: '#0062ffff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // ✨ --- 작은 삭제 버튼 스타일 추가 및 기존 삭제 버튼 스타일 제거 ---
    smallDeleteButton: {
        alignSelf: 'flex-end', // 오른쪽 정렬
        marginTop: -5, // 위치 조정을 위한 마진
        padding: 5,
    },
    smallDeleteButtonText: {
        fontSize: 12,
        color: '#d32f2f', // 진한 빨간색 텍스트
    },
    // --- 여기까지 추가 ---
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
    // --- 여기까지 추가 ---
});

