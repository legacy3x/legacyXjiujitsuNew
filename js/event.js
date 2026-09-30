// Event detail + registration (event.html?id=<event id>).
(() => {
  const { rpc, esc, paragraphs, longDate, timeRange, money, price, when, spotsText, CATEGORY } = window.LXEvents;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const eventId = params.get('id');
  const MAX_PER_REGISTRATION = 20;
  let ev = null;

  function notice(html) {
    $('ev-notice').innerHTML = html;
    $('ev-notice').hidden = false;
  }

  function showClosed(title, text) {
    $('reg-form').hidden = true;
    $('reg-closed').innerHTML = `<strong>${esc(title)}</strong>${esc(text)}`;
    $('reg-closed').hidden = false;
  }

  function showDone(title, html) {
    $('reg-form').hidden = true;
    $('reg-closed').hidden = true;
    $('done-title').textContent = title;
    $('done-text').innerHTML = html;
    $('reg-done').hidden = false;
    if (ev?.attendee_instructions) $('ev-instructions-box').hidden = false;
    $('register').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderEvent() {
    document.title = `${ev.title} — Legacy X Jiu-Jitsu`;
    $('ev-crumb').textContent = ev.title;
    $('ev-title').textContent = ev.title;
    $('ev-category').textContent = CATEGORY[ev.category] || 'Event';
    if (ev.category === 'academy') $('ev-tag').classList.add('purple');
    $('ev-meta').innerHTML = [
      ['📅', longDate(ev.event_date)],
      ['🕐', timeRange(ev)],
      ['📍', ev.location],
    ].map(([i, t]) => `<div class="event-meta-item"><span class="event-meta-icon">${i}</span> ${esc(t)}</div>`).join('');

    if (ev.photo_url) {
      $('ev-photo').src = ev.photo_url;
      $('ev-photo').alt = ev.title;
      $('ev-photo').hidden = false;
    }
    $('ev-desc').innerHTML = paragraphs(ev.description);
    if (ev.attendee_instructions) {
      $('ev-instructions').innerHTML = paragraphs(ev.attendee_instructions);
      $('ev-instructions-box').hidden = false;
    }

    $('ev-price').innerHTML = ev.cost_cents > 0
      ? `${esc(money(ev.cost_cents))} <small>per person</small>`
      : 'Free';
    $('ev-spots').textContent = spotsText(ev);
  }

  function renderRegistration() {
    switch (ev.registration_state) {
      case 'not_open':
        return showClosed('Registration opens soon', `Registration opens ${when(ev.registration_opens_at)}.`);
      case 'sold_out':
        return showClosed('Sold out', 'This event is full. Contact us to ask about openings.');
      case 'closed':
        return showClosed('Registration closed', ev.event_date ? 'Registration for this event is closed.' : 'Registration details will be announced soon.');
      default:
        break;
    }

    const max = Math.min(MAX_PER_REGISTRATION, ev.spots_left ?? MAX_PER_REGISTRATION);
    $('quantity').innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
    $('payment-step').hidden = ev.cost_cents === 0;
    $('total-row').hidden = ev.cost_cents === 0;
    renderAttendees();
    updatePayment();
    $('reg-form').hidden = false;
  }

  // One name + date of birth per spot; keep what's already typed when the number changes.
  function renderAttendees() {
    const n = Number($('quantity').value);
    const box = $('attendees');
    const existing = [...box.querySelectorAll('.ev-person')].map((p) => ({
      name: p.querySelector('[data-f="full_name"]').value,
      dob: p.querySelector('[data-f="date_of_birth"]').value,
    }));
    const today = new Date().toISOString().slice(0, 10);
    box.innerHTML = Array.from({ length: n }, (_, i) => `
      <div class="ev-person">
        <div class="ev-person-title">Person ${i + 1}</div>
        <div class="form-group">
          <label class="form-label" for="p${i}-name">Full name</label>
          <input class="form-input" id="p${i}-name" data-f="full_name" autocomplete="off" value="${esc(existing[i]?.name || '')}" required/>
        </div>
        <div class="form-group">
          <label class="form-label" for="p${i}-dob">Date of birth</label>
          <input class="form-input" id="p${i}-dob" data-f="date_of_birth" type="date" min="1900-01-01" max="${today}" value="${esc(existing[i]?.dob || '')}" required/>
        </div>
      </div>`).join('');
    updatePayment();
  }

  function method() {
    return document.querySelector('input[name="payment_method"]:checked')?.value || 'etransfer';
  }

  function updatePayment() {
    const total = ev.cost_cents * Number($('quantity').value || 1);
    $('total').textContent = money(total);
    $('etransfer-amount').textContent = money(total);
    const etransfer = method() === 'etransfer';
    $('etransfer-box').hidden = !etransfer;
    $('reg-submit').textContent = ev.cost_cents > 0 && !etransfer ? 'Continue to payment' : 'Complete registration';
  }

  function collect() {
    const f = $('reg-form');
    const bad = [];
    const need = (el, ok) => { el.setAttribute('aria-invalid', ok ? 'false' : 'true'); if (!ok) bad.push(el); };

    const attendees = [...f.querySelectorAll('.ev-person')].map((p) => {
      const name = p.querySelector('[data-f="full_name"]');
      const dob = p.querySelector('[data-f="date_of_birth"]');
      need(name, /\S+\s+\S+/.test(name.value.trim()));
      need(dob, Boolean(dob.value) && dob.value <= dob.max);
      return { full_name: name.value.trim(), date_of_birth: dob.value };
    });
    need($('first_name'), Boolean($('first_name').value.trim()));
    need($('last_name'), Boolean($('last_name').value.trim()));
    need($('reg_email'), $('reg_email').checkValidity() && Boolean($('reg_email').value.trim()));
    need($('phone'), $('phone').value.replace(/\D/g, '').length >= 7);

    const paying = ev.cost_cents > 0;
    if (paying && method() === 'etransfer') need($('etransfer_code'), Boolean($('etransfer_code').value.trim()));

    if (bad.length) {
      bad[0].focus();
      const first = bad[0];
      if (first.dataset.f === 'full_name') return { error: 'Please enter a first and last name for each person.' };
      if (first.dataset.f === 'date_of_birth') return { error: 'Please enter a date of birth for each person.' };
      if (first === $('etransfer_code')) return { error: 'Please enter your e-Transfer confirmation code.' };
      return { error: 'Please fill in the highlighted fields.' };
    }
    if (!$('waiver').checked) return { error: 'Please accept the terms and waiver to register.' };

    return {
      body: {
        event_id: ev.id,
        attendees,
        first_name: $('first_name').value.trim(),
        last_name: $('last_name').value.trim(),
        email: $('reg_email').value.trim(),
        phone: $('phone').value.trim(),
        waiver_accepted: true,
        payment_method: paying ? method() : null,
        etransfer_code: paying && method() === 'etransfer' ? $('etransfer_code').value.trim() : '',
        website: f.elements.website.value,
      },
    };
  }

  async function submit(e) {
    e.preventDefault();
    $('reg-error').textContent = '';
    const { error, body } = collect();
    if (error) { $('reg-error').textContent = error; return; }

    const btn = $('reg-submit');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Working…';
    try {
      const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      if (data.checkout_url) { location.href = data.checkout_url; return; }

      const people = data.quantity === 1 ? '1 person' : `${data.quantity} people`;
      if (data.status === 'awaiting_verification') {
        showDone('Registration received!', `We've saved your spot for ${esc(people)} and will confirm once your e-Transfer of <strong>${esc(money(data.amount_cents))}</strong> arrives. We'll contact you at <strong>${esc(body.email)}</strong> if anything's missing.`);
      } else {
        showDone("You're registered!", `See you there! We've registered ${esc(people)} for ${esc(ev.title)}.`);
      }
    } catch (err) {
      $('reg-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function init() {
    if (!eventId) {
      $('ev-title').textContent = 'Event not found';
      return showClosed('Event not found', 'Please choose an event from the Events page.');
    }
    try {
      const rows = await rpc('public_event', { p_id: eventId });
      ev = rows[0];
    } catch {
      $('ev-title').textContent = "This event couldn't be loaded";
      return showClosed('Please try again', 'Refresh the page, or contact us for event details.');
    }
    if (!ev) {
      $('ev-title').textContent = 'Event not found';
      return showClosed('Event not found', 'This event is no longer available. Please choose another event from the Events page.');
    }

    renderEvent();

    // Back from Stripe Checkout
    if (params.get('paid') === '1') {
      return showDone('Payment received!', `Thank you — your registration for ${esc(ev.title)} is confirmed as soon as Stripe finishes processing the payment (usually right away).`);
    }
    if (params.get('cancelled') === '1' && params.get('registration')) {
      fetch('/api/registration-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: params.get('registration') }),
      }).catch(() => {});
      notice("Payment was cancelled, so your spot wasn't reserved. You can register again below.");
    }

    renderRegistration();
  }

  $('quantity').addEventListener('change', renderAttendees);
  document.querySelectorAll('input[name="payment_method"]').forEach((r) => r.addEventListener('change', updatePayment));
  $('reg-form').addEventListener('submit', submit);
  $('reg-form').addEventListener('input', (e) => e.target.setAttribute?.('aria-invalid', 'false'));

  init();
})();
