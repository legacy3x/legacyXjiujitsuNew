// Product page (store-product.html?id=<product id>): pick colour / size, add to cart.
(() => {
  const { products, esc, money, addToCart } = window.LXStore;
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id');
  let product = null;
  let variants = [];
  const choice = { color: null, size: null };

  const unique = (key) => [...new Set(variants.map((v) => v[key]).filter(Boolean))];
  // The variant matching the current colour + size (either may not apply to this product).
  const current = () => variants.find((v) => (!choice.color || v.color === choice.color) && (!choice.size || v.size === choice.size));

  function fail(title, text) {
    $('pd-title').textContent = title;
    $('pd-body').hidden = true;
    $('pd-missing').hidden = false;
    $('pd-missing-text').textContent = text;
  }

  function options(key, label) {
    const values = unique(key);
    const box = $(`pd-${key}`);
    box.hidden = values.length < 2;
    if (values.length < 2) { choice[key] = values[0] || null; return; }
    if (!values.includes(choice[key])) [choice[key]] = values;
    box.innerHTML = `<div class="pd-label">${label}: <strong>${esc(choice[key])}</strong></div><div class="pd-options">${
      values.map((val) => {
        // Grey out combinations that don't exist (e.g. a size not made in this colour).
        const other = key === 'color' ? 'size' : 'color';
        const exists = variants.some((v) => v[key] === val && (!choice[other] || v[other] === choice[other]));
        return `<button type="button" class="pd-option${val === choice[key] ? ' active' : ''}" data-key="${key}" data-value="${esc(val)}"${exists ? '' : ' disabled'}>${esc(val)}</button>`;
      }).join('')}</div>`;
  }

  function render() {
    options('color', 'Colour');
    options('size', 'Size');
    const v = current();
    $('pd-price').textContent = v ? money(v.price_cents, v.currency) : '';
    const img = v?.image || product.thumbnail_url;
    if (img) { $('pd-image').src = img; $('pd-image').alt = product.name; $('pd-image').hidden = false; }
    $('pd-add').disabled = !v;
    $('pd-add').textContent = v ? 'Add to cart' : 'Unavailable';
  }

  $('pd-body').addEventListener('click', (e) => {
    const b = e.target.closest('.pd-option');
    if (!b || b.disabled) return;
    choice[b.dataset.key] = b.dataset.value;
    // If the other option no longer fits, move it to one that does.
    if (!current()) {
      const other = b.dataset.key === 'color' ? 'size' : 'color';
      choice[other] = variants.find((v) => v[b.dataset.key] === b.dataset.value)?.[other] || null;
    }
    $('pd-added').hidden = true;
    render();
  });

  $('pd-add').addEventListener('click', () => {
    const v = current();
    if (!v) return;
    addToCart(v.id, Number($('pd-qty').value) || 1);
    $('pd-added').hidden = false;
  });

  async function init() {
    if (!id) return fail('Product not found', 'Please choose a product from the store.');
    let rows;
    try {
      rows = await products(`&id=eq.${encodeURIComponent(id)}`);
    } catch {
      return fail("This product couldn't be loaded", 'Please refresh the page, or try again in a little while.');
    }
    [product] = rows;
    variants = (product?.variants || []).filter((v) => v.available !== false);
    if (!product || !variants.length) return fail('Product not found', 'This product is no longer available. Please choose another from the store.');

    document.title = `${product.name} — Legacy X Jiu-Jitsu`;
    $('pd-crumb').textContent = product.name;
    $('pd-title').textContent = product.name;
    $('pd-desc').innerHTML = esc(product.description).split(/\n{2,}/).filter(Boolean).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
    $('pd-desc').hidden = !product.description;
    render();
    $('pd-body').hidden = false;
  }

  init();
})();
