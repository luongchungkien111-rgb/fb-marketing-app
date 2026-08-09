// Script tao file CSV lich dang VIDEO xoay vong cho cac Fanpage salon toc,
// dung video da dung san (dat san tren server tai VIDEO_DIR).
// Chay: node content/generate-video-schedule.js
//
// Chong bi Facebook coi la spam/noi dung trung lap hang loat:
// - Moi ngay, moi Page nhan 1 video KHAC nhau (xoay vong theo offset rieng
//   tung Page nen khong co 2 Page nao trung video trong cung 1 ngay, vi so
//   Page < so video).
// - Gio dang lech nhau giua cac Page (dao dong quanh 19:30, +-45 phut, co
//   dinh theo tung Page de on dinh) thay vi tat ca cung 1 gio tuyet doi.
// - Caption ngan xoay vong theo mau, khac voi bo caption dang dung cho bai
//   dang text hien co (tranh trung noi dung giua 2 loai bai tren cung Page).
const fs = require('fs');
const path = require('path');

const VIDEO_DIR = '/var/www/fb-marketing-app/data/schedule-videos';
const OUT_FILE = path.join(__dirname, 'lich-video-30-ngay.csv');

// Snapshot lay tu GET /api/pages luc 2026-08-09 (qua phien dang nhap trinh
// duyet) - khong the goi truc tiep tu script vi API yeu cau cookie dang nhap
// (APP_PASSWORD). Neu co Page moi/xoa Page, cap nhat lai danh sach nay.
const PAGES = [
  { id: 17, name: 'Susi Hair Salon - Chuyên Uốn Layer', group: 'Vera' },
  { id: 16, name: 'Susi Hair - Chuyên Layer', group: 'Vera' },
  { id: 15, name: 'Susi Hair Salon Vũ Phạm Hàm', group: 'Susi Hair' },
  { id: 14, name: 'SUSI HAIR SALON', group: 'Susi Hair' },
  { id: 13, name: 'Susi hair cầu giấy', group: 'Susi Hair' },
  { id: 12, name: 'Tóc Đẹp cầu Giấy', group: '' },
  { id: 11, name: 'Chuyên Xoăn Sóng Cầu Giấy', group: '' },
  { id: 10, name: 'Nam Hair studio Cầu giấy', group: 'Nam Hair' },
  { id: 9, name: 'Nam Hair Cầu Giấy- chuyên layer', group: 'Nam Hair' },
  { id: 8, name: 'Nam Hair Salon Cầu giấy', group: 'Nam Hair' },
  { id: 7, name: 'Nam Hair Khúc Thừa Dụ', group: 'Nam Hair' },
  { id: 6, name: 'Nam Hair Chuyên Xoăn Bung', group: 'Nam Hair' },
  { id: 5, name: 'Nam Hair Salon Cầu giấy', group: 'Nam Hair' },
  { id: 4, name: 'SUSI Hair & Beauty', group: 'Susi Hair' },
  { id: 3, name: 'Susi Hair salon 31 Ngõ 68 Trung kính', group: 'Susi Hair' },
  { id: 2, name: 'Susi Hair Studio Trung Kín', group: 'Susi Hair' },
  { id: 1, name: 'SuSi Hair Salon Đống Đa', group: 'Susi Hair' },
  { id: 26, name: 'CK Hair Salons', group: '' },
  { id: 25, name: 'Hala Nguyen hair salon toà s106', group: '' },
  { id: 24, name: 'Nam Hair Cầu Giấy', group: 'Nam Hair' },
  { id: 23, name: 'Lê Quang Anh Nam Hair', group: 'Nam Hair' },
  { id: 22, name: 'Susi Hair Studio  Chuyên Duỗi Tóc', group: 'Susi Hair' },
  { id: 21, name: 'Susi Hair Studio 32 Hoàng Ngọc Phách Đống Đa chuyên duỗi layer', group: 'Susi Hair' },
  { id: 20, name: 'Susi Hair Trung Kính Chuyên uốn layer', group: 'Susi Hair' },
  { id: 19, name: 'SuSi Hair Design', group: 'Susi Hair' },
  { id: 18, name: 'Ecopos Phần Mềm Quản lý Salon Tóc', group: '' },
];

