// app/(tabs)/create-lost-item.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking, // ✨ 추가: 설정으로 이동하기 위해 필요
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, storage } from '../../firebaseConfig';

const MAX_IMAGES = 5; // 최대 이미지 개수 제한 (5장)

export default function CreateLostItemScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = getAuth();

  const { type } = useLocalSearchParams();
  const mode = type === 'found' ? 'found' : 'lost'; 

  const title = mode === 'lost' ? '분실물 등록' : '습득물 등록';
  const primaryColor = mode === 'lost' ? '#ff6b6b' : '#4d96ff';
  const itemNameLabel = mode === 'lost' ? '분실물 이름' : '습득물 이름';
  const locationLabel = mode === 'lost' ? '분실 장소' : '습득 장소';
  const buttonText = mode === 'lost' ? '분실물로 등록하기' : '습득물로 등록하기';
  const itemNamePlaceholder = mode === 'lost' ? '예: 파란색 에어팟 케이스' : '예: 검은색 우산';
  const locationPlaceholder = mode === 'lost' ? '예: 중앙 도서관 1층 열람실' : '예: 학생회관 2층 정수기';

  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [lostLocation, setLostLocation] = useState('');
  
  // 여러 장의 이미지를 관리하기 위한 배열 상태
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const pickImage = async () => {
    // 1. 최대 개수 체크
    if (selectedImages.length >= MAX_IMAGES) {
        Alert.alert("알림", `최대 ${MAX_IMAGES}장까지만 등록 가능합니다.`);
        return;
    }

    // 2. ✨ 권한 확인 및 요청 (추가된 로직)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        '권한 필요',
        '사진을 업로드하려면 갤러리 접근 권한이 필요합니다.\n설정에서 권한을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정으로 이동', onPress: () => Linking.openSettings() } // ✨ 설정창으로 이동
        ]
      );
      return;
    }

    // 3. 이미지 선택 (다중 선택)
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
    // 이미 URL이면 업로드 스킵
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
      Alert.alert('필수 정보 누락', `${itemNameLabel}과 ${locationLabel}을 꼭 입력해주세요.`);
      return;
    }

    setLoading(true);
    setUploadingImage(true);

    try {
      // 다중 이미지 병렬 업로드
      const uploadPromises = selectedImages.map(uri => uploadSingleImage(uri));
      const uploadedUrls = await Promise.all(uploadPromises);
      const validUrls = uploadedUrls.filter((url): url is string => url !== null);
      
      // 첫 번째 이미지를 대표 이미지로 사용
      const mainImageUrl = validUrls.length > 0 ? validUrls[0] : null;

      const itemData = {
        type: mode,
        itemName: itemName.trim(),
        description: description.trim(),
        location: lostLocation.trim(),
        imageUrl: mainImageUrl, // 대표 이미지
        imageUrls: validUrls,   // 전체 이미지 배열
        status: 'unresolved',
        creatorId: user.uid,
        creatorName: user.displayName || '익명',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "lostAndFoundItems"), itemData);
      
      Alert.alert('등록 완료', '성공적으로 등록되었습니다.', [
        { text: '확인', onPress: () => router.replace('/(tabs)/lost-and-found') }
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
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={primaryColor} /> 
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: primaryColor }]}>{title}</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        
        {/* 이미지 리스트 영역 */}
        <View style={styles.imageSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageList}>
                {selectedImages.length < MAX_IMAGES && (
                    <TouchableOpacity 
                        style={styles.addImageButton} 
                        onPress={pickImage}
                        disabled={loading}
                    >
                        <Ionicons name="camera" size={30} color="#ccc" />
                        <Text style={styles.addImageText}>
                            {selectedImages.length}/{MAX_IMAGES}
                        </Text>
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
                            <Ionicons name="close" size={12} color="#fff" />
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>
        </View>

        <Text style={styles.label}>{itemNameLabel}</Text>
        <TextInput
          placeholder={itemNamePlaceholder}
          value={itemName}
          onChangeText={setItemName}
          style={styles.input}
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>{locationLabel}</Text>
        <TextInput
          placeholder={locationPlaceholder}
          value={lostLocation}
          onChangeText={setLostLocation}
          style={styles.input}
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>상세 설명 (선택)</Text>
        <TextInput
          placeholder="특징을 자세히 적어주세요."
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.multilineInput]}
          multiline
          numberOfLines={4}
          placeholderTextColor="#999"
        />

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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { padding: 10 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', marginLeft: 10 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 15, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 10, backgroundColor: '#f9f9f9', fontSize: 16, color: '#333' },
  multilineInput: { height: 120, textAlignVertical: 'top', paddingTop: 12 },
  registerButton: { paddingVertical: 18, borderRadius: 10, alignItems: 'center', marginTop: 30, elevation: 5 },
  disabledButton: { backgroundColor: '#ccc' },
  registerButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  imageSection: { marginBottom: 10 },
  imageList: { gap: 10, paddingRight: 20 },
  addImageButton: { 
    width: 80, height: 80, 
    borderRadius: 8, borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9f9f9' 
  },
  addImageText: { fontSize: 12, color: '#aaa', marginTop: 4 },
  imageItemWrapper: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  imageItem: { width: '100%', height: '100%', resizeMode: 'cover' },
  deleteButton: {
      position: 'absolute', top: 4, right: 4,
      width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center', alignItems: 'center', zIndex: 1
  },
});