// A small, safe markdown for job descriptions on /post. Everything is escaped first; then only these marks:
// # headings (to h4–h6), **bold**, *italic* / _italic_, `code`, ``` code blocks ```, - and 1. lists, > quotes and
// [links](https://…) (https only, opened in a new tab, nofollow). No raw HTML, ever.
import { esc } from './contracts-view.js';

function marks(t) {
  return t
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s](?:[^_\n]*[^_\s])?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)<>]+)\)/g, '<a href="$2" target="_blank" rel="noopener nofollow ugc">$1</a>');
}

/** One line of text: code spans are kept as they are; the rest gets the marks. */
export function inline(src) {
  return String(src ?? '').split(/(`[^`\n]+`)/).map((part, i) => (i % 2 ? `<code>${esc(part.slice(1, -1))}</code>` : marks(esc(part)))).join('');
}

/** Markdown to safe HTML. */
export function mdToHtml(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [], list = null, code = null;
  const flushP = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const item = (tag, text) => { flushP(); if (!list || list.tag !== tag) { flushL(); list = { tag, items: [] }; } list.items.push(text); };
  for (const line of lines) {
    if (code) {
      if (/^\s*```/.test(line)) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; } else code.push(line);
      continue;
    }
    let m;
    if (/^\s*```/.test(line)) { flushP(); flushL(); code = []; continue; }
    if (!line.trim()) { flushP(); flushL(); continue; }
    if ((m = line.match(/^\s*(#{1,3})\s+(.*)$/))) { flushP(); flushL(); const h = m[1].length + 3; out.push(`<h${h}>${inline(m[2])}</h${h}>`); continue; }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { item('ul', m[1]); continue; }
    if ((m = line.match(/^\s*\d{1,3}[.)]\s+(.*)$/))) { item('ol', m[1]); continue; }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { flushP(); flushL(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    flushL(); para.push(line);
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushP(); flushL();
  return out.join('\n');
}

/** Markdown to one line of plain text (for the card). Headings and code fences are dropped, each line ends as a
 *  sentence, and `code` is kept, since the card turns backticks into code. */
export function mdToText(src) {
  return String(src ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*(?:```|#{1,6}\s)/.test(l))
    .map((l) => l
      .replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, '$1')
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?!\w)/g, '$1$2')
      .replace(/(^|[^_\w])_([^_\s](?:[^_\n]*[^_\s])?)_(?!\w)/g, '$1$2')
      .trim())
    .filter(Boolean)
    .map((l) => (/[.!?:;…]$/.test(l) ? l : l + '.'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
