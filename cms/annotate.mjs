// One-time helper: tags the editable text in every page with data-cms attributes
// so the build can swap in content from Supabase. Run with --write to save;
// without it, it prints what it would tag. Pages that are already tagged are skipped.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sourcePages, pageId, attr, parseDoc, walk } from './lib.mjs';

const WRITE = process.argv.includes('--write');

const INLINE = new Set(['br', 'em', 'strong', 'span', 'a', 'b', 'i', 'u', 'small', 'sup', 'sub', 'code']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'p', 'li', 'summary', 'td', 'th', 'blockquote', 'figcaption', 'dt', 'dd']);
const NEVER = new Set(['button', 'label', 'input', 'select', 'textarea', 'option', 'form', 'svg']);
const SKIP_ZONES = new Set(['head', 'nav', 'footer', 'script', 'style', 'form', 'svg']);
const SKIP_CLASS = /(^|\s)(breadcrumb|header-actions|hero-actions|oja-cta|prog-card-bottom|event-action-col|featured-cta-col|cta-col|stars|quote-stars|mobile-nav|filter-inner|toc)(\s|$)/;
const NO_ITEM_TAGS = new Set(['section', 'main', 'header', 'footer', 'article', 'body', 'html', 'nav']);
const ITEM_OK_WITHOUT_CLASS = new Set(['li', 'details', 'tr', 'dt', 'dd']);

const slug = (s) => s.toLowerCase().replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'main';
const cls = (n) => (attr(n, 'class') || '').trim();
const sig = (n) => `${n.tagName}.${cls(n).split(/\s+/)[0] || ''}`;
const elements = (n) => (n.content ? n.content.childNodes : n.childNodes || []).filter((c) => c.tagName);
const textOf = (n) => (n.nodeName === '#text' ? n.value : (n.childNodes || []).map(textOf).join(''));

function leafish(n) {
  return (n.childNodes || []).every((c) =>
    c.nodeName === '#text' || c.nodeName === '#comment' || (INLINE.has(c.tagName) && leafish(c)));
}

// Inline elements that still hold content worth editing on their own.
const INLINE_OK = /(^|\s)(faq-q-text|event-badge|prog-badge|program-row-tag)(\s|$)/;

function isEditable(n, parents) {
  if (!n.tagName || NEVER.has(n.tagName)) return false;
  if (INLINE.has(n.tagName) && !INLINE_OK.test(cls(n))) return false;
  if (!leafish(n) || !textOf(n).trim()) return false;
  if (parents.some((p) => SKIP_ZONES.has(p.tagName) || SKIP_CLASS.test(cls(p)))) return false;
  if (SKIP_CLASS.test(cls(n))) return false;
  return cls(n) !== '' || TEXT_TAGS.has(n.tagName);
}

// An element is a list item when it repeats among its siblings and the repeats
// sit next to each other (only whitespace/comments between them).
function itemGroup(n, parent) {
  if (!parent || NO_ITEM_TAGS.has(n.tagName) || ['body', 'main'].includes(parent.tagName)) return null;
  if (!cls(n) && !ITEM_OK_WITHOUT_CLASS.has(n.tagName)) return null;
  const kids = elements(parent);
  const same = kids.filter((k) => sig(k) === sig(n));
  if (same.length < 2) return null;
  const first = kids.indexOf(same[0]);
  const last = kids.indexOf(same.at(-1));
  if (kids.slice(first, last + 1).some((k) => sig(k) !== sig(n))) return null;
  return same;
}

