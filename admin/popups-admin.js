// Popup (poster) manager for /admin. The website reads popups straight from the database
// (js/popup.js), so changes are live right away — no Publish step.

// Pages a popup can be limited to, as js/popup.js names them.
const PAGES = [
  ['index', 'Home'], ['about', 'About'], ['our-lineage', 'Our Lineage'], ['etiquette', 'Dojo Etiquette'],
  ['programs', 'Programs'], ['programs/adult-jiu-jitsu', 'Adult Jiu-Jitsu'], ['programs/kids-jiu-jitsu', 'Kids Jiu-Jitsu'],
  ['programs/womens-only', "Women's Only"], ['programs/jiu-jitsu-over-55', 'Jiu-Jitsu Over 55'],
  ['programs/competition', 'Competition'], ['programs/private-lessons', 'Private Lessons'],
  ['corporate', 'Corporate'], ['schedule', 'Schedule'], ['instructors', 'Instructors'],
  ['events', 'Events'], ['event', 'Single event pages'], ['store', 'Store'], ['store-product', 'Store product pages'],
  ['store-cart', 'Cart'], ['faq', 'FAQ'], ['contact', 'Contact'], ['privacy', 'Privacy'], ['terms', 'Terms'],
  ['thank-you', 'Thank You (after sign-up)'],
];
const PAGE_NAME = Object.fromEntries(PAGES);
const FREQUENCY = [
  ['session', 'Once per visit (recommended)'],
  ['daily', 'Once a day'],
  ['once', 'Only once, ever'],
  ['always', 'Every page they open'],
];
const FREQ_NAME = Object.fromEntries(FREQUENCY);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const fmtStamp = (iso) => new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Mirrors public.public_popups() for display.
function state(p) {
  const now = Date.now();
  if (!p.active) return ['Off', 'off'];
  if (p.starts_at && now < new Date(p.starts_at)) return [`Starts ${fmtStamp(p.starts_at)}`, 'wait'];
  if (p.ends_at && now >= new Date(p.ends_at)) return ['Ended', 'off'];
  return ['Showing now', 'on'];
}

