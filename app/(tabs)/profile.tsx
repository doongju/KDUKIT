import { useRouter } from 'expo-router';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebaseConfig';

interface UserProfile {
    name: string;
    department: string;
    email: string;
}

const ProfileScreen: React.FC = () => {
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    
    const router = useRouter();
    const auth = getAuth();
    const user = auth.currentUser;
    const insets = useSafeAreaInsets();

    const fetchUserProfile = async (uid: string) => {
        try {
            const userDocRef = doc(db, 'users', uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                const data = userDoc.data();
                setUserProfile({
                    name: data.name || '정보 없음',
                    department: data.department || '정보 없음',
                    email: user?.email || '이메일 없음',
                });
            } else {
                setUserProfile({ name: '정보 없음', department: '정보 없음', email: user?.email || '이메일 없음' });
            }
        } catch (error) {
            console.error("프로필 로드 오류:", error);
            Alert.alert("오류", "프로필 정보를 불러오는 데 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                fetchUserProfile(currentUser.uid);
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            Alert.alert("로그아웃 성공", "다음에 또 만나요!");
            // ⚠️ 앱의 루트 경로로 이동하여 _layout.tsx가 인증 상태를 감지하도록 함
            router.replace('/'); 
        } catch (error: any) {
            Alert.alert("로그아웃 실패", error.message);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0062ffff" />
                <Text style={styles.loadingText}>프로필을 불러오는 중...</Text>
            </View>
        );
    }
    
    if (!userProfile) {
        return (
             <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={[styles.headerContainer, { paddingTop: insets.top }]}> 
                 <Text style={styles.header}>내 프로필</Text>
                 <TouchableOpacity style={styles.logoutButtonTop} onPress={handleLogout}>
                     <Text style={styles.logoutButtonTextTop}>로그아웃</Text>
                 </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <Text style={styles.nameText}>{userProfile.name} 님</Text>
                <Text style={styles.departmentText}>{userProfile.department}</Text>
            </View>

            <View style={styles.infoSection}>
                <Text style={styles.sectionHeader}>계정 정보</Text>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>이메일</Text>
                    <Text style={styles.infoValue}>{userProfile.email}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>학과</Text>
                    <Text style={styles.infoValue}>{userProfile.department}</Text>
                </View>
            </View>
            
            <View style={{ height: insets.bottom + 20 }} /> 
        </ScrollView>
    );
};

export default ProfileScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    loadingText: {
        marginTop: 10,
        color: '#333',
    },
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    header: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
    },
    logoutButtonTop: { 
        backgroundColor: '#ff5c5c', 
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
    },
    logoutButtonTextTop: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    card: {
        backgroundColor: '#fff',
        margin: 20,
        marginTop: 25,
        padding: 20,
        borderRadius: 15,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 8,
        borderLeftWidth: 5,
        borderLeftColor: '#0062ffff', 
    },
    nameText: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 5,
        color: '#333',
    },
    departmentText: {
        fontSize: 16,
        color: '#666',
    },
    infoSection: {
        backgroundColor: '#fff',
        marginHorizontal: 20,
        padding: 20,
        borderRadius: 15,
        marginBottom: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    sectionHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0062ffff', 
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 5,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    infoLabel: {
        fontSize: 16,
        color: '#666',
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '500',
        color: '#333',
    },
});