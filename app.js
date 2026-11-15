// bjobsx.com signed-in home. index.html's inline check confirms the wallet session (GET /api/bwalletx/session), then
// loads app.css and calls start(). Same URL as the landing; signing out goes back to it.
// LinkedIn's structure, our look: top bar, your card on the left, the feed in the middle, contracts and people on the
// right, a messaging dock (bMessageX) bottom right. Phone: one column and a bottom tab bar.
//
// Read only. bJobsX hosts no user data here:
//   /api/profile?me=1  your paymail name, avatar, published headline, "LinkedIn linked" (sealed cookie)
//   /api/contracts     our contracts file (and the registry, later)
//   /api/feed          bChatX's public open feed, proxied and cached
//   /api/browse        public profiles (push server)
//   this browser       records minted and your LinkedIn import (localStorage, written by /studio)
// Public posts happen on chain in bChatX (the composer opens it); jobs are posted here, on /post; messages live in bMessageX.
import { esc, posterLine, statusLabel, payNotes, hasShares, paysBsv, isTokenPay } from '/lib/contracts-view.js';
import { postHTML, hueFor, BCHATX } from '/lib/feed-view.js';

const L = {
  feed: `${BCHATX}/feed`, board: `${BCHATX}/s/bjobs`, chat: `${BCHATX}/`,
  msg: 'https://bmessagex.com/', git: 'https://www.bchatx.com/bgitx', wallet: 'https://bwalletx.com/',
  org: `${BCHATX}/room/new`, token: `${BCHATX}/tokenise`,
  // Jobs are posted on bJobsX itself (RB 15 Nov): never bChatX's /room/new, which is only for starting an organisation.
  post: '/post', postEquity: '/post?pay=equity',
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ext = (h) => /^https?:/.test(h);
const tgt = (h) => (ext(h) ? ' target="_blank" rel="noopener"' : '');
const safeImg = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'()<>\\]+$/i.test(u) ? u : '');
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const json = (u) => fetch(u, { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const shortKey = (k) => (k ? k.slice(0, 6) + '…' + k.slice(-4) : '');
const ARR = '&nbsp;<span class="ap-arr" aria-hidden="true">&#8599;</span>';

// Simple stroke icons, drawn for bJobsX.
const P = {
  home: '<path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.4-3.2 2.8-5 6-5s5.6 1.8 6 5"/><circle cx="17.2" cy="9.5" r="2.4"/><path d="M16.4 14.6c2.6.1 4.3 1.6 4.6 4.4"/>',
  contracts: '<path d="M6.5 3.5h7.5l4 4v13h-11.5z"/><path d="M14 3.5v4h4"/><path d="M9.5 12h5.5M9.5 15h3.5"/><circle cx="15.5" cy="17.5" r="1.6"/>',
  messages: '<path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  bell: '<path d="M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5l1.5 1.5H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  org: '<path d="M4 20.5V9l8-5 8 5v11.5"/><path d="M9.5 20.5v-5h5v5M8 11h.01M12 11h.01M16 11h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  pen: '<path d="M4.5 19.5 5.5 15 15.5 5a2 2 0 0 1 3 3l-10 10z"/><path d="M13.5 7l3 3"/>',
  git: '<circle cx="6.5" cy="5.5" r="2"/><circle cx="6.5" cy="18.5" r="2"/><circle cx="17.5" cy="8.5" r="2"/><path d="M6.5 7.5v9M17.5 10.5c0 4-5 3.5-9.5 6.5"/>',
  room: '<path d="M4 6h11v8H8l-4 3z"/><path d="M15 9h5v8l-3-2.5h-5V14"/>',
  chev: '<path d="m7 10 5 5 5-5"/>',
};
const ico = (n, cls = 'ap-i') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[n]}</svg>`;
const B_MARK = '<svg viewBox="23 8 74 100" aria-hidden="true" focusable="false"><path fill="currentColor" d="M45 12V72H27V30Z M27 72a33 33 0 1 1 66 0a33 33 0 1 1-66 0Z M45 72a15 15 0 1 0 30 0a15 15 0 1 0-30 0Z"/></svg>';

let me = { identityKey: '', name: '', paymail: '', avatar: '', headline: '', linkedin: false, username: '' };
let contracts = [], people = null, posts = null, filt = 'all';
// A plain filter: it only hides cards, never sorts or features them.
const FILTERS = [['all', 'All'], ['bsv', 'Paid in BSV'], ['equity', 'Pays in equity (shares only)'], ['tokens', 'Paid in tokens']];
const FILTER_FN = { bsv: paysBsv, equity: hasShares, tokens: isTokenPay };
const FILTER_EMPTY = { bsv: 'No open contracts pay in BSV right now.', equity: 'No open contracts pay in equity right now.', tokens: 'No open contracts pay in tokens right now.' };

// ── avatar ───────────────────────────────────────────────────────────────────
function avatar(cls) {
  const init = esc((me.name || me.paymail || 'b').trim().charAt(0).toUpperCase());
  const img = safeImg(me.avatar);
  return `<span class="ap-av ${cls}" data-me-av aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">` : ''}<b>${init}</b></span>`;
}

// ── shell ────────────────────────────────────────────────────────────────────
const navItem = (key, label, href, extra = '') => `<a class="ap-nav-i" href="${esc(href)}"${tgt(href)} data-nav="${key}"${extra}>${ico(key)}<span>${label}</span></a>`;
const family = () => `<p class="ap-fam"><span>Part of <a href="${L.wallet}" target="_blank" rel="noopener">bWalletX</a></span><a href="${L.chat}" target="_blank" rel="noopener">bChatX</a><a href="${L.msg}" target="_blank" rel="noopener">bMessageX</a><a href="${L.git}" target="_blank" rel="noopener">bGitX</a></p>`;

function shell() {
  return `
<a class="ap-skip" href="#ap-feed">Skip to the feed</a>
<header class="ap-top">
  <div class="ap-top-in">
    <a class="ap-brand" href="/" aria-label="bJobsX home">${B_MARK}<span><span class="ap-sr">b</span>Jobs<i>X</i></span></a>
    <button class="ap-me-m" type="button" data-me-open aria-haspopup="menu" aria-expanded="false" aria-label="Me: your profile and sign out">${avatar('ap-av-xs')}</button>
    <div class="ap-search" role="search">
      ${ico('search')}
      <input id="ap-q" type="search" placeholder="Search people and contracts" autocomplete="off" aria-label="Search people and contracts" role="combobox" aria-expanded="false" aria-controls="ap-qres" aria-autocomplete="list">
      <div class="ap-qres" id="ap-qres" role="listbox" aria-label="Search results" hidden></div>
    </div>
    <nav class="ap-nav" aria-label="Main">
      ${navItem('home', 'Home', '/', ' aria-current="page"')}
      ${navItem('people', 'People', '/browse')}
      ${navItem('contracts', 'Contracts', '/contracts')}
      ${navItem('messages', 'Messages', L.msg, ' title="Messages · bMessageX"')}
      <button class="ap-nav-i" type="button" data-pop="notes" aria-haspopup="dialog" aria-expanded="false">${ico('bell')}<span>Notifications</span></button>
      <div class="ap-me-w">
        <button class="ap-nav-i ap-me-b" type="button" data-me-open aria-haspopup="menu" aria-expanded="false">${avatar('ap-av-xs')}<span>Me ${ico('chev', 'ap-chev')}</span></button>
      </div>
      <span class="ap-div" aria-hidden="true"></span>
      <button class="ap-nav-i ap-org-b" type="button" data-goto-org>${ico('org')}<span>For organisations</span></button>
    </nav>
    <a class="ap-btn ap-btn-gold ap-post" href="${L.post}">${ico('pen')}<span>Post a job</span></a>
    <div class="ap-pop ap-notes" id="ap-notes" role="dialog" aria-label="Notifications" hidden><b>Notifications</b><p>Coming. Until then, replies and mentions show in bChatX, and messages in bMessageX.</p></div>
    <div class="ap-menu" id="ap-menu" role="menu" aria-label="Me" hidden>
      <div class="ap-menu-me">${avatar('ap-av-m')}<div><b data-me-name></b><span data-me-pm></span></div></div>
      <a class="ap-btn ap-btn-line" role="menuitem" href="/studio">Your profile</a>
      <a class="ap-menu-i" role="menuitem" href="/studio#import">Import your LinkedIn history</a>
      <a class="ap-menu-i" role="menuitem" href="${L.msg}" target="_blank" rel="noopener">Messages · bMessageX${ARR}</a>
      <button class="ap-menu-i" role="menuitem" type="button" data-signout>Sign out</button>
      ${family()}
    </div>
  </div>
</header>

<div class="ap-grid">
  <aside class="ap-left" aria-label="You">
    <section class="ap-card ap-mecard" aria-label="Your card">
      <div class="ap-cover" aria-hidden="true"><span>JOBSX</span></div>
      <a class="ap-me-link" href="/studio">${avatar('ap-av-l')}<h1 class="ap-me-name" data-me-name></h1></a>
      <p class="ap-me-pm" data-me-pm></p>
      <p class="ap-me-hl" data-me-hl hidden></p>
      <p class="ap-li" data-me-li hidden><span aria-hidden="true">&#10003;</span> LinkedIn linked</p>
      <a class="ap-me-cta" href="/studio">Your profile</a>
    </section>
    <section class="ap-card ap-box ap-work" aria-labelledby="ap-work-h">
      <h2 id="ap-work-h">Your work</h2>
      <dl class="ap-stats ap-stats-c">
        <div><dt>In progress</dt><dd title="Tracked here once contract rooms open">&mdash;</dd></div>
        <div><dt>Done</dt><dd title="Tracked here once contract rooms open">&mdash;</dd></div>
        <div><dt>Minted</dt><dd data-minted title="Records minted on this device">0</dd></div>
        <div data-imp-row hidden><dt>LinkedIn history <small>(this device)</small></dt><dd data-imp></dd></div>
      </dl>
      <a class="ap-more" href="/contracts">Open contracts <b data-open-n></b></a>
    </section>
    <section class="ap-card ap-box ap-org" id="ap-org" tabindex="-1" aria-labelledby="ap-org-h">
      <h2 id="ap-org-h">${ico('org')} Build</h2>
      <nav class="ap-links" aria-label="Build: post work here, the rest in bChatX and bGitX">
        <a class="ap-lk ap-lk-1" href="${L.postEquity}">Offer equity for work</a>
        <a class="ap-lk" href="${L.org}" target="_blank" rel="noopener">Start an organisation${ARR}</a>
        <a class="ap-lk" href="${L.token}" target="_blank" rel="noopener">Issue a token${ARR}</a>
        <a class="ap-lk" href="${L.org}" target="_blank" rel="noopener">Raise in a private deal room${ARR}</a>
        <a class="ap-lk" href="${L.git}" target="_blank" rel="noopener">${ico('git')} Link your GitHub (bGitX)${ARR}</a>
        <a class="ap-lk" href="${L.token}" target="_blank" rel="noopener">Tokenise your repo${ARR}</a>
      </nav>
    </section>
  </aside>

  <main class="ap-main" id="ap-feed" aria-label="Feed">
    <section class="ap-card ap-compose" aria-label="Start a post">
      <div class="ap-compose-row">${avatar('ap-av-c')}<a class="ap-compose-b" href="${L.feed}" target="_blank" rel="noopener">Start a post on bChatX</a></div>
      <p class="ap-compose-n">Posts go on chain through bChatX and open in a new tab. bJobsX doesn't store them.</p>
      <div class="ap-compose-a">
        <a href="${L.feed}" target="_blank" rel="noopener">${ico('pen')}Write a post${ARR}</a>
        <a href="${L.board}" target="_blank" rel="noopener">${ico('room')}The bJobs Board${ARR}</a>
        <a href="/contracts">${ico('contracts')}All contracts</a>
        <a class="ap-compose-post" href="${L.post}">${ico('contracts')}Post a job</a>
      </div>
    </section>
    <div class="ap-filt" role="group" aria-label="Filter the feed">${FILTERS.map(([k, t]) => `<button type="button" data-filt="${k}" aria-pressed="${k === 'all'}">${esc(t)}</button>`).join('')}</div>
    <div class="ap-sep"><span data-sep-c>New contracts</span></div>
    <div class="ap-stream" data-contracts-stream aria-live="polite"><div class="ap-card ap-skel"></div></div>
    <div class="ap-sep" data-posts-sep><span>From the bChatX open feed</span><a href="${L.feed}" target="_blank" rel="noopener">Open in bChatX${ARR}</a></div>
    <div class="ap-stream" data-posts aria-live="polite"><div class="ap-card ap-skel"></div><div class="ap-card ap-skel"></div></div>
  </main>

  <aside class="ap-right" aria-label="Contracts and people">
    <section class="ap-card ap-box" aria-labelledby="ap-oc-h">
      <h2 id="ap-oc-h">Open contracts</h2>
      <ol class="ap-oc" data-oc><li class="ap-muted">Loading&hellip;</li></ol>
      <a class="ap-more" href="/contracts">See all contracts &rarr;</a>
    </section>
    <section class="ap-card ap-box" aria-labelledby="ap-rooms-h">
      <h2 id="ap-rooms-h">Your contract rooms <span class="ap-coming">Coming</span></h2>
      <p class="ap-note">Each contract will get a private room in bChatX for you and whoever posted it. They're being built now.</p>
      <a class="ap-more" href="${L.board}" target="_blank" rel="noopener">Meanwhile: the bJobs Board${ARR}</a>
    </section>
    <section class="ap-card ap-box" aria-labelledby="ap-ppl-h">
      <h2 id="ap-ppl-h">People to know</h2>
      <ul class="ap-ppl" data-ppl><li class="ap-muted">Loading&hellip;</li></ul>
      <a class="ap-more" href="/browse">See everyone &rarr;</a>
    </section>
    <div class="ap-foot">
      <nav aria-label="Footer"><a href="/contracts">Contracts</a><a href="/post">Post a job</a><a href="/browse">People</a><a href="/studio">Your profile</a><a href="/what-you-can-post">What you can post</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
      ${family()}
      <p>bJobsX · THE BITCOIN CORPORATION LTD, company no. 16735102</p>
    </div>
  </aside>
</div>

<section class="ap-dock" aria-label="Messages">
  <button class="ap-dock-h" type="button" aria-expanded="false" aria-controls="ap-dock-b">${avatar('ap-av-xs')}<span>Messages <i>· bMessageX</i></span>${ico('chev', 'ap-chev')}</button>
  <div class="ap-dock-b" id="ap-dock-b" hidden>
    <p>Your DMs and channels live in bMessageX. Sign in there with the same bWalletX.</p>
    <a class="ap-btn ap-btn-gold" href="${L.msg}" target="_blank" rel="noopener">Open bMessageX${ARR}</a>
    <p class="ap-note">Rooms and public posts are in <a href="${L.chat}" target="_blank" rel="noopener">bChatX</a>.</p>
  </div>
</section>

<nav class="ap-tabs" aria-label="Main">
  ${navItem('home', 'Home', '/', ' aria-current="page"')}
  ${navItem('people', 'People', '/browse')}
  ${navItem('contracts', 'Contracts', '/contracts')}
  ${navItem('messages', 'Messages', L.msg)}
  <button class="ap-nav-i" type="button" data-me-open aria-haspopup="menu" aria-expanded="false">${avatar('ap-av-xs')}<span>Me</span></button>
</nav>`;
}

// ── you ──────────────────────────────────────────────────────────────────────
function paintMe() {
  const name = me.name || (me.paymail ? me.paymail.split('@')[0] : 'Your profile');
  $$('[data-me-name]').forEach((e) => { e.textContent = name; });
  $('.ap-mecard').dataset.name = name;
  $$('[data-me-pm]').forEach((e) => { e.textContent = me.paymail || shortKey(me.identityKey); });
  const hl = $('[data-me-hl]'); hl.textContent = me.headline; hl.hidden = !me.headline;
  $('[data-me-li]').hidden = !me.linkedin;
  if (!me.paymail) $('.ap-me-pm').insertAdjacentHTML('beforeend', ` <a href="https://bwalletx.com/get" target="_blank" rel="noopener">Get your name</a>`);
  // Redraw every avatar now the name and picture are known.
  $$('[data-me-av]').forEach((el) => { const cls = [...el.classList].find((c) => /^ap-av-/.test(c)); el.outerHTML = avatar(cls); });
  // Records minted and the LinkedIn import live in this browser (written by /studio), keyed by the identity key.
  const minted = Object.keys(lsGet(`bjx-mint-${me.identityKey}`) || {}).length;
  $('[data-minted]').textContent = String(minted);
  const imp = lsGet(`bjx-import-${me.identityKey}`);
  if (imp && Array.isArray(imp.positions)) {
    $('[data-imp-row]').hidden = false;
    $('[data-imp]').textContent = `${imp.positions.length} role${imp.positions.length === 1 ? '' : 's'}`;
  }
}

// ── contracts ────────────────────────────────────────────────────────────────
function contractCard(c) {
  const art = c.art ? `<img src="${esc(c.art)}" alt="" loading="lazy" decoding="async">` : `<span class="ap-ghost">${esc(c.ghost || c.scope)}</span>`;
  const status = c.status !== 'open' ? `<span class="ap-flag">${esc(statusLabel(c.status))}</span>` : '';
  return `<article class="ap-card ap-cc" style="--c:${esc(c.color)}" aria-labelledby="cc-${esc(c.id)}">
  <header class="ap-ph-row"><span class="ap-pa">${c.poster?.house ? `<span class="ap-av ap-av-s ap-av-b" aria-hidden="true">${B_MARK}</span>` : `<span class="ap-av ap-av-s" style="--h:${hueFor(c.poster?.name || '')}" aria-hidden="true"><b>${esc((c.poster?.name || '?').charAt(0).toUpperCase())}</b></span>`}</span><div class="ap-pm"><span class="ap-pn">${esc(c.poster?.house ? 'The Bitcoin Corporation Ltd' : c.poster?.name || '')}</span><span class="ap-pt">Posted a contract · ${esc(c.scope)}</span></div></header>
  <a class="ap-cc-art" href="${esc(c.href)}"${tgt(c.href)} tabindex="-1" aria-hidden="true">${art}${status}<span class="ap-cc-chip"><i></i>${esc(c.scope)} · ${esc(c.kind)}</span></a>
  <div class="ap-cc-b">
    <h3 id="cc-${esc(c.id)}"><a href="${esc(c.href)}"${tgt(c.href)}>${esc(c.title)}</a></h3>
    <p>${esc(c.line)}</p>
    <div class="ap-cc-m">${hasShares(c) ? '<span class="ap-eq">Equity</span>' : ''}<span class="ap-pay">${esc(c.pay)}</span>${c.time ? `<span>${esc(c.time)}</span>` : ''}<span>${esc(c.ref)}</span></div>
    ${payNotes(c).map((n) => `<p class="ap-tok">${esc(n)}</p>`).join('')}
    <div class="ap-cc-f"><span class="ap-by">${esc(posterLine(c))}</span><a class="ap-btn ap-btn-gold ap-btn-s" href="${esc(c.href)}"${tgt(c.href)}>View</a></div>
  </div>
</article>`;
}

function paintContracts() {
  const open = contracts.filter((c) => c.status === 'open');
  $('[data-open-n]').textContent = open.length ? String(open.length) : '';
  $('[data-oc]').innerHTML = open.slice(0, 5).map((c) => `<li><a href="${esc(c.href)}"${tgt(c.href)}><span class="ap-oc-t">${esc(c.title)}</span><span class="ap-oc-m">${hasShares(c) ? '<i class="ap-eq ap-eq-s">Equity</i> ' : ''}<b>${esc(c.pay)}</b> · ${esc(c.scope)}</span></a></li>`).join('') || '<li class="ap-muted">No open contracts right now.</li>';
  const stream = $('[data-contracts-stream]');
  const fn = FILTER_FN[filt];
  const shown = fn ? open.filter(fn) : open.slice(0, 2);
  $('[data-sep-c]').textContent = fn ? FILTERS.find(([k]) => k === filt)[1] : 'New contracts';
  stream.innerHTML = shown.length ? shown.map(contractCard).join('') : `<p class="ap-card ap-empty">${esc(fn ? FILTER_EMPTY[filt] : 'No open contracts right now.')} <a href="/contracts">See all contracts</a></p>`;
}

// ── feed ─────────────────────────────────────────────────────────────────────
function paintPosts() {
  const el = $('[data-posts]');
  // A filter shows contracts only; the posts come back with All.
  $$('[data-posts-sep], [data-posts]').forEach((e) => { e.hidden = filt !== 'all'; });
  if (filt !== 'all' || posts === null) return;
  const more = contracts.filter((c) => c.status === 'open').slice(2); // the rest of the open contracts, between posts
  if (!posts.length) {
    el.innerHTML = more.map(contractCard).join('') + `<p class="ap-card ap-empty">The bChatX feed didn't load just now. <a href="${L.feed}" target="_blank" rel="noopener">Open it in bChatX${ARR}</a></p>`;
    return;
  }
  const now = Date.now(), out = [];
  posts.forEach((p, i) => { out.push(postHTML(p, now)); if ((i + 1) % 4 === 0 && more.length) out.push(contractCard(more.shift())); });
  out.push(...more.map(contractCard));
  out.push(`<p class="ap-end">That's the latest. <a href="${L.feed}" target="_blank" rel="noopener">More on bChatX${ARR}</a></p>`);
  el.innerHTML = out.join('');
}

// ── people ───────────────────────────────────────────────────────────────────
function paintPeople(j) {
  people = j?.profiles || [];
  const list = people.filter((p) => p.username !== me.username).slice(0, 5);
  $('[data-ppl]').innerHTML = list.map((p) => {
    const nm = p.name || p.username;
    return `<li><a href="/u/${encodeURIComponent(p.username)}"><span class="ap-av ap-av-s" style="--h:40" aria-hidden="true"><b>${esc(nm.charAt(0).toUpperCase())}</b></span><span class="ap-ppl-t"><b>${esc(nm)}</b>${p.headline ? `<span>${esc(p.headline)}</span>` : `<span>bjobsx.com/u/${esc(p.username)}</span>`}</span></a></li>`;
  }).join('') || `<li class="ap-muted">${j?.live ? 'No public profiles yet. Make yours public in <a href="/studio">your profile</a>.' : 'Public profiles open shortly.'}</li>`;
}

// ── search: people + contracts, in the browser ───────────────────────────────
function search() {
  const q = $('#ap-q'), box = $('#ap-qres');
  let rows = [], at = -1;
  const close = () => { box.hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); at = -1; };
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    if (!t) return close();
    const hit = (s) => String(s || '').toLowerCase().includes(t);
    const cs = contracts.filter((c) => [c.title, c.line, c.scope, c.kind, c.ref].some(hit)).slice(0, 5)
      .map((c) => ({ href: c.href, k: 'Contract', t: c.title, s: `${c.pay} · ${c.scope}` }));
    const ps = (people || []).filter((p) => [p.name, p.username, p.headline].some(hit)).slice(0, 5)
      .map((p) => ({ href: '/u/' + encodeURIComponent(p.username), k: 'Person', t: p.name || p.username, s: p.headline || 'bjobsx.com/u/' + p.username }));
    rows = [...cs, ...ps];
    box.innerHTML = rows.length
      ? rows.map((r, i) => `<a id="ap-qr-${i}" role="option" aria-selected="false" href="${esc(r.href)}"${tgt(r.href)}><span class="ap-qk">${r.k}</span><b>${esc(r.t)}</b><span>${esc(r.s)}</span></a>`).join('')
      : `<p class="ap-muted">Nothing matches &ldquo;${esc(q.value.trim())}&rdquo;.${people === null ? ' People are still loading.' : ''}</p>`;
    box.hidden = false; q.setAttribute('aria-expanded', 'true'); at = -1;
  };
  const mark = () => $$('[role=option]', box).forEach((a, i) => { a.setAttribute('aria-selected', String(i === at)); if (i === at) { q.setAttribute('aria-activedescendant', a.id); a.scrollIntoView({ block: 'nearest' }); } });
  q.addEventListener('input', draw);
  q.addEventListener('focus', () => { if (q.value.trim()) draw(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (box.hidden || !rows.length) return;
    if (e.key === 'ArrowDown') { at = (at + 1) % rows.length; mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { at = (at - 1 + rows.length) % rows.length; mark(); e.preventDefault(); }
    else if (e.key === 'Enter') { const a = $$('[role=option]', box)[at >= 0 ? at : 0]; if (a) { a.click(); e.preventDefault(); } }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.ap-search')) close(); });
}

// ── menus, popovers, dock ────────────────────────────────────────────────────
function wire() {
  const menu = $('#ap-menu'), notes = $('#ap-notes');
  const shut = (except) => {
    if (except !== menu) { menu.hidden = true; $$('[data-me-open]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
    if (except !== notes) { notes.hidden = true; $('[data-pop=notes]').setAttribute('aria-expanded', 'false'); }
  };
  document.addEventListener('click', (e) => {
    const meB = e.target.closest('[data-me-open]');
    if (meB) {
      const open = menu.hidden; shut(menu); menu.hidden = !open;
      menu.classList.toggle('ap-sheet', !!meB.closest('.ap-tabs'));
      $$('[data-me-open]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
      if (open) $('[role=menuitem]', menu)?.focus();
      return;
    }
    const nB = e.target.closest('[data-pop=notes]');
    if (nB) { const open = notes.hidden; shut(notes); notes.hidden = !open; nB.setAttribute('aria-expanded', String(open)); return; }
    if (e.target.closest('[data-goto-org]')) {
      shut(); const o = $('#ap-org'); o.scrollIntoView({ behavior: 'smooth', block: 'center' }); o.focus({ preventScroll: true });
      o.classList.remove('ap-flash'); void o.offsetWidth; o.classList.add('ap-flash'); return;
    }
    if (e.target.closest('[data-signout]')) { signOut(); return; }
    if (!e.target.closest('#ap-menu, #ap-notes')) shut();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
  $$('[data-filt]').forEach((b) => b.addEventListener('click', () => {
    filt = b.dataset.filt;
    $$('[data-filt]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    paintContracts(); paintPosts();
  }));
  const dh = $('.ap-dock-h'), db = $('#ap-dock-b');
  dh.addEventListener('click', () => { const open = db.hidden; db.hidden = !open; dh.setAttribute('aria-expanded', String(open)); $('.ap-dock').classList.toggle('open', open); });
}

async function signOut() {
  const b = $('[data-signout]'); if (b) { b.disabled = true; b.textContent = 'Signing out…'; }
  try { if (window.bjxSignOut) await window.bjxSignOut(); else await fetch('/api/bwalletx/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', credentials: 'same-origin' }); } catch {}
  try { localStorage.removeItem('bjx-in'); } catch {}
  location.replace('/');
}

// ── start ────────────────────────────────────────────────────────────────────
/** Draw the signed-in home into #app. Returns false (and leaves the landing) if the session turns out not to be there. */
export async function start(identityKey) {
  if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
  const root = document.getElementById('app');
  if (!root) return false;
  me.identityKey = identityKey;
  const profileP = json('/api/profile?me=1');
  root.innerHTML = shell();
  root.hidden = false;
  document.documentElement.classList.add('bjx-app');
  document.documentElement.classList.remove('bjx-wait');
  document.title = 'Home · bJobsX';
  wire(); search(); paintMe();

  profileP.then((p) => {
    if (p && p.signedIn === false) { try { localStorage.removeItem('bjx-in'); } catch {} location.replace('/'); return; }
    const pg = p?.page;
    if (!pg) return;
    me = { ...me, name: pg.displayName || pg.linkedin?.name || pg.alias || '', paymail: pg.paymail || '', avatar: pg.linkedin?.picture || pg.avatar || '', headline: pg.profile?.headline || '', linkedin: !!pg.linkedin || (pg.walletLinks || []).some((l) => l.provider === 'linkedin'), username: pg.username || '' };
    paintMe();
    if (people) paintPeople({ profiles: people, live: true });
  });
  const contractsP = json('/api/contracts').then((j) => {
    contracts = Array.isArray(j?.contracts) ? j.contracts : [];
    paintContracts();
  });
  json('/api/browse').then(paintPeople);
  const feedP = json('/api/feed');
  await contractsP;
  feedP.then((j) => { posts = Array.isArray(j?.posts) ? j.posts : []; paintPosts(); });
  return true;
}
