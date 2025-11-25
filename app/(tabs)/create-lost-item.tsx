// app/(tabs)/create-lost-item.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, storage } from '../../firebaseConfig';

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
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, 
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    // ✨ [최적화] 이미 URL이면 업로드 스킵
    if (uri.startsWith('http')) return uri;

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const filename = `lost-and-found/${Date.now()}.jpg`; 
      const storageRef = ref(storage, filename);
      
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (e) {
      console.error("이미지 업로드 실패:", e);
      throw e;
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

    try {
      let imageUrl = null;
      if (imageUri) {
        imageUrl = await uploadImage(imageUri);
        if (!imageUrl && imageUri.startsWith('http') === false) {
            Alert.alert("오류", "이미지 업로드 실패");
            setLoading(false);
            return;
        }
      }

      const itemData = {
        type: mode,
        itemName: itemName.trim(),
        description: description.trim(),
        location: lostLocation.trim(),
        imageUrl: imageUrl, 
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
        
        <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="camera" size={40} color="#ccc" />
              <Text style={styles.imagePlaceholderText}>사진 추가하기</Text>
            </View>
          )}
        </TouchableOpacity>
        
        {/* ✨ 이미지 삭제 버튼 추가 */}
        {imageUri && (
            <TouchableOpacity onPress={() => setImageUri(null)} style={styles.removeImageButton}>
                <Text style={styles.removeImageButtonText}>이미지 삭제</Text>
            </TouchableOpacity>
        )}

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
  imagePicker: { width: '100%', height: 200, backgroundColor: '#f0f0f0', borderRadius: 12, marginBottom: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholder: { alignItems: 'center' },
  imagePlaceholderText: { color: '#888', marginTop: 8, fontSize: 14 },
  removeImageButton: { backgroundColor: '#dc3545', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 10 },
  removeImageButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});