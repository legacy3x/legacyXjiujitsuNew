// Events page: loads published upcoming events from Supabase and renders them.
(() => {
  const { rpc, esc, dateParts, timeRange, price, when, spotsText, CATEGORY } = window.LXEvents;
  const list = document.getElementById('upcoming-events');
  const empty = document.getElementById('empty-state');
  let events = [];

  const shorten = (s, n = 220) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

  function action(e, featured) {
    const url = `event.html?id=${encodeURIComponent(e.id)}`;
    const badge = (text, cls = '') => `<span class="event-badge ${cls}">${esc(text)}</span>`;
    const parts = [];
    if (featured) parts.push(badge('Next Up'));
    switch (e.registration_state) {
      case 'open':
        parts.push(`<a href="${url}" class="event-btn">Register</a>`);
        break;
      case 'sold_out':
        parts.push(badge('Sold Out', 'muted-badge'), `<a href="${url}" class="event-btn ghost">Details</a>`);
        break;
      case 'not_open':
        parts.push(badge(`Opens ${when(e.registration_opens_at)}`, 'purple-badge'), `<a href="${url}" class="event-btn ghost">Details</a>`);
        break;
      default:
        parts.push(`<a href="${url}" class="event-btn ghost">Details</a>`);
    }
    return parts.join('\n');
  }

  function card(e, featured) {
    const d = dateParts(e.event_date);
    const spots = spotsText(e);
    const meta = [
      `<div class="event-meta-item"><span class="event-meta-icon">🕐</span> ${esc(timeRange(e))}</div>`,
      `<div class="event-meta-item"><span class="event-meta-icon">📍</span> ${esc(e.location)}</div>`,
      `<div class="event-meta-item"><span class="event-meta-icon">💳</span> ${esc(price(e))}</div>`,
    ].join('');
    const p = featured ? 'featured' : 'event';
    const tagClass = e.category === 'academy' ? 'event-tag purple' : 'event-tag';
    return `
      <div class="${featured ? 'featured-event' : 'event-card'}" data-category="${esc(e.category)}">
        <div class="${p}-date-col">
          <div class="${p}-month">${esc(d.month)}</div>
          <div class="${p}-day">${esc(d.day)}</div>
          <div class="${p}-year">${esc(d.year)}</div>
        </div>
        <div class="${featured ? 'featured-body' : 'event-body'}">
          <div class="${tagClass}"><span class="event-tag-dot"></span>${esc(CATEGORY[e.category] || 'Event')}</div>
          <${featured ? 'h2' : 'h3'} class="event-title"><a href="event.html?id=${encodeURIComponent(e.id)}">${esc(e.title)}</a></${featured ? 'h2' : 'h3'}>
          <div class="event-meta">${meta}</div>
          <p class="event-desc">${esc(shorten(e.description))}</p>
          ${spots ? `<div class="event-spots${e.spots_left <= 5 ? ' low' : ''}" style="margin-top:12px;">${esc(spots)}</div>` : ''}
        </div>
        <div class="${featured ? 'featured-cta-col' : 'event-action-col'}">
          ${action(e, featured)}
        </div>
      </div>`;
  }

  function render(category = 'all') {
    const shown = events.filter((e) => category === 'all' || e.category === category);
    list.innerHTML = shown.map((e, i) => card(e, i === 0 && category === 'all')).join('');
    empty.style.display = shown.length ? 'none' : 'block';
  }

  window.filterEvents = (category, btn) => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    render(category);
  };

  rpc('public_events')
    .then((rows) => { events = rows; render(); })
    .catch(() => {
      list.innerHTML = '';
      empty.style.display = 'block';
      empty.querySelector('.empty-title').textContent = "Events couldn't be loaded.";
      empty.querySelector('.empty-sub').textContent = 'Please refresh the page, or contact us for upcoming event details.';
    });
})();
