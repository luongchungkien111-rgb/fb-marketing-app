// Sao luu dinh ky file du lieu (data/app.db.json) sang thu muc data/backups/,
// giu lai N ban gan nhat, tu dong xoa ban cu hon.
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const DB_FILE = path.join(__dirname, 'data', 'app.db.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const KEEP_LAST = 14; // giu 14 ban gan nhat (vi du chay 1 lan/ngay ~ 2 tuan)

function backupNow() {
  if (!fs.existsSync(DB_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(BACKUP_DIR, `app-db-${stamp}.json`);
  fs.copyFileSync(DB_FILE, dest);

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('app-db-') && f.endsWith('.json'))
    .sort(); // ten co timestamp nen sort chu la du theo thoi gian
  const excess = files.length - KEEP_LAST;
  if (excess > 0) {
    for (const f of files.slice(0, excess)) fs.unlinkSync(path.join(BACKUP_DIR, f));
  }

  console.log(`[backup] Da sao luu du lieu: ${dest}`);
}

function startBackupSchedule() {
  backupNow(); // sao luu ngay luc khoi dong server
  cron.schedule('0 3 * * *', backupNow); // 3h sang moi ngay
  console.log('[backup] Da lap lich sao luu du lieu hang ngay luc 3h sang.');
}

module.exports = { startBackupSchedule, backupNow };
