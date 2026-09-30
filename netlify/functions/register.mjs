// Event registration from event.html.
// Free events and e-Transfer registrations are saved right away; card payments are
// saved as "pending" and sent to Stripe Checkout, then confirmed by stripe-webhook.
// Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (for card payments),
//        RESEND_API_KEY (mailing list).

import { rpc, update, supabaseConfigured } from '../lib/supabase.mjs';
import { stripe } from '../lib/stripe.mjs';
import { addRegistrant } from '../lib/resend.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES = {
  EVENT_NOT_FOUND: 'This event is no longer available.',
  REGISTRATION_NOT_OPEN: "Registration for this event hasn't opened yet.",
  REGISTRATION_CLOSED: 'Registration for this event is closed.',
  NOT_ENOUGH_SPOTS: "Sorry, there aren't enough spots left for that many people.",
  WAIVER_REQUIRED: 'Please accept the waiver to register.',
  ETRANSFER_CODE_REQUIRED: 'Please enter your e-Transfer confirmation code.',
  INVALID_PAYMENT_METHOD: 'Please choose a payment method.',
  INVALID_QUANTITY: 'Please choose between 1 and 20 spots.',
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function validate(b) {
  if (!UUID_RE.test(b.event_id || '')) return 'This event is no longer available.';
  if (!clean(b.first_name) || !clean(b.last_name)) return 'Please enter your first and last name.';
  if (!EMAIL_RE.test(clean(b.email, 254))) return 'Please enter a valid email address.';
  if (clean(b.phone, 40).replace(/\D/g, '').length < 7) return 'Please enter a valid phone number.';
  if (!Array.isArray(b.attendees) || b.attendees.length < 1 || b.attendees.length > 20) return MESSAGES.INVALID_QUANTITY;
  const today = new Date().toISOString().slice(0, 10);
  for (const [i, a] of b.attendees.entries()) {
    if (!clean(a?.full_name).includes(' ')) return `Please enter a full name (first and last) for person ${i + 1}.`;
    const dob = clean(a?.date_of_birth, 10);
    if (!DATE_RE.test(dob) || Number.isNaN(Date.parse(dob)) || dob > today || dob < '1900-01-01') {
      return `Please enter a valid date of birth for person ${i + 1}.`;
    }
  }
  if (b.waiver_accepted !== true) return MESSAGES.WAIVER_REQUIRED;
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!supabaseConfigured()) {
    console.error('register: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return json(500, { error: 'Registration is temporarily unavailable. Please try again later.' });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  if (body.website) return json(200, { ok: true, status: 'confirmed' }); // honeypot

  const problem = validate(body);
  if (problem) return json(400, { error: problem });

  const method = ['etransfer', 'stripe'].includes(body.payment_method) ? body.payment_method : null;
  if (method === 'stripe' && !process.env.STRIPE_SECRET_KEY) {
    return json(400, { error: 'Card payments are not available right now. Please choose e-Transfer.' });
  }

  let reg;
  try {
    reg = await rpc('create_registration', {
      p: {
        event_id: body.event_id,
        first_name: clean(body.first_name, 100),
        last_name: clean(body.last_name, 100),
        email: clean(body.email, 254),
        phone: clean(body.phone, 40),
        attendees: body.attendees.map((a) => ({ full_name: clean(a.full_name, 150), date_of_birth: clean(a.date_of_birth, 10) })),
        waiver_accepted: true,
        payment_method: method,
        etransfer_code: clean(body.etransfer_code, 100),
      },
    });
  } catch (err) {
    if (MESSAGES[err.code]) return json(409, { error: MESSAGES[err.code] });
    console.error('register: create_registration failed', err.message);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }

  const person = { email: clean(body.email, 254).toLowerCase(), first_name: clean(body.first_name), last_name: clean(body.last_name) };
  const result = {
    ok: true,
    registration_id: reg.id,
    status: reg.status,
    payment_method: reg.payment_method,
    amount_cents: reg.amount_cents,
    quantity: reg.quantity,
    attendee_instructions: reg.attendee_instructions,
  };

  if (reg.payment_method !== 'stripe') {
    await addRegistrant(person);
    return json(200, result);
  }

  // Card payment: send them to Stripe Checkout. The webhook confirms the registration.
  const site = (process.env.URL || new URL(req.url).origin).replace(/\/+$/, '');
  const back = `${site}/event.html?id=${encodeURIComponent(body.event_id)}&registration=${reg.id}`;
  try {
    const session = await stripe('checkout/sessions', {
      mode: 'payment',
      customer_email: person.email,
      client_reference_id: reg.id,
      metadata: { registration_id: reg.id, event_id: body.event_id },
      line_items: {
        0: {
          quantity: reg.quantity,
          price_data: { currency: 'cad', unit_amount: reg.unit_cents, product_data: { name: reg.event_title } },
        },
      },
      success_url: `${back}&paid=1`,
      cancel_url: `${back}&cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    });
    await update('event_registrations', `id=eq.${reg.id}`, { stripe_session_id: session.id });
    return json(200, { ...result, checkout_url: session.url });
  } catch (err) {
    console.error('register: stripe checkout failed', err.message);
    await update('event_registrations', `id=eq.${reg.id}`, { status: 'cancelled' }).catch(() => {});
    return json(502, { error: 'Card payments are not available right now. Please try again or choose e-Transfer.' });
  }
};

export const config = { path: '/api/register' };
