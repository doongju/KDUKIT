// app/(tabs)/_layout.tsx

import Ionicons from '@expo/vector-icons/Ionicons'; // Ionicons 임포트
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

// ⚠️ 프로젝트에 HapticTab, TabBarBackground가 없다면 주석 처리하거나 삭제하세요.
// 이 예시에서는 오류 방지를 위해 임포트 주석 처리 및 사용 제거합니다.
// import { HapticTab } from '@/components/HapticTab'; 
// import TabBarBackground from '@/components/ui/TabBarBackground';
import { useColorScheme } from '@/hooks/useColorScheme'; // useColorScheme 임포트

export default function TabLayout() {
  const colorScheme = useColorScheme(); // useColorScheme 사용

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0062ffff', 
        headerShown: false,
        // tabBarButton: HapticTab, // HapticTab 사용 제거
        // tabBarBackground: TabBarBackground, // TabBarBackground 사용 제거
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
        name="chatlist" // 파일명: app/(tabs)/chatlist.tsx
        options={{
          title: '채팅',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="chatbubbles" color={color} />,
        }}
      />

      {/* ⚠️ 택시 파티 목록 화면: 탭 바에서 숨김 처리 */}
      <Tabs.Screen
        name="taxiparty" // 파일명: app/(tabs)/taxiparty.tsx
        options={{
          title: '택시 파티',
          href: null, // 탭 바에 노출되지 않도록 설정
          headerShown: true,
        }}
      />

      {/* ⚠️ 새로운 파티 생성 화면: 탭 바에서 숨김 처리 (추가된 부분) */}
      <Tabs.Screen
        name="create-party" // 파일명: app/(tabs)/create-party.tsx
        options={{
          title: '새 파티 만들기',
          href: null, // 탭 바에 노출하지 않음
          headerShown: false, // create-party.tsx에서 커스텀 헤더를 사용하기 위해 숨김
        }}
      />
      <Tabs.Screen
        name="clublist" 
        options={{
          title: '동아리 모집',
          href: null, // 탭 바에 노출되지 않도록 설정
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="create-club" 
        options={{
          title: '클럽 만들기',
          href: null, // 탭 바에 노출되지 않도록 설정
          headerShown: false,
        }}
      />
            <Tabs.Screen
        name="create-market" 
        options={{
          title: '마켓 만들기',
          href: null, // 탭 바에 노출되지 않도록 설정
          headerShown: false,
        }}
      />
            <Tabs.Screen
        name="marketlist" 
        options={{
          title: '마켓 목록',
          href: null, // 탭 바에 노출되지 않도록 설정
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="person" color={color} />, 
        }}
      />
    </Tabs>
  );
}
