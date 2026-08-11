const test = require('node:test');
const assert = require('node:assert/strict');
const { findDuplicateRisk, similarity } = require('../content-guard');

test('detects highly similar Vietnamese captions', () => {
  assert.ok(similarity('Tóc layer đẹp tự nhiên, đặt lịch ngay!', 'Tóc layer đẹp tự nhiên - đặt lịch ngay') >= 0.85);
});

test('only warns inside configured time window', () => {
  const posts = [{ id: 1, page_name: 'Page A', status: 'pending', content: 'Tóc layer đẹp tự nhiên đặt lịch ngay', scheduled_time: '2026-08-11 12:00:00' }];
  assert.ok(findDuplicateRisk('Tóc layer đẹp tự nhiên đặt lịch ngay', '2026-08-11 15:00:00', posts));
  assert.equal(findDuplicateRisk('Tóc layer đẹp tự nhiên đặt lịch ngay', '2026-08-13 15:00:00', posts), null);
});
