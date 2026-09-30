// Shared helpers for events.html and event.html (loaded after js/site-config.js).
window.LXEvents = (() => {
  const cfg = window.SITE_CONFIG || {};

  const CATEGORY = { competition: 'Competition', seminar: 'Seminar', 'open-mat': 'Open Mat', academy: 'Academy Event' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  async function rpc(name, args = {}) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('not configured');
    const headers = { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' };
    if (cfg.supabaseAnonKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.supabaseAnonKey}`;
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paragraphs = (s) => esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');

  // "2026-10-17" → { month: 'Oct', day: '17', year: '2026' } without timezone surprises.
  function dateParts(iso) {
    if (!iso) return { month: 'TBA', day: '—', year: '' };
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return { month: MONTHS[m - 1], day: String(d), year: String(y) };
  }

  function longDate(iso) {
    if (!iso) return 'Date TBA';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function time12(t) {
    if (!t) return '';
    const [h, min] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  function timeRange(e) {
    if (!e.start_time) return 'Time TBA';
    return e.end_time ? `${time12(e.start_time)} – ${time12(e.end_time)}` : time12(e.start_time);
  }

  const money = (cents) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);
  const price = (e) => (e.cost_cents > 0 ? `${money(e.cost_cents)} per person` : 'Free');

  function when(ts) {
    return new Date(ts).toLocaleString('en-CA', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function spotsText(e) {
    if (e.capacity == null || e.registration_state !== 'open') return '';
    return e.spots_left === 1 ? '1 spot left' : `${e.spots_left} spots left`;
  }

  return { rpc, esc, paragraphs, dateParts, longDate, timeRange, money, price, when, spotsText, CATEGORY };
})();
