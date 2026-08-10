// Nhan tin nhan Messenger real-time tu Facebook qua Webhook (Meta goi POST ve
// khi co tin nhan moi tren bat ky Page nao da subscribe app nay).
// Yeu cau: app phai co dia chi web cong khai HTTPS (khong dung duoc localhost
// truc tiep) va da cau hinh Webhooks trong Meta App Dashboard - xem huong dan
// trong README/tin nhan huong dan cua Claude.
const crypto = require('crypto');
const db = require('./db');
const { sendMessengerMessage, getMessengerUserProfile } = require('./facebook');
const { analyzeMessage } = require('./ai-reply');
const { notifyUrgentMessage, notifyNewMessage } = require('./notify');

// Thong tin salon (khop voi content/update-page-info.js) - dung khi AI tra loi tin nhan
const SALON_INFO = {
  hours: '8:00 - 20:00 hằng ngày',
  phone: '+84987792781',
  address: '31 ngõ 68 Trung Kính, Cầu Giấy, Hà Nội',
};

/**
 * Kiem tra chu ky X-Hub-Signature-256 de chac chan request nay that su den tu
 * Facebook (khong phai gia mao). Can req.rawBody (buffer goc truoc khi parse JSON).
 */
function verifySignature(req) {
  const appSecret = process.env.FB_APP_SECRET;
  if (!appSecret) return true; // chua cau hinh secret - bo qua kiem tra (da canh bao luc khoi dong server)
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Xu ly buoc xac minh webhook (GET) - Facebook goi 1 lan khi ban luu cau hinh
 * Webhooks tren Meta App Dashboard de kiem tra ban thuc su so huu endpoint nay.
 */
function handleVerify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && process.env.FB_WEBHOOK_VERIFY_TOKEN && token === process.env.FB_WEBHOOK_VERIFY_TOKEN) {
    console.log('[messenger-webhook] Xac minh webhook thanh cong.');
    return res.status(200).send(challenge);
  }
  console.warn('[messenger-webhook] Xac minh webhook THAT BAI - kiem tra lai FB_WEBHOOK_VERIFY_TOKEN trong .env co khop voi gia tri da nhap tren Meta App Dashboard khong.');
  return res.sendStatus(403);
}

/**
 * Xu ly su kien (POST) - Facebook goi moi khi co tin nhan/su kien Messenger moi.
 * Phai tra loi 200 that nhanh (trong vai giay) neu khong Facebook coi la loi va
 * gui lai nhieu lan - nen ack ngay roi xu ly AI/gui tra loi o phia sau (async).
 */
async function handleEvent(req, res) {
  if (!verifySignature(req)) {
    console.warn('[messenger-webhook] Chu ky khong khop - tu choi request.');
    return res.sendStatus(403);
  }
  res.sendStatus(200);

  const body = req.body || {};
  if (body.object !== 'page') return;

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      if (event.message && !event.message.is_echo) {
        processIncomingMessage(event).catch((err) =>
          console.error('[messenger-webhook] Loi xu ly tin nhan:', err.response?.data?.error?.message || err.message)
        );
      }
    }
  }
}

async function processIncomingMessage(event) {
  const fbPageId = event.recipient.id;
  const senderId = event.sender.id;
  const text = event.message.text || '(tin nhắn không phải văn bản - ảnh/sticker/file)';
  const mid = event.message.mid;
  const timestamp = event.timestamp;

  const page = db.findPageByFbId(fbPageId);
  if (!page) return; // Page nay chua duoc ket noi trong phan mem - bo qua

  let senderName = null;
  try {
    senderName = await getMessengerUserProfile(senderId, page.access_token);
  } catch {
    // khong lay duoc ten - van luu tin nhan binh thuong, hien "Khach"
  }

  const saved = db.addIncomingMessage({ fbPageId, participantId: senderId, participantName: senderName, text, mid, timestamp });
  if (!saved) return; // tin nhan trung (Facebook gui lai webhook) - bo qua

  console.log(`[messenger-webhook] Tin nhan moi tren "${page.name}" tu "${senderName || senderId}": ${text.slice(0, 60)}`);
  notifyNewMessage({ pageName: page.name, messageText: text, senderName: senderName || 'khách' });

  if (page.messenger_ai_enabled && process.env.GEMINI_API_KEY) {
    try {
      const ai = await analyzeMessage({
        pageContext: { name: page.name, ...SALON_INFO },
        messageText: text,
        senderName: senderName || 'khách',
      });
      if (ai && ai.reply) {
        const sendRes = await sendMessengerMessage({
          pageId: page.page_id,
          accessToken: page.access_token,
          recipientId: senderId,
          text: ai.reply,
        });
        db.addOutgoingMessage({ pageRowId: page.id, participantId: senderId, text: ai.reply, mid: sendRes.message_id, viaAi: true });
        console.log(`[messenger-webhook] AI da tra loi tin nhan tren "${page.name}".`);

        if (ai.urgent) {
          await notifyUrgentMessage({ pageName: page.name, messageText: text, senderName: senderName || 'khách', replyDraft: ai.reply });
        }
      }
    } catch (err) {
      console.error(`[messenger-webhook] AI tra loi that bai cho Page "${page.name}":`, err.response?.data?.error?.message || err.message);
    }
  }
}

module.exports = { handleVerify, handleEvent };
