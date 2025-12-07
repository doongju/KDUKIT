const functions = require("firebase-functions/v1");
const moment = require('moment-timezone');
const now = moment().tz('Asia/Seoul');
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const cors = require("cors")({ origin: true });

admin.initializeApp();

// ==========================================
// 🛠️ [공통 함수] Expo 서버로 알림 쏘기
// ==========================================
async function sendToExpo(messages) {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    console.log("✅ Expo 전송 결과:", JSON.stringify(result));
  } catch (error) {
    console.error("❌ Expo 전송 실패:", error);
  }
}

// ==========================================
// 1. 이메일 인증 (기존 유지)
// ==========================================
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "kduemailtest@gmail.com",
    pass: "ilgqqdiqgjxpxuys", 
  },
});

exports.sendVerificationCode = functions.https.onCall(async (data, context) => {
  const requestData = data.data || data; 
  const email = requestData.email;
  const code = requestData.code;

  if (!email) {
    throw new functions.https.HttpsError("invalid-argument", "이메일 주소가 비어있습니다.");
  }

  const mailOptions = {
    from: '"KDU KIT" <kdu.team.new@gmail.com>',
    to: email,
    subject: "[KDU KIT] 회원가입 인증번호 안내",
    html: `
      <div style="padding: 20px; border: 1px solid #ccc; font-family: sans-serif;">
        <h2 style="color: #0062ff;">KDU KIT 인증번호</h2>
        <p>KDU KIT에 오신것을 환영합니다.</p>
        <p>요청하신 인증번호를 앱에 입력해주세요.</p>
        <div style="background: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0;">
          <h1 style="margin: 0; letter-spacing: 5px;">${code}</h1>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError("internal", "메일 전송 실패", error.message);
  }
});

// ==========================================
// 2. 채팅 알림 (최종 완성: 접속자 알림 방지 + 뱃지 카운트)
// ==========================================
exports.sendChatNotification = functions.firestore
  .document("chatRooms/{chatRoomId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const messageData = snapshot.data();
    const chatRoomId = context.params.chatRoomId;
    const senderId = messageData.senderId;
    const messageText = messageData.text;

    try {
      // 방 정보 가져오기
      const roomRef = admin.firestore().collection("chatRooms").doc(chatRoomId);
      const roomSnap = await roomRef.get();
      const roomData = roomSnap.data();
      if (!roomData) return;

      const members = roomData.members || [];
      // 현재 방에 들어와 있는 사람들 (접속자 명단)
      const activeUsers = roomData.activeUsers || [];

      // 나(보낸 사람) 제외
      const receiverIds = members.filter((uid) => uid !== senderId);
      if (receiverIds.length === 0) return;

      const updateData = {
          lastMessage: messageText, 
          lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp() 
      };
      
      receiverIds.forEach(uid => {
          // ✨ 중요: 지금 방에 보고 있는 사람(activeUsers)이면 숫자를 올리지 않음!
          // (혹은 숫자는 올려두고 앱에서 0으로 만들 수도 있지만, 알림은 확실히 막아야 함)
          // 여기서는 숫자는 일단 올립니다. (앱에서 0으로 만드는 게 더 정확함)
          updateData[`unreadCounts.${uid}`] = admin.firestore.FieldValue.increment(1);
      });

      // DB 업데이트
      await roomRef.update(updateData);

      // --- [푸시 알림 보내기] ---
      const messagesToSend = [];
      
      for (const uid of receiverIds) {
        // ✨ 핵심: 접속 중인 사람(activeUsers)에게는 알림을 보내지 않음!
        if (activeUsers.includes(uid)) {
            console.log(`🔕 접속 중이라 알림 생략: ${uid}`);
            continue; 
        }

        const userSnap = await admin.firestore().collection("users").doc(uid).get();
        const userData = userSnap.data();
        
        if (userData && userData.pushToken && userData.pushToken.startsWith("ExponentPushToken")) {
          messagesToSend.push({
            to: userData.pushToken,
            sound: 'default',
            title: roomData.name || "새 메시지",
            body: messageText.length > 50 ? messageText.substring(0, 50) + "..." : messageText,
            data: { url: `/chat/${chatRoomId}` },
            _displayInForeground: true,
          });
        }
      }

      if (messagesToSend.length > 0) {
        await sendToExpo(messagesToSend);
      }

    } catch (error) {
      console.error("채팅 알림 에러:", error);
    }
  });
// ==========================================
// 3. 마켓 상태 변경 알림
// ==========================================
exports.sendMarketStatusNotification = functions.firestore
  .document("marketPosts/{postId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const postId = context.params.postId;

    if (before.status !== "판매완료" && after.status === "판매완료") {
      
      const messagesToSend = [];

      // (1) 구매자에게
      if (after.buyerId) {
        const buyerSnap = await admin.firestore().collection("users").doc(after.buyerId).get();
        const buyerData = buyerSnap.data();

        if (buyerData && buyerData.pushToken && buyerData.pushToken.startsWith("ExponentPushToken")) {
          messagesToSend.push({
            to: buyerData.pushToken,
            title: "거래 완료! 📦",
            body: "구매가 확정되었습니다. 거래 후기를 남겨주세요.",
            data: { url: "/(tabs)/marketlist" },
            _displayInForeground: true,
          });
        }
      }

      // (2) 찜한 사람들에게
      const wishersSnap = await admin.firestore()
        .collection("users")
        .where("wishlist", "array-contains", postId)
        .get();

      wishersSnap.forEach((doc) => {
        const userData = doc.data();
        if (doc.id !== after.buyerId && userData.pushToken && userData.pushToken.startsWith("ExponentPushToken")) {
          messagesToSend.push({
            to: userData.pushToken,
            title: "아쉽네요 🥲",
            body: `찜하신 '${after.title}' 상품이 판매 완료되었습니다.`,
            data: { url: "/(tabs)/marketlist" },
            _displayInForeground: true,
          });
        }
      });

      if (messagesToSend.length > 0) {
        await sendToExpo(messagesToSend);
      }
    }
  });

// ==========================================
// 4. 신뢰도 변경 알림 (멘트 세분화 완료!)
// ==========================================
exports.sendTrustScoreNotification = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // 점수 변화 없으면 무시
    if (before.trustScore === after.trustScore) return;

    const messagesToSend = [];
    const diff = after.trustScore - before.trustScore; // 변화량 (양수면 상승, 음수면 하락)
    
    if (after.pushToken && after.pushToken.startsWith("ExponentPushToken")) {
        let title = "";
        let body = "";

        // (1) 점수 상승 (칭찬)
        if (diff > 0) {
            title = "신뢰도가 상승했습니다! 🎉";
            
            if (diff === 2) {
                 // 택시 정상 탑승 (+2)
                 body = `택시 파티 운행 완료! 신뢰도 2점을 획득했습니다. (현재: ${after.trustScore}점)`;
            } else if (diff === 3) {
                 // 중고거래 좋아요 (+3)
                 body = `기분 좋은 거래 완료! 상대방에게 좋은 평가를 받아 3점을 획득했습니다.`;
            } else {
                 // 기타 상승
                 body = `활동을 통해 신뢰도 ${diff}점을 얻어 ${after.trustScore}점이 되었습니다.`;
            }
        } 
        
        // (2) 점수 하락 (경고)
        else {
            title = "신뢰도가 하락했습니다 📉";
            const absDiff = Math.abs(diff); // 절댓값

            if (absDiff === 7) {
                // 택시 노쇼 (-7)
                title = "택시 파티 노쇼 패널티 🚨";
                body = `약속 불이행(노쇼)으로 인해 7점이 차감되었습니다. 반복 시 이용이 제한될 수 있습니다.`;
            } else if (absDiff === 15) {
                // 중고거래 비매너 (-15)
                title = "비매너 거래 패널티 🚨";
                body = `부정적인 거래 후기로 인해 15점이 대폭 차감되었습니다. 매너 있는 거래를 부탁드립니다.`;
            } else {
                // 기타 하락
                body = `신뢰 점수가 ${absDiff}점 차감되어 ${after.trustScore}점이 되었습니다.`;
            }
        }

        messagesToSend.push({
          to: after.pushToken,
          title: title,
          body: body,
          data: { url: "/profile" },
          _displayInForeground: true,
        });

        await sendToExpo(messagesToSend);
    }
  });
// ==========================================
// 5. 시간표 알림 스케줄러 (최종 수정 버전: 지각 방지 + moment 적용)
// ==========================================
exports.checkTimetableNotifications = functions.pubsub
  .schedule('20 9-18 * * 1-5') // 테스트 끝나면 '20 9-18 * * 1-5' 로 변경하세요
  .timeZone('Asia/Seoul')
  .onRun(async (context) => {
    
    // 1. 현재 한국 시간 구하기 (moment-timezone 사용)
    const now = moment().tz('Asia/Seoul');
    const dayName = now.format('dddd'); // "Monday", "Sunday"...
    
    // 요일 한글 변환
    const dayMap = { 
        'Sunday': '일요일', 'Monday': '월요일', 'Tuesday': '화요일', 
        'Wednesday': '수요일', 'Thursday': '목요일', 'Friday': '금요일', 'Saturday': '토요일' 
    };
    const currentDayKorean = dayMap[dayName];

    // 2. 검색 기준 시간 설정 (지금으로부터 10분 뒤 수업을 찾음)
    const targetTime = now.clone().add(10, 'minutes'); 
    
    // 비교를 위해 '시.분' 소수점으로 변환 (예: 2시 30분 -> 2.5)
    const targetValue = targetTime.hour() + (targetTime.minute() / 60);

    // 🚨 핵심 수정: 검색 범위를 앞뒤 5분(0.08)으로 넉넉하게 잡음
    // 서버가 1~2분 늦게 켜져도 여기서 다 걸림
    const minRange = targetValue - 0.08; 
    const maxRange = targetValue + 0.08; 

    console.log(`[KST] 현재: ${now.format('HH:mm')}, 타겟: ${targetTime.format('HH:mm')} (${currentDayKorean})`);
    console.log(`[검색 범위] ${minRange.toFixed(2)} ~ ${maxRange.toFixed(2)} 사이 수업`);

    try {
      const snapshot = await admin.firestore().collection('timetables').get();
      const messagesToSend = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        // 데이터 없거나 온라인 강의면 패스
        if (!data.time || data.isOnline) return;

        // DB 형식: "일요일 02:30-03:30"
        const parts = data.time.split(' ');
        if (parts.length < 2) return;
        
        const dayStr = parts[0]; 
        const timeRange = parts[1];
        const startTimeStr = timeRange.split('-')[0]; // "02:30"
        
        const [h, m] = startTimeStr.split(':').map(Number);
        const startTimeVal = h + (m / 60);

        // 요일 일치 & 시간 범위 일치 확인
        if (dayStr === currentDayKorean && startTimeVal >= minRange && startTimeVal <= maxRange) {
           messagesToSend.push({
             uid: data.userId,
             courseName: data.courseName,
             location: data.location
           });
        }
      });

      if (messagesToSend.length === 0) {
          console.log("📭 보낼 알림 없음");
          return;
      }

      // 알림 발송
      await Promise.all(messagesToSend.map(async (item) => {
        const userSnap = await admin.firestore().collection('users').doc(item.uid).get();
        const userData = userSnap.data();

        if (userData && userData.pushToken && userData.pushToken.startsWith("ExponentPushToken")) {
           await sendToExpo([{
             to: userData.pushToken,
             title: "수업 10분 전! ⏰",
             body: `${item.courseName} 수업이 곧 시작됩니다. (${item.location})`,
             data: { url: "/(tabs)/timetable" },
             sound: 'default'
           }]);
           console.log(`✅ 발송 성공: ${item.courseName} -> ${userData.name || '유저'}`);
        }
      }));

    } catch (error) {
      console.error("❌ 스케줄러 에러:", error);
    }
  });