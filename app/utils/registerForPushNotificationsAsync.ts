import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
    AndroidImportance,
    getExpoPushTokenAsync,
    getPermissionsAsync,
    requestPermissionsAsync,
    setNotificationChannelAsync,
    setNotificationHandler,
} from 'expo-notifications';
import { Platform } from 'react-native';

// ✨ 알림 핸들러 설정
setNotificationHandler({
  // @ts-ignore: 타입 검사 무시 (기능상 문제 없음)
  handleNotification: async () => {
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

export async function registerForPushNotificationsAsync() {
  let token;

  // 1. 안드로이드 채널 설정
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync('default', {
      name: 'default',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // 2. 실제 기기인지 확인
  if (Device.isDevice) {
    const { status: existingStatus } = await getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      alert('알림 권한을 허용하지 않으면 푸시 알림을 받을 수 없습니다!');
      return;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    if (!projectId) {
      console.log('Project ID를 찾을 수 없습니다.');
    }

    try {
      const pushTokenString = (
        await getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log("🔥 내 푸시 토큰:", pushTokenString);
      return pushTokenString;
    } catch (e: unknown) {
      console.log("토큰 발급 에러:", e);
    }
  } else {
    alert('푸시 알림은 실제 휴대폰에서만 테스트 가능합니다.');
  }

  return undefined;
}