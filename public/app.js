'use strict';

/* ================= utils ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMobile = () => matchMedia('(max-width: 768px)').matches;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ICONS = {
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  pin: '<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
  bold: '<path d="M6 12h9a4 4 0 0 1 0 8H6V4h8a4 4 0 0 1 0 8"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  heading: '<path d="M6 12h12M6 20V4M18 20V4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>',
  quote: '<path d="M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  video: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const hydrateIcons = (root = document) => $$('i[data-i]', root).forEach((i) => { i.outerHTML = svg(i.dataset.i); });

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function fmtDate(iso) {
  const d = new Date(iso), now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
const fmtFull = (iso) => new Date(iso).toLocaleString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function plain(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '')
    .replace(/[#>*_`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

/* ================= state ================= */
const S = {
  token: localStorage.getItem('token'),
  notes: [],
  meta: { categories: [], tags: [], total: 0, uncategorized: 0 },
  filter: { type: 'all', value: null },
  q: '',
  current: null,
  mode: 'read',
  dirty: false,
  saving: false,
  pending: false,
  metaDirty: false,
  saveTimer: null,
  closed: JSON.parse(localStorage.getItem('closedSecs') || '{}'),
};

/* ================= api ================= */
async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const res = await fetch('/api' + path, {
    method,
    keepalive,
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { logout(); throw new Error('登入已過期，請重新登入'); }
  if (!res.ok) throw new Error(data.error || `請求失敗 (${res.status})`);
  return data;
}

/* ================= auth ================= */
function showLogin() {
  app.classList.add('hidden');
  $('#login').classList.remove('hidden');
  setTimeout(() => $('#pw').focus(), 50);
}
function logout() {
  fetch('/api/logout', { method: 'POST' }).catch(() => {});
  S.token = null;
  S.current = null;
  localStorage.removeItem('token');
  showLogin();
}
async function doLogin(e) {
  e.preventDefault();
  const btn = $('#loginBtn');
  btn.disabled = true;
  $('#loginErr').textContent = '';
  try {
    const { token } = await api('/login', { method: 'POST', body: { password: $('#pw').value } });
    S.token = token;
    localStorage.setItem('token', token);
    $('#pw').value = '';
    await start();
  } catch (err) {
    $('#loginErr').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function start() {
  $('#login').classList.add('hidden');
  app.classList.remove('hidden');
  updateListTitle();
  renderEditor();
  try {
    await Promise.all([loadMeta(), loadNotes()]);
    if (!isMobile() && S.notes[0]) openNote(S.notes[0].id);
  } catch (e) {
    if (S.token) toast(e.message);
  }
}

/* ================= theme ================= */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
  $('#hl-light').disabled = t === 'dark';
  $('#hl-dark').disabled = t !== 'dark';
  $('meta[name="theme-color"]').content = t === 'dark' ? '#191919' : '#ffffff';
  $('#themeBtn').innerHTML = svg(t === 'dark' ? 'sun' : 'moon') + `<span class="label">${t === 'dark' ? '淺色模式' : '深色模式'}</span>`;
}

/* ================= sidebar ================= */
async function loadMeta() {
  S.meta = await api('/meta');
  renderSidebar();
  $('#tagList').innerHTML = S.meta.tags.map((t) => `<option value="${esc(t.name)}">`).join('');
  if (S.current) fillCatSelect();
  updateListTitle();
}

function renderSidebar() {
  const { categories, tags, total, uncategorized } = S.meta;
  const f = S.filter;
  const isActive = (t, v) => f.type === t && String(f.value ?? '') === String(v ?? '');
  const row = (t, v, icon, label, count, extra = '') =>
    `<div class="nav-item${isActive(t, v) ? ' active' : ''}" data-type="${t}" data-value="${esc(v ?? '')}">${svg(icon)}<span class="label">${esc(label)}</span>${extra}<span class="count">${count ?? ''}</span></div>`;
  const sec = (key, title, add, body) =>
    `<div class="sec${S.closed[key] ? ' closed' : ''}"><div class="sec-head" data-sec="${key}"><span class="chev">${svg('chev')}</span><span class="sec-title">${title}</span>${add}</div><div class="sec-body">${body}</div></div>`;

  const cats = categories.map((c) => row('cat', c.id, 'folder', c.name, c.count,
    `<span class="row-acts"><button class="mini" data-act="rename-cat" data-id="${c.id}" title="重命名">${svg('pencil')}</button><button class="mini" data-act="del-cat" data-id="${c.id}" title="刪除">${svg('trash')}</button></span>`
  )).join('') || '<div class="nav-empty">暫無分類</div>';
  const tagRows = tags.map((t) => row('tag', t.name, 'hash', t.name, t.count)).join('') || '<div class="nav-empty">暫無標籤</div>';

  $('#nav').innerHTML =
    row('all', '', 'file', '全部筆記', total) +
    row('uncat', '', 'inbox', '未分類', uncategorized) +
    sec('cats', '分類', `<button class="mini" data-act="add-cat" title="新建分類">${svg('plus')}</button>`, cats) +
    sec('tags', '標籤', '', tagRows);
}

function updateListTitle() {
  const f = S.filter;
  let t = '全部筆記';
  if (f.type === 'uncat') t = '未分類';
  if (f.type === 'cat') t = S.meta.categories.find((c) => String(c.id) === String(f.value))?.name || '分類';
  if (f.type === 'tag') t = '#' + f.value;
  $('#listTitle').textContent = t;
}

function setFilter(type, value) {
  S.filter = { type, value: value || null };
  renderSidebar();
  updateListTitle();
  loadNotes().catch((e) => toast(e.message));
  closeDrawer();
}

async function catAction(act, id) {
  const cat = S.meta.categories.find((c) => String(c.id) === String(id));
  try {
    if (act === 'add-cat') {
      const name = prompt('新分類名稱');
      if (!name || !name.trim()) return;
      await api('/categories', { method: 'POST', body: { name: name.trim() } });
    } else if (act === 'rename-cat') {
      const name = prompt('重命名分類', cat?.name || '');
      if (!name || !name.trim()) return;
      await api('/categories/' + id, { method: 'PUT', body: { name: name.trim() } });
    } else if (act === 'del-cat') {
      if (!confirm(`刪除分類「${cat?.name}」？其中的筆記會變為未分類。`)) return;
      await api('/categories/' + id, { method: 'DELETE' });
      if (S.filter.type === 'cat' && String(S.filter.value) === String(id)) S.filter = { type: 'all', value: null };
      if (S.current && String(S.current.category_id) === String(id)) S.current.category_id = null;
      S.notes.forEach((n) => { if (String(n.category_id) === String(id)) n.category_id = null; });
      loadNotes();
    }
    await loadMeta();
    if (S.current) updateCrumbs();
  } catch (e) {
    toast(e.message);
  }
}

/* ---- desktop collapse / mobile drawer ---- */
function toggleSide() {
  if (isMobile()) {
    app.classList.toggle('drawer-open');
  } else {
    app.classList.toggle('side-collapsed');
    localStorage.setItem('sideCollapsed', app.classList.contains('side-collapsed') ? '1' : '');
  }
}
function closeDrawer() { app.classList.remove('drawer-open'); }

/* ================= list ================= */
async function loadNotes() {
  const p = new URLSearchParams();
  const f = S.filter;
  if (f.type === 'cat') p.set('category', f.value);
  if (f.type === 'uncat') p.set('category', 'none');
  if (f.type === 'tag') p.set('tag', f.value);
  if (S.q) p.set('q', S.q);
  const { notes } = await api('/notes?' + p);
  S.notes = notes;
  renderList();
}

function sortNotes() {
  S.notes.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.updated_at) - new Date(a.updated_at)));
}
const toSummary = (n) => ({ ...n, excerpt: (n.content ?? n.excerpt ?? '').slice(0, 300) });

