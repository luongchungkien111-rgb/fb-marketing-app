require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const db = require('./db');
const {
  verifyPage,
  publishPost,
  getLoginDialogUrl,
  exchangeCodeForUserToken,
  getLongLivedUserToken,
  getUserPages,
  getGrantedPermissions,
  getPostInsights,
  getPageProfile,
  getPageFeed,
  sendMessengerMessage,
  subscribePageToWebhook,
} = require('./facebook');
const tiktok = require('./tiktok');
const { getFreshTiktokAccessToken } = require('./tiktok-token');
const { notifyTiktokReadyToPost } = require('./notify');
const { startScheduler } = require('./scheduler');
const { startBackupSchedule } = require('./backup');
const { startCommentReplier } = require('./comment-replier');
const { parseCsv, toCsv } = require('./csv');
const messengerWebhook = require('./messenger-webhook');
const { findDuplicateRisk } = require('./content-guard');
const { checkFacebookPages } = require('./facebook-health');
const { notifyFacebookHealth } = require('./notify');
const {
  PAUSED_MESSAGE,
  clearFacebookPostingPause,
  getFacebookPostingStatus,
  pauseIfFacebookAuthFailed,
} = require('./facebook-posting-control');

const app = express();
const PORT = process.env.PORT || 3000;

// verify: luu lai buffer goc cua body de kiem tra chu ky webhook Messenger
// (X-Hub-Signature-256) - cac route khac khong dung toi req.rawBody nen khong anh huong.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));

// ---------- WEBHOOK MESSENGER (rieng, khong qua cong dang nhap - Facebook goi truc tiep) ----------
app.get('/webhook/messenger', messengerWebhook.handleVerify);
app.post('/webhook/messenger', messengerWebhook.handleEvent);

// ---------- Dang nhap bao ve toan bo app (tuy chon qua APP_PASSWORD) ----------

const APP_PASSWORD = process.env.APP_PASSWORD;
const validSessions = new Set(); // luu trong bo nho - restart server se yeu cau dang nhap lai

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies;
}

