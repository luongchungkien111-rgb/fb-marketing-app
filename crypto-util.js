// Ma hoa/giai ma Access Token luu trong file du lieu, dung AES-256-GCM.
// Neu khong cau hinh ENCRYPTION_KEY trong .env, token se duoc luu THO (plaintext)
// nhu truoc gio - khong lam gay ung dung, chi la kem an toan hon.
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  // Bam raw key ve dung 32 byte (256 bit) cho AES-256, du raw dai/ngan the nao
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(text) {
  const key = getKey();
  if (!key || text == null) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(value) {
  if (value == null || !String(value).startsWith(PREFIX)) return value; // plaintext cu / khong bat ma hoa
  const key = getKey();
  if (!key) {
    // Da ma hoa truoc do nhung gio thieu ENCRYPTION_KEY -> khong giai ma duoc
    throw new Error('Du lieu da ma hoa nhung thieu ENCRYPTION_KEY trong .env de giai ma');
  }
  const [ivB64, tagB64, dataB64] = String(value).slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt, isEncryptionEnabled: () => !!getKey() };
