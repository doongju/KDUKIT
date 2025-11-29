import { Picker } from '@react-native-picker/picker';
import Checkbox from 'expo-checkbox';
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

// ✨ 랜덤 파스텔 색상
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
  value: number;
}

// --- Constants ---
const daysOfWeek = ['월', '화', '수', '목', '금']; 

const generateTimeOptions = () => {
  const options = [];
  const startHour = 9;
  const endHour = 19; 

  for (let h = startHour; h < endHour; h++) {
    options.push({ label: `${String(h).padStart(2, '0')}:00`, value: h });
    options.push({ label: `${String(h).padStart(2, '0')}:30`, value: h + 0.5 });
  }
  options.push({ label: `${endHour}:00`, value: endHour });
  
  return options;
};

const pickerTimeOptions = generateTimeOptions();
const gridHours = Array.from({ length: 10 }, (_, i) => 9 + i); 

// --- Helpers ---
const parseTime = (timeString: string) => {
  if (timeString === '온라인 강의') return null;
  const parts = timeString.split(' ');
  if (parts.length < 2) return null;
  const [day, timeRange] = parts;
  const [startTimeStr, endTimeStr] = timeRange.split('-');
  
  // '월요일' -> '월' 처리
  const shortDay = day.replace('요일', '');

  const parseHourMinute = (hmStr: string) => {
    const [h, m] = hmStr.split(':').map(Number);
    return h + m / 60;
  };
  try {
    const start = parseHourMinute(startTimeStr);
    const end = parseHourMinute(endTimeStr);
    return { day: shortDay, start, end };
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

// 커스텀 피커 컴포넌트
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
  const selectedLabel = items.find(i => Math.abs(i.value - selectedValue) < 0.01)?.label || items[0]?.label;

  if (Platform.OS === 'android') {
    return (
      <View style={pickerStyles.pickerWrapper}>
        <Picker
          selectedValue={selectedValue}
          onValueChange={onValueChange}
          style={pickerStyles.picker}
          dropdownIconColor="#666"
        >
          {items.map((item) => (
            <Picker.Item 
              key={item.label} 
              label={item.label} 
              value={item.value} 
              style={{ fontSize: 14 }}
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
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showIosPicker}
        onRequestClose={() => setShowIosPicker(false)}
      >
        <View style={pickerStyles.modalOverlay}>
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

// --- Main Screen ---
const TimetableScreen: React.FC = () => {
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [courseName, setCourseName] = useState('');
  const [professor, setProfessor] = useState('');
  const [location, setLocation] = useState('');
  
  const [selectedDay, setSelectedDay] = useState<string>('월');
  
  const [selectedStartTime, setSelectedStartTime] = useState<number>(9.5);
  const [selectedEndTime, setSelectedEndTime] = useState<number>(10.5);

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
    setSelectedDay('월');
    setSelectedStartTime(9.5);
    setSelectedEndTime(10.5);
    setIsAdding(false);
  };

  const handleAddEntry = async () => {
    if (!courseName || !user) { Alert.alert('오류', '과목명을 입력해주세요.'); return; }
    if (!isOnline && selectedStartTime >= selectedEndTime) { Alert.alert('오류', '종료 시간은 시작 시간보다 늦어야 합니다.'); return; }

    const formatTimeValue = (value: number) => {
      const h = Math.floor(value);
      const m = Math.round((value % 1) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // 저장 시 '월요일' 형태로 저장 (기존 데이터 호환)
    const dayToSave = selectedDay.endsWith('요일') ? selectedDay : `${selectedDay}요일`;

    const formattedTime = isOnline 
      ? '온라인 강의' 
      : `${dayToSave} ${formatTimeValue(selectedStartTime)}-${formatTimeValue(selectedEndTime)}`;
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
      console.error(e);
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

  // 3️⃣ [렌더링] 시간표 그리드 UI
  const renderTimetableGrid = () => {
    const ROW_HEIGHT = 58; 

    return (
      <View style={styles.timetableGridContainer}>
        {/* 요일 헤더 */}
        <View style={styles.dayHeaderRow}>
          <View style={styles.timeHeaderCell} />
          {daysOfWeek.map(day => (
            <View key={day} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{day}</Text>
            </View>
          ))}
        </View>

        {/* 시간대별 Row */}
        {gridHours.map((hour, index) => (
          <View key={hour} style={[styles.timeRow, { height: ROW_HEIGHT, borderBottomWidth: index === gridHours.length -1 ? 0 : 1 }]}>
            {/* ✨ 한 줄 표시로 변경 */}
            <View style={styles.timeHeaderCell}>
              <Text style={styles.timeHeaderText}>
                {`${String(hour).padStart(2, '0')}:00`}
              </Text>
            </View>

            {daysOfWeek.map(day => (
              <View key={day} style={styles.dayCell}>
                {timetable.filter(item => !item.isOnline).map(item => {
                  const parsedTime = parseTime(item.time);
                  
                  if (parsedTime && parsedTime.day === day) {
                    if (Math.floor(parsedTime.start) === hour) {
                      const durationInHours = parsedTime.end - parsedTime.start;
                      const blockHeight = durationInHours * ROW_HEIGHT;
                      const topOffset = (parsedTime.start - hour) * ROW_HEIGHT;

                      const backgroundColor = item.color || getColorByString(item.courseName);
                      
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.courseBlock, 
                            { 
                              top: topOffset + 2, 
                              height: blockHeight - 4, 
                              backgroundColor: backgroundColor
                            }
                          ]}
                          activeOpacity={0.8}
                          onPress={() => Alert.alert(item.courseName, `교수: ${item.professor}\n위치: ${item.location}\n시간: ${item.time}`, [
                            { text: "수정", onPress: () => handleEditStart(item) },
                            { text: "삭제", onPress: () => handleDeleteEntry(item.id) },
                            { text: "닫기" }
                          ])}
                        >
                          <Text style={styles.courseBlockText} numberOfLines={2}>{item.courseName}</Text>
                          <Text style={styles.courseBlockLocation} numberOfLines={1}>{item.location}</Text>
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
        <Text style={styles.onlineClassesHeader}>💻 온라인 강의</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {onlineClasses.map(item => {
             const backgroundColor = item.color || getColorByString(item.courseName);
             return (
              <TouchableOpacity
                key={item.id}
                style={[styles.onlineClassItem, { backgroundColor: backgroundColor }]}
                onPress={() => handleEditStart(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.onlineClassText} numberOfLines={1}>{item.courseName}</Text>
                <Text style={styles.onlineClassSubText} numberOfLines={1}>{item.professor}</Text>
              </TouchableOpacity>
             );
          })}
        </ScrollView>
      </View>
    );
  };

  if (loading) return <View style={[styles.container, styles.loadingContainer]}><ActivityIndicator size="large" color="#0062ffff" /></View>;

  return (
    <View style={styles.fullScreenContainer}>
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.pageHeader}>내 시간표</Text>
        <TouchableOpacity 
          style={[styles.addButton, isAdding && styles.addButtonActive]} 
          onPress={() => setIsAdding(!isAdding)}
          activeOpacity={0.7}
        >
          <Text style={[styles.addButtonText, isAdding && styles.addButtonTextActive]}>
            {isAdding ? '닫기' : '추가'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {isAdding && (
          <View style={styles.inputContainer}>
            <View style={styles.formTitleRow}>
                <Text style={styles.formHeader}>{isEditing ? '시간표 수정' : '새로운 강의'}</Text>
                {isEditing && (
                    <TouchableOpacity onPress={handleDeleteFromEdit}>
                        <Text style={{color:'#ff5c5c', fontWeight:'600'}}>이 강의 삭제</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.onlineContainer}>
              <Checkbox
                value={isOnline}
                onValueChange={(val) => { setIsOnline(val); if(val) setLocation('온라인'); else setLocation(''); }}
                style={styles.checkbox}
                color={isOnline ? '#0062ffff' : undefined}
              />
              <Text style={styles.checkboxLabel}>온라인 강의</Text>
            </View>
            
            <View style={styles.inputGroup}>
                <TextInput style={styles.input} placeholder="강의명" placeholderTextColor="#999" value={courseName} onChangeText={setCourseName} />
                <TextInput style={styles.input} placeholder="교수명" placeholderTextColor="#999" value={professor} onChangeText={setProfessor} />
                {!isOnline && (
                <TextInput style={styles.input} placeholder="강의실" placeholderTextColor="#999" value={location} onChangeText={setLocation} />
                )}
            </View>

            {!isOnline && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.sectionLabel}>시간 선택</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <View style={{flex: 1}}>
                        <CustomPicker
                            selectedValue={daysOfWeek.indexOf(selectedDay)}
                            onValueChange={(idx) => setSelectedDay(daysOfWeek[idx])}
                            items={daysOfWeek.map((d, i) => ({ label: d + '요일', value: i }))}
                        />
                    </View>
                </View>
                
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <CustomPicker
                      selectedValue={selectedStartTime}
                      onValueChange={setSelectedStartTime}
                      items={pickerTimeOptions.slice(0, pickerTimeOptions.length - 1)}
                    />
                  </View>
                  <Text style={{color:'#999', fontWeight:'bold'}}>~</Text>
                  <View style={{ flex: 1 }}>
                    <CustomPicker
                      selectedValue={selectedEndTime}
                      onValueChange={setSelectedEndTime}
                      items={pickerTimeOptions.filter(o => o.value > selectedStartTime)}
                    />
                  </View>
                </View>
              </View>
            )}

            <View style={styles.formActionRow}>
                {isEditing && (
                     <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={resetForm}>
                        <Text style={[styles.actionButtonText, {color:'#666'}]}>취소</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.actionButton, {flex: 1}]} onPress={handleAddEntry}>
                    <Text style={styles.actionButtonText}>{isEditing ? '수정 완료' : '등록하기'}</Text>
                </TouchableOpacity>
            </View>
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
  iosContainer: { marginBottom: 0 },
  pickerWrapper: {
    backgroundColor: "#F5F6F8",
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  picker: { width: '100%', height: 48 },
  pickerItemText: { fontSize: 15, color: '#333', fontWeight: '500' },
  
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
  fullScreenContainer: { flex: 1, backgroundColor: '#f8f9fa' },
  
  headerContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingBottom: 15, 
    backgroundColor: '#fff', 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 3,
    zIndex: 10,
  },
  pageHeader: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  
  addButton: { 
    backgroundColor: '#eff4ff', 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    borderRadius: 20 
  },
  addButtonActive: {
      backgroundColor: '#333'
  },
  addButtonText: { color: '#0062ffff', fontWeight: '700', fontSize: 14 },
  addButtonTextActive: { color: '#fff' },

  scrollContent: { padding: 16 },
  
  // --- Form Styles ---
  inputContainer: { 
    marginBottom: 20, 
    padding: 24, 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 12, 
    elevation: 5 
  },
  formTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  formHeader: { fontSize: 18, fontWeight: '800', color: '#333' },
  
  onlineContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  checkbox: { marginRight: 8, borderRadius: 4 },
  checkboxLabel: { fontSize: 15, color: '#444', fontWeight: '500' },
  
  inputGroup: { gap: 10 },
  input: { 
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F5F6F8",
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  
  sectionLabel: { fontSize: 13, color: '#888', fontWeight: '600', marginBottom: 8, marginTop: 5 },

  formActionRow: { flexDirection: 'row', marginTop: 24, gap: 10 },
  actionButton: { 
    backgroundColor: '#0062ffff', 
    paddingVertical: 14, 
    borderRadius: 14, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  cancelButton: { backgroundColor: '#f0f0f0', flex: 0.5 },
  actionButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  
  // --- Timetable Grid Styles ---
  timetableGridContainer: { 
    flexDirection: 'column', 
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 2,
  },
  dayHeaderRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  dayHeaderCell: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  dayHeaderText: { fontWeight: '700', fontSize: 13, color: '#555' },
  
  // ✨ 시간 표시 셀 너비 증가 (50) 및 한 줄 스타일
  timeHeaderCell: { 
    width: 50, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderRightWidth: 1, 
    borderColor: '#f4f4f4', 
    backgroundColor: '#fcfcfc' 
  },
  timeHeaderText: { fontWeight: '600', fontSize: 12, color: '#888' },
  
  timeRow: { flexDirection: 'row', borderBottomColor: '#f4f4f4' },
  dayCell: { flex: 1, borderLeftWidth: 1, borderColor: '#f8f8f8', position: 'relative' },
  
  courseBlock: { 
    position: 'absolute', 
    width: '92%', 
    left: '4%',
    padding: 6, 
    borderRadius: 8, 
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    justifyContent: 'center',
  },
  
  courseBlockText: { color: '#333', fontWeight: '700', fontSize: 11, lineHeight: 14, marginBottom: 2 },
  courseBlockLocation: { color: '#555', fontSize: 9, opacity: 0.8 },
  
  // --- Online Class Styles ---
  onlineClassesContainer: { marginBottom: 20 },
  onlineClassesHeader: { fontSize: 16, fontWeight: '800', marginBottom: 10, color: '#333', marginLeft: 4 },
  
  onlineClassItem: { 
      width: 140, 
      height: 80, 
      padding: 12, 
      borderRadius: 16, 
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2
  },
  onlineClassText: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 4 },
  onlineClassSubText: { fontSize: 11, color: '#555' },
});