if (APP_PASSWORD) {
  app.post('/login', (req, res) => {
    if (req.body?.password === APP_PASSWORD) {
      const token = crypto.randomBytes(24).toString('hex');
      validSessions.add(token);
      res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`);
      return res.redirect('/');
    }
    return res.redirect('/login.html?error=1');
  });

  app.use((req, res, next) => {
    if (req.path === '/login' || req.path === '/login.html') return next();
    if (req.path.startsWith('/webhook/')) return next(); // Facebook goi thang, khong co cookie dang nhap
    if (req.path === '/api/public/tiktok-schedule' && process.env.CONTENT_DESK_SYNC_KEY && req.headers['x-sync-key'] === process.env.CONTENT_DESK_SYNC_KEY) return next(); // Content Desk goi server-to-server, dung khoa rieng thay vi cookie
    if (req.path === '/style.css' || req.path === '/app.js') return next(); // can de trang login tu hien dung dang, khong lo lo du lieu gi ca
    if (req.path === '/terms.html' || req.path === '/privacy.html' || req.path.startsWith('/app-icon')) return next(); // trang cong khai bat buoc cho ho so TikTok Developer, khong chua du lieu rieng tu
    if (/^\/tiktok[\w-]*\.txt$/.test(req.path)) return next(); // file xac minh so huu URL/domain cho TikTok Developer Portal (vd tiktokXXXX.txt)
    const cookies = parseCookies(req);
    if (cookies.session && validSessions.has(cookies.session)) return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
      return res.status(401).json({ error: 'Chua dang nhap' });
    }
    return res.redirect('/login.html');
  });

  console.log('[auth] Da bat man hinh dang nhap (APP_PASSWORD da duoc cau hinh).');
} else {
  console.log('[auth] CHUA bat mat khau dang nhap - bat ky ai vao duoc localhost deu xem/sua duoc du lieu. Dat APP_PASSWORD trong .env de bat.');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ---------- FACEBOOK LOGIN (lay nhieu Page cung luc) ----------

const APP_ID = process.env.FB_APP_ID;
const APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = process.env.FB_REDIRECT_URI || `http://localhost:${PORT}/auth/facebook/callback`;

let pendingState = null; // don gian: 1 nguoi dung tren may local

app.get('/auth/facebook', (req, res) => {
  if (!APP_ID) {
    return res.status(500).send('Chua cau hinh FB_APP_ID trong file .env. Xem README de biet cach lay.');
  }
  pendingState = crypto.randomBytes(16).toString('hex');
  const url = getLoginDialogUrl({ appId: APP_ID, redirectUri: REDIRECT_URI, state: pendingState });
  res.redirect(url);
});

app.get('/auth/facebook/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    return res.send(`<p>Đăng nhập bị huỷ hoặc lỗi: ${error_description || error}</p><a href="/">Quay lại</a>`);
  }
  if (!code || !state || state !== pendingState) {
    return res.status(400).send('Yêu cầu không hợp lệ (thiếu code/state). <a href="/">Quay lại</a>');
  }
  pendingState = null;
  try {
    const shortToken = await exchangeCodeForUserToken({
      appId: APP_ID,
      appSecret: APP_SECRET,
      redirectUri: REDIRECT_URI,
      code,
    });
    const longToken = await getLongLivedUserToken({ appId: APP_ID, appSecret: APP_SECRET, shortLivedToken: shortToken });
    const grantedPermissions = await getGrantedPermissions(longToken);
    const requiredPermissions = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
    const missingPermissions = requiredPermissions.filter((permission) => !grantedPermissions.includes(permission));
    const pages = await getUserPages(longToken);
    if (!pages.length) {
      return res.send(
        '<p>Không tìm thấy Fanpage nào bạn quản lý (hoặc bạn chưa cấp đủ quyền). Hãy thử đăng nhập lại và chọn "Chỉnh sửa quyền truy cập" để cấp cho đúng Page.</p><a href="/">Quay lại</a>'
      );
    }
    const configuredPageIds = new Set(db.listPages().map((p) => String(p.page_id)));
    const returnedPageIds = new Set(pages.map((p) => String(p.id)));
    const missingPageCount = [...configuredPageIds].filter((id) => !returnedPageIds.has(id)).length;
    const { addedCount, updatedCount } = db.upsertPages(
      pages.map((p) => ({ name: p.name, page_id: p.id, access_token: p.access_token }))
    );
    if (missingPageCount === 0 && missingPermissions.length === 0) {
      clearFacebookPostingPause();
    } else {
      pauseIfFacebookAuthFailed({ response: { data: { error: { code: 200, message: 'Permission(s) must be granted before impersonating a user page.' } } } });
    }
    res.send(
      missingPageCount === 0 && missingPermissions.length === 0
        ? `<p>Đã kết nối lại thành công ${pages.length} Fanpage (thêm mới ${addedCount}, cập nhật ${updatedCount}). Cầu dao Facebook đã được mở lại.</p><a href="/">Quay lại phần mềm</a>`
        : `<p>Đã cập nhật ${pages.length} Fanpage nhưng kết nối chưa đạt yêu cầu: thiếu ${missingPageCount} Page; thiếu quyền ${missingPermissions.join(', ') || '0'}. Lịch Facebook vẫn tạm dừng. Hãy đăng nhập lại và chọn đủ Page/quyền, hoặc xóa Page không còn quản lý.</p><a href="/">Quay lại phần mềm</a>`
    );
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).send(`<p>Lỗi khi lấy Page: ${msg}</p><a href="/">Quay lại</a>`);
  }
});

// ---------- TIKTOK LOGIN (moi tai khoan phai tu dang nhap rieng - khac Facebook) ----------

const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || `http://localhost:${PORT}/auth/tiktok/callback`;
let pendingTiktokState = null;

app.get('/auth/tiktok', (req, res) => {
  if (!process.env.TIKTOK_CLIENT_KEY) {
    return res.status(500).send('Chua cau hinh TIKTOK_CLIENT_KEY trong file .env. Xem README de biet cach lay.');
  }
  pendingTiktokState = crypto.randomBytes(16).toString('hex');
  const url = tiktok.getLoginDialogUrl({ redirectUri: TIKTOK_REDIRECT_URI, state: pendingTiktokState });
  res.redirect(url);
});

app.get('/auth/tiktok/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    return res.send(`<p>Đăng nhập TikTok bị huỷ hoặc lỗi: ${error_description || error}</p><a href="/">Quay lại</a>`);
  }
  if (!code || !state || state !== pendingTiktokState) {
    return res.status(400).send('Yêu cầu không hợp lệ (thiếu code/state). <a href="/">Quay lại</a>');
  }
  pendingTiktokState = null;
  try {
    const token = await tiktok.exchangeCodeForToken({ redirectUri: TIKTOK_REDIRECT_URI, code });
    const user = await tiktok.getUserInfo(token.access_token);
    const nowMs = Date.now();
    db.upsertTiktokAccount({
      open_id: user.open_id,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(nowMs + token.expires_in * 1000).toISOString(),
      refresh_expires_at: new Date(nowMs + token.refresh_expires_in * 1000).toISOString(),
    });
    res.send(`<p>Đã kết nối tài khoản TikTok "${user.display_name}".</p><a href="/">Quay lại phần mềm</a>`);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).send(`<p>Lỗi khi kết nối TikTok: ${msg}</p><a href="/">Quay lại</a>`);
  }
});

// ---------- DASHBOARD ----------

