const $ = (sel) => document.querySelector(sel);

// ---------- Hop thoai tu ve (thay cho prompt()/confirm() cua trinh duyet -
// mot so moi truong xem truoc/webview khong ho tro dialog goc, gay ra loi
// ngam khien nut bam nhu khong phan hoi gi) ----------
function _escapeHtmlSafe(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _ensureModalRoot() {
  let root = document.getElementById('customModalRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'customModalRoot';
    document.body.appendChild(root);
  }
  return root;
}
function customConfirm(message) {
  return new Promise((resolve) => {
    const root = _ensureModalRoot();
    root.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <p class="modal-msg">${_escapeHtmlSafe(message)}</p>
          <div class="modal-actions">
            <button type="button" class="modal-cancel">Huỷ</button>
            <button type="button" class="modal-ok primary">Đồng ý</button>
          </div>
        </div>
      </div>`;
    const cleanup = (result) => { root.innerHTML = ''; resolve(result); };
    root.querySelector('.modal-cancel').addEventListener('click', () => cleanup(false));
    root.querySelector('.modal-ok').addEventListener('click', () => cleanup(true));
    root.querySelector('.modal-overlay').addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) cleanup(false); });
  });
}
function customPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const root = _ensureModalRoot();
    root.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <p class="modal-msg">${_escapeHtmlSafe(message)}</p>
          <input type="text" class="modal-input" value="${_escapeHtmlSafe(defaultValue)}" />
          <div class="modal-actions">
            <button type="button" class="modal-cancel">Huỷ</button>
            <button type="button" class="modal-ok primary">Xác nhận</button>
          </div>
        </div>
      </div>`;
    const input = root.querySelector('.modal-input');
    input.focus();
    input.select();
    const cleanup = (result) => { root.innerHTML = ''; resolve(result); };
    root.querySelector('.modal-cancel').addEventListener('click', () => cleanup(null));
    root.querySelector('.modal-ok').addEventListener('click', () => cleanup(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(input.value);
      if (e.key === 'Escape') cleanup(null);
    });
    root.querySelector('.modal-overlay').addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) cleanup(null); });
  });
}

// ---------- Chuyen man hinh (sidebar nav + man hinh phu nhu xem truoc Page) ----------
function switchView(viewName, title) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === viewName));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === viewName));
  $('#viewTitle').textContent = title;
}
document.querySelectorAll('.nav-item').forEach((btn) =>
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view, btn.dataset.title || btn.textContent.trim());
    closeSidebar();
  })
);

// ---------- Menu keo (drawer) cho man hinh dien thoai ----------
function openSidebar() {
  document.querySelector('.app-shell').classList.add('sidebar-open');
}
function closeSidebar() {
  document.querySelector('.app-shell').classList.remove('sidebar-open');
}
$('#btnOpenSidebar').addEventListener('click', openSidebar);
$('#btnCloseSidebar').addEventListener('click', closeSidebar);
$('#sidebarBackdrop').addEventListener('click', closeSidebar);

let currentStatusFilter = '';

const UNGROUPED = 'Chưa phân loại';
let lastLoadedPages = [];
let currentGroupFilter = '';

async function loadPages() {
  const res = await fetch('/api/pages');
  lastLoadedPages = await res.json();
  renderGroupFilter(lastLoadedPages);
  renderPageList(lastLoadedPages);
  renderPagePicker(lastLoadedPages);
  loadGroupsManager();
}

async function loadGroupsManager() {
  const res = await fetch('/api/groups');
  const groups = await res.json();
  const list = $('#groupManagerList');

  list.innerHTML =
    groups
      .map(
        (g) => `<li>
        <span><strong>${escapeHtml(g.name)}</strong> — ${g.count} Page</span>
        <span class="li-actions">
          <button data-name="${escapeHtml(g.name)}" class="renameGroupBtn">✏️ Đổi tên</button>
          <button data-name="${escapeHtml(g.name)}" class="deleteGroupBtn">🗑️ Xoá nhóm</button>
        </span>
      </li>`
      )
      .join('') || '<li>Chưa có nhóm nào — gán nhóm cho Page bên dưới để tạo nhóm mới.</li>';

  list.querySelectorAll('.renameGroupBtn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const oldName = btn.dataset.name;
      const newName = ((await customPrompt(`Đổi tên nhóm "${oldName}" thành:`, oldName)) || '').trim();
      if (!newName || newName === oldName) return;
      const res = await fetch(`/api/groups/${encodeURIComponent(oldName)}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error);
      loadPages();
    })
  );
  list.querySelectorAll('.deleteGroupBtn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (!(await customConfirm(`Xoá nhóm "${name}"? Các Page trong nhóm sẽ chuyển về "Chưa phân loại" (không xoá Page).`))) return;
      await fetch(`/api/groups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      loadPages();
    })
  );
}

