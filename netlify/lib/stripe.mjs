// Minimal Stripe REST client (no SDK needed). Needs STRIPE_SECRET_KEY.
import crypto from 'node:crypto';

// Stripe expects form encoding with bracketed keys for nested objects.
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? form(params) : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${body.error?.message || 'error'}`);
  return body;
}

// Verifies the Stripe-Signature header against the raw request body.
export function verifyWebhook(raw, header, secret, toleranceSeconds = 300) {
  const parts = {};
  const sigs = [];
  for (const piece of (header || '').split(',')) {
    const [k, v] = piece.split('=');
    if (k === 't') parts.t = v;
    if (k === 'v1') sigs.push(v);
  }
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  return sigs.some((s) => s.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
