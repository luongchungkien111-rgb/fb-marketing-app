// Sinh noi dung tra loi binh luan + phan loai hanh dong bang Google Gemini
// (co goi mien phi).
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Chua cau hinh GEMINI_API_KEY trong .env');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: 'application/json' },
  });
}

/**
 * Phan tich 1 binh luan va quyet dinh hanh dong:
 * - "reply": tra loi binh thuong (co the kem urgent=true neu khach buc/phan nan gay gat)
 * - "hide": spam / quang cao cua nguoi khac / noi dung xuc pham -> nen an di
 * - "ignore": khong lien quan nhung vo hai (vd tag ban be, chat linh tinh) -> bo qua, khong an
 *
 * Tra ve { action, reply, urgent } hoac null neu loi/khong doc duoc phan hoi.
 */
async function analyzeComment({ pageContext, postContent, commentText, commenterName }) {
  const model = getModel();

  const prompt = `Bạn là nhân viên chăm sóc khách hàng của salon tóc "${pageContext.name}".
Địa chỉ: ${pageContext.address || 'chưa cập nhật'}. Hotline: ${pageContext.phone || 'chưa cập nhật'}. Giờ mở cửa: ${pageContext.hours || '8:00 - 20:00 hằng ngày'}.

Nội dung bài đăng gốc: "${postContent.slice(0, 300)}"
Khách "${commenterName}" bình luận: "${commentText}"

Phân tích bình luận này và trả về JSON theo đúng schema sau, không thêm chữ nào khác ngoài JSON:
{
  "action": "reply" | "hide" | "ignore",
  "reply": "câu trả lời ngắn gọn (1-2 câu, tiếng Việt, thân thiện) hoặc null",
  "urgent": true hoặc false
}

Quy tắc chọn "action":
- "reply": bình luận là câu hỏi (giá, giờ mở cửa, địa chỉ, đặt lịch), lời khen/cảm ơn, hoặc phàn nàn/không hài lòng về dịch vụ. Viết "reply" phù hợp:
  - Hỏi thông tin: trả lời thẳng bằng dữ liệu ở trên, mời inbox/gọi hotline để tư vấn thêm.
  - Khen/cảm ơn: cảm ơn ngắn gọn, ấm áp.
  - Phàn nàn: xin lỗi chân thành, mời khách inbox riêng để hỗ trợ — KHÔNG tranh cãi công khai. Đặt "urgent": true nếu khách có vẻ rất bực bội/giận dữ (dùng từ ngữ gay gắt, doạ tố cáo, đòi hoàn tiền...).
- "hide": bình luận là spam, link quảng cáo dịch vụ/sản phẩm của người/công ty khác, nội dung xúc phạm hoặc quấy rối. Khi đó "reply" = null.
- "ignore": không liên quan gì đến salon (vd chỉ tag bạn bè, emoji vô nghĩa, chat linh tinh) nhưng vô hại, không phải spam. Khi đó "reply" = null.

Chỉ trả về đúng 1 object JSON, không có markdown, không có giải thích thêm.`;

  const result = await model.generateContent(prompt);
  const raw = (result.response.text() || '').trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // phan hoi khong dung dinh dang JSON - bo qua vong nay, thu lai lan sau
  }

  const action = ['reply', 'hide', 'ignore'].includes(parsed.action) ? parsed.action : 'ignore';
  return {
    action,
    reply: action === 'reply' && parsed.reply ? String(parsed.reply).trim() : null,
    urgent: action === 'reply' && parsed.urgent === true,
  };
}

/**
 * Phan tich 1 tin nhan Messenger rieng tu (inbox) va sinh cau tra loi.
 * Khac voi binh luan cong khai: tin nhan rieng luon nen tra loi (khong co
 * "hide"/"ignore"), chi can quyet dinh noi dung tra loi + co "urgent" khong
 * (khach buc/can nguoi that xu ly gap).
 * Tra ve { reply, urgent } hoac null neu loi/khong doc duoc phan hoi.
 */
async function analyzeMessage({ pageContext, messageText, senderName }) {
  const model = getModel();

  const prompt = `Bạn là nhân viên chăm sóc khách hàng của salon tóc "${pageContext.name}", đang trả lời tin nhắn riêng (Messenger) của khách.
Địa chỉ: ${pageContext.address || 'chưa cập nhật'}. Hotline: ${pageContext.phone || 'chưa cập nhật'}. Giờ mở cửa: ${pageContext.hours || '8:00 - 20:00 hằng ngày'}.

Khách "${senderName}" nhắn: "${messageText}"

Trả về ĐÚNG JSON theo schema sau, không thêm chữ nào khác ngoài JSON:
{
  "reply": "câu trả lời ngắn gọn (1-3 câu, tiếng Việt, thân thiện, đúng trọng tâm câu hỏi)",
  "urgent": true hoặc false
}

Quy tắc:
- Hỏi giá/dịch vụ/giờ mở cửa/địa chỉ: trả lời thẳng bằng thông tin ở trên, mời đặt lịch nếu phù hợp.
- Muốn đặt lịch: xác nhận sẽ sắp xếp, hỏi khách khung giờ mong muốn (nếu chưa nói), mời gọi hotline nếu cần gấp.
- Phàn nàn/không hài lòng: xin lỗi chân thành, trấn an sẽ xử lý, đặt "urgent": true nếu khách bức xúc rõ rệt (dùng từ gay gắt, đòi hoàn tiền, doạ đánh giá xấu...).
- Chat linh tinh/không rõ ý: trả lời lịch sự, hỏi lại khách cần hỗ trợ gì.

Chỉ trả về đúng 1 object JSON, không có markdown, không có giải thích thêm.`;

  const result = await model.generateContent(prompt);
  const raw = (result.response.text() || '').trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed.reply) return null;

  return { reply: String(parsed.reply).trim(), urgent: parsed.urgent === true };
}

module.exports = { analyzeComment, analyzeMessage };
