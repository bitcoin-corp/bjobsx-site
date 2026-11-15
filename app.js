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
import { postHTML, hueFor } from '/lib/feed-view.js';

// The top bar, the phone tab bar and what they need (links, icons, who you are, search) live in topbar.js, shared
// with every other page.
import { L, $, $$, tgt, json, ico, ARR, B_MARK, me, data, avatar, family, topHTML, tabsHTML, paintTop, readProfile, search, wireTop, gotoOrg } from '/topbar.js';

const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

let contracts = [], people = null, posts = null, filt = 'all';
// A plain filter: it only hides cards, never sorts or features them.
const FILTERS = [['all', 'All'], ['bsv', 'Paid in BSV'], ['equity', 'Pays in equity (shares only)'], ['tokens', 'Paid in tokens']];
const FILTER_FN = { bsv: paysBsv, equity: hasShares, tokens: isTokenPay };
const FILTER_EMPTY = { bsv: 'No open contracts pay in BSV right now.', equity: 'No open contracts pay in equity right now.', tokens: 'No open contracts pay in tokens right now.' };

// ── shell ────────────────────────────────────────────────────────────────────
function shell() {
  return `
<a class="ap-skip" href="#ap-feed">Skip to the feed</a>
${topHTML('home')}

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

${tabsHTML('home')}`;
}

// ── you ──────────────────────────────────────────────────────────────────────
function paintMe() {
  const name = paintTop();
  $('.ap-mecard').dataset.name = name;
  const hl = $('[data-me-hl]'); hl.textContent = me.headline; hl.hidden = !me.headline;
  $('[data-me-li]').hidden = !me.linkedin;
  if (!me.paymail) $('.ap-me-pm').insertAdjacentHTML('beforeend', ` <a href="https://bwalletx.com/get" target="_blank" rel="noopener">Get your name</a>`);
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
  people = data.people = j?.profiles || [];
  const list = people.filter((p) => p.username !== me.username).slice(0, 5);
  $('[data-ppl]').innerHTML = list.map((p) => {
    const nm = p.name || p.username;
    return `<li><a href="/u/${encodeURIComponent(p.username)}"><span class="ap-av ap-av-s" style="--h:40" aria-hidden="true"><b>${esc(nm.charAt(0).toUpperCase())}</b></span><span class="ap-ppl-t"><b>${esc(nm)}</b>${p.headline ? `<span>${esc(p.headline)}</span>` : `<span>bjobsx.com/u/${esc(p.username)}</span>`}</span></a></li>`;
  }).join('') || `<li class="ap-muted">${j?.live ? 'No public profiles yet. Make yours public in <a href="/studio">your profile</a>.' : 'Public profiles open shortly.'}</li>`;
}

// ── filters, dock (menus and popovers: wireTop in topbar.js) ─────────────────
function wire() {
  wireTop();
  $$('[data-filt]').forEach((b) => b.addEventListener('click', () => {
    filt = b.dataset.filt;
    $$('[data-filt]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    paintContracts(); paintPosts();
  }));
  const dh = $('.ap-dock-h'), db = $('#ap-dock-b');
  dh.addEventListener('click', () => { const open = db.hidden; db.hidden = !open; dh.setAttribute('aria-expanded', String(open)); $('.ap-dock').classList.toggle('open', open); });
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
    readProfile(pg);
    paintMe();
    if (people) paintPeople({ profiles: people, live: true });
  });
  const contractsP = json('/api/contracts').then((j) => {
    contracts = data.contracts = Array.isArray(j?.contracts) ? j.contracts : [];
    paintContracts();
  });
  json('/api/browse').then(paintPeople);
  const feedP = json('/api/feed');
  await contractsP;
  feedP.then((j) => { posts = Array.isArray(j?.posts) ? j.posts : []; paintPosts(); });
  // "For organisations" on another page lands here.
  if (location.hash === '#ap-org') gotoOrg();
  return true;
}
