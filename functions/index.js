const functions = require("firebase-functions");
const nodemailer = require("nodemailer");
const cors = require("cors")({ origin: true });

// 메일 발송 도구 설정
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "kduemailtest@gmail.com", 
    pass: "ilgqqdiqgjxpxuys",        // ⚠️ 본인 앱 비밀번호 (유지)
  },
});

exports.sendVerificationCode = functions.https.onCall(async (data, context) => {
  // 📦 [수정] 데이터 포장지 벗기기 (가장 중요한 부분!)
  // 데이터가 data 안에 또 data로 감싸져서 올 경우를 대비한 코드입니다.
  const requestData = data.data || data; 

  console.log("============ [데이터 수신 확인] ============");
  console.log("최종 추출 데이터:", requestData);
  console.log("이메일:", requestData.email);
  console.log("인증번호:", requestData.code);
  console.log("==========================================");

  const email = requestData.email;
  const code = requestData.code;

  // 안전장치: 이메일이 없으면 에러 처리
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
    console.log("✅ 메일 전송 성공!");
    return { success: true };
  } catch (error) {
    console.error("❌ 메일 전송 에러:", error);
    throw new functions.https.HttpsError("internal", "메일 전송 실패", error.message);
  }
}); 