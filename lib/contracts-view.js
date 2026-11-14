// bJobsX contracts: one shape, one set of renderers. Used by api/contracts.js (to clean and order rows),
// scripts/build-contracts.mjs (the static copies in index.html and contracts.html), home.js and contracts.js.
// Rows come from data/contracts.json (house contracts) and, later, a remote registry (organisations posting their
// own), so every field is checked here and every string is escaped when it is rendered.

export const STATUSES = ['open', 'taken', 'done'];
const RANK = { open: 0, taken: 1, done: 2 };
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ANCHOR_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
export const ROOM_BASE = 'https://www.bchatx.com/contracts/';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** Escaped text, with `backticks` turned into <code>. */
export const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');

/** Only same-site paths and https links (and mailto: where a claim needs it). Anything else becomes ''. */
export function safeHref(u, { mailto = false } = {}) {
  const s = str(u, 2000);
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^https:\/\//i.test(s)) return s;
  if (mailto && /^mailto:[^\s"<>]+$/i.test(s)) return s;
  return '';
}

export const HOUSE_NAME = 'The Bitcoin Corporation Ltd';
const HANDLE_RE = /^\$?[a-z0-9][a-z0-9_.-]{0,39}$/i;

/** Who posts and pays. House contracts (ours, from data/contracts.json) are always The Bitcoin Corporation Ltd.
 *  Anyone else's must carry a legal name; their $handle is shown when they give one. `house` is never read from a row:
 *  the caller decides it. */
function posterOf(row, house) {
  if (house) return { house: true, name: HOUSE_NAME, handle: '', short: 'bCorp' };
  const p = row.poster && typeof row.poster === 'object' ? row.poster : {};
  const name = str(p.legalName ?? p.name ?? row.posterName, 120);
  let handle = str(p.handle ?? row.posterHandle, 41);
  handle = HANDLE_RE.test(handle) ? '$' + handle.replace(/^\$/, '') : '';
  return name ? { house: false, name, handle, short: handle || name } : null;
}

/** The full poster line, CEO wording (14 Nov). It goes under the carousel and on /contracts. */
export function posterLine(c) {
  const p = c.poster;
  if (!p) return '';
  if (p.house) return `Posted and paid by ${HOUSE_NAME}`;
  return `Posted and paid by ${p.name}${p.handle ? ` (${p.handle})` : ''}. bCorp runs bJobsX and isn't a party to this contract. bCorp doesn't hold the payment.`;
}
/** The short form, for the carousel card only. */
export const posterShort = (c) => (c.poster ? `Posted by ${c.poster.short}` : '');

/** A clean contract, or null when the row can't be shown (no id, no title, unknown status, no poster).
 *  house: true only for rows from our own data file. */
export function normalise(row, { house = false } = {}) {
  if (!row || typeof row !== 'object') return null;
  const poster = posterOf(row, house);
  if (!poster) return null;
  const id = str(row.id, 64).toLowerCase();
  const status = str(row.status, 10).toLowerCase() || 'open';
  const title = str(row.title, 140);
  if (!ID_RE.test(id) || !title || !STATUSES.includes(status)) return null;
  const c = {
    id,
    ref: str(row.ref, 24) || id.toUpperCase(),
    version: str(row.version, 64) || '1',
    status,
    poster,
    scope: str(row.scope, 60),
    kind: str(row.kind, 60),
    title,
    line: str(row.line, 300),
    pay: str(row.pay, 40),
    time: str(row.time, 60),
    art: safeHref(row.art),
    ghost: str(row.ghost, 12),
    color: COLOR_RE.test(str(row.color, 9)) ? str(row.color, 9) : '#ffd24d',
    href: safeHref(row.href) || '/contracts',
    go: str(row.go, 60) || 'See the contract',
    room: row.room === true,
  };
  if (row.postedAt) c.postedAt = str(row.postedAt, 40);
  const d = row.detail;
  if (d && typeof d === 'object') {
    const anchor = str(d.anchor, 40);
    c.detail = {
      anchor: ANCHOR_RE.test(anchor) ? anchor : 'c-' + id,
      area: str(d.area, 40),
      heading: str(d.heading, 140),
      est: str(d.est, 300),
      build: str(d.build, 3000),
      done: Array.isArray(d.done) ? d.done.map((x) => str(x, 600)).filter(Boolean).slice(0, 12) : [],
    };
    const href = safeHref(d.claim?.href, { mailto: true });
    if (href) c.detail.claim = { label: str(d.claim.label, 60) || `Claim ${c.ref}`, href };
  }
  return c;
}

/** Open first, then taken, then done. Otherwise the order they came in. */
export const sortContracts = (list) => list.map((c, i) => [c, i]).sort((a, b) => (RANK[a[0].status] - RANK[b[0].status]) || (a[1] - b[1])).map(([c]) => c);

/** The later "Talk about this contract" room: one stable URL per contract, shown only when room is true. */
export const roomUrl = (c) => (c.room ? `${ROOM_BASE}${encodeURIComponent(c.id)}/talk` : '');

export const statusLabel = (s) => ({ taken: 'Taken', done: 'Done' })[s] || 'Open';

/** What the home page needs for a card (the inline first-paint snapshot and the live list). Done ones aren't shown. */
export const homeRows = (list) => list.filter((c) => c.status !== 'done').map((c) => ({
  id: c.id, ref: c.ref, version: c.version, status: c.status, poster: c.poster, scope: c.scope, kind: c.kind,
  title: c.title, line: c.line, pay: c.pay, time: c.time, ...(c.art ? { art: c.art } : { ghost: c.ghost }),
  color: c.color, href: c.href, go: c.go, ...(c.room ? { room: true } : {}), ...(c.postedAt ? { postedAt: c.postedAt } : {}),
}));

/** One contract card on /contracts. Open ones get their claim button; taken and done ones show that, and no button. */
export function contractArticle(c) {
  const d = c.detail || { anchor: 'c-' + c.id, done: [] };
  const open = c.status === 'open';
  const lines = [
    `<article class="contract${open ? '' : ' is-' + c.status}" aria-labelledby="${esc(d.anchor)}" data-id="${esc(c.id)}" data-version="${esc(c.version)}" data-status="${esc(c.status)}">`,
    `  <div class="top"><span class="id">${esc(c.ref)}${d.area ? ' · ' + esc(d.area) : ''}</span>${open ? '' : `<span class="badge state ${esc(c.status)}">${statusLabel(c.status)}</span>`}<span class="pay">${esc(c.pay)}</span></div>`,
    `  <h3 id="${esc(d.anchor)}">${esc(d.heading || c.title)}</h3>`,
  ];
  if (c.poster) lines.push(`  <p class="by${c.poster.house ? '' : ' other'}">${esc(posterLine(c))}</p>`);
  if (d.est) lines.push(`  <p class="est">${esc(d.est)}</p>`);
  if (d.build) lines.push('  <h4>Build</h4>', `  <p>${rich(d.build)}</p>`);
  if (d.done.length) lines.push('  <h4>Done when</h4>', '  <ul>', ...d.done.map((x) => `    <li>${rich(x)}</li>`), '  </ul>');
  const room = roomUrl(c);
  if (room) lines.push(`  <p class="talk"><a class="gold" href="${esc(room)}">Talk about this contract</a></p>`);
  if (open && d.claim) lines.push(`  <div class="claim"><a class="btn btn-gold" href="${esc(d.claim.href)}">${esc(d.claim.label)}</a></div>`);
  else if (!open) lines.push(`  <p class="claim shut">${c.status === 'done' ? 'Done. This contract is closed.' : 'Taken. Someone is working on this one.'}</p>`);
  lines.push('</article>');
  return lines.join('\n');
}

/** What a rendered card stands for: if this matches, the card is up to date. */
export const cardSig = (c) => `${c.id}@${c.version}@${c.status}`;

/** The contracts for one grid on /contracts: those with full terms in that scope ('*' = scopes without their own grid). */
export function gridFor(list, scope, ownScopes) {
  return list.filter((c) => c.detail && (scope === '*' ? !ownScopes.includes(c.scope) : c.scope === scope));
}
