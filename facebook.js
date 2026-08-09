const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { compressIfNeeded } = require('./image-processor');

const GRAPH_VERSION = process.env.GRAPH_API_VERSION || 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Kiem tra Page Access Token va lay ten Page (dung khi them Page moi).
 */
async function verifyPage(pageId, accessToken) {
  const res = await axios.get(`${GRAPH_BASE}/${pageId}`, {
    params: { fields: 'id,name', access_token: accessToken },
  });
  return res.data; // { id, name }
}

/**
 * Sinh URL dua nguoi dung sang trang dang nhap + cap quyen cua Facebook.
 */
function getLoginDialogUrl({ appId, redirectUri, state }) {
  const scope = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_read_user_content', // can de doc so like/comment tren bai da dang
    'pages_manage_metadata', // can de sua thong tin Page (about, dia chi, anh dai dien/bia)
    'pages_messaging', // can de doc/gui tin nhan Messenger cua Page (Hop thu chung)
  ].join(',');
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope,
    response_type: 'code',
    // Bat buoc Facebook hien lai man hinh xin quyen moi (vd pages_messaging vua
    // them sau) ngay ca khi tai khoan da tung dong y truoc do - neu khong FB se
    // tu dong bo qua man hinh nay va tra ve token voi quyen cu nhu cu.
    auth_type: 'rerequest',
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Doi authorization code lay tu callback thanh User Access Token (ngan han).
 */
async function exchangeCodeForUserToken({ appId, appSecret, redirectUri, code }) {
  const res = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
  });
  return res.data.access_token;
}

/**
 * Doi User Access Token ngan han thanh ban dai han (~60 ngay).
 */
async function getLongLivedUserToken({ appId, appSecret, shortLivedToken }) {
  const res = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });
  return res.data.access_token;
}

/**
 * Lay danh sach tat ca Fanpage nguoi dung quan ly, kem Page Access Token
 * (token nay duoc suy ra tu long-lived user token nen cung khong tu het han).
 */
async function getUserPages(userAccessToken) {
  const res = await axios.get(`${GRAPH_BASE}/me/accounts`, {
    params: { fields: 'id,name,access_token', access_token: userAccessToken, limit: 200 },
  });
  return res.data.data; // [{ id, name, access_token }, ...]
}

/**
 * Dang bai len mot Facebook Page ngay lap tuc. Uu tien video > anh > chi chu.
 * - videoPath: duong dan file video local tren may dang chay server (tuy chon)
 * - imagePath: duong dan file anh local da upload qua form (tuy chon)
 * - imageUrl: URL anh public tren internet, dung khi khong co file local (tuy chon)
 * - videoUrl: URL video public tren internet, dung khi khong co file local (tuy chon)
 * Tra ve { id, post_id, post_type, post_url } de luu lai lien ket bai da dang.
 */
async function publishPost({ pageId, accessToken, message, imagePath, imageUrl, videoPath, videoUrl }) {
  if (videoPath && fs.existsSync(videoPath)) {
    const form = new FormData();
    form.append('description', message || '');
    form.append('access_token', accessToken);
    form.append('source', fs.createReadStream(videoPath));

    const res = await axios.post(`${GRAPH_BASE}/${pageId}/videos`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      // Video co the mat vai phut de Facebook nhan + xu ly xong request, can
      // timeout dai hon mac dinh (30s) de tranh bao loi timeout ma video van
      // dang upload binh thuong o phia Facebook.
      timeout: 10 * 60 * 1000,
    });
    return {
      ...res.data,
      post_type: 'video',
      post_url: res.data.post_id
        ? `https://www.facebook.com/${res.data.post_id}`
        : `https://www.facebook.com/${pageId}/videos/${res.data.id}`,
    };
  }

  if (videoUrl) {
    const res = await axios.post(`${GRAPH_BASE}/${pageId}/videos`, null, {
      params: { file_url: videoUrl, description: message || '', access_token: accessToken },
    });
    return {
      ...res.data,
      post_type: 'video',
      post_url: res.data.post_id
        ? `https://www.facebook.com/${res.data.post_id}`
        : `https://www.facebook.com/${pageId}/videos/${res.data.id}`,
    };
  }

  if (imagePath && fs.existsSync(imagePath)) {
    const processedPath = await compressIfNeeded(imagePath);
    const form = new FormData();
    form.append('caption', message || '');
    form.append('access_token', accessToken);
    form.append('source', fs.createReadStream(processedPath));

    const res = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const postId = res.data.post_id || res.data.id;
    return { ...res.data, post_type: 'photo', post_url: `https://www.facebook.com/${postId}` };
  }

  if (imageUrl) {
    const res = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, null, {
      params: { url: imageUrl, caption: message || '', access_token: accessToken },
    });
    const postId = res.data.post_id || res.data.id;
    return { ...res.data, post_type: 'photo', post_url: `https://www.facebook.com/${postId}` };
  }

  const res = await axios.post(`${GRAPH_BASE}/${pageId}/feed`, null, {
    params: { message: message || '', access_token: accessToken },
  });
  return { ...res.data, post_type: 'text', post_url: `https://www.facebook.com/${res.data.id}` };
}