function renderGroupFilter(pages) {
  const groups = Array.from(new Set(pages.map((p) => p.group || ''))).filter(Boolean).sort();
  const sel = $('#groupFilter');
  const prevValue = sel.value;
  sel.innerHTML =
    '<option value="">Tất cả</option>' +
    groups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
  sel.value = groups.includes(prevValue) ? prevValue : '';
  currentGroupFilter = sel.value;
}

function renderPageList(pages) {
  const groups = Array.from(new Set(pages.map((p) => p.group || ''))).filter(Boolean).sort();
  const visible = currentGroupFilter ? pages.filter((p) => (p.group || '') === currentGroupFilter) : pages;

  const list = $('#pageList');

  const renderItem = (p) => {
    const groupOptions =
      `<option value="">${UNGROUPED}</option>` +
      groups.map((g) => `<option value="${escapeHtml(g)}" ${g === p.group ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('') +
      `<option value="__new__">+ Nhóm mới...</option>`;
    return `<li>
      <span><strong>${escapeHtml(p.name)}</strong> — ID: ${escapeHtml(p.page_id)}</span>
      <span class="li-actions">
        <select class="pageGroupSelect" data-id="${p.id}" title="Đổi nhóm">${groupOptions}</select>
        <button data-id="${p.id}" data-name="${escapeHtml(p.name)}" class="viewPage">👁️ Xem</button>
        <a href="https://www.facebook.com/${escapeHtml(p.page_id)}" target="_blank" rel="noopener" class="openFbLink">↗ Facebook</a>
        <button data-id="${p.id}" class="removePage">Xoá</button>
      </span>
    </li>`;
  };

  if (!visible.length) {
    list.innerHTML = '<li>Không có Page nào trong nhóm này.</li>';
  } else if (currentGroupFilter) {
    // Da loc theo 1 nhom cu the -> khong can chia khoi nua, hien phang cho gon
    list.innerHTML = visible.map(renderItem).join('');
  } else {
    // Xem "Tat ca" -> chia thanh tung khoi theo nhom, giong cach nhom o man Soan bai
    const byGroup = {};
    visible.forEach((p) => {
      const g = p.group || UNGROUPED;
      (byGroup[g] = byGroup[g] || []).push(p);
    });
    const groupNames = Object.keys(byGroup).sort((a, b) => (a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b)));
    list.innerHTML = groupNames
      .map(
        (g) =>
          `<li class="list-group-header">${escapeHtml(g)} <span class="hint" style="margin:0">(${byGroup[g].length} Page)</span></li>` +
          byGroup[g].map(renderItem).join('')
      )
      .join('');
  }

  list.querySelectorAll('.viewPage').forEach((btn) =>
    btn.addEventListener('click', () => openPagePreview(btn.dataset.id, btn.dataset.name))
  );
  list.querySelectorAll('.removePage').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!(await customConfirm('Xoá Page này?'))) return;
      await fetch(`/api/pages/${btn.dataset.id}`, { method: 'DELETE' });
      loadPages();
    })
  );
  list.querySelectorAll('.pageGroupSelect').forEach((sel) =>
    sel.addEventListener('change', async () => {
      let group = sel.value;
      if (group === '__new__') {
        group = ((await customPrompt('Tên nhóm mới (vd: Susi Hair, Nam Hair, Vera...):')) || '').trim();
        if (!group) return loadPages();
      }
      await fetch(`/api/pages/${sel.dataset.id}/group`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group }),
      });
      loadPages();
    })
  );
}

function renderPagePicker(pages) {
  const pickerList = $('#postPageList');
  if (!pages.length) {
    pickerList.innerHTML = '<div class="empty">Chưa có Page nào — thêm Page ở mục Fanpage trước.</div>';
    return;
  }
  const byGroup = {};
  pages.forEach((p) => {
    const g = p.group || UNGROUPED;
    (byGroup[g] = byGroup[g] || []).push(p);
  });
  const groupNames = Object.keys(byGroup).sort((a, b) => (a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b)));

  pickerList.innerHTML = groupNames
    .map((g) => {
      const items = byGroup[g]
        .map((p) => `<label><input type="checkbox" class="postPageCheckbox" data-group="${escapeHtml(g)}" value="${p.id}" /> ${escapeHtml(p.name)}</label>`)
        .join('');
      return `<div class="picker-group">
        <div class="picker-group-title">
          <span>${escapeHtml(g)} (${byGroup[g].length})</span>
          <button type="button" class="selectGroupBtn" data-group="${escapeHtml(g)}">Chọn cả nhóm</button>
        </div>
        ${items}
      </div>`;
    })
    .join('');

  pickerList.querySelectorAll('.selectGroupBtn').forEach((btn) =>
    btn.addEventListener('click', () => {
      const boxes = pickerList.querySelectorAll(`.postPageCheckbox[data-group="${CSS.escape(btn.dataset.group)}"]`);
      const allChecked = Array.from(boxes).every((cb) => cb.checked);
      boxes.forEach((cb) => (cb.checked = !allChecked));
    })
  );
}

let lastLoadedPosts = [];

function renderImageCell(post) {
  if (post.video_url) return '🎬 Video';
  if (post.image_url) return `<a href="${escapeHtml(post.image_url)}" target="_blank" rel="noopener">🖼️ link</a>`;
  if (post.image_path) {
    // Chi hien thumbnail neu file nam trong thu muc uploads/ cua app (duong dan
    // tuong doi phuc vu duoc qua static). Anh local ngoai app (vd D:\...) chi hien icon.
    const normalized = post.image_path.replace(/\\/g, '/');
    if (normalized.startsWith('uploads/')) return `<img class="thumb" src="/${normalized}" />`;
    return '🖼️ (ảnh local)';
  }
  return '—';
}

function toDatetimeLocalValue(utcStr) {
  // utcStr dang 'YYYY-MM-DD HH:MM:SS' (UTC) -> tra ve gia tri cho input datetime-local
  // theo gio dia phuong trinh duyet, dang 'YYYY-MM-DDTHH:MM'
  const d = new Date(utcStr.replace(' ', 'T') + 'Z');
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const POSTS_PER_PAGE = 30;
let currentPostsPage = 1;

async function loadPosts() {
  const url = currentStatusFilter ? `/api/posts?status=${currentStatusFilter}` : '/api/posts';
  const res = await fetch(url);
  const posts = await res.json();
  lastLoadedPosts = posts;
  if (currentPostsPage > Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE))) currentPostsPage = 1;
  renderPostsTable(posts);
  if (typeof loadDashboard === 'function') loadDashboard();
}

function renderPagination(totalItems, perPage, currentPage, onChange) {
  const el = $('#postsPagination');
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  if (totalPages <= 1) {
    el.innerHTML = '';
    return;
  }

  const pageBtn = (p, label, disabled, active) =>
    `<button type="button" class="page-btn${active ? ' active' : ''}" data-page="${p}" ${disabled ? 'disabled' : ''}>${label}</button>`;

  let pages = [];
  const addRange = (from, to) => { for (let i = from; i <= to; i++) pages.push(i); };
  if (totalPages <= 7) {
    addRange(1, totalPages);
  } else if (currentPage <= 4) {
    addRange(1, 5);
    pages.push('…', totalPages);
  } else if (currentPage >= totalPages - 3) {
    pages.push(1, '…');
    addRange(totalPages - 4, totalPages);
  } else {
    pages.push(1, '…');
    addRange(currentPage - 1, currentPage + 1);
    pages.push('…', totalPages);
  }

  const from = (currentPage - 1) * perPage + 1;
  const to = Math.min(totalItems, currentPage * perPage);

  el.innerHTML =
    `<span class="page-info">Hiển thị ${from}-${to} / ${totalItems} bài</span>` +
    `<div class="page-nav">` +
    pageBtn(currentPage - 1, '‹', currentPage === 1, false) +
    pages.map((p) => (p === '…' ? '<span class="page-ellipsis">…</span>' : pageBtn(p, p, false, p === currentPage))).join('') +
    pageBtn(currentPage + 1, '›', currentPage === totalPages, false) +
    `</div>`;

  el.querySelectorAll('.page-btn[data-page]:not([disabled])').forEach((btn) =>
    btn.addEventListener('click', () => onChange(Number(btn.dataset.page)))
  );
}

function renderPostsTable(allPosts) {
  const start = (currentPostsPage - 1) * POSTS_PER_PAGE;
  const posts = allPosts.slice(start, start + POSTS_PER_PAGE);

  renderPagination(allPosts.length, POSTS_PER_PAGE, currentPostsPage, (page) => {
    currentPostsPage = page;
    renderPostsTable(allPosts);
    $('.table-wrap.tall').scrollTo({ top: 0, behavior: 'smooth' });
  });

  const tbody = document.querySelector('#postsTable tbody');
  tbody.innerHTML =
    posts
      .map((post) => {
        const img = renderImageCell(post);
        const actions =
          post.status === 'pending'
            ? `<button data-id="${post.id}" class="editPost">Sửa</button> <button data-id="${post.id}" class="cancelPost">Huỷ</button>`
            : '';
        const insights = post.insights
          ? ` <small>👍${post.insights.likes ?? 0} 💬${post.insights.comments ?? 0} 🔁${post.insights.shares ?? 0}</small>`
          : '';
        const link = post.post_url ? ` <a href="${escapeHtml(post.post_url)}" target="_blank" rel="noopener">🔗</a>` : '';
        return `<tr data-row-id="${post.id}">
        <td>${escapeHtml(post.page_name)}</td>
        <td class="content-cell"><span class="content-text">${escapeHtml(post.content || '')}</span>${post.error ? `<br><small style="color:var(--danger)">${escapeHtml(post.error)}</small>` : ''}</td>
        <td>${img}</td>
        <td>${formatDate(post.scheduled_time)}</td>
        <td><span class="badge ${post.status}">${statusLabel(post.status)}</span>${insights}${link}</td>
        <td>${actions}</td>
      </tr>`;
      })
      .join('') || '<tr><td colspan="6">Chưa có bài viết nào.</td></tr>';

  tbody.querySelectorAll('.content-text').forEach((el) =>
    el.addEventListener('click', () => el.classList.toggle('expanded'))
  );
  tbody.querySelectorAll('.cancelPost').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!(await customConfirm('Huỷ bài viết đang chờ lịch này?'))) return;
      await fetch(`/api/posts/${btn.dataset.id}`, { method: 'DELETE' });
      loadPosts();
    })
  );
  tbody.querySelectorAll('.editPost').forEach((btn) =>
    btn.addEventListener('click', () => startEditPost(btn.dataset.id))
  );
}

function startEditPost(postId) {
  const post = lastLoadedPosts.find((p) => String(p.id) === String(postId));
  if (!post) return;
  const row = document.querySelector(`tr[data-row-id="${postId}"]`);
  if (!row) return;

  row.innerHTML = `
    <td>${escapeHtml(post.page_name)}</td>
    <td colspan="2"><textarea class="editContent" rows="3">${escapeHtml(post.content || '')}</textarea></td>
    <td><input type="datetime-local" class="editSchedule" value="${toDatetimeLocalValue(post.scheduled_time)}" /></td>
    <td colspan="2">
      <button class="saveEdit">💾 Lưu</button>
      <button class="cancelEdit">Huỷ sửa</button>
    </td>
  `;
  row.querySelector('.cancelEdit').addEventListener('click', () => renderPostsTable(lastLoadedPosts));
  row.querySelector('.saveEdit').addEventListener('click', async () => {
    const newContent = row.querySelector('.editContent').value.trim();
    const newSchedule = row.querySelector('.editSchedule').value;
    if (!newContent) return alert('Nội dung không được để trống.');
    const utc = new Date(newSchedule).toISOString().slice(0, 19).replace('T', ' ');
    const form = new FormData();
    form.append('content', newContent);
    form.append('scheduled_time', utc);
    const res = await fetch(`/api/posts/${postId}`, { method: 'PUT', body: form });
    const data = await res.json();
    if (!res.ok) return alert(data.error);
    loadPosts();
  });
}

function statusLabel(s) {
  return { pending: 'Đang chờ', published: 'Đã đăng', failed: 'Lỗi' }[s] || s;
}
function formatDate(s) {
  if (!s) return '';
  return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('vi-VN');
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('#groupFilter').addEventListener('change', (e) => {
  currentGroupFilter = e.target.value;
  renderPageList(lastLoadedPages);
});

$('#pageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const page_id = $('#pageId').value.trim();
  const access_token = $('#pageToken').value.trim();
  const res = await fetch('/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_id, access_token }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  $('#pageForm').reset();
  loadPages();
});

async function submitPost(publishNow) {
  const page_row_ids = Array.from(document.querySelectorAll('.postPageCheckbox:checked')).map((cb) => cb.value);
  const content = $('#postContent').value.trim();
  const imageFile = $('#postImage').files[0];
  const scheduled_time = $('#postSchedule').value;

  if (!page_row_ids.length) return alert('Hãy tick chọn ít nhất một Page.');
  if (!content && !imageFile) return alert('Nhập nội dung hoặc chọn ảnh.');
  if (!publishNow && !scheduled_time) return alert('Chọn thời gian lên lịch.');

  const form = new FormData();
  form.append('page_row_ids', JSON.stringify(page_row_ids));
  form.append('content', content);
  if (imageFile) form.append('image', imageFile);
  form.append('publish_now', publishNow ? 'true' : 'false');
  if (!publishNow) {
    // datetime-local string co "YYYY-MM-DDTHH:MM", JS tu hieu la gio dia phuong
    // trinh duyet -> Date object da luu dung thoi diem UTC ben trong, chi can
    // xuat thang ra ISO UTC, KHONG cong/tru lech mui gio lan nua (de tranh loi sai 7h)
    const utc = new Date(scheduled_time).toISOString().slice(0, 19).replace('T', ' ');
    form.append('scheduled_time', utc);
  }

  const res = await fetch('/api/posts', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) return alert(data.error);

  $('#postContent').value = '';
  $('#postImage').value = '';
  $('#postSchedule').value = '';
  document.querySelectorAll('.postPageCheckbox').forEach((cb) => (cb.checked = false));
  $('#selectAllPages').checked = false;

  loadPosts();

  const total = data.results.length;
  const okCount = data.results.filter((r) => r.ok).length;
  const failCount = total - okCount;
  let msg = publishNow
    ? `Đã đăng lên ${okCount}/${total} Page.`
    : `Đã lên lịch cho ${okCount}/${total} Page.`;
  if (failCount > 0) {
    const failNames = data.results.filter((r) => !r.ok).map((r) => `${r.page_name}: ${r.error}`).join('\n');
    msg += `\n\nLỗi ở ${failCount} Page:\n${failNames}`;
  }
  alert(msg);
}

$('#btnPublishNow').addEventListener('click', () => submitPost(true));
$('#btnScheduleNow').addEventListener('click', () => submitPost(false));
$('#selectAllPages').addEventListener('change', (e) => {
  document.querySelectorAll('.postPageCheckbox').forEach((cb) => (cb.checked = e.target.checked));
});

// ---------- Import CSV hang loat ----------

async function runCsvImport(mode) {
  const file = $('#csvFile').files[0];
  if (!file) return alert('Chọn file CSV trước.');

  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);

  const res = await fetch('/api/posts/import', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) {
    $('#csvResult').innerHTML = `<p style="color:var(--danger)">${escapeHtml(data.error)}</p>`;
    $('#btnCommitCsv').disabled = true;
    return;
  }

  const okRows = data.results.filter((r) => r.ok);
  const errRows = data.results.filter((r) => !r.ok);

  let html = `<p><strong>${data.totalRows}</strong> dòng — hợp lệ: <strong style="color:var(--success)">${okRows.length}</strong>, lỗi: <strong style="color:var(--danger)">${errRows.length}</strong>${mode === 'commit' ? `. Đã thêm vào lịch: <strong>${data.created}</strong>` : ''}</p>`;

  if (errRows.length) {
    html += `<details open><summary>Chi tiết lỗi (${errRows.length} dòng)</summary><ul class="list">`;
    html += errRows.map((r) => `<li>Dòng ${r.line}: ${escapeHtml(r.error)}</li>`).join('');
    html += '</ul></details>';
  }

  if (mode === 'preview' && okRows.length) {
    html += `<details><summary>Xem trước ${Math.min(okRows.length, 10)}/${okRows.length} dòng đầu</summary>`;
    html += '<table><thead><tr><th>Dòng</th><th>Page</th><th>Giờ đăng (UTC)</th><th>Ảnh/Video</th><th>Nội dung</th></tr></thead><tbody>';
    html += okRows
      .slice(0, 10)
      .map(
        (r) =>
          `<tr><td>${r.line}</td><td>${escapeHtml(r.page_name)}</td><td>${escapeHtml(r.scheduled_time_utc)}</td><td>${r.has_video ? '🎬 Video' : r.has_image ? '🖼️ Ảnh' : '—'}</td><td class="content-cell">${escapeHtml(r.content_preview)}</td></tr>`
      )
      .join('');
    html += '</tbody></table></details>';
  }

  $('#csvResult').innerHTML = html;
  $('#btnCommitCsv').disabled = mode !== 'preview' || okRows.length === 0;
}

$('#btnPreviewCsv').addEventListener('click', () => runCsvImport('preview'));
$('#btnCommitCsv').addEventListener('click', async () => {
  if (!(await customConfirm('Xác nhận thêm toàn bộ các dòng hợp lệ vào hàng đợi lên lịch?'))) return;
  await runCsvImport('commit');
  loadPosts();
});

document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentStatusFilter = tab.dataset.status;
    currentPostsPage = 1;
    loadPosts();
  })
);

async function checkAlerts() {
  const res = await fetch('/api/posts?status=failed');
  const failed = await res.json();
  const banner = $('#alertBanner');
  if (failed.length > 0) {
    banner.style.display = 'flex';
    banner.innerHTML = `<span>⚠️ Có <strong>${failed.length}</strong> bài đăng thất bại vĩnh viễn sau nhiều lần thử lại — kiểm tra ở tab "Lỗi" bên dưới.</span>`;
  } else {
    banner.style.display = 'none';
  }
}

$('#btnRefreshInsights').addEventListener('click', async () => {
  const btn = $('#btnRefreshInsights');
  btn.disabled = true;
  btn.textContent = '⏳ Đang cập nhật...';
  try {
    const res = await fetch('/api/posts/refresh-insights', { method: 'POST' });
    const data = await res.json();
    alert(`Đã kiểm tra ${data.checked} bài, cập nhật thành công ${data.updated} bài.${data.errors.length ? `\nLỗi ${data.errors.length} bài (có thể do bài đã bị xoá trên Facebook).` : ''}`);
    loadPosts();
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Cập nhật lượt tương tác';
  }
});

async function loadDashboard() {
  const res = await fetch('/api/dashboard');
  const data = await res.json();

  const t = data.totals;
  $('#dashboardSummary').innerHTML = `
    <div class="stat"><span class="num">${t.published}</span><span class="label">Đã đăng</span></div>
    <div class="stat"><span class="num">${t.pending}</span><span class="label">Đang chờ</span></div>
    <div class="stat"><span class="num" style="color:var(--danger)">${t.failed}</span><span class="label">Lỗi</span></div>
    <div class="stat"><span class="num">👍 ${t.likes}</span><span class="label">Tổng like</span></div>
    <div class="stat"><span class="num">💬 ${t.comments}</span><span class="label">Tổng comment</span></div>
    <div class="stat"><span class="num">🔁 ${t.shares}</span><span class="label">Tổng share</span></div>
  `;

  const tbody = document.querySelector('#dashboardTable tbody');
  tbody.innerHTML =
    data.pages
      .map((p) => {
        const lastLink = p.last_post_url
          ? `<a href="${escapeHtml(p.last_post_url)}" target="_blank" rel="noopener">${formatDate(p.last_published_at)}</a>`
          : p.last_published_at
          ? formatDate(p.last_published_at)
          : '—';
        return `<tr>
          <td>${escapeHtml(p.page_name)}</td>
          <td>${p.group ? `<span class="group-badge">${escapeHtml(p.group)}</span>` : ''}</td>
          <td>${p.total}</td>
          <td>${p.published}</td>
          <td>${p.pending}</td>
          <td>${p.failed > 0 ? `<strong style="color:var(--danger)">${p.failed}</strong>` : '0'}</td>
          <td>${p.likes}</td>
          <td>${p.comments}</td>
          <td>${p.shares}</td>
          <td>${lastLink}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="10">Chưa có dữ liệu.</td></tr>';
}

// ---------- Xem truoc 1 Page ngay trong phan mem ----------
async function openPagePreview(pageRowId, pageName) {
  switchView('page-detail', `👁️ ${pageName}`);
  const box = $('#pagePreviewContent');
  box.innerHTML = 'Đang tải...';

  try {
    const res = await fetch(`/api/pages/${pageRowId}/preview`);
    const data = await res.json();
    if (!res.ok) {
      box.innerHTML = `<p style="color:var(--danger)">${escapeHtml(data.error)}</p>`;
      return;
    }
    const p = data.profile;
    const posts = data.posts || [];

    let html = '';
    if (p.cover) html += `<div class="pp-cover" style="background-image:url('${escapeHtml(p.cover)}')"></div>`;
    html += `<div class="pp-header">`;
    if (p.picture) html += `<img class="pp-avatar" src="${escapeHtml(p.picture)}" />`;
    html += `<div>
      <h2 style="margin:0">${escapeHtml(p.name)}</h2>
      <div class="hint" style="margin:2px 0">${escapeHtml(p.category || '')}${p.fan_count != null ? ` · ${p.fan_count.toLocaleString('vi-VN')} lượt thích` : ''}</div>
      <a href="${escapeHtml(p.link)}" target="_blank" rel="noopener" class="fb-login-btn" style="padding:7px 14px;font-size:13px;margin-top:6px;display:inline-block">↗ Mở Facebook thật</a>
    </div></div>`;
    if (p.about) html += `<p style="margin-top:14px">${escapeHtml(p.about)}</p>`;

    html += `<h2 style="margin-top:22px">Bài đăng gần đây</h2>`;
    if (!posts.length) {
      html += `<p class="hint">Chưa lấy được bài đăng nào (Page mới hoặc thiếu quyền đọc bài).</p>`;
    } else {
      html += `<div class="pp-feed">`;
      html += posts
        .map(
          (post) => `<a class="pp-post" href="${escapeHtml(post.permalink_url || p.link)}" target="_blank" rel="noopener">
            ${post.full_picture ? `<img src="${escapeHtml(post.full_picture)}" />` : '<div class="pp-post-noimg">📝</div>'}
            <div class="pp-post-body">
              <div class="pp-post-msg">${escapeHtml((post.message || '(không có chữ)').slice(0, 200))}</div>
              <div class="hint" style="margin:4px 0 0">${formatDate(post.created_time ? post.created_time.replace(/\+.*/, '') : '')}</div>
            </div>
          </a>`
        )
        .join('');
      html += `</div>`;
    }

    box.innerHTML = html;
  } catch (err) {
    box.innerHTML = `<p style="color:var(--danger)">Lỗi tải dữ liệu: ${escapeHtml(err.message)}</p>`;
  }
}

$('#btnBackToPages').addEventListener('click', () => switchView('pages', '📄 Fanpage'));
$('#btnBackToConvList').addEventListener('click', () => $('.inbox-shell').classList.remove('show-thread'));

// ---------- Inbox chung (Tin nhan Messenger nhieu Page) ----------
let currentConversationId = null;
let lastLoadedConversations = [];
let currentConvStatusFilter = '';

async function loadConversations() {
  const res = await fetch('/api/conversations');
  lastLoadedConversations = await res.json();
  renderConversationList();
  updateInboxUnreadBadge();
}

document.querySelectorAll('.conv-filter-tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.conv-filter-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentConvStatusFilter = tab.dataset.filter;
    renderConversationList();
  })
);

