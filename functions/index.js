const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const cors = require("cors")({ origin: true });

admin.initializeApp();

// ==========================================
// 🛠️ [공통 함수] Expo 서버로 알림 쏘기 (중복 제거)
// ==========================================
async function sendToExpo(messages) {
  try {
    // fetch는 Node.js 18 이상에서 기본 지원됩니다.
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
// 2. 채팅 알림 (리팩토링: 공통 함수 사용)
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
        // 
        await sendToExpo(messagesToSend);
      }

    } catch (error) {
      console.error("채팅 알림 에러:", error);
    }
  });

// ==========================================
// 3. 마켓 상태 변경 알림 (2번 찜, 4번 후기)
// ==========================================
exports.sendMarketStatusNotification = functions.firestore
  .document("marketPosts/{postId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const postId = context.params.postId;

    // '판매중' -> '판매완료'로 바뀔 때만 동작
    if (before.status !== "판매완료" && after.status === "판매완료") {
      
      const messagesToSend = [];

      // (1) 구매자에게: "구매 확정 감사합니다! 후기 남겨주세요" (4번 기능)
      if (after.buyerId) {
        const buyerSnap = await admin.firestore().collection("users").doc(after.buyerId).get();
        const buyerData = buyerSnap.data();

        if (buyerData && buyerData.pushToken && buyerData.pushToken.startsWith("ExponentPushToken")) {
          messagesToSend.push({
            to: buyerData.pushToken,
            title: "거래가 완료되었습니다! 🎉",
            body: "구매 후기를 남겨주세요. 판매자에게 큰 힘이 됩니다.",
            data: { url: "/(tabs)/marketlist" },
            _displayInForeground: true,
          });
        }
      }

      // (2) 찜한 사람들에게: "아쉽지만 판매 완료되었어요" (2번 기능)
      // users 컬렉션에서 wishlist 배열에 이 postId가 있는 사람들을 찾습니다.
      const wishersSnap = await admin.firestore()
        .collection("users")
        .where("wishlist", "array-contains", postId)
        .get();

      wishersSnap.forEach((doc) => {
        const userData = doc.data();
        // 구매자 본인은 제외하고 보냄
        if (doc.id !== after.buyerId && userData.pushToken && userData.pushToken.startsWith("ExponentPushToken")) {
          messagesToSend.push({
            to: userData.pushToken,
            title: "찜한 상품 판매 완료 🥲",
            body: `'${after.title}' 상품이 판매 완료되었습니다.`,
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

exports.sendTrustScoreNotification = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // 점수 변화가 없으면 무시
    if (before.trustScore === after.trustScore) return;

    const messagesToSend = [];

    // 1. 점수가 떨어졌을 때 (하락 알림)
    if (before.trustScore > after.trustScore) {
      const diff = before.trustScore - after.trustScore;
      
      if (after.pushToken && after.pushToken.startsWith("ExponentPushToken")) {
        let title = "신뢰도가 하락했습니다 📉";
        let body = `신뢰 점수가 ${diff}점 차감되어 ${after.trustScore}점이 되었습니다.`;

        if (diff >= 4) {
            title = "패널티 안내 🚨";
            body = `약속 불이행(노쇼)으로 ${diff}점이 차감되었습니다.`;
        }

        messagesToSend.push({
          to: after.pushToken,
          title: title,
          body: body,
          data: { url: "/profile" },
          _displayInForeground: true,
        });
      }
    }

    // ✨ 2. 점수가 올랐을 때 (상승 알림 - 추가됨!)
    if (after.trustScore > before.trustScore) {
      const diff = after.trustScore - before.trustScore;
      
      if (after.pushToken && after.pushToken.startsWith("ExponentPushToken")) {
        messagesToSend.push({
          to: after.pushToken,
          title: "신뢰도가 상승했습니다! 🎉",
          body: `택시 파티 참여로 ${diff}점을 얻어 ${after.trustScore}점이 되었습니다.`,
          data: { url: "/profile" },
          _displayInForeground: true,
        });
      }
    }

    if (messagesToSend.length > 0) {
      await sendToExpo(messagesToSend);
    }
  });
