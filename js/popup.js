// Poster popups managed in Admin → Popups (loaded after js/site-config.js on every public page).
// Shows at most one popup per page view: the newest one that is live, meant for this page,
// and not already seen as often as its "how often" setting allows.
(() => {
  const cfg = window.SITE_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  // "/" → "index", "/programs/kids-jiu-jitsu.html" (or without .html) → "programs/kids-jiu-jitsu"
  const page = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '').replace(/\.html$/, '') || 'index';
  if (page.startsWith('admin')) return;

  const DAY = 24 * 60 * 60 * 1000;
  const key = (p) => `lx-popup-${p.id}`;
  const read = (store, k) => { try { return store.getItem(k); } catch { return null; } };
  const write = (store, k, v) => { try { store.setItem(k, v); } catch { /* private mode: show again next time */ } };

  function due(p) {
    if (p.frequency === 'always') return true;
    if (p.frequency === 'session') return !read(sessionStorage, key(p));
    const last = Number(read(localStorage, key(p)));
    if (p.frequency === 'once') return !last;
    return !last || Date.now() - last > DAY; // daily
  }
  function remember(p) {
    if (p.frequency === 'session') write(sessionStorage, key(p), '1');
    else if (p.frequency !== 'always') write(localStorage, key(p), String(Date.now()));
  }
  // Only plain web addresses or site pages, never script links.
  const safeLink = (u) => (u && /^(https?:\/\/|\/|[\w-]+(\/[\w-]+)*\.html)/i.test(u.trim()) ? u.trim() : '');

  const CSS = `
.lx-popup { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(5, 8, 16, 0.82); opacity: 0; transition: opacity 0.25s; }
.lx-popup.open { opacity: 1; }
.lx-popup-box { position: relative; max-width: min(560px, 100%); transform: scale(0.96); transition: transform 0.25s; }
.lx-popup.open .lx-popup-box { transform: none; }
.lx-popup-box img { display: block; max-width: 100%; max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px);
  width: auto; height: auto; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); }
.lx-popup-close { position: absolute; top: 10px; right: 10px; width: 40px; height: 40px; border-radius: 50%;
  border: 0; background: #fff; color: #1a2346; font-size: 26px; line-height: 40px; font-weight: 700; cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4); display: grid; place-items: center; padding: 0; }
.lx-popup-close:hover { background: #3a8fd8; color: #fff; }
.lx-popup-close:focus-visible { outline: 3px solid #3a8fd8; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .lx-popup, .lx-popup-box { transition: none; } }`;

  function show(p) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'lx-popup';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', p.alt_text || 'Announcement');
    const box = document.createElement('div');
    box.className = 'lx-popup-box';
    const img = new Image();
    img.src = p.image_url;
    img.alt = p.alt_text || '';
    const link = safeLink(p.link_url);
    if (link) {
      const a = document.createElement('a');
      a.href = link;
      if (p.new_tab) { a.target = '_blank'; a.rel = 'noopener'; }
      a.addEventListener('click', () => window.gtag?.('event', 'popup_click', { popup_id: p.id }));
      a.appendChild(img);
      box.appendChild(a);
    } else {
      box.appendChild(img);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'lx-popup-close';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '&times;';
    box.appendChild(close);
    wrap.appendChild(box);

    const before = document.activeElement;
    const overflow = document.body.style.overflow;
    function hide() {
      wrap.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      setTimeout(() => wrap.remove(), 250);
      before?.focus?.();
    }
    function onKey(e) {
      if (e.key === 'Escape') hide();
      if (e.key === 'Tab') { e.preventDefault(); close.focus(); } // keep focus inside the popup
    }
    close.addEventListener('click', hide);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) hide(); });

    // Wait for the poster so it never pops up half-loaded.
    img.addEventListener('load', () => {
      document.body.appendChild(wrap);
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      requestAnimationFrame(() => wrap.classList.add('open'));
      close.focus({ preventScroll: true });
      remember(p);
      window.gtag?.('event', 'popup_view', { popup_id: p.id });
    });
  }

  async function run() {
    const headers = { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' };
    if (cfg.supabaseAnonKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.supabaseAnonKey}`;
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/public_popups`, { method: 'POST', headers, body: '{}' });
    if (!res.ok) return;
    const popup = (await res.json()).find((p) => (!p.pages?.length || p.pages.includes(page)) && due(p));
    if (popup) show(popup);
  }

  const start = () => setTimeout(() => run().catch(() => {}), 600); // let the page settle first
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
