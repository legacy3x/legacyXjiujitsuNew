// Store logic shared by the checkout, webhook and admin functions.
// Prices always come from our own database (filled by the admin's Printful sync) —
// never from the browser.

import { select, update } from './supabase.mjs';
import { printful } from './printful.mjs';
import { sendEmail } from './resend.mjs';

const money = (cents, currency) => `${(cents / 100).toFixed(2)} ${currency}`;
const dollars = (cents) => (cents / 100).toFixed(2);

export class StoreError extends Error {} // message is safe to show to the customer

export async function settings() {
  const [row] = await select('store_settings', 'id=eq.1&select=*');
  return row || { auto_confirm: false, shipping_mode: 'printful', flat_shipping_cents: 0, tax_percent: 0, tax_label: 'HST', countries: null };
}

// Turn [{ variant_id, quantity }] from the cart into priced lines, using live products only.
export async function priceItems(cart) {
  if (!Array.isArray(cart) || !cart.length) throw new StoreError('Your cart is empty.');
  if (cart.length > 50) throw new StoreError('Too many items in the cart.');
  const products = await select('store_products', 'live=is.true&select=id,name,printful_store_id,variants,thumbnail_url');
  const byVariant = new Map();
  for (const p of products) for (const v of p.variants) byVariant.set(String(v.id), { p, v });

  const lines = [];
  for (const item of cart) {
    const found = byVariant.get(String(item.variant_id));
    const quantity = Math.floor(Number(item.quantity));
    if (!found || found.v.available === false) throw new StoreError('An item in your cart is no longer available. Please remove it and try again.');
    if (!(quantity >= 1 && quantity <= 20)) throw new StoreError('Please choose a quantity between 1 and 20.');
    lines.push({
      product_id: found.p.id,
      variant_id: found.v.id,
      catalog_variant_id: found.v.catalog_variant_id,
      printful_store_id: found.p.printful_store_id,
      name: found.p.name,
      variant_name: [found.v.color, found.v.size].filter(Boolean).join(' / ') || found.v.name,
      quantity,
      unit_cents: found.v.price_cents,
      currency: found.v.currency,
      image: found.v.image || found.p.thumbnail_url,
    });
  }
  const currencies = new Set(lines.map((l) => l.currency));
  if (currencies.size > 1) throw new StoreError('These items are priced in different currencies and must be ordered separately.');
  return lines;
}

const byStore = (lines) => {
  const groups = new Map();
  for (const l of lines) groups.set(l.printful_store_id, [...(groups.get(l.printful_store_id) || []), l]);
  return groups;
};

