// app/(tabs)/_layout.tsx

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

export default function TabLayout() {
  const activeColor = '#0062ffff'; // 브랜드 컬러
  const inactiveColor = '#999';

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
      {/* 1. [시간표] 탭 (파일명: timetable.tsx) */}
      <Tabs.Screen
        name="timetable"
        options={{
          title: '시간표',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 2. [셔틀] 탭 (파일명: shuttle.tsx) */}
      <Tabs.Screen
        name="shuttle"
        options={{
          title: '셔틀',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bus' : 'bus-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 3. [홈] 탭 (파일명: explore.tsx) - 가운데 큰 버튼 */}
      <Tabs.Screen
        name="explore"
        options={{
          title: '홈',
          tabBarLabelStyle: { display: 'none' }, // 라벨 숨김
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                top: Platform.OS === 'ios' ? -20 : -25, // 위로 띄우기
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

      {/* 4. [채팅] 탭 (파일명: chatlist.tsx) */}
      {/* 중요: 파일명이 chatlist이므로 name도 "chatlist"여야 합니다 */}
      <Tabs.Screen
        name="chatlist"
        options={{
          title: '채팅',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* 5. [내 정보] 탭 (파일명: profile.tsx) */}
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={26} color={color} />
          ),
        }}
      />

      {/* ★★★ 나머지 파일 숨기기 (href: null) ★★★ 
        스크린샷에 있는 파일명들을 정확히 기재했습니다.
      */}
      <Tabs.Screen name="clublist" options={{ href: null }} />
      <Tabs.Screen name="create-club" options={{ href: null }} />
      <Tabs.Screen name="create-lost-item" options={{ href: null }} />
      <Tabs.Screen name="create-market" options={{ href: null }} />
      <Tabs.Screen name="create-party" options={{ href: null }} />
      <Tabs.Screen name="lost-and-found" options={{ href: null }} />
      <Tabs.Screen name="marketlist" options={{ href: null }} />
      <Tabs.Screen name="taxiparty" options={{ href: null }} />
      
    </Tabs>
  );
}