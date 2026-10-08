// Cart + checkout (store-cart.html). Shipping and totals come from /api/store-quote;
// payment happens on Stripe Checkout via /api/store-checkout.
(() => {
  const { products, esc, money, variantLabel, readCart, setQuantity, clearCart } = window.LXStore;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let lines = [];      // cart lines joined with product data
  let countries = [];
  let quoted = null;   // last quote from the server; cleared whenever cart or address changes

  const items = () => lines.map((l) => ({ variant_id: l.variant.id, quantity: l.quantity }));
  const field = (name) => $(`co-${name}`).value.trim();
  const recipient = () => ({
    name: field('name'), email: field('email'), phone: field('phone'),
    address1: field('address1'), address2: field('address2'), city: field('city'),
    state_code: field('state'), country_code: field('country'), zip: field('zip'),
  });

  function show(view) {
    for (const v of ['cart-loading', 'cart-empty', 'cart-main', 'cart-done']) $(v).hidden = v !== view;
  }

  function renderLines() {
    if (!lines.length) return show('cart-empty');
    const currency = lines[0].variant.currency;
    $('cart-lines').innerHTML = lines.map((l) => `
      <div class="cart-line" data-variant="${esc(l.variant.id)}">
        <div class="cart-line-img">${l.variant.image || l.product.thumbnail_url ? `<img src="${esc(l.variant.image || l.product.thumbnail_url)}" alt=""/>` : ''}</div>
        <div class="cart-line-info">
          <a class="cart-line-name" href="store-product.html?id=${encodeURIComponent(l.product.id)}">${esc(l.product.name)}</a>
          <div class="cart-line-variant">${esc(variantLabel(l.variant))}</div>
          <div class="cart-line-qty">
            <button type="button" data-step="-1" aria-label="One fewer">−</button>
            <span>${l.quantity}</span>
            <button type="button" data-step="1" aria-label="One more"${l.quantity >= 20 ? ' disabled' : ''}>+</button>
            <button type="button" class="cart-line-remove" data-step="remove">Remove</button>
          </div>
        </div>
        <div class="cart-line-total">${esc(money(l.variant.price_cents * l.quantity, currency))}</div>
      </div>`).join('');
    renderTotals();
    show('cart-main');
  }

  function renderTotals() {
    const currency = lines[0].variant.currency;
    const subtotal = lines.reduce((n, l) => n + l.variant.price_cents * l.quantity, 0);
    $('sum-subtotal').textContent = money(subtotal, currency);
    $('sum-shipping').textContent = quoted ? (quoted.shipping_cents ? money(quoted.shipping_cents, currency) : 'Free') : 'Calculated below';
    $('sum-days').textContent = quoted?.delivery_days ? `Estimated delivery: ${quoted.delivery_days.min}–${quoted.delivery_days.max} business days after it's made` : '';
    $('sum-tax-row').hidden = !(quoted && quoted.tax_cents > 0);
    if (quoted?.tax_cents) { $('sum-tax-label').textContent = quoted.tax_label; $('sum-tax').textContent = money(quoted.tax_cents, currency); }
    $('sum-total').textContent = money(quoted ? quoted.total_cents : subtotal, currency);
    $('sum-total-note').textContent = quoted ? currency : `${currency} · before shipping`;
    $('co-pay').disabled = !quoted;
    $('co-pay').textContent = quoted ? `Pay ${money(quoted.total_cents, currency)}` : 'Pay with card';
  }

  function invalidate() {
    if (!quoted) return;
    quoted = null;
    renderTotals();
  }

  function renderStates() {
    const country = countries.find((c) => c.code === field('country'));
    const states = country?.states || [];
    const wrap = $('co-state-wrap');
    wrap.hidden = states.length === 0;
    $('co-state').innerHTML = `<option value="">Choose…</option>${states.map((s) => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('')}`;
  }

  function validate(forPayment) {
    const r = recipient();
    const error = (m, id) => { $('co-error').textContent = m; $(id)?.focus(); return null; };
    $('co-error').textContent = '';
    if (!r.country_code) return error('Please choose your country.', 'co-country');
    if (!$('co-state-wrap').hidden && !r.state_code) return error('Please choose your province or state.', 'co-state');
    if (!r.address1) return error('Please enter your street address.', 'co-address1');
    if (!r.city) return error('Please enter your city.', 'co-city');
    if (!r.zip) return error('Please enter your postal / ZIP code.', 'co-zip');
    if (forPayment) {
      if (!/\S+\s+\S+/.test(r.name)) return error('Please enter your full name.', 'co-name');
      if (!$('co-email').checkValidity() || !r.email) return error('Please enter a valid email address.', 'co-email');
    }
    return r;
  }

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  async function getQuote() {
    const r = validate(false);
    if (!r) return;
    const btn = $('co-quote');
    btn.disabled = true;
    btn.textContent = 'Calculating…';
    try {
      quoted = await post('/api/store-quote', { items: items(), recipient: r });
      renderTotals();
    } catch (err) {
      $('co-error').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Calculate shipping';
    }
  }

  async function pay() {
    const r = validate(true);
    if (!r || !quoted) return;
    const btn = $('co-pay');
    btn.disabled = true;
    btn.textContent = 'Opening secure payment…';
    try {
      const data = await post('/api/store-checkout', { items: items(), recipient: r, website: $('co-website').value });
      if (data.checkout_url) location.href = data.checkout_url;
    } catch (err) {
      $('co-error').textContent = err.message;
      renderTotals();
    }
  }

  $('cart-lines').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-step]');
    if (!b) return;
    const id = b.closest('.cart-line').dataset.variant;
    const line = lines.find((l) => String(l.variant.id) === id);
    line.quantity = b.dataset.step === 'remove' ? 0 : line.quantity + Number(b.dataset.step);
    setQuantity(id, line.quantity);
    lines = lines.filter((l) => l.quantity > 0);
    quoted = null;
    renderLines();
  });
  $('co-country').addEventListener('change', () => { renderStates(); invalidate(); });
  for (const id of ['co-state', 'co-address1', 'co-address2', 'co-city', 'co-zip']) $(id).addEventListener('input', invalidate);
  $('co-quote').addEventListener('click', getQuote);
  $('co-form').addEventListener('submit', (e) => { e.preventDefault(); pay(); });

  async function init() {
    // Back from Stripe after paying
    if (params.get('paid') === '1') {
      clearCart();
      $('done-order').textContent = params.get('order') || '';
      return show('cart-done');
    }
    if (params.get('cancelled') === '1') {
      $('cart-notice').textContent = "Payment was cancelled — you haven't been charged. Your cart is still here.";
      $('cart-notice').hidden = false;
    }

    const cart = readCart();
    if (!cart.length) return show('cart-empty');
    try {
      const [rows, geo] = await Promise.all([products(), fetch('/api/store-quote').then((r) => (r.ok ? r.json() : { countries: [] }))]);
      const byVariant = new Map();
      for (const p of rows) for (const v of p.variants) if (v.available !== false) byVariant.set(String(v.id), { product: p, variant: v });
      lines = cart.map((i) => ({ ...byVariant.get(String(i.variant_id)), quantity: i.quantity })).filter((l) => l.variant);
      // Drop anything that's no longer sold.
      cart.filter((i) => !byVariant.has(String(i.variant_id))).forEach((i) => setQuantity(i.variant_id, 0));
      countries = geo.countries || [];
      $('co-country').innerHTML = `<option value="">Choose…</option>${countries.map((c) => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('')}`;
      if (countries.some((c) => c.code === 'CA')) { $('co-country').value = 'CA'; renderStates(); }
      renderLines();
    } catch {
      $('cart-loading').textContent = "Your cart couldn't be loaded. Please refresh the page.";
    }
  }

  init();
})();
