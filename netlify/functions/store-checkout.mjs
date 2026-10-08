// Store checkout: prices the cart on the server, saves the order as "pending", and sends the
// customer to Stripe Checkout. stripe-webhook marks it paid and hands it to Printful.
// Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRINTFUL_API_KEY, STRIPE_SECRET_KEY.

import crypto from 'node:crypto';
import { insert, update, supabaseConfigured } from '../lib/supabase.mjs';
import { stripe } from '../lib/stripe.mjs';
import { quote, StoreError } from '../lib/store.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const clean = (v, max = 120) => String(v ?? '').trim().slice(0, max);

// e.g. LX-261007-7K4Q — short enough to read out, random enough not to collide.
function orderNumber() {
  const d = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const tail = [...crypto.randomBytes(4)].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  return `LX-${d}-${tail}`;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!supabaseConfigured() || !process.env.STRIPE_SECRET_KEY || !process.env.PRINTFUL_API_KEY) {
    console.error('store-checkout: missing SUPABASE / STRIPE_SECRET_KEY / PRINTFUL_API_KEY settings');
    return json(500, { error: 'The store checkout is not available right now. Please try again later.' });
  }

  const body = await req.json().catch(() => ({}));
  if (body.website) return json(200, { ok: true }); // honeypot

  const r = body.recipient || {};
  const recipient = {
    name: clean(r.name), email: clean(r.email, 254).toLowerCase(), phone: clean(r.phone, 40),
    address1: clean(r.address1), address2: clean(r.address2), city: clean(r.city, 80),
    state_code: clean(r.state_code, 10).toUpperCase(), country_code: clean(r.country_code, 2).toUpperCase(), zip: clean(r.zip, 20),
  };
  if (!recipient.name.includes(' ')) return json(400, { error: 'Please enter your full name.' });
  if (!EMAIL_RE.test(recipient.email)) return json(400, { error: 'Please enter a valid email address.' });
  if (!recipient.address1 || !recipient.city || !recipient.zip) return json(400, { error: 'Please fill in your full shipping address.' });

  let q;
  try {
    q = await quote(body.items, recipient);
  } catch (err) {
    if (err instanceof StoreError) return json(400, { error: err.message });
    console.error('store-checkout: quote failed', err.message);
    return json(502, { error: "Sorry, we couldn't calculate shipping right now. Please try again." });
  }

  let order;
  try {
    [order] = await insert('store_orders', [{
      order_number: orderNumber(),
      name: recipient.name, email: recipient.email, phone: recipient.phone,
      recipient,
      items: q.lines.map(({ catalog_variant_id, currency, ...line }) => line),
      currency: q.currency,
      subtotal_cents: q.subtotal_cents, shipping_cents: q.shipping_cents, tax_cents: q.tax_cents, total_cents: q.total_cents,
      shipping_name: q.shipping_name, shipping_rates: q.rates,
    }]);
  } catch (err) {
    console.error('store-checkout: could not save order', err.message);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }

  const site = (process.env.URL || new URL(req.url).origin).replace(/\/+$/, '');
  const currency = q.currency.toLowerCase();
  const line = (name, cents, quantity = 1) => ({ quantity, price_data: { currency, unit_amount: cents, product_data: { name } } });
  const items = q.lines.map((l) => line(`${l.name}${l.variant_name ? ` — ${l.variant_name}` : ''}`, l.unit_cents, l.quantity));
  if (q.shipping_cents > 0) items.push(line(q.shipping_name, q.shipping_cents));
  if (q.tax_cents > 0) items.push(line(q.tax_label, q.tax_cents));

  try {
    const session = await stripe('checkout/sessions', {
      mode: 'payment',
      customer_email: recipient.email,
      client_reference_id: order.id,
      metadata: { store_order_id: order.id, order_number: order.order_number },
      line_items: Object.fromEntries(items.map((it, i) => [i, it])),
      success_url: `${site}/store-cart.html?order=${encodeURIComponent(order.order_number)}&paid=1`,
      cancel_url: `${site}/store-cart.html?cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    });
    await update('store_orders', `id=eq.${order.id}`, { stripe_session_id: session.id });
    return json(200, { ok: true, checkout_url: session.url, order_number: order.order_number });
  } catch (err) {
    console.error('store-checkout: stripe failed', err.message);
    await update('store_orders', `id=eq.${order.id}`, { payment_status: 'cancelled' }).catch(() => {});
    return json(502, { error: 'Card payments are not available right now. Please try again.' });
  }
};

export const config = { path: '/api/store-checkout' };
