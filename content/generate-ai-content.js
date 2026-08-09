// Dung Gemini de tu sinh bo 30 caption moi (thay vi phai nho soan tay moi
// thang). Ghi ra content/ai-templates-women.json va ai-templates-men.json -
// generate-calendar.js se tu dong uu tien dung file nay neu co, thay vi bo
// template co dinh cu.
// Chay: node content/generate-ai-content.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const NUM_DAYS = 30;

const OUT_WOMEN = path.join(__dirname, 'ai-templates-women.json');
const OUT_MEN = path.join(__dirname, 'ai-templates-men.json');

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Chua cau hinh GEMINI_API_KEY trong .env');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'array', items: { type: 'string' } },
    },
  });
}

function buildPrompt(audience) {
  const audienceDesc =
    audience === 'men'
      ? 'nam giới, dân văn phòng (cắt tóc nam, tạo kiểu, cạo mặt, gội dưỡng, nhuộm tóc nam)'
      : 'nữ giới, dân văn phòng (cắt, uốn, nhuộm, gội dưỡng tóc)';

  return `Bạn là chuyên gia content marketing cho salon tóc tại Việt Nam, đối tượng khách hàng chính là ${audienceDesc}, thu nhập trung lưu.

Viết ${NUM_DAYS} caption Facebook KHÁC NHAU cho salon tóc, mỗi caption dùng cho 1 ngày trong tháng (xoay vòng đủ các chủ đề, không lặp ý).

Yêu cầu mỗi caption:
- Bằng tiếng Việt, 2-4 câu, có 1 emoji mở đầu phù hợp
- Xen kẽ các loại chủ đề: ưu đãi/khuyến mãi, mẹo chăm sóc tóc, giới thiệu dịch vụ, giới thiệu đội ngũ/không gian salon, câu hỏi thường gặp, lời cảm ơn khách hàng, chương trình giới thiệu bạn bè, before-after (nhắc là ảnh khách thật, không phải ảnh sưu tầm)
- LUÔN dùng placeholder {salon} thay cho tên salon (ví dụ: "Chào mừng đến với {salon}") - đây là biến sẽ được thay bằng tên thật khi dùng
- Có 1 dòng hashtag ngắn cuối caption (2-3 hashtag tiếng Việt không dấu, liền nhau, có dấu #)
- Giọng văn gần gũi, ấm áp, không quá trang trọng, phù hợp fanpage salon nhỏ
- KHÔNG đề cập địa chỉ/số điện thoại cụ thể (sẽ được thêm riêng)

Trả về ĐÚNG một mảng JSON gồm ${NUM_DAYS} chuỗi (string), mỗi phần tử là 1 caption hoàn chỉnh, không đánh số thứ tự, không có chữ nào khác ngoài JSON array.`;
}

async function generateFor(audience) {
  const model = getModel();
  const prompt = buildPrompt(audience);
  console.log(`Dang goi Gemini de sinh ${NUM_DAYS} caption cho nhom "${audience}"...`);

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const captions = JSON.parse(raw);

  if (!Array.isArray(captions) || captions.length < NUM_DAYS) {
    throw new Error(`Gemini tra ve khong du ${NUM_DAYS} caption (nhan duoc ${Array.isArray(captions) ? captions.length : 'khong phai array'})`);
  }
  return captions.slice(0, NUM_DAYS);
}

async function main() {
  const women = await generateFor('women');
  fs.writeFileSync(OUT_WOMEN, JSON.stringify(women, null, 2), 'utf8');
  console.log(`Da luu ${women.length} caption nu -> ${OUT_WOMEN}`);

  const men = await generateFor('men');
  fs.writeFileSync(OUT_MEN, JSON.stringify(men, null, 2), 'utf8');
  console.log(`Da luu ${men.length} caption nam -> ${OUT_MEN}`);

  console.log('\nXong! Chay "node content/generate-calendar.js" de tao lich moi su dung noi dung nay.');
}

main().catch((err) => {
  console.error('Loi:', err.message);
  process.exit(1);
});
