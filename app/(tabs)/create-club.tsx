// app/(tabs)/create-club.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router'; // useFocusEffect 제거
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react'; // useEffect 사용
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { db, storage } from '../../firebaseConfig';

const ACTIVITY_FIELDS = ['학술', '스포츠', '봉사', '창작', '예술', '기타'];
const MEMBER_LIMIT_OPTIONS = [...Array.from({ length: 11 }, (_, i) => (i + 2).toString()), '기타 (직접 입력)'];

export default function CreateClubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams(); 
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [clubName, setClubName] = useState('');
  const [description, setDescription] = useState('');
  const [activityField, setActivityField] = useState('학술');
  
  const [memberLimit, setMemberLimit] = useState<string>('2'); 
  const [isCustomLimit, setIsCustomLimit] = useState(false); 

  const [creatingPost, setCreatingPost] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'activityField' | 'memberLimit' | null>(null);

  // ✨ [핵심 수정] useEffect로 변경 (화면 진입 시 1회만 실행)
  // params.postId(수정할 글 ID)나 params.t(새 글 타임스탬프)가 바뀔 때만 실행됨
  useEffect(() => {
    if (params.postId) {
      // ✏️ 수정 모드: 데이터 채워넣기
      setClubName(params.initialClubName as string || '');
      setDescription(params.initialDescription as string || '');
      setActivityField(params.initialActivityField as string || '학술');
      
      const limit = params.initialMemberLimit as string;
      if (MEMBER_LIMIT_OPTIONS.includes(limit)) {
          setMemberLimit(limit);
          setIsCustomLimit(false);
      } else {
          setMemberLimit(limit);
          setIsCustomLimit(true); 
      }
      setImageUrl((params.initialImageUrl as string) || null);

    } else {
      // ➕ 새 글 모드: 폼 초기화
      resetForm();
    }
  }, [params.postId, params.t]); // 의존성 배열 중요!

  const resetForm = () => {
    setClubName('');
    setDescription('');
    setActivityField('학술');
    setMemberLimit('2');
    setIsCustomLimit(false);
    setImageUrl(null);
  };

  const pickImage = async () => {
    if (!currentUser) { Alert.alert("로그인 필요", "로그인이 필요합니다."); return; }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다.'); return; }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      // ✨ 여기서 state를 바꿔도 useEffect가 다시 돌지 않으므로 초기화되지 않음!
      setImageUrl(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    if (!currentUser) return null; 
    if (uri.startsWith('http')) return uri; // 이미 업로드된 이미지면 그대로 사용

    setUploadingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `club_images/${currentUser.uid}_${Date.now()}.jpg`; 
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Error uploading image:", error);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const closeModal = () => setIsModalVisible(false);
  const openModal = (type: 'activityField' | 'memberLimit') => { setModalType(type); setIsModalVisible(true); };
  
  const handleSelectOption = (value: string) => {
    if (modalType === 'activityField') { 
        setActivityField(value); 
    } else if (modalType === 'memberLimit') { 
        if (value === '기타 (직접 입력)') {
            setIsCustomLimit(true);
            setMemberLimit(''); 
        } else {
            setIsCustomLimit(false);
            setMemberLimit(value); 
        }
    }
    closeModal();
  };

  const handleSave = async () => {
    if (!currentUser) { Alert.alert("로그인 필요", "로그인이 필요합니다."); return; }
    
    if (!clubName.trim() || !description.trim() || !activityField || !memberLimit) { 
        return Alert.alert("필수 입력", "모든 필드를 채워주세요."); 
    }

    const limitNumber = parseInt(memberLimit, 10);
    if (isNaN(limitNumber) || limitNumber < 2) {
        return Alert.alert("인원 오류", "모집 인원은 2명 이상의 숫자여야 합니다.");
    }

    setCreatingPost(true);
    let uploadedImageUrl: string | null = null;
    
    if (imageUrl) {
      uploadedImageUrl = await uploadImage(imageUrl);
      // 이미지가 있었는데 업로드가 실패했고, 기존 URL도 아니라면 에러 처리
      if (imageUrl && !uploadedImageUrl) { 
          setCreatingPost(false); 
          Alert.alert("오류", "이미지 업로드에 실패했습니다."); 
          return; 
      }
    }

    try {
      // params.postId가 배열일 수 있으므로 안전하게 처리
      const targetPostId = Array.isArray(params.postId) ? params.postId[0] : params.postId;

      if (targetPostId) {
        // ✏️ [수정] 기존 문서 업데이트
        const postRef = doc(db, 'clubPosts', targetPostId);
        await updateDoc(postRef, {
            clubName: clubName.trim(),
            description: description.trim(),
            activityField,
            memberLimit: limitNumber,
            imageUrl: uploadedImageUrl || null, 
        });
        Alert.alert("수정 완료", "게시글이 수정되었습니다.");
      } else {
        // ➕ [생성] 새 문서 추가
        await addDoc(collection(db, 'clubPosts'), {
            clubName: clubName.trim(),
            description: description.trim(),
            activityField,
            memberLimit: limitNumber,
            currentMembers: [currentUser.uid],
            creatorId: currentUser.uid,
            createdAt: serverTimestamp(),
            imageUrl: uploadedImageUrl,
        });
        Alert.alert("등록 완료", "모집글이 등록되었습니다.");
      }
      
      router.replace('/(tabs)/clublist');

    } catch (error) {
      console.error("Error saving club post:", error);
      Alert.alert("실패", "저장 중 오류가 발생했습니다.");
    } finally {
      setCreatingPost(false);
    }
  };

  const renderModalContent = () => {
    const options = modalType === 'activityField' ? ACTIVITY_FIELDS : MEMBER_LIMIT_OPTIONS;
    const currentVal = modalType === 'activityField' ? activityField : (isCustomLimit ? '기타 (직접 입력)' : memberLimit);

    return (
        <ScrollView style={modalStyles.scrollView}>
            {options.map((option, index) => (
                <TouchableOpacity
                    key={index}
                    style={[modalStyles.optionItem, currentVal === option && modalStyles.selectedOption]}
                    onPress={() => handleSelectOption(option)}
                >
                    <Text style={[modalStyles.optionText, currentVal === option && modalStyles.selectedText]}>
                        {option}{modalType === 'memberLimit' && option !== '기타 (직접 입력)' ? '명' : ''}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: 0 }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}> 
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{params.postId ? "모집글 수정" : "새 동아리 모집 글쓰기"}</Text>
        <View style={styles.rightPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.label}>동아리/학회 이름 <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="예: KDU 코딩 클럽"
          value={clubName}
          onChangeText={setClubName}
          editable={!creatingPost}
        />

        <Text style={styles.label}>상세 설명 <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="활동 내용, 모임 시간 등을 자세히 적어주세요."
          multiline
          value={description}
          onChangeText={setDescription}
          editable={!creatingPost}
        />

        <Text style={styles.label}>활동 분야 <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity 
          style={styles.pickerDisplay} 
          onPress={() => openModal('activityField')}
          disabled={creatingPost}
        >
          <Text style={styles.pickerDisplayText}>{activityField}</Text>
          <Ionicons name="chevron-down" size={20} color="#333" />
        </TouchableOpacity>

        <Text style={styles.label}>모집 인원 <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity 
          style={styles.pickerDisplay} 
          onPress={() => openModal('memberLimit')}
          disabled={creatingPost}
        >
          <Text style={styles.pickerDisplayText}>
             {isCustomLimit ? '직접 입력' : `${memberLimit}명`}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#333" />
        </TouchableOpacity>

        {isCustomLimit && (
            <View style={styles.customInputContainer}>
                <TextInput
                    style={styles.customInput}
                    placeholder="숫자만 입력 (예: 20)"
                    value={memberLimit}
                    onChangeText={(text) => setMemberLimit(text.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    editable={!creatingPost}
                />
                <Text style={styles.customInputSuffix}>명</Text>
            </View>
        )}

        <Text style={styles.label}>대표 이미지 (선택)</Text>
        <TouchableOpacity 
          style={[styles.imagePicker, (uploadingImage || creatingPost) && { opacity: 0.6 }]} 
          onPress={pickImage} 
          disabled={uploadingImage || creatingPost}
        >
          {uploadingImage ? (
            <ActivityIndicator size="small" color="#0062ffff" />
          ) : imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.previewImage} />
          ) : (
            <>
              <Ionicons name="image-outline" size={40} color="#999" />
              <Text style={styles.imagePickerText}>이미지를 선택하거나 클릭하여 변경</Text>
            </>
          )}
        </TouchableOpacity>
        {imageUrl && !uploadingImage && (
          <TouchableOpacity onPress={() => setImageUrl(null)} style={styles.removeImageButton}>
            <Text style={styles.removeImageButtonText}>이미지 삭제</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.submitButton, (uploadingImage || creatingPost) && styles.submitButtonDisabled]} 
          onPress={handleSave}
          disabled={uploadingImage || creatingPost}
        >
          {(uploadingImage || creatingPost) ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{params.postId ? "수정 완료" : "모집 글 작성"}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={closeModal}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modalContainer}>
            <View style={modalStyles.modalHeader}>
              <Text style={modalStyles.modalTitle}>
                {modalType === 'activityField' ? '활동 분야 선택' : '모집 인원 선택'}
              </Text>
              <TouchableOpacity onPress={closeModal} style={modalStyles.closeButton}>
                <Ionicons name="close" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            {renderModalContent()} 
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 15, paddingBottom: 10, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  rightPlaceholder: { width: 38 }, 
  scrollContent: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 8, marginTop: 15 },
  required: { color: 'red' },
  input: {
    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12,
    fontSize: 16, borderWidth: 1, borderColor: '#ddd', marginBottom: 10,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  pickerDisplay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12,
    borderWidth: 1, borderColor: '#ddd', marginBottom: 10,
  },
  pickerDisplayText: { fontSize: 16, color: '#333' },
  
  customInputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 8, borderWidth: 1, borderColor: '#0062ffff', marginBottom: 10,
  },
  customInput: {
    flex: 1, paddingHorizontal: 15, paddingVertical: 12, fontSize: 16,
  },
  customInputSuffix: {
    paddingRight: 15, fontSize: 16, fontWeight: 'bold', color: '#333',
  },

  imagePicker: {
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd',
    height: 150, alignItems: 'center', justifyContent: 'center', marginTop: 10, overflow: 'hidden',
  },
  imagePickerText: { fontSize: 14, color: '#999', marginTop: 10 },
  previewImage: { width: '100%', height: '100%', borderRadius: 8, resizeMode: 'cover' },
  removeImageButton: {
    backgroundColor: '#dc3545', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8,
    alignSelf: 'flex-start', marginTop: 10,
  },
  removeImageButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  submitButton: {
    backgroundColor: '#0062ffff', borderRadius: 10, paddingVertical: 15, alignItems: 'center',
    justifyContent: 'center', marginTop: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 5,
  },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  submitButtonDisabled: { backgroundColor: '#cccccc' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end', alignItems: 'center',
  },
  modalContainer: {
    width: '100%', maxHeight: '60%', backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 30 : 10,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  closeButton: { padding: 5 },
  scrollView: { paddingHorizontal: 20, maxHeight: 300 },
  optionItem: {
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', alignItems: 'center',
  },
  optionText: { fontSize: 17, color: '#333' },
  selectedOption: { backgroundColor: '#e8f0fe', borderRadius: 8 },
  selectedText: { color: '#0062ffff', fontWeight: 'bold' },
});