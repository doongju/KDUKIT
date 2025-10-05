// app/chat/_layout.tsx

import { Stack } from 'expo-router';
import React from 'react';

export default function ChatLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: true, // ⚠️ 여기서만 헤더를 보이도록 설정
                headerStyle: {
                    backgroundColor: '#0062ffff',
                },
                headerTintColor: '#fff',
                headerTitleStyle: {
                    fontWeight: 'bold',
                },
                animation: 'slide_from_right', 
            }}
        >
            <Stack.Screen 
                name="[id]" 
                // ⚠️ 이곳의 `title`은 임시로 '채팅방'으로 유지합니다.
                // 실제 상대방 이름은 `app/chat/[id].tsx`에서 동적으로 설정할 것입니다.
                options={{ title: '채팅방' }}
            />
        </Stack>
    );
}