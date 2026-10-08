// Store checkout helpers for the cart page.
//   GET  /api/store-quote            → countries (and their states) we ship to
//   POST /api/store-quote {items, recipient} → subtotal, shipping, tax, total for that address
// Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRINTFUL_API_KEY.

import { printful } from '../lib/printful.mjs';
import { quote, settings, StoreError } from '../lib/store.mjs';

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

let countryCache = null; // survives while the function stays warm

export default async (req) => {
  try {
    if (req.method === 'GET') {
      if (!countryCache) {
        const { result } = await printful('/countries');
        countryCache = result.map((c) => ({ code: c.code, name: c.name, states: (c.states || []).map((s) => ({ code: s.code, name: s.name })) }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      const { countries } = await settings();
      const allowed = countries?.length ? countryCache.filter((c) => countries.includes(c.code)) : countryCache;
      return json(200, { countries: allowed }, { 'Cache-Control': 'public, max-age=3600' });
    }
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

    const body = await req.json().catch(() => ({}));
    const q = await quote(body.items, body.recipient || {});
    return json(200, {
      currency: q.currency, subtotal_cents: q.subtotal_cents, shipping_cents: q.shipping_cents,
      shipping_name: q.shipping_name, delivery_days: q.delivery_days,
      tax_cents: q.tax_cents, tax_label: q.tax_label, total_cents: q.total_cents,
    });
  } catch (err) {
    if (err instanceof StoreError) return json(400, { error: err.message });
    console.error('store-quote:', err.message);
    return json(502, { error: "Sorry, we couldn't calculate shipping right now. Please try again." });
  }
};

export const config = { path: '/api/store-quote' };
