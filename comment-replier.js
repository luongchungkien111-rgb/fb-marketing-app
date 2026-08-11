// Tu dong quet binh luan moi tren cac bai da dang gan day, dung AI de:
// - Tra loi cac binh luan hop le (cau hoi, khen, phan nan)
// - An cac binh luan spam/quang cao/xuc pham
// - Bo qua binh luan khong lien quan nhung vo hai
// - Canh bao ngay (Telegram/webhook) neu phat hien khach buc/phan nan gay gat
// CHI chay khi AUTO_REPLY_ENABLED=true trong .env (mac dinh TAT).
const cron = require('node-cron');
const db = require('./db');
const { getPostComments, replyToComment, hideComment } = require('./facebook');
const { analyzeComment } = require('./ai-reply');
const { notifyUrgentComment } = require('./notify');
const { getFacebookPostingStatus, pauseIfFacebookAuthFailed } = require('./facebook-posting-control');

const LOOKBACK_DAYS = Number.parseInt(process.env.AUTO_REPLY_LOOKBACK_DAYS || '3', 10);
const MAX_POSTS_PER_SCAN = Number.parseInt(process.env.AUTO_REPLY_MAX_POSTS || '20', 10);
const STAGGER_MS = 2000;

// Thong tin salon (khop voi phan "About" da cap nhat qua content/update-page-info.js)
const SALON_INFO = {
  hours: '8:00 - 20:00 hằng ngày',
  phone: '+84987792781',
  address: '31 ngõ 68 Trung Kính, Cầu Giấy, Hà Nội',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scanAndReply() {
  if (getFacebookPostingStatus().paused) return;
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const posts = db
    .listPosts('published')
    .filter((p) => p.fb_post_id && p.scheduled_time >= cutoff)
    .slice(-MAX_POSTS_PER_SCAN);

  if (!posts.length) return;
  console.log(`[auto-reply] Quet binh luan tren ${posts.length} bai gan day...`);

  let repliedCount = 0;
  let hiddenCount = 0;

  for (const post of posts) {
    const page = db.getPageById(post.page_row_id);
    if (!page) continue;

    let comments;
    try {
      comments = await getPostComments(post.fb_post_id, page.access_token);
    } catch (err) {
      pauseIfFacebookAuthFailed(err);
      // co the thieu quyen pages_read_user_content tren page nay - bo qua, khong dung ca vong quet
      continue;
    }

    for (const comment of comments) {
      if (db.isCommentReplied(comment.id)) continue;
      if (comment.from && comment.from.id === page.page_id) continue; // bo qua comment cua chinh Page
      if (!comment.message) continue;

      try {
        const result = await analyzeComment({
          pageContext: { name: page.name, ...SALON_INFO },
          postContent: post.content || '',
          commentText: comment.message,
          commenterName: comment.from?.name || 'khách',
        });

        if (!result) {
          // AI khong tra ve dung dinh dang - khong mark, de thu lai vong sau
          await sleep(STAGGER_MS);
          continue;
        }

        if (result.action === 'reply' && result.reply) {
          await replyToComment(comment.id, page.access_token, result.reply);
          repliedCount++;
          console.log(`[auto-reply] Da tra loi comment tren "${page.name}": "${comment.message.slice(0, 50)}" -> "${result.reply.slice(0, 50)}"`);

          if (result.urgent) {
            await notifyUrgentComment({
              pageName: page.name,
              commentText: comment.message,
              commenterName: comment.from?.name || 'khách',
              replyDraft: result.reply,
              postUrl: post.post_url,
            });
          }
        } else if (result.action === 'hide') {
          await hideComment(comment.id, page.access_token);
          hiddenCount++;
          console.log(`[auto-reply] Da AN comment spam tren "${page.name}": "${comment.message.slice(0, 50)}"`);
        }
        // action 'ignore': khong lam gi ca

        db.markCommentReplied(comment.id, {
          pageRowId: post.page_row_id,
          postId: post.id,
          action: result.action,
        });
      } catch (err) {
        console.error(`[auto-reply] Loi khi xu ly comment ${comment.id}:`, err.response?.data?.error?.message || err.message);
        // khong mark da xu ly de thu lai vong sau
      }

      await sleep(STAGGER_MS);
    }
  }

  if (repliedCount || hiddenCount) {
    console.log(`[auto-reply] Da tra loi ${repliedCount} binh luan, an ${hiddenCount} binh luan spam.`);
  }
}

function startCommentReplier() {
  if (process.env.AUTO_REPLY_ENABLED !== 'true') {
    console.log('[auto-reply] Dang TAT (AUTO_REPLY_ENABLED != true trong .env) - bo qua.');
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[auto-reply] AUTO_REPLY_ENABLED=true nhung thieu GEMINI_API_KEY - tinh nang se khong hoat dong.');
    return;
  }
  const interval = Math.max(15, Number.parseInt(process.env.AUTO_REPLY_INTERVAL_MINUTES || '60', 10));
  const expression = interval >= 60 ? '0 * * * *' : `*/${interval} * * * *`;
  cron.schedule(expression, () => {
    scanAndReply().catch((err) => console.error('[auto-reply] Loi vong quet:', err.message));
  });
  console.log(`[auto-reply] Da BAT - quet toi da ${MAX_POSTS_PER_SCAN} bai moi ${interval} phut.`);
}

module.exports = { startCommentReplier, scanAndReply };
