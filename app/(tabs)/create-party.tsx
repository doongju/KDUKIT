// app/(tabs)/create-party.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { Picker } from '@react-native-picker/picker'; // ✨ Picker 임포트
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import React, { useState } from 'react';
import {
    Alert,
    Modal,
    Platform,
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
// 멤버 옵션 (숫자)
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

// ✨ [수정] '기타 (직접 입력)'을 맨 앞으로 이동
const timeOptions = ['기타 (직접 입력)', ...generateTimeOptions()];

export default function CreatePartyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [departureTime, setDepartureTime] = useState('09:00'); 
  const [pickupLocation, setPickupLocation] = useState(AVAILABLE_LOCATIONS[1]); 
  const [dropoffLocation, setDropoffLocation] = useState(AVAILABLE_LOCATIONS[3]); 
  const [memberLimit, setMemberLimit] = useState(2); 
  
  // ✨ [추가] 출발 시간 직접 입력 상태
  const [customTime, setCustomTime] = useState('');
  const [customPickup, setCustomPickup] = useState(''); 
  const [customDropoff, setCustomDropoff] = useState(''); 

  // ✨ iOS용 모달 상태 관리
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [activePickerType, setActivePickerType] = useState<'time' | 'pickup' | 'dropoff' | 'members' | null>(null);

  const handleCreateParty = async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      Alert.alert("로그인 필요", "택시 파티를 생성하려면 로그인이 필요합니다.");
      return;
    }

    // ✨ [수정] 직접 입력 값 처리 로직
    let finalDepartureTime = departureTime === '기타 (직접 입력)' ? customTime : departureTime;
    let finalPickup = pickupLocation === '기타 (직접 입력)' ? customPickup : pickupLocation;
    let finalDropoff = dropoffLocation === '기타 (직접 입력)' ? customDropoff : dropoffLocation;

    // ✨ [수정] 필수 입력값 검증
    if (!finalPickup.trim() || !finalDropoff.trim() || !finalDepartureTime.trim()) {
      Alert.alert('필수 정보 누락', '시간, 탑승 장소, 하차 장소를 모두 입력해주세요.');
      return;
    }

    if (departureTime === '기타 (직접 입력)' && !customTime.trim()) {
      Alert.alert('필수 정보 누락', '출발 시간을 직접 입력해주세요.');
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
      departureTime: finalDepartureTime, // ✨ 최종 결정된 시간 사용
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
      if (error.code === 'permission-denied' || error.message.includes('permission-denied')) {
        Alert.alert("이용 제한 🚫", "신고 누적(5회 이상)으로 인해 파티 생성이 제한되었습니다.\n관리자에게 문의해주세요.");
      } else {
        console.error("파티 생성 중 오류 발생: ", error);
        Alert.alert("오류", "파티 생성에 실패했습니다. 다시 시도해주세요.");
      }
    }
  };

  // ✨ 통합 Picker 렌더링 함수 (Android: 드롭다운, iOS: 버튼 -> 모달)
  const renderPickerField = (
    label: string,
    value: string | number,
    setValue: (val: any) => void,
    options: any[],
    type: 'time' | 'pickup' | 'dropoff' | 'members'
  ) => {
    // 1. 안드로이드인 경우
    if (Platform.OS === 'android') {
      return (
        <View style={styles.pickerWrapperAndroid}>
          <Picker
            selectedValue={value}
            onValueChange={(itemValue) => setValue(itemValue)}
            style={styles.pickerAndroid}
            mode="dropdown" // 안드로이드 드롭다운 모드
          >
            {options.map((opt, idx) => (
              <Picker.Item 
                key={idx} 
                label={type === 'members' ? `${opt} 명` : opt} 
                value={opt} 
                style={{ fontSize: 16, color: '#333' }}
              />
            ))}
          </Picker>
        </View>
      );
    }

    // 2. iOS인 경우
    return (
      <TouchableOpacity 
        style={styles.pickerWrapperIOS} 
        onPress={() => {
          setActivePickerType(type);
          setShowIosPicker(true);
        }}
      >
        <Text style={styles.pickerValueIOS}>
          {type === 'members' ? `${value} 명` : value}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#0062ffff" />
      </TouchableOpacity>
    );
  };

  // ✨ iOS용 모달 컨텐츠 렌더링
  const renderIosPickerContent = () => {
    let options: any[] = [];
    let selectedValue: any = '';
    let onValueChange: (val: any) => void = () => {};

    if (activePickerType === 'time') {
      options = timeOptions;
      selectedValue = departureTime;
      onValueChange = setDepartureTime;
    } else if (activePickerType === 'pickup') {
      options = AVAILABLE_LOCATIONS;
      selectedValue = pickupLocation;
      onValueChange = setPickupLocation;
    } else if (activePickerType === 'dropoff') {
      options = AVAILABLE_LOCATIONS;
      selectedValue = dropoffLocation;
      onValueChange = setDropoffLocation;
    } else if (activePickerType === 'members') {
      options = memberOptions;
      selectedValue = memberLimit;
      onValueChange = setMemberLimit;
    }

    return (
      <Picker
        selectedValue={selectedValue}
        onValueChange={onValueChange}
        style={{ height: 200, width: '100%' }}
      >
        {options.map((opt, idx) => (
          <Picker.Item 
            key={idx} 
            label={activePickerType === 'members' ? `${opt} 명` : opt} 
            value={opt} 
            color="#000"
          />
        ))}
      </Picker>
    );
  };

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
          {renderPickerField('출발 시간', departureTime, setDepartureTime, timeOptions, 'time')}
          
          {/* ✨ [추가] 시간 직접 입력 필드 */}
          {departureTime === '기타 (직접 입력)' && (
            <TextInput
              placeholder="출발 시간을 직접 입력해주세요 (예: 13:20)"
              value={customTime}
              onChangeText={setCustomTime}
              style={styles.customInput}
            />
          )}

          <Text style={styles.label}>📍 탑승 장소</Text>
          {renderPickerField('탑승 장소', pickupLocation, setPickupLocation, AVAILABLE_LOCATIONS, 'pickup')}
          
          {pickupLocation === '기타 (직접 입력)' && (
            <TextInput
              placeholder="탑승 장소를 직접 입력해주세요 (예: 후문 CU)"
              value={customPickup}
              onChangeText={setCustomPickup}
              style={styles.customInput}
            />
          )}
          
          <Text style={styles.label}>🏁 하차 장소</Text>
          {renderPickerField('하차 장소', dropoffLocation, setDropoffLocation, AVAILABLE_LOCATIONS, 'dropoff')}
          
          {dropoffLocation === '기타 (직접 입력)' && (
            <TextInput
              placeholder="하차 장소를 직접 입력해주세요 (예: 불당동 스타벅스)"
              value={customDropoff}
              onChangeText={setCustomDropoff}
              style={styles.customInput}
            />
          )}

          <Text style={styles.label}>👥 모집 인원 (운전자 제외)</Text>
          {renderPickerField('모집 인원', memberLimit, setMemberLimit, memberOptions, 'members')}

          <TouchableOpacity style={styles.createButton} onPress={handleCreateParty}>
            <Text style={styles.createButtonText}>파티 생성하기</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>

      {/* ✨ iOS용 하단 모달 */}
      {Platform.OS === 'ios' && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={showIosPicker}
          onRequestClose={() => setShowIosPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowIosPicker(false)}>
                  <Text style={styles.modalDoneText}>완료</Text>
                </TouchableOpacity>
              </View>
              {renderIosPickerContent()}
            </View>
          </View>
        </Modal>
      )}
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
  
  // ✨ 안드로이드 Picker 스타일
  pickerWrapperAndroid: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginBottom: 10,
    height: 55, // 높이 고정
    justifyContent: 'center',
  },
  pickerAndroid: {
    width: '100%',
    height: 55,
    color: '#333',
  },

  // ✨ iOS TouchableOpacity 스타일 (Android Picker와 비슷하게 생기도록)
  pickerWrapperIOS: {
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
    height: 55,
  },
  pickerValueIOS: {
    fontSize: 16,
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

  // ✨ iOS 모달 스타일 (SignupScreen과 동일)
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', 
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20, // 아이폰 하단 바 여백
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    height: 45,
    backgroundColor: '#f2f3f7',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalDoneText: {
    color: '#0062ffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});