function renderList() {
  const el = $('#list');
  if (!S.notes.length) {
    el.innerHTML = `<div class="list-empty">${S.q ? '沒有匹配的筆記' : '這裡還沒有筆記<br>點擊右上角 + 新建'}</div>`;
    return;
  }
  el.innerHTML = S.notes.map((n) => {
    const ex = plain(n.excerpt);
    return `<div class="note-item${S.current && S.current.id === n.id ? ' active' : ''}" data-id="${n.id}">
      <div class="ni-title${n.title ? '' : ' untitled'}">${n.pinned ? `<span class="pin">${svg('pin')}</span>` : ''}<span class="t">${esc(n.title || '無標題')}</span></div>
      ${ex ? `<div class="ni-ex">${esc(ex)}</div>` : ''}
      <div class="ni-meta"><span>${fmtDate(n.updated_at)}</span>${(n.tags || []).slice(0, 3).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
    </div>`;
  }).join('');
}

function upsertSummary(note) {
  const i = S.notes.findIndex((n) => n.id === note.id);
  const s = toSummary(note);
  if (i >= 0) S.notes[i] = s; else S.notes.unshift(s);
  sortNotes();
  renderList();
}

/* ================= editor ================= */
async function openNote(id, mode) {
  await save();
  try {
    const { note } = await api('/notes/' + id);
    S.current = note;
    let m = mode || (isMobile() ? 'read' : localStorage.getItem('mode') || 'read');
    if (isMobile() && m === 'split') m = 'read';
    S.mode = m;
    renderEditor();
    renderList();
    showEditorMobile();
    $('#docScroll').scrollTop = 0;
  } catch (e) {
    toast(e.message);
  }
}

function showEditorMobile() {
  if (isMobile() && !app.classList.contains('show-editor')) {
    app.classList.add('show-editor');
    history.pushState({ editor: true }, '');
  }
}
async function closeEditor(fromPop = false) {
  await save();
  app.classList.remove('show-editor');
  S.current = null;
  renderList();
  if (!fromPop && history.state && history.state.editor) history.back();
}

function renderEditor() {
  const n = S.current;
  $('#empty').classList.toggle('hidden', !!n);
  $('#doc').classList.toggle('hidden', !n);
  ['#pinBtn', '#delBtn', '#modeSeg'].forEach((s) => $(s).classList.toggle('invisible', !n));
  if (!n) { $('#crumbs').textContent = ''; setStatus(''); return; }
  $('#title').value = n.title;
  $('#body').value = n.content;
  fillCatSelect();
  renderTags();
  $('#updated').textContent = fmtFull(n.updated_at);
  $('#pinBtn').classList.toggle('on', !!n.pinned);
  updateCrumbs();
  setStatus('');
  setMode(S.mode, false);
  requestAnimationFrame(() => autoGrow($('#title')));
}

function setMode(m, persist = true) {
  if (isMobile() && m === 'split') m = 'read';
  S.mode = m;
  const d = $('#doc');
  d.classList.remove('mode-read', 'mode-edit', 'mode-split');
  d.classList.add('mode-' + m);
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  if (m !== 'edit') renderPreview();
  if (m !== 'read') requestAnimationFrame(() => autoGrow($('#body')));
  if (persist && !isMobile()) localStorage.setItem('mode', m);
}

function autoGrow(el) {
  const sc = $('#docScroll');
  const top = sc.scrollTop;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  sc.scrollTop = top;
}

function updateCrumbs() {
  const n = S.current;
  if (!n) return;
  const cat = S.meta.categories.find((c) => c.id === n.category_id);
  $('#crumbs').innerHTML = `${cat ? esc(cat.name) + ' / ' : ''}<b>${esc(n.title || '無標題')}</b>`;
}

function fillCatSelect() {
  const n = S.current;
  $('#catSel').innerHTML = '<option value="">未分類</option>' +
    S.meta.categories.map((c) => `<option value="${c.id}"${c.id === n.category_id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}

function renderTags() {
  const box = $('#tagsBox');
  const input = $('#tagInput');
  $$('.chip', box).forEach((c) => c.remove());
  (S.current.tags || []).forEach((t) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = `${esc(t)}<button type="button" data-tag="${esc(t)}" title="移除">${svg('x')}</button>`;
    box.insertBefore(c, input);
  });
}
function addTag(v) {
  v = String(v || '').trim().replace(/^#/, '');
  $('#tagInput').value = '';
  if (!v || !S.current) return;
  if (!S.current.tags.includes(v)) {
    S.current.tags.push(v);
    renderTags();
    S.metaDirty = true;
    scheduleSave(200);
  }
}
function removeTag(v) {
  S.current.tags = S.current.tags.filter((t) => t !== v);
  renderTags();
  S.metaDirty = true;
  scheduleSave(200);
}

function setStatus(t) { $('#status').textContent = t; }

/* ---- saving ---- */
function scheduleSave(ms = 800) {
  if (!S.current) return;
  S.dirty = true;
  setStatus('編輯中…');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(save, ms);
}

async function save(opts = {}) {
  clearTimeout(S.saveTimer);
  const n = S.current;
  if (!n || !S.dirty) return;
  if (S.saving) { S.pending = true; return; }
  S.saving = true;
  S.dirty = false;
  setStatus('保存中…');
  try {
    const { note } = await api('/notes/' + n.id, {
      method: 'PUT',
      keepalive: !!opts.keepalive,
      body: { title: n.title, content: n.content, category_id: n.category_id, tags: n.tags, pinned: n.pinned },
    });
    n.updated_at = note.updated_at;
    upsertSummary(note);
    if (S.current && S.current.id === note.id) {
      $('#updated').textContent = fmtFull(note.updated_at);
      setStatus('已保存');
    }
    if (S.metaDirty) { S.metaDirty = false; loadMeta().catch(() => {}); }
  } catch (e) {
    S.dirty = true;
    setStatus('保存失敗');
    toast(e.message);
  } finally {
    S.saving = false;
    if (S.pending) { S.pending = false; save(); }
  }
}

async function newNote() {
  await save();
  try {
    const f = S.filter;
    const { note } = await api('/notes', {
      method: 'POST',
      body: {
        title: '',
        content: '',
        category_id: f.type === 'cat' ? Number(f.value) : null,
        tags: f.type === 'tag' ? [f.value] : [],
      },
    });
    S.notes.unshift(toSummary(note));
    sortNotes();
    S.current = note;
    S.mode = 'edit';
    renderEditor();
    renderList();
    showEditorMobile();
    closeDrawer();
    $('#title').focus();
    loadMeta().catch(() => {});
  } catch (e) {
    toast(e.message);
  }
}

async function deleteNote() {
  const n = S.current;
  if (!n || !confirm(`刪除「${n.title || '無標題'}」？此操作無法撤銷。`)) return;
  clearTimeout(S.saveTimer);
  S.dirty = false;
  try {
    await api('/notes/' + n.id, { method: 'DELETE' });
    S.notes = S.notes.filter((x) => x.id !== n.id);
    S.current = null;
    toast('已刪除');
    if (isMobile()) closeEditor();
    else if (S.notes[0]) openNote(S.notes[0].id);
    else { renderEditor(); renderList(); }
    loadMeta().catch(() => {});
  } catch (e) {
    toast(e.message);
  }
}

/* ================= markdown + media ================= */
const VIDEO_RE = /\.(mp4|webm|ogv|mov|m4v|mkv)(\?.*)?(#.*)?$/i;
const AUDIO_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)(\?.*)?(#.*)?$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?.*)?(#.*)?$/i;
const IFRAME_OK = /^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/|player\.bilibili\.com\/player\.html|open\.spotify\.com\/embed\/|w\.soundcloud\.com\/player\/)/i;
const isHttp = (u) => /^https?:\/\//i.test(u);
const isOwnFile = (u) => /^\/api\/files\//.test(u);

function embedUrl(u) {
  let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i))) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/i))) return `https://player.vimeo.com/video/${m[1]}`;
  if ((m = u.match(/bilibili\.com\/video\/(BV[\w]+)/i))) return `https://player.bilibili.com/player.html?bvid=${m[1]}&autoplay=0&high_quality=1`;
  if ((m = u.match(/open\.spotify\.com\/(track|album|playlist|episode|show)\/(\w+)/i))) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
  return null;
}
function mediaKind(u) {
  if (embedUrl(u)) return 'embed';
  if (VIDEO_RE.test(u)) return 'video';
  if (AUDIO_RE.test(u)) return 'audio';
  if (IMAGE_RE.test(u)) return 'image';
  return 'link';
}
function makeMedia(kind, src) {
  if (!isHttp(src) && !isOwnFile(src)) return null;
  if (kind === 'embed') {
    const w = document.createElement('div');
    w.className = 'embed';
    const f = document.createElement('iframe');
    f.src = embedUrl(src) || src;
    f.loading = 'lazy';
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    w.appendChild(f);
    return w;
  }
  if (kind === 'video' || kind === 'audio') {
    const el = document.createElement(kind);
    el.controls = true;
    el.preload = 'metadata';
    if (kind === 'video') el.playsInline = true;
    el.src = src;
    return el;
  }
  if (kind === 'image') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    return img;
  }
  return null;
}

marked.setOptions({ gfm: true, breaks: true });
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && (isHttp(node.getAttribute('href') || '') || isOwnFile(node.getAttribute('href') || ''))) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});
const PURIFY = {
  ADD_TAGS: ['iframe', 'video', 'audio', 'source', 'track'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'controls', 'target', 'loading', 'playsinline', 'preload', 'poster', 'loop', 'muted'],
};

function renderMarkdown(md) {
  const root = document.createElement('div');
  root.innerHTML = DOMPurify.sanitize(marked.parse(md || ''), PURIFY);

  // 只允許白名單 iframe
  $$('iframe', root).forEach((f) => { if (!IFRAME_OK.test(f.getAttribute('src') || '')) f.remove(); });

  // ![](url) / ![audio](url) / ![video](url)
  $$('img', root).forEach((img) => {
    const src = img.getAttribute('src') || '';
    const alt = (img.getAttribute('alt') || '').trim().toLowerCase();
    let kind = embedUrl(src) ? 'embed' : alt === 'video' ? 'video' : alt === 'audio' ? 'audio' : mediaKind(src);
    if (kind === 'link') kind = 'image';
    if (kind === 'image') {
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer'; // 避免部分圖床防盜鏈
      return;
    }
    const el = makeMedia(kind, src);
    if (el) img.replaceWith(el);
  });

  // 單獨貼的媒體鏈接（自動鏈接，文字=網址）
  $$('a', root).forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (a.textContent.trim() !== href || a.querySelector('img')) return;
    const kind = mediaKind(href);
    if (kind === 'link') return;
    const el = makeMedia(kind, href);
    if (el) {
      if (kind === 'image') { el.loading = 'lazy'; el.referrerPolicy = 'no-referrer'; }
      a.replaceWith(el);
    }
  });

  // 代碼高亮
  if (window.hljs) $$('pre code', root).forEach((c) => { try { hljs.highlightElement(c); } catch {} });

  // 待辦可在閱讀模式直接勾選
  $$('input[type="checkbox"]', root).forEach((c) => c.removeAttribute('disabled'));
  return root;
}

function renderPreview() {
  const n = S.current;
  const p = $('#preview');
  if (!n) return;
  p.innerHTML = '';
  if (!n.content.trim()) {
    p.innerHTML = '<p class="placeholder">空白筆記。切換到編輯模式開始書寫。</p>';
    return;
  }
  const frag = renderMarkdown(n.content);
  while (frag.firstChild) p.appendChild(frag.firstChild);
}
const renderPreviewSoon = debounce(renderPreview, 200);

function toggleTask(idx) {
  let i = 0;
  const n = S.current;
  n.content = n.content.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/gm, (m, pre, c) =>
    (i++ === idx ? pre + (c === ' ' ? '[x]' : '[ ]') : m));
  $('#body').value = n.content;
  scheduleSave(400);
}

/* ================= toolbar ================= */
function emitInput() { $('#body').dispatchEvent(new Event('input')); }
function wrap(before, after, ph) {
  const t = $('#body');
  const s = t.selectionStart, e = t.selectionEnd;
  const sel = t.value.slice(s, e) || ph;
  t.focus();
  t.setRangeText(before + sel + after, s, e, 'end');
  t.selectionStart = s + before.length;
  t.selectionEnd = s + before.length + sel.length;
  emitInput();
}
function linePrefix(p) {
  const t = $('#body');
  const s = t.selectionStart, e = t.selectionEnd;
  const ls = t.value.lastIndexOf('\n', s - 1) + 1;
  const out = t.value.slice(ls, e).split('\n').map((l) => p + l).join('\n');
  t.focus();
  t.setRangeText(out, ls, e, 'end');
  emitInput();
}
function insertText(txt) {
  const t = $('#body');
  t.focus();
  t.setRangeText(txt, t.selectionStart, t.selectionEnd, 'end');
  emitInput();
}
function insertMedia(kind) {
  const label = { image: '圖片', audio: '音頻（mp3 / m4a / wav…）', video: '視頻（mp4 / webm，或 YouTube / Bilibili / Vimeo 鏈接）' }[kind];
  const u = prompt(label + ' URL');
  if (!u || !u.trim()) return;
  insertText(kind === 'image' ? `![](${u.trim()})` : `\n![${kind}](${u.trim()})\n`);
}
/* ---- 上傳到 Neon Object Storage ---- */
let upSeq = 0;
function pickFiles() {
  if (S.meta.storage && !S.meta.storage.enabled) { toast('尚未設定 Neon Object Storage，請在 Netlify 加上 NEON_S3_* 變量'); return; }
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.multiple = true;
  inp.accept = 'image/*,video/*,audio/*,*/*';
  inp.onchange = () => uploadFiles([...inp.files]);
  inp.click();
}
function mdFor(file, url) {
  const name = (file.name || 'file').replace(/[\[\]()\n]/g, ' ').trim();
  const t = file.type || '';
  if (t.startsWith('image/')) return `![${name}](${url})`;
  if (t.startsWith('video/')) return `\n![video](${url})\n`;
  if (t.startsWith('audio/')) return `\n![audio](${url})\n`;
  return `[📎 ${name}](${url})`;
}
function putWithProgress(url, file, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    Object.entries(headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(Object.assign(new Error(`上傳失敗 (${x.status})`), { status: x.status })));
    x.onerror = () => reject(Object.assign(new Error('網絡錯誤'), { status: 0 }));
    x.send(file);
  });
}
let remoteChain = Promise.resolve();
async function replacePlaceholder(note, ph, text) {
  if (S.current && S.current.id === note.id) {
    const t = $('#body');
    const i = t.value.indexOf(ph);
    if (i < 0) return;
    const j = i + ph.length;
    const d = text.length - ph.length;
    // 自行維護游標，避免 'preserve' 把游標移到插入點前面
    const fix = (p) => (p >= j ? p + d : p > i ? i + text.length : p);
    const ss = fix(t.selectionStart), se = fix(t.selectionEnd);
    t.value = t.value.slice(0, i) + text + t.value.slice(j);
    t.setSelectionRange(ss, se);
    t.dispatchEvent(new Event('input'));
    if (S.mode !== 'edit') renderPreviewSoon();
    return;
  }
  // 上傳期間切換了筆記：依序改寫那篇（避免多個上傳互相覆蓋）
  remoteChain = remoteChain.then(async () => {
    try {
      const { note: fresh } = await api('/notes/' + note.id);
      if (fresh.content.includes(ph)) {
        const { note: saved } = await api('/notes/' + note.id, { method: 'PUT', body: { content: fresh.content.replace(ph, text) } });
        upsertSummary(saved);
      }
    } catch (e) { toast(e.message); }
  });
  return remoteChain;
}
async function uploadOne(file, note, ph) {
  try {
    const up = await api('/uploads', { method: 'POST', body: { name: file.name, type: file.type, size: file.size } });
    const show = (p) => setStatus(`上傳 ${file.name} ${Math.round(p * 100)}%`);
    let done = false;
    if (up.uploadUrl) {
      try { await putWithProgress(up.uploadUrl, file, up.headers, show); done = true; }
      catch (e) { if (e.status !== 0 || file.size > up.proxyMax) throw e; }
    }
    if (!done) {
      if (file.size > up.proxyMax) throw new Error('無法直傳到 Neon（CORS 未設定），且文件超過中轉上限 4 MB');
      await putWithProgress('/api/uploads/' + encodeURIComponent(up.key), file,
        { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + S.token }, show);
    }
    await replacePlaceholder(note, ph, mdFor(file, up.url).trim());
    return true;
  } catch (e) {
    await replacePlaceholder(note, ph, '');
    toast(`${file.name}：${e.message}`);
    return false;
  }
}
async function uploadFiles(files) {
  const note = S.current;
  if (!note || !files.length) return;
  const maxMb = (S.meta.storage && S.meta.storage.maxMb) || 200;
  const ok = files.filter((f) => {
    if (f.size <= maxMb * 1024 * 1024) return true;
    toast(`${f.name} 超過 ${maxMb} MB 上限`);
    return false;
  });
  if (!ok.length) return;
  if (S.mode === 'read') setMode('edit');
  // 一次插入全部佔位符（按選擇順序，每個一行），之後各自替換
  const jobs = ok.map((f) => ({ f, ph: `‹上傳中 ${f.name || 'file'} #${++upSeq}›` }));
  const t = $('#body');
  const before = t.value.slice(0, t.selectionStart);
  const after = t.value.slice(t.selectionEnd);
  const multi = jobs.length > 1;
  const lead = multi && before && !before.endsWith('\n') ? '\n' : '';
  const tail = multi && after && !after.startsWith('\n') ? '\n' : '';
  insertText(lead + jobs.map((j) => j.ph).join('\n') + tail);
  // 最多同時 3 個
  let next = 0, okCount = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      if (await uploadOne(j.f, note, j.ph)) okCount++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
  setStatus(okCount === jobs.length ? `已上傳 ${okCount} 個文件` : `已上傳 ${okCount}/${jobs.length}`);
}

const CMDS = {
  heading: () => linePrefix('## '),
  bold: () => wrap('**', '**', '粗體'),
  italic: () => wrap('*', '*', '斜體'),
  list: () => linePrefix('- '),
  check: () => linePrefix('- [ ] '),
  quote: () => linePrefix('> '),
  code: () => wrap('\n```\n', '\n```\n', 'code'),
  table: () => insertText('\n| 欄位 1 | 欄位 2 |\n| --- | --- |\n|  |  |\n'),
  link: () => { const u = prompt('鏈接地址'); if (u) wrap('[', `](${u.trim()})`, '鏈接文字'); },
  image: () => insertMedia('image'),
  audio: () => insertMedia('audio'),
  video: () => insertMedia('video'),
  upload: () => pickFiles(),
};

/* ================= events ================= */
function bind() {
  $('#loginForm').addEventListener('submit', doLogin);
  $('#logoutBtn').addEventListener('click', async () => { await save(); logout(); });
  $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#toggleSide').addEventListener('click', toggleSide);
  $('#collapseSide').addEventListener('click', toggleSide);
  $('#scrim').addEventListener('click', closeDrawer);
  $('#newNote').addEventListener('click', newNote);
  $('#emptyNew').addEventListener('click', newNote);
  $('#backBtn').addEventListener('click', () => closeEditor());
  $('#pinBtn').addEventListener('click', () => {
    if (!S.current) return;
    S.current.pinned = !S.current.pinned;
    $('#pinBtn').classList.toggle('on', S.current.pinned);
    scheduleSave(0);
  });
  $('#delBtn').addEventListener('click', deleteNote);
  $$('#modeSeg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  // sidebar
  $('#nav').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) { e.stopPropagation(); catAction(act.dataset.act, act.dataset.id); return; }
    const head = e.target.closest('.sec-head');
    if (head) {
      const k = head.dataset.sec;
      S.closed[k] = !S.closed[k];
      localStorage.setItem('closedSecs', JSON.stringify(S.closed));
      head.parentElement.classList.toggle('closed', S.closed[k]);
      return;
    }
    const it = e.target.closest('.nav-item');
    if (it) setFilter(it.dataset.type, it.dataset.value);
  });

  // list
  $('#list').addEventListener('click', (e) => {
    const it = e.target.closest('.note-item');
    if (!it) return;
    const id = Number(it.dataset.id);
    if (S.current && S.current.id === id) { showEditorMobile(); return; }
    openNote(id);
  });
  $('#search').addEventListener('input', debounce((e) => {
    S.q = e.target.value.trim();
    loadNotes().catch((err) => toast(err.message));
  }, 300));

  // editor fields
  $('#title').addEventListener('input', (e) => {
    S.current.title = e.target.value.replace(/\n/g, ' ');
    autoGrow(e.target);
    updateCrumbs();
    scheduleSave();
  });
  $('#title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (S.mode === 'read') setMode('edit');
      const b = $('#body');
      b.focus();
      b.setSelectionRange(0, 0);
    }
  });
  $('#body').addEventListener('input', () => {
    S.current.content = $('#body').value;
    autoGrow($('#body'));
    scheduleSave();
    if (S.mode === 'split') renderPreviewSoon();
  });
  $('#body').addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Tab' && !mod) { e.preventDefault(); insertText('  '); }
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); CMDS.bold(); }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); CMDS.italic(); }
  });
  // 貼上 / 拖入文件直接上傳
  $('#body').addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length || !S.meta.storage?.enabled) return;
    e.preventDefault();
    uploadFiles(files);
  });
  $('#body').addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  $('#body').addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    if (!S.meta.storage?.enabled) { toast('尚未設定 Neon Object Storage'); return; }
    $('#body').focus();
    uploadFiles(files);
  });
  $('#catSel').addEventListener('change', (e) => {
    S.current.category_id = e.target.value ? Number(e.target.value) : null;
    updateCrumbs();
    S.metaDirty = true;
    scheduleSave(0);
  });
  $('#tagsBox').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tag]');
    if (b) removeTag(b.dataset.tag); else $('#tagInput').focus();
  });
  $('#tagInput').addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') { e.preventDefault(); addTag(e.target.value); }
    else if (e.key === 'Backspace' && !e.target.value && S.current.tags.length) removeTag(S.current.tags[S.current.tags.length - 1]);
  });
  $('#tagInput').addEventListener('change', (e) => { if (S.current.tags.includes(e.target.value.trim())) e.target.value = ''; });
  $('#tagInput').addEventListener('blur', (e) => addTag(e.target.value));

  // toolbar
  $('#toolbar').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  $('#toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cmd]');
    if (b && CMDS[b.dataset.cmd]) CMDS[b.dataset.cmd]();
  });

  // preview interactions
  $('#preview').addEventListener('click', (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (cb) { toggleTask($$('#preview input[type="checkbox"]').indexOf(cb)); return; }
    const img = e.target.closest('img');
    if (img && !img.closest('a')) {
      $('#lightbox img').src = img.src;
      $('#lightbox').classList.remove('hidden');
    }
  });
  $('#preview').addEventListener('dblclick', (e) => {
    if (S.mode === 'read' && !e.target.closest('a,video,audio,iframe,input')) setMode('edit');
  });
  $('#lightbox').addEventListener('click', () => $('#lightbox').classList.add('hidden'));

  // shortcuts
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); if (S.current) { S.dirty = true; save(); } }
    else if (mod && k === 'e' && S.current) { e.preventDefault(); setMode(S.mode === 'read' ? 'edit' : 'read'); }
    else if (e.altKey && k === 'n' && S.token) { e.preventDefault(); newNote(); }
    else if (mod && k === '\\') { e.preventDefault(); toggleSide(); }
    else if (e.key === 'Escape') { $('#lightbox').classList.add('hidden'); closeDrawer(); }
  });

  // mobile back button
  window.addEventListener('popstate', () => {
    if (app.classList.contains('show-editor')) closeEditor(true);
  });

  // save before leaving
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save({ keepalive: true }); });
  window.addEventListener('beforeunload', (e) => {
    if (S.dirty) { save({ keepalive: true }); e.preventDefault(); e.returnValue = ''; }
  });

  // breakpoint changes
  matchMedia('(max-width: 768px)').addEventListener('change', (mq) => {
    if (!mq.matches) {
      app.classList.remove('drawer-open', 'show-editor');
    } else {
      if (S.mode === 'split') setMode('read', false);
      if (S.current) app.classList.add('show-editor');
    }
  });
}

/* ================= boot ================= */
hydrateIcons();
applyTheme(document.documentElement.dataset.theme || 'light');
if (localStorage.getItem('sideCollapsed')) app.classList.add('side-collapsed');
bind();
if (S.token) start(); else showLogin();
