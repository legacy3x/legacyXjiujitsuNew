// Registration actions for the admin's Events section. Every call must come from a signed-in admin.
//   confirm {registration_id}  → mark an e-Transfer (or unfinished card) registration paid and email "approved"
//   email-approved {event_id}  → send the "approved" email to confirmed registrations that haven't had it
// Needs: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.

import { requireAdmin } from '../lib/admin-auth.mjs';
import { select, update } from '../lib/supabase.mjs';
import { sendRegistrationEmail } from '../lib/event-emails.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTIONS = {
  confirm: async ({ registration_id: id }) => {
    if (!UUID_RE.test(id || '')) return json(400, { error: 'Unknown registration.' });
    const rows = await update('event_registrations', `id=eq.${id}&status=in.(awaiting_verification,pending_payment)`, { status: 'confirmed' });
    if (!rows.length) return json(409, { error: 'This registration is not waiting for payment any more — refresh the page.' });
    try {
      await sendRegistrationEmail(id, 'approved');
      return json(200, { ok: true, emailed: true });
    } catch (err) {
      console.error('event-admin: approved email failed', err.message);
      return json(200, { ok: true, emailed: false, email_error: err.message });
    }
  },

  'email-approved': async ({ event_id: eventId }) => {
    if (!UUID_RE.test(eventId || '')) return json(400, { error: 'Unknown event.' });
    const regs = await select('event_registrations', `event_id=eq.${eventId}&status=eq.confirmed&approved_emailed_at=is.null&select=id`);
    let sent = 0;
    const failed = [];
    for (const r of regs) {
      try {
        if (await sendRegistrationEmail(r.id, 'approved')) sent++;
      } catch (err) {
        failed.push(err.message);
      }
    }
    if (failed.length) console.error('event-admin: approved emails failed', failed);
    return json(200, { ok: true, sent, failed: failed.length, email_error: failed[0] });
  },
};

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const denied = await requireAdmin(req);
  if (denied) return json(denied.status, { error: denied.error });
  const body = await req.json().catch(() => ({}));
  const action = ACTIONS[body.action];
  if (!action) return json(400, { error: 'Unknown action.' });
  try {
    return await action(body);
  } catch (err) {
    console.error('event-admin:', body.action, err.message);
    return json(502, { error: err.message });
  }
};

export const config = { path: '/api/event-admin' };
