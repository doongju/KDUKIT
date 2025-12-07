// app/(tabs)/_layout.tsx

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

// ✨ Firebase 관련 추가
import { getAuth } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function TabLayout() {
  const activeColor = '#0062ffff'; // 브랜드 컬러
  const inactiveColor = '#999';

  const auth = getAuth();
  const user = auth.currentUser;

  // ✨ 전체 안 읽은 메시지 수 상태 관리
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);

  // ✨ 실시간 뱃지 카운트 로직
  useEffect(() => {
    if (!user) {
        setTotalUnreadCount(0);
        return;
    }

    const q = query(
      collection(db, 'chatRooms'),
      where('members', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        // 내 UID로 된 안 읽은 갯수가 있으면 더하기
        const myCount = data.unreadCounts?.[user.uid] || 0;
        total += myCount;
      });
      setTotalUnreadCount(total);
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarShowLabel: true,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
          backgroundColor: '#ffffff',
          borderTopColor: '#f0f0f0',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 70,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      {/* 1. [시간표] 탭 */}
      <Tabs.Screen
        name="timetable"
        options={{
          title: '시간표',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 2. [셔틀] 탭 */}
      <Tabs.Screen
        name="shuttle"
        options={{
          title: '셔틀',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bus' : 'bus-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 3. [홈] 탭 - 커스텀 버튼 디자인 유지 */}
      <Tabs.Screen
        name="explore"
        options={{
          title: '홈',
          tabBarLabelStyle: { display: 'none' },
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                top: Platform.OS === 'ios' ? -20 : -25,
                width: 66,
                height: 66,
                borderRadius: 33,
                backgroundColor: '#0062ffff',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: '#0062ffff',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 5,
                elevation: 5,
              }}
            >
              <Ionicons name="home" size={30} color="#ffffff" />
            </View>
          ),
        }}
      />

      {/* 4. [채팅] 탭 - ✨ 여기에 뱃지 추가됨! */}
      <Tabs.Screen
        name="chatlist"
        options={{
          title: '채팅',
          // ✨ 숫자가 0보다 클 때만 빨간 뱃지 표시
          tabBarBadge: totalUnreadCount > 0 ? totalUnreadCount : undefined,
          tabBarBadgeStyle: { 
              backgroundColor: '#ff3b30', 
              fontSize: 10,
              minWidth: 16,
              height: 16,
              lineHeight: 16 
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 5. [내 정보] 탭 */}
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 숨김 탭들 */}
      <Tabs.Screen name="clublist" options={{ href: null }} />
      <Tabs.Screen name="lost-and-found" options={{ href: null }} />
      <Tabs.Screen name="marketlist" options={{ href: null }} />
      <Tabs.Screen name="taxiparty" options={{ href: null }} />
      
    </Tabs>
  );
}