/**
 * Lay so luot thich/binh luan/chia se cua 1 bai da dang (dung fb_post_id
 * dang "pageId_postId"). Can quyen pages_read_engagement (cho likes/shares)
 * va pages_read_user_content (cho comments) - neu token chua co du quyen,
 * se lay duoc phan nao co the, phan con lai tra ve null thay vi loi toan bo.
 */
async function getPostInsights(fbPostId, accessToken) {
  // Goi rieng tung field: neu gop chung 1 request, chi can 1 field thieu quyen
  // la Facebook tra loi toan bo request, mat luon du lieu cua field khac van co quyen.
  const result = { likes: null, comments: null, shares: null };

  const fetchField = async (field, extract) => {
    try {
      const res = await axios.get(`${GRAPH_BASE}/${fbPostId}`, {
        params: { fields: field, access_token: accessToken },
      });
      return extract(res.data);
    } catch (err) {
      return null; // thieu quyen hoac bai khong con - giu null, khong lam loi ca ham
    }
  };

  result.likes = await fetchField('likes.summary(true)', (d) => d.likes?.summary?.total_count ?? 0);
  result.shares = await fetchField('shares', (d) => d.shares?.count ?? 0);
  result.comments = await fetchField('comments.summary(true)', (d) => d.comments?.summary?.total_count ?? 0);

  return result;
}

/**
 * Sua noi dung (message) cua 1 bai da dang truoc do. Dung khi phat hien
 * caption bi sai/can chinh sua sau khi da len song.
 */
async function updatePostMessage(fbPostId, accessToken, message) {
  const res = await axios.post(`${GRAPH_BASE}/${fbPostId}`, null, {
    params: { message, access_token: accessToken },
  });
  return res.data;
}

/**
 * Cap nhat thong tin Page: about, phone, dia chi (location), gio mo cua (hours).
 * Can quyen pages_manage_metadata. Chi gui field nao duoc truyen vao, khong
 * ghi de field khac.
 */
async function updatePageInfo({ pageId, accessToken, about, phone, location }) {
  const params = { access_token: accessToken };
  if (about !== undefined) params.about = about;
  if (phone !== undefined) params.phone = phone;
  if (location !== undefined) params.location = JSON.stringify(location);

  const res = await axios.post(`${GRAPH_BASE}/${pageId}`, null, { params });
  return res.data; // { success: true }
}

/**
 * Cap nhat anh dai dien (profile picture) cho Page tu 1 file local.
 */
