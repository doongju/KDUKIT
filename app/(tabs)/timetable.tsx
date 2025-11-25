import { Picker } from '@react-native-picker/picker';
import { Checkbox } from 'expo-checkbox';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

// ✨ 랜덤으로 사용할 파스텔 톤 색상 팔레트
const CARD_COLORS = [
  '#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', 
  '#A0C4FF', '#BDB2FF', '#FFC6FF', '#E2F0CB', '#FFDAC1',
];

// --- Types ---
interface TimetableEntry {
  id: string;
  courseName: string;
  professor: string;
  location: string;
  time: string;
  userId: string;
  isOnline: boolean;
  color?: string; 
}

interface PickerItemData {
  label: string;
  value: any;
}

// --- Constants ---
const daysOfWeek = ['월요일', '화요일', '수요일', '목요일', '금요일'];

const generateTimeOptions = () => {
  const options = [];
  for (let h = 9; h <= 18; h++) {
    const minute = 30;
    const label = `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const value = h + minute / 60;
    options.push({ label, value });
  }
  return options;
};

const timeOptions = generateTimeOptions();

// --- Helpers ---
const parseTime = (timeString: string) => {
  if (timeString === '온라인 강의') return null;
  const parts = timeString.split(' ');
  if (parts.length < 2) return null;
  const [day, timeRange] = parts;
  const [startTimeStr, endTimeStr] = timeRange.split('-');
  const parseHourMinute = (hmStr: string) => {
    const [h, m] = hmStr.split(':').map(Number);
    return h + m / 60;
  };
  try {
    const start = parseHourMinute(startTimeStr);
    const end = parseHourMinute(endTimeStr);
    return { day, start, end };
  } catch {
    return null;
  }
};

const getColorByString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CARD_COLORS.length;
  return CARD_COLORS[index];
};

// 커스텀 피커 컴포넌트 (모달 방식)
const CustomPicker = ({ 
  selectedValue, 
  onValueChange, 
  items, 
}: { 
  selectedValue: any; 
  onValueChange: (val: any) => void; 
  items: PickerItemData[];
  label?: string;
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
          itemStyle={pickerStyles.pickerItem}
          mode="dropdown"
        >
          {items.map((item) => (
            <Picker.Item 
              key={item.label} 
              label={item.label} 
              value={item.value} 
              style={{ color: '#333', fontSize: 16 }}
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
        <Text style={[pickerStyles.pickerItemText, { paddingLeft: 16, lineHeight: 50 }]}>
          {selectedLabel}
        </Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showIosPicker}
        onRequestClose={() => setShowIosPicker(false)}
      >
        <View style={pickerStyles.modalOverlay}>
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

// --- Main Screen ---
const TimetableScreen: React.FC = () => {
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [courseName, setCourseName] = useState('');
  const [professor, setProfessor] = useState('');
  const [location, setLocation] = useState('');
  
  const [selectedDay, setSelectedDay] = useState<string>(daysOfWeek[0]);
  const [selectedStartTime, setSelectedStartTime] = useState<number>(timeOptions[0]?.value || 9.5);
  const [selectedEndTime, setSelectedEndTime] = useState<number>(timeOptions[Math.min(1, timeOptions.length - 1)]?.value || 10.5);

  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  const insets = useSafeAreaInsets();
  const auth = getAuth();
  const user = auth.currentUser;

  const fetchTimetable = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const timetableCollection = collection(db, 'timetables');
      const userQuery = query(timetableCollection, where("userId", "==", user.uid));
      const timetableSnapshot = await getDocs(userQuery);
      const timetableList = timetableSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() })) as TimetableEntry[];
      setTimetable(timetableList);
    } catch (error) {
      console.error(error);
      Alert.alert("오류", "시간표 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      if (currentUser) fetchTimetable();
      else { setTimetable([]); setLoading(false); }
    });
    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setIsEditing(false);
    setCurrentEditId(null);
    setCourseName('');
    setProfessor('');
    setLocation('');
    setIsOnline(false);
    setSelectedDay(daysOfWeek[0]);
    setSelectedStartTime(timeOptions[0]?.value || 9.5);
    setSelectedEndTime(timeOptions[Math.min(1, timeOptions.length - 1)]?.value || 10.5);
    setIsAdding(false);
  };

  const handleAddEntry = async () => {
    if (!courseName || !user) { Alert.alert('오류', '과목명을 입력해주세요.'); return; }
    if (!isOnline && selectedStartTime >= selectedEndTime) { Alert.alert('오류', '종료 시간은 시작 시간보다 늦어야 합니다.'); return; }

    // ✨ [추가] 시간표 중복 체크 로직
    if (!isOnline) {
      const isOverlap = timetable.some(item => {
        // 수정 중일 때는 자기 자신(currentEditId)과 비교하지 않음
        if (isEditing && item.id === currentEditId) return false;
        
        // 온라인 강의는 시간 충돌 검사 제외
        if (item.isOnline) return false;

        const parsed = parseTime(item.time);
        if (!parsed) return false;

        // 1. 요일이 같은지 확인
        if (parsed.day === selectedDay) {
          // 2. 시간 겹치는지 확인 (교차 검사)
          // (새로운 시작 시간 < 기존 종료 시간) AND (새로운 종료 시간 > 기존 시작 시간)
          if (selectedStartTime < parsed.end && selectedEndTime > parsed.start) {
            return true;
          }
        }
        return false;
      });

      if (isOverlap) {
        Alert.alert(`이미 (${selectedDay})에 다른 수업이 있습니다.`);
        return;
      }
    }

    const formatTimeValue = (value: number) => {
      const h = Math.floor(value);
      const m = (value % 1) * 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const formattedTime = isOnline 
      ? '온라인 강의' 
      : `${selectedDay} ${formatTimeValue(selectedStartTime)}-${formatTimeValue(selectedEndTime)}`;
    const finalLocation = isOnline ? '온라인' : location;

    try {
      if (isEditing && currentEditId) {
        await updateDoc(doc(db, 'timetables', currentEditId), {
          courseName, professor, location: finalLocation, time: formattedTime, isOnline,
        });
        Alert.alert('성공', '수정되었습니다!');
        resetForm(); 
      } else {
        const randomColor = CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)];
        await addDoc(collection(db, 'timetables'), {
          courseName, professor, location: finalLocation, time: formattedTime, userId: user.uid, isOnline, color: randomColor
        });
        Alert.alert('성공', '추가되었습니다!');
        resetForm(); 
      }
      fetchTimetable();
    } catch (e) {
      Alert.alert("오류", "저장 실패");
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try { 
      await deleteDoc(doc(db, 'timetables', id)); 
      fetchTimetable(); 
      if (isEditing && currentEditId === id) {
        resetForm();
      }
    } 
    catch { Alert.alert("오류", "삭제 실패"); }
  };

  const handleDeleteFromEdit = () => {
    if (!currentEditId) return;
    Alert.alert("삭제 확인", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => {
          await handleDeleteEntry(currentEditId);
          resetForm(); 
      }}
    ]);
  };

  const handleEditStart = (item: TimetableEntry) => {
    setCourseName(item.courseName);
    setProfessor(item.professor);
    setIsOnline(item.isOnline);
    setIsEditing(true);
    setCurrentEditId(item.id);
    setIsAdding(true);

    if (item.isOnline) {
      setLocation('');
    } else {
      setLocation(item.location);
      const parsedTime = parseTime(item.time);
      if (parsedTime) {
        setSelectedDay(parsedTime.day);
        setSelectedStartTime(parsedTime.start);
        setSelectedEndTime(parsedTime.end);
      }
    }
  };

  const renderTimetableGrid = () => {
    const timeBlockHeight = 50; 
    return (
      <View style={styles.timetableGrid}>
        <View style={styles.dayHeaderRow}>
          <View style={styles.timeHeaderCell} />
          {daysOfWeek.map(day => (
            <View key={day} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{day}</Text>
            </View>
          ))}
        </View>
        {timeOptions.map((timeObj) => (
          <View key={timeObj.label} style={[styles.timeRow, { height: timeBlockHeight }]}>
            <View style={styles.timeHeaderCell}>
              <Text style={styles.timeHeaderText}>{timeObj.label}</Text>
            </View>
            {daysOfWeek.map(day => (
              <View key={day} style={styles.dayCell}>
                {timetable.filter(item => !item.isOnline).map(item => {
                  const parsedTime = parseTime(item.time);
                  if (parsedTime && parsedTime.day === day) {
                    if (parsedTime.start === timeObj.value) {
                      const durationInHours = parsedTime.end - parsedTime.start;
                      const backgroundColor = item.color || getColorByString(item.courseName);
                      
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.courseBlock, 
                            { 
                              height: durationInHours * timeBlockHeight, 
                              top: 0, 
                              zIndex: 10,
                              backgroundColor: backgroundColor
                            }
                          ]}
                          onPress={() => Alert.alert(item.courseName, `교수: ${item.professor}\n위치: ${item.location}\n시간: ${item.time}`, [
                            { text: "수정", onPress: () => handleEditStart(item) },
                            { text: "삭제", onPress: () => handleDeleteEntry(item.id) },
                            { text: "닫기" }
                          ])}
                        >
                          <Text style={styles.courseBlockText}>{item.courseName}</Text>
                          <Text style={styles.courseBlockLocation}>{item.location}</Text>
                        </TouchableOpacity>
                      );
                    }
                  }
                  return null;
                })}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderOnlineClasses = () => {
    const onlineClasses = timetable.filter(item => item.isOnline);
    if (onlineClasses.length === 0) return null;
    return (
      <View style={styles.onlineClassesContainer}>
        <Text style={styles.onlineClassesHeader}>온라인 강의</Text>
        {onlineClasses.map(item => {
           const backgroundColor = item.color || getColorByString(item.courseName);
           return (
            <TouchableOpacity
              key={item.id}
              style={[styles.onlineClassItem, { backgroundColor: backgroundColor, borderColor: 'transparent' }]}
              onPress={() => handleEditStart(item)}
            >
              <Text style={styles.onlineClassText}>{item.courseName}</Text>
              <Text style={styles.onlineClassSubText}>{item.professor} - {item.time}</Text>
            </TouchableOpacity>
           );
        })}
      </View>
    );
  };

  if (loading) return <View style={[styles.container, styles.loadingContainer]}><ActivityIndicator size="large" color="#0062ffff" /></View>;

  return (
    <View style={styles.fullScreenContainer}>
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.pageHeader}>내 시간표</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsAdding(!isAdding)}>
          <Text style={styles.addButtonText}>{isAdding ? '닫기' : '추가'}</Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 150 }]}
      >
        {isAdding && (
          <View style={styles.inputContainer}>
            <Text style={styles.formHeader}>{isEditing ? '시간표 수정' : '시간표 추가'}</Text>
            <View style={styles.onlineContainer}>
              <Checkbox
                value={isOnline}
                onValueChange={(val) => { setIsOnline(val); if(val) setLocation('온라인'); else setLocation(''); }}
                style={styles.checkbox}
              />
              <Text style={styles.checkboxLabel}>온라인 강의</Text>
            </View>
            
            <TextInput style={styles.input} placeholder="과목명" placeholderTextColor="#888" value={courseName} onChangeText={setCourseName} />
            <TextInput style={styles.input} placeholder="교수님" placeholderTextColor="#888" value={professor} onChangeText={setProfessor} />
            {!isOnline && (
              <TextInput style={styles.input} placeholder="강의실" placeholderTextColor="#888" value={location} onChangeText={setLocation} />
            )}

            {!isOnline && (
              <View style={{ marginTop: 5 }}>
                <Text style={styles.pickerLabel}>요일</Text>
                <CustomPicker
                  selectedValue={selectedDay}
                  onValueChange={setSelectedDay}
                  items={daysOfWeek.map(d => ({ label: d, value: d }))}
                />
                
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerLabel}>시작 시간</Text>
                    <CustomPicker
                      selectedValue={selectedStartTime}
                      onValueChange={setSelectedStartTime}
                      items={timeOptions}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerLabel}>종료 시간</Text>
                    <CustomPicker
                      selectedValue={selectedEndTime}
                      onValueChange={setSelectedEndTime}
                      items={timeOptions.filter(o => o.value > selectedStartTime)}
                    />
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.actionButton} onPress={handleAddEntry}>
              <Text style={styles.actionButtonText}>{isEditing ? '수정 완료' : '시간표 추가'}</Text>
            </TouchableOpacity>

            {isEditing && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.deleteButton]} 
                onPress={handleDeleteFromEdit}
              >
                <Text style={styles.actionButtonText}>삭제</Text>
              </TouchableOpacity>
            )}

            {isEditing && (
              <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={resetForm}>
                <Text style={styles.actionButtonText}>취소</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {renderOnlineClasses()}
        {renderTimetableGrid()}

      </ScrollView>
    </View>
  );
};

export default TimetableScreen;

const pickerStyles = StyleSheet.create({
  iosContainer: { marginBottom: 10 },
  pickerWrapper: {
    backgroundColor: "#f2f3f7",
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden', 
    borderWidth: 1,
    borderColor: 'transparent',
  },
  picker: { width: '100%', height: 50 },
  pickerItem: { color: '#333', fontSize: 16 },
  pickerItemText: { fontSize: 16, color: '#333' },
  
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', 
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20, 
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

const styles = StyleSheet.create({
  fullScreenContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  pageHeader: { fontSize: 24, fontWeight: 'bold', color: '#0062ffff' },
  addButton: { backgroundColor: '#0062ffff', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 },
  addButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  formHeader: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  inputContainer: { marginBottom: 20, padding: 15, backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 2 },
  
  input: { 
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: "#f2f3f7",
    marginBottom: 10,
    fontSize: 16,
    color: '#333',
    borderWidth: 0,
  },
  
  onlineContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  checkbox: { marginRight: 8 },
  checkboxLabel: { fontSize: 16 },
  
  pickerLabel: { fontSize: 14, color: '#555', fontWeight: 'bold', marginBottom: 5, marginLeft: 2 },

  actionButton: { backgroundColor: '#0062ffff', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  actionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  deleteButton: { backgroundColor: '#ff5c5c' },
  cancelButton: { backgroundColor: '#ccc' },
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  
  timetableGrid: { flexDirection: 'column', borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', marginTop: 20 },
  dayHeaderRow: { flexDirection: 'row', backgroundColor: '#f9f9f9' },
  dayHeaderCell: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderLeftWidth: 1, borderColor: '#ddd' },
  dayHeaderText: { fontWeight: 'bold', fontSize: 12 },
  timeHeaderCell: { width: 60, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderColor: '#ddd' },
  timeHeaderText: { fontWeight: 'bold', fontSize: 12 },
  timeRow: { flexDirection: 'row', minHeight: 50, borderTopWidth: 1, borderColor: '#ddd' },
  dayCell: { flex: 1, borderLeftWidth: 1, borderColor: '#ddd', position: 'relative' },
  
  courseBlock: { 
    position: 'absolute', 
    width: '100%', 
    left: 0, 
    padding: 5, 
    borderRadius: 5, 
    zIndex: 1 
  },
  
  courseBlockText: { color: '#333', fontWeight: 'bold', fontSize: 10 },
  courseBlockLocation: { color: '#333', fontSize: 8 },
  
  onlineClassesContainer: { marginTop: 0, marginBottom: 20, padding: 15, backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 2 },
  onlineClassesHeader: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  
  onlineClassItem: { padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 0 },
  onlineClassText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  onlineClassSubText: { fontSize: 14, color: '#555' },
});