function renderConversationList() {
  const list = $('#conversationList');
  const filtered = currentConvStatusFilter
    ? lastLoadedConversations.filter((c) => (c.status || 'chua_lam') === currentConvStatusFilter)
    : lastLoadedConversations;

  list.innerHTML =
    filtered
      .map((c) => {
        const status = c.status || 'chua_lam';
        const statusBadge =
          status === 'da_lam'
            ? '<span class="conv-status-badge da_lam">🟢 Đã làm</span>'
            : '<span class="conv-status-badge chua_lam">🟠 Chưa làm</span>';
        return `<li data-id="${c.id}" class="${c.unread ? 'unread' : ''} ${c.id === currentConversationId ? 'active' : ''}">
          <div class="conv-top">
            <span><strong>${escapeHtml(c.participant_name)}</strong></span>
            ${c.unread ? '<span class="unread-dot"></span>' : ''}
          </div>
          <div class="conv-page">${escapeHtml(c.page_name)}${c.page_group ? ` · ${escapeHtml(c.page_group)}` : ''}</div>
          <div class="conv-preview">${c.last_message_direction === 'out' ? 'Bạn: ' : ''}${escapeHtml(c.last_message_preview || '')}</div>
          ${statusBadge}
        </li>`;
      })
      .join('') || '<li class="empty">Chưa có hội thoại nào phù hợp bộ lọc.</li>';

  list.querySelectorAll('li[data-id]').forEach((li) =>
    li.addEventListener('click', () => openConversation(li.dataset.id))
  );
}

