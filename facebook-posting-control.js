const fs = require('fs');
const path = require('path');

const STATE_FILE = process.env.FACEBOOK_POSTING_STATE_FILE || path.join(__dirname, 'data', 'facebook-posting-state.json');
const PAUSED_MESSAGE =
  'Đăng Facebook đang tạm dừng vì kết nối Facebook đã mất hiệu lực. Hàng đợi được giữ nguyên; hãy đăng nhập Facebook lại trước khi thử lại.';

function isEnabledFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { paused: false, reason: null, error: null, paused_at: null, resumed_at: null };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temp, STATE_FILE);
}

function classifyFacebookAuthError(error) {
  const meta = error?.response?.data?.error || {};
  const message = String(meta.message || error?.message || '');
  if (meta.code === 190 && meta.error_subcode === 460) return 'session_invalidated';
  if (meta.code === 190) return 'access_token_invalid';
  if (meta.code === 200 && /api access blocked/i.test(message)) return 'meta_app_blocked';
  if (/permission\(s\) must be granted before impersonating/i.test(message)) return 'page_permissions_missing';
  if (/cannot access the app till you log in to www\.facebook\.com/i.test(message)) return 'facebook_checkpoint_required';
  return null;
}

function classifyFacebookOperationalError(error) {
  const meta = error?.response?.data?.error || {};
  const authReason = classifyFacebookAuthError(error);
  if (authReason) return { kind: 'auth', reason: authReason };
  if ([4, 17, 32, 613].includes(meta.code)) return { kind: 'rate_limit', reason: 'facebook_rate_limit', retryAfterMinutes: 60 };
  if ([1, 2].includes(meta.code) || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') {
    return { kind: 'transient', reason: 'temporary_network_or_meta_error' };
  }
  return { kind: 'permanent', reason: 'content_or_request_error' };
}

function getFacebookBatchLimit() {
  const configured = Number.parseInt(process.env.FACEBOOK_MAX_POSTS_PER_RUN, 10);
  return Number.isInteger(configured) && configured > 0 ? configured : 1;
}

function selectFacebookPostsForRun(duePosts, limit = getFacebookBatchLimit()) {
  const selected = [];
  const selectedPageIds = new Set();
  const sorted = [...duePosts].sort((a, b) => {
    const byTime = String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || ''));
    return byTime || Number(a.id || 0) - Number(b.id || 0);
  });
  for (const post of sorted) {
    const pageKey = post.page_row_id ?? post.fb_page_id;
    if (selectedPageIds.has(pageKey)) continue;
    selected.push(post);
    selectedPageIds.add(pageKey);
    if (selected.length >= limit) break;
  }
  return selected;
}

function getFacebookPostingStatus() {
  const configuredPause = isEnabledFlag(process.env.FACEBOOK_POSTING_PAUSED);
  const state = readState();
  const paused = configuredPause || !!state.paused;
  return {
    paused,
    reason: configuredPause ? 'manual_environment_pause' : state.reason,
    error: state.error,
    paused_at: state.paused_at,
    resumed_at: state.resumed_at,
    message: paused ? PAUSED_MESSAGE : null,
  };
}

function pauseIfFacebookAuthFailed(error) {
  const reason = classifyFacebookAuthError(error);
  if (!reason) return { tripped: false, newlyPaused: false };
  const current = readState();
  const newlyPaused = !current.paused;
  writeState({
    ...current,
    paused: true,
    reason,
    error: error?.response?.data?.error?.message || error?.message || String(error),
    paused_at: current.paused_at || new Date().toISOString(),
  });
  return { tripped: true, newlyPaused, reason };
}

function clearFacebookPostingPause() {
  const current = readState();
  writeState({
    paused: false,
    reason: null,
    error: null,
    paused_at: null,
    resumed_at: new Date().toISOString(),
    previous_reason: current.reason || null,
  });
  return getFacebookPostingStatus();
}

function recordFacebookHealth(summary) {
  const current = readState();
  writeState({ ...current, last_health_check: new Date().toISOString(), health: summary });
}

module.exports = {
  PAUSED_MESSAGE,
  classifyFacebookAuthError,
  classifyFacebookOperationalError,
  clearFacebookPostingPause,
  getFacebookBatchLimit,
  getFacebookPostingStatus,
  pauseIfFacebookAuthFailed,
  recordFacebookHealth,
  selectFacebookPostsForRun,
};
