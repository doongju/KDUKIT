import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

// ⚠️ 아이콘 컴포넌트를 직접 사용하지 않고, @expo/vector-icons에서 임포트합니다.
import Ionicons from '@expo/vector-icons/Ionicons';

import { HapticTab } from '@/components/HapticTab';
// import { IconSymbol } from '@/components/ui/IconSymbol'; // ⚠️ 주석 처리 또는 삭제
import TabBarBackground from '@/components/ui/TabBarBackground';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0062ffff', 
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
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
          // ⚠️ Ionicons를 사용하도록 변경
          tabBarIcon: ({ color }) => <Ionicons size={28} name="send" color={color} />, 
        }}
      />
      
      <Tabs.Screen
        name="timetable"
        options={{
          title: '시간표',
          // ⚠️ Ionicons를 사용하도록 변경
          tabBarIcon: ({ color }) => <Ionicons size={28} name="calendar" color={color} />, 
        }}
      />
      


      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          // ⚠️ Ionicons를 사용하도록 변경
          tabBarIcon: ({ color }) => <Ionicons size={28} name="person" color={color} />, 
        }}
      />
    </Tabs>
  );
}