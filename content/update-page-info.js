// Cap nhat dia chi + gioi thieu (about) + sdt cho toan bo Page salon, qua API
// cua app dang chay local. Chay: node content/update-page-info.js
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { updatePageInfo } = require('../facebook');

const MEN_PAGE_IDS = [8, 9, 12, 14];
const EXCLUDE_PAGE_IDS = [1]; // Ecopos - khong phai salon

const PHONE = '+84987792781'; // Facebook yeu cau dinh dang quoc te (+84), khong nhan so bat dau bang "0"
const LOCATION = {
  street: '31 ngõ 68 Trung Kính',
  city: 'Hà Nội',
  country: 'Việt Nam',
};
const HOURS_TEXT = 'Giờ mở cửa: 8:00 - 20:00 hằng ngày.';

const DISPLAY_NAME_OVERRIDES = {
  3: 'Susi Hair',
  4: 'Susi Hair Studio - Chuyên Duỗi Layer',
  5: 'Susi Hair Studio - Chuyên Duỗi Tóc',
  6: 'Susi Hair Salon',
  15: 'Hala Nguyen Hair Salon',
};

function aboutFor(page, isMen) {
  const displayName = DISPLAY_NAME_OVERRIDES[page.id] || page.name;
  const service = isMen
    ? 'Dịch vụ: cắt tóc nam, tạo kiểu, cạo mặt, gội dưỡng da đầu.'
    : 'Dịch vụ: cắt, uốn, nhuộm, gội dưỡng tóc.';
  const audience = isMen ? 'dành cho phái mạnh' : 'dành cho phái đẹp';
  return `${displayName} - Salon tóc chuyên nghiệp ${audience} tại 31 ngõ 68 Trung Kính, Cầu Giấy, Hà Nội. ${service} ${HOURS_TEXT} Hotline: ${PHONE}.`;
}

async function main() {
  const pages = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'app.db.json'), 'utf8')).pages;
  const targets = pages.filter((p) => !EXCLUDE_PAGE_IDS.includes(p.id));

  console.log(`Cap nhat thong tin cho ${targets.length} page...`);
  const results = [];

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const page = db.getPageById(p.id); // lay ban da giai ma token
    const isMen = MEN_PAGE_IDS.includes(p.id);
    const about = aboutFor(p, isMen);

    try {
      await updatePageInfo({
        pageId: page.page_id,
        accessToken: page.access_token,
        about,
        phone: PHONE,
        location: LOCATION,
      });
      results.push({ id: p.id, name: p.name, ok: true });
      console.log(`OK: ${p.name}`);
    } catch (err) {
      const apiErr = err.response?.data?.error;
      const msg = apiErr?.error_user_msg || apiErr?.message || err.message;
      results.push({ id: p.id, name: p.name, ok: false, error: msg });
      console.log(`LOI: ${p.name} -> ${msg}`);
    }

    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 5000)); // giãn cách
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\nThanh cong: ${okCount}/${results.length}`);
}

main().catch((err) => {
  console.error('Loi:', err);
  process.exit(1);
});
