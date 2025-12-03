// app/create-market.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking, // ✨ 추가: 설정 이동 기능
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, storage } from '../../firebaseConfig';

const CATEGORIES = ['전공도서', '교양도서', '전자제품', '의류/잡화', '생활용품', '기타'];
const MAX_IMAGES = 8; 

export default function CreateMarketScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  const scrollViewRef = useRef<ScrollView>(null);
  const headerHeight = insets.top + 60;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('전공도서');
  const [price, setPrice] = useState(''); 
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const formatPrice = (num: string | number) => {
    if (!num) return '';
    const numStr = num.toString().replace(/[^0-9]/g, ''); 
    if (numStr === '') return '';
    return new Intl.NumberFormat('ko-KR').format(parseInt(numStr, 10));
  };

  const handlePriceChange = (text: string) => {
    setPrice(formatPrice(text));
  };

  useEffect(() => {
    if (params.postId) {
      setTitle(params.initialTitle as string || '');
      setDescription(params.initialDescription as string || '');
      setCategory(params.initialCategory as string || '전공도서');
      
      const initPrice = params.initialPrice as string;
      setPrice(formatPrice(initPrice));
      
      const initImg = params.initialImageUrl;
      if (typeof initImg === 'string' && initImg.startsWith('http')) {
         setSelectedImages([initImg]); 
      } else if (Array.isArray(initImg)) {
         setSelectedImages(initImg);
      } else {
         setSelectedImages([]);
      }
    } else {
      resetForm();
    }// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.postId, params.t]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('전공도서');
    setPrice('');
    setSelectedImages([]);
  };

  const pickImage = async () => {
    if (!currentUser) { Alert.alert("로그인 필요", "로그인이 필요합니다."); return; }
    
    if (selectedImages.length >= MAX_IMAGES) {
        Alert.alert("알림", `최대 ${MAX_IMAGES}장까지만 등록 가능합니다.`);
        return;
    }

    // ✨ [수정] 권한 확인 및 설정 이동 로직 추가
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        '권한 필요',
        '설정에서 사진 라이브러리 접근 권한을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정으로 이동', onPress: () => Linking.openSettings() } // 설정창 이동
        ]
      );
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, 
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - selectedImages.length,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map(asset => asset.uri);
      setSelectedImages(prev => [...prev, ...newUris]);
    }
  };

  const removeImage = (indexToRemove: number) => {
      setSelectedImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const uploadSingleImage = async (uri: string): Promise<string | null> => {
    if (!currentUser) return null;
    if (uri.startsWith('http')) return uri;

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `market_images/${currentUser.uid}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Image upload error:", error);
      return null;
    }
  };

  const handleSave = async () => {
    if (!currentUser) { Alert.alert("로그인 필요", "로그인이 필요합니다."); return; }
    if (!title.trim() || !description.trim() || !price.trim()) { Alert.alert("필수 입력", "모든 필드를 채워주세요."); return; }

    const priceNumber = parseInt(price.replace(/[^0-9]/g, ''), 10); 
    if (isNaN(priceNumber)) { Alert.alert("가격 오류", "올바른 가격을 입력해주세요."); return; }

    setIsSubmitting(true);
    setUploadingImage(true);
    
    try {
        const uploadPromises = selectedImages.map(uri => uploadSingleImage(uri));
        const uploadedUrls = await Promise.all(uploadPromises);
        const validUrls = uploadedUrls.filter((url): url is string => url !== null);
        const mainImageUrl = validUrls.length > 0 ? validUrls[0] : null;

        const postData = {
            title: title.trim(),
            description: description.trim(),
            category,
            price: priceNumber,
            imageUrl: mainImageUrl, 
            imageUrls: validUrls,   
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
                imageUrls: postData.imageUrls,
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
      
      router.navigate('/(tabs)/marketlist');

    } catch (error: any) {
      if (error.code === 'permission-denied' || error.message.includes('permission-denied')) {
        Alert.alert("이용 제한 🚫", "신고 누적(3회 이상)으로 인해 게시글 작성이 제한되었습니다.\n관리자에게 문의해주세요.");
      } else {
        console.error("Save error:", error);
        Alert.alert("실패", "저장 중 오류가 발생했습니다.");
      }
    } finally {
      setIsSubmitting(false);
      setUploadingImage(false);
    }
  };

  const handleBack = () => {
    router.navigate('/(tabs)/marketlist');
  };

  const handleDescriptionFocus = () => {
    setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 200);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top, height: headerHeight }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{params.postId ? "게시글 수정" : "물건 팔기"}</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSubmitting} style={styles.headerButton}>
           {isSubmitting ? (
             <ActivityIndicator size="small" color="#0062ffff" />
           ) : (
             <Text style={styles.headerActionText}>완료</Text>
           )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
        keyboardVerticalOffset={0} 
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView 
                ref={scrollViewRef}
                contentContainerStyle={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
            >
            <View style={styles.imageSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageList}>
                    {selectedImages.length < MAX_IMAGES && (
                        <TouchableOpacity 
                            style={[styles.addImageButton, (uploadingImage || isSubmitting) && {opacity: 0.5}]} 
                            onPress={pickImage}
                            disabled={uploadingImage || isSubmitting}
                        >
                            <Ionicons name="camera" size={24} color="#aaa" />
                            <Text style={styles.addImageText}>
                                {selectedImages.length}/{MAX_IMAGES}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {selectedImages.map((uri, index) => (
                        <View key={index} style={styles.imageItemWrapper}>
                            <Image source={{ uri }} style={styles.imageItem} />
                            
                            {!uploadingImage && !isSubmitting && (
                                <TouchableOpacity 
                                    style={styles.deleteButton} 
                                    onPress={() => removeImage(index)}
                                >
                                    <Ionicons name="close" size={14} color="#fff" />
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                </ScrollView>
            </View>

            <View style={styles.card}>
                <Text style={styles.label}>제목</Text>
                <TextInput 
                style={styles.input} 
                placeholder="제목을 입력해주세요" 
                placeholderTextColor="#aaa"
                value={title} 
                onChangeText={setTitle} 
                />
                
                <View style={styles.divider} />

                <Text style={styles.label}>카테고리</Text>
                <TouchableOpacity style={styles.pickerButton} onPress={() => setIsModalVisible(true)}>
                <Text style={styles.pickerButtonText}>{category}</Text>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <Text style={styles.label}>판매 가격</Text>
                <View style={styles.priceContainer}>
                    <Text style={[styles.currencySymbol, price ? {color: '#333'} : {color: '#aaa'}]}>₩</Text>
                    <TextInput 
                    style={styles.priceInput} 
                    placeholder="가격을 입력해주세요" 
                    placeholderTextColor="#aaa"
                    value={price} 
                    onChangeText={handlePriceChange} 
                    keyboardType="number-pad"
                    />
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.label}>자세한 설명</Text>
                <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="올릴 게시글 내용을 작성해주세요."
                placeholderTextColor="#aaa"
                multiline
                value={description}
                onChangeText={setDescription}
                onFocus={handleDescriptionFocus}
                // ✅ 핵심: 내용 사이즈(줄바꿈)가 바뀌면 스크롤을 맨 아래로 내림
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                textAlignVertical="center"
                />
            </View>
            
            {/* 키보드가 올라왔을 때를 대비한 넉넉한 하단 여백 */}
            <View style={{height: 120}} /> 
            </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <Modal animationType="fade" transparent={true} visible={isModalVisible} onRequestClose={() => setIsModalVisible(false)}>
        <TouchableOpacity style={modalStyles.overlay} activeOpacity={1} onPress={() => setIsModalVisible(false)}>
          <View style={modalStyles.modalContainer}>
            <View style={modalStyles.modalHeader}>
              <Text style={modalStyles.modalTitle}>카테고리 선택</Text>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {CATEGORIES.map((cat, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={[modalStyles.optionItem, category === cat && modalStyles.selectedOption]} 
                  onPress={() => { setCategory(cat); setIsModalVisible(false); }}
                >
                  <Text style={[modalStyles.optionText, category === cat && modalStyles.selectedText]}>{cat}</Text>
                  {category === cat && <Ionicons name="checkmark" size={20} color="#0062ffff" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={modalStyles.closeButton} onPress={() => setIsModalVisible(false)}>
                <Text style={modalStyles.closeButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: '#fff', 
    borderBottomWidth: 1, borderBottomColor: '#f1f3f5' 
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  headerButton: { padding: 5, minWidth: 40, alignItems: 'center' },
  headerActionText: { fontSize: 16, fontWeight: '600', color: '#0062ffff' },

  scrollContent: { padding: 20 },

  imageSection: { marginBottom: 20 },
  imageList: { gap: 10, paddingRight: 20 },
  
  addImageButton: { 
    width: 80, height: 80, 
    borderRadius: 8, borderWidth: 1, borderColor: '#ddd', 
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' 
  },
  addImageText: { fontSize: 12, color: '#aaa', marginTop: 4 },

  imageItemWrapper: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  imageItem: { width: '100%', height: '100%', resizeMode: 'cover' },
  
  deleteButton: {
      position: 'absolute', top: 4, right: 4,
      width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center', alignItems: 'center', zIndex: 1
  },

  card: { 
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2
  },
  label: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#f1f3f5', marginVertical: 15 },

  input: { fontSize: 16, color: '#333', paddingVertical: 6 },
  textArea: { minHeight: 150, lineHeight: 24 },

  pickerButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  pickerButtonText: { fontSize: 16, color: '#333', fontWeight: '500' },

  priceContainer: { flexDirection: 'row', alignItems: 'center' },
  currencySymbol: { fontSize: 20, fontWeight: '600', marginRight: 8 },
  priceInput: { flex: 1, fontSize: 20, fontWeight: '700', color: '#333', paddingVertical: 5 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { width: '85%', backgroundColor: '#fff', borderRadius: 20, paddingBottom: 20, overflow: 'hidden' },
  modalHeader: { padding: 20, borderBottomWidth: 1, borderColor: '#f1f3f5', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  optionItem: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    padding: 18, borderBottomWidth: 1, borderColor: '#f8f9fa' 
  },
  optionText: { fontSize: 16, color: '#555' },
  selectedOption: { backgroundColor: '#f8f9fa' },
  selectedText: { color: '#0062ffff', fontWeight: 'bold' },
  closeButton: { marginTop: 10, alignItems: 'center', padding: 10 },
  closeButtonText: { fontSize: 15, color: '#666', fontWeight: '600' },
});