async function updateProfilePicture({ pageId, accessToken, imagePath }) {
  const form = new FormData();
  form.append('access_token', accessToken);
  form.append('source', fs.createReadStream(imagePath));
  const res = await axios.post(`${GRAPH_BASE}/${pageId}/picture`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return res.data;
}

/**
 * Cap nhat anh bia (cover photo) cho Page tu 1 file local.
 * Buoc 1: upload anh vao thu vien Page (published=false de khong tu tao 1 bai dang rieng).
 * Buoc 2: dat lam cover photo bang cover_id.
 */
async function updateCoverPhoto({ pageId, accessToken, imagePath }) {
  const form = new FormData();
  form.append('access_token', accessToken);
  form.append('published', 'false');
  form.append('source', fs.createReadStream(imagePath));
  const uploadRes = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  const photoId = uploadRes.data.id;

  const res = await axios.post(`${GRAPH_BASE}/${pageId}`, null, {
    params: { cover: JSON.stringify({ cover_id: photoId }), access_token: accessToken },
  });
  return { ...res.data, photo_id: photoId };
}

/**
 * Lay danh sach binh luan cap 1 (khong lay reply con) tren 1 bai da dang,
 * cac binh luan gan day nhat truoc. Can quyen pages_read_user_content.
 */
async function getPostComments(fbPostId, accessToken) {
  const res = await axios.get(`${GRAPH_BASE}/${fbPostId}/comments`, {
    params: {
      fields: 'id,message,from,created_time',
      order: 'reverse_chronological',
      filter: 'stream',
      limit: 50,
      access_token: accessToken,
    },
  });
  return res.data.data; // [{ id, message, from: {id,name}, created_time }, ...]
}

/**
 * Tra loi (reply) 1 binh luan cu the. Can quyen pages_manage_engagement
 * (hoac pages_manage_posts tuy cau hinh App).
 */
async function replyToComment(commentId, accessToken, message) {
  const res = await axios.post(`${GRAPH_BASE}/${commentId}/comments`, null, {
    params: { message, access_token: accessToken },
  });
  return res.data; // { id }
}

/**
 * An 1 binh luan (spam/quang cao/xuc pham) khoi cong khai. Van con trong he
 * thong Facebook, chi nguoi dang + Trang moi thay, nguoi khac khong thay nua.
 */
async function hideComment(commentId, accessToken) {
  const res = await axios.post(`${GRAPH_BASE}/${commentId}`, null, {
    params: { is_hidden: true, access_token: accessToken },
  });
  return res.data; // { success: true }
}

/**
 * Lay thong tin ho so cong khai cua Page (anh dai dien, anh bia, gioi thieu,
 * so nguoi theo doi, link that) - dung de hien thi xem truoc trong phan mem
 * ma khong can mo tab Facebook that.
 */
async function getPageProfile(pageId, accessToken) {
  const res = await axios.get(`${GRAPH_BASE}/${pageId}`, {
    params: {
      fields: 'id,name,about,category,fan_count,link,picture.type(large){url},cover{source}',
      access_token: accessToken,
    },
  });
  const d = res.data;
  return {
    id: d.id,
    name: d.name,
    about: d.about || '',
    category: d.category || '',
    fan_count: d.fan_count ?? null,
    link: d.link || `https://www.facebook.com/${d.id}`,
    picture: d.picture?.data?.url || null,
    cover: d.cover?.source || null,
  };
}

/**
 * Lay danh sach bai dang gan day nhat tren tuong Page (xem truoc ngay trong
 * phan mem). Can quyen pages_read_engagement.
 */
async function getPageFeed(pageId, accessToken, limit = 10) {
  const res = await axios.get(`${GRAPH_BASE}/${pageId}/posts`, {
    params: {
      fields: 'message,full_picture,permalink_url,created_time',
      limit,
      access_token: accessToken,
    },
  });
  return res.data.data || [];
}

/**
 * Gui 1 tin nhan Messenger tu Page toi 1 nguoi dung (PSID). Chi gui duoc trong
 * "cua so 24h" ke tu tin nhan cuoi cua khach (chinh sach cua Meta) - neu ngoai
 * 24h, Facebook se tra loi loi va can dung message tag rieng (khong ho tro o day).
 */
async function sendMessengerMessage({ pageId, accessToken, recipientId, text }) {
  const res = await axios.post(`${GRAPH_BASE}/me/messages`, {
    recipient: { id: recipientId },
    message: { text },
    messaging_type: 'RESPONSE',
  }, {
    params: { access_token: accessToken },
  });
  return res.data; // { recipient_id, message_id }
}

/**
 * Lay ten hien thi cua nguoi gui tin (PSID) - best effort, Facebook gioi han
 * thong tin lay duoc tu Messenger nen co the that bai/tra ve rong, khong lam
 * loi ca luong xu ly webhook neu that bai.
 */
async function getMessengerUserProfile(psid, accessToken) {
  try {
    const res = await axios.get(`${GRAPH_BASE}/${psid}`, {
      params: { fields: 'name', access_token: accessToken },
    });
    return res.data.name || null;
  } catch {
    return null;
  }
}

/**
 * Dang ky 1 Page nhan su kien Messenger qua Webhook cua App nay. BAT BUOC phai
 * goi 1 lan cho moi Page (sau khi da cau hinh Webhooks tren Meta App Dashboard)
 * thi Page do moi thuc su gui su kien tin nhan ve webhook - neu bo qua buoc
 * nay, webhook da cau hinh dung van se khong nhan duoc gi ca.
 */
async function subscribePageToWebhook(pageId, accessToken) {
  const res = await axios.post(`${GRAPH_BASE}/${pageId}/subscribed_apps`, null, {
    params: { subscribed_fields: 'messages,messaging_postbacks', access_token: accessToken },
  });
  return res.data; // { success: true }
}

module.exports = {
  verifyPage,
  getPageProfile,
  getPageFeed,
  sendMessengerMessage,
  getMessengerUserProfile,
  subscribePageToWebhook,
  publishPost,
  getPostComments,
  replyToComment,
  hideComment,
  updatePostMessage,
  updatePageInfo,
  updateProfilePicture,
  updateCoverPhoto,
  getLoginDialogUrl,
  exchangeCodeForUserToken,
  getLongLivedUserToken,
  getUserPages,
  getPostInsights,
  GRAPH_BASE,
};
