// Someone backed out of Stripe Checkout: release their held spot right away
// instead of waiting for the checkout to expire.

import { select, update } from '../lib/supabase.mjs';
import { stripe } from '../lib/stripe.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const { registration_id: id } = await req.json().catch(() => ({}));
  if (!UUID_RE.test(id || '')) return new Response(null, { status: 400 });

  try {
    const [reg] = await select('event_registrations', `id=eq.${id}&status=eq.pending_payment&select=stripe_session_id`);
    if (!reg) return new Response(null, { status: 204 });
    if (reg.stripe_session_id) {
      await stripe(`checkout/sessions/${reg.stripe_session_id}/expire`).catch(() => {}); // already expired/paid is fine
    }
    await update('event_registrations', `id=eq.${id}&status=eq.pending_payment`, { status: 'cancelled' });
  } catch (err) {
    console.error('registration-cancel:', err.message);
  }
  return new Response(null, { status: 204 });
};

export const config = { path: '/api/registration-cancel' };
