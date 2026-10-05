// Legacy X content editor. Signs in with Supabase Auth, edits cms_blocks / cms_items,
// and asks Netlify to rebuild the site when the admin presses Publish.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { mountEvents } from './events-admin.js';

const cfg = window.CMS_CONFIG || {};
const $ = (id) => document.getElementById(id);

// Sidebar order; anything not listed is appended alphabetically.
const PAGE_ORDER = [
  'site', 'index', 'about', 'our-lineage', 'etiquette', 'programs',
  'programs/adult-jiu-jitsu', 'programs/kids-jiu-jitsu', 'programs/womens-only',
  'programs/jiu-jitsu-over-55', 'programs/competition', 'programs/private-lessons',
  'corporate', 'schedule', 'instructors', 'events', 'faq', 'contact', 'privacy', 'terms',
];
const WORDS = {
  meta: 'Page info', title: 'Browser tab title', description: 'Search engine description', main: 'Main',
  'placeholder-event-3': 'No events message',
  mosaic: 'Gallery photos', 'mosaic-photo': 'Photo', 'mosaic-cell-label': 'Caption',
  'mosaic-placeholder-text': 'Placeholder text (shown when there is no photo)',
};
const EVENTS_LABEL = 'View Events / Add Events';

const humanize = (s) => WORDS[s] || s.replace(/-(\d+)$/, ' $1').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const keyParts = (key) => { const p = key.split('/'); return { section: p.at(-2), name: p.at(-1) }; };
const plain = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const pageUrl = (page) => (page === 'site' || page === 'index' ? '/' : `/${page}.html`);

let sb;
let pages = [];
let current = null;
let blocks = []; // { key, position, value, original }
let lists = []; // { key, position, fields: [], items: [{ id, tpl, fields, dirty }] }
let deleted = [];
let eventsUI;
const EVENTS = '__events';

// ── Status helpers ──
function setStatus(text, kind = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${kind}`;
}
function loginMsg(text, kind = 'err') {
  $('login-msg').textContent = text;
  $('login-msg').className = `msg ${kind}`;
}
const isDirty = () => blocks.some((b) => b.value !== b.original)
  || lists.some((l) => l.items.some((it) => it.dirty || !it.id)) || deleted.length > 0;
function refreshDirty() {
  const dirty = isDirty();
  $('save-btn').disabled = !dirty;
  if (dirty) setStatus('Unsaved changes', 'warn');
}

// ── Auth ──
function showLogin(recovery = false) {
  $('app').hidden = true;
  $('login').hidden = false;
  $('signin-form').hidden = recovery;
  $('newpass-form').hidden = !recovery;
  $('login-title').textContent = recovery ? 'Set a new password' : 'Admin sign in';
  $('login-sub').textContent = recovery ? 'Choose a new password for your admin account.' : "Edit the website's content.";
}

async function enterApp(session) {
  const { data, error } = await sb.from('cms_admins').select('email');
  if (error || !data?.length) {
    await sb.auth.signOut();
    showLogin();
    loginMsg("This account doesn't have admin access.");
    return;
  }
  $('who').textContent = session.user.email;
  $('login').hidden = true;
  $('app').hidden = false;
  eventsUI = mountEvents({ sb, root: $('events-view'), setStatus });
  await loadPages();
  const wanted = decodeURIComponent(location.hash.slice(1));
  await openPage(wanted === EVENTS || pages.some((p) => p.id === wanted) ? wanted : 'index');
}

async function init() {
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    showLogin();
    loginMsg('The admin is not connected to Supabase yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify and redeploy.');
    $('signin-form').hidden = true;
    return;
  }
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const recovery = location.hash.includes('type=recovery');

  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showLogin(true);
  });

  const { data: { session } } = await sb.auth.getSession();
  if (recovery) showLogin(true);
  else if (session) await enterApp(session);
  else showLogin();
}

$('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMsg('Signing in…', '');
  const { data, error } = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) return loginMsg(error.message);
  loginMsg('');
  $('password').value = '';
  await enterApp(data.session);
});

$('forgot-btn').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!email) return loginMsg('Enter your email first, then press "Forgot password?".');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin/` });
  loginMsg(error ? error.message : 'Check your email for a link to reset your password.', error ? 'err' : 'ok');
});

$('newpass-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $('newpass').value });
  if (error) return loginMsg(error.message);
  history.replaceState(null, '', location.pathname);
  $('newpass').value = '';
  loginMsg('Password updated.', 'ok');
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enterApp(session);
});

