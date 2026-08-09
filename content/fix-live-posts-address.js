// Sua noi dung 5 bai da dang THAT truoc do co dinh dia chi cu (tu ten Page goc).
const db = require('../db');
const { updatePostMessage } = require('../facebook');

const DISPLAY_NAME_OVERRIDES = {
  3: 'Susi Hair',
  4: 'Susi Hair Studio - Chuyên Duỗi Layer',
  5: 'Susi Hair Studio - Chuyên Duỗi Tóc',
  6: 'Susi Hair Salon',
  15: 'Hala Nguyen Hair Salon',
};

const DAY1_TEMPLATE =
  '🌸 Chào tháng mới cùng {salon}! Trọn tháng này, {salon} dành tặng các nàng công sở ưu đãi đặc biệt khi đặt lịch làm tóc. Nhắn tin ngay để giữ chỗ giờ đẹp nhé! 💇‍♀️\n#toccongso #uudaithangmoi\n📍 Đặt lịch ngay hôm nay để giữ chỗ giờ đẹp nhé!';

const FIXES = [
  { postId: 2, pageRowId: 3 },
  { postId: 3, pageRowId: 4 },
  { postId: 4, pageRowId: 5 },
  { postId: 5, pageRowId: 6 },
  { postId: 14, pageRowId: 15 },
];

async function main() {
  for (const fix of FIXES) {
    const post = db.getPostById(fix.postId);
    const page = db.getPageById(fix.pageRowId);
    const displayName = DISPLAY_NAME_OVERRIDES[fix.pageRowId];
    const newContent = DAY1_TEMPLATE.replace(/\{salon\}/g, displayName);

    try {
      await updatePostMessage(post.fb_post_id, page.access_token, newContent);
      db.updatePost(fix.postId, { content: newContent });
      console.log(`OK: post #${fix.postId} (${page.name}) -> da sua thanh "${displayName}"`);
    } catch (err) {
      console.log(`LOI: post #${fix.postId} (${page.name}) ->`, err.response?.data?.error?.message || err.message);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main();