// Subtotal, shipping, tax and total for a cart going to an address.
export async function quote(cart, recipient) {
  const [lines, cfg] = await Promise.all([priceItems(cart), settings()]);
  const currency = lines[0].currency;
  const country = String(recipient?.country_code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new StoreError('Please choose a country.');
  if (cfg.countries?.length && !cfg.countries.includes(country)) throw new StoreError("Sorry, we don't ship to that country yet.");

  const subtotal = lines.reduce((n, l) => n + l.unit_cents * l.quantity, 0);
  let shipping = 0;
  let shippingName = 'Free shipping';
  let days = null;
  const rates = {};

  if (cfg.shipping_mode === 'flat') {
    shipping = cfg.flat_shipping_cents;
    shippingName = 'Shipping';
  } else if (cfg.shipping_mode === 'printful') {
    // One Printful shipment per Printful store; charge each store's cheapest rate.
    shippingName = 'Shipping';
    for (const [storeId, group] of byStore(lines)) {
      let result;
      try {
        ({ result } = await printful('/shipping/rates', {
          method: 'POST',
          storeId,
          body: {
            recipient: {
              address1: recipient.address1, city: recipient.city, country_code: country,
              state_code: recipient.state_code || undefined, zip: recipient.zip,
            },
            items: group.map((l) => ({ variant_id: String(l.catalog_variant_id), quantity: l.quantity })),
            currency,
          },
        }));
      } catch (err) {
        if (err.status === 400) throw new StoreError(`We couldn't calculate shipping to that address: ${err.message}`);
        throw err;
      }
      const cheapest = [...(result || [])].sort((a, b) => Number(a.rate) - Number(b.rate))[0];
      if (!cheapest) throw new StoreError("Sorry, we can't ship these items to that address.");
      shipping += Math.round(Number(cheapest.rate) * 100);
      rates[storeId] = cheapest.id;
      if (cheapest.minDeliveryDays) {
        days = { min: Math.max(days?.min || 0, cheapest.minDeliveryDays), max: Math.max(days?.max || 0, cheapest.maxDeliveryDays || cheapest.minDeliveryDays) };
      }
    }
  }

  const tax = Math.round((subtotal + shipping) * (Number(cfg.tax_percent) / 100));
  return {
    lines, currency, rates,
    subtotal_cents: subtotal, shipping_cents: shipping, shipping_name: shippingName, delivery_days: days,
    tax_cents: tax, tax_label: cfg.tax_label, total_cents: subtotal + shipping + tax,
  };
}

// Create the Printful order(s) for a paid order — one per Printful store involved.
// Drafts unless the "send automatically" setting is on. Safe to call again: stores that
// already have a Printful order are skipped.
export async function sendToPrintful(order) {
  const cfg = await settings();
  const done = new Map((order.printful_orders || []).filter((p) => p.order_id).map((p) => [String(p.store_id), p]));
  const results = [];
  for (const [storeId, group] of byStore(order.items)) {
    if (done.has(String(storeId))) { results.push(done.get(String(storeId))); continue; }
    const subtotal = group.reduce((n, l) => n + l.unit_cents * l.quantity, 0);
    const single = byStore(order.items).size === 1;
    try {
      const { result } = await printful(`/orders${cfg.auto_confirm ? '?confirm=true' : ''}`, {
        method: 'POST',
        storeId,
        body: {
          external_id: single ? order.order_number : `${order.order_number}-${storeId}`,
          shipping: order.shipping_rates?.[storeId] || 'STANDARD',
          recipient: order.recipient,
          items: group.map((l) => ({ sync_variant_id: l.variant_id, quantity: l.quantity, retail_price: dollars(l.unit_cents) })),
          // What the customer paid (shown on the packing slip). Split orders only carry their own subtotal.
          retail_costs: {
            currency: order.currency,
            subtotal: dollars(subtotal),
            shipping: dollars(single ? order.shipping_cents : 0),
            tax: dollars(single ? order.tax_cents : 0),
          },
        },
      });
      results.push({ store_id: storeId, order_id: result.id, status: result.status, shipments: [] });
    } catch (err) {
      console.error('printful: order create failed', order.order_number, storeId, err.message);
      results.push({ store_id: storeId, order_id: null, status: 'error', error: err.message });
    }
  }
  const [saved] = await update('store_orders', `id=eq.${order.id}`, {
    printful_orders: results, fulfillment_status: overallStatus(results),
  });
  return saved;
}

export function overallStatus(printfulOrders) {
  if (!printfulOrders.length) return 'not_sent';
  const statuses = printfulOrders.map((p) => p.status);
  if (statuses.includes('error')) return 'error';
  return statuses.every((s) => s === statuses[0]) ? statuses[0] : 'partial';
}

// Stripe says the order is paid: record it, hand it to Printful, and send the emails.
export async function fulfillPaidOrder(orderId) {
  const [order] = await update('store_orders', `id=eq.${orderId}&payment_status=eq.pending`, { payment_status: 'paid' });
  if (!order) return null; // already handled (Stripe can deliver an event twice)
  const saved = await sendToPrintful(order);

  const list = order.items.map((l) => `  ${l.quantity} × ${l.name}${l.variant_name ? ` (${l.variant_name})` : ''} — ${money(l.unit_cents * l.quantity, order.currency)}`).join('\n');
  const totals = `Subtotal: ${money(order.subtotal_cents, order.currency)}\nShipping: ${money(order.shipping_cents, order.currency)}`
    + `${order.tax_cents ? `\nTax: ${money(order.tax_cents, order.currency)}` : ''}\nTotal: ${money(order.total_cents, order.currency)}`;
  const r = order.recipient;
  const address = [r.name, r.address1, r.address2, `${r.city}${r.state_code ? `, ${r.state_code}` : ''} ${r.zip}`, r.country_code].filter(Boolean).join('\n');
  const mail = (to, subject, intro, replyTo) => sendEmail({ to, subject, replyTo, text: `${intro}\n\nOrder ${order.order_number}\n\n${list}\n\n${totals}\n\nShipping to:\n${address}\n` })
    .catch((err) => console.error('store: email failed', to, err.message));
  await Promise.all([
    mail(order.email, `Your Legacy X order ${order.order_number}`,
      `Thanks for your order, ${order.name.split(' ')[0]}! We've received your payment and your items are being prepared. You'll get tracking details when they ship.`,
      process.env.CONTACT_TO_EMAIL || 'info@legacyxjiujitsu.com'),
    mail(process.env.CONTACT_TO_EMAIL || 'info@legacyxjiujitsu.com', `New store order ${order.order_number}`,
      `A new order was paid on the website by ${order.name} (${order.email}).${saved.fulfillment_status === 'draft' ? ' It is waiting in the admin for you to confirm.' : ''}${saved.fulfillment_status === 'error' ? ' IT COULD NOT BE SENT TO PRINTFUL — open the admin to retry.' : ''}`,
      order.email),
  ]);
  return saved;
}
