// Script tao file CSV lich dang VIDEO xoay vong cho cac tai khoan TikTok da
// ket noi, dung lai video da co san tren server (cung thu muc VIDEO_DIR dang
// dung cho lich Facebook - xem content/generate-video-schedule.js).
// Chay: node content/generate-tiktok-schedule.js
//
// Import file ket qua qua giao dien (tab TikTok > Nhap lich hang loat) hoac
// POST /api/tiktok/posts/import (mode=preview truoc, mode=commit sau khi da
// xem lai).
//
// Chong trung video cho tung tai khoan (khong lien quan gi den quy tac trung
// video ben Facebook - moi tai khoan TikTok co Inbox rieng, xem tai lieu ve
// "no repost" o memory fb-marketing-video-uniqueness: quy tac la theo tung
// tai khoan/Page, khong phai toan cuc):
// - Moi tai khoan nhan 1 video khac nhau moi ngay, xoay vong theo offset
//   rieng tung tai khoan (giong co che ben Facebook) nen trong pham vi
//   NUM_DAYS <= so video, 1 tai khoan khong bao gio nhan lai video da dang.
// - Gio dang lech nhau giua cac tai khoan (dao dong quanh BASE_HOUR:BASE_MINUTE,
//   +-45 phut, co dinh theo tung tai khoan) va lech voi khung gio dang bai
//   Facebook (19:30) de trai tai request va de phan biet log.
const fs = require('fs');
const path = require('path');

const VIDEO_DIR = '/var/www/fb-marketing-app/data/schedule-videos';
const OUT_FILE = path.join(__dirname, 'lich-tiktok-30-ngay.csv');

// Snapshot lay tu GET /api/tiktok/accounts tren VPS luc 2026-08-10. Neu co
// tai khoan moi ket noi/xoa, cap nhat lai danh sach nay truoc khi chay lai.
const ACCOUNTS = [
  { id: 1, name: 'Kiên Hair' },
  { id: 2, name: 'Chung anh Le' },
  { id: 3, name: 'Kĩ Thuật Uốn Tóc Hàn Quốc' },
  { id: 4, name: 'Ken Hê' },
  { id: 5, name: 'Kien Le9942' },
  { id: 6, name: 'Quang Anh ( Nam Hair)' },
];

const START_DATE = '2026-08-11'; // ngay mai theo ngay hien tai (2026-08-10)
const NUM_DAYS = 30;
const BASE_HOUR = 20;
const BASE_MINUTE = 15;

// Cung danh sach 34 video dang dung cho lich Facebook (VIDEO_DIR tren VPS) -
// xem content/generate-video-schedule.js neu can doi/them video.
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

// Lech gio on dinh theo tung tai khoan (deterministic, khong dung Math.random
// de chay lai nhieu lan van ra cung 1 lich).
function jitterMinutesForAccount(accountId) {
  const h = (accountId * 2654435761) % 91; // 91 = 2*45+1
  return h - 45;
}

function timeForAccount(accountId) {
  const totalMin = BASE_HOUR * 60 + BASE_MINUTE + jitterMinutesForAccount(accountId);
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function main() {
  if (NUM_DAYS > VIDEO_FILES.length) {
    console.warn(
      `Canh bao: NUM_DAYS (${NUM_DAYS}) > so video (${VIDEO_FILES.length}) - se co tai khoan bi lap lai video trong pham vi ${NUM_DAYS} ngay.`
    );
  }

  const rows = [['tiktok_account_id', 'date', 'time', 'video_path']];

  ACCOUNTS.forEach((account, accountIndex) => {
    const time = timeForAccount(account.id);
    for (let day = 0; day < NUM_DAYS; day++) {
      const date = addDays(START_DATE, day);
      const videoIdx = (day + accountIndex) % VIDEO_FILES.length;
      const videoFile = VIDEO_FILES[videoIdx];
      const videoPath = `${VIDEO_DIR}/${videoFile}`;
      rows.push([account.id, date, time, videoPath]);
    }
  });

  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  fs.writeFileSync(OUT_FILE, csv, 'utf8');
  console.log(`Da tao ${rows.length - 1} dong (${ACCOUNTS.length} tai khoan TikTok, ${NUM_DAYS} ngay, ${VIDEO_FILES.length} video xoay vong).`);
  console.log(`File: ${OUT_FILE}`);
}

main();
