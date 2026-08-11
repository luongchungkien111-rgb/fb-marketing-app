const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPostFallbackUrl, toAbsoluteFacebookUrl } = require('../facebook');

test('turns a relative Facebook reel permalink into an absolute URL', () => {
  assert.equal(
    toAbsoluteFacebookUrl('/reel/1418144137127991/'),
    'https://www.facebook.com/reel/1418144137127991/'
  );
});

test('keeps an absolute Facebook permalink unchanged', () => {
  const url = 'https://www.facebook.com/123/posts/456';
  assert.equal(toAbsoluteFacebookUrl(url), url);
});

test('uses a reel URL as the safe video fallback', () => {
  assert.equal(
    buildPostFallbackUrl({ pageId: '123', objectId: '456', postType: 'video' }),
    'https://www.facebook.com/reel/456/'
  );
});

test('uses the story id for a composite Facebook post id fallback', () => {
  assert.equal(
    buildPostFallbackUrl({ pageId: '123', objectId: '123_456', postType: 'text' }),
    'https://www.facebook.com/123/posts/456'
  );
});
