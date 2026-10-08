// Shared helpers for the store pages (loaded after js/site-config.js).
// The cart lives in this browser's localStorage as [{ variant_id, quantity }];
// names and prices are always re-read from the database, never trusted from the cart.
window.LXStore = (() => {
  const cfg = window.SITE_CONFIG || {};
  const CART_KEY = 'lx_cart_v1';

  // Live products straight from Supabase (row-level security only exposes live ones).
  async function products(filter = '') {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('not configured');
    const headers = { apikey: cfg.supabaseAnonKey };
    if (cfg.supabaseAnonKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.supabaseAnonKey}`;
    const cols = 'id,name,description,thumbnail_url,variants,currency,min_price_cents,max_price_cents';
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/store_products?select=${cols}&live=is.true&order=sort,name${filter}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (cents, currency = 'CAD') => new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);
  const priceRange = (p) => (p.min_price_cents === p.max_price_cents
    ? money(p.min_price_cents, p.currency)
    : `From ${money(p.min_price_cents, p.currency)}`);
  const variantLabel = (v) => [v.color, v.size].filter(Boolean).join(' / ') || v.name;

  function readCart() {
    try {
      const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(cart) ? cart.filter((i) => i && i.variant_id && i.quantity > 0) : [];
    } catch { return []; }
  }
  function writeCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* private mode: cart lasts for this page only */ }
    badge();
  }
  function addToCart(variantId, quantity = 1) {
    const cart = readCart();
    const line = cart.find((i) => String(i.variant_id) === String(variantId));
    if (line) line.quantity = Math.min(20, line.quantity + quantity);
    else cart.push({ variant_id: variantId, quantity: Math.min(20, quantity) });
    writeCart(cart);
  }
  function setQuantity(variantId, quantity) {
    writeCart(readCart().map((i) => (String(i.variant_id) === String(variantId) ? { ...i, quantity } : i)).filter((i) => i.quantity > 0));
  }
  const clearCart = () => writeCart([]);
  const cartCount = () => readCart().reduce((n, i) => n + i.quantity, 0);

  // Any element with data-cart-count shows the number of items in the cart.
  function badge() {
    const n = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = n; });
  }
  document.addEventListener('DOMContentLoaded', badge);

  return { products, esc, money, priceRange, variantLabel, readCart, addToCart, setQuantity, clearCart, cartCount, badge };
})();