function updateInboxUnreadBadge() {
  const count = lastLoadedConversations.filter((c) => c.unread).length;
  const badge = $('#inboxUnreadBadge');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

async function openConversation(id, { switchToThreadView = true } = {}) {
  currentConversationId = id;
  renderConversationList(); // cap nhat highlight + bo dau cham chua doc tren item vua bam
  // man hinh dien thoai: chuyen sang xem hoi thoai - CHI khi nguoi dung chu dong bam mo,
  // khong lam khi day la lan lam moi tu dong ngam (neu khong se ep nguoi dung quay lai
  // man hinh chat moi 20s ke ca khi ho da bam "Quay lai" xem danh sach)
  if (switchToThreadView) $('.inbox-shell').classList.add('show-thread');

  const res = await fetch(`/api/conversations/${id}`);
  if (!res.ok) return;
  const conv = await res.json();

  $('#threadEmpty').style.display = 'none';
  $('#threadBox').style.display = 'flex';
  $('#threadTitle').textContent = conv.participant_name;
  $('#threadSubtitle').textContent = conv.page ? `Page: ${conv.page.name}` : '';
  $('#threadAiToggle').checked = !!(conv.page && conv.page.messenger_ai_enabled);
  $('#threadAiToggle').dataset.pageId = conv.page_row_id;

  const convStatus = conv.status || 'chua_lam';
  document.querySelectorAll('.status-pill').forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.status === convStatus)
  );

  const box = $('#threadMessages');
  box.innerHTML = conv.messages
    .map(
      (m) => `<div class="msg-bubble ${m.direction === 'in' ? 'msg-in' : 'msg-out'} ${m.via_ai ? 'via-ai' : ''}">
        ${escapeHtml(m.text)}
        <span class="msg-time">${formatDate(m.created_at)}${m.via_ai ? ' · 🤖 AI' : ''}</span>
      </div>`
    )
    .join('');
  box.scrollTop = box.scrollHeight;

  // Da danh dau doc phia server roi - cap nhat lai badge/list cho khop
  const idx = lastLoadedConversations.findIndex((c) => c.id === id);
  if (idx !== -1) lastLoadedConversations[idx].unread = false;
  updateInboxUnreadBadge();
}

