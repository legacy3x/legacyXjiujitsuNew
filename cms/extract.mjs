// Reads the current content out of the tagged pages and writes:
//   content/seed.json   – the same content as JSON (used for local builds)
//   supabase/setup.sql  – tables, security rules, and the content as seed data
// Re-running the SQL is safe: it only adds content that isn't there yet.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sourcePages, pageId, scan, readValues } from './lib.mjs';

// Remove the page's code indentation from multi-line values so they read cleanly in the editor.
function dedent(value) {
  const lines = value.split('\n');
  const indents = lines.slice(1).filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return [lines[0], ...lines.slice(1).map((l) => l.slice(cut))].join('\n')
    // "Gi &amp; No-Gi" reads better as "Gi & No-Gi"; browsers treat a lone "& " the same way.
    .replace(/&amp;(?=\s)/g, '&');
}
const dedentFields = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, dedent(v)]));

const blocks = new Map(); // key -> { page, position, value }
const lists = new Map(); // key -> { page, position, items }

for (const rel of sourcePages()) {
  const page = pageId(rel);
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const scanned = scan(src);
  const values = readValues(src, scanned);
  // A key belongs to the page named in it (event.html reuses some events/ keys).
  const pageOf = (key) => (key.startsWith('site/') ? 'site' : key.split('/').slice(0, -2).join('/'));

  for (const b of scanned.blocks) {
    const value = dedent(values.blocks[b.key]);
    const prev = blocks.get(b.key);
    if (prev) {
      if (prev.value !== value) console.warn(`! ${b.key} differs on ${rel}; keeping the first value`);
      if (pageOf(b.key) === page) prev.position = b.range[0]; // order it by its own page
      continue;
    }
    blocks.set(b.key, { page: pageOf(b.key), position: b.range[0], value });
  }
  for (const l of scanned.lists) {
    if (lists.has(l.key)) continue;
    const items = values.lists[l.key].map((it) => ({ ...it, fields: dedentFields(it.fields) }));
    lists.set(l.key, { page: pageOf(l.key), position: l.range[0], items });
  }
}

const seed = {
  blocks: Object.fromEntries([...blocks].map(([k, v]) => [k, v])),
  lists: Object.fromEntries([...lists].map(([k, v]) => [k, v])),
};
fs.mkdirSync(path.join(ROOT, 'content'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'content/seed.json'), `${JSON.stringify(seed, null, 2)}\n`);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const sql = [];
sql.push(fs.readFileSync(path.join(ROOT, 'cms/schema.sql'), 'utf8').trimEnd());
sql.push('\n-- ── Content (only inserted if not already present) ──\n');

const blockRows = [...blocks].map(([key, b]) => `  (${q(key)}, ${q(b.page)}, ${b.position}, ${q(b.value)})`);
sql.push(`insert into public.cms_blocks (key, page, position, value) values\n${blockRows.join(',\n')}\non conflict (key) do nothing;\n`);

const fieldOrder = (l) => [...new Set(l.items.flatMap((it) => Object.keys(it.fields)))];
const listRows = [...lists].map(([key, l]) =>
  `  (${q(key)}, ${q(l.page)}, ${l.position}, array[${fieldOrder(l).map(q).join(', ')}]::text[])`);
sql.push(`insert into public.cms_lists (key, page, position, fields) values\n${listRows.join(',\n')}\non conflict (key) do nothing;\n`);

for (const [key, l] of lists) {
  const rows = l.items.map((it) => `  (${q(key)}, ${it.tpl}, ${it.sort}, ${q(JSON.stringify(it.fields))}::jsonb)`);
  sql.push(`insert into public.cms_items (list_key, tpl, sort, fields)\nselect * from (values\n${rows.join(',\n')}\n) v(list_key, tpl, sort, fields)\nwhere not exists (select 1 from public.cms_items where list_key = ${q(key)});\n`);
}

fs.mkdirSync(path.join(ROOT, 'supabase'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'supabase/setup.sql'), `${sql.join('\n')}\n`);

console.log(`${blocks.size} blocks, ${lists.size} lists, ${[...lists.values()].reduce((n, l) => n + l.items.length, 0)} list items`);
console.log('wrote content/seed.json and supabase/setup.sql');
