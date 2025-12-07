// app/(tabs)/create-lost-item.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, storage } from '../firebaseConfig';

const MAX_IMAGES = 5;

export default function CreateLostItemScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();

  // ✨ params 받기
  const params = useLocalSearchParams(); 
  const { 
    type, 
    mode: pageMode, // 'edit' 확인용
    postId,
    initialItemName,
    initialDescription,
    initialLocation,
    initialImageUrls,
    initialType 
  } = params;
  
  // 수정 모드인지 확인
  const isEditMode = pageMode === 'edit';
  
  // 타입 결정 (수정 모드면 initialType 우선, 아니면 type 파라미터 사용)
  const currentType = (initialType as string) || (type === 'found' ? 'found' : 'lost');
  
  const titleText = isEditMode ? '게시물 수정' : (currentType === 'lost' ? '분실물 등록' : '습득물 등록');
  const primaryColor = currentType === 'lost' ? '#ff6b6b' : '#4d96ff';
  const itemNameLabel = currentType === 'lost' ? '무엇을 잃어버리셨나요?' : '무엇을 주우셨나요?';
  const locationLabel = currentType === 'lost' ? '어디서 잃어버리셨나요?' : '어디서 주우셨나요?';
  const buttonText = isEditMode ? '수정 완료' : (currentType === 'lost' ? '분실물 등록하기' : '습득물 등록하기');
  
  const itemNamePlaceholder = currentType === 'lost' ? '예: 파란색 에어팟 케이스' : '예: 검은색 우산';
  const locationPlaceholder = currentType === 'lost' ? '예: 중앙 도서관 1층 열람실' : '예: 학생회관 2층 정수기';

  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [lostLocation, setLostLocation] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ✨ [핵심] 수정 모드일 때 초기값 세팅
  useEffect(() => {
    if (isEditMode) {
      setItemName(initialItemName as string || '');
      setDescription(initialDescription as string || '');
      setLostLocation(initialLocation as string || '');
      
      try {
        if (initialImageUrls) {
          const images = JSON.parse(initialImageUrls as string);
          if (Array.isArray(images)) setSelectedImages(images);
        }
      } catch (e) {
        console.log("이미지 파싱 에러 (무시 가능):", e);
      }
    }
  }, [isEditMode, initialItemName, initialDescription, initialLocation, initialImageUrls]);

  const handleBack = useCallback(() => {
    router.back();
    return true; 
  },[router]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => backHandler.remove();
  }, [handleBack]);

  const pickImage = async () => {
    if (selectedImages.length >= MAX_IMAGES) {
        Alert.alert("알림", `최대 ${MAX_IMAGES}장까지만 등록 가능합니다.`);
        return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        '권한 필요',
        '사진을 업로드하려면 갤러리 접근 권한이 필요합니다.',
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
      selectionLimit: MAX_IMAGES - selectedImages.length, 
      quality: 0.5, 
    });

    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map(asset => asset.uri);
      setSelectedImages(prev => [...prev, ...newUris]);
    }
  };

  const removeImage = (indexToRemove: number) => {
    setSelectedImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const uploadSingleImage = async (uri: string) => {
    if (uri.startsWith('http')) return uri; // 이미 업로드된 이미지는 패스

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const filename = `lost-and-found/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`; 
      const storageRef = ref(storage, filename);
      
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (e) {
      console.error("이미지 업로드 실패:", e);
      return null;
    }
  };

  const handleRegisterItem = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("로그인 필요", "로그인이 필요합니다.");
      return;
    }
    if (!itemName.trim() || !lostLocation.trim()) {
      Alert.alert('필수 정보 누락', `물품명과 장소를 꼭 입력해주세요.`);
      return;
    }

    setLoading(true);
    setUploadingImage(true);

    try {
      // 이미지 업로드
      const uploadPromises = selectedImages.map(uri => uploadSingleImage(uri));
      const uploadedUrls = await Promise.all(uploadPromises);
      const validUrls = uploadedUrls.filter((url): url is string => url !== null);
      const mainImageUrl = validUrls.length > 0 ? validUrls[0] : null;

      const itemData: any = {
        postType: currentType, 
        type: 'lost-item', 
        itemName: itemName.trim(),
        description: description.trim(),
        location: lostLocation.trim(),
        imageUrl: mainImageUrl, 
        imageUrls: validUrls,   
      };

      if (isEditMode && postId) {
        // ✨ 수정 모드: updateDoc
        await updateDoc(doc(db, "lostAndFoundItems", postId as string), itemData);
        Alert.alert('수정 완료', '게시물이 수정되었습니다.', [
            { text: '확인', onPress: () => router.back() }
        ]);
      } else {
        // ✨ 새 글 작성: addDoc
        
        // 작성자 정보 가져오기 (새 글일 때만)
        const userDocRef = doc(db, "users", user.uid);
        const userSnapshot = await getDoc(userDocRef);
        let authorName = "익명"; 
        if (userSnapshot.exists()) {
            const userData = userSnapshot.data();
            if (userData.displayId) authorName = userData.displayId; 
        }

        itemData.status = 'unresolved';
        itemData.creatorId = user.uid;
        itemData.creatorName = authorName;
        itemData.createdAt = serverTimestamp();

        await addDoc(collection(db, "lostAndFoundItems"), itemData);
        Alert.alert('등록 완료', '성공적으로 등록되었습니다.', [
            { text: '확인', onPress: () => router.back() }
        ]);
      }

    } catch (error: any) {
      console.error("저장 에러:", error);
      Alert.alert("실패", "저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setUploadingImage(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#333" /> 
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{titleText}</Text>
        <View style={{width: 40}} /> 
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            
            {/* 사진 등록 섹션 */}
            <View style={styles.sectionContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.sectionTitle}>사진 첨부</Text>
                <Text style={styles.imageCountText}>{selectedImages.length}/{MAX_IMAGES}</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageList}>
                {selectedImages.length < MAX_IMAGES && (
                  <TouchableOpacity 
                    style={styles.addImageButton} 
                    onPress={pickImage}
                    disabled={loading}
                  >
                    <Ionicons name="camera" size={24} color={primaryColor} />
                    <Text style={[styles.addImageText, {color: primaryColor}]}>추가</Text>
                  </TouchableOpacity>
                )}

                {selectedImages.map((uri, index) => (
                  <View key={index} style={styles.imageItemWrapper}>
                    <Image source={{ uri }} style={styles.imageItem} />
                    <TouchableOpacity 
                      style={styles.deleteButton} 
                      onPress={() => removeImage(index)}
                      disabled={loading}
                    >
                      <Ionicons name="close-circle" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* 입력 폼 섹션 */}
            <View style={styles.formContainer}>
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>{itemNameLabel}</Text>
                    <TextInput
                        placeholder={itemNamePlaceholder}
                        value={itemName}
                        onChangeText={setItemName}
                        style={styles.input}
                        placeholderTextColor="#9CA3AF"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>{locationLabel}</Text>
                    <TextInput
                        placeholder={locationPlaceholder}
                        value={lostLocation}
                        onChangeText={setLostLocation}
                        style={styles.input}
                        placeholderTextColor="#9CA3AF"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>상세 내용</Text>
                    <TextInput
                        placeholder="습득/분실 당시 상황이나 물품의 특징을 자세히 적어주세요."
                        value={description}
                        onChangeText={setDescription}
                        style={[styles.input, styles.multilineInput]}
                        multiline
                        textAlignVertical="top"
                        placeholderTextColor="#9CA3AF"
                    />
                </View>
            </View>

            {/* 등록/수정 버튼 */}
            <TouchableOpacity 
              style={[
                styles.registerButton, 
                { backgroundColor: primaryColor },
                loading && styles.disabledButton
              ]} 
              onPress={handleRegisterItem}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.registerButtonText}>{buttonText}</Text>
              )}
            </TouchableOpacity>
            
            <View style={{height: 60}} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  
  headerBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#fff', 
    zIndex: 10,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },

  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },

  sectionContainer: { marginBottom: 30 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  imageCountText: { fontSize: 13, color: '#6B7280' },

  imageList: { gap: 12 },
  addImageButton: { 
    width: 80, height: 80, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#F9FAFB' 
  },
  addImageText: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  imageItemWrapper: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  imageItem: { width: '100%', height: '100%', resizeMode: 'cover' },
  deleteButton: {
      position: 'absolute', top: 4, right: 4,
      zIndex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20
  },

  formContainer: { gap: 24, marginBottom: 40 },
  inputGroup: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600', color: '#374151' },
  input: { 
    backgroundColor: '#F3F4F6', 
    borderRadius: 12, 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    fontSize: 16, 
    color: '#111' 
  },
  multilineInput: { minHeight: 150, paddingVertical: 16 },

  registerButton: { 
    paddingVertical: 18, 
    borderRadius: 12, 
    alignItems: 'center', 
    elevation: 2, 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  disabledButton: { backgroundColor: '#D1D5DB' },
  registerButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});