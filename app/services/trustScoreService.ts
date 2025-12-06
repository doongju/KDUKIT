// services/trustScoreService.ts
import {
    addDoc,
    collection,
    getCountFromServer,
    getDocs,
    limit,
    query,
    Timestamp,
    where
} from 'firebase/firestore';
import { db } from '../../firebaseConfig'; // 경로는 실제 설정에 맞게 수정

// 신뢰도 점수 부여 가능 여부 체크 결과 타입
interface CheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 신뢰도 점수를 부여할 수 있는지 검사하는 함수
 * @param targetUserId 점수를 받을 사람 (대상)
 * @param sourceUserId 점수를 주는 사람 (또는 거래 상대방)
 * @param type 활동 타입 ('market' | 'taxi')
 */
export const checkTrustScoreEligibility = async (
  targetUserId: string, 
  sourceUserId: string, 
  type: 'market' | 'taxi'
): Promise<CheckResult> => {
  
  const now = new Date();
  
  // 1. [일일 제한] 오늘 이 사람이 점수를 몇 번 받았는지 확인 (최대 3회)
  const startOfDay = new Date(now.setHours(0, 0, 0, 0));
  
  const dailyQuery = query(
    collection(db, 'trustScoreLogs'), // 로그를 저장할 새로운 컬렉션
    where('targetUserId', '==', targetUserId),
    where('createdAt', '>=', startOfDay)
  );
  
  const dailySnapshot = await getCountFromServer(dailyQuery);
  if (dailySnapshot.data().count >= 3) {
    return { allowed: false, reason: '하루에 얻을 수 있는 신뢰도 점수 횟수(3회)를 초과했습니다.' };
  }

  // 2. [7일 쿨타임] 이 사람(sourceUser)과 7일 이내에 주고받은 기록이 있는지 확인
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const historyQuery = query(
    collection(db, 'trustScoreLogs'),
    where('targetUserId', '==', targetUserId),
    where('sourceUserId', '==', sourceUserId), // 특정 상대방과의 기록 조회
    where('createdAt', '>=', sevenDaysAgo),
    limit(1)
  );

  const historySnapshot = await getDocs(historyQuery);
  if (!historySnapshot.empty) {
    return { allowed: false, reason: '동일한 사용자와는 7일에 한 번만 점수를 얻을 수 있습니다.' };
  }

  return { allowed: true };
};

/**
 * 점수 부여 기록을 남기는 함수 (점수 지급 성공 시 반드시 호출)
 */
export const logTrustScoreTransaction = async (
  targetUserId: string,
  sourceUserId: string,
  type: 'market' | 'taxi',
  points: number
) => {
  await addDoc(collection(db, 'trustScoreLogs'), {
    targetUserId,
    sourceUserId,
    type,
    points,
    createdAt: Timestamp.now()
  });
};