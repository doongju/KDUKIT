import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { auth } from "../../firebaseConfig";

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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      Alert.alert("로그아웃 성공", "다음에 또 만나요!");
      router.replace('/'); 
    } catch (error: any) {
      Alert.alert("로그아웃 실패", error.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>로그아웃</Text>
        </TouchableOpacity>

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

        <View style={styles.featuresGrid}>
          {Object.entries(featureIcons).map(([feature, icon]) => (
            <TouchableOpacity key={feature} style={styles.featureCard}>
              <View style={styles.featureCardContent}>
                <Text style={styles.featureIcon}>{icon}</Text>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

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
  scrollContent: {
    padding: 16,
  },
  logoutButton: {
    backgroundColor: '#ff5c5c',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
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
    color: "#ff8a3d",
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
    backgroundColor: "#ff8a3d",
  },
  infoButtonText: {
    color: "#fff",
    fontSize: 15,
    textAlign: "center",
  },
});