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

async function notifyFacebookHealth({ ok, checked, failed, failures = [] }) {
  const timestamp = new Date().toISOString();
  const details = failures.slice(0, 10).map((item) => `- ${item.page_name}: ${item.reason}`).join('\n');
  const text = ok
    ? `✅ <b>Facebook hoạt động bình thường</b>\nĐã kiểm tra: ${checked} Page.`
    : `⛔ <b>Đã dừng lịch Facebook an toàn</b>\nKiểm tra: ${checked} Page\nLỗi: ${failed} Page\n${details}`;
  appendLog(`[${timestamp}] Facebook health: ok=${ok}, checked=${checked}, failed=${failed}`);
  await Promise.all([
    sendTelegram(text),
    sendWebhook({ type: 'facebook_health', ok, checked, failed, failures, timestamp }),
  ]);
}

/**
 * Bao ngay khi 1 video vua duoc dua vao Inbox nhap cua 1 tai khoan TikTok -
 * nhac nguoi dung mo app TikTok bam "Dang" som (draft se tu bien mat sau vai
 * ngay neu khong ai xac nhan). Khac notifyFailure (chi bao khi loi), cai nay
 * bao moi lan thanh cong vi day la buoc CAN LAM THEM (khong the tu dong hoa).
 */
async function notifyTiktokReadyToPost({ postId, accountName, videoPath }) {
  const timestamp = new Date().toISOString();
  const fileName = videoPath.split('/').pop();
  const line = `[${timestamp}] Video #${postId} (TikTok: ${accountName}) da vao Inbox - can bam Dang: ${fileName}`;
  appendLog(line);

  await Promise.all([
    sendTelegram(`🎵 <b>Video vào Inbox TikTok - cần bấm Đăng</b>\nTài khoản: ${accountName}\nVideo: ${fileName}\n\n👉 Mở app TikTok trên tài khoản này, xem lại rồi bấm "Đăng" (draft sẽ tự mất sau vài ngày nếu không đăng).`),
    sendWebhook({
      type: 'tiktok_ready_to_post',
      text: `🎵 Video vào Inbox TikTok tài khoản "${accountName}" - cần mở app bấm Đăng.`,
      post_id: postId,
      account_name: accountName,
      video_path: videoPath,
      timestamp,
    }),
  ]);
}

/**
 * Bao khi 1 bai dang len Page thanh cong (khong phai loi).
 */
async function notifyPostPublished({ postId, pageName, postUrl }) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] Da dang bai #${postId} (Page: ${pageName}) thanh cong.`;
  appendLog(line);

  const link = postUrl ? `\n🔗 ${postUrl}` : '';
  await Promise.all([
    sendTelegram(`✅ <b>Đã đăng bài</b>\nPage: ${pageName}\nID: #${postId}${link}`),
    sendWebhook({ type: 'post_published', text: `✅ Đã đăng bài trên "${pageName}" (id #${postId}).`, post_id: postId, page_name: pageName, post_url: postUrl, timestamp }),
  ]);
}

/**
 * Bao khi co 1 tin nhan Messenger moi tu khach gui toi Page (moi tin, khong
 * rieng tin gay gat - xem notifyUrgentMessage o duoi de phan biet muc do khan).
 */
async function notifyNewMessage({ pageName, messageText, senderName }) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] Tin nhan moi - Page "${pageName}": "${senderName}" nhan: "${messageText}"`;
  appendLog(line);

  await Promise.all([
    sendTelegram(`💬 <b>Tin nhắn mới</b>\nPage: ${pageName}\nKhách: ${senderName}\nTin nhắn: "${messageText}"`),
    sendWebhook({
      type: 'new_message',
      text: `💬 "${senderName}" nhắn tin tới Page "${pageName}": "${messageText}"`,
      page_name: pageName,
      message_text: messageText,
      sender_name: senderName,
      timestamp,
    }),
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

module.exports = { notifyFailure, notifyFacebookHealth, notifyTiktokReadyToPost, notifyPostPublished, notifyNewMessage, notifyUrgentComment, notifyUrgentMessage };
