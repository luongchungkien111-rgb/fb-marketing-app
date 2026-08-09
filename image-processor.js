// Nen/resize anh local truoc khi upload len Facebook, dung Jimp (JS thuan,
// khong can bien dich native nen cai dat luon thanh cong tren moi may).
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const MAX_WIDTH = 1600; // Facebook tu resize anh lon hon nen khong can giu nguyen kich thuoc goc
const MAX_SIZE_BYTES = 1 * 1024 * 1024; // 1MB - nguong de quyet dinh co nen nen hay khong
const JPEG_QUALITY = 82;

const CACHE_DIR = path.join(__dirname, 'uploads', '_compressed');

/**
 * Neu anh dau vao lon (kich thuoc hoac dung luong), tra ve duong dan anh da
 * nen (JPEG, giam chieu rong toi da MAX_WIDTH). Neu anh da nho san thi tra ve
 * nguyen duong dan cu, khong xu ly gi them (tranh ton thoi gian khong can thiet).
 * Ket qua duoc cache theo ten+kich thuoc file nguon de khong nen lai nhieu lan
 * cho cung 1 anh dung o nhieu bai dang.
 */
async function compressIfNeeded(inputPath) {
  try {
    if (!inputPath || !fs.existsSync(inputPath)) return inputPath;

    const stat = fs.statSync(inputPath);
    if (stat.size <= MAX_SIZE_BYTES) return inputPath; // da du nho, khong can nen

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const cacheKey = `${path.basename(inputPath)}-${stat.size}-${stat.mtimeMs}.jpg`;
    const cachedPath = path.join(CACHE_DIR, cacheKey);
    if (fs.existsSync(cachedPath)) return cachedPath;

    const image = await Jimp.read(inputPath);
    if (image.width > MAX_WIDTH) {
      image.resize({ w: MAX_WIDTH });
    }
    await image.write(cachedPath, { quality: JPEG_QUALITY });

    const newSize = fs.statSync(cachedPath).size;
    console.log(
      `[image] Da nen anh: ${path.basename(inputPath)} (${(stat.size / 1024 / 1024).toFixed(1)}MB) -> ${(newSize / 1024 / 1024).toFixed(1)}MB`
    );
    return cachedPath;
  } catch (err) {
    console.warn(`[image] Khong nen duoc anh (${inputPath}), dung anh goc:`, err.message);
    return inputPath; // that bai thi cu dung anh goc, khong chan viec dang bai
  }
}

module.exports = { compressIfNeeded };
