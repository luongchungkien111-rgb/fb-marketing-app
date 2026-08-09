const cron = require('node-cron');
const db = require('./db');
const { publishPost } = require('./facebook');
const { notifyFailure } = require('./notify');

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MINUTES = [5, 15, 45]; // lan 1: cho 5 phut, lan 2: 15 phut, lan 3: 45 phut
const STAGGER_MS = 4000; // giãn 4 giay giua moi lan goi Graph API de tranh burst request

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chay moi phut: tim cac bai viet 'pending' da den gio (va khong con dang cho
 * retry-backoff) roi gui len Facebook. Cac bai duoc gui lan luot, giãn cach
 * nhau vai giay de tranh dang dồn dập cùng lúc lên nhiều Page (dễ bị Facebook
 * gioi han toc do / nghi ngo hanh vi bat thuong).
 */
function startScheduler() {
  cron.schedule('* * * * *', async () => {
    const due = db.getDuePosts();
    if (!due.length) return;

    console.log(`[scheduler] ${due.length} bai den gio, bat dau dang (giãn ${STAGGER_MS / 1000}s/bai)...`);

    for (let i = 0; i < due.length; i++) {
      const post = due[i];
      try {
        const result = await publishPost({
          pageId: post.fb_page_id,
          accessToken: post.page_token,
          message: post.content,
          imagePath: post.image_path,
          imageUrl: post.image_url,
          videoPath: post.video_path,
          videoUrl: post.video_url,
        });
        const fbPostId = result.post_id || result.id;
        db.updatePost(post.id, {
          status: 'published',
          fb_post_id: fbPostId,
          post_url: result.post_url,
          error: null,
          next_attempt_at: null,
        });
        console.log(`[scheduler] Da dang bai #${post.id} len Page "${post.page_name}" (fb id: ${fbPostId})`);
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        const retryCount = (post.retry_count || 0) + 1;

        if (retryCount <= MAX_RETRIES) {
          const backoffMin = RETRY_BACKOFF_MINUTES[retryCount - 1] || 45;
          db.updatePost(post.id, {
            retry_count: retryCount,
            next_attempt_at: db.addMinutesIso(backoffMin),
            error: `(thu lai lan ${retryCount}/${MAX_RETRIES}) ${msg}`,
          });
          console.warn(
            `[scheduler] Loi dang bai #${post.id}, se thu lai sau ${backoffMin} phut (lan ${retryCount}/${MAX_RETRIES}):`,
            msg
          );
        } else {
          db.updatePost(post.id, { status: 'failed', error: msg });
          console.error(`[scheduler] Bai #${post.id} that bai vinh vien sau ${MAX_RETRIES} lan thu:`, msg);
          notifyFailure({ postId: post.id, pageName: post.page_name, error: msg });
        }
      }

      if (i < due.length - 1) await sleep(STAGGER_MS);
    }
  });
  console.log('[scheduler] Da khoi dong, kiem tra bai cho moi phut.');
}

module.exports = { startScheduler };