// Tong hop nhanh hieu qua tung Page: so bai theo trang thai, tong luot
// tuong tac (tu insights da cap nhat), bai gan nhat.
app.get('/api/dashboard', (req, res) => {
  const pages = db.listPages();
  const allPosts = db.listPosts();

  const rows = pages.map((page) => {
    const posts = allPosts.filter((p) => p.page_row_id === page.id);
    const published = posts.filter((p) => p.status === 'published');
    const pending = posts.filter((p) => p.status === 'pending');
    const failed = posts.filter((p) => p.status === 'failed');

    const totals = published.reduce(
      (acc, p) => {
        if (p.insights) {
          acc.likes += p.insights.likes || 0;
          acc.comments += p.insights.comments || 0;
          acc.shares += p.insights.shares || 0;
        }
        return acc;
      },
      { likes: 0, comments: 0, shares: 0 }
    );

    const lastPublished = published
      .slice()
      .sort((a, b) => (a.scheduled_time < b.scheduled_time ? 1 : -1))[0];

    return {
      page_row_id: page.id,
      page_name: page.name,
      group: page.group || '',
      total: posts.length,
      published: published.length,
      pending: pending.length,
      failed: failed.length,
      likes: totals.likes,
      comments: totals.comments,
      shares: totals.shares,
      last_published_at: lastPublished ? lastPublished.scheduled_time : null,
      last_post_url: lastPublished ? lastPublished.post_url : null,
    };
  });

  // sap xep: page co tuong tac nhieu nhat len dau
  rows.sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares));

  const grandTotal = rows.reduce(
    (acc, r) => {
      acc.total += r.total;
      acc.published += r.published;
      acc.pending += r.pending;
      acc.failed += r.failed;
      acc.likes += r.likes;
      acc.comments += r.comments;
      acc.shares += r.shares;
      return acc;
    },
    { total: 0, published: 0, pending: 0, failed: 0, likes: 0, comments: 0, shares: 0 }
  );

  res.json({ pages: rows, totals: grandTotal });
});

// ---------- PAGES ----------

app.get('/api/pages', (req, res) => {
  res.json(db.listPages());
});

app.post('/api/pages', async (req, res) => {
  const { page_id, access_token } = req.body;
  if (!page_id || !access_token) {
    return res.status(400).json({ error: 'Thieu page_id hoac access_token' });
  }
  try {
    const info = await verifyPage(page_id, access_token);
    const page = db.addPage({ name: info.name, page_id: info.id, access_token });
    res.json({ id: page.id, name: page.name, page_id: page.page_id });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: `Khong xac thuc duoc Page/Token: ${msg}` });
  }
});

app.delete('/api/pages/:id', (req, res) => {
  db.deletePage(req.params.id);
  res.json({ ok: true });
});

// Gan/doi nhom phan loai cho 1 Page (vd: "Susi Hair", "Nam Hair", "Vera"...)
app.patch('/api/pages/:id/group', (req, res) => {
  const { group } = req.body;
  const page = db.updatePageGroup(req.params.id, (group || '').trim());
  if (!page) return res.status(404).json({ error: 'Khong tim thay Page' });
  res.json({ ok: true, group: page.group });
});

// ---------- TAI KHOAN TIKTOK ----------

app.get('/api/tiktok/accounts', (req, res) => {
  res.json(db.listTiktokAccounts());
});

// Endpoint doc-only cho Content Desk (quan-ly-nick-tiktok) dong bo lich dang that -
// bao ve bang X-Sync-Key rieng (xem middleware dang nhap o tren), khong dung cookie.
app.get('/api/public/tiktok-schedule', (req, res) => {
  res.json({ accounts: db.listTiktokAccounts(), posts: db.listTiktokPosts() });
});

app.delete('/api/tiktok/accounts/:id', (req, res) => {
  db.deleteTiktokAccount(req.params.id);
  res.json({ ok: true });
});

// Dua 1 video (file da co san tren server, dung video_path giong ben Facebook)
// vao Inbox nhap cua 1 tai khoan TikTok. Nguoi dung phai tu mo app TikTok de
// hoan tat dang (che do khong can App qua audit).
app.post('/api/tiktok/accounts/:id/upload', async (req, res) => {
  const { video_path } = req.body;
  if (!video_path) return res.status(400).json({ error: 'Thieu video_path' });
  if (!fs.existsSync(video_path)) return res.status(400).json({ error: `Khong tim thay file video: ${video_path}` });
  const account = db.getTiktokAccountById(req.params.id);
  if (!account) return res.status(400).json({ error: 'Khong tim thay tai khoan TikTok' });
  try {
    const accessToken = await getFreshTiktokAccessToken(req.params.id);
    const result = await tiktok.uploadVideoToInbox({ accessToken, videoPath: video_path });
    // Ghi lai vao cung bang voi lich tu dong (scheduled_time = luc upload) de
    // hien trong checklist "Can dang" + bao Telegram giong het video den tu lich.
    const post = db.addTiktokPost({
      tiktok_account_id: req.params.id,
      video_path,
      scheduled_time: db.nowIso(),
      status: 'published',
    });
    db.updateTiktokPost(post.id, { publish_id: result.publish_id });
    notifyTiktokReadyToPost({ postId: post.id, accountName: account.display_name, videoPath: video_path });
    res.json({ ok: true, publish_id: result.publish_id });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: msg });
  }
});

