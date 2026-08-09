// Tich hop TikTok Content Posting API - che do "Upload to TikTok" (dua video
// vao Inbox nhap cua tai khoan de nguoi dung tu mo app TikTok bam Dang), KHONG
// dung Direct Post vi che do do can App duoc TikTok audit moi dang cong khai
// duoc. Xem README de biet cach tao App/lay Client Key & Secret.
const fs = require('fs');
const axios = require('axios');

const AUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize/';
const API_BASE = 'https://open.tiktokapis.com/v2';

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

/**
 * Sinh URL dua nguoi dung sang trang dang nhap + cap quyen cua TikTok.
 * Khac Facebook: TikTok khong cho gop nhieu tai khoan trong 1 lan dang nhap -
 * moi tai khoan TikTok phai tu dang nhap + xac nhan rieng.
 */
function getLoginDialogUrl({ redirectUri, state }) {
  const scope = ['user.info.basic', 'video.upload'].join(',');
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

/**
 * Doi authorization code lay tu callback thanh access token + refresh token.
 * access_token het han sau ~24h, refresh_token het han sau ~365 ngay.
 */
async function exchangeCodeForToken({ redirectUri, code }) {
  const res = await axios.post(
    `${API_BASE}/oauth/token/`,
    new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data; // { access_token, expires_in, refresh_token, refresh_expires_in, open_id, scope, token_type }
}

/**
 * Lam moi access token bang refresh token (goi dinh ky truoc khi access token
 * het han - xem refreshAccountTokenIfNeeded trong db.js).
 */
async function refreshAccessToken(refreshToken) {
  const res = await axios.post(
    `${API_BASE}/oauth/token/`,
    new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data;
}

/**
 * Lay thong tin co ban cua tai khoan (ten hien thi, avatar) - dung khi vua
 * ket noi de hien thi trong danh sach.
 */
async function getUserInfo(accessToken) {
  const res = await axios.get(`${API_BASE}/user/info/`, {
    params: { fields: 'open_id,display_name,avatar_url' },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data.data.user; // { open_id, display_name, avatar_url }
}

/**
 * Dua 1 video local len Inbox nhap cua tai khoan TikTok (khong tu dong cong
 * khai - nguoi dung phai tu mo app TikTok, xem lai va bam "Dang"). Day la che
 * do duy nhat dung duoc ma KHONG can App qua audit cua TikTok.
 * Luu y: draft trong Inbox se tu bien mat sau 1 thoi gian (theo TikTok la vai
 * ngay) neu khong ai bam dang - can nhac lich dang som sau khi upload.
 */
async function uploadVideoToInbox({ accessToken, videoPath }) {
  const stat = fs.statSync(videoPath);
  const videoSize = stat.size;

  const initRes = await axios.post(
    `${API_BASE}/post/publish/inbox/video/init/`,
    {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  if (initRes.data.error?.code && initRes.data.error.code !== 'ok') {
    throw new Error(`TikTok init loi: ${initRes.data.error.code} - ${initRes.data.error.message}`);
  }
  const { publish_id, upload_url } = initRes.data.data;

  await axios.put(upload_url, fs.createReadStream(videoPath), {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return { publish_id };
}

/**
 * Kiem tra trang thai 1 lan upload (publish_id tra ve tu uploadVideoToInbox).
 * Cac trang thai: PROCESSING_UPLOAD -> PROCESSING_DOWNLOAD -> SEND_TO_USER_INBOX
 * (thanh cong, cho nguoi dung tu dang) hoac FAILED.
 */
async function getPublishStatus({ accessToken, publishId }) {
  const res = await axios.post(
    `${API_BASE}/post/publish/status/fetch/`,
    { publish_id: publishId },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  return res.data.data; // { status, fail_reason, ... }
}

module.exports = {
  getLoginDialogUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserInfo,
  uploadVideoToInbox,
  getPublishStatus,
};
