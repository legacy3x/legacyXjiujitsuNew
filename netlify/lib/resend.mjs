// Adds a person to the Resend contacts list. Signing up twice is treated as success.
// Needs RESEND_API_KEY; optional segment: segmentId argument or RESEND_SEGMENT_ID.

export async function addContact({ email, firstName, lastName, segmentId = process.env.RESEND_SEGMENT_ID }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const contact = { email, unsubscribed: false };
  if (firstName) contact.first_name = firstName;
  if (lastName) contact.last_name = lastName;
  if (segmentId) contact.segments = [{ id: segmentId }];

  const res = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (res.ok) return;
  const detail = await res.json().catch(() => ({}));
  if (/already exist/i.test(detail.message || '')) return;
  throw new Error(`Resend ${res.status}: ${detail.message || 'unknown error'}`);
}

// Event registrants go to their own segment when RESEND_EVENTS_SEGMENT_ID is set.
export async function addRegistrant(reg) {
  try {
    await addContact({
      email: reg.email,
      firstName: reg.first_name,
      lastName: reg.last_name,
      segmentId: process.env.RESEND_EVENTS_SEGMENT_ID || process.env.RESEND_SEGMENT_ID,
    });
  } catch (err) {
    // A mailing-list hiccup must never undo a registration.
    console.error('resend: could not add registrant', err.message);
  }
}

// Sends a plain-text email. `from` must be on a domain verified in Resend; until
// legacyxjiujitsu.com is verified we fall back to Resend's shared sender, which only
// delivers to the Resend account's own address.
export async function sendEmail({ to, subject, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  const from = process.env.CONTACT_FROM_EMAIL || 'Legacy X Website <website@legacyxjiujitsu.com>';

  const send = (sender) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: sender, to: [to], reply_to: replyTo, subject, text }),
  });

  let res = await send(from);
  if (res.status === 403) res = await send('Legacy X Website <onboarding@resend.dev>');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`Resend ${res.status}: ${detail.message || 'unknown error'}`);
  }
}
