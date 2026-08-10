// Helper dung chung server.js (API upload thu cong) va scheduler.js (dang tu
// dong theo lich) de luon co access token con hieu luc cho 1 tai khoan TikTok.
const db = require('./db');
const tiktok = require('./tiktok');

/**
 * Lay access token con hieu luc cho 1 tai khoan - tu lam moi bang refresh
 * token neu access token da/sap het han (duoi 10 phut).
 */
async function getFreshTiktokAccessToken(accountId) {
  const acc = db.getTiktokAccountById(accountId);
  if (!acc) throw new Error('Khong tim thay tai khoan TikTok');
  const expiresInMs = new Date(acc.expires_at).getTime() - Date.now();
  if (expiresInMs > 10 * 60 * 1000) return acc.access_token;

  const refreshed = await tiktok.refreshAccessToken(acc.refresh_token);
  const nowMs = Date.now();
  db.updateTiktokAccountTokens(acc.id, {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: new Date(nowMs + refreshed.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(nowMs + refreshed.refresh_expires_in * 1000).toISOString(),
  });
  return refreshed.access_token;
}

module.exports = { getFreshTiktokAccessToken };
