// app/(tabs)/create-party.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
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
import { db } from '../../firebaseConfig';

const AVAILABLE_LOCATIONS = [
    '기타 (직접 입력)', 
    '학교 정문', 
    '기숙사 앞', 
    '양주역', 
    '덕계역', 
];

const MAX_MEMBERS = 4;
const memberOptions = Array.from({ length: MAX_MEMBERS }, (_, i) => i + 1);

const generateTimeOptions = () => {
    const options = [];
    for (let i = 0; i <= 31; i++) { // 9:00 ~ 24:00
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

    const [departureTime, setDepartureTime] = useState('09:00'); 
    const [pickupLocation, setPickupLocation] = useState(AVAILABLE_LOCATIONS[1]); 
    const [dropoffLocation, setDropoffLocation] = useState(AVAILABLE_LOCATIONS[3]); 
    const [memberLimit, setMemberLimit] = useState(2); 
    const [customPickup, setCustomPickup] = useState(''); 
    const [customDropoff, setCustomDropoff] = useState(''); 

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

    const handleCreateParty = async () => {
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
            Alert.alert("로그인 필요", "택시 파티를 생성하려면 로그인이 필요합니다.");
            return;
        }

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
            currentMembers: [user.uid], 
            creatorId: user.uid,
            createdAt: serverTimestamp(),
        };
        
        try {
            await addDoc(collection(db, "taxiParties"), partyDetails);
            
            Alert.alert('파티 생성 완료', '새로운 택시 파티가 생성되었습니다!');
            router.replace('/(tabs)/taxiparty'); 

        } catch (error: any) {
            // ✨ [수정됨] 신고 누적으로 인한 차단 에러 처리
            if (error.code === 'permission-denied' || error.message.includes('permission-denied')) {
                console.log("Taxi party blocked due to reports.");
                Alert.alert("이용 제한 🚫", "신고 누적(5회 이상)으로 인해 파티 생성이 제한되었습니다.\n관리자에게 문의해주세요.");
            } else {
                console.error("파티 생성 중 오류 발생: ", error);
                Alert.alert("오류", "파티 생성에 실패했습니다. 다시 시도해주세요.");
            }
        }
    };
    
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

                <ScrollView 
                    style={styles.scrollView} 
                    contentContainerStyle={styles.scrollContent}
                >
                    
                    <Text style={styles.label}>⏰ 출발 시간</Text>
                    <SelectedValueDisplay 
                        value={departureTime} 
                        onPress={() => openModal('time')} 
                    />

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

                    <Text style={styles.label}>👥 모집 인원 (운전자 제외)</Text>
                    <SelectedValueDisplay 
                        value={memberLimit} 
                        onPress={() => openModal('members')} 
                    />

                    <TouchableOpacity style={styles.createButton} onPress={handleCreateParty}>
                        <Text style={styles.createButtonText}>파티 생성하기</Text>
                    </TouchableOpacity>

                </ScrollView>
            </View>
            <SelectionModal />
        </View>
    );
}

const styles = StyleSheet.create({
    outerContainer: {
        flex: 1,
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

const modalStyles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
        alignItems: 'center',
        zIndex: 100, 
    },
    modalContainer: {
        width: '100%',
        maxHeight: '60%', 
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 10, 
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