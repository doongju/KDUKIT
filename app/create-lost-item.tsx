// app/(tabs)/create-lost-item.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, storage } from '../firebaseConfig';

const MAX_IMAGES = 5;

export default function CreateLostItemScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();

  const params = useLocalSearchParams(); 
  const { type } = params;
  
  const mode = type === 'found' ? 'found' : 'lost'; 

  const title = mode === 'lost' ? '분실물 등록' : '습득물 등록';
  const primaryColor = mode === 'lost' ? '#ff6b6b' : '#4d96ff';
  const itemNameLabel = mode === 'lost' ? '무엇을 잃어버리셨나요?' : '무엇을 주우셨나요?';
  const locationLabel = mode === 'lost' ? '어디서 잃어버리셨나요?' : '어디서 주우셨나요?';
  
  // 버튼 텍스트
  const buttonText = mode === 'lost' ? '분실물 등록하기' : '습득물 등록하기';
  
  const itemNamePlaceholder = mode === 'lost' ? '예: 파란색 에어팟 케이스' : '예: 검은색 우산';
  const locationPlaceholder = mode === 'lost' ? '예: 중앙 도서관 1층 열람실' : '예: 학생회관 2층 정수기';

  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [lostLocation, setLostLocation] = useState('');
  
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // 화면 포커스 시 초기화
  useFocusEffect(
    useCallback(() => {
      setItemName('');
      setDescription('');
      setLostLocation('');
      setSelectedImages([]);
      setLoading(false);
      setUploadingImage(false);
    }, [])
  );

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
        '사진을 업로드하려면 갤러리 접근 권한이 필요합니다.\n설정에서 권한을 허용해주세요.',
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
    if (uri.startsWith('http')) return uri;

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
      Alert.alert("로그인 필요", "물건을 등록하려면 로그인이 필요합니다.");
      return;
    }
    if (!itemName.trim() || !lostLocation.trim()) {
      Alert.alert('필수 정보 누락', `물품명과 장소를 꼭 입력해주세요.`);
      return;
    }

    setLoading(true);
    setUploadingImage(true);

    try {
      const uploadPromises = selectedImages.map(uri => uploadSingleImage(uri));
      const uploadedUrls = await Promise.all(uploadPromises);
      const validUrls = uploadedUrls.filter((url): url is string => url !== null);
      
      const mainImageUrl = validUrls.length > 0 ? validUrls[0] : null;

      const itemData = {
        postType: mode, 
        type: 'lost-item', 
        
        itemName: itemName.trim(),
        description: description.trim(),
        location: lostLocation.trim(),
        imageUrl: mainImageUrl, 
        imageUrls: validUrls,   
        status: 'unresolved',
        creatorId: user.uid,
        creatorName: user.displayName || '익명',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "lostAndFoundItems"), itemData);
      
      Alert.alert('등록 완료', '성공적으로 등록되었습니다.', [
        { text: '확인', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      if (error.code === 'permission-denied') {
          Alert.alert("이용 제한 🚫", "신고 누적으로 인해 작성이 제한되었습니다.");
      } else {
          console.error("등록 에러:", error);
          Alert.alert("등록 실패", "오류가 발생했습니다.");
      }
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
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{width: 40}} /> 
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        
        {/* 사진 등록 섹션 */}
        <View style={styles.sectionContainer}>
          <View style={styles.labelRow}>
             <Text style={styles.sectionTitle}>사진 첨부</Text>
             <Text style={styles.imageCountText}>{selectedImages.length}/{MAX_IMAGES}</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageList}>
            {/* 사진 추가 버튼 */}
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

            {/* 선택된 사진 미리보기 */}
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

        {/* 등록 버튼 (요청하신 스타일 유지 + 약간의 여백 조정) */}
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
        
        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  
  // 헤더 스타일
  headerBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F3F4F6' 
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },

  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },

  // 섹션 공통
  sectionContainer: { marginBottom: 30 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  imageCountText: { fontSize: 13, color: '#6B7280' },

  // 이미지 리스트 스타일
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

  // 입력 폼 스타일
  formContainer: { gap: 24, marginBottom: 40 },
  inputGroup: { gap: 8 },
  label: { fontSize: 15, fontWeight: '600', color: '#374151' },
  input: { 
    backgroundColor: '#F3F4F6', // 부드러운 회색 배경
    borderRadius: 12, 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    fontSize: 16, 
    color: '#111' 
  },
  multilineInput: { minHeight: 150, paddingVertical: 16 },

  // 등록 버튼 스타일 (기존 유지)
  registerButton: { 
    paddingVertical: 18, 
    borderRadius: 12, 
    alignItems: 'center', 
    elevation: 2, // 안드로이드 그림자
    shadowColor: "#000", // iOS 그림자
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  disabledButton: { backgroundColor: '#D1D5DB' },
  registerButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});