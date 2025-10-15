// app/(tabs)/create-party.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
//  Firestore 연동을 위한 임포트 추가
import { getAuth } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import React, { useState } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Firebase 설정 파일 임포트 추가
import { db } from '../../firebaseConfig';

// (기존 코드는 변경 없음)
// 사용 가능한 장소 목록
const AVAILABLE_LOCATIONS = [
    '기타 (직접 입력)', // 직접 입력 옵션
    '학교 정문', 
    '기숙사 앞', 
    '양주역', 
    '덕계역', 
    
];

// 최대 인원 설정
const MAX_MEMBERS = 4;
const memberOptions = Array.from({ length: MAX_MEMBERS }, (_, i) => i + 1);

// 9시부터 24시까지 30분 단위 시간 옵션 생성
const generateTimeOptions = () => {
    const options = [];
    for (let i = 0; i <= 31; i++) { // 9:00 (i=0) 부터 24:00 (i=30)
        const totalMinutes = 9 * 60 + i * 30;
        const hour = Math.floor(totalMinutes / 60) % 24;
        const minute = totalMinutes % 60;
        const hourStr = hour < 10 ? `0${hour}` : `${hour}`;
        const minuteStr = minute < 10 ? `0${minute}` : `${minute}`;
        options.push(`${hourStr}:${minuteStr}`);
    }
    return options;
};
const timeOptions = generateTimeOptions();


