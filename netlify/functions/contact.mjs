// Contact form → emails the message to the academy via Resend.
// Needs RESEND_API_KEY. Optional: CONTACT_TO_EMAIL (default info@legacyxjiujitsu.com),
// CONTACT_FROM_EMAIL (default "Legacy X Website <website@legacyxjiujitsu.com>").

import { sendEmail } from '../lib/resend.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const oneLine = (v) => v.replace(/[\r\n]+/g, ' ');

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  if (body.website) return json(200, { ok: true }); // honeypot: bots fill this, people never see it

  const name = oneLine(clean(body.name, 120));
  const email = clean(body.email, 254);
  const phone = oneLine(clean(body.phone, 40));
  const message = clean(body.message, 5000);
  if (!name || !message) return json(400, { error: 'Please fill in your name and message.' });
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Please enter a valid email address.' });

  try {
    await sendEmail({
      to: process.env.CONTACT_TO_EMAIL || 'info@legacyxjiujitsu.com',
      replyTo: email,
      subject: `Website message from ${name}`,
      text: `New message from the Legacy X website contact form\n\nName:  ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\n\n${message}\n`,
    });
  } catch (err) {
    console.error('contact: could not send', err.message);
    return json(502, { error: "Sorry, your message couldn't be sent right now." });
  }
  return json(200, { ok: true });
};

export const config = { path: '/api/contact' };
