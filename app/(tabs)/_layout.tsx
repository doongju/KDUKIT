// app/(tabs)/_layout.tsx

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native'; // ✨ Alert 추가

// ✨ Firebase 관련 추가
import { getAuth } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function TabLayout() {
  const activeColor = '#0062ffff'; 
  const inactiveColor = '#999';

  const auth = getAuth();
  const user = auth.currentUser;

  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  // ✨ 정지 여부 상태 관리
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    if (!user) {
        setTotalUnreadCount(0);
        return;
    }

    // 1. 유저 정보 실시간 감시 (정지 당하면 즉시 반영)
    const userUnsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            // isSuspended가 true거나 reportCount가 3 이상이면 정지 처리
            const suspended = (data.isSuspended === true) || ((data.reportCount || 0) >= 3);
            setIsSuspended(suspended);
        }
    });

    // 2. 채팅 뱃지 카운트
    const q = query(
      collection(db, 'chatRooms'),
      where('members', 'array-contains', user.uid)
    );

    const chatUnsub = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        const myCount = data.unreadCounts?.[user.uid] || 0;
        total += myCount;
      });
      setTotalUnreadCount(total);
    });

    return () => {
        userUnsub();
        chatUnsub();
    };
  }, [user]);

  // ✨ [핵심] 탭 누를 때 정지된 유저인지 검사하는 함수
  const handleRestrictedTabPress = (e: any) => {
      if (isSuspended) {
          e.preventDefault(); // 탭 이동 강제 차단
          Alert.alert(
              "🚫 이용 제한", 
              "누적된 신고로 인해 서비스 이용이 제한되었습니다.\n(셔틀 및 시간표만 이용 가능합니다)"
          );
      }
  };

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
      {/* 1. [시간표] - 허용 */}
      <Tabs.Screen
        name="timetable"
        options={{
          title: '시간표',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 2. [셔틀] - 허용 */}
      <Tabs.Screen
        name="shuttle"
        options={{
          title: '셔틀',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bus' : 'bus-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 3. [홈] - 🚫 차단 (커뮤니티 메인) */}
      <Tabs.Screen
        name="explore"
        listeners={{ tabPress: handleRestrictedTabPress }} // ✨ 클릭 시 검사
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
                // 정지 상태면 회색으로 표시 (시각적 효과)
                backgroundColor: isSuspended ? '#ccc' : '#0062ffff',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: isSuspended ? '#ccc' : '#0062ffff',
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

      {/* 4. [채팅] - 🚫 차단 */}
      <Tabs.Screen
        name="chatlist"
        listeners={{ tabPress: handleRestrictedTabPress }} // ✨ 클릭 시 검사
        options={{
          title: '채팅',
          // 정지 안 된 사람만 뱃지 보여줌
          tabBarBadge: (!isSuspended && totalUnreadCount > 0) ? totalUnreadCount : undefined,
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

      {/* 5. [내 정보] - 허용 */}
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