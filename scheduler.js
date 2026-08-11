const cron = require('node-cron');
const db = require('./db');
const { publishPost } = require('./facebook');
const tiktok = require('./tiktok');
const { getFreshTiktokAccessToken } = require('./tiktok-token');
const { notifyFailure, notifyTiktokReadyToPost, notifyPostPublished } = require('./notify');
const {
  PAUSED_MESSAGE,
  getFacebookBatchLimit,
  getFacebookPostingStatus,
  pauseIfFacebookAuthFailed,
  selectFacebookPostsForRun,
} = require('./facebook-posting-control');

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MINUTES = [5, 15, 45]; // lan 1: cho 5 phut, lan 2: 15 phut, lan 3: 45 phut
const STAGGER_MS = 4000; // giãn 4 giay giua moi lan goi Graph API de tranh burst request
const TIKTOK_STAGGER_MS = 4000; // giãn 4 giay giua moi lan upload TikTok, cung ly do
let facebookRunActive = false;

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
    if (getFacebookPostingStatus().paused) return;
    if (facebookRunActive) {
      console.warn('[scheduler] Bo qua tick Facebook vi luot truoc van dang chay.');
      return;
    }

    facebookRunActive = true;
    try {
      const allDue = db.getDuePosts();
      const due = selectFacebookPostsForRun(allDue);
      if (!due.length) return;

      console.log(
        `[scheduler] ${allDue.length} bai den gio; xu ly toi da ${getFacebookBatchLimit()} bai trong luot nay ` +
          `(giãn ${STAGGER_MS / 1000}s/bai).`
      );

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
          notifyPostPublished({ postId: post.id, pageName: post.page_name, postUrl: result.post_url });
        } catch (err) {
          const circuit = pauseIfFacebookAuthFailed(err);
          if (circuit.tripped) {
            db.updatePost(post.id, { error: PAUSED_MESSAGE, next_attempt_at: null });
            console.error(`[scheduler] Cau dao Facebook da ngat (${circuit.reason}). Tam dung toan bo luong dang, giu nguyen hang doi.`);
            break;
          }
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
    } finally {
      facebookRunActive = false;
    }
  });

  cron.schedule('* * * * *', async () => {
    const due = db.getDueTiktokPosts();
    if (!due.length) return;

    console.log(`[scheduler] ${due.length} video TikTok den gio, bat dau dua vao Inbox (giãn ${TIKTOK_STAGGER_MS / 1000}s/video)...`);

    for (let i = 0; i < due.length; i++) {
      const post = due[i];
      try {
        const accessToken = await getFreshTiktokAccessToken(post.tiktok_account_id);
        const result = await tiktok.uploadVideoToInbox({ accessToken, videoPath: post.video_path });
        db.updateTiktokPost(post.id, {
          status: 'published',
          publish_id: result.publish_id,
          error: null,
          next_attempt_at: null,
        });
        console.log(`[scheduler] Da dua video #${post.id} vao Inbox tai khoan TikTok "${post.account_name}" (publish_id: ${result.publish_id})`);
        notifyTiktokReadyToPost({ postId: post.id, accountName: post.account_name, videoPath: post.video_path });
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        const retryCount = (post.retry_count || 0) + 1;

        if (retryCount <= MAX_RETRIES) {
          const backoffMin = RETRY_BACKOFF_MINUTES[retryCount - 1] || 45;
          db.updateTiktokPost(post.id, {
            retry_count: retryCount,
            next_attempt_at: db.addMinutesIso(backoffMin),
            error: `(thu lai lan ${retryCount}/${MAX_RETRIES}) ${msg}`,
          });
          console.warn(
            `[scheduler] Loi video TikTok #${post.id}, se thu lai sau ${backoffMin} phut (lan ${retryCount}/${MAX_RETRIES}):`,
            msg
          );
        } else {
          db.updateTiktokPost(post.id, { status: 'failed', error: msg });
          console.error(`[scheduler] Video TikTok #${post.id} that bai vinh vien sau ${MAX_RETRIES} lan thu:`, msg);
          notifyFailure({ postId: post.id, pageName: `TikTok: ${post.account_name}`, error: msg });
        }
      }

      if (i < due.length - 1) await sleep(TIKTOK_STAGGER_MS);
    }
  });

  console.log('[scheduler] Da khoi dong, kiem tra bai cho moi phut.');
}

module.exports = { startScheduler };
