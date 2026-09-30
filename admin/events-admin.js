// Events & registrations manager for /admin. Event changes are live immediately
// (the public Events page reads the database directly), so there's no Publish step here.

const CATEGORIES = [['competition', 'Competition'], ['seminar', 'Seminar'], ['open-mat', 'Open Mat'], ['academy', 'Academy']];
const STATUS_LABEL = {
  confirmed: 'Confirmed', awaiting_verification: 'Check e-Transfer', pending_payment: 'Paying by card…', cancelled: 'Cancelled',
};
const METHOD_LABEL = { free: 'Free', etransfer: 'e-Transfer', stripe: 'Card (Stripe)' };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const fmtDate = (iso) => {
  if (!iso) return 'Date TBA';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtTime = (t) => {
  if (!t) return '';
  const [h, mm] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const fmtStamp = (iso) => new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const HOLDING = (r) => r.status === 'confirmed' || r.status === 'awaiting_verification'
  || (r.status === 'pending_payment' && Date.now() - new Date(r.created_at).getTime() < 35 * 60 * 1000);

// Mirrors public.event_registration_state() for display.
function regState(e, taken) {
  const now = Date.now();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  if (!e.registration_enabled) return ['Closed', 'off'];
  if (e.registration_opens_at && now < new Date(e.registration_opens_at)) return [`Opens ${fmtStamp(e.registration_opens_at)}`, 'wait'];
  if (e.registration_closes_at && now > new Date(e.registration_closes_at)) return ['Closed (deadline passed)', 'off'];
  if (e.event_date && e.event_date < today) return ['Closed (event passed)', 'off'];
  if (e.capacity != null && taken >= e.capacity) return ['Sold out', 'off'];
  return ['Open', 'on'];
}

export function mountEvents({ sb, root, setStatus }) {
  let events = [];
  let regs = [];

  async function load() {
    root.innerHTML = '<p class="loading">Loading events…</p>';
    const [{ data: ev, error: e1 }, { data: rg, error: e2 }] = await Promise.all([
      sb.from('events').select('*').order('event_date', { ascending: true, nullsFirst: false }),
      sb.from('event_registrations').select('id,event_id,quantity,status,amount_cents,created_at'),
    ]);
    if (e1 || e2) {
      root.innerHTML = `<p class="empty">Could not load events: ${esc((e1 || e2).message)}. Has <code>supabase/events.sql</code> been run?</p>`;
      return;
    }
    events = ev;
    regs = rg;
    renderList();
  }

  const taken = (id) => regs.filter((r) => r.event_id === id && HOLDING(r)).reduce((n, r) => n + r.quantity, 0);

  function renderList() {
    const rows = events.map((e) => {
      const t = taken(e.id);
      const [reg, cls] = regState(e, t);
      const toCheck = regs.filter((r) => r.event_id === e.id && r.status === 'awaiting_verification').length;
      const when = `${fmtDate(e.event_date)}${e.start_time ? ` · ${fmtTime(e.start_time)}` : ''}`;
      return `
        <tr data-id="${e.id}">
          <td><strong>${esc(e.title)}</strong><div class="sub">${esc(when)}</div></td>
          <td><span class="pill ${e.published ? 'on' : 'off'}">${e.published ? 'Published' : 'Draft'}</span></td>
          <td><span class="pill ${cls}">${esc(reg)}</span></td>
          <td>${t}${e.capacity != null ? ` / ${e.capacity}` : ''}${toCheck ? `<div class="sub warn">${toCheck} e-Transfer${toCheck > 1 ? 's' : ''} to check</div>` : ''}</td>
          <td class="actions">
            <button class="btn btn-sm" data-act="edit">Edit</button>
            <button class="btn btn-sm" data-act="regs">Registrations</button>
            <button class="btn btn-sm" data-act="publish">${e.published ? 'Unpublish' : 'Publish'}</button>
            <button class="btn btn-sm" data-act="toggle-reg">${e.registration_enabled ? 'Close registration' : 'Open registration'}</button>
            <button class="btn btn-sm btn-danger" data-act="delete">Delete</button>
          </td>
        </tr>`;
    }).join('');

    root.innerHTML = `
      <div class="main-head"><h1>View / Add Events</h1><a href="/events.html" target="_blank" rel="noopener">View events page ↗</a></div>
      <p class="hint">Event changes go live right away — no need to press Publish site.</p>
      <p style="margin-bottom:18px;"><button class="btn btn-primary" id="ev-new">+ New event</button></p>
      ${events.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Event</th><th>Visibility</th><th>Registration</th><th>Registered</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : '<p class="empty">No events yet. Create your first one.</p>'}`;

    root.querySelector('#ev-new').addEventListener('click', () => renderForm(null));
    root.querySelectorAll('tr[data-id]').forEach((tr) => {
      const e = events.find((x) => x.id === tr.dataset.id);
      tr.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, e)));
    });
  }

  async function act(what, e) {
    if (what === 'edit') return renderForm(e);
    if (what === 'regs') return renderRegistrations(e);
    if (what === 'delete') {
      const count = regs.filter((r) => r.event_id === e.id && r.status !== 'cancelled').length;
      const warning = count ? `\n\nThis also deletes its ${count} registration${count > 1 ? 's' : ''}.` : '';
      if (!confirm(`Delete "${e.title}"? This can't be undone.${warning}`)) return;
      const { error } = await sb.from('events').delete().eq('id', e.id);
      if (error) return setStatus(`Delete failed — ${error.message}`, 'err');
      setStatus('Event deleted.', 'ok');
      return load();
    }
    const change = what === 'publish' ? { published: !e.published } : { registration_enabled: !e.registration_enabled };
    const { error } = await sb.from('events').update({ ...change, updated_at: new Date().toISOString() }).eq('id', e.id);
    if (error) return setStatus(`Update failed — ${error.message}`, 'err');
    setStatus('Saved — live on the site now.', 'ok');
    load();
  }

  // ── Create / edit ──
  function renderForm(e) {
    setStatus('');
    const v = e || { category: 'academy', location: '27 Bysham Park Drive (Unit 1), Woodstock, ON', cost_cents: 0, registration_enabled: true, published: false };
    let photoUrl = v.photo_url || '';
    root.innerHTML = `
      <div class="main-head"><h1>${e ? 'Edit event' : 'New event'}</h1></div>
      <p style="margin-bottom:20px;"><button class="link-btn" id="ev-back" style="margin:0;">← All events</button></p>
      <form id="ev-form" class="ev-form" novalidate>
        <div class="grid2">
          <div class="field full"><label for="f-title">Event title *</label><input class="field-input" id="f-title" required value="${esc(v.title)}"/></div>
          <div class="field"><label for="f-category">Category</label><select class="field-input" id="f-category">
            ${CATEGORIES.map(([k, l]) => `<option value="${k}"${v.category === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="f-location">Location</label><input class="field-input" id="f-location" value="${esc(v.location)}"/></div>
          <div class="field"><label for="f-date">Event date</label><input class="field-input" id="f-date" type="date" value="${esc((v.event_date || '').slice(0, 10))}"/><small>Leave empty for "Date TBA".</small></div>
          <div class="field"><div class="grid2 tight">
            <div><label for="f-start">Start time</label><input class="field-input" id="f-start" type="time" value="${esc((v.start_time || '').slice(0, 5))}"/></div>
            <div><label for="f-end">End time</label><input class="field-input" id="f-end" type="time" value="${esc((v.end_time || '').slice(0, 5))}"/></div>
          </div></div>
          <div class="field full"><label for="f-desc">Description</label><textarea class="field-input" id="f-desc" rows="6">${esc(v.description)}</textarea></div>
          <div class="field full"><label>Event photo</label>
            <div class="photo-row">
              <img id="f-photo-preview" alt="" ${photoUrl ? `src="${esc(photoUrl)}"` : 'hidden'}/>
              <div><input type="file" id="f-photo" accept="image/*"/>
              <button type="button" class="btn btn-sm" id="f-photo-remove" ${photoUrl ? '' : 'hidden'}>Remove photo</button>
              <small>JPG or PNG, up to 5 MB.</small></div>
            </div></div>
          <div class="field"><label for="f-cost">Cost per person ($)</label><input class="field-input" id="f-cost" type="number" min="0" step="0.01" value="${(v.cost_cents / 100).toFixed(2)}"/><small>0 = free.</small></div>
          <div class="field"><label for="f-capacity">Total capacity</label><input class="field-input" id="f-capacity" type="number" min="1" step="1" value="${v.capacity ?? ''}"/><small>Leave empty for unlimited.</small></div>
          <div class="field"><label for="f-opens">Registration opens</label><input class="field-input" id="f-opens" type="datetime-local" value="${toLocalInput(v.registration_opens_at)}"/><small>Empty = open now.</small></div>
          <div class="field"><label for="f-closes">Registration closes</label><input class="field-input" id="f-closes" type="datetime-local" value="${toLocalInput(v.registration_closes_at)}"/><small>Empty = open until the event date.</small></div>
          <div class="field full"><label for="f-instr">Additional instructions for attendees</label><textarea class="field-input" id="f-instr" rows="4">${esc(v.attendee_instructions)}</textarea><small>Shown on the event page and after someone registers.</small></div>
          <label class="check"><input type="checkbox" id="f-reg" ${v.registration_enabled ? 'checked' : ''}/> Registration open</label>
          <label class="check"><input type="checkbox" id="f-pub" ${v.published ? 'checked' : ''}/> Published (visible on the website)</label>
        </div>
        <div class="msg err" id="f-error" role="alert"></div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit" id="f-save">${e ? 'Save event' : 'Create event'}</button>
          <button class="btn" type="button" id="f-cancel">Cancel</button>
        </div>
      </form>`;

    const $ = (id) => root.querySelector(`#${id}`);
    const back = () => load();
    $('ev-back').addEventListener('click', back);
    $('f-cancel').addEventListener('click', back);
    root.querySelectorAll('textarea').forEach((t) => {
      const fit = () => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; };
      requestAnimationFrame(fit);
      t.addEventListener('input', fit);
    });

    let newPhoto = null;
    $('f-photo').addEventListener('change', () => {
      const file = $('f-photo').files[0];
      $('f-error').textContent = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) { $('f-error').textContent = 'Please choose an image file.'; $('f-photo').value = ''; return; }
      if (file.size > MAX_PHOTO_BYTES) { $('f-error').textContent = 'That photo is over 5 MB. Please choose a smaller one.'; $('f-photo').value = ''; return; }
      newPhoto = file;
      $('f-photo-preview').src = URL.createObjectURL(file);
      $('f-photo-preview').hidden = false;
      $('f-photo-remove').hidden = false;
    });
    $('f-photo-remove').addEventListener('click', () => {
      newPhoto = null;
      photoUrl = '';
      $('f-photo').value = '';
      $('f-photo-preview').hidden = true;
      $('f-photo-remove').hidden = true;
    });

    $('ev-form').addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const err = (m) => { $('f-error').textContent = m; };
      const title = $('f-title').value.trim();
      const start = $('f-start').value; const end = $('f-end').value;
      const opens = fromLocalInput($('f-opens').value); const closes = fromLocalInput($('f-closes').value);
      const cost = Math.round(Number($('f-cost').value || 0) * 100);
      const cap = $('f-capacity').value ? Number($('f-capacity').value) : null;
      if (!title) return err('Please enter an event title.');
      if (end && !start) return err('Please add a start time too.');
      if (start && end && end <= start) return err('The end time must be after the start time.');
      if (opens && closes && closes <= opens) return err('Registration must close after it opens.');
      if (!(cost >= 0)) return err('Please enter a valid cost.');
      if (cap != null && !(Number.isInteger(cap) && cap > 0)) return err('Capacity must be a whole number above 0, or empty for unlimited.');

      $('f-save').disabled = true;
      setStatus('Saving event…');
      try {
        if (newPhoto) {
          const ext = (newPhoto.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
          const path = `${crypto.randomUUID()}.${ext}`;
          const up = await sb.storage.from('event-photos').upload(path, newPhoto, { contentType: newPhoto.type, cacheControl: '31536000' });
          if (up.error) throw new Error(`Photo upload failed: ${up.error.message}`);
          photoUrl = sb.storage.from('event-photos').getPublicUrl(path).data.publicUrl;
        }
        const row = {
          title,
          category: $('f-category').value,
          location: $('f-location').value.trim() || 'Location TBA',
          event_date: $('f-date').value || null,
          start_time: start || null,
          end_time: end || null,
          description: $('f-desc').value.trim(),
          photo_url: photoUrl || null,
          cost_cents: cost,
          capacity: cap,
          registration_opens_at: opens,
          registration_closes_at: closes,
          attendee_instructions: $('f-instr').value.trim(),
          registration_enabled: $('f-reg').checked,
          published: $('f-pub').checked,
          updated_at: new Date().toISOString(),
        };
        const res = e
          ? await sb.from('events').update(row).eq('id', e.id).select('id')
          : await sb.from('events').insert(row).select('id');
        if (res.error) throw new Error(res.error.message);
        if (!res.data?.length) throw new Error('Not allowed — is this an admin account?');
        setStatus(row.published ? 'Event saved — live on the site now.' : 'Event saved as a draft.', 'ok');
        load();
      } catch (x) {
        err(x.message);
        setStatus('');
        $('f-save').disabled = false;
      }
    });
  }

  // ── Registrations ──
  async function renderRegistrations(e) {
    setStatus('');
    root.innerHTML = '<p class="loading">Loading registrations…</p>';
    const { data, error } = await sb.from('event_registrations')
      .select('*, event_attendees(full_name,date_of_birth,position)')
      .eq('event_id', e.id).order('created_at', { ascending: false });
    if (error) { root.innerHTML = `<p class="empty">Could not load registrations: ${esc(error.message)}</p>`; return; }

    const active = data.filter(HOLDING);
    const confirmedRevenue = data.filter((r) => r.status === 'confirmed').reduce((n, r) => n + r.amount_cents, 0);
    const rows = data.map((r) => {
      const people = [...(r.event_attendees || [])].sort((a, b) => a.position - b.position)
        .map((a) => `${esc(a.full_name)} <span class="sub">(${esc(a.date_of_birth)})</span>`).join('<br/>');
      const pay = `${METHOD_LABEL[r.payment_method]}${r.etransfer_code ? `<div class="sub">Code: <strong>${esc(r.etransfer_code)}</strong></div>` : ''}`;
      const actions = [
        r.status === 'awaiting_verification' ? '<button class="btn btn-sm btn-blue" data-act="confirm">Mark paid</button>' : '',
        r.status !== 'cancelled' ? '<button class="btn btn-sm btn-danger" data-act="cancel">Cancel</button>' : '',
      ].join(' ');
      return `
        <tr data-id="${r.id}" class="${r.status === 'cancelled' ? 'dim' : ''}">
          <td>${esc(fmtStamp(r.created_at))}</td>
          <td><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong><div class="sub"><a href="mailto:${esc(r.email)}">${esc(r.email)}</a><br/>${esc(r.phone)}</div></td>
          <td>${r.quantity}<div class="sub">${people}</div></td>
          <td>${pay}</td>
          <td>${money(r.amount_cents)}</td>
          <td><span class="pill ${r.status === 'confirmed' ? 'on' : r.status === 'cancelled' ? 'off' : 'wait'}">${STATUS_LABEL[r.status]}</span></td>
          <td class="actions">${actions}</td>
        </tr>`;
    }).join('');

    root.innerHTML = `
      <div class="main-head"><h1>${esc(e.title)}</h1></div>
      <p style="margin-bottom:12px;"><button class="link-btn" id="ev-back" style="margin:0;">← All events</button></p>
      <p class="hint">${active.reduce((n, r) => n + r.quantity, 0)} spot(s) taken${e.capacity != null ? ` of ${e.capacity}` : ''} · ${money(confirmedRevenue)} confirmed ·
        “Check e-Transfer” means someone entered a confirmation code — once the money arrives, press <strong>Mark paid</strong>.</p>
      <p style="margin-bottom:16px;"><button class="btn btn-sm" id="ev-csv" ${data.length ? '' : 'disabled'}>Download CSV</button></p>
      ${data.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>When</th><th>Registered by</th><th>People</th><th>Payment</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="empty">No registrations yet.</p>'}`;

    root.querySelector('#ev-back').addEventListener('click', load);
    root.querySelector('#ev-csv').addEventListener('click', () => downloadCsv(e, data));
    root.querySelectorAll('tr[data-id] button').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('tr').dataset.id;
      const status = b.dataset.act === 'confirm' ? 'confirmed' : 'cancelled';
      if (status === 'cancelled' && !confirm('Cancel this registration? Their spot will be released. (Refunds are handled separately.)')) return;
      const { error: upErr } = await sb.from('event_registrations').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
      if (upErr) return setStatus(`Update failed — ${upErr.message}`, 'err');
      setStatus(status === 'confirmed' ? 'Marked as paid.' : 'Registration cancelled.', 'ok');
      renderRegistrations(e);
    }));
  }

  function downloadCsv(e, data) {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Registered', 'Status', 'Payment', 'e-Transfer code', 'Amount', 'Buyer first name', 'Buyer last name', 'Email', 'Phone', 'Attendee', 'Date of birth']];
    for (const r of data) {
      for (const a of [...(r.event_attendees || [])].sort((x, y) => x.position - y.position)) {
        lines.push([r.created_at, STATUS_LABEL[r.status], METHOD_LABEL[r.payment_method], r.etransfer_code, (r.amount_cents / 100).toFixed(2),
          r.first_name, r.last_name, r.email, r.phone, a.full_name, a.date_of_birth]);
      }
    }
    const blob = new Blob([lines.map((l) => l.map(cell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${e.title.replace(/[^\w]+/g, '-').toLowerCase()}-registrations.csv`;
    a.click();
  }

  return { show: load };
}