export function mountPopups({ sb, root, setStatus, shrinkImage }) {
  let popups = [];

  async function load() {
    root.innerHTML = '<p class="loading">Loading popups…</p>';
    const { data, error } = await sb.from('popups').select('*').order('created_at', { ascending: false });
    if (error) {
      root.innerHTML = `<p class="empty">Could not load popups: ${esc(error.message)}. Has <code>supabase/popups.sql</code> been run?</p>`;
      return;
    }
    popups = data;
    renderList();
  }

  function renderList() {
    const rows = popups.map((p) => {
      const [label, cls] = state(p);
      const when = `${p.starts_at ? fmtStamp(p.starts_at) : 'Now'} → ${p.ends_at ? fmtStamp(p.ends_at) : 'No end date'}`;
      const pages = p.pages?.length ? p.pages.map((id) => PAGE_NAME[id] || id).join(', ') : 'Every page';
      return `
        <tr data-id="${p.id}">
          <td><img src="${esc(p.image_url)}" alt="" style="width:60px;height:75px;object-fit:cover;border:1px solid var(--border);display:block;"/></td>
          <td><strong>${esc(p.name)}</strong><div class="sub">${esc(when)}</div></td>
          <td><span class="pill ${cls}">${esc(label)}</span></td>
          <td>${esc(pages)}<div class="sub">${esc(FREQ_NAME[p.frequency] || p.frequency)}</div>${p.link_url ? `<div class="sub">Links to ${esc(p.link_url)} (${p.new_tab ? 'new tab' : 'same tab'})</div>` : ''}</td>
          <td class="actions">
            <button class="btn btn-sm" data-act="edit">Edit</button>
            <button class="btn btn-sm" data-act="toggle">${p.active ? 'Turn off' : 'Turn on'}</button>
            <button class="btn btn-sm btn-danger" data-act="delete">Delete</button>
          </td>
        </tr>`;
    }).join('');

    root.innerHTML = `
      <div class="main-head"><h1>Popups</h1><a href="/" target="_blank" rel="noopener">View site ↗</a></div>
      <p class="hint">A poster that pops up when someone opens the website, with an X to close it. Changes go live right away — no need to press Publish site. If two popups are showing on the same page, the newest one shows.</p>
      <p style="margin-bottom:18px;"><button class="btn btn-primary" id="pp-new">+ New popup</button></p>
      ${popups.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Poster</th><th>Popup</th><th>Status</th><th>Where / how often</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : '<p class="empty">No popups yet. Create your first one.</p>'}`;

    root.querySelector('#pp-new').addEventListener('click', () => renderForm(null));
    root.querySelectorAll('tr[data-id]').forEach((tr) => {
      const p = popups.find((x) => x.id === tr.dataset.id);
      tr.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, p)));
    });
  }

  async function act(what, p) {
    if (what === 'edit') return renderForm(p);
    if (what === 'delete') {
      if (!confirm(`Delete the popup "${p.name}"? This can't be undone.`)) return;
      const { error } = await sb.from('popups').delete().eq('id', p.id);
      if (error) return setStatus(`Delete failed — ${error.message}`, 'err');
      removeUpload(p.image_url);
      setStatus('Popup deleted.', 'ok');
      return load();
    }
    const { error } = await sb.from('popups').update({ active: !p.active, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) return setStatus(`Update failed — ${error.message}`, 'err');
    setStatus(p.active ? 'Popup turned off.' : 'Popup turned on.', 'ok');
    load();
  }

  // Tidy up a poster we uploaded (posters shipped with the site live in /images and stay).
  function removeUpload(url) {
    const path = url?.split('/site-photos/')[1];
    if (path) sb.storage.from('site-photos').remove([decodeURIComponent(path)]); // fine if it fails
  }

  // ── Create / edit ──
  function renderForm(p) {
    setStatus('');
    const v = p || { active: true, frequency: 'session', pages: [], starts_at: new Date().toISOString() };
    let imageUrl = v.image_url || '';
    const everyPage = !v.pages?.length;
    root.innerHTML = `
      <div class="main-head"><h1>${p ? 'Edit popup' : 'New popup'}</h1></div>
      <p style="margin-bottom:20px;"><button class="link-btn" id="pp-back" style="margin:0;">← All popups</button></p>
      <form id="pp-form" class="ev-form" novalidate>
        <div class="grid2">
          <div class="field full"><label for="p-name">Name *</label><input class="field-input" id="p-name" value="${esc(v.name)}" placeholder="e.g. Black Friday Sale"/><small>Only shown here in the admin.</small></div>
          <div class="field full"><label>Poster *</label>
            <div class="photo-row">
              <img id="p-preview" alt="" style="width:160px;height:auto;max-height:220px;object-fit:contain;" ${imageUrl ? `src="${esc(imageUrl)}"` : 'hidden'}/>
              <div><input type="file" id="p-file" accept="image/*"/>
              <small>JPG or PNG. Best: an upright poster, about 1080 × 1350 px (4:5). It shrinks to fit phone screens.</small></div>
            </div></div>
          <div class="field full"><label for="p-alt">Poster text (for screen readers)</label><input class="field-input" id="p-alt" value="${esc(v.alt_text)}" placeholder="e.g. Black Friday Sale, November 25 to 30"/><small>A short sentence saying what the poster says.</small></div>
          <div class="field full"><label for="p-link">Link URL (optional)</label><input class="field-input" id="p-link" value="${esc(v.link_url)}" placeholder="e.g. /store.html or https://…"/><small>Leave empty if clicking the poster shouldn't go anywhere.</small>
            <label class="check" style="margin-top:10px;text-transform:none;letter-spacing:0;font-family:inherit;font-size:15px;color:inherit;"><input type="checkbox" id="p-newtab" ${v.new_tab ? 'checked' : ''}/> Open the link in a new tab</label></div>
          <div class="field"><label for="p-start">Start showing</label><input class="field-input" id="p-start" type="datetime-local" value="${toLocalInput(v.starts_at)}"/><small>Empty = start now.</small></div>
          <div class="field"><label for="p-end">Stop showing</label><input class="field-input" id="p-end" type="datetime-local" value="${toLocalInput(v.ends_at)}"/><small>Empty = keep showing until you turn it off.</small></div>
          <div class="field full"><label for="p-freq">How often each visitor sees it</label>
            <select class="field-input" id="p-freq">${FREQUENCY.map(([k, l]) => `<option value="${k}"${v.frequency === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
            <small>"Once per visit" shows it the first time someone lands on the site, then not again until they come back another day or in a new browser window.</small></div>
          <div style="grid-column:1 / -1;">
            <div class="field"><label>Show on</label></div>
            <label class="check"><input type="radio" name="p-where" value="all" ${everyPage ? 'checked' : ''}/> Every page</label>
            <label class="check" style="margin-top:8px;"><input type="radio" name="p-where" value="some" ${everyPage ? '' : 'checked'}/> Only these pages:</label>
            <div id="p-pages" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px 16px;margin:12px 0 0 28px;" ${everyPage ? 'hidden' : ''}>
              ${PAGES.map(([id, name]) => `<label class="check" style="font-size:14px;"><input type="checkbox" value="${id}" ${v.pages?.includes(id) ? 'checked' : ''}/> ${esc(name)}</label>`).join('')}
            </div>
          </div>
          <label class="check"><input type="checkbox" id="p-active" ${v.active ? 'checked' : ''}/> Turned on</label>
        </div>
        <div class="msg err" id="p-error" role="alert"></div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit" id="p-save">${p ? 'Save popup' : 'Create popup'}</button>
          <button class="btn" type="button" id="p-cancel">Cancel</button>
        </div>
      </form>`;

    const $ = (id) => root.querySelector(`#${id}`);
    $('pp-back').addEventListener('click', load);
    $('p-cancel').addEventListener('click', load);
    root.querySelectorAll('input[name="p-where"]').forEach((r) => r.addEventListener('change', () => {
      $('p-pages').hidden = root.querySelector('input[name="p-where"]:checked').value === 'all';
    }));

    let newFile = null;
    $('p-file').addEventListener('change', () => {
      const file = $('p-file').files[0];
      $('p-error').textContent = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) { $('p-error').textContent = 'Please choose an image file.'; $('p-file').value = ''; return; }
      if (file.size > MAX_PHOTO_BYTES) { $('p-error').textContent = 'That image is over 10 MB. Please choose a smaller one.'; $('p-file').value = ''; return; }
      newFile = file;
      $('p-preview').src = URL.createObjectURL(file);
      $('p-preview').hidden = false;
    });

    $('pp-form').addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const err = (m) => { $('p-error').textContent = m; };
      const name = $('p-name').value.trim();
      const starts = fromLocalInput($('p-start').value); const ends = fromLocalInput($('p-end').value);
      const link = $('p-link').value.trim();
      const some = root.querySelector('input[name="p-where"]:checked').value === 'some';
      const pages = some ? [...$('p-pages').querySelectorAll('input:checked')].map((c) => c.value) : [];
      if (!name) return err('Please give the popup a name.');
      if (!imageUrl && !newFile) return err('Please choose a poster image.');
      if (starts && ends && ends <= starts) return err('The stop date must be after the start date.');
      if (link && !/^(https?:\/\/|\/|[\w-]+(\/[\w-]+)*\.html)/i.test(link)) return err('The link should start with https://, or be a page on this site like /store.html.');
      if (some && !pages.length) return err('Tick at least one page, or choose "Every page".');

      $('p-save').disabled = true;
      setStatus('Saving popup…');
      try {
        const oldUrl = imageUrl;
        if (newFile) {
          // Keep posters sharp: shrink only very large images.
          const { blob, ext, type } = await shrinkImage(newFile, 2000);
          const path = `popups/${crypto.randomUUID()}.${ext}`;
          const up = await sb.storage.from('site-photos').upload(path, blob, { contentType: type, cacheControl: '31536000' });
          if (up.error) throw new Error(`Poster upload failed: ${up.error.message}`);
          imageUrl = sb.storage.from('site-photos').getPublicUrl(path).data.publicUrl;
        }
        const row = {
          name,
          image_url: imageUrl,
          alt_text: $('p-alt').value.trim(),
          link_url: link || null,
          new_tab: Boolean(link) && $('p-newtab').checked,
          starts_at: starts,
          ends_at: ends,
          pages,
          frequency: $('p-freq').value,
          active: $('p-active').checked,
          updated_at: new Date().toISOString(),
        };
        const res = p
          ? await sb.from('popups').update(row).eq('id', p.id).select('*')
          : await sb.from('popups').insert(row).select('*');
        if (res.error) throw new Error(res.error.message);
        if (!res.data?.length) throw new Error('Not allowed — is this an admin account?');
        if (newFile && oldUrl) removeUpload(oldUrl);
        const [label] = state(res.data[0]);
        setStatus(`Popup saved — ${label.toLowerCase()}.`, 'ok');
        load();
      } catch (x) {
        err(x.message);
        setStatus('');
        $('p-save').disabled = false;
      }
    });
  }

  return { show: load };
}