export default function CreatePartyScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // 폼 상태 (기존 코드)
    const [departureTime, setDepartureTime] = useState('09:00'); 
    const [pickupLocation, setPickupLocation] = useState(AVAILABLE_LOCATIONS[1]); 
    const [dropoffLocation, setDropoffLocation] = useState(AVAILABLE_LOCATIONS[3]); 
    const [memberLimit, setMemberLimit] = useState(2); 
    const [customPickup, setCustomPickup] = useState(''); 
    const [customDropoff, setCustomDropoff] = useState(''); 

    // 모달 관련 상태 (기존 코드)
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [modalType, setModalType] = useState<'time' | 'pickup' | 'dropoff' | 'members' | null>(null);

    const openModal = (type: typeof modalType) => {
        setModalType(type);
        setIsModalVisible(true);
    };

    const closeModal = () => {
        setIsModalVisible(false);
        setModalType(null);
    };

    // 폼 제출 핸들러 (기존 코드)
    const handleCreateParty = async () => { // async 추가
        // --- Firestore 저장을 위한 코드 추가 ---
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
            Alert.alert("로그인 필요", "택시 파티를 생성하려면 로그인이 필요합니다.");
            return;
        }
        // --- 여기까지 추가 ---

        let finalPickup = pickupLocation === '기타 (직접 입력)' ? customPickup : pickupLocation;
        let finalDropoff = dropoffLocation === '기타 (직접 입력)' ? customDropoff : dropoffLocation;

        if (!finalPickup.trim() || !finalDropoff.trim()) {
            Alert.alert('필수 정보 누락', '탑승 장소와 하차 장소를 모두 선택하거나 입력해주세요.');
            return;
        }
        if (pickupLocation === '기타 (직접 입력)' && !customPickup.trim()) {
            Alert.alert('필수 정보 누락', '탑승 장소를 직접 입력해주세요.');
            return;
        }
        if (dropoffLocation === '기타 (직접 입력)' && !customDropoff.trim()) {
            Alert.alert('필수 정보 누락', '하차 장소를 직접 입력해주세요.');
            return;
        }

        const partyDetails = {
            departureTime,
            pickupLocation: finalPickup,
            dropoffLocation: finalDropoff,
            memberLimit,
            // --- Firestore 저장을 위한 데이터 추가 ---
            currentMembers: [user.uid], // 생성자를 첫 멤버로 자동 추가
            creatorId: user.uid,
            createdAt: serverTimestamp(), // 서버 시간 기준 생성 시각 기록
            // --- 여기까지 추가 ---
        };
        
        // --- 기존 Alert 로직을 Firestore 저장 로직으로 변경 ---
        try {
            // 'taxiParties' 컬렉션에 새로운 파티 정보(문서)를 추가합니다.
            await addDoc(collection(db, "taxiParties"), partyDetails);
            
            Alert.alert('파티 생성 완료', '새로운 택시 파티가 생성되었습니다!');
            
            // ✨ 화면 이동 로직 수정 ✨
            // 이전 화면으로 돌아가는 대신, 택시 파티 목록 화면으로 교체하며 이동합니다.
            router.replace('/(tabs)/taxiparty'); 

        } catch (error) {
            console.error("파티 생성 중 오류 발생: ", error);
            Alert.alert("오류", "파티 생성에 실패했습니다. 다시 시도해주세요.");
        }
        // --- 여기까지 변경 ---
    };
    
    // (이하 나머지 코드는 변경 없음)
    // Custom Selection Modal Component
    const SelectionModal = () => {
        let options: string[] = [];
        let title = '';
        let currentValue: string | number = '';
        let setter: ((value: string) => void) | null = null;
    
        if (modalType === 'time') {
            options = timeOptions;
            title = '⏰ 출발 시간 선택 (30분 단위)';
            currentValue = departureTime;
            setter = (value) => setDepartureTime(value);
        } else if (modalType === 'pickup') {
            options = AVAILABLE_LOCATIONS;
            title = '📍 탑승 장소 선택';
            currentValue = pickupLocation;
            setter = (value) => setPickupLocation(value);
        } else if (modalType === 'dropoff') {
            options = AVAILABLE_LOCATIONS;
            title = '🏁 하차 장소 선택';
            currentValue = dropoffLocation;
            setter = (value) => setDropoffLocation(value);
        } else if (modalType === 'members') {
            options = memberOptions.map(m => `${m} 명`);
            title = '👥 모집 인원 선택';
            currentValue = `${memberLimit} 명`;
            setter = (value) => setMemberLimit(Number(String(value).replace(' 명', '')));
        }
    
        const handleSelect = (value: string) => {
            if (setter) {
                setter(value);
            }
            closeModal();
        };

        if (!isModalVisible || !modalType) return null;
    
        return (
            <View style={modalStyles.overlay}>
                <View style={modalStyles.modalContainer}>
                    <View style={modalStyles.header}>
                        <Text style={modalStyles.title}>{title}</Text>
                        <TouchableOpacity onPress={closeModal} style={modalStyles.closeButton}>
                            <Ionicons name="close" size={28} color="#999" />
                        </TouchableOpacity>
                    </View>
                    
                    <ScrollView style={modalStyles.scrollView}>
                        {options.map((option, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    modalStyles.optionItem,
                                    option === currentValue && modalStyles.selectedOption,
                                ]}
                                onPress={() => handleSelect(option)}
                            >
                                <Text 
                                    style={[
                                        modalStyles.optionText,
                                        option === currentValue && modalStyles.selectedText,
                                    ]}
                                >
                                    {option}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </View>
        );
    };


    // 현재 선택된 값을 표시하는 컴포넌트
    const SelectedValueDisplay = ({ value, onPress }: { value: string | number, onPress: () => void }) => (
        <TouchableOpacity style={styles.pickerWrapper} onPress={onPress}>
            <Text style={styles.selectedValue}>{value}{modalType === 'members' ? ' 명' : ''}</Text>
            <Ionicons name="chevron-down" size={20} color="#0062ffff" />
        </TouchableOpacity>
    );

    return (
        <View style={styles.outerContainer}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.headerBar}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={28} color="#0062ffff" />
                    </TouchableOpacity>
                    <Text style={styles.header}>새 파티 만들기</Text>
                </View>

                {/* ScrollView */}
                <ScrollView 
                    style={styles.scrollView} 
                    contentContainerStyle={styles.scrollContent}
                >
                    
                    {/* 출발 시간 설정 */}
                    <Text style={styles.label}>⏰ 출발 시간</Text>
                    <SelectedValueDisplay 
                        value={departureTime} 
                        onPress={() => openModal('time')} 
                    />

                    {/* 탑승 장소 설정 */}
                    <Text style={styles.label}>📍 탑승 장소</Text>
                    <SelectedValueDisplay 
                        value={pickupLocation} 
                        onPress={() => openModal('pickup')} 
                    />
                    {pickupLocation === '기타 (직접 입력)' && (
                        <TextInput
                            placeholder="탑승 장소를 직접 입력해주세요 (예: 후문 CU)"
                            value={customPickup}
                            onChangeText={setCustomPickup}
                            style={styles.customInput}
                        />
                    )}
                    
                    {/* 하차 장소 설정 */}
                    <Text style={styles.label}>🏁 하차 장소</Text>
                    <SelectedValueDisplay 
                        value={dropoffLocation} 
                        onPress={() => openModal('dropoff')} 
                    />
                    {dropoffLocation === '기타 (직접 입력)' && (
                        <TextInput
                            placeholder="하차 장소를 직접 입력해주세요 (예: 불당동 스타벅스)"
                            value={customDropoff}
                            onChangeText={setCustomDropoff}
                            style={styles.customInput}
                        />
                    )}

                    {/* 모집 인원 설정 */}
                    <Text style={styles.label}>👥 모집 인원 (운전자 제외)</Text>
                    <SelectedValueDisplay 
                        value={memberLimit} 
                        onPress={() => openModal('members')} 
                    />

                    {/* 파티 생성 버튼 */}
                    <TouchableOpacity style={styles.createButton} onPress={handleCreateParty}>
                        <Text style={styles.createButtonText}>파티 생성하기</Text>
                    </TouchableOpacity>

                </ScrollView>
            </View>
            {/* 모달 렌더링 */}
            <SelectionModal />
        </View>
    );
}