// Section name for keys: nearest earlier "<!-- ── NAME ── -->" style comment.
function sectionTracker() {
  let current = 'main';
  return {
    see(node) {
      if (node.nodeName !== '#comment') return;
      const m = node.data.match(/──\s*([^─]+?)\s*─/) || node.data.match(/^\s*([A-Z][A-Z0-9 &'—/-]{2,})\s*$/);
      if (m) current = slug(m[1]);
    },
    get: () => current,
  };
}

function plan(page, src) {
  const doc = parseDoc(src);
  const inserts = []; // [offset, text]
  const tagAt = (node, text) => {
    const end = node.sourceCodeLocation.startTag.endOffset;
    const at = src[end - 2] === '/' ? end - 2 : end - 1;
    inserts.push([at, ` ${text}`]);
  };
  const used = new Map();
  const uniq = (key) => {
    const n = (used.get(key) || 0) + 1;
    used.set(key, n);
    return n === 1 ? key : `${key}-${n}`;
  };

  // <title> and meta description
  walk(doc, (n) => {
    if (n.tagName === 'title') tagAt(n, `data-cms="${page}/meta/title"`);
    if (n.tagName === 'meta' && attr(n, 'name') === 'description') {
      tagAt(n, `data-cms="${page}/meta/description" data-cms-attr="content"`);
    }
  });

  // Find editable leaves, then decide which belong to lists.
  const sections = sectionTracker();
  const leaves = [];
  walk(doc, (n, parents) => {
    sections.see(n);
    if (n.tagName && SKIP_ZONES.has(n.tagName)) return false;
    if (isEditable(n, parents)) {
      leaves.push({ n, parents, section: sections.get() });
      return false;
    }
  });

  const lists = new Map(); // container node -> { key, items: Map(node -> {fields}) }
  for (const leaf of leaves) {
    // Outermost repeating ancestor-or-self, so lists never nest.
    const chain = [...leaf.parents, leaf.n];
    let item = null;
    for (let i = 0; i < chain.length; i++) {
      if (itemGroup(chain[i], chain[i - 1])) { item = { node: chain[i], parent: chain[i - 1] }; break; }
    }
    if (!item) {
      const key = uniq(`${page}/${leaf.section}/${slug(cls(leaf.n).split(/\s+/)[0] || leaf.n.tagName)}`);
      tagAt(leaf.n, `data-cms="${key}"`);
      continue;
    }
    if (!lists.has(item.parent)) {
      const name = slug(cls(item.parent).split(/\s+/)[0] || cls(item.node).split(/\s+/)[0] || item.node.tagName);
      lists.set(item.parent, { key: uniq(`${page}/${leaf.section}/${name}`), items: new Map() });
    }
    const list = lists.get(item.parent);
    if (!list.items.has(item.node)) list.items.set(item.node, new Map());
    const fields = list.items.get(item.node);
    const base = slug(cls(leaf.n).split(/\s+/)[0] || leaf.n.tagName);
    const n = (fields.get(base) || 0) + 1;
    fields.set(base, n);
    tagAt(leaf.n, `data-cms-field="${n === 1 ? base : `${base}-${n}`}"`);
  }

  for (const [container, list] of lists) {
    tagAt(container, `data-cms-list="${list.key}"`);
    // Every repeat is an item, even ones whose text wasn't picked up.
    const group = itemGroup([...list.items.keys()][0], container);
    group.forEach((node, i) => tagAt(node, `data-cms-item="${i}"`));
  }

  return inserts;
}

function footerPlan(page, src) {
  const doc = parseDoc(src);
  const inserts = [];
  const tagAt = (node, text) => {
    const end = node.sourceCodeLocation.startTag.endOffset;
    inserts.push([src[end - 2] === '/' ? end - 2 : end - 1, ` ${text}`]);
  };
  walk(doc, (n) => {
    if (n.tagName !== 'footer') return;
    let about = 0;
    walk(n, (m, parents) => {
      if (!m.tagName) return;
      if (m.tagName === 'p' && parents.some((p) => cls(p) === 'footer-brand')) tagAt(m, `data-cms="site/footer/about-${++about}"`);
      if (m.tagName === 'a' && attr(m, 'href')?.startsWith('tel:')) tagAt(m, 'data-cms="site/footer/phone"');
      if (m.tagName === 'a' && attr(m, 'href')?.startsWith('mailto:')) tagAt(m, 'data-cms="site/footer/email"');
      if (m.tagName === 'a' && attr(m, 'href')?.includes('maps.google')) tagAt(m, 'data-cms="site/footer/address"');
      if (cls(m) === 'footer-motto') tagAt(m, 'data-cms="site/footer/motto"');
      if (m.tagName === 'p' && parents.some((p) => cls(p) === 'footer-bottom')) {
        // A copyright line that also carries links (Terms page) is kept per page.
        tagAt(m, `data-cms="${elements(m).length ? `${page}/footer` : 'site/footer'}/copyright"`);
      }
    });
    return false;
  });
  return inserts;
}

let total = 0;
for (const rel of sourcePages()) {
  const file = path.join(ROOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('data-cms=')) { console.log(`skip ${rel} (already tagged)`); continue; }
  const inserts = [...plan(pageId(rel), src), ...footerPlan(pageId(rel), src)].sort((a, b) => b[0] - a[0]);
  for (const [at, text] of inserts) src = src.slice(0, at) + text + src.slice(at);
  total += inserts.length;
  console.log(`${rel}: ${inserts.length} tags`);
  if (WRITE) fs.writeFileSync(file, src);
}
console.log(`${total} tags${WRITE ? ' written' : ' (dry run; pass --write to save)'}`);
