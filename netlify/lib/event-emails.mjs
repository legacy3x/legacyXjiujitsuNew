// Emails to people who register for an event:
//   pending  — an e-Transfer registration is waiting for us to check the payment
//   approved — the registration is confirmed (free, card paid, or e-Transfer marked paid)
// Each is sent at most once per registration; the *_emailed_at columns record it.
// Needs RESEND_API_KEY and a verified sending domain in Resend; optional EVENTS_FROM_EMAIL.

import { select, update } from './supabase.mjs';
import { sendEmail } from './resend.mjs';

const ACADEMY_EMAIL = 'info@legacyxjiujitsu.com';
const FROM = () => process.env.EVENTS_FROM_EMAIL || `Legacy X Jiu-Jitsu <${ACADEMY_EMAIL}>`;

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const METHOD = { free: 'Free', etransfer: 'e-Transfer', stripe: 'Card' };

function when(e) {
  if (!e.event_date) return 'Date to be announced';
  const [y, m, d] = e.event_date.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const time = (t) => {
    const [h, mm] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  return `${date}${e.start_time ? `, ${time(e.start_time)}${e.end_time ? ` – ${time(e.end_time)}` : ''}` : ''}`;
}

export async function loadRegistration(id) {
  const [reg] = await select('event_registrations',
    `id=eq.${encodeURIComponent(id)}&select=*,event_attendees(full_name,position),events(title,event_date,start_time,end_time,location,attendee_instructions)`);
  return reg || null;
}

function details(reg) {
  const e = reg.events;
  const people = [...(reg.event_attendees || [])].sort((a, b) => a.position - b.position).map((a) => `  • ${a.full_name}`);
  return [
    `Event: ${e.title}`,
    `When: ${when(e)}`,
    `Where: ${e.location}`,
    `Spots: ${reg.quantity}`,
    ...(people.length ? ['Registered:', ...people] : []),
    `Amount: ${reg.amount_cents ? `${money(reg.amount_cents)} (${METHOD[reg.payment_method] || reg.payment_method})` : 'Free'}`,
  ].join('\n');
}

const MESSAGES = {
  pending: (reg) => ({
    subject: `Registration received — pending approval: ${reg.events.title}`,
    text: [
      `Hi ${reg.first_name},`,
      '',
      `Thanks for registering for ${reg.events.title}. Your spot is being held while we confirm your e-Transfer${reg.etransfer_code ? ` (confirmation code ${reg.etransfer_code})` : ''}.`,
      'Your registration is pending approval. As soon as the payment arrives we will approve it and send you another email.',
      '',
      details(reg),
      '',
      `If you haven't sent the e-Transfer yet, please send ${money(reg.amount_cents)} to ${ACADEMY_EMAIL}.`,
      '',
      'Questions? Just reply to this email.',
      '',
      'Legacy X Jiu-Jitsu',
    ].join('\n'),
  }),
  approved: (reg) => ({
    subject: `You're registered: ${reg.events.title}`,
    text: [
      `Hi ${reg.first_name},`,
      '',
      `Good news — your registration for ${reg.events.title} has been approved. See you on the mat!`,
      '',
      details(reg),
      ...(reg.events.attendee_instructions ? ['', reg.events.attendee_instructions] : []),
      '',
      'Questions? Just reply to this email.',
      '',
      'Legacy X Jiu-Jitsu',
    ].join('\n'),
  }),
};

// Sends the email unless it already went out. Returns true if sent; throws if sending failed
// (and leaves it marked as not sent, so it can be tried again).
export async function sendRegistrationEmail(id, kind) {
  const column = `${kind}_emailed_at`;
  // Claim it first so two calls at once (e.g. Stripe retrying) can't both send.
  const claimed = await update('event_registrations', `id=eq.${encodeURIComponent(id)}&${column}=is.null`, { [column]: new Date().toISOString() });
  if (!claimed.length) return false;
  try {
    const reg = await loadRegistration(id);
    const { subject, text } = MESSAGES[kind](reg);
    await sendEmail({ to: reg.email, subject, text, replyTo: ACADEMY_EMAIL, from: FROM() });
    return true;
  } catch (err) {
    await update('event_registrations', `id=eq.${encodeURIComponent(id)}`, { [column]: null }).catch(() => {});
    throw err;
  }
}

// For places where an email failure must not break anything else (registering, Stripe webhook).
export async function trySendRegistrationEmail(id, kind) {
  try {
    return await sendRegistrationEmail(id, kind);
  } catch (err) {
    console.error(`event-emails: ${kind} email for ${id} failed —`, err.message);
    return false;
  }
}