const styles = StyleSheet.create({
    outerContainer: {
        flex: 1, // 모달을 오버레이하기 위해 최상위 컨테이너 추가
    },
    container: {
        flex: 1, 
        backgroundColor: '#fff',
    },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    backButton: {
        padding: 10,
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginLeft: 10,
        color: '#0062ffff',
    },
    scrollView: {
        flex: 1, 
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginTop: 15,
        marginBottom: 8,
    },
    // Picker 대체 UI (TouchableOpacity)
    pickerWrapper: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        paddingHorizontal: 15,
        paddingVertical: 12,
        marginBottom: 10,
        backgroundColor: '#f9f9f9',
    },
    selectedValue: {
        fontSize: 16,
        fontWeight: '500',
        color: '#333',
    },
    customInput: {
        borderWidth: 1,
        borderColor: '#0062ffff',
        borderRadius: 8,
        padding: 15,
        marginBottom: 20,
        backgroundColor: '#e8f0fe',
        fontSize: 16,
    },
    createButton: {
        backgroundColor: '#0062ffff',
        paddingVertical: 18,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 30,
        elevation: 5,
    },
    createButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

// Custom Modal Styles
const modalStyles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
        alignItems: 'center',
        zIndex: 100, // 최상위
    },
    modalContainer: {
        width: '100%',
        maxHeight: '60%', // 화면의 60%만 차지
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 10, // 스크롤바가 바닥에 붙지 않도록
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    closeButton: {
        padding: 5,
    },
    scrollView: {
        paddingHorizontal: 20,
        maxHeight: 300, 
    },
    optionItem: {
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        alignItems: 'center',
    },
    optionText: {
        fontSize: 17,
        color: '#333',
    },
    selectedOption: {
        backgroundColor: '#e8f0fe',
        borderRadius: 8,
    },
    selectedText: {
        color: '#0062ffff',
        fontWeight: 'bold',
    },
});
