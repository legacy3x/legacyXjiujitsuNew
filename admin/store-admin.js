// Store manager for /admin: Printful products, website orders, and store settings.
// Product and order changes are live immediately (the store pages read the database directly).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents, currency = 'CAD') => new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);
const stamp = (iso) => new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const FULFILLMENT = {
  not_sent: ['Not sent to Printful', 'wait'], error: ['Printful error', 'wait'], draft: ['Draft — needs your OK', 'wait'],
  pending: ['Sent to Printful', 'on'], inreview: ['In review', 'on'], inprocess: ['Being made', 'on'],
  partial: ['Partly shipped', 'on'], fulfilled: ['Shipped', 'on'], onhold: ['On hold', 'wait'],
  failed: ['Failed', 'wait'], canceled: ['Cancelled', 'off'],
};
const PAYMENT = { paid: ['Paid', 'on'], pending: ['Not paid', 'off'], cancelled: ['Abandoned', 'off'] };

export function mountStore({ sb, root, setStatus, shrinkImage }) {
  let tab = 'products';
  let products = [];
  let storeFilter = '';
  let showUnpaid = false;

  async function api(action, payload = {}) {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch('/api/store-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function shell(body) {
    const t = (id, label) => `<button class="btn btn-sm${tab === id ? ' btn-blue' : ''}" data-tab="${id}">${label}</button>`;
    root.innerHTML = `
      <div class="main-head"><h1>Store</h1><a href="/store.html" target="_blank" rel="noopener">View store ↗</a></div>
      <p class="hint">Products come from your Printful stores. Changes here are live right away — no need to press Publish site.</p>
      <p class="tabs" style="display:flex;gap:6px;margin-bottom:22px;">${t('products', 'Products')}${t('orders', 'Orders')}${t('settings', 'Settings')}</p>
      <div id="store-body">${body}</div>`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; show(); }));
    return root.querySelector('#store-body');
  }

  const missingSetup = (error) => `<p class="empty">Could not load the store: ${esc(error.message)}. Has <code>supabase/store.sql</code> been run?</p>`;

  // ── Products ──
  async function showProducts() {
    shell('<p class="loading">Loading products…</p>');
    const { data, error } = await sb.from('store_products').select('*').order('name');
    if (error) return shell(missingSetup(error));
    products = data;
    renderProducts();
  }

  function renderProducts(progress = '') {
    const stores = [...new Map(products.map((p) => [String(p.printful_store_id), p.printful_store_name || `Store ${p.printful_store_id}`]))];
    const shown = products.filter((p) => !storeFilter || String(p.printful_store_id) === storeFilter);
    const rows = shown.map((p) => {
      const sellable = p.variants.filter((v) => v.available !== false).length;
      const price = p.min_price_cents === p.max_price_cents ? money(p.min_price_cents, p.currency) : `${money(p.min_price_cents, p.currency)} – ${money(p.max_price_cents, p.currency)}`;
      return `
        <tr data-id="${p.id}">
          <td style="width:64px;">${p.thumbnail_url ? `<img src="${esc(p.thumbnail_url)}" alt="" style="width:56px;height:56px;object-fit:cover;background:#f4f5f7;"/>` : ''}</td>
          <td><strong>${esc(p.name)}</strong><div class="sub">${esc(p.printful_store_name || `Store ${p.printful_store_id}`)} · ${sellable} of ${p.variants.length} variant${p.variants.length === 1 ? '' : 's'} for sale</div>
            ${sellable ? '' : '<div class="sub warn">No retail price set in Printful — it can\'t be sold yet.</div>'}</td>
          <td>${sellable ? esc(price) : '—'}</td>
          <td><label class="check"><input type="checkbox" data-act="live" ${p.live ? 'checked' : ''} ${sellable ? '' : 'disabled'}/> <span class="pill ${p.live ? 'on' : 'off'}">${p.live ? 'Live' : 'Hidden'}</span></label></td>
          <td class="actions"><button class="btn btn-sm" data-act="describe">Details &amp; photos</button> <button class="btn btn-sm btn-danger" data-act="remove">Remove</button></td>
        </tr>`;
    }).join('');

    const body = shell(`
      <p style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:18px;">
        <button class="btn btn-primary" id="st-sync">Sync from Printful</button>
        ${stores.length > 1 ? `<select class="field-input" id="st-filter" style="width:auto;"><option value="">All stores</option>${stores.map(([id, name]) => `<option value="${esc(id)}"${storeFilter === id ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select>` : ''}
        <span class="sub" id="st-progress" role="status">${esc(progress)}</span>
      </p>
      ${products.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th></th><th>Product</th><th>Price</th><th>On website</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="empty">No products yet. Press <strong>Sync from Printful</strong> to pull in the products from your Printful stores.</p>'}`);

    body.querySelector('#st-sync').addEventListener('click', sync);
    body.querySelector('#st-filter')?.addEventListener('change', (e) => { storeFilter = e.target.value; renderProducts(); });
    body.querySelectorAll('tr[data-id]').forEach((tr) => {
      const p = products.find((x) => x.id === tr.dataset.id);
      tr.querySelector('[data-act="live"]').addEventListener('change', async (e) => {
        const { error } = await sb.from('store_products').update({ live: e.target.checked }).eq('id', p.id);
        if (error) { setStatus(`Update failed — ${error.message}`, 'err'); e.target.checked = p.live; return; }
        p.live = e.target.checked;
        setStatus(p.live ? `"${p.name}" is now live on the store.` : `"${p.name}" is hidden from the store.`, 'ok');
        renderProducts();
      });
      tr.querySelector('[data-act="describe"]').addEventListener('click', () => describe(p));
      tr.querySelector('[data-act="remove"]').addEventListener('click', async () => {
        if (!confirm(`Remove "${p.name}" from the website's product list? (It stays in Printful; a sync brings it back.)`)) return;
        const { error } = await sb.from('store_products').delete().eq('id', p.id);
        if (error) return setStatus(`Remove failed — ${error.message}`, 'err');
        products = products.filter((x) => x.id !== p.id);
        renderProducts();
      });
    });
  }

  function describe(p) {
    const body = shell(`
      <p style="margin-bottom:14px;"><button class="link-btn" id="st-back" style="margin:0;">← All products</button></p>
      <div class="ev-form">
        <div class="field full"><label for="st-desc">Description for “${esc(p.name)}”</label>
          <textarea class="field-input" id="st-desc" rows="8">${esc(p.description)}</textarea>
          <small>Shown on the product page. Leave a blank line between paragraphs.</small></div>
        <div class="form-actions" style="margin-top:14px;"><button class="btn btn-primary" id="st-save">Save description</button></div>
        <div class="field full" style="margin-top:28px;"><label>Extra photos</label>
          <div id="st-photos" style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 12px;"></div>
          <input type="file" id="st-photo-file" accept="image/*" multiple hidden/>
          <button class="btn" id="st-photo-add" type="button">Add photos</button>
          <small>Shown as small pictures under the main photo on the product page, in this order. The main photo still comes from Printful and changes with the colour picked. Square photos, about 1200 × 1200, look best. Saved as soon as you add, move or remove one.</small></div>
      </div>`);

    // Extra photos: stored in the site-photos bucket, their addresses saved on the product.
    const savePhotos = async (next) => {
      const { error } = await sb.from('store_products').update({ photos: next }).eq('id', p.id);
      if (error) { setStatus(`Photos not saved — ${error.message}. Has supabase/add-store-photos.sql been run?`, 'err'); return false; }
      p.photos = next;
      drawPhotos();
      return true;
    };
    const drawPhotos = () => {
      const list = p.photos || [];
      const box = body.querySelector('#st-photos');
      box.innerHTML = list.length ? list.map((src, i) => `
        <div data-i="${i}" style="width:112px;">
          <img src="${esc(src)}" alt="" style="width:112px;height:112px;object-fit:cover;background:#f4f5f7;display:block;"/>
          <div style="display:flex;gap:4px;margin-top:4px;">
            <button class="btn btn-sm" type="button" data-move="-1" title="Move earlier" aria-label="Move photo ${i + 1} earlier"${i === 0 ? ' disabled' : ''}>←</button>
            <button class="btn btn-sm" type="button" data-move="1" title="Move later" aria-label="Move photo ${i + 1} later"${i === list.length - 1 ? ' disabled' : ''}>→</button>
            <button class="btn btn-sm btn-danger" type="button" data-del title="Remove" aria-label="Remove photo ${i + 1}">✕</button>
          </div>
        </div>`).join('') : '<span class="sub">No extra photos yet.</span>';
    };
    drawPhotos();
    body.querySelector('#st-photos').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const i = Number(btn.closest('[data-i]').dataset.i);
      const next = [...(p.photos || [])];
      if (btn.dataset.move) {
        const j = i + Number(btn.dataset.move);
        [next[i], next[j]] = [next[j], next[i]];
        await savePhotos(next);
      } else if (confirm('Remove this photo from the product page?')) {
        const [gone] = next.splice(i, 1);
        if (await savePhotos(next)) {
          const path = gone.split('/site-photos/')[1];
          if (path) sb.storage.from('site-photos').remove([decodeURIComponent(path)]); // tidy up; fine if it fails
          setStatus('Photo removed.', 'ok');
        }
      }
    });
    const addBtn = body.querySelector('#st-photo-add');
    const fileInput = body.querySelector('#st-photo-file');
    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files];
      fileInput.value = '';
      if (!files.length) return;
      addBtn.disabled = true;
      const next = [...(p.photos || [])];
      let failed = 0;
      for (const [n, file] of files.entries()) {
        setStatus(`Uploading photo ${n + 1} of ${files.length}…`);
        try {
          const { blob, ext, type } = await shrinkImage(file);
          const path = `store/${p.id}/${Date.now()}-${n}.${ext}`;
          const up = await sb.storage.from('site-photos').upload(path, blob, { contentType: type, cacheControl: '31536000' });
          if (up.error) throw up.error;
          next.push(sb.storage.from('site-photos').getPublicUrl(path).data.publicUrl);
        } catch (err) {
          failed++;
          console.error('photo upload failed', file.name, err);
        }
      }
      addBtn.disabled = false;
      if (next.length === (p.photos || []).length) return setStatus('Upload failed — please try again with a JPG or PNG photo.', 'err');
      if (await savePhotos(next)) setStatus(`${files.length - failed} photo${files.length - failed === 1 ? '' : 's'} added${failed ? ` (${failed} failed)` : ''}.`, failed ? 'warn' : 'ok');
    });

    body.querySelector('#st-back').addEventListener('click', () => renderProducts());
    body.querySelector('#st-save').addEventListener('click', async () => {
      const description = body.querySelector('#st-desc').value.trim();
      const { error } = await sb.from('store_products').update({ description }).eq('id', p.id);
      if (error) return setStatus(`Save failed — ${error.message}`, 'err');
      p.description = description;
      setStatus('Description saved.', 'ok');
      renderProducts();
    });
  }

  // Pull every product from every Printful store, one small request at a time.
  async function sync() {
    const say = (m) => { const el = root.querySelector('#st-progress'); if (el) el.textContent = m; };
    root.querySelector('#st-sync').disabled = true;
    setStatus('');
    try {
      say('Looking up your Printful stores…');
      const { stores } = await api('stores');
      const todo = [];
      // Stores connected to Shopify, Etsy etc. can't be read or ordered from through the API — skip them.
      const skipped = [];
      for (const s of stores) {
        try {
          for (let offset = 0; ; offset += 100) {
            say(`Reading products from ${s.name}…`);
            const page = await api('products', { store_id: s.id, offset });
            todo.push(...page.products.filter((p) => !p.ignored).map((p) => ({ store: s, product: p })));
            if (offset + 100 >= page.total) break;
          }
        } catch (err) {
          console.error('store skipped', s.name, err);
          skipped.push(`${s.name}${s.type ? ` (${s.type})` : ''}`);
        }
      }
      if (skipped.length === stores.length) {
        throw new Error(`none of your Printful stores can be used here: ${skipped.join(', ')}. The website needs a Printful store of the type "Manual order platform / API".`);
      }
      let failed = 0;
      for (const [i, { store, product }] of todo.entries()) {
        say(`Syncing ${i + 1} of ${todo.length}: ${product.name}`);
        try {
          await api('sync-product', { store_id: store.id, store_name: store.name, product_id: product.id });
        } catch (err) {
          failed++;
          console.error('sync failed', product.name, err);
        }
      }
      const used = stores.length - skipped.length;
      setStatus(`Synced ${todo.length - failed} product${todo.length - failed === 1 ? '' : 's'} from ${used} store${used === 1 ? '' : 's'}${failed ? ` (${failed} failed — try again)` : ''}${skipped.length ? `. Skipped ${skipped.join(', ')} — not a "Manual order platform / API" store` : ''}.`, failed || skipped.length ? 'warn' : 'ok');
      await showProducts();
    } catch (err) {
      setStatus(`Sync failed — ${err.message}`, 'err');
      say('');
      const btn = root.querySelector('#st-sync');
      if (btn) btn.disabled = false;
    }
  }

  // ── Orders ──
  async function showOrders() {
    shell('<p class="loading">Loading orders…</p>');
    const { data, error } = await sb.from('store_orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return shell(missingSetup(error));
    const orders = data.filter((o) => showUnpaid || o.payment_status === 'paid');

    const rows = orders.map((o) => {
      const [pay, payCls] = PAYMENT[o.payment_status] || [o.payment_status, 'off'];
      const [ful, fulCls] = FULFILLMENT[o.fulfillment_status] || [o.fulfillment_status, 'on'];
      const items = o.items.map((l) => `${l.quantity} × ${esc(l.name)}${l.variant_name ? ` <span class="sub" style="display:inline;">(${esc(l.variant_name)})</span>` : ''}`).join('<br/>');
      const r = o.recipient;
      const address = [r.address1, r.address2, `${r.city}${r.state_code ? `, ${r.state_code}` : ''} ${r.zip}`, r.country_code].filter(Boolean).map(esc).join(', ');
      const tracking = (o.printful_orders || []).flatMap((p) => p.shipments || []).filter((s) => s.tracking_url)
        .map((s) => `<a href="${esc(s.tracking_url)}" target="_blank" rel="noopener">Track (${esc(s.carrier || 'shipment')})</a>`).join('<br/>');
      const errors = (o.printful_orders || []).filter((p) => p.error).map((p) => esc(p.error)).join('; ');
      const sent = (o.printful_orders || []).some((p) => p.order_id);
      const paid = o.payment_status === 'paid';
      const acts = [
        paid && ['not_sent', 'error'].includes(o.fulfillment_status) ? '<button class="btn btn-sm btn-blue" data-act="order-send">Send to Printful</button>' : '',
        o.fulfillment_status === 'draft' ? '<button class="btn btn-sm btn-blue" data-act="order-confirm">Confirm order</button>' : '',
        sent ? '<button class="btn btn-sm" data-act="order-refresh">Refresh</button>' : '',
        sent && ['draft', 'pending', 'onhold', 'failed'].includes(o.fulfillment_status) ? '<button class="btn btn-sm btn-danger" data-act="order-cancel">Cancel</button>' : '',
      ].join(' ');
      return `
        <tr data-id="${o.id}" class="${paid ? '' : 'dim'}">
          <td><strong>${esc(o.order_number)}</strong><div class="sub">${esc(stamp(o.created_at))}</div></td>
          <td><strong>${esc(o.name)}</strong><div class="sub"><a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${o.phone ? `<br/>${esc(o.phone)}` : ''}<br/>${address}</div></td>
          <td>${items}</td>
          <td>${esc(money(o.total_cents, o.currency))}<div class="sub">incl. ${esc(money(o.shipping_cents, o.currency))} shipping</div></td>
          <td><span class="pill ${payCls}">${esc(pay)}</span>${paid ? `<div style="margin-top:6px;"><span class="pill ${fulCls}">${esc(ful)}</span></div>` : ''}
            ${tracking ? `<div class="sub">${tracking}</div>` : ''}${errors ? `<div class="sub warn">${errors}</div>` : ''}</td>
          <td class="actions">${acts}</td>
        </tr>`;
    }).join('');

    const body = shell(`
      <p class="hint">New paid orders arrive as <strong>Draft — needs your OK</strong>. Press <strong>Confirm order</strong> to send one to production; that's when Printful charges your account. Refunds are made in Stripe.</p>
      <p style="margin-bottom:16px;"><label class="check"><input type="checkbox" id="st-unpaid" ${showUnpaid ? 'checked' : ''}/> Also show unpaid / abandoned checkouts</label></p>
      ${orders.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="empty">No orders yet.</p>'}`);

    body.querySelector('#st-unpaid').addEventListener('change', (e) => { showUnpaid = e.target.checked; showOrders(); });
    body.querySelectorAll('tr[data-id] button').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('tr').dataset.id;
      const act = b.dataset.act;
      if (act === 'order-confirm' && !confirm('Send this order to Printful for production? Printful will charge your account for it.')) return;
      if (act === 'order-cancel' && !confirm('Cancel this order in Printful? (Refund the customer separately in Stripe.)')) return;
      b.disabled = true;
      setStatus('Talking to Printful…');
      try {
        const { errors } = await api(act, { order_id: id });
        setStatus(errors?.length ? `Printful said: ${errors.join('; ')}` : 'Done.', errors?.length ? 'err' : 'ok');
      } catch (err) {
        setStatus(`Failed — ${err.message}`, 'err');
      }
      showOrders();
    }));
  }

  // ── Settings ──
  async function showSettings() {
    shell('<p class="loading">Loading settings…</p>');
    const { data, error } = await sb.from('store_settings').select('*').eq('id', 1);
    if (error || !data?.length) return shell(missingSetup(error || new Error('no settings row')));
    const s = data[0];
    const body = shell(`
      <form class="ev-form" id="st-settings" novalidate>
        <div class="grid2">
          <label class="check field full"><input type="checkbox" id="s-auto" ${s.auto_confirm ? 'checked' : ''}/> Send paid orders to Printful automatically (otherwise each waits as a draft for you to confirm)</label>
          <div class="field"><label for="s-ship">Shipping charge</label><select class="field-input" id="s-ship">
            <option value="printful"${s.shipping_mode === 'printful' ? ' selected' : ''}>Printful's live rate for the address</option>
            <option value="flat"${s.shipping_mode === 'flat' ? ' selected' : ''}>Flat rate per order</option>
            <option value="free"${s.shipping_mode === 'free' ? ' selected' : ''}>Free shipping</option></select></div>
          <div class="field"><label for="s-flat">Flat rate ($)</label><input class="field-input" id="s-flat" type="number" min="0" step="0.01" value="${(s.flat_shipping_cents / 100).toFixed(2)}"/><small>Only used with “Flat rate per order”.</small></div>
          <div class="field"><label for="s-tax">Sales tax (%)</label><input class="field-input" id="s-tax" type="number" min="0" max="30" step="0.01" value="${Number(s.tax_percent)}"/><small>0 = no tax line at checkout. Ontario HST is 13.</small></div>
          <div class="field"><label for="s-taxlabel">Tax name</label><input class="field-input" id="s-taxlabel" value="${esc(s.tax_label)}"/></div>
          <div class="field full"><label for="s-countries">Countries you ship to</label><input class="field-input" id="s-countries" value="${esc((s.countries || []).join(', '))}" placeholder="Leave empty to ship worldwide"/>
            <small>Two-letter country codes separated by commas, e.g. <code>CA, US</code>. Empty = everywhere Printful ships.</small></div>
        </div>
        <div class="msg err" id="s-error" role="alert"></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Save settings</button></div>
      </form>`);
    body.querySelector('#st-settings').addEventListener('submit', async (e) => {
      e.preventDefault();
      const codes = body.querySelector('#s-countries').value.toUpperCase().split(/[\s,]+/).filter(Boolean);
      if (codes.some((c) => !/^[A-Z]{2}$/.test(c))) { body.querySelector('#s-error').textContent = 'Country codes must be two letters each, like CA or US.'; return; }
      const { data: saved, error: upErr } = await sb.from('store_settings').update({
        auto_confirm: body.querySelector('#s-auto').checked,
        shipping_mode: body.querySelector('#s-ship').value,
        flat_shipping_cents: Math.round(Number(body.querySelector('#s-flat').value || 0) * 100),
        tax_percent: Number(body.querySelector('#s-tax').value || 0),
        tax_label: body.querySelector('#s-taxlabel').value.trim() || 'Tax',
        countries: codes.length ? codes : null,
        updated_at: new Date().toISOString(),
      }).eq('id', 1).select('id');
      if (upErr || !saved?.length) return setStatus(`Save failed — ${upErr?.message || 'not allowed'}`, 'err');
      setStatus('Store settings saved.', 'ok');
      showSettings();
    });
  }

  function show() {
    setStatus('');
    return ({ products: showProducts, orders: showOrders, settings: showSettings })[tab]();
  }
  return { show };
}
