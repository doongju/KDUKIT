import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 여기에는 (tabs)나 (auth) 같은 루트 경로의 이름을 적으면 안 됩니다.
        profile 폴더 안에 있는 파일들만 관리합니다.
        Stack 컴포넌트만 넣어주면 자동으로 my-posts와 wishlist를 찾아서 보여줍니다.
      */}
      <Stack.Screen name="my-posts" />
      <Stack.Screen name="wishlist" />
    </Stack>
  );
}