// Luu tru don gian bang file JSON (khong can bien dich native, chay duoc ngay tren moi may).
const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('./crypto-util');

const DB_FILE = path.join(__dirname, 'data', 'app.db.json');

function load() {
  if (!fs.existsSync(DB_FILE)) {
    return { pages: [], posts: [], nextPageId: 1, nextPostId: 1, conversations: [] };
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!data.conversations) data.conversations = []; // file cu tao truoc khi co tinh nang Tin nhan
  return data;
}

function save(data) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function addMinutesIso(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
}

// ---------- PAGES ----------

function listPages() {
  const data = load();
  return data.pages
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(({ access_token, ...rest }) => rest); // khong tra token ve client khi liet ke
}

function getPageById(id) {
  const data = load();
  const page = data.pages.find((p) => p.id === Number(id));
  if (!page) return page;
  return { ...page, access_token: decrypt(page.access_token) };
}

function addPage({ name, page_id, access_token, group }) {
  const data = load();
  const existing = data.pages.find((p) => p.page_id === page_id);
  if (existing) {
    throw new Error('Page nay da duoc them truoc do.');
  }
  const page = {
    id: data.nextPageId++,
    name,
    page_id,
    access_token: encrypt(access_token),
    group: group || '',
    created_at: nowIso(),
  };
  data.pages.push(page);
  save(data);
  return { ...page, access_token };
}

function deletePage(id) {
  const data = load();
  data.pages = data.pages.filter((p) => p.id !== Number(id));
  save(data);
}

/**
 * Gan/doi nhom (group) cho 1 Page - dung de phan loai Page thanh cac nhom
 * (vd theo thuong hieu/khu vuc) de de xay dung chien luoc noi dung rieng.
 */
function updatePageGroup(id, group) {
  const data = load();
  const page = data.pages.find((p) => p.id === Number(id));
  if (!page) return null;
  page.group = group || '';
  save(data);
  return page;
}

/**
 * Liet ke tat ca nhom hien co (theo ten), kem so Page trong moi nhom.
 */
function listGroups() {
  const data = load();
  const counts = {};
  data.pages.forEach((p) => {
    if (p.group) counts[p.group] = (counts[p.group] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Doi ten 1 nhom - ap dung cho tat ca Page dang thuoc nhom do.
 */
function renameGroup(oldName, newName) {
  const data = load();
  let count = 0;
  data.pages.forEach((p) => {
    if (p.group === oldName) {
      p.group = newName;
      count++;
    }
  });
  save(data);
  return count;
}

/**
 * Xoa 1 nhom - cac Page dang thuoc nhom do chuyen ve "Chua phan loai" (group rong),
 * khong xoa Page.
 */
function deleteGroup(name) {
  const data = load();
  let count = 0;
  data.pages.forEach((p) => {
    if (p.group === name) {
      p.group = '';
      count++;
    }
  });
  save(data);
  return count;
}

/**
 * Bat/tat AI tu dong tra loi Messenger cho 1 Page cu the.
 */
function updatePageMessengerAI(id, enabled) {
  const data = load();
  const page = data.pages.find((p) => p.id === Number(id));
  if (!page) return null;
  page.messenger_ai_enabled = !!enabled;
  save(data);
  return page;
}

// ---------- TIN NHAN MESSENGER (INBOX CHUNG NHIEU PAGE) ----------

function findPageByFbId(fbPageId) {
  const data = load();
  const page = data.pages.find((p) => p.page_id === fbPageId);
  if (!page) return null;
  return { ...page, access_token: decrypt(page.access_token) }; // can token that de goi Graph API tra loi
}

/**
 * Tim hoac tao 1 hoi thoai (giua 1 Page va 1 nguoi nhan tin/PSID cu the).
 */
function getOrCreateConversation(data, pageRowId, participantId, participantName) {
  let conv = data.conversations.find((c) => c.page_row_id === pageRowId && c.participant_id === participantId);
  if (!conv) {
    conv = {
      id: `${pageRowId}_${participantId}`,
      page_row_id: pageRowId,
      participant_id: participantId,
      participant_name: participantName || 'Khách',
      messages: [],
      unread: false,
      status: 'chua_lam', // phan loai khach: 'chua_lam' (mac dinh) hoac 'da_lam'
      last_message_at: nowIso(),
    };
    data.conversations.push(conv);
  }
  if (participantName && conv.participant_name === 'Khách') conv.participant_name = participantName;
  return conv;
}

/**
 * Luu 1 tin nhan den (tu khach) vao dung hoi thoai, danh dau chua doc.
 * Bo qua neu da luu truoc do (chong trung khi Facebook gui lai webhook).
 */
function addIncomingMessage({ fbPageId, participantId, participantName, text, mid, timestamp }) {
  const data = load();
  const page = data.pages.find((p) => p.page_id === fbPageId);
  if (!page) return null;
  if (mid && data.conversations.some((c) => c.messages.some((m) => m.mid === mid))) return null; // trung, bo qua

  const conv = getOrCreateConversation(data, page.id, participantId, participantName);
  conv.messages.push({
    mid: mid || null,
    direction: 'in',
    text: text || '',
    created_at: timestamp ? new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ') : nowIso(),
  });
  conv.unread = true;
  conv.last_message_at = nowIso();
  save(data);
  return { conv, page };
}

/**
 * Luu 1 tin nhan gui di (tu Page - nguoi that hoac AI tra loi tu dong).
 */
function addOutgoingMessage({ pageRowId, participantId, text, mid, viaAi }) {
  const data = load();
  const page = data.pages.find((p) => p.id === Number(pageRowId));
  if (!page) return null;
  const conv = getOrCreateConversation(data, page.id, participantId, null);
  conv.messages.push({
    mid: mid || null,
    direction: 'out',
    text: text || '',
    via_ai: !!viaAi,
    created_at: nowIso(),
  });
  conv.unread = false;
  conv.last_message_at = nowIso();
  save(data);
  return conv;
}

/**
 * Liet ke tat ca hoi thoai (moi Page), moi nhat truoc, kem ten Page + tin nhan cuoi.
 */
function listConversations() {
  const data = load();
  const pagesById = Object.fromEntries(data.pages.map((p) => [p.id, p]));
  return data.conversations
    .slice()
    .sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))
    .map((c) => {
      const page = pagesById[c.page_row_id];
      const lastMsg = c.messages[c.messages.length - 1];
      return {
        id: c.id,
        page_row_id: c.page_row_id,
        page_name: page ? page.name : '(Page đã xoá)',
        page_group: page ? page.group || '' : '',
        participant_id: c.participant_id,
        participant_name: c.participant_name,
        status: c.status || 'chua_lam',
        unread: c.unread,
        last_message_at: c.last_message_at,
        last_message_preview: lastMsg ? lastMsg.text.slice(0, 80) : '',
        last_message_direction: lastMsg ? lastMsg.direction : null,
      };
    });
}

function getConversationById(id) {
  const data = load();
  const conv = data.conversations.find((c) => c.id === id);
  if (!conv) return null;
  const page = data.pages.find((p) => p.id === conv.page_row_id);
  return { ...conv, status: conv.status || 'chua_lam', page };
}

/**
 * Danh dau khach cua 1 hoi thoai la "chua_lam" hoac "da_lam" - dung de phan
 * loai/loc khach hang giong Pancake (khach da duoc phuc vu vs khach moi/dang cho).
 */
function updateConversationStatus(id, status) {
  const data = load();
  const conv = data.conversations.find((c) => c.id === id);
  if (!conv) return null;
  conv.status = status === 'da_lam' ? 'da_lam' : 'chua_lam';
  save(data);
  return conv;
}

function markConversationRead(id) {
  const data = load();
  const conv = data.conversations.find((c) => c.id === id);
  if (!conv) return null;
  conv.unread = false;
  save(data);
  return conv;
}

function countUnreadConversations() {
  const data = load();
  return data.conversations.filter((c) => c.unread).length;
}

/**
 * Them hoac cap nhat nhieu Page cung luc (dung sau khi dang nhap Facebook OAuth).
 * Neu Page (theo page_id) da ton tai thi cap nhat lai ten + token moi.
 */
function upsertPages(pages) {
  const data = load();
  let addedCount = 0;
  let updatedCount = 0;
  for (const { name, page_id, access_token } of pages) {
    const existing = data.pages.find((p) => p.page_id === page_id);
    if (existing) {
      existing.name = name;
      existing.access_token = encrypt(access_token);
      // giu nguyen group da phan loai truoc do, khong ghi de khi dang nhap lai
      updatedCount++;
    } else {
      data.pages.push({ id: data.nextPageId++, name, page_id, access_token: encrypt(access_token), group: '', created_at: nowIso() });
      addedCount++;
    }
  }
  save(data);
  return { addedCount, updatedCount };
}

// ---------- POSTS ----------

function listPosts(status) {
  const data = load();
  let posts = data.posts;
  if (status) posts = posts.filter((p) => p.status === status);
  const pagesById = Object.fromEntries(data.pages.map((p) => [p.id, p]));
  return posts
    .slice()
    .sort((a, b) => (a.scheduled_time > b.scheduled_time ? 1 : -1))
    .map((p) => ({ ...p, page_name: pagesById[p.page_row_id]?.name || '(Page da xoa)' }));
}

function getDuePosts() {
  const data = load();
  const now = nowIso();
  const pagesById = Object.fromEntries(data.pages.map((p) => [p.id, p]));
  return data.posts
    .filter(
      (p) =>
        p.status === 'pending' &&
        p.scheduled_time <= now &&
        (!p.next_attempt_at || p.next_attempt_at <= now)
    )
    .map((p) => ({
      ...p,
      fb_page_id: pagesById[p.page_row_id]?.page_id,
      page_token: decrypt(pagesById[p.page_row_id]?.access_token),
      page_name: pagesById[p.page_row_id]?.name,
    }))
    .filter((p) => p.fb_page_id); // bo qua neu Page da bi xoa
}

function addPost({ page_row_id, content, image_path, image_url, video_path, video_url, scheduled_time, status, fb_post_id, post_url }) {
  const data = load();
  const post = {
    id: data.nextPostId++,
    page_row_id: Number(page_row_id),
    content: content || '',
    image_path: image_path || null,
    image_url: image_url || null,
    video_path: video_path || null,
    video_url: video_url || null,
    scheduled_time,
    status,
    fb_post_id: fb_post_id || null,
    post_url: post_url || null,
    retry_count: 0,
    next_attempt_at: null,
    insights: null, // { likes, comments, shares, fetched_at }
    error: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  data.posts.push(post);
  save(data);
  return post;
}

function updatePost(id, patch) {
  const data = load();
  const post = data.posts.find((p) => p.id === Number(id));
  if (!post) return null;
  Object.assign(post, patch, { updated_at: nowIso() });
  save(data);
  return post;
}

function getPostById(id) {
  const data = load();
  return data.posts.find((p) => p.id === Number(id));
}

function deletePost(id) {
  const data = load();
  data.posts = data.posts.filter((p) => p.id !== Number(id));
  save(data);
}

/**
 * True neu con bai viet khac (tru chinh no) dang tro toi cung 1 file anh
 * (xay ra khi 1 lan dang bai chon nhieu Page dung chung anh vua upload).
 */
function isImagePathUsedByOtherPost(imagePath, excludePostId) {
  const data = load();
  return data.posts.some((p) => p.id !== Number(excludePostId) && p.image_path === imagePath);
}

// ---------- BINH LUAN DA TRA LOI (chong tra loi trung, dung cho auto-reply AI) ----------

function isCommentReplied(commentId) {
  const data = load();
  return !!(data.repliedComments && data.repliedComments[commentId]);
}

function markCommentReplied(commentId, meta) {
  const data = load();
  if (!data.repliedComments) data.repliedComments = {};
  data.repliedComments[commentId] = { ...meta, repliedAt: nowIso() };
  save(data);
}

module.exports = {
  nowIso,
  addMinutesIso,
  listPages,
  getPageById,
  addPage,
  deletePage,
  updatePageGroup,
  listGroups,
  renameGroup,
  deleteGroup,
  updatePageMessengerAI,
  findPageByFbId,
  addIncomingMessage,
  addOutgoingMessage,
  listConversations,
  getConversationById,
  updateConversationStatus,
  markConversationRead,
  countUnreadConversations,
  upsertPages,
  listPosts,
  getDuePosts,
  addPost,
  updatePost,
  getPostById,
  deletePost,
  isImagePathUsedByOtherPost,
  isCommentReplied,
  markCommentReplied,
};
