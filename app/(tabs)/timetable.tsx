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
import { db } from '../../firebaseConfig';

// 시간표 항목의 데이터 구조를 정의합니다.
interface TimetableEntry {
  id: string;
  courseName: string;
  professor: string;
  location: string;
  time: string;
  userId: string;
  isOnline: boolean;
}

// 요일 및 시간대 (Picker 용)
const daysOfWeek = ['월', '화', '수', '목', '금'];
const timeOptions = Array.from({ length: 15 }, (_, i) => i + 9);

// 시간표 데이터 파싱 함수 (예: "월 10:00 - 12:00" -> {day: '월', start: 10, end: 12})
const parseTime = (timeString: string) => {
  if (timeString === '온라인 강의') return null;

  const [dayPart, timePart] = timeString.split(' ');
  if (!timePart) return null;

  const [start, end] = timePart.split('-').map(t => parseInt(t.split(':')[0]));
  return {
    day: dayPart,
    start,
    end,
  };
};

const TimetableScreen: React.FC = () => {
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [courseName, setCourseName] = useState('');
  const [professor, setProfessor] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>(daysOfWeek[0]);
  const [selectedStartTime, setSelectedStartTime] = useState<number>(timeOptions[0]);
  const [selectedEndTime, setSelectedEndTime] = useState<number>(timeOptions[1]);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);

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

    const formattedTime = isOnline ? '온라인 강의' : `${selectedDay} ${selectedStartTime}:00 - ${selectedEndTime}:00`;
    const finalLocation = isOnline ? '온라인' : location; // ⚠️ 온라인 강의 시 위치를 '온라인'으로 설정

    try {
      if (isEditing && currentEditId) {
        const docRef = doc(db, 'timetables', currentEditId);
        await updateDoc(docRef, {
          courseName,
          professor,
          location: finalLocation, // ⚠️ 수정 시에도 적용
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
          location: finalLocation, // ⚠️ 추가 시에도 적용
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
      setLocation(''); // ⚠️ location 초기화
      setIsOnline(false);
      setSelectedDay(daysOfWeek[0]);
      setSelectedStartTime(timeOptions[0]);
      setSelectedEndTime(timeOptions[1]);
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

    if (item.isOnline) {
      setLocation(''); // ⚠️ 온라인 강의 수정 시 위치 필드 비움
      setSelectedDay(daysOfWeek[0]);
      setSelectedStartTime(timeOptions[0]);
      setSelectedEndTime(timeOptions[1]);
    } else {
      setLocation(item.location); // ⚠️ 오프라인 강의 수정 시 기존 위치 설정
      const parsedTime = parseTime(item.time);
      if (parsedTime) {
        setSelectedDay(parsedTime.day);
        setSelectedStartTime(parsedTime.start);
        setSelectedEndTime(parsedTime.end);
      }
    }
  };

  const renderTimetableList = () => {
    if (timetable.length === 0) {
      return <Text style={styles.noDataText}>등록된 시간표가 없습니다.</Text>;
    }
    return (
      <View>
        {timetable.map(item => (
          <View key={item.id} style={styles.entryContainer}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryText}>{item.courseName}</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity onPress={() => handleEditStart(item)}>
                  <Text style={styles.editButton}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteEntry(item.id)}>
                  <Text style={styles.deleteButton}>삭제</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text>교수: {item.professor || 'N/A'}</Text>
            {item.isOnline ? (
                <Text>시간: 온라인 강의</Text>
              ) : (
                <Text>시간: {item.time}</Text>
            )}
            <Text>위치: {item.location || 'N/A'}</Text>
          </View>
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
    <ScrollView style={styles.scrollViewContainer}>
      <View style={styles.container}>
        <Text style={styles.header}>{isEditing ? '시간표 수정' : '시간표 추가'}</Text>
        <View style={styles.inputContainer}>
          <View style={styles.onlineContainer}>
            <Checkbox
              value={isOnline}
              onValueChange={(newValue) => {
                setIsOnline(newValue);
                if (newValue) { // 온라인 강의를 선택하면 위치, 시간 필드 초기화
                  setLocation('온라인'); // ⚠️ 위치를 '온라인'으로 자동 설정
                  setSelectedDay(daysOfWeek[0]);
                  setSelectedStartTime(timeOptions[0]);
                  setSelectedEndTime(timeOptions[1]);
                } else {
                  setLocation(''); // ⚠️ 오프라인으로 돌아오면 위치 필드를 비움
                }
              }}
              style={styles.checkbox}
            />
            <Text style={styles.checkboxLabel}>온라인 강의</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="과목명"
            value={courseName}
            onChangeText={setCourseName}
          />
          <TextInput
            style={styles.input}
            placeholder="교수님"
            value={professor}
            onChangeText={setProfessor}
          />
          {/* ⚠️ 온라인 강의가 아닐 때만 위치 입력 필드 표시 */}
          {!isOnline && (
            <TextInput
              style={styles.input}
              placeholder="위치"
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
                >
                  {timeOptions.map((hour) => (
                    <Picker.Item key={hour} label={`${hour}:00`} value={hour} />
                  ))}
                </Picker>
              </View>
              <View style={[styles.pickerWrapper, styles.hourPicker]}>
                <Picker
                  selectedValue={selectedEndTime}
                  onValueChange={(itemValue) => setSelectedEndTime(itemValue)}
                  style={styles.picker}
                >
                  {timeOptions.filter(hour => hour > selectedStartTime).map((hour) => (
                    <Picker.Item key={hour} label={`${hour}:00`} value={hour} />
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
                setSelectedStartTime(timeOptions[0]);
                setSelectedEndTime(timeOptions[1]);
              }}
            >
              <Text style={styles.actionButtonText}>수정 취소</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.timetableTitle}>내 시간표 목록</Text>
        {renderTimetableList()}
      </View>
    </ScrollView>
  );
};

export default TimetableScreen;

const styles = StyleSheet.create({
  scrollViewContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  timetableTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 20,
    color: '#333',
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
  },
  noDataText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
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
  entryContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  entryText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonGroup: {
    flexDirection: 'row',
  },
  editButton: {
    color: 'blue',
    marginRight: 10,
  },
  deleteButton: {
    color: 'red',
  },
});