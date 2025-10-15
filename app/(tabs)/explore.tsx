import { useRouter } from "expo-router";
import React from "react";
import {
  Alert // Alert 추가: 존재하지 않는 기능에 대한 사용자 피드백
  ,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 시간표 데이터 타입
interface TimetableItem {
  id: string;
  title: string;
  time: string;
}

// 기타 수업 데이터 타입
interface OtherClassItem {
  id: string;
  title: string;
  type: string;
}

// 시간표 및 기타 수업 데이터를 위한 더미 데이터
const timetableData: TimetableItem[] = [
  { id: "1", title: "운영체제", time: "월 10:00 - 12:00" },
  { id: "2", title: "컴퓨터네트워크", time: "화 14:00 - 16:00" },
];

const otherClassesData: OtherClassItem[] = [
  { id: "1", title: "글쓰기", type: "온라인 강의" },
  { id: "2", title: "영어 특강", type: "온라인 강의" },
];

// 주요 기능 아이콘 매핑
const featureIcons: Record<string, string> = {
  "중고 마켓": "🛍️",
  "셔틀버스": "🚌",
  "택시 파티": "🚕",
  "동아리 모집": "👥",
  "분실물 센터": "🔍",
};

const ExploreScreen: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ⚠️ 기능 카드 클릭 핸들러: 택시 파티 기능 추가
  const handleFeaturePress = (featureName: string) => {
    switch (featureName) {
      case "택시 파티":
        // 새로운 taxiparty.tsx 경로로 이동
        router.push('/(tabs)/taxiparty');
        break;
      case "중고 마켓":
      case "셔틀버스":
      case "동아리 모집":
      case "분실물 센터":
      default:
        // 나머지 미구현 기능에 대한 알림
        Alert.alert("준비 중", `${featureName} 기능은 현재 개발 중입니다. 잠시만 기다려 주세요!`);
        break;
    }
  };

  return (
    <View style={styles.container}>
      {/* 상단 View에 Safe Area 패딩을 적용하여 노치 영역 피하기 */}
      <View style={{ paddingTop: insets.top, backgroundColor: '#fff' }} />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 16 }]}>
        
        {/* 내 시간표 카드 */}
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>내 시간표</Text>
            {timetableData.map((item) => (
              <View key={item.id} style={styles.timetableItem}>
                <Text style={styles.timetableText}>{item.title}</Text>
                <Text style={styles.timetableSubText}>{item.time}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 기타 수업 목록 카드 */}
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>기타 수업 목록</Text>
            {otherClassesData.map((item) => (
              <View key={item.id} style={styles.otherClassItem}>
                <Text style={styles.icon}>💻</Text>
                <Text style={styles.otherClassText}>
                  {item.title} ({item.type})
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 주요 기능 그리드 */}
        <View style={styles.featuresGrid}>
          {Object.entries(featureIcons).map(([feature, icon]) => (
            // ⚠️ onPress 이벤트 핸들러 추가
            <TouchableOpacity 
              key={feature} 
              style={styles.featureCard}
              onPress={() => handleFeaturePress(feature)} 
            >
              <View style={styles.featureCardContent}>
                <Text style={styles.featureIcon}>{icon}</Text>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 정보 카드 */}
        <View style={styles.infoCard}>
          <View style={styles.cardContent}>
            <Text style={styles.infoTitle}>KDUKIT에 오신 것을 환영합니다!</Text>
            <Text style={styles.infoText}>
              KDUKIT은 우리 학교 재학생만을 위한 통합 플랫폼입니다. 신뢰성
              높은 커뮤니티에서 더 편리한 대학 생활을 시작하세요.
            </Text>
            <TouchableOpacity style={styles.infoButton}>
              <Text style={styles.infoButtonText}>자세히 알아보기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default ExploreScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  // ⚠️ scrollContent에서 상단 패딩 제거 (인셋이 처리)
  scrollContent: {
    padding: 16,
  },
  // ⚠️ 로그아웃 버튼 관련 스타일 제거
  card: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardContent: {
    padding: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  timetableItem: {
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#e8f0fe",
    borderRadius: 8,
  },
  timetableText: {
    fontSize: 15,
    fontWeight: "bold",
  },
  timetableSubText: {
    fontSize: 13,
    color: "#666",
  },
  otherClassItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#fffbe5",
    borderRadius: 8,
  },
  icon: {
    fontSize: 20,
    marginRight: 10,
  },
  otherClassText: {
    fontSize: 15,
  },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  featureCard: {
    width: "48%",
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  featureCardContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  featureIcon: {
    fontSize: 40,
  },
  featureText: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 8,
  },
  infoCard: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0062ffff",
    textAlign: "center",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  infoButton: {
    width: "60%",
    alignSelf: "center",
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#0062ffff",
  },
  infoButtonText: {
    color: "#fff",
    fontSize: 15,
    textAlign: "center",
  },
});
