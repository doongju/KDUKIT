// app/(tabs)/create-party.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// --- Constants & Data ---

const AVAILABLE_LOCATIONS = [
  '기타 (직접 입력)', 
  '학교 정문', 
  '기숙사 앞', 
  '양주역', 
  '덕계역', 
];

const MAX_MEMBERS = 4;

const locationItems = AVAILABLE_LOCATIONS.map(loc => ({ label: loc, value: loc }));
const memberItems = Array.from({ length: MAX_MEMBERS }, (_, i) => ({ label: `${i + 1}명`, value: i + 1 }));

const hourItems = [
  ...Array.from({ length: 23 }, (_, i) => {
    const h = i + 1; 
    return { label: h < 10 ? `0${h}시` : `${h}시`, value: h < 10 ? `0${h}` : `${h}` };
  }),
  { label: '00시', value: '00' }
];

const minuteItems = Array.from({ length: 12 }, (_, i) => {
  const m = i * 5;
  const val = m < 10 ? `0${m}` : `${m}`;
  return { label: `${val}분`, value: val };
});

// --- Components ---

interface PickerItemData {
  label: string;
  value: any;
}

// ✨ 시간표 앱과 동일한 스타일의 CustomPicker (Slide Modal)
const CustomPicker = ({ 
  selectedValue, 
  onValueChange, 
  items, 
}: { 
  selectedValue: any; 
  onValueChange: (val: any) => void; 
  items: PickerItemData[];
}) => {
  const [showIosPicker, setShowIosPicker] = useState(false);
  const selectedLabel = items.find(i => i.value === selectedValue)?.label || items[0]?.label;

  if (Platform.OS === 'android') {
    return (
      <View style={pickerStyles.pickerWrapper}>
        <Picker
          selectedValue={selectedValue}
          onValueChange={onValueChange}
          style={pickerStyles.picker}
          dropdownIconColor="#666"
          mode="dropdown"
        >
          {items.map((item) => (
            <Picker.Item 
              key={item.label} 
              label={item.label} 
              value={item.value} 
              style={{ fontSize: 14, color: '#333' }}
            />
          ))}
        </Picker>
      </View>
    );
  }

  return (
    <View style={pickerStyles.iosContainer}>
      <TouchableOpacity 
        style={pickerStyles.pickerWrapper} 
        onPress={() => setShowIosPicker(true)}
        activeOpacity={0.7}
      >
        <Text style={pickerStyles.pickerItemText}>
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#999" style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showIosPicker}
        onRequestClose={() => setShowIosPicker(false)}
      >
        <View style={pickerStyles.modalOverlay}>
          {/* 배경 클릭 시 닫기 */}
          <TouchableOpacity style={{flex:1}} onPress={() => setShowIosPicker(false)} />
          <View style={pickerStyles.modalContent}>
            <View style={pickerStyles.modalHeader}>
              <TouchableOpacity onPress={() => setShowIosPicker(false)}>
                <Text style={pickerStyles.modalDoneText}>완료</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={selectedValue}
              onValueChange={onValueChange}
              style={{ width: '100%', height: 200 }}
            >
              {items.map((item) => (
                <Picker.Item key={item.label} label={item.label} value={item.value} color="#000"/>
              ))}
            </Picker>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default function CreatePartyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');

  const [pickupLocation, setPickupLocation] = useState(AVAILABLE_LOCATIONS[1]); 
  const [dropoffLocation, setDropoffLocation] = useState(AVAILABLE_LOCATIONS[3]); 
  const [memberLimit, setMemberLimit] = useState(2); 
  
  const [customPickup, setCustomPickup] = useState(''); 
  const [customDropoff, setCustomDropoff] = useState(''); 

  const handleCreateParty = async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      Alert.alert("로그인 필요", "택시 파티를 생성하려면 로그인이 필요합니다.");
      return;
    }

    const finalDepartureTime = `${selectedHour}:${selectedMinute}`;
    let finalPickup = pickupLocation === '기타 (직접 입력)' ? customPickup : pickupLocation;
    let finalDropoff = dropoffLocation === '기타 (직접 입력)' ? customDropoff : dropoffLocation;

    if (!finalPickup.trim() || !finalDropoff.trim()) {
      Alert.alert('탑승 장소와 하차 장소를 모두 입력해주세요.');
      return;
    }

    const partyDetails = {
      departureTime: finalDepartureTime,
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
      console.error("파티 생성 중 오류 발생: ", error);
      Alert.alert("오류", "파티 생성에 실패했습니다. 다시 시도해주세요.");
    }
  };

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/taxiparty')} style={styles.backButton}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>택시 파티 만들기</Text>
          <View style={{ width: 40 }} /> 
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. 출발 정보 */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>출발 정보</Text>
          </View>
          
          <View style={styles.card}>
            <Text style={styles.label}>⏰ 출발 시간</Text>
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <CustomPicker 
                  selectedValue={selectedHour} 
                  onValueChange={setSelectedHour} 
                  items={hourItems} 
                />
              </View>
              <Text style={styles.timeColon}>:</Text>
              <View style={{ flex: 1 }}>
                <CustomPicker 
                  selectedValue={selectedMinute} 
                  onValueChange={setSelectedMinute} 
                  items={minuteItems} 
                />
              </View>
            </View>
          </View>

          {/* 2. 경로 정보 */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>탑승/하차 장소 설정</Text>
          </View>

          <View style={styles.card}>
            <View style={[styles.inputGroup, { marginBottom: 20 }]}>
              <Text style={styles.label}>📍 탑승 장소 (출발)</Text>
              <CustomPicker 
                selectedValue={pickupLocation} 
                onValueChange={setPickupLocation} 
                items={locationItems} 
              />
              {pickupLocation === '기타 (직접 입력)' && (
                <TextInput
                  value={customPickup}
                  onChangeText={setCustomPickup}
                  style={styles.customInput}
                  placeholderTextColor="#aaa"
                />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>🏁 하차 장소 (도착)</Text>
              <CustomPicker 
                selectedValue={dropoffLocation} 
                onValueChange={setDropoffLocation} 
                items={locationItems} 
              />
              {dropoffLocation === '기타 (직접 입력)' && (
                <TextInput
                  value={customDropoff}
                  onChangeText={setCustomDropoff}
                  style={styles.customInput}
                  placeholderTextColor="#aaa"
                />
              )}
            </View>
          </View>

          {/* 3. 모집 인원 */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>모집 인원</Text>
            <Text style={styles.sectionSubtitle}>본인을 포함하여 인원선택</Text>
          </View>

          <View style={[styles.card, { marginBottom: 30 }]}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>👥 모집 인원</Text>
              <CustomPicker 
                selectedValue={memberLimit} 
                onValueChange={setMemberLimit} 
                items={memberItems} 
              />
            </View>
          </View>

          <TouchableOpacity style={styles.createButton} onPress={handleCreateParty}>
            <Text style={styles.createButtonText}>파티 생성하기</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// --- Styles ---

const pickerStyles = StyleSheet.create({
  iosContainer: { marginBottom: 0, width: '100%' },
  pickerWrapper: {
    backgroundColor: "#F5F6F8",
    borderRadius: 12,
    height: 52,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  picker: { width: '100%', height: 52 },
  pickerItemText: { fontSize: 16, color: '#333', fontWeight: '500' },
  
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)', 
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  modalHeader: {
    height: 50,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalDoneText: {
    color: '#0062ffff',
    fontWeight: '700',
    fontSize: 16,
  },
});

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  headerContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    zIndex: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 200, // 버튼 가림 방지
  },

  sectionHeader: {
    marginTop: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  timeColon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },

  inputGroup: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 10,
  },

  customInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#0062ffff',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#f8fbff',
    fontSize: 15,
    color: '#333',
  },

  createButton: {
    backgroundColor: '#0062ffff',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#0062ffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
    marginTop: 10,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});