// Canh bao khi co bai dang that bai vinh vien, hoac khi phat hien binh luan
// khach hang buc/phan nan gay gat can nguoi xu ly ngay.
// Luon ghi vao file log de xem lai sau. Ho tro 2 kenh gui tuc thi (tuy chon,
// dung kenh nao co cau hinh trong .env, khong bat buoc):
//  - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID: gui qua Telegram Bot (de setup nhat)
//  - WEBHOOK_URL: gui POST JSON toi webhook bat ky (Zalo OA, Slack, Discord...)
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const LOG_FILE = path.join(__dirname, 'data', 'canh-bao.log');

function appendLog(line) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch (err) {
    appendLog(`[${new Date().toISOString()}] Gui Telegram that bai: ${err.response?.data?.description || err.message}`);
  }
}

async function sendWebhook(payload) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, payload);
  } catch (err) {
    appendLog(`[${new Date().toISOString()}] Gui webhook that bai: ${err.message}`);
  }
}

async function notifyFailure({ postId, pageName, error }) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] Bai #${postId} (Page: ${pageName}) that bai vinh vien: ${error}`;
  appendLog(line);

  await Promise.all([
    sendTelegram(`⚠️ <b>Bài đăng thất bại</b>\nPage: ${pageName}\nID: #${postId}\nLỗi: ${error}`),
    sendWebhook({ type: 'post_failed', text: `⚠️ Bài đăng thất bại trên "${pageName}" (id #${postId}).\nLỗi: ${error}`, post_id: postId, page_name: pageName, error, timestamp }),
  ]);
}

/**
 * Canh bao khi AI phat hien 1 binh luan khach hang buc/phan nan gay gat,
 * can nguoi that vao xu ly ngay (khong the giao het cho AI tu tra loi).
 */
async function notifyUrgentComment({ pageName, commentText, commenterName, replyDraft, postUrl }) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] CAN CHU Y - Page "${pageName}": "${commenterName}" binh luan: "${commentText}"`;
  appendLog(line);

  const link = postUrl ? `\n🔗 ${postUrl}` : '';
  await Promise.all([
    sendTelegram(
      `🚨 <b>Khách có vẻ đang bực - cần kiểm tra</b>\nPage: ${pageName}\nKhách: ${commenterName}\nBình luận: "${commentText}"\n\n💬 AI đã trả lời tạm: "${replyDraft || ''}"${link}`
    ),
    sendWebhook({
      type: 'urgent_comment',
      text: `🚨 Khách "${commenterName}" bình luận gay gắt trên Page "${pageName}": "${commentText}"`,
      page_name: pageName,
      comment_text: commentText,
      commenter_name: commenterName,
      reply_draft: replyDraft,
      post_url: postUrl,
      timestamp,
    }),
  ]);
}

/**
 * Canh bao khi AI phat hien 1 tin nhan Messenger rieng tu tu khach dang buc/
 * phan nan gay gat, can nguoi that vao xu ly ngay.
 */
async function notifyUrgentMessage({ pageName, messageText, senderName, replyDraft }) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] CAN CHU Y (Tin nhan) - Page "${pageName}": "${senderName}" nhan: "${messageText}"`;
  appendLog(line);

  await Promise.all([
    sendTelegram(
      `🚨 <b>Khách nhắn tin có vẻ đang bực - cần kiểm tra</b>\nPage: ${pageName}\nKhách: ${senderName}\nTin nhắn: "${messageText}"\n\n💬 AI đã trả lời tạm: "${replyDraft || ''}"`
    ),
    sendWebhook({
      type: 'urgent_message',
      text: `🚨 Khách "${senderName}" nhắn tin gay gắt tới Page "${pageName}": "${messageText}"`,
      page_name: pageName,
      message_text: messageText,
      sender_name: senderName,
      reply_draft: replyDraft,
      timestamp,
    }),
  ]);
}

module.exports = { notifyFailure, notifyUrgentComment, notifyUrgentMessage };
