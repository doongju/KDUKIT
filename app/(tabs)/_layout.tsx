// app/(tabs)/_layout.tsx

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0062ffff',
        headerShown: false,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
          },
          default: {},
        }),
      }}>

      <Tabs.Screen
        name="explore"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="home" color={color} />,
        }}
      />
      
      <Tabs.Screen
        name="timetable"
        options={{
          title: '시간표',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="calendar" color={color} />, 
        }}
      />
      
      <Tabs.Screen
        name="chatlist"
        options={{
          title: '채팅',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="chatbubbles" color={color} />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="person" color={color} />, 
        }}
      />

      {/* --- 탭 바에 보이지 않는 숨겨진 경로들 --- */}

      {/* ⚠️ 택시 파티 목록 화면 */}
      <Tabs.Screen
        name="taxiparty"
        options={{
          title: '택시 파티',
          href: null,
          headerShown: false,
        }}
      />

      {/* ⚠️ 새로운 파티 생성 화면 */}
      <Tabs.Screen
        name="create-party"
        options={{
          title: '새 파티 만들기',
          href: null,
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="clublist" 
        options={{
          title: '동아리 모집',
          href: null,
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="create-club" 
        options={{
          title: '클럽 만들기',
          href: null,
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="create-market" 
        options={{
          title: '마켓 만들기',
          href: null,
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="marketlist" 
        options={{
          title: '마켓 목록',
          href: null,
          headerShown: false,
        }}
      />

      {/* 👇 [분실물 센터] */}
      <Tabs.Screen 
        name="lost-and-found"
        options={{ 
          title: "분실물 센터",
          href: null,
          headerShown: false,
        }} 
      />

      {/* 👇 [분실물 등록] */}
      <Tabs.Screen 
        name="create-lost-item"
        options={{ 
          title: "분실물 등록",
          href: null,
          headerShown: false,
        }} 
      />

      {/* 👇 [셔틀버스] (새로 추가됨) */}
      <Tabs.Screen 
        name="shuttle" // 파일명: app/(tabs)/shuttle.tsx
        options={{ 
          title: "셔틀버스",
          href: null, // 탭 바에서 숨기기 (홈 화면 아이콘으로 진입)
          headerShown: false, // shuttle.tsx 내부에 헤더가 있으므로 시스템 헤더 숨김
        }} 
      />

    </Tabs>
  );
}