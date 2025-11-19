import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    ScrollView, // ScrollView 추가
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

interface LostItem {
    id: string;
    type: 'lost' | 'found';
    itemName: string;
    location: string;
    createdAt: any;
    status: string;
}

export default function LostAndFoundScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [items, setItems] = useState<LostItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'lost' | 'found'>('all');

    // Firestore에서 실시간 데이터 가져오기
    useEffect(() => {
        const q = query(collection(db, "lostAndFoundItems"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as LostItem[];
            setItems(loadedItems);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // 필터링된 리스트
    const filteredItems = items.filter(item => filter === 'all' || item.type === filter);

    const renderItem = ({ item }: { item: LostItem }) => (
        <TouchableOpacity 
            style={styles.itemCard}
            onPress={() => router.push(`/lost-item/${item.id}`)} 
        >
            <View style={[styles.iconBox, item.type === 'lost' ? styles.lostIcon : styles.foundIcon]}>
                <Ionicons 
                    name={item.type === 'lost' ? "search" : "gift"} 
                    size={24} 
                    color="#fff" 
                />
            </View>
            <View style={styles.itemInfo}>
                <View style={styles.itemHeader}>
                    <Text style={[styles.typeTag, { color: item.type === 'lost' ? '#ff6b6b' : '#4d96ff' }]}>
                        {item.type === 'lost' ? '분실' : '습득'}
                    </Text>
                    <Text style={styles.dateText}>
                        {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ''}
                    </Text>
                </View>
                <Text style={styles.itemName}>{item.itemName}</Text>
                <Text style={styles.locationText}>{item.location}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* 헤더 */}
            <View style={styles.headerBar}>
                <Text style={styles.headerTitle}>분실물 센터</Text>
            </View>

            {/* ✨ 상단 컨트롤 바 (가로 스크롤) */}
            <View style={styles.controlContainer}>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContentContainer}
                >
                    {/* 1. 필터 버튼들 */}
                    {['all', 'lost', 'found'].map((f) => (
                        <TouchableOpacity
                            key={f}
                            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
                            onPress={() => setFilter(f as any)}
                        >
                            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                {f === 'all' ? '전체' : f === 'lost' ? '분실물' : '습득물'}
                            </Text>
                        </TouchableOpacity>
                    ))}

                    {/* 구분선 */}
                    <View style={styles.verticalDivider} />

                    {/* 2. 등록 버튼들 (액션) */}
                    <TouchableOpacity 
                        style={[styles.actionButton, styles.actionLost]}
                        onPress={() => router.push('/(tabs)/create-lost-item?type=lost')}
                    >
                        <Ionicons name="add" size={16} color="#fff" />
                        <Text style={styles.actionText}>분실 등록</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.actionButton, styles.actionFound]}
                        onPress={() => router.push('/(tabs)/create-lost-item?type=found')}
                    >
                        <Ionicons name="add" size={16} color="#fff" />
                        <Text style={styles.actionText}>습득 등록</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* 리스트 */}
            {loading ? (
                <ActivityIndicator size="large" color="#0062ffff" style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={filteredItems}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>등록된 물건이 없습니다.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    headerBar: {
        paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#eee',
    },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
    
    // ✨ 상단 컨트롤 영역 스타일
    controlContainer: {
        backgroundColor: '#fff', // 배경색을 넣어 깔끔하게
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    scrollContentContainer: {
        paddingHorizontal: 20,
        alignItems: 'center',
        gap: 8, // 버튼 사이 간격
    },
    
    // 필터 버튼 스타일
    filterButton: {
        paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
        backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#eee',
    },
    filterButtonActive: { backgroundColor: '#333', borderColor: '#333' },
    filterText: { color: '#666', fontWeight: '600', fontSize: 14 },
    filterTextActive: { color: '#fff' },

    // 구분선 스타일
    verticalDivider: {
        width: 1, height: 20, backgroundColor: '#ddd', marginHorizontal: 5,
    },

    // 액션(등록) 버튼 스타일
    actionButton: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
        gap: 4, elevation: 2,
    },
    actionLost: { backgroundColor: '#ff6b6b' },
    actionFound: { backgroundColor: '#4d96ff' },
    actionText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

    // 리스트 스타일
    listContent: { padding: 20, paddingBottom: 50 },
    itemCard: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
        borderRadius: 12, padding: 15, marginBottom: 12,
        elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 },
    },
    iconBox: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center', marginRight: 15,
    },
    lostIcon: { backgroundColor: '#ff6b6b' },
    foundIcon: { backgroundColor: '#4d96ff' },
    itemInfo: { flex: 1 },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    typeTag: { fontSize: 12, fontWeight: 'bold' },
    dateText: { fontSize: 12, color: '#999' },
    itemName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 2 },
    locationText: { fontSize: 14, color: '#666' },
    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { color: '#999', fontSize: 16 },
});