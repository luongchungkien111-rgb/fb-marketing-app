// Gan anh tu 1 thu muc local vao file CSV lich dang bai (cot image_path),
// xoay vong qua danh sach anh, lech vi tri theo tung Page de khong bi trung
// lich anh giua cac Page trong cung 1 ngay.
// Chay: node content/assign-images.js "D:\Anh toc han"
const fs = require('fs');
const path = require('path');
const { parseCsv, toCsv } = require('../csv');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const CSV_FILE = path.join(__dirname, 'lich-30-ngay.csv');

function listImages(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  };
  walk(dir);

  // Bo cac file trung lap kieu "ten 2.png" khi da co "ten.png"
  const baseNames = new Set(out.map((f) => path.basename(f)));
  const deduped = out.filter((f) => {
    const base = path.basename(f, path.extname(f));
    const m = base.match(/^(.*) \d+$/);
    if (!m) return true;
    const originalName = m[1] + path.extname(f);
    return !baseNames.has(originalName);
  });

  return deduped.sort();
}

function main() {
  // Uu tien doc duong dan tu file photo-folder.txt (UTF-8) de tranh loi
  // encoding ky tu tieng Viet khi truyen qua dong lenh/argv tren Windows.
  const configFile = path.join(__dirname, 'photo-folder.txt');
  let folder = process.argv[2];
  if (!folder && fs.existsSync(configFile)) {
    folder = fs.readFileSync(configFile, 'utf8').trim();
  }
  if (!folder) {
    console.error('Dung: node content/assign-images.js "<duong dan thu muc anh>"');
    console.error('Hoac ghi duong dan vao file content/photo-folder.txt');
    process.exit(1);
  }
  const images = listImages(folder);
  if (!images.length) {
    console.error('Khong tim thay anh nao trong thu muc: ' + folder);
    process.exit(1);
  }

  const text = fs.readFileSync(CSV_FILE, 'utf8');
  const rows = parseCsv(text);

  // Nhom theo page_row_id de xoay vong anh rieng cho tung Page, lech diem
  // bat dau giua cac Page de tranh trung anh cung ngay.
  const pageOrder = [];
  const seen = new Set();
  for (const r of rows) {
    if (!seen.has(r.page_row_id)) {
      seen.add(r.page_row_id);
      pageOrder.push(r.page_row_id);
    }
  }
  const pageOffset = Object.fromEntries(pageOrder.map((id, idx) => [id, idx]));
  const dayIndexByPage = {};

  for (const r of rows) {
    const i = dayIndexByPage[r.page_row_id] || 0;
    const imgIdx = (i + pageOffset[r.page_row_id]) % images.length;
    r.image_path = images[imgIdx];
    dayIndexByPage[r.page_row_id] = i + 1;
  }

  const csv = toCsv(rows, ['page_row_id', 'date', 'time', 'content', 'image_url', 'video_url', 'image_path']);
  fs.writeFileSync(CSV_FILE, csv, 'utf8');
  console.log(`Da gan anh cho ${rows.length} dong, dung ${images.length} anh xoay vong.`);
  console.log(`File cap nhat: ${CSV_FILE}`);
}

main();
