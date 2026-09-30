// Builds the site into dist/ with content from Supabase.
//   Netlify:  npm run build        (needs SUPABASE_URL and SUPABASE_ANON_KEY)
//   Locally:  npm run build:local  (uses content/seed.json, no network)
// If Supabase can't be reached the build fails, so Netlify keeps the last good version live.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sourcePages, render } from './lib.mjs';

const DIST = path.join(ROOT, 'dist');
const LOCAL = process.env.CONTENT_SOURCE === 'local';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

async function fetchAll(table, select, order) {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=${order}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        // Legacy JWT anon keys also go in Authorization; new sb_publishable_ keys must not.
        ...(SUPABASE_ANON_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
        Range: `${from}-${from + size - 1}`,
      },
    });
    if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < size) return rows;
  }
}

async function loadContent() {
  if (LOCAL) {
    const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/seed.json'), 'utf8'));
    return {
      blocks: Object.fromEntries(Object.entries(seed.blocks).map(([k, b]) => [k, b.value])),
      lists: Object.fromEntries(Object.entries(seed.lists).map(([k, l]) => [k, l.items])),
    };
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or run npm run build:local).');
  }
  const [blocks, lists, items] = await Promise.all([
    fetchAll('cms_blocks', 'key,value', 'key'),
    fetchAll('cms_lists', 'key', 'key'),
    fetchAll('cms_items', 'list_key,tpl,sort,fields', 'list_key,sort'),
  ]);
  const content = { blocks: Object.fromEntries(blocks.map((b) => [b.key, b.value])), lists: {} };
  // A list that exists in the database is rendered from its rows, even if it's now empty.
  for (const l of lists) content.lists[l.key] = [];
  for (const it of items) content.lists[it.list_key]?.push(it);
  return content;
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true });
}

const content = await loadContent();

fs.rmSync(DIST, { recursive: true, force: true });
for (const rel of sourcePages()) {
  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(fs.readFileSync(path.join(ROOT, rel), 'utf8'), content));
}
copyDir(path.join(ROOT, 'js'), path.join(DIST, 'js'));
copyDir(path.join(ROOT, 'admin'), path.join(DIST, 'admin'));

// Public connection details for the admin and the live events pages (the anon key is meant to be public).
const publicConfig = JSON.stringify({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
fs.mkdirSync(path.join(DIST, 'admin'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'admin/config.js'), `window.CMS_CONFIG = ${publicConfig};\n`);
fs.writeFileSync(path.join(DIST, 'js/site-config.js'), `window.SITE_CONFIG = ${publicConfig};\n`);

console.log(`Built ${sourcePages().length} pages into dist/ from ${LOCAL ? 'content/seed.json' : 'Supabase'}.`);