app.get('/api/tiktok/publish-status/:accountId/:publishId', async (req, res) => {
  try {
    const accessToken = await getFreshTiktokAccessToken(req.params.accountId);
    const status = await tiktok.getPublishStatus({ accessToken, publishId: req.params.publishId });
    res.json(status);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: msg });
  }
});

// ---------- LICH DANG TIKTOK ----------
// scheduler.js se tu dua video vao Inbox nhap dung gio - nguoi dung van phai
// tu mo app TikTok bam "Dang" (xem ghi chu o tiktok.js / giao dien TikTok).

app.get('/api/tiktok/posts', (req, res) => {
  res.json(db.listTiktokPosts(req.query.status));
});

app.post('/api/tiktok/posts', (req, res) => {
  const { tiktok_account_id, video_path, scheduled_time } = req.body;
  if (!tiktok_account_id || !video_path || !scheduled_time) {
    return res.status(400).json({ error: 'Thieu tiktok_account_id/video_path/scheduled_time' });
  }
  if (!db.getTiktokAccountById(tiktok_account_id)) {
    return res.status(400).json({ error: 'Khong tim thay tai khoan TikTok' });
  }
  if (!fs.existsSync(video_path)) {
    return res.status(400).json({ error: `Khong tim thay file video: ${video_path}` });
  }
  const post = db.addTiktokPost({ tiktok_account_id, video_path, scheduled_time, status: 'pending' });
  res.json({ ok: true, post });
});

// Sua gio dang/duong dan video cua 1 bai cho lich (chi cho phep khi status = pending).
app.put('/api/tiktok/posts/:id', (req, res) => {
  const post = db.getTiktokPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Khong tim thay bai viet' });
  if (post.status !== 'pending') {
    return res.status(400).json({ error: 'Chi sua duoc bai dang cho lich (pending)' });
  }
  const { video_path, scheduled_time } = req.body;
  const patch = { error: null, retry_count: 0, next_attempt_at: null };
  if (video_path) {
    if (!fs.existsSync(video_path)) return res.status(400).json({ error: `Khong tim thay file video: ${video_path}` });
    patch.video_path = video_path;
  }
  if (scheduled_time) patch.scheduled_time = scheduled_time;
  const updated = db.updateTiktokPost(req.params.id, patch);
  res.json({ ok: true, post: updated });
});

app.delete('/api/tiktok/posts/:id', (req, res) => {
  const post = db.getTiktokPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Khong tim thay bai viet' });
  if (post.status !== 'pending') {
    return res.status(400).json({ error: 'Chi huy duoc bai dang cho lich' });
  }
  db.deleteTiktokPost(req.params.id);
  res.json({ ok: true });
});

// Danh dau 1 video (da vao Inbox) la nguoi dung da tu mo app TikTok bam
// "Dang" xong - dung cho checklist "Can dang hom nay" tren giao dien.
app.patch('/api/tiktok/posts/:id/confirm', (req, res) => {
  const post = db.getTiktokPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Khong tim thay bai viet' });
  if (post.status !== 'published') {
    return res.status(400).json({ error: 'Chi xac nhan duoc video da vao Inbox (status=published)' });
  }
  const updated = db.markTiktokPostConfirmed(req.params.id);
  res.json({ ok: true, post: updated });
});

app.get('/api/tiktok/posts/unconfirmed-count', (req, res) => {
  res.json({ count: db.countUnconfirmedTiktokPosts() });
});

// Nhap lich hang loat tu file CSV (cot: tiktok_account_id,date,time,video_path).
// video_path la duong dan file tren chinh may dang chay server (giong ben Facebook).
// date dang YYYY-MM-DD, time dang HH:MM (gio Viet Nam, UTC+7).
// mode=preview: chi doc va tra ve xem truoc, khong tao bai viet.
// mode=commit: thuc su tao cac bai viet 'pending' vao hang doi.
app.post('/api/tiktok/posts/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Thieu file CSV' });
  let text;
  try {
    text = fs.readFileSync(req.file.path, 'utf8');
  } finally {
    fs.unlinkSync(req.file.path);
  }

  const rows = parseCsv(text);
  if (!rows.length) return res.status(400).json({ error: 'File CSV rong hoac sai dinh dang' });

  const mode = req.body.mode === 'commit' ? 'commit' : 'preview';
  const results = [];
  let created = 0;

  rows.forEach((row, idx) => {
    const lineNo = idx + 2;
    const account = db.getTiktokAccountById(row.tiktok_account_id);
    if (!account) {
      results.push({ line: lineNo, ok: false, error: `Khong tim thay tai khoan TikTok id ${row.tiktok_account_id}` });
      return;
    }
    if (!row.date || !row.time || !row.video_path) {
      results.push({ line: lineNo, ok: false, error: 'Thieu date/time/video_path' });
      return;
    }
    const d = new Date(`${row.date}T${row.time}:00+07:00`);
    if (isNaN(d.getTime())) {
      results.push({ line: lineNo, ok: false, error: `Ngay/gio khong hop le: ${row.date} ${row.time}` });
      return;
    }
    const scheduled_time = d.toISOString().slice(0, 19).replace('T', ' ');

    if (!fs.existsSync(row.video_path)) {
      results.push({ line: lineNo, ok: false, error: `Khong tim thay file video: ${row.video_path}` });
      return;
    }

    if (mode === 'commit') {
      db.addTiktokPost({
        tiktok_account_id: row.tiktok_account_id,
        video_path: row.video_path,
        scheduled_time,
        status: 'pending',
      });
      created++;
    }
    results.push({
      line: lineNo,
      ok: true,
      account_name: account.display_name,
      scheduled_time_utc: scheduled_time,
      video_path: row.video_path,
    });
  });

  res.json({ mode, totalRows: rows.length, created, results });
});

