// Script tao file CSV lich dang VIDEO xoay vong cho cac tai khoan TikTok da
// ket noi, dung rieng kho video xuat tu AI AutoEdit Pro (khong dung chung voi
// kho video lich Facebook) - da upload len VIDEO_DIR ben duoi.
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

const VIDEO_DIR = '/var/www/fb-marketing-app/data/tiktok-schedule-videos';
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

// 85 video xuat tu AI AutoEdit Pro (C:\Users\Admin\.ai-autoedit-pro-web\media\
// tren may local), da upload nguyen ten len VIDEO_DIR tren VPS.
const VIDEO_FILES = [
  '059a836b-57a9-4196-9e5b-5be4d68609a6.mp4',
  '061225a2-2414-4d5f-98fe-43dfc3733c3f.mp4',
  '08eff7dd-2a3e-4295-a48e-b2cabf2db50f.mp4',
  '09695f9d-299b-46bb-9dce-73d22136cc66.mp4',
  '0b019c33-4ea7-4a2d-8542-ec7416397525.mp4',
  '0cede64b-dcd5-4baf-a752-0d2bf8fc94fe.mp4',
  '0d8ede30-af8c-472d-a75e-f6ce4f4e5d58.mp4',
  '0e06245e-cf4e-4186-b275-fd668b0bf48f.mp4',
  '0e3580ab-7c04-4d7c-a2b7-4fe2a67da3e7.mp4',
  '0e51c3fd-5c5e-4a90-9b6a-729243781b1f.mp4',
  '0f184ffb-ea64-48c7-8623-7db728af89b6.mp4',
  '0fd0132e-8bd7-4a4c-986d-561d4b0aa167.mp4',
  '101662cf-7c29-4edb-9d8e-cff055ebd53a.mp4',
  '11d98889-eda6-44de-ab68-94585ccfcca4.mp4',
  '1a1b6ab0-0fef-4e77-a06b-90265e3324d4.mp4',
  '1b05365b-bca1-42cb-97c1-a7a8a55ff797.mp4',
  '1c1b3339-32cd-4559-8c82-48e487a93a50.mp4',
  '1c3621bd-8921-460f-aaca-c1864e49f767.mp4',
  '219324ba-b50e-4599-b44c-698904a85aef.mp4',
  '23f07ce7-fde4-4807-b4a6-7acc25000d25.mp4',
  '28b52ba8-343e-4dd2-864b-579260dae8ba.mp4',
  '2f99de90-7567-4c02-b15c-57e2be5c4208.mp4',
  '3372ce39-cf06-4cac-935c-92695f3ae3e5.mp4',
  '34786084-af22-4f48-8246-7b71cad59ece.mp4',
  '37902cd7-918a-4535-b2ac-e34a7bcf0aaf.mp4',
  '37ff722a-adcd-45dd-84c5-ca6da4d58e21.mp4',
  '386d1d59-549a-431b-ae73-d8d598864717.mp4',
  '3b0969ad-8bb9-481c-8c70-a815e9f4bfd2.mp4',
  '407f0f0c-ee1b-41a2-aa52-579db06b0e0f.mp4',
  '42de709a-6124-4f31-be55-73ef463a66d7.mp4',
  '43e6bb38-7919-4a89-a028-4d78c1ee431f.mp4',
  '45a3d743-4144-4334-8e88-22ff3aed372e.mp4',
  '488dbc50-d221-4260-b75e-f6a12d509671.mp4',
  '53596149-6150-46dd-8354-5575a898e89a.mp4',
  '62b76845-cbde-459c-b673-f53a9d3850d0.mp4',
  '630ac52e-7727-474e-9351-039d42a3c749.mp4',
  '6504eba6-28a3-4de2-ae5d-26dd52bcb4f5.mp4',
  '6553f981-cc57-4017-8260-e1693aa0318e.mp4',
  '6830bd21-9fe6-418c-ac6c-ad15436075ff.mp4',
  '7037f6bd-f0c0-4649-b0b6-7b062fb2ab6e.mp4',
  '725b71aa-840e-49b8-9143-21c9a2b2ed1c.mp4',
  '753a2f08-e575-4b6b-ba43-f1eea91eca51.mp4',
  '7a4254ff-45c8-474a-8160-774bb32a9c63.mp4',
  '7e9711ca-297e-409f-827d-506e4803e0d8.mp4',
  '8484a53a-2cef-471e-a3db-f2a911f098d8.mp4',
  '869c6ede-f1b8-444d-84ce-b21b48a2be3f.mp4',
  '870a9efa-6aa6-4b26-93de-7d8a0debc1b9.mp4',
  '8ed4ef7e-159b-434c-be5c-5bebf23c1118.mp4',
  '93991a3c-54f7-4a17-aafe-d79aaef479cb.mp4',
  '93f242e5-72d3-4c8c-b223-3581cc45299a.mp4',
  '94005a85-21ed-47d3-8b38-1f860b413e98.mp4',
  '99d796f1-2728-447e-bc19-1a57f853b07a.mp4',
  '9c349839-9d96-46ba-8bf9-bcf49e4a55e0.mp4',
  '9c89ae1b-b125-4614-9731-3828906edf00.mp4',
  '9e85d091-0342-482a-b9fa-c3bdccb9b7fd.mp4',
  '9efbb385-6278-418f-8192-9d33de815882.mp4',
  '9f0ae136-ac32-4d5c-bc7f-dae89090a292.mp4',
  'a0c8530c-f1e5-4ba5-a1df-ae95beaf5c45.mp4',
  'a2b1774b-61c3-487d-b8ed-152a8fa4bb2a.mp4',
  'a8ad9b0e-baf4-4604-b785-ca8a0cdc5a40.mp4',
  'a99ef8c3-8bfe-4e94-934e-858015f848ab.mp4',
  'aa1942ae-4431-446f-b34a-ffc95483edcd.mp4',
  'ac979ca9-8aab-42b6-ace5-20a3dcea0442.mp4',
  'ad355f25-9be7-40e9-8650-f0ddec459cd6.mp4',
  'ae8633ca-7ece-43cc-b2b0-e9a98c733c1b.mp4',
  'b971da95-edc9-4902-8299-ac429870a017.mp4',
  'c05ba1b3-7f60-49b4-84db-3d817aab2bc7.mp4',
  'c30476bd-30b8-4d62-bbcb-5690e9a34cc2.mp4',
  'c65615ff-dc03-45b2-b1b6-df06cd900dd0.mp4',
  'c65eecbb-93c8-470f-8568-35dfec69ab78.mp4',
  'c7b5bebf-5f9a-4680-9ede-dd44d656d700.mp4',
  'ce19fe01-855f-4364-a57f-2d234ddfd7fa.mp4',
  'cf0083bb-16af-4b35-b7b9-1de94a434907.mp4',
  'd020d748-301f-433b-ba3f-1ff769eb8f9c.mp4',
  'd2aa0bc8-42e1-4ecd-8306-a5ed45fce342.mp4',
  'd92f0f69-3288-405f-8ea4-fe6ec65f0474.mp4',
  'dae8e55f-dc49-411d-98ea-67f012baef56.mp4',
  'dec49e77-ce76-4ab4-b36d-e85429919871.mp4',
  'e64d0b56-ef87-45e4-ac7e-1dae4a256093.mp4',
  'ebbf5658-f504-4316-b363-4dd61faf27ed.mp4',
  'f24d5402-9a05-4f64-8d53-99f381f0997a.mp4',
  'fabe2f9c-cf38-4296-a95e-b84fdf2fff20.mp4',
  'fb191c06-b3dd-4999-bc71-9e69971e21f4.mp4',
  'fe10da47-ab6a-4e0c-a471-0cf7d5500c57.mp4',
  'fea88d9c-be2f-447c-90dc-8130c56751af.mp4',
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
