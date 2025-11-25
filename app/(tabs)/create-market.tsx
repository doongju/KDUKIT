// app/(tabs)/create-market.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react'; // useCallback 추가
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, storage } from '../../firebaseConfig';

const CATEGORIES = ['전공도서', '교양도서', '전자제품', '의류/잡화', '생활용품', '기타'];

export default function CreateMarketScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('전공도서');
  const [price, setPrice] = useState(''); 
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);

  // 초기화 및 데이터 로드
  useEffect(() => {
    if (params.postId) {
      setTitle(params.initialTitle as string || '');
      setDescription(params.initialDescription as string || '');
      setCategory(params.initialCategory as string || '전공도서');
      setPrice(params.initialPrice as string || '');
      
      // 기존 이미지 세팅 (http 체크)
      const initImg = params.initialImageUrl as string;
      if (initImg && initImg.startsWith('http')) {
          setImageUrl(initImg);
      } else {
          setImageUrl(null);
      }
    } else {
      resetForm();
    }
  }, [params.postId, params.t]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('전공도서');
    setPrice('');
    setImageUrl(null);
  };

  const pickImage = async () => {
    if (!currentUser) { Alert.alert("로그인 필요", "로그인이 필요합니다."); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.'); return; }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      setImageUrl(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    if (!currentUser) return null;
    if (uri.startsWith('http') || uri.startsWith('https')) return uri;

    setUploadingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `market_images/${currentUser.uid}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Image upload error:", error);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser) { Alert.alert("로그인 필요", "로그인이 필요합니다."); return; }
    if (!title.trim() || !description.trim() || !price.trim()) { Alert.alert("필수 입력", "모든 필드를 채워주세요."); return; }

    const priceNumber = parseInt(price.replace(/[^0-9]/g, ''), 10); 
    if (isNaN(priceNumber)) { Alert.alert("가격 오류", "올바른 가격을 입력해주세요."); return; }

    setIsSubmitting(true);
    
    let finalImageUrl: string | null = imageUrl; 

    if (imageUrl && !imageUrl.startsWith('http')) {
      finalImageUrl = await uploadImage(imageUrl);
      if (!finalImageUrl) { 
          setIsSubmitting(false); 
          Alert.alert("오류", "이미지 업로드 실패"); 
          return; 
      }
    }

    try {
      const postData = {
        title: title.trim(),
        description: description.trim(),
        category,
        price: priceNumber,
        imageUrl: finalImageUrl, 
        status: '판매중',
        creatorId: currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      if (params.postId) {
        const postRef = doc(db, 'marketPosts', params.postId as string);
        await updateDoc(postRef, {
            title: postData.title,
            description: postData.description,
            category: postData.category,
            price: postData.price,
            imageUrl: postData.imageUrl,
            updatedAt: postData.updatedAt
        });
        Alert.alert("수정 완료", "상품 정보가 수정되었습니다.");
      } else {
        await addDoc(collection(db, 'marketPosts'), {
          ...postData,
          createdAt: serverTimestamp(),
        });
        Alert.alert("등록 완료", "상품이 등록되었습니다.");
      }
      router.replace('/(tabs)/marketlist');

    } catch (error: any) {
      // 차단된 사용자에게 친절한 메시지 표시
      if (error.code === 'permission-denied' || error.message.includes('permission-denied')) {
        Alert.alert("이용 제한 🚫", "신고 누적(5회 이상)으로 인해 게시글 작성이 제한되었습니다.\n관리자에게 문의해주세요.");
      } else {
        console.error("Save error:", error);
        Alert.alert("실패", "저장 중 오류가 발생했습니다.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: 0 }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{params.postId ? "상품 수정" : "상품 등록"}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.label}>상품명 <Text style={styles.required}>*</Text></Text>
        <TextInput style={styles.input} placeholder="예: 전공책 팝니다" value={title} onChangeText={setTitle} />

        <Text style={styles.label}>판매 가격 (원) <Text style={styles.required}>*</Text></Text>
        <TextInput 
          style={styles.input} 
          placeholder="숫자만 입력 (예: 10000)" 
          value={price} 
          onChangeText={setPrice} 
          keyboardType="number-pad"
        />

        <Text style={styles.label}>카테고리 <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity style={styles.pickerDisplay} onPress={() => setIsModalVisible(true)}>
          <Text style={styles.pickerDisplayText}>{category}</Text>
          <Ionicons name="chevron-down" size={20} color="#333" />
        </TouchableOpacity>

        <Text style={styles.label}>상세 설명 <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="상품 상태, 거래 장소 등을 자세히 적어주세요."
          multiline
          value={description}
          onChangeText={setDescription}
        />

        <Text style={styles.label}>상품 이미지</Text>
        <TouchableOpacity 
            style={[styles.imagePicker, (uploadingImage || isSubmitting) && {opacity:0.6}]} 
            onPress={pickImage}
            disabled={uploadingImage || isSubmitting}
        >
          {uploadingImage ? <ActivityIndicator size="small" color="#0062ffff" /> : 
           imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.previewImage} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={40} color="#999" />
              <Text style={styles.imagePickerText}>사진 첨부하기</Text>
            </>
          )}
        </TouchableOpacity>
        
        {imageUrl && !uploadingImage && (
          <TouchableOpacity onPress={() => setImageUrl(null)} style={styles.removeImageButton}>
            <Text style={styles.removeImageButtonText}>이미지 삭제</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} 
          onPress={handleSave}
          disabled={isSubmitting}
        >
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>{params.postId ? "수정 완료" : "등록하기"}</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal animationType="slide" transparent={true} visible={isModalVisible} onRequestClose={() => setIsModalVisible(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modalContainer}>
            <View style={modalStyles.modalHeader}>
              <Text style={modalStyles.modalTitle}>카테고리 선택</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}><Ionicons name="close" size={28} color="#999" /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {CATEGORIES.map((cat, idx) => (
                <TouchableOpacity key={idx} style={[modalStyles.optionItem, category === cat && modalStyles.selectedOption]} onPress={() => { setCategory(cat); setIsModalVisible(false); }}>
                  <Text style={[modalStyles.optionText, category === cat && modalStyles.selectedText]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  scrollContent: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 8, marginTop: 15 },
  required: { color: '#0062ffff' },
  input: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#eee' },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  pickerDisplay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 8, padding: 15, borderWidth: 1, borderColor: '#eee' },
  pickerDisplayText: { fontSize: 16, color: '#333' },
  imagePicker: { height: 200, backgroundColor: '#f9f9f9', borderRadius: 8, borderWidth: 1, borderColor: '#eee', justifyContent: 'center', alignItems: 'center', marginTop: 10, overflow: 'hidden' },
  imagePickerText: { color: '#aaa', marginTop: 5 },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  removeImageButton: { backgroundColor: '#dc3545', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, alignSelf: 'flex-start', marginTop: 10 },
  removeImageButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  submitButton: { backgroundColor: '#0062ffff', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  submitButtonDisabled: { backgroundColor: '#ccc' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '50%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  optionItem: { padding: 15, alignItems: 'center', borderBottomWidth: 1, borderColor: '#f5f5f5' },
  optionText: { fontSize: 16, color: '#333' },
  selectedOption: { backgroundColor: '#e8f0fe' },
  selectedText: { color: '#0062ffff', fontWeight: 'bold' },
});