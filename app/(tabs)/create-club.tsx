// app/(tabs)/create-club.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { db, storage } from '../../firebaseConfig';

const ACTIVITY_FIELDS = ['학술', '스포츠', '봉사', '창작', '예술', '기타'];
const MEMBER_LIMIT_OPTIONS = [...Array.from({ length: 11 }, (_, i) => (i + 2).toString()), '기타 (직접 입력)'];
const MAX_IMAGES = 10;

export default function CreateClubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const scrollViewRef = useRef<ScrollView>(null);

  const [clubName, setClubName] = useState('');
  const [description, setDescription] = useState('');
  const [activityField, setActivityField] = useState('학술');
  
  const [memberLimit, setMemberLimit] = useState<string>('2'); 
  const [isCustomLimit, setIsCustomLimit] = useState(false); 

  const [creatingPost, setCreatingPost] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'activityField' | 'memberLimit' | null>(null);

  const handleBack = useCallback(() => {
    router.replace('/(tabs)/clublist');
    return true; 
  },[router]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => backHandler.remove();
  }, [handleBack]);

  useEffect(() => {
    if (params.postId) {
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
      
      const initImg = params.initialImageUrl as string;
      if (initImg && initImg.startsWith('http')) {
          setImageUrls([initImg]);
      } else {
          setImageUrls([]);
      }
    } else {
      resetForm();
    }
  }, [params.postId, params.t]);

  const resetForm = () => {
    setClubName('');
    setDescription('');
    setActivityField('학술');
    setMemberLimit('2');
    setIsCustomLimit(false);
    setImageUrls([]);
  };

  const pickImage = async () => {
    if (!currentUser) { Alert.alert("로그인 필요", "로그인이 필요합니다."); return; }
    if (imageUrls.length >= MAX_IMAGES) {
        Alert.alert("알림", `사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
        return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        '권한 필요',
        '설정에서 사진 라이브러리 접근 권한을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정으로 이동', onPress: () => Linking.openSettings() } 
        ]
      );    
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, 
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - imageUrls.length,
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newUris = result.assets.map(asset => asset.uri);
      setImageUrls(prev => [...prev, ...newUris].slice(0, MAX_IMAGES));
    }
  };

  const removeImage = (indexToRemove: number) => {
    setImageUrls(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const uploadSingleImage = async (uri: string): Promise<string | null> => {
    if (!currentUser) return null; 
    if (uri.startsWith('http') || uri.startsWith('https')) return uri;

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `club_images/${currentUser.uid}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`; 
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Error uploading image:", error);
      return null;
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
        return Alert.alert("모든 입력 칸을 채워야 합니다."); 
    }

    const limitNumber = parseInt(memberLimit, 10);
    if (isNaN(limitNumber) || limitNumber < 2) {
        return Alert.alert("모집 인원은 2명 이상이어야 합니다.");
    }

    setCreatingPost(true);
    setUploadingImage(true);

    try {
      const uploadPromises = imageUrls.map(uri => uploadSingleImage(uri));
      const uploadedUrls = await Promise.all(uploadPromises);
      const finalImageUrls = uploadedUrls.filter((url): url is string => url !== null);

      if (imageUrls.length > 0 && finalImageUrls.length === 0) {
           setCreatingPost(false);
           setUploadingImage(false);
           Alert.alert("오류", "이미지 업로드에 실패했습니다.");
           return;
      }

      const targetPostId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
      const postData = {
          clubName: clubName.trim(),
          description: description.trim(),
          activityField,
          memberLimit: limitNumber,
          imageUrl: finalImageUrls[0] || null, 
          imageUrls: finalImageUrls, 
          // ✨ [핵심 수정] type: 'club' 추가
          type: 'club', 
      };

      if (targetPostId) {
        await updateDoc(doc(db, 'clubPosts', targetPostId), postData);
        Alert.alert("수정 완료", "게시글이 수정되었습니다.");
      } else {
        await addDoc(collection(db, 'clubPosts'), {
            ...postData,
            currentMembers: [currentUser.uid],
            creatorId: currentUser.uid,
            createdAt: serverTimestamp(),
            type: 'club'
        });
        Alert.alert("등록 완료", "모집글이 등록되었습니다.");
      }
      router.replace('/(tabs)/clublist');
    } catch (error: any) {
      if (error.code === 'permission-denied') {
        Alert.alert("이용 제한", "신고 누적으로 인해 글 작성이 제한되었습니다.");
      } else {
        Alert.alert("실패", "저장 중 오류가 발생했습니다.");
      }
    } finally {
      setCreatingPost(false);
      setUploadingImage(false);
    }
  };

  const renderModalContent = () => {
    const options = modalType === 'activityField' ? ACTIVITY_FIELDS : MEMBER_LIMIT_OPTIONS;
    const currentVal = modalType === 'activityField' ? activityField : (isCustomLimit ? '기타 (직접 입력)' : memberLimit);

    return (
        <ScrollView style={modalStyles.scrollView} showsVerticalScrollIndicator={false}>
            {options.map((option, index) => (
                <TouchableOpacity
                    key={index}
                    style={[modalStyles.optionItem, currentVal === option && modalStyles.selectedOption]}
                    onPress={() => handleSelectOption(option)}
                >
                    <Text style={[modalStyles.optionText, currentVal === option && modalStyles.selectedText]}>
                        {option}{modalType === 'memberLimit' && option !== '기타 (직접 입력)' ? '명' : ''}
                    </Text>
                    {currentVal === option && <Ionicons name="checkmark" size={20} color="#0062ffff" />}
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? 10 : 0 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{params.postId ? "모집글 수정" : "새 모임 만들기"}</Text>
        <TouchableOpacity onPress={handleSave} disabled={creatingPost || uploadingImage}>
             {creatingPost ? <ActivityIndicator size="small" color="#0062ffff"/> : (
                 <Text style={styles.saveButtonText}>완료</Text>
             )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{flex: 1}}
        keyboardVerticalOffset={0} 
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
              ref={scrollViewRef} 
              contentContainerStyle={styles.scrollContent} 
              showsVerticalScrollIndicator={false}
          >
              
              {/* 이미지 섹션 */}
              <View style={styles.imageSection}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageList}>
                      {imageUrls.length < MAX_IMAGES && (
                          <TouchableOpacity 
                              style={styles.addImageButton} 
                              onPress={pickImage} 
                              disabled={uploadingImage || creatingPost}
                          >
                              <Ionicons name="camera" size={24} color="#aaa" />
                              <Text style={styles.addImageText}>{imageUrls.length}/{MAX_IMAGES}</Text>
                          </TouchableOpacity>
                      )}
                      {imageUrls.map((uri, index) => (
                          <View key={index} style={styles.imageWrapper}>
                              <Image source={{ uri }} style={styles.selectedImage} />
                              <TouchableOpacity 
                                  style={styles.removeImageButton} 
                                  onPress={() => removeImage(index)}
                                  hitSlop={{top: 5, bottom: 5, left: 5, right: 5}}
                              >
                                  <Ionicons name="close" size={14} color="#fff" />
                              </TouchableOpacity>
                              {index === 0 && (
                                  <View style={styles.thumbnailBadge}>
                                      <Text style={styles.thumbnailText}>대표</Text>
                                  </View>
                              )}
                          </View>
                      ))}
                  </ScrollView>
              </View>

              {/* 입력 폼 */}
              <View style={styles.formContainer}>
                  <View style={styles.inputGroup}>
                      <Text style={styles.label}>모임 이름</Text>
                      <TextInput
                          style={styles.input}
                          placeholder="예: 맛집 탐방 동아리"
                          placeholderTextColor="#aaa"
                          value={clubName}
                          onChangeText={setClubName}
                          maxLength={30}
                      />
                  </View>

                  <View style={styles.rowContainer}>
                      <View style={[styles.inputGroup, {flex: 1, marginRight: 10}]}>
                          <Text style={styles.label}>활동 분야</Text>
                          <TouchableOpacity 
                              style={styles.selectButton} 
                              onPress={() => openModal('activityField')}
                          >
                              <Text style={styles.selectButtonText}>{activityField}</Text>
                              <Ionicons name="chevron-down" size={16} color="#666" />
                          </TouchableOpacity>
                      </View>

                      <View style={[styles.inputGroup, {flex: 1}]}>
                          <Text style={styles.label}>모집 정원</Text>
                          <TouchableOpacity 
                              style={styles.selectButton} 
                              onPress={() => openModal('memberLimit')}
                          >
                              <Text style={styles.selectButtonText}>
                                  {isCustomLimit ? '직접 입력' : `${memberLimit}명`}
                              </Text>
                              <Ionicons name="chevron-down" size={16} color="#666" />
                          </TouchableOpacity>
                      </View>
                  </View>

                  {isCustomLimit && (
                      <View style={[styles.inputGroup, { marginTop: -10 }]}>
                          <TextInput
                              style={styles.input}
                              placeholder="모집 인원 (숫자만 입력)"
                              placeholderTextColor="#aaa"
                              value={memberLimit}
                              onChangeText={(text) => setMemberLimit(text.replace(/[^0-9]/g, ''))}
                              keyboardType="number-pad"
                          />
                      </View>
                  )}

                  <View style={styles.inputGroup}>
                      <Text style={styles.label}>소개글</Text>
                      <TextInput
                          style={[styles.input, styles.textArea]}
                          placeholder="어떤 활동을 하는지, 어떤 분을 찾는지 자세히 적어주세요."
                          placeholderTextColor="#aaa"
                          multiline
                          textAlignVertical="top"
                          value={description}
                          onChangeText={setDescription}
                          // ✨ 핵심: 내용 사이즈(줄바꿈)가 바뀌면 스크롤을 맨 아래로 내림
                          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                      />
                  </View>
              </View>
              
              {/* ✨ 키보드가 올라왔을 때를 대비한 넉넉한 하단 여백 */}
              <View style={{ height: 120 }} />

          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={closeModal}
      >
        <View style={modalStyles.overlay}>
            <TouchableOpacity style={modalStyles.backdrop} onPress={closeModal} />
            <View style={modalStyles.modalContainer}>
                <View style={modalStyles.handleContainer}>
                    <View style={modalStyles.handleBar} />
                </View>
                <View style={modalStyles.modalHeader}>
                    <Text style={modalStyles.modalTitle}>
                        {modalType === 'activityField' ? '활동 분야' : '모집 인원'}
                    </Text>
                </View>
                {renderModalContent()} 
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f1f3f5',
    zIndex: 10, 
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#0062ffff' },

  scrollContent: { padding: 20 },

  imageSection: { marginBottom: 20 },
  imageList: { alignItems: 'center', paddingVertical: 5, gap: 10, paddingRight: 10 },
   addImageButton: { 
    width: 80, height: 80, 
    borderRadius: 8, borderWidth: 1, borderColor: '#ddd', 
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' 
  },
  addImageText: { fontSize: 12, color: '#888', marginTop: 4, fontWeight: '600' },
  
  imageWrapper: { position: 'relative', marginRight: 10 },
  selectedImage: { width: 80, height: 80, borderRadius: 12, backgroundColor: '#eee' },
  removeImageButton: {
      position: 'absolute', 
      top: 4, 
      right: 4,
      width: 20, // 크기 고정
      height: 20, 
      borderRadius: 10, // 완벽한 원형
      backgroundColor: 'rgba(0,0,0,0.6)', // 반투명 검은색 배경
      justifyContent: 'center', 
      alignItems: 'center', 
      zIndex: 1
  },
  thumbnailBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 2,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    alignItems: 'center'
  },
  thumbnailText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  formContainer: { gap: 24 },
  inputGroup: { gap: 8 },
  rowContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  
  label: { fontSize: 14, fontWeight: '600', color: '#495057', marginLeft: 4 },
  input: {
    backgroundColor: '#f1f3f5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#333',
  },
  selectButton: {
    backgroundColor: '#f1f3f5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  selectButtonText: { fontSize: 16, color: '#333' },
  textArea: { minHeight: 150, lineHeight: 24 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  modalContainer: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '60%', paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  handleContainer: { alignItems: 'center', paddingVertical: 12 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0' },
  modalHeader: { alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  scrollView: { paddingHorizontal: 20 },
  optionItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f3f5',
  },
  optionText: { fontSize: 16, color: '#333' },
  selectedOption: { backgroundColor: '#f8f9fa' },
  selectedText: { color: '#0062ffff', fontWeight: 'bold' },
});