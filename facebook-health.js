const db = require('./db');
const { debugAccessToken, verifyPage } = require('./facebook');
const { pauseIfFacebookAuthFailed, recordFacebookHealth } = require('./facebook-posting-control');

const REQUIRED_PERMISSIONS = ['pages_manage_posts', 'pages_read_engagement'];

async function checkFacebookPages() {
  const pages = db.listPages();
  const failures = [];
  for (const listed of pages) {
    const page = db.getPageById(listed.id);
    try {
      const [profile, tokenInfo] = await Promise.all([
        verifyPage(page.page_id, page.access_token),
        debugAccessToken(page.access_token, process.env.FB_APP_ID, process.env.FB_APP_SECRET),
      ]);
      const scopes = tokenInfo.scopes || [];
      const missing = REQUIRED_PERMISSIONS.filter((permission) => !scopes.includes(permission));
      if (!tokenInfo.is_valid || String(profile.id) !== String(page.page_id) || missing.length) {
        failures.push({ page_id: page.id, page_name: page.name, reason: missing.length ? `Thiếu quyền: ${missing.join(', ')}` : 'Token không hợp lệ' });
      }
    } catch (error) {
      pauseIfFacebookAuthFailed(error);
      failures.push({ page_id: page.id, page_name: page.name, reason: error.response?.data?.error?.message || error.message });
    }
  }
  const summary = { ok: failures.length === 0, checked: pages.length, failed: failures.length, failures };
  if (failures.length) {
    pauseIfFacebookAuthFailed({ response: { data: { error: { code: 200, message: 'Permission(s) must be granted before impersonating a user page.' } } } });
  }
  recordFacebookHealth({ ok: summary.ok, checked: summary.checked, failed: summary.failed, failures: failures.slice(0, 20) });
  return summary;
}

module.exports = { REQUIRED_PERMISSIONS, checkFacebookPages };
