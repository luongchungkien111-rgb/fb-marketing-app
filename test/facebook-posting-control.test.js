const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshControl() {
  process.env.FACEBOOK_POSTING_STATE_FILE = path.join(os.tmpdir(), `facebook-posting-${process.pid}-${Date.now()}-${Math.random()}.json`);
  delete require.cache[require.resolve('../facebook-posting-control')];
  return require('../facebook-posting-control');
}

function cleanup() {
  if (process.env.FACEBOOK_POSTING_STATE_FILE) fs.rmSync(process.env.FACEBOOK_POSTING_STATE_FILE, { force: true });
}

test.afterEach(cleanup);

test('pauses posting when the environment flag is enabled', () => {
  process.env.FACEBOOK_POSTING_PAUSED = 'true';
  const control = freshControl();
  assert.equal(control.getFacebookPostingStatus().paused, true);
  process.env.FACEBOOK_POSTING_PAUSED = 'false';
});

test('trips persistently when Facebook invalidates the user session', () => {
  process.env.FACEBOOK_POSTING_PAUSED = 'false';
  const control = freshControl();
  const error = { response: { data: { error: { code: 190, error_subcode: 460, message: 'Session invalidated.' } } } };
  assert.deepEqual(control.pauseIfFacebookAuthFailed(error).tripped, true);
  assert.equal(control.getFacebookPostingStatus().reason, 'session_invalidated');
  delete require.cache[require.resolve('../facebook-posting-control')];
  assert.equal(require('../facebook-posting-control').getFacebookPostingStatus().paused, true);
});

test('trips on missing Page impersonation permission', () => {
  const control = freshControl();
  const error = { response: { data: { error: { code: 200, message: 'Any permission(s) must be granted before impersonating a user page.' } } } };
  assert.equal(control.pauseIfFacebookAuthFailed(error).tripped, true);
  assert.equal(control.getFacebookPostingStatus().reason, 'page_permissions_missing');
});

test('successful reconnect clears the persisted circuit breaker', () => {
  const control = freshControl();
  control.pauseIfFacebookAuthFailed({ response: { data: { error: { code: 190, message: 'Invalid OAuth token' } } } });
  assert.equal(control.getFacebookPostingStatus().paused, true);
  control.clearFacebookPostingPause();
  assert.equal(control.getFacebookPostingStatus().paused, false);
});

test('selects oldest posts and at most one post per Page', () => {
  const control = freshControl();
  const due = [
    { id: 3, page_row_id: 1, scheduled_time: '2026-08-10 09:03:00' },
    { id: 2, page_row_id: 1, scheduled_time: '2026-08-10 09:02:00' },
    { id: 1, page_row_id: 2, scheduled_time: '2026-08-10 09:01:00' },
  ];
  assert.deepEqual(control.selectFacebookPostsForRun(due, 2).map((post) => post.id), [1, 2]);
});
