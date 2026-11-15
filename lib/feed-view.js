// bJobsX home feed: public posts from bChatX's open feed (www.bchatx.com/api/feed/open), one shape, one renderer.
// Used by api/feed.js (to clean rows: only safe fields survive, flagged posts are dropped) and app.js (to draw them).
// bJobsX hosts none of this: it is read through and cached for 60 s. Every string is escaped when it is rendered.

export const BCHATX = 'https://www.bchatx.com';
export const FEED_SOURCE = `${BCHATX}/api/feed/open`;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const str = (v, max) => (typeof v === 'string' ? v.replace(CTRL, '').trim().slice(0, max) : '');
const int = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);
const https = (u) => { const s = str(u, 2000); return /^https:\/\/[^\s"'<>\\]+$/i.test(s) ? s : ''; };

const HANDLE_RE = /^[a-z0-9][a-z0-9_.-]{0,39}$/i;
const ADDR_RE = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
const TXID_RE = /^[0-9a-f]{64}$/i;
const PROFILE_PATH_RE = /^\/(u|k)\/[A-Za-z0-9_.-]{1,64}$/;

const yes = (v) => v === true || v === 1 || v === 'true';
const FLAG_WORDS = /nsfw|blur|sensitive|adult|explicit/i;
/** True when the source marks a post (or its author or media) as nsfw, blurred or sensitive. Those are never shown. */
export function flagged(p) {
  if (!p || typeof p !== 'object') return true;
  const own = (o) => o && typeof o === 'object' && ['nsfw', 'blurred', 'blur', 'sensitive', 'adult', 'explicit'].some((k) => yes(o[k]));
  if (own(p) || own(p.author)) return true;
  for (const k of ['flags', 'labels', 'tags']) if (Array.isArray(p[k]) && p[k].some((f) => FLAG_WORDS.test(String(f)))) return true;
  if (typeof p.rating === 'string' && FLAG_WORDS.test(p.rating)) return true;
  if (Array.isArray(p.media) && p.media.some(own)) return true;
  return false;
}

/** The author's bChatX profile: an href the data gives (/u/<handle> or /k/<address>), else built from handle or address. */
export function profileHref(a) {
  if (!a || typeof a !== 'object') return '';
  const h = str(a.href, 200);
  if (PROFILE_PATH_RE.test(h)) return BCHATX + h;
  if (h.startsWith(BCHATX + '/') && PROFILE_PATH_RE.test(h.slice(BCHATX.length))) return h;
  const handle = str(a.handle, 40).replace(/^[$@]/, '');
  if (HANDLE_RE.test(handle)) return `${BCHATX}/u/${encodeURIComponent(handle)}`;
  const addr = str(a.address, 40);
  if (ADDR_RE.test(addr)) return `${BCHATX}/k/${addr}`;
  return '';
}

/** A clean post, or null (flagged, no text, no id). */
export function normalisePost(p) {
  if (!p || typeof p !== 'object' || flagged(p)) return null;
  const txid = str(p.txid, 64).toLowerCase();
  const text = str(p.text, 1200);
  if (!text || !(TXID_RE.test(txid) || str(p.id, 80))) return null;
  const a = p.author && typeof p.author === 'object' ? p.author : {};
  const handle = str(a.handle, 40).replace(/^[$@]/, '');
  const at = Number(p.at);
  return {
    id: TXID_RE.test(txid) ? txid : str(p.id, 80),
    text,
    author: { name: str(a.name, 60) || (HANDLE_RE.test(handle) ? handle : 'Someone'), handle: HANDLE_RE.test(handle) ? handle : '', href: profileHref(a) },
    sourceLabel: str(p.sourceLabel, 30) || str(p.source, 30),
    sourceUrl: https(p.sourceUrl),
    url: TXID_RE.test(txid) ? `${BCHATX}/feed/p/${txid}` : https(p.url),
    at: Number.isFinite(at) && at > 0 ? at : 0,
    likes: int(p.likes),
    replies: int(p.replies),
    reply: !!p.replyTo,
  };
}

/** The posts to show from the source's JSON ({posts:[...]} or a bare array), newest first, capped. */
export function cleanFeed(json, limit = 20) {
  const rows = Array.isArray(json) ? json : Array.isArray(json?.posts) ? json.posts : [];
  const seen = new Set(), out = [];
  for (const r of rows.slice(0, 200)) {
    const p = normalisePost(r);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id); out.push(p);
    if (out.length >= limit) break;
  }
  return out.sort((x, y) => y.at - x.at);
}

// ── rendering (browser) ──────────────────────────────────────────────────────
/** Escaped text with http(s) links made clickable. Nothing else is ever turned into markup. */
export function linkify(text) {
  return esc(text).replace(/\bhttps?:\/\/[^\s<]+/g, (m) => {
    const tail = (m.match(/(?:[.,!?:;)\]]|&#39;|&quot;)+$/) || [''])[0];
    const u = tail ? m.slice(0, -tail.length) : m;
    return `<a href="${u}" target="_blank" rel="nofollow noopener ugc">${u}</a>${tail}`;
  });
}

export function ago(at, now = Date.now()) {
  if (!at) return '';
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** A warm hue per name, so avatars without a picture still tell people apart. */
export const hueFor = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) % 360; return 20 + (h % 40); };

/** One post card. Author name and avatar link to the bChatX profile when the data gives one. */
export function postHTML(p, now = Date.now()) {
  const name = esc(p.author.name);
  const initial = esc((p.author.name || '?').trim().charAt(0).toUpperCase() || '?');
  const av = `<span class="ap-av ap-av-s" style="--h:${hueFor(p.author.name)}" aria-hidden="true">${initial}</span>`;
  const href = p.author.href ? esc(p.author.href) : '';
  const who = href
    ? `<a class="ap-pa" href="${href}" target="_blank" rel="noopener">${av}</a><div class="ap-pm"><a class="ap-pn" href="${href}" target="_blank" rel="noopener">${name}</a>`
    : `<span class="ap-pa">${av}</span><div class="ap-pm"><span class="ap-pn">${name}</span>`;
  const handle = p.author.handle ? `<span class="ap-ph">$${esc(p.author.handle)}</span>` : '';
  const via = p.sourceLabel ? (p.sourceUrl ? `<a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">via ${esc(p.sourceLabel)}</a>` : `via ${esc(p.sourceLabel)}`) : '';
  const when = ago(p.at, now);
  const meta = [via, when ? `<time datetime="${esc(new Date(p.at).toISOString())}">${esc(when)}</time>` : ''].filter(Boolean).join(' · ');
  const counts = [p.likes ? `${p.likes} like${p.likes === 1 ? '' : 's'}` : '', p.replies ? `${p.replies} repl${p.replies === 1 ? 'y' : 'ies'}` : ''].filter(Boolean).join(' · ');
  return `<article class="ap-card ap-post" data-id="${esc(p.id)}">
  <header class="ap-ph-row">${who}${handle}<span class="ap-pt">${meta}</span></div></header>
  <div class="ap-ptext">${linkify(p.text)}</div>
  <footer class="ap-pf"><span>${esc(counts)}</span>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">Reply on bChatX <span aria-hidden="true">&#8599;</span></a>` : ''}</footer>
</article>`;
}
