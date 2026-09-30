// Shared helpers for the CMS: finding pages, parsing HTML with source offsets,
// and locating the data-cms annotations that mark editable content.
//
// Annotation format (written into the source HTML by cms/annotate.mjs):
//   data-cms="key"               editable block; its inner HTML is the value
//   data-cms-attr="content"      (with data-cms) the value goes into this attribute instead
//   data-cms-list="key"          container of repeatable items
//   data-cms-item="N"            item N in a list; N is the template it was built from
//   data-cms-field="name"        editable field inside an item

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function sourcePages() {
  const root = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
  const programs = fs.readdirSync(path.join(ROOT, 'programs')).filter((f) => f.endsWith('.html')).sort()
    .map((f) => `programs/${f}`);
  return [...root, ...programs];
}

export const pageId = (rel) => rel.replace(/\.html$/, '');

export const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value;

export function parseDoc(src) {
  return parse(src, { sourceCodeLocationInfo: true });
}

export function walk(node, fn, parents = []) {
  if (fn(node, parents) === false) return;
  const kids = node.content ? node.content.childNodes : node.childNodes;
  for (const child of kids || []) walk(child, fn, [...parents, node]);
}

// Offsets of an element's inner HTML, or null for void/self-closing elements.
export function innerRange(node) {
  const loc = node.sourceCodeLocation;
  if (!loc?.startTag || !loc.endTag) return null;
  return [loc.startTag.endOffset, loc.endTag.startOffset];
}

export function outerRange(node) {
  const loc = node.sourceCodeLocation;
  return [loc.startOffset, loc.endOffset];
}

// Narrow a range to exclude leading/trailing whitespace.
export function trimRange(src, [s, e]) {
  while (s < e && /\s/.test(src[s])) s++;
  while (e > s && /\s/.test(src[e - 1])) e--;
  return [s, e];
}

// Offsets of an attribute's value (between the quotes).
export function attrValueRange(src, node, name) {
  const loc = node.sourceCodeLocation?.attrs?.[name];
  if (!loc) return null;
  const raw = src.slice(loc.startOffset, loc.endOffset);
  const eq = raw.indexOf('=');
  const q = raw[eq + 1];
  const start = loc.startOffset + eq + 2;
  const end = q === '"' || q === "'" ? loc.endOffset - 1 : loc.endOffset;
  return [start, end];
}

// Find every annotated block and list in a page, with source offsets.
export function scan(src) {
  const doc = parseDoc(src);
  const blocks = [];
  const lists = [];

  walk(doc, (node) => {
    if (!node.tagName) return;
    if (attr(node, 'data-cms-item') != null) return false; // fields inside items belong to their list
    const listKey = attr(node, 'data-cms-list');
    if (listKey) lists.push(scanList(src, node, listKey));
    const key = attr(node, 'data-cms');
    if (key) {
      const target = attr(node, 'data-cms-attr');
      const range = target ? attrValueRange(src, node, target) : trimRange(src, innerRange(node));
      blocks.push({ key, range, isAttr: !!target });
    }
  });

  return { blocks, lists };
}

function scanList(src, container, key) {
  const items = [];
  for (const child of container.childNodes) {
    if (!child.tagName || attr(child, 'data-cms-item') == null) continue;
    const [start, end] = outerRange(child);
    const fields = [];
    walk(child, (n) => {
      const name = n.tagName && attr(n, 'data-cms-field');
      if (name) {
        const [fs0, fe0] = trimRange(src, innerRange(n));
        fields.push({ name, range: [fs0 - start, fe0 - start] });
      }
    });
    items.push({ tpl: Number(attr(child, 'data-cms-item')), range: [start, end], fields });
  }
  // Keep the original text between items (whitespace, label comments) so an
  // unchanged list renders byte-for-byte; extra items reuse plain whitespace.
  const gaps = items.slice(1).map((it, i) => src.slice(items[i].range[1], it.range[0]));
  const sep = (gaps[0] ?? '\n').replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s]*?(\n[ \t]*)$/, '$1') || '\n';
  return { key, items, gaps, sep, range: [items[0].range[0], items.at(-1).range[1]] };
}

// Values currently in a page's source, keyed like the database.
export function readValues(src, scanned = scan(src)) {
  const blocks = {};
  for (const b of scanned.blocks) blocks[b.key] = src.slice(...b.range);
  const lists = {};
  for (const l of scanned.lists) {
    lists[l.key] = l.items.map((it, sort) => {
      const html = src.slice(...it.range);
      const fields = {};
      for (const f of it.fields) fields[f.name] = html.slice(...f.range);
      return { tpl: it.tpl, sort, fields };
    });
  }
  return { blocks, lists };
}

// Rebuild a page with content from the database. Anything missing from
// `content` keeps the value already in the source.
export function render(src, content, scanned = scan(src)) {
  const edits = [];
  for (const b of scanned.blocks) {
    if (content.blocks[b.key] != null) edits.push([...b.range, content.blocks[b.key]]);
  }
  for (const l of scanned.lists) {
    const rows = content.lists[l.key];
    if (!rows) continue;
    const byTpl = new Map(l.items.map((it) => [it.tpl, it]));
    const html = [...rows].sort((a, b) => a.sort - b.sort).map((row) => {
      const it = byTpl.get(row.tpl) ?? l.items[0];
      let out = src.slice(...it.range);
      for (const f of [...it.fields].sort((a, b) => b.range[0] - a.range[0])) {
        const v = row.fields?.[f.name];
        if (v != null) out = out.slice(0, f.range[0]) + v + out.slice(f.range[1]);
      }
      return out;
    });
    edits.push([...l.range, html.map((h, i) => (i === 0 ? '' : l.gaps[i - 1] ?? l.sep) + h).join('')]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [s, e, v] of edits) out = out.slice(0, s) + v + out.slice(e);
  return out;
}
