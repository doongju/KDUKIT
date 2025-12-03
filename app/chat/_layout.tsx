// app/chat/_layout.tsx

import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // ✨ [스타일 변경] 흰색 배경에 검정 글씨 (깔끔한 스타일)
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTintColor: '#000', // 뒤로가기 화살표 및 제목 색상
        headerTitleStyle: {
          fontWeight: 'bold',
          color: '#000',
          fontSize: 18,
        },
        headerShadowVisible: false, // 헤더 하단 그림자 제거 (깔끔하게)
        contentStyle: {
            borderTopWidth: 1,
            borderTopColor: '#f0f0f0' // 헤더와 본문 사이 옅은 경계선
        },
        animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{ title: '채팅' }} // 초기 제목
      />
    </Stack>
  );
}