const functions = require("firebase-functions");
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
// 2. 채팅 알림
// ==========================================
exports.sendChatNotification = functions.firestore
  .document("chatRooms/{chatRoomId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const messageData = snapshot.data();
    const chatRoomId = context.params.chatRoomId;
    const senderId = messageData.senderId;
    const messageText = messageData.text;

    try {
      const roomSnap = await admin.firestore().collection("chatRooms").doc(chatRoomId).get();
      const roomData = roomSnap.data();
      if (!roomData) return;

      const members = roomData.members || [];
      const receiverIds = members.filter((uid) => uid !== senderId);
      if (receiverIds.length === 0) return;

      const messagesToSend = [];
      
      for (const uid of receiverIds) {
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