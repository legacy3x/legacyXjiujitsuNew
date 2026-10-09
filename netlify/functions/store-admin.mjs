// Printful actions for the admin's Store section. Every call must come from a signed-in admin.
//   stores                         → the Printful stores this token can see
//   products {store_id, offset}    → one page of a store's products
//   sync-product {store_id, store_name, product_id} → copy a product and its variants into our database
//   order-send | order-confirm | order-cancel | order-refresh {order_id}
// Needs: PRINTFUL_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { requireAdmin } from '../lib/admin-auth.mjs';
import { printful, printfulConfigured } from '../lib/printful.mjs';
import { select, update, insert } from '../lib/supabase.mjs';
import { sendToPrintful, overallStatus } from '../lib/store.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const cents = (price) => Math.round(Number(price || 0) * 100);

// Printful keeps no description on a store's own products, so use the one from its catalogue
// (the write-up for the blank shirt, hoodie, etc.). A missing one never stops a sync.
async function catalogDescription(catalogProductId) {
  if (!catalogProductId) return '';
  try {
    const { result } = await printful(`/products/${catalogProductId}`);
    return String(result.product?.description || '').replace(/\r\n?/g, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  } catch (err) {
    console.error('store-admin: no catalogue description for', catalogProductId, err.message);
    return '';
  }
}

async function syncProduct({ store_id: storeId, store_name: storeName, product_id: productId }) {
  const { result } = await printful(`/store/products/${productId}`, { storeId });
  // Only fill the description in when there isn't one yet, so text written in the admin is never replaced.
  const [existing] = await select('store_products', `printful_store_id=eq.${Number(storeId)}&printful_product_id=eq.${Number(productId)}&select=description`);
  const description = existing?.description ? '' : await catalogDescription((result.sync_variants || []).find((v) => v.product?.product_id)?.product.product_id);
  const variants = (result.sync_variants || []).filter((v) => !v.is_ignored).map((v) => ({
    id: v.id,
    catalog_variant_id: v.variant_id,
    name: v.name,
    size: v.size || '',
    color: v.color || '',
    price_cents: cents(v.retail_price),
    currency: v.currency || 'CAD',
    image: (v.files || []).find((f) => f.type === 'preview')?.preview_url || v.product?.image || null,
    // No retail price in Printful = can't be sold.
    available: cents(v.retail_price) > 0 && (!v.availability_status || v.availability_status === 'active'),
  }));
  const prices = variants.filter((v) => v.available).map((v) => v.price_cents);
  const [row] = await insert('store_products', [{
    printful_store_id: storeId,
    printful_store_name: storeName || '',
    printful_product_id: productId,
    name: result.sync_product.name,
    thumbnail_url: result.sync_product.thumbnail_url || variants[0]?.image || null,
    variants,
    currency: variants[0]?.currency || 'CAD',
    min_price_cents: prices.length ? Math.min(...prices) : 0,
    max_price_cents: prices.length ? Math.max(...prices) : 0,
    synced_at: new Date().toISOString(),
    ...(description ? { description } : {}),
  }], { onConflict: 'printful_store_id,printful_product_id' }); // keeps live / description / sort
  return { id: row.id, name: row.name, variants: variants.length };
}

async function loadOrder(id) {
  const [order] = await select('store_orders', `id=eq.${encodeURIComponent(id)}&select=*`);
  if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });
  return order;
}

// Run `fn` against each Printful order on a website order and save the new statuses.
async function eachPrintfulOrder(order, fn) {
  const errors = [];
  const next = [];
  for (const p of order.printful_orders || []) {
    if (!p.order_id) { next.push(p); continue; }
    try {
      next.push({ ...p, ...(await fn(p)), error: undefined });
    } catch (err) {
      errors.push(err.message);
      next.push(p);
    }
  }
  const [saved] = await update('store_orders', `id=eq.${order.id}`, { printful_orders: next, fulfillment_status: overallStatus(next) });
  return { order: saved, errors };
}

const fromPrintful = (result) => ({
  status: result.status,
  shipments: (result.shipments || []).map((s) => ({ carrier: s.carrier, service: s.service, tracking_number: s.tracking_number, tracking_url: s.tracking_url })),
});

const ACTIONS = {
  stores: async () => ({ stores: (await printful('/stores')).result }),

  products: async ({ store_id: storeId, offset = 0 }) => {
    const { result, paging } = await printful(`/store/products?offset=${Number(offset) || 0}&limit=100`, { storeId });
    return { products: result.map((p) => ({ id: p.id, name: p.name, variants: p.variants, thumbnail_url: p.thumbnail_url, ignored: p.is_ignored })), total: paging?.total ?? result.length };
  },

  'sync-product': syncProduct,

  'order-send': async ({ order_id: id }) => {
    const order = await loadOrder(id);
    if (order.payment_status !== 'paid') throw Object.assign(new Error('This order has not been paid.'), { status: 400 });
    const saved = await sendToPrintful(order);
    return { order: saved, errors: saved.printful_orders.filter((p) => p.error).map((p) => p.error) };
  },

  // Draft → submitted for fulfillment (this is when Printful charges the account).
  'order-confirm': async ({ order_id: id }) => eachPrintfulOrder(await loadOrder(id), async (p) => (
    p.status === 'draft' ? fromPrintful((await printful(`/orders/${p.order_id}/confirm`, { method: 'POST', storeId: p.store_id })).result) : {}
  )),

  // Only possible before Printful starts making it. Refunding the customer is done in Stripe.
  'order-cancel': async ({ order_id: id }) => eachPrintfulOrder(await loadOrder(id), async (p) => (
    p.status === 'canceled' ? {} : fromPrintful((await printful(`/orders/${p.order_id}`, { method: 'DELETE', storeId: p.store_id })).result)
  )),

  'order-refresh': async ({ order_id: id }) => eachPrintfulOrder(await loadOrder(id), async (p) => (
    fromPrintful((await printful(`/orders/${p.order_id}`, { storeId: p.store_id })).result)
  )),
};

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const denied = await requireAdmin(req);
  if (denied) return json(denied.status, { error: denied.error });
  if (!printfulConfigured()) return json(500, { error: 'PRINTFUL_API_KEY is not set in Netlify yet.' });

  const body = await req.json().catch(() => ({}));
  const action = ACTIONS[body.action];
  if (!action) return json(400, { error: 'Unknown action.' });
  try {
    return json(200, await action(body));
  } catch (err) {
    console.error('store-admin:', body.action, err.message);
    return json(err.status && err.status < 500 ? err.status : 502, { error: err.message });
  }
};

export const config = { path: '/api/store-admin' };