const EXCLUDE_PAGE_IDS = [18]; // Ecopos Phan Mem Quan ly Salon Toc - khong phai salon

const START_DATE = '2026-08-10'; // ngay mai theo ngay hien tai (2026-08-09)
const NUM_DAYS = 30;
const BASE_HOUR = 19;
const BASE_MINUTE = 30;

const VIDEO_FILES = [
  'final_1786178553099.mp4',
  'final_1786181766533.mp4',
  'final_1786186507562.mp4',
  'final_1786192066925.mp4',
  'final_1786192503392.mp4',
  'final_1786192874824.mp4',
  'final_1786193562054.mp4',
  'final_1786194978037.mp4',
  'final_1786195873283.mp4',
  'final_1786202807893.mp4',
  'final_1786204378507.mp4',
  'final_1786204993148.mp4',
  'fullhd_1786185645789.mp4',
  'fullhd_1786186635195.mp4',
  'fullhd_1786193679247.mp4',
  'fullhd_1786195070432.mp4',
  'fullhd_1786195795072.mp4',
  'fullhd_1786196047409.mp4',
  'fullhd_1786203117230.mp4',
  'fullhd_1786204515702.mp4',
  'master_1786175670454.mp4',
  'salon_Chuy_n_ng_t_c_m_t_6_cut.mp4',
  'salon_Chuy_n_ng_t_c_m_t_7_cut.mp4',
  'salon_N_c_i_th_n_th_ng_5_cut.mp4',
  'salon_Ng_c_nh_n_t_nhi_n_2_cut.mp4',
  'salon_Nh_n_qua_vai_6_cut.mp4',
  'salon_Salon_-_Ch_nh_t_c_1_7_cut.mp4',
  'salon_Salon_-_Ch_nh_t_c_1_8_cut.mp4',
  'salon_Salon_-_Ch_nh_t_c_2_8_cut.mp4',
  'salon_Salon_-_Ch_nh_t_c_2_9_cut.mp4',
  'salon_Th_n_th_i_sang_tr_ng_9_cut.mp4',
  'salon_Vu_t_t_c_duy_n_d_ng_4_cut.mp4',
  'salon_Xoay_m_t_g_c_nghi_ng_3_cut.mp4',
  'salon_nh_nh_n_d_u_d_ng_1_cut.mp4',
];

const WOMEN_CAPTIONS = [
  '💇‍♀️ Một khoảnh khắc làm tóc tại {salon} — nhẹ nhàng, tự nhiên, đúng phong cách bạn thích.',
  '✨ {salon} luôn chú trọng từng chi tiết nhỏ để mái tóc bạn lên form đẹp nhất.',
  '🌸 Ghé {salon} để cảm nhận sự khác biệt trong từng đường kéo, từng lọn tóc.',
  '💧 Chăm chút từng bước tại {salon} — từ gội, ủ đến tạo kiểu, không vội vàng.',
  '🎨 Một tông màu mới, một diện mạo mới cùng {salon}.',
  '💁‍♀️ Stylist tại {salon} luôn lắng nghe trước khi bắt tay vào làm.',
  '🌤️ Đổi gió cho mái tóc cùng {salon} — nhẹ nhàng mà cuốn hút.',
  '🧴 {salon} ưu tiên sản phẩm dưỡng an toàn cho tóc nhuộm/uốn.',
  '✂️ Từng đường cắt tại {salon} đều có lý do — không làm qua loa.',
  '💆‍♀️ Thư giãn trọn vẹn trong lúc làm tóc tại {salon}.',
  '🌟 Một buổi làm tóc, một lần tự tin hơn — cùng {salon}.',
  '📸 Khoảnh khắc thật tại {salon}, không dàn dựng.',
  '🩷 {salon} — nơi mỗi mái tóc đều được chăm như lần đầu.',
  '🍃 Nhẹ nhàng, tự nhiên, đúng chất {salon}.',
];

