function normalizeContent(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  const left = new Set(normalizeContent(a).split(' ').filter(Boolean));
  const right = new Set(normalizeContent(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection / Math.max(left.size, right.size);
}

function findDuplicateRisk(content, scheduledTime, posts, windowHours = 12) {
  if (!content) return null;
  const target = new Date(String(scheduledTime).replace(' ', 'T') + 'Z').getTime();
  let best = null;
  for (const post of posts) {
    if (!post.content || post.status === 'failed') continue;
    const time = new Date(String(post.scheduled_time).replace(' ', 'T') + 'Z').getTime();
    if (Number.isFinite(target) && Math.abs(time - target) > windowHours * 3600000) continue;
    const score = similarity(content, post.content);
    if (score >= 0.85 && (!best || score > best.similarity)) best = { post_id: post.id, page_name: post.page_name, scheduled_time: post.scheduled_time, similarity: score };
  }
  return best;
}

module.exports = { findDuplicateRisk, normalizeContent, similarity };
