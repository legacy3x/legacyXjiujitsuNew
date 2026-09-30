// Stripe → confirms card-paid registrations (and releases spots from abandoned checkouts).
// In Stripe: Developers → Webhooks → add endpoint https://<your-site>/api/stripe-webhook
// with events checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.async_payment_failed, checkout.session.expired.
// Needs: STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.

import { update } from '../lib/supabase.mjs';
import { verifyWebhook } from '../lib/stripe.mjs';
import { addRegistrant } from '../lib/resend.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET || '')) {
    return new Response('Bad signature', { status: 400 });
  }

  const event = JSON.parse(raw);
  const session = event.data?.object || {};
  const regId = session.metadata?.registration_id;
  if (!regId) return new Response('ok');

  try {
    const paid = event.type === 'checkout.session.async_payment_succeeded'
      || (event.type === 'checkout.session.completed' && session.payment_status === 'paid');
    const failed = event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed';

    if (paid) {
      const rows = await update('event_registrations', `id=eq.${regId}&status=eq.pending_payment`, { status: 'confirmed' });
      if (rows.length) await addRegistrant(rows[0]);
    } else if (failed) {
      await update('event_registrations', `id=eq.${regId}&status=eq.pending_payment`, { status: 'cancelled' });
    }
  } catch (err) {
    console.error('stripe-webhook:', err.message);
    return new Response('Retry later', { status: 500 }); // Stripe retries on errors
  }
  return new Response('ok');
};

export const config = { path: '/api/stripe-webhook' };