$('signout-btn').addEventListener('click', async () => {
  if (isDirty() && !confirm('You have unsaved changes. Sign out anyway?')) return;
  await sb.auth.signOut();
  blocks = []; lists = []; deleted = [];
  showLogin();
  loginMsg('Signed out.', 'ok');
});

// ── Pages ──
async function loadPages() {
  const [{ data: rows, error }, { data: listRows }] = await Promise.all([
    sb.from('cms_blocks').select('page,key,value'),
    sb.from('cms_lists').select('page'),
  ]);
  if (error) return setStatus(`Could not load pages: ${error.message}`, 'err');

  const titles = {};
  for (const r of rows) {
    if (r.key.endsWith('/meta/title')) titles[r.page] = plain(r.value).replace(/\s+[—–|-]\s+Legacy X.*$/i, '');
  }
  const ids = [...new Set([...rows, ...(listRows || [])].map((r) => r.page))];
  ids.sort((a, b) => {
    const ia = PAGE_ORDER.indexOf(a); const ib = PAGE_ORDER.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });
  pages = ids.map((id) => ({
    id,
    name: id === 'site' ? 'Site-wide (footer)' : id === 'index' ? 'Home' : titles[id] || humanize(id.split('/').at(-1)),
  }));

  // The event manager sits right under the Events page, like a sub-page.
  const link = (id, name, sub) => {
    const b = document.createElement('button');
    b.className = `page-link${sub ? ' sub' : ''}`;
    b.textContent = name;
    b.dataset.page = id;
    b.addEventListener('click', () => openPage(id));
    return b;
  };
  const entries = pages.flatMap((p) => (p.id === 'events'
    ? [[p.id, p.name, false], [EVENTS, EVENTS_LABEL, true]]
    : [[p.id, p.name, p.id.startsWith('programs/')]]));
  $('page-nav').replaceChildren(...entries.map(([id, name, sub]) => link(id, name, sub)));
  $('page-select').replaceChildren(...entries.map(([id, name, sub]) => new Option(sub ? `— ${name}` : name, id)));
}

$('page-select').addEventListener('change', (e) => openPage(e.target.value));

async function openPage(id) {
  if (current && id !== current && isDirty() && !confirm('You have unsaved changes on this page. Leave without saving?')) {
    $('page-select').value = current;
    return;
  }
  current = id;
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  $('page-select').value = id;
  $('events-view').hidden = id !== EVENTS;
  $('pages-view').hidden = id === EVENTS;
  document.querySelectorAll('.page-link').forEach((b) => b.classList.toggle('active', b.dataset.page === id));
  if (id === EVENTS) {
    blocks = []; lists = []; deleted = [];
    refreshDirty();
    setStatus('');
    return eventsUI.show();
  }
  const page = pages.find((p) => p.id === id);
  $('page-title').textContent = page?.name || id;
  $('page-view').href = pageUrl(id);
  $('page-select').value = id;
  $('filter').value = '';
  $('editor').innerHTML = '<p class="loading">Loading…</p>';

  const [{ data: bRows, error: bErr }, { data: lRows, error: lErr }] = await Promise.all([
    sb.from('cms_blocks').select('key,position,value').eq('page', id).order('position'),
    sb.from('cms_lists').select('key,position,fields').eq('page', id).order('position'),
  ]);
  if (bErr || lErr) return setStatus(`Could not load page: ${(bErr || lErr).message}`, 'err');

  let items = [];
  if (lRows.length) {
    const { data, error } = await sb.from('cms_items').select('id,list_key,tpl,sort,fields')
      .in('list_key', lRows.map((l) => l.key)).order('sort');
    if (error) return setStatus(`Could not load lists: ${error.message}`, 'err');
    items = data;
  }

  blocks = bRows.map((b) => ({ ...b, original: b.value }));
  lists = lRows.map((l) => ({
    ...l,
    items: items.filter((it) => it.list_key === l.key).map((it) => ({ id: it.id, tpl: it.tpl, fields: it.fields, dirty: false })),
  }));
  deleted = [];
  renderEditor();
  setStatus('');
  refreshDirty();
}

// ── Editor ──
function textarea(value, onInput) {
  const t = document.createElement('textarea');
  t.className = 'field-input';
  t.value = value;
  t.rows = 1;
  // Grow to fit the text so nothing is hidden behind a scrollbar.
  const fit = () => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };
  requestAnimationFrame(fit);
  t.addEventListener('input', () => { fit(); onInput(t.value, t); refreshDirty(); });
  return t;
}

