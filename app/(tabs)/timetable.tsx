import { Picker } from '@react-native-picker/picker';
import Checkbox from 'expo-checkbox';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

// 시간표 항목의 데이터 구조를 정의합니다.
interface TimetableEntry {
  id: string;
  courseName: string;
  professor: string;
  location: string;
  time: string; // "월 09:30-10:30" 형식
  userId: string;
  isOnline: boolean;
}

// 요일
const daysOfWeek = ['월', '화', '수', '목', '금'];

// 9시 30분부터 시작하여 1시간 간격으로 시간 옵션 생성 (18시 30분까지)
const generateTimeOptions = () => {
  const options = [];
  for (let h = 9; h <= 18; h++) {
    const label = `${String(h).padStart(2, '0')}:30`;
    const value = h + 0.5;
    options.push({ label, value });
  }
  return options;
};

const timeOptions = generateTimeOptions();

// 시간표 데이터 파싱 함수 (예: "월 09:30-10:30" -> {day: '월', start: 9.5, end: 10.5})
const parseTime = (timeString: string) => {
  if (timeString === '온라인 강의') return null;

  const parts = timeString.split(' ');
  if (parts.length < 2) {
    console.warn("Invalid time string format:", timeString);
    return null;
  }

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
  } catch (e) {
    console.error("Error parsing time components:", startTimeStr, endTimeStr, e);
    return null;
  }
};


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
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const timetableCollection = collection(db, 'timetables');
      const userQuery = query(timetableCollection, where("userId", "==", user.uid));
      const timetableSnapshot = await getDocs(userQuery);
      const timetableList = timetableSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as TimetableEntry[];
      setTimetable(timetableList);
    } catch (error) {
      console.error("시간표 데이터를 불러오는 중 오류 발생: ", error);
      Alert.alert("오류", "시간표를 불러오지 못했습니다. 권한 또는 네트워크를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      if (currentUser) {
        fetchTimetable();
      } else {
        setTimetable([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAddEntry = async () => {
    if (!courseName || !user) {
      Alert.alert('오류', '과목명을 입력해주세요.');
      return;
    }
    if (!isOnline && selectedStartTime >= selectedEndTime) {
      Alert.alert('오류', '시작 시간은 종료 시간보다 빨라야 합니다.');
      return;
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
        const docRef = doc(db, 'timetables', currentEditId);
        await updateDoc(docRef, {
          courseName,
          professor,
          location: finalLocation,
          time: formattedTime,
          isOnline,
        });
        Alert.alert('성공', '시간표 항목이 수정되었습니다!');
        setIsEditing(false);
        setCurrentEditId(null);
      } else {
        const newEntry = {
          courseName,
          professor,
          location: finalLocation,
          time: formattedTime,
          userId: user.uid,
          isOnline,
        };
        await addDoc(collection(db, 'timetables'), newEntry);
        Alert.alert('성공', '시간표에 추가되었습니다!');
      }
      fetchTimetable();
      setCourseName('');
      setProfessor('');
      setLocation('');
      setIsOnline(false);
      setSelectedDay(daysOfWeek[0]);
      setSelectedStartTime(timeOptions[0]?.value || 9.5);
      setSelectedEndTime(timeOptions[Math.min(1, timeOptions.length - 1)]?.value || 10.5);
      setIsAdding(false);
    } catch (error) {
      console.error("데이터 저장/수정 중 오류 발생: ", error);
      Alert.alert("오류", "시간표를 저장하지 못했습니다. 권한을 확인해주세요.");
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!user) {
      Alert.alert('오류', '사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'timetables', id));
      Alert.alert("성공", "시간표 항목이 삭제되었습니다.");
      fetchTimetable();
    } catch (error) {
      console.error("데이터 삭제 중 오류 발생: ", error);
      Alert.alert("오류", "항목을 삭제하지 못했습니다. 권한을 확인해주세요.");
    }
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
      setSelectedDay(daysOfWeek[0]);
      setSelectedStartTime(timeOptions[0]?.value || 9.5);
      setSelectedEndTime(timeOptions[Math.min(1, timeOptions.length - 1)]?.value || 10.5);
    } else {
      setLocation(item.location);
      const parsedTime = parseTime(item.time);
      if (parsedTime) {
        setSelectedDay(parsedTime.day);
        setSelectedStartTime(parsedTime.start);
        setSelectedEndTime(parsedTime.end);
      } else {
        setSelectedDay(daysOfWeek[0]);
        setSelectedStartTime(timeOptions[0]?.value || 9.5);
        setSelectedEndTime(timeOptions[Math.min(1, timeOptions.length - 1)]?.value || 10.5);
      }
    }
  };
  
  const renderTimetableGrid = () => {
    const timeBlockHeight = 50;

    return (
      <View style={styles.timetableGrid}>
        {/* 요일 헤더 */}
        <View style={styles.dayHeaderRow}>
          <View style={styles.timeHeaderCell} />
          {daysOfWeek.map(day => (
            <View key={day} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{day}</Text>
            </View>
          ))}
        </View>
        {/* 시간표 그리드 */}
        {timeOptions.map((timeObj, index) => (
          <View key={timeObj.label} style={[styles.timeRow, { height: timeBlockHeight }]}>
            <View style={styles.timeHeaderCell}>
              <Text style={styles.timeHeaderText}>{timeObj.label}</Text>
            </View>
            {daysOfWeek.map(day => (
              <View key={day} style={styles.dayCell}>
                {timetable.filter(item => !item.isOnline).map(item => {
                  const parsedTime = parseTime(item.time);
                  if (parsedTime && parsedTime.day === day) {
                    const lectureStartValue = parsedTime.start;
                    const lectureEndValue = parsedTime.end;
                    const gridTimeStartValue = timeObj.value;

                    if (lectureStartValue >= gridTimeStartValue && lectureStartValue < gridTimeStartValue + 1) {
                        const durationInHours = lectureEndValue - lectureStartValue;
                        const topOffset = (lectureStartValue - gridTimeStartValue) * timeBlockHeight;

                        const blockHeight = durationInHours * timeBlockHeight;

                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.courseBlock, {
                                    height: blockHeight,
                                    top: topOffset,
                                }]}
                                onPress={() => Alert.alert(
                                    item.courseName,
                                    `교수: ${item.professor}\n위치: ${item.location}\n시간: ${item.time}`,
                                    [
                                        { text: "수정", onPress: () => handleEditStart(item) },
                                        { text: "삭제", onPress: () => handleDeleteEntry(item.id) },
                                        { text: "닫기" }
                                    ]
                                )}
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
        {onlineClasses.map(item => (
          <TouchableOpacity
            key={item.id}
            style={styles.onlineClassItem}
            onPress={() => Alert.alert(
              item.courseName,
              `교수: ${item.professor}\n시간: ${item.time}`,
              [
                { text: "수정", onPress: () => handleEditStart(item) },
                { text: "삭제", onPress: () => handleDeleteEntry(item.id) },
                { text: "닫기" }
              ]
            )}
          >
            <Text style={styles.onlineClassText}>{item.courseName}</Text>
            <Text style={styles.onlineClassSubText}>{item.professor} - {item.time}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#ff8a3d" />
        <Text style={styles.loadingText}>시간표를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.pageHeader}>내 시간표</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsAdding(!isAdding)}>
          <Text style={styles.addButtonText}>{isAdding ? '닫기' : '추가'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}>
        {isAdding && (
          <View style={styles.inputContainer}>
            <Text style={styles.formHeader}>{isEditing ? '시간표 수정' : '시간표 추가'}</Text>
            <View style={styles.onlineContainer}>
              <Checkbox
                value={isOnline}
                onValueChange={(newValue) => {
                  setIsOnline(newValue);
                  if (newValue) {
                    setLocation('온라인');
                  } else {
                    setLocation('');
                  }
                }}
                style={styles.checkbox}
              />
              <Text style={styles.checkboxLabel}>온라인 강의</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="과목명"
              placeholderTextColor="#888"
              value={courseName}
              onChangeText={setCourseName}
            />
            <TextInput
              style={styles.input}
              placeholder="교수님"
              placeholderTextColor="#888"
              value={professor}
              onChangeText={setProfessor}
            />
            {!isOnline && (
              <TextInput
                style={styles.input}
                placeholder="위치"
                placeholderTextColor="#888"
                value={location}
                onChangeText={setLocation}
              />
            )}
            {!isOnline && (
              <View style={styles.timePickerContainer}>
                <View style={[styles.pickerWrapper, styles.dayPicker]}>
                  <Picker
                    selectedValue={selectedDay}
                    onValueChange={(itemValue) => setSelectedDay(itemValue)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {daysOfWeek.map((day) => (
                      <Picker.Item key={day} label={day} value={day} />
                    ))}
                  </Picker>
                </View>
                <View style={[styles.pickerWrapper, styles.hourPicker]}>
                  <Picker
                    selectedValue={selectedStartTime}
                    onValueChange={(itemValue) => setSelectedStartTime(itemValue)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {timeOptions.map((option) => (
                      <Picker.Item key={option.label} label={option.label} value={option.value} />
                    ))}
                  </Picker>
                </View>
                <View style={[styles.pickerWrapper, styles.hourPicker]}>
                  <Picker
                    selectedValue={selectedEndTime}
                    onValueChange={(itemValue) => setSelectedEndTime(itemValue)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {timeOptions.filter(option => option.value > selectedStartTime).map((option) => (
                      <Picker.Item key={option.label} label={option.label} value={option.value} />
                    ))}
                  </Picker>
                </View>
              </View>
            )}
            <TouchableOpacity style={styles.actionButton} onPress={handleAddEntry}>
                <Text style={styles.actionButtonText}>
                  {isEditing ? '수정 완료' : '시간표에 추가'}
                </Text>
            </TouchableOpacity>
            {isEditing && (
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => {
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
                }}
              >
                <Text style={styles.actionButtonText}>수정 취소</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {renderTimetableGrid()}
        {renderOnlineClasses()}
      </ScrollView>
    </View>
  );
};

export default TimetableScreen;

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 0,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  pageHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#ff8a3d',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  scrollContent: {
    padding: 20,
  },
  formHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  inputContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    color: '#333',
  },
  onlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkbox: {
    marginRight: 8,
  },
  checkboxLabel: {
    fontSize: 16,
  },
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    height: 50,
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
  },
  dayPicker: {
    flex: 1,
    marginRight: 8,
  },
  hourPicker: {
    flex: 1,
  },
  picker: {
    height: 50,
    width: '100%',
    backgroundColor: 'transparent',
  },
  pickerItem: {
    fontSize: 14,
    height: 50,
    color: '#333',
  },
  actionButton: {
    backgroundColor: '#ff8a3d',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
  },
  // 주간 시간표 스타일
  timetableGrid: {
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    marginTop: 20,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
  },
  dayHeaderCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderColor: '#ddd',
  },
  dayHeaderText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  timeHeaderCell: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRightWidth: 1,
    borderColor: '#ddd',
  },
  timeHeaderText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  timeRow: {
    flexDirection: 'row',
    minHeight: 50,
    borderTopWidth: 1,
    borderColor: '#ddd',
  },
  dayCell: {
    flex: 1,
    borderLeftWidth: 1,
    borderColor: '#ddd',
    position: 'relative',
  },
  courseBlock: {
    position: 'absolute',
    width: '100%',
    left: 0,
    backgroundColor: '#add8e6',
    padding: 5,
    borderRadius: 5,
    zIndex: 1,
  },
  courseBlockText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 10,
  },
  courseBlockLocation: {
    color: '#fff',
    fontSize: 8,
  },
  // 온라인 강의 스타일
  onlineClassesContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  onlineClassesHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  onlineClassItem: {
    backgroundColor: '#f0f8ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#b0e0e6',
  },
  onlineClassText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#444',
  },
  onlineClassSubText: {
    fontSize: 14,
    color: '#666',
  },
});