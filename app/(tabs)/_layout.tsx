// app/(tabs)/_layout.tsx

import Ionicons from '@expo/vector-icons/Ionicons'; // Ionicons 임포트
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

// ⚠️ 프로젝트에 HapticTab, TabBarBackground가 없다면 주석 처리하거나 삭제하세요.
import { HapticTab } from '@/components/HapticTab';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { useColorScheme } from '@/hooks/useColorScheme'; // useColorScheme 임포트

export default function TabLayout() {
  const colorScheme = useColorScheme(); // useColorScheme 사용

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0062ffff', 
        headerShown: false,
        tabBarButton: HapticTab, // HapticTab 사용
        tabBarBackground: TabBarBackground, // TabBarBackground 사용
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
          tabBarIcon: ({ color }) => <Ionicons size={28} name="home" color={color} />, // ⚠️ 'send' -> 'home'으로 변경
        }}
      />
      
      <Tabs.Screen
        name="timetable"
        options={{
          title: '시간표',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="calendar" color={color} />, 
        }}
      />
      
      {/* ⚠️ chatlist.tsx 파일을 위한 탭 추가 */}
      <Tabs.Screen
        name="chatlist" // 파일명: app/(tabs)/chatlist.tsx
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
    </Tabs>
  );
}