// ── Photo fields ──
// A field named "...-photo" holds an <img> tag (or nothing). Photos are shrunk in the
// browser before upload so large phone pictures don't slow the site down.
const PHOTO_FIELD = /-photo$/;
const PHOTO_BUCKET = 'site-photos';
const photoSrc = (html) => html.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1] || '';

async function shrinkImage(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.82));
  if (blob) return { blob, ext: 'webp', type: 'image/webp' };
  // Browsers that can't write WebP fall back to JPEG.
  const jpeg = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  return { blob: jpeg, ext: 'jpg', type: 'image/jpeg' };
}

function photoField(value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'photo-field';
  const img = document.createElement('img');
  img.alt = '';
  const side = document.createElement('div');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'btn btn-sm';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-sm btn-danger';
  remove.textContent = 'Remove photo';
  const note = document.createElement('small');

  const show = (src) => {
    img.hidden = !src;
    if (src) img.src = src;
    remove.hidden = !src;
    pick.textContent = src ? 'Replace photo' : 'Upload photo';
  };
  show(photoSrc(value));

  pick.addEventListener('click', () => input.click());
  remove.addEventListener('click', () => { onChange(''); show(''); note.textContent = 'Photo removed — save to apply.'; });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { note.textContent = 'Please choose an image file.'; return; }
    pick.disabled = true;
    note.textContent = 'Uploading…';
    try {
      const { blob, ext, type } = await shrinkImage(file);
      const path = `${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000' });
      if (up.error) throw new Error(up.error.message);
      const url = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
      onChange(`<img src="${url}" alt="" loading="lazy"/>`);
      show(url);
      note.textContent = 'Photo uploaded — save, then Publish site.';
    } catch (err) {
      note.textContent = `Upload failed — ${err.message}`;
    } finally {
      pick.disabled = false;
    }
  });

  side.append(pick, ' ', remove, input, note);
  wrap.append(img, side);
  return wrap;
}

function renderEditor() {
  const entries = [
    ...blocks.map((b) => ({ type: 'block', position: b.position, key: b.key, ref: b })),
    ...lists.map((l) => ({ type: 'list', position: l.position, key: l.key, ref: l })),
  ].sort((a, b) => a.position - b.position);

  const root = document.createDocumentFragment();
  let section = null;
  for (const e of entries) {
    const { section: s, name } = keyParts(e.key);
    if (s !== section) {
      section = s;
      const h = document.createElement('h2');
      h.className = 'section-title';
      h.textContent = humanize(s);
      root.append(h);
    }
    root.append(e.type === 'block' ? renderBlock(e.ref, name) : renderList(e.ref, name));
  }
  $('editor').replaceChildren(root);
  if (!entries.length) $('editor').innerHTML = '<p class="empty">Nothing to edit on this page.</p>';
}

function renderBlock(b, name) {
  const wrap = document.createElement('div');
  wrap.className = 'block';
  const label = document.createElement('label');
  label.textContent = humanize(name);
  const t = textarea(b.value, (v, el) => { b.value = v; el.classList.toggle('dirty', v !== b.original); });
  wrap.append(label, t);
  wrap.dataset.search = `${label.textContent} ${b.value}`.toLowerCase();
  t.addEventListener('input', () => { wrap.dataset.search = `${label.textContent} ${b.value}`.toLowerCase(); });
  return wrap;
}

function renderList(l, name) {
  const wrap = document.createElement('div');
  wrap.className = 'list';
  const head = document.createElement('div');
  head.className = 'list-head';
  const h = document.createElement('h3');
  h.textContent = `${humanize(name)} (${l.items.length})`;
  head.append(h);
  wrap.append(head);

  if (!l.items.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'This list is empty on the site. Deleted items can be restored by re-running the setup SQL for this list.';
    wrap.append(p);
  }

  l.items.forEach((it, i) => wrap.append(renderItem(l, it, i)));
  return wrap;
}

function renderItem(l, it, i) {
  const card = document.createElement('div');
  card.className = 'item';
  const head = document.createElement('div');
  head.className = 'item-head';
  const title = document.createElement('strong');
  // Name the card after its first text field (skipping photo fields).
  const textNames = [...l.fields, ...Object.keys(it.fields)].filter((k) => !PHOTO_FIELD.test(k) && it.fields[k]);
  const labelName = textNames.find((k) => /label|name|title|summary|q-text/.test(k)) || textNames[0];
  title.textContent = `${i + 1}. ${plain(it.fields[labelName] || '').slice(0, 60) || 'Item'}`;
  head.append(title);

  const act = (label, fn, extra = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-sm ${extra}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    head.append(b);
    return b;
  };
  const moved = () => { l.items.forEach((x) => { x.dirty = true; }); renderEditor(); refreshDirty(); };
  act('↑', () => { [l.items[i - 1], l.items[i]] = [l.items[i], l.items[i - 1]]; moved(); }).disabled = i === 0;
  act('↓', () => { [l.items[i + 1], l.items[i]] = [l.items[i], l.items[i + 1]]; moved(); }).disabled = i === l.items.length - 1;
  act('Duplicate', () => {
    l.items.splice(i + 1, 0, { id: null, tpl: it.tpl, fields: structuredClone(it.fields), dirty: true });
    moved();
  });
  act('Delete', () => {
    if (!confirm('Delete this item? It will disappear from the site when you publish.')) return;
    if (it.id) deleted.push(it.id);
    l.items.splice(i, 1);
    moved();
  }, 'btn-danger');
  card.append(head);

  const order = [...l.fields, ...Object.keys(it.fields).filter((k) => !l.fields.includes(k))];
  for (const name of order) {
    const isPhoto = PHOTO_FIELD.test(name);
    if (!(name in it.fields) && !isPhoto) continue;
    const f = document.createElement('div');
    f.className = 'item-field';
    const label = document.createElement('label');
    label.textContent = humanize(name);
    const control = isPhoto
      ? photoField(it.fields[name] || '', (v) => { it.fields[name] = v; it.dirty = true; refreshDirty(); })
      : textarea(it.fields[name], (v, el) => { it.fields[name] = v; it.dirty = true; el.classList.add('dirty'); });
    f.append(label, control);
    card.append(f);
  }
  card.dataset.search = Object.values(it.fields).join(' ').toLowerCase();
  card.addEventListener('input', () => { card.dataset.search = Object.values(it.fields).join(' ').toLowerCase(); });
  return card;
}

$('filter').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#editor .block, #editor .item').forEach((el) => {
    el.hidden = q && !el.dataset.search.includes(q);
  });
  document.querySelectorAll('#editor .list').forEach((el) => {
    el.hidden = q && ![...el.querySelectorAll('.item')].some((x) => !x.hidden);
  });
});

// ── Save & publish ──
async function save() {
  $('save-btn').disabled = true;
  setStatus('Saving…');
  const now = new Date().toISOString();
  const ops = [];
  const check = (label) => ({ data, error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
    if (Array.isArray(data) && !data.length) throw new Error(`${label}: not allowed (is this an admin account?)`);
  };

  for (const b of blocks.filter((x) => x.value !== x.original)) {
    ops.push(sb.from('cms_blocks').update({ value: b.value, updated_at: now }).eq('key', b.key).select('key')
      .then(check(b.key)));
  }
  for (const l of lists) {
    l.items.forEach((it, sort) => {
      if (!it.id) {
        ops.push(sb.from('cms_items').insert({ list_key: l.key, tpl: it.tpl, sort, fields: it.fields }).select('id')
          .then(check(l.key)));
      } else if (it.dirty) {
        ops.push(sb.from('cms_items').update({ fields: it.fields, sort, updated_at: now }).eq('id', it.id).select('id')
          .then(check(l.key)));
      }
    });
  }
  if (deleted.length) ops.push(sb.from('cms_items').delete().in('id', deleted).select('id').then(check('delete')));

  try {
    await Promise.all(ops);
  } catch (err) {
    setStatus(`Save failed — ${err.message}`, 'err');
    $('save-btn').disabled = false;
    return false;
  }
  await openPage(current);
  setStatus('Saved. Press Publish site to update the live website.', 'ok');
  return true;
}

$('save-btn').addEventListener('click', save);

$('publish-btn').addEventListener('click', async () => {
  if (isDirty()) {
    if (!confirm('Save your changes and publish?')) return;
    if (!(await save())) return;
  }
  $('publish-btn').disabled = true;
  setStatus('Starting publish…');
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch('/api/publish', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    setStatus('Publishing — the live site will update in about a minute.', 'ok');
  } catch (err) {
    setStatus(`Publish failed — ${err.message}`, 'err');
  } finally {
    setTimeout(() => { $('publish-btn').disabled = false; }, 5000);
  }
});

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

init();
