// Store page: grid of the products the admin has made live.
(() => {
  const { products, esc, priceRange } = window.LXStore;
  const grid = document.getElementById('store-grid');
  const empty = document.getElementById('store-empty');

  const card = (p) => `
    <a class="shop-card" href="store-product.html?id=${encodeURIComponent(p.id)}">
      <div class="shop-card-img">${p.thumbnail_url ? `<img src="${esc(p.thumbnail_url)}" alt="${esc(p.name)}" loading="lazy"/>` : ''}</div>
      <div class="shop-card-body">
        <h2 class="shop-card-name">${esc(p.name)}</h2>
        <div class="shop-card-price">${esc(priceRange(p))}</div>
      </div>
    </a>`;

  products()
    .then((rows) => {
      const sellable = rows.filter((p) => p.variants.some((v) => v.available !== false));
      grid.innerHTML = sellable.map(card).join('');
      empty.hidden = sellable.length > 0;
    })
    .catch(() => {
      grid.innerHTML = '';
      empty.hidden = false;
      empty.querySelector('.empty-title').textContent = "The store couldn't be loaded.";
      empty.querySelector('.empty-sub').textContent = 'Please refresh the page, or try again in a little while.';
    });
})();