document.querySelectorAll('.status-pill').forEach((btn) =>
  btn.addEventListener('click', async () => {
    if (!currentConversationId) return;
    const status = btn.dataset.status;
    document.querySelectorAll('.status-pill').forEach((b) => b.classList.toggle('active', b === btn));

    await fetch(`/api/conversations/${currentConversationId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    const idx = lastLoadedConversations.findIndex((c) => c.id === currentConversationId);
    if (idx !== -1) lastLoadedConversations[idx].status = status;
    renderConversationList();
  })
);

$('#threadAiToggle').addEventListener('change', async (e) => {
  const pageId = e.target.dataset.pageId;
  if (!pageId) return;
  await fetch(`/api/pages/${pageId}/messenger-ai`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: e.target.checked }),
  });
});

$('#threadReplyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentConversationId) return;
  const input = $('#threadReplyInput');
  const text = input.value.trim();
  if (!text) return;

  const res = await fetch(`/api/conversations/${currentConversationId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);

  input.value = '';
  await openConversation(currentConversationId);
  await loadConversations();
});

$('#btnSubscribeWebhook').addEventListener('click', async () => {
  const btn = $('#btnSubscribeWebhook');
  btn.disabled = true;
  btn.textContent = '⏳ Đang đăng ký...';
  try {
    const res = await fetch('/api/conversations/subscribe-webhook', { method: 'POST' });
    const data = await res.json();
    const okCount = data.results.filter((r) => r.ok).length;
    const failed = data.results.filter((r) => !r.ok);
    let msg = `Đã đăng ký thành công ${okCount}/${data.results.length} Page nhận tin nhắn realtime.`;
    if (failed.length) {
      msg += `\n\nLỗi ở ${failed.length} Page (thường do Page đó chưa đăng nhập lại để cấp quyền pages_messaging):\n`;
      msg += failed.map((r) => `- ${r.page_name}: ${r.error}`).join('\n');
    }
    alert(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔔 Đăng ký nhận tin';
  }
});

loadPages();
loadPosts();
loadDashboard();
checkAlerts();
loadConversations();
setInterval(loadConversations, 20000);
setInterval(() => {
  if (currentConversationId && document.querySelector('.view[data-view="inbox"]').classList.contains('active')) {
    openConversation(currentConversationId, { switchToThreadView: false });
  }
}, 20000);
setInterval(loadDashboard, 30000);
setInterval(loadPosts, 15000);
setInterval(checkAlerts, 30000);