const MEN_CAPTIONS = [
  '💈 Một buổi cắt tóc gọn gàng, chỉn chu tại {salon}.',
  '✂️ Đường kéo dứt khoát, tay nghề vững tại {salon}.',
  '🔥 Đổi kiểu đầu mới cùng {salon} — gọn mà vẫn có nét riêng.',
  '💪 {salon} — nhanh, gọn, đúng ý anh em.',
  '🪒 Từ cắt đến tạo kiểu, {salon} lo trọn gói.',
  '😎 Diện mạo mới, tự tin hơn cùng {salon}.',
  '💇‍♂️ Barber tại {salon} luôn hỏi kỹ trước khi cắt.',
  '⚡ Ghé {salon} tranh thủ giờ rảnh, không phải chờ lâu.',
  '🧴 {salon} dùng sản phẩm chăm sóc tóc/da đầu chuyên cho nam.',
  '🎬 Khoảnh khắc thật tại {salon}, không dàn dựng.',
  '👊 Gọn gàng, chuyên nghiệp — đúng chất {salon}.',
  '🌆 Một buổi chiều làm mới đầu tóc tại {salon}.',
];

const CTA_WOMEN = [
  '📍 Đặt lịch ngay hôm nay nhé!',
  '💌 Inbox {salon} để được tư vấn miễn phí!',
  '☎️ Gọi hotline để giữ giờ đẹp!',
  '💬 Nhắn tin để stylist tư vấn riêng cho bạn!',
];
const CTA_MEN = [
  '📍 Đặt lịch ngay hôm nay nhé anh em!',
  '💌 Inbox {salon} để được tư vấn nhanh!',
  '☎️ Gọi hotline đặt lịch trong hôm nay!',
  '💬 Nhắn tin để được tư vấn kiểu phù hợp!',
];

function escapeCsv(field) {
  const s = String(field ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Lech gio on dinh theo tung Page (deterministic, khong dung Math.random de
// chay lai nhieu lan van ra cung 1 lich - de dang doi chieu/sua sau nay).
function jitterMinutesForPage(pageId) {
  // Bam don gian tu id -> trai deu trong khoang [-45, +45] phut.
  const h = (pageId * 2654435761) % 91; // 91 = 2*45+1
  return h - 45;
}

function timeForPage(pageId) {
  const totalMin = BASE_HOUR * 60 + BASE_MINUTE + jitterMinutesForPage(pageId);
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function isMenPage(name) {
  return /nam hair/i.test(name);
}

function main() {
  const pages = PAGES.filter((p) => !EXCLUDE_PAGE_IDS.includes(p.id));

  const rows = [['page_row_id', 'date', 'time', 'content', 'image_url', 'video_url', 'video_path']];
  let womenCount = 0;
  let menCount = 0;

  pages.forEach((page, pageIndex) => {
    const isMen = isMenPage(page.name);
    const captions = isMen ? MEN_CAPTIONS : WOMEN_CAPTIONS;
    const ctaPool = isMen ? CTA_MEN : CTA_WOMEN;
    if (isMen) menCount++;
    else womenCount++;

    const displayName = page.name.trim();
    const time = timeForPage(page.id);

    for (let day = 0; day < NUM_DAYS; day++) {
      const date = addDays(START_DATE, day);
      const videoIdx = (day + pageIndex) % VIDEO_FILES.length;
      const videoFile = VIDEO_FILES[videoIdx];
      const videoPath = `${VIDEO_DIR}/${videoFile}`;

      const caption = captions[day % captions.length].replace(/\{salon\}/g, displayName);
      const cta = ctaPool[(day + pageIndex) % ctaPool.length].replace(/\{salon\}/g, displayName);
      const content = `${caption}\n${cta}`;

      rows.push([page.id, date, time, content, '', '', videoPath]);
    }
  });

  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  fs.writeFileSync(OUT_FILE, csv, 'utf8');
  console.log(`Da tao ${rows.length - 1} dong (${pages.length} Page: ${menCount} Nam Hair + ${womenCount} khac, ${NUM_DAYS} ngay, ${VIDEO_FILES.length} video xoay vong).`);
  console.log(`File: ${OUT_FILE}`);
}

main();
