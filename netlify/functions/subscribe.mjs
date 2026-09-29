// Newsletter signup → Resend contact.
// Needs RESEND_API_KEY set in Netlify (Site configuration → Environment variables).
// Optional: RESEND_SEGMENT_ID to also add each new contact to a Resend segment.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }

  // Honeypot: real visitors never see or fill this field.
  if (payload.website) return json(200, { ok: true });

  const email = String(payload.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json(400, { error: 'Please enter a valid email address.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return json(500, { error: 'Signup is temporarily unavailable. Please try again later.' });
  }

  const contact = { email, unsubscribed: false };
  if (process.env.RESEND_SEGMENT_ID) contact.segments = [{ id: process.env.RESEND_SEGMENT_ID }];

  const res = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    // Signing up twice isn't an error from the visitor's point of view.
    if (/already exist/i.test(detail.message || '')) return json(200, { ok: true });
    console.error('Resend contact create failed', res.status, detail);
    return json(502, { error: 'Something went wrong. Please try again.' });
  }

  return json(200, { ok: true });
};

export const config = { path: '/api/subscribe' };
