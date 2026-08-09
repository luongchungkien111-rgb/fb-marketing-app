// Giãn gio dang giua cac Page (thay vi tat ca cung 19:30) de trong tu nhien
// hon, giam kha nang bi Facebook de y la hanh vi dang hang loat tu dong.
// Moi Page co 1 "gio goc" rieng (trai deu 19:00-19:50), cong them jitter
// ngau nhien +-4 phut moi ngay.
const fs = require('fs');
const path = require('path');
const { parseCsv, toCsv } = require('../csv');

const CSV_FILE = path.join(__dirname, 'lich-30-ngay.csv');
const BASE_HOUR = 19;
const BASE_MINUTE_START = 0;
const SPREAD_MINUTES = 50; // trai tu 19:00 den 19:50
const JITTER_MINUTES = 4; // +-4 phut moi ngay

function pad(n) {
  return String(n).padStart(2, '0');
}

function main() {
  const rows = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));

  const pageOrder = [];
  const seen = new Set();
  for (const r of rows) {
    if (!seen.has(r.page_row_id)) {
      seen.add(r.page_row_id);
      pageOrder.push(r.page_row_id);
    }
  }
  const baseOffsetByPage = {};
  pageOrder.forEach((id, idx) => {
    const step = pageOrder.length > 1 ? (SPREAD_MINUTES / (pageOrder.length - 1)) * idx : 0;
    baseOffsetByPage[id] = Math.round(step);
  });

  for (const r of rows) {
    const base = baseOffsetByPage[r.page_row_id];
    const jitter = Math.round((Math.random() * 2 - 1) * JITTER_MINUTES); // -4..+4
    let totalMinutes = BASE_MINUTE_START + base + jitter;
    let hour = BASE_HOUR;
    if (totalMinutes < 0) {
      hour -= 1;
      totalMinutes += 60;
    } else if (totalMinutes >= 60) {
      hour += Math.floor(totalMinutes / 60);
      totalMinutes = totalMinutes % 60;
    }
    r.time = `${pad(hour)}:${pad(totalMinutes)}`;
  }

  const csv = toCsv(rows, ['page_row_id', 'date', 'time', 'content', 'image_url', 'video_url', 'image_path']);
  fs.writeFileSync(CSV_FILE, csv, 'utf8');

  console.log('Da giãn gio dang cho', pageOrder.length, 'page:');
  for (const id of pageOrder) {
    console.log(`  Page ${id}: gio goc ~19:${pad(baseOffsetByPage[id])} (+-${JITTER_MINUTES} phut moi ngay)`);
  }
}

main();
