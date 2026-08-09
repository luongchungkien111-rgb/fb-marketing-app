// Dang ngay lap tuc noi dung "Ngay 1" (dong dau tien cua tung Page trong file
// lich-30-ngay.csv) len Facebook that, qua chinh API cua app dang chay local.
// Sau khi dang xong se loc bo cac dong "Ngay 1" da dang khoi file CSV, tranh
// bi dang trung khi sau nay import ca lo 450 dong.
const fs = require('fs');
const path = require('path');
const { parseCsv, toCsv } = require('../csv');

const CSV_FILE = path.join(__dirname, 'lich-30-ngay.csv');
const API_BASE = 'http://localhost:3000';

async function postOne(row) {
  const form = new FormData();
  form.append('page_row_ids', JSON.stringify([row.page_row_id]));
  form.append('content', row.content);
  form.append('publish_now', 'true');
  if (row.image_path && fs.existsSync(row.image_path)) {
    const buf = fs.readFileSync(row.image_path);
    const blob = new Blob([buf]);
    form.append('image', blob, path.basename(row.image_path));
  }
  const res = await fetch(`${API_BASE}/api/posts`, { method: 'POST', body: form });
  const data = await res.json();
  return { row, res, data };
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_FILE, 'utf8'));
  const firstDate = rows[0].date;
  const day1Rows = rows.filter((r) => r.date === firstDate);

  console.log(`Dang ${day1Rows.length} bai (ngay ${firstDate}) len Facebook that...`);
  const summary = [];
  for (const row of day1Rows) {
    try {
      const { data, res } = await postOne(row);
      if (!res.ok) {
        summary.push({ page_row_id: row.page_row_id, ok: false, error: data.error });
        continue;
      }
      const r = data.results[0];
      summary.push({ page_row_id: row.page_row_id, page_name: r.page_name, ok: r.ok, error: r.error, fb_post_id: r.fb_post_id });
    } catch (err) {
      summary.push({ page_row_id: row.page_row_id, ok: false, error: err.message });
    }
  }

  console.log('--- KET QUA ---');
  for (const s of summary) {
    console.log(`Page ${s.page_row_id} (${s.page_name || '?'}): ${s.ok ? 'OK -> ' + s.fb_post_id : 'LOI: ' + s.error}`);
  }

  const okCount = summary.filter((s) => s.ok).length;
  console.log(`\nThanh cong: ${okCount}/${summary.length}`);

  // Loc bo cac dong ngay dau tien da dang xong (chi loc dong OK, giu lai dong loi de thu lai sau)
  const okPageIds = new Set(summary.filter((s) => s.ok).map((s) => s.page_row_id));
  const remaining = rows.filter((r) => !(r.date === firstDate && okPageIds.has(r.page_row_id)));
  const csv = toCsv(remaining, ['page_row_id', 'date', 'time', 'content', 'image_url', 'video_url', 'image_path']);
  fs.writeFileSync(CSV_FILE, csv, 'utf8');
  console.log(`\nDa cap nhat file CSV: bo ${okCount} dong da dang xong, con lai ${remaining.length} dong.`);
}

main().catch((err) => {
  console.error('Loi:', err);
  process.exit(1);
});