const TIKTOK_STATUS_LABEL_VI = { pending: 'Chưa đăng', published: 'Đã đưa vào Inbox', failed: 'Lỗi' };

app.get('/api/tiktok/posts/export', (req, res) => {
  const posts = db.listTiktokPosts(req.query.status);
  const rows = posts.map((p) => {
    const d = new Date(p.scheduled_time.replace(' ', 'T') + 'Z');
    const vn = new Date(d.getTime() + 7 * 3600 * 1000);
    const date = vn.toISOString().slice(0, 10);
    const time = vn.toISOString().slice(11, 16);
    return {
      tiktok_account_id: p.tiktok_account_id,
      account_name: p.account_name,
      date,
      time,
      video_path: p.video_path,
      status: TIKTOK_STATUS_LABEL_VI[p.status] || p.status,
      da_bam_dang_thu_cong: p.confirmed ? 'Rồi' : (p.status === 'published' ? 'Chưa' : ''),
      publish_id: p.publish_id || '',
      error: p.error || '',
    };
  });

  const csv = toCsv(rows, [
    'tiktok_account_id',
    'account_name',
    'date',
    'time',
    'video_path',
    'status',
    'da_bam_dang_thu_cong',
    'publish_id',
    'error',
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="trang-thai-lich-dang-tiktok.csv"`);
  res.send('﻿' + csv);
});

// ---------- QUAN LY NHOM (GROUPS) ----------

app.get('/api/groups', (req, res) => {
  res.json(db.listGroups());
});

app.patch('/api/groups/:name/rename', (req, res) => {
  const newName = (req.body.newName || '').trim();
  if (!newName) return res.status(400).json({ error: 'Ten nhom moi khong duoc de trong' });
  const count = db.renameGroup(req.params.name, newName);
  res.json({ ok: true, count });
});

app.delete('/api/groups/:name', (req, res) => {
  const count = db.deleteGroup(req.params.name);
  res.json({ ok: true, count });
});

// Bat/tat AI tu dong tra loi Messenger cho 1 Page
app.patch('/api/pages/:id/messenger-ai', (req, res) => {
  const page = db.updatePageMessengerAI(req.params.id, !!req.body.enabled);
  if (!page) return res.status(404).json({ error: 'Khong tim thay Page' });
  res.json({ ok: true, messenger_ai_enabled: page.messenger_ai_enabled });
});

// ---------- TIN NHAN MESSENGER (INBOX CHUNG NHIEU PAGE) ----------

app.get('/api/conversations', (req, res) => {
  res.json(db.listConversations());
});

app.get('/api/conversations/unread-count', (req, res) => {
  res.json({ count: db.countUnreadConversations() });
});

app.get('/api/conversations/:id', (req, res) => {
  const conv = db.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Khong tim thay hoi thoai' });
  db.markConversationRead(req.params.id);
  res.json(conv);
});

// Dang ky TAT CA Page dang ket noi nhan su kien Messenger qua Webhook - bam 1
// lan sau khi da cau hinh Webhooks tren Meta App Dashboard (va sau khi Page
// da duoc cap quyen pages_messaging qua dang nhap lai Facebook).
app.post('/api/conversations/subscribe-webhook', async (req, res) => {
  const pages = db.listPages();
  const results = [];
  for (const p of pages) {
    const full = db.getPageById(p.id);
    try {
      await subscribePageToWebhook(full.page_id, full.access_token);
      results.push({ page_name: p.name, ok: true });
    } catch (err) {
      results.push({ page_name: p.name, ok: false, error: err.response?.data?.error?.message || err.message });
    }
  }
  res.json({ results });
});

app.post('/api/conversations/:id/reply', async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Noi dung tra loi khong duoc de trong' });

  const conv = db.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Khong tim thay hoi thoai' });
  const page = db.getPageById(conv.page_row_id);
  if (!page) return res.status(404).json({ error: 'Page cua hoi thoai nay da bi xoa' });

  try {
    const sendRes = await sendMessengerMessage({
      pageId: page.page_id,
      accessToken: page.access_token,
      recipientId: conv.participant_id,
      text,
    });
    db.addOutgoingMessage({ pageRowId: page.id, participantId: conv.participant_id, text, mid: sendRes.message_id, viaAi: false });
    res.json({ ok: true });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: `Gui tin nhan that bai: ${msg} (luu y: Facebook chi cho gui trong vong 24h ke tu tin nhan cuoi cua khach)` });
  }
});

// Danh dau khach cua 1 hoi thoai la "chua_lam" hoac "da_lam" (phan loai kieu Pancake)
app.patch('/api/conversations/:id/status', (req, res) => {
  const conv = db.updateConversationStatus(req.params.id, req.body.status);
  if (!conv) return res.status(404).json({ error: 'Khong tim thay hoi thoai' });
  res.json({ ok: true, status: conv.status });
});

// Xem truoc Page (info + bai dang gan day) ngay trong phan mem, khong can mo Facebook that
app.get('/api/pages/:id/preview', async (req, res) => {
  const page = db.getPageById(req.params.id);
  if (!page) return res.status(404).json({ error: 'Khong tim thay Page' });
  try {
    const [profile, posts] = await Promise.all([
      getPageProfile(page.page_id, page.access_token),
      getPageFeed(page.page_id, page.access_token, 10).catch(() => []),
    ]);
    res.json({ profile, posts });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: `Khong lay duoc du lieu Page: ${msg}` });
  }
});

// ---------- POSTS ----------

app.get('/api/facebook/posting-status', (req, res) => {
  res.json(getFacebookPostingStatus());
});

app.post('/api/facebook/health-check', async (req, res) => {
  const result = await checkFacebookPages();
  await notifyFacebookHealth(result);
  res.status(result.ok ? 200 : 503).json(result);
});

app.get('/api/posts', (req, res) => {
  res.json(db.listPosts(req.query.status));
});

app.post('/api/posts', upload.single('image'), async (req, res) => {
  const { content, scheduled_time, publish_now } = req.body;
  if (publish_now === 'true' && getFacebookPostingStatus().paused) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(503).json({ error: PAUSED_MESSAGE, code: 'FACEBOOK_POSTING_PAUSED' });
  }
  let page_row_ids;
  try {
    page_row_ids = JSON.parse(req.body.page_row_ids || '[]');
  } catch {
    page_row_ids = [];
  }
  if (!Array.isArray(page_row_ids) || !page_row_ids.length) {
    return res.status(400).json({ error: 'Chua chon Page nao' });
  }
  if (!content && !req.file) {
    return res.status(400).json({ error: 'Thieu noi dung bai viet' });
  }
  if (publish_now !== 'true' && !scheduled_time) {
    return res.status(400).json({ error: 'Thieu thoi gian len lich (scheduled_time)' });
  }

  const imagePath = req.file ? req.file.path : null;
  const results = [];
  const STAGGER_MS = 3000; // giãn 3s giữa các lần gọi Graph API khi đăng nhiều Page cùng lúc

  for (let idx = 0; idx < page_row_ids.length; idx++) {
    const page_row_id = page_row_ids[idx];
    const page = db.getPageById(page_row_id);
    if (!page) {
      results.push({ ok: false, page_row_id, page_name: `(id ${page_row_id})`, error: 'Khong tim thay Page' });
      continue;
    }

    if (publish_now === 'true') {
      if (idx > 0) await new Promise((r) => setTimeout(r, STAGGER_MS));
      try {
        const result = await publishPost({
          pageId: page.page_id,
          accessToken: page.access_token,
          message: content,
          imagePath,
        });
        const fbPostId = result.post_id || result.id;
        const post = db.addPost({
          page_row_id,
          content,
          image_path: imagePath,
          scheduled_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
          status: 'published',
          fb_post_id: fbPostId,
          post_url: result.post_url,
        });
        results.push({ ok: true, page_row_id, page_name: page.name, id: post.id, fb_post_id: fbPostId });
      } catch (err) {
        const circuit = pauseIfFacebookAuthFailed(err);
        const msg = err.response?.data?.error?.message || err.message;
        results.push({ ok: false, page_row_id, page_name: page.name, error: msg });
        if (circuit.tripped) break;
      }
    } else {
      const post = db.addPost({ page_row_id, content, image_path: imagePath, scheduled_time, status: 'pending' });
      results.push({ ok: true, page_row_id, page_name: page.name, id: post.id });
    }
  }

  res.json({ results });
});

// Sua noi dung/gio dang cua 1 bai dang cho lich (chi cho phep khi status = pending).
// Sua xong se xoa het loi/retry cu de bai duoc thu dang lai tu dau.
app.put('/api/posts/:id', upload.single('image'), (req, res) => {
  const post = db.getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Khong tim thay bai viet' });
  if (post.status !== 'pending') {
    return res.status(400).json({ error: 'Chi sua duoc bai dang cho lich (pending)' });
  }

  const { content, scheduled_time, image_url, video_url } = req.body;
  const patch = { error: null, retry_count: 0, next_attempt_at: null };
  if (content !== undefined) patch.content = content;
  if (scheduled_time) patch.scheduled_time = scheduled_time;
  if (image_url !== undefined) patch.image_url = image_url || null;
  if (video_url !== undefined) patch.video_url = video_url || null;
  if (req.file) {
    const oldPath = post.image_path;
    patch.image_path = req.file.path;
    // xoa anh cu neu khong con bai nao khac dung chung (va no khac anh moi)
    if (oldPath && oldPath !== req.file.path && !db.isImagePathUsedByOtherPost(oldPath, post.id) && fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  const updated = db.updatePost(req.params.id, patch);
  res.json({ ok: true, post: updated });
});

// Nhap lich hang loat tu file CSV
// (cot: page_row_id,date,time,content,image_url,video_url,image_path,video_path - cac cot cuoi tuy chon).
// image_path/video_path la duong dan file tren chinh may dang chay server (se tu upload len Facebook).
// date dang YYYY-MM-DD, time dang HH:MM (gio Viet Nam, UTC+7).
// mode=preview: chi doc va tra ve xem truoc, khong tao bai viet.
// mode=commit: thuc su tao cac bai viet 'pending' vao hang doi.
app.post('/api/posts/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Thieu file CSV' });
  let text;
  try {
    text = fs.readFileSync(req.file.path, 'utf8');
  } finally {
    fs.unlinkSync(req.file.path); // file CSV goc khong can giu lai
  }

  const rows = parseCsv(text);
  if (!rows.length) return res.status(400).json({ error: 'File CSV rong hoac sai dinh dang' });

  const mode = req.body.mode === 'commit' ? 'commit' : 'preview';
  const results = [];
  let created = 0;

  rows.forEach((row, idx) => {
    const lineNo = idx + 2; // +1 header, +1 vi idx tu 0
    const page = db.getPageById(row.page_row_id);
    if (!page) {
      results.push({ line: lineNo, ok: false, error: `Khong tim thay Page id ${row.page_row_id}` });
      return;
    }
    if (!row.date || !row.time || !row.content) {
      results.push({ line: lineNo, ok: false, error: 'Thieu date/time/content' });
      return;
    }
    const d = new Date(`${row.date}T${row.time}:00+07:00`);
    if (isNaN(d.getTime())) {
      results.push({ line: lineNo, ok: false, error: `Ngay/gio khong hop le: ${row.date} ${row.time}` });
      return;
    }
    const scheduled_time = d.toISOString().slice(0, 19).replace('T', ' ');

    if (row.image_path && !fs.existsSync(row.image_path)) {
      results.push({ line: lineNo, ok: false, error: `Khong tim thay file anh: ${row.image_path}` });
      return;
    }
    if (row.video_path && !fs.existsSync(row.video_path)) {
      results.push({ line: lineNo, ok: false, error: `Khong tim thay file video: ${row.video_path}` });
      return;
    }

    if (mode === 'commit') {
      db.addPost({
        page_row_id: row.page_row_id,
        content: row.content,
        image_path: row.image_path || null,
        image_url: row.image_url || null,
        video_path: row.video_path || null,
        video_url: row.video_url || null,
        scheduled_time,
        status: 'pending',
      });
      created++;
    }
    results.push({
      line: lineNo,
      ok: true,
      page_name: page.name,
      scheduled_time_utc: scheduled_time,
      content_preview: row.content.length > 100 ? row.content.slice(0, 100) + '…' : row.content,
      has_image: !!(row.image_url || row.image_path),
      has_video: !!(row.video_url || row.video_path),
    });
  });

  res.json({ mode, totalRows: rows.length, created, results });
});

const STATUS_LABEL_VI = { pending: 'Chưa đăng', published: 'Đã đăng', failed: 'Lỗi' };

// Xuat toan bo lich (hoac loc theo status) ra CSV, kem trang thai + link bai da dang.
// Dinh dang cot giong het file import, cong them status va post_link, de co the
// sua roi import lai neu can.
app.get('/api/posts/export', (req, res) => {
  const posts = db.listPosts(req.query.status);
  const rows = posts.map((p) => {
    // scheduled_time luu dang UTC 'YYYY-MM-DD HH:MM:SS' -> quy doi hien thi ve gio VN (+7)
    const d = new Date(p.scheduled_time.replace(' ', 'T') + 'Z');
    const vn = new Date(d.getTime() + 7 * 3600 * 1000);
    const date = vn.toISOString().slice(0, 10);
    const time = vn.toISOString().slice(11, 16);
    return {
      page_row_id: p.page_row_id,
      page_name: p.page_name,
      date,
      time,
      content: p.content,
      image_url: p.image_url || '',
      video_url: p.video_url || '',
      video_path: p.video_path || '',
      status: STATUS_LABEL_VI[p.status] || p.status,
      post_link: p.post_url || (p.error ? `Lỗi: ${p.error}` : ''),
      likes: p.insights?.likes ?? '',
      comments: p.insights?.comments ?? '',
      shares: p.insights?.shares ?? '',
    };
  });

  const csv = toCsv(rows, [
    'page_row_id',
    'page_name',
    'date',
    'time',
    'content',
    'image_url',
    'video_url',
    'video_path',
    'status',
    'post_link',
    'likes',
    'comments',
    'shares',
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="trang-thai-lich-dang.csv"`);
  res.send('﻿' + csv); // BOM de Excel mo dung UTF-8
});

// Cap nhat luot thich/binh luan/chia se cho cac bai da dang (goi Graph API
// tuan tu, giãn cach de tranh rate-limit). Gioi han so bai moi lan goi de
// khong bi cho qua lau.
app.post('/api/posts/refresh-insights', async (req, res) => {
  const limit = Math.min(Number(req.body?.limit) || 50, 200);
  const published = db.listPosts('published').filter((p) => p.fb_post_id).slice(0, limit);

  let updated = 0;
  const errors = [];
  for (let i = 0; i < published.length; i++) {
    const post = published[i];
    const page = db.getPageById(post.page_row_id);
    if (!page) continue;
    try {
      const insights = await getPostInsights(post.fb_post_id, page.access_token);
      db.updatePost(post.id, { insights: { ...insights, fetched_at: db.nowIso() } });
      updated++;
    } catch (err) {
      errors.push({ post_id: post.id, error: err.response?.data?.error?.message || err.message });
    }
    if (i < published.length - 1) await new Promise((r) => setTimeout(r, 1500));
  }

  res.json({ checked: published.length, updated, errors });
});

app.delete('/api/posts/:id', (req, res) => {
  const post = db.getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Khong tim thay bai viet' });
  if (post.status !== 'pending') {
    return res.status(400).json({ error: 'Chi huy duoc bai dang cho lich' });
  }
  db.deletePost(req.params.id);
  const stillUsed = post.image_path && db.isImagePathUsedByOtherPost(post.image_path, req.params.id);
  if (post.image_path && !stillUsed && fs.existsSync(post.image_path)) fs.unlinkSync(post.image_path);
  res.json({ ok: true });
});

// Thu dang lai 1 bai dang o trang thai 'failed' (loi vinh vien sau 3 lan thu) -
// dua ve 'pending' + gio dang = ngay bay gio, xoa het loi/retry_count cu de
// scheduler (chay moi phut) nhat len va thu dang lai tu dau. Dung sau khi da
// khac phuc nguyen nhan loi goc (vd: dang nhap lai Facebook de cap lai quyen).
app.post('/api/posts/:id/retry', (req, res) => {
  if (getFacebookPostingStatus().paused) {
    return res.status(503).json({ error: PAUSED_MESSAGE, code: 'FACEBOOK_POSTING_PAUSED' });
  }

  const targetTime = publish_now === 'true' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : scheduled_time;
  const duplicateRisk = findDuplicateRisk(content, targetTime, db.listPosts());
  if (duplicateRisk && req.body.allow_duplicate !== 'true') {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(409).json({
      code: 'DUPLICATE_CONTENT_WARNING',
      error: `Nội dung giống ${Math.round(duplicateRisk.similarity * 100)}% bài #${duplicateRisk.post_id} trên ${duplicateRisk.page_name}, trong khung 12 giờ.`,
      duplicate: duplicateRisk,
    });
  }
  const post = db.getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Khong tim thay bai viet' });
  if (post.status !== 'failed') {
    return res.status(400).json({ error: 'Chi thu lai duoc bai dang o trang thai Loi' });
  }
  const updated = db.updatePost(req.params.id, {
    status: 'pending',
    error: null,
    retry_count: 0,
    next_attempt_at: null,
    scheduled_time: db.nowIso(),
  });
  res.json({ ok: true, post: updated });
});

// Thu dang lai TAT CA bai dang Loi cung luc (vd sau khi dang nhap lai Facebook
// de cap quyen, muon day het ca loat bai loi vao hang doi lai mot lan thay vi
// bam tung bai).
app.post('/api/posts/retry-failed', (req, res) => {
  if (getFacebookPostingStatus().paused) {
    return res.status(503).json({ error: PAUSED_MESSAGE, code: 'FACEBOOK_POSTING_PAUSED' });
  }
  const failed = db.listPosts('failed');
  failed.forEach((p) => {
    db.updatePost(p.id, {
      status: 'pending',
      error: null,
      retry_count: 0,
      next_attempt_at: null,
      scheduled_time: db.nowIso(),
    });
  });
  res.json({ ok: true, count: failed.length });
});

app.listen(PORT, () => {
  console.log(`Fb Marketing App dang chay tai http://localhost:${PORT}`);
  startScheduler();
  startBackupSchedule();
  startCommentReplier();
});
