// bjobsx.com signed-in top bar and phone tab bar: one source for every page (RB 15 Nov: the bar must stay as you move
// between pages). The home (app.js) draws it as part of the app; every other page gets it from mount(), which bwx.js
// calls once the wallet session is confirmed. Signed out, pages keep the shell header (scripts/build-shell.mjs).
// Styles: app.css (.ap-top, .ap-nav, .ap-menu, .ap-tabs) and, for the pages that only wear the bar, shell.css (bjx-top).
import { esc } from '/lib/contracts-view.js';
import { BCHATX } from '/lib/feed-view.js';

export const L = {
  feed: `${BCHATX}/feed`, board: `${BCHATX}/s/bjobs`, chat: `${BCHATX}/`,
  msg: 'https://bmessagex.com/', git: 'https://www.bchatx.com/bgitx', wallet: 'https://bwalletx.com/',
  org: `${BCHATX}/room/new`, token: `${BCHATX}/tokenise`,
  // Jobs are posted on bJobsX itself (RB 15 Nov): never bChatX's /room/new, which is only for starting an organisation.
  post: '/post', postEquity: '/post?pay=equity',
};

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ext = (h) => /^https?:/.test(h);
export const tgt = (h) => (ext(h) ? ' target="_blank" rel="noopener"' : '');
export const safeImg = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'()<>\\]+$/i.test(u) ? u : '');
export const json = (u) => fetch(u, { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export const shortKey = (k) => (k ? k.slice(0, 6) + '…' + k.slice(-4) : '');
export const ARR = '&nbsp;<span class="ap-arr" aria-hidden="true">&#8599;</span>';

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
export const ico = (n, cls = 'ap-i') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[n]}</svg>`;
export const B_MARK = '<svg viewBox="23 8 74 100" aria-hidden="true" focusable="false"><path fill="currentColor" d="M45 12V72H27V30Z M27 72a33 33 0 1 1 66 0a33 33 0 1 1-66 0Z M45 72a15 15 0 1 0 30 0a15 15 0 1 0-30 0Z"/></svg>';

/** Who is signed in. One object, changed in place, so the bar and the home read the same thing. */
export const me = { identityKey: '', name: '', paymail: '', avatar: '', headline: '', linkedin: false, username: '' };
/** What search looks through. The home fills it as it loads; other pages fetch it the first time search is used. */
export const data = { contracts: [], people: null };

// ── avatar ───────────────────────────────────────────────────────────────────
export function avatar(cls) {
  const init = esc((me.name || me.paymail || 'b').trim().charAt(0).toUpperCase());
  const img = safeImg(me.avatar);
  return `<span class="ap-av ${cls}" data-me-av aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">` : ''}<b>${init}</b></span>`;
}

// ── markup ───────────────────────────────────────────────────────────────────
/** One nav item. `current` is the page you're on: 'home', 'people', 'contracts' or '' (no item lit). */
const navItem = (key, label, href, current, extra = '') => `<a class="ap-nav-i" href="${esc(href)}"${tgt(href)} data-nav="${key}"${key === current ? ' aria-current="page"' : ''}${extra}>${ico(key)}<span>${label}</span></a>`;
export const family = () => `<p class="ap-fam"><span>Part of <a href="${L.wallet}" target="_blank" rel="noopener">bWalletX</a></span><a href="${L.chat}" target="_blank" rel="noopener">bChatX</a><a href="${L.msg}" target="_blank" rel="noopener">bMessageX</a><a href="${L.git}" target="_blank" rel="noopener">bGitX</a></p>`;

/** The top bar: brand, search, Home / People / Contracts / Messages / Notifications / Me, For organisations, Post a job. */
export function topHTML(current = '') {
  return `<header class="ap-top">
  <div class="ap-top-in">
    <a class="ap-brand" href="/" aria-label="bJobsX home">${B_MARK}<span><span class="ap-sr">b</span>Jobs<i>X</i></span></a>
    <button class="ap-me-m" type="button" data-me-open aria-haspopup="menu" aria-expanded="false" aria-label="Me: your profile and sign out">${avatar('ap-av-xs')}</button>
    <div class="ap-search" role="search">
      ${ico('search')}
      <input id="ap-q" type="search" placeholder="Search people and contracts" autocomplete="off" aria-label="Search people and contracts" role="combobox" aria-expanded="false" aria-controls="ap-qres" aria-autocomplete="list">
      <div class="ap-qres" id="ap-qres" role="listbox" aria-label="Search results" hidden></div>
    </div>
    <nav class="ap-nav" aria-label="Main">
      ${navItem('home', 'Home', '/', current)}
      ${navItem('people', 'People', '/browse', current)}
      ${navItem('contracts', 'Contracts', '/contracts', current)}
      ${navItem('messages', 'Messages', L.msg, current, ' title="Messages · bMessageX"')}
      <button class="ap-nav-i" type="button" data-pop="notes" aria-haspopup="dialog" aria-expanded="false">${ico('bell')}<span>Notifications</span></button>
      <div class="ap-me-w">
        <button class="ap-nav-i ap-me-b" type="button" data-me-open aria-haspopup="menu" aria-expanded="false">${avatar('ap-av-xs')}<span>Me ${ico('chev', 'ap-chev')}</span></button>
      </div>
      <span class="ap-div" aria-hidden="true"></span>
      <button class="ap-nav-i ap-org-b" type="button" data-goto-org>${ico('org')}<span>For organisations</span></button>
    </nav>
    <a class="ap-btn ap-btn-gold ap-post" href="${L.post}"${current === 'post' ? ' aria-current="page"' : ''}>${ico('pen')}<span>Post a job</span></a>
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
</header>`;
}

/** The phone tab bar (fixed to the bottom under 768px). */
export function tabsHTML(current = '') {
  return `<nav class="ap-tabs" aria-label="Main">
  ${navItem('home', 'Home', '/', current)}
  ${navItem('people', 'People', '/browse', current)}
  ${navItem('contracts', 'Contracts', '/contracts', current)}
  ${navItem('messages', 'Messages', L.msg, current)}
  <button class="ap-nav-i" type="button" data-me-open aria-haspopup="menu" aria-expanded="false">${avatar('ap-av-xs')}<span>Me</span></button>
</nav>`;
}

/** Which nav item a path lights up. Your own profile (/studio) lights none: it lives under Me. */
export function currentFor(path) {
  const p = String(path || '').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  if (p === '/') return 'home';
  if (p === '/browse' || p.startsWith('/u/')) return 'people';
  if (p === '/contracts') return 'contracts';
  if (p === '/post') return 'post';
  return '';
}

// ── you ──────────────────────────────────────────────────────────────────────
/** Name, paymail and avatar wherever the bar (or the home) shows them. */
export function paintTop() {
  const name = me.name || (me.paymail ? me.paymail.split('@')[0] : 'Your profile');
  $$('[data-me-name]').forEach((e) => { e.textContent = name; });
  $$('[data-me-pm]').forEach((e) => { e.textContent = me.paymail || shortKey(me.identityKey); });
  // Redraw every avatar now the name and picture are known.
  $$('[data-me-av]').forEach((el) => { const cls = [...el.classList].find((c) => /^ap-av-/.test(c)); el.outerHTML = avatar(cls); });
  return name;
}

/** What /api/profile?me=1 says about you, written into `me`. */
export function readProfile(pg) {
  Object.assign(me, { name: pg.displayName || pg.linkedin?.name || pg.alias || '', paymail: pg.paymail || '', avatar: pg.linkedin?.picture || pg.avatar || '', headline: pg.profile?.headline || '', linkedin: !!pg.linkedin || (pg.walletLinks || []).some((l) => l.provider === 'linkedin'), username: pg.username || '' });
}

// ── search: people + contracts, in the browser ───────────────────────────────
/** `load` (other pages) fetches the lists the first time the box is used; the home fills `data` itself. */
export function search(load = null) {
  const q = $('#ap-q'), box = $('#ap-qres');
  let rows = [], at = -1, loading = null;
  const close = () => { box.hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); at = -1; };
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    if (!t) return close();
    const hit = (s) => String(s || '').toLowerCase().includes(t);
    const cs = data.contracts.filter((c) => [c.title, c.line, c.scope, c.kind, c.ref].some(hit)).slice(0, 5)
      .map((c) => ({ href: c.href, k: 'Contract', t: c.title, s: `${c.pay} · ${c.scope}` }));
    const ps = (data.people || []).filter((p) => [p.name, p.username, p.headline].some(hit)).slice(0, 5)
      .map((p) => ({ href: '/u/' + encodeURIComponent(p.username), k: 'Person', t: p.name || p.username, s: p.headline || 'bjobsx.com/u/' + p.username }));
    rows = [...cs, ...ps];
    box.innerHTML = rows.length
      ? rows.map((r, i) => `<a id="ap-qr-${i}" role="option" aria-selected="false" href="${esc(r.href)}"${tgt(r.href)}><span class="ap-qk">${r.k}</span><b>${esc(r.t)}</b><span>${esc(r.s)}</span></a>`).join('')
      : `<p class="ap-muted">Nothing matches &ldquo;${esc(q.value.trim())}&rdquo;.${data.people === null ? ' People are still loading.' : ''}</p>`;
    box.hidden = false; q.setAttribute('aria-expanded', 'true'); at = -1;
  };
  const need = () => { if (load && !loading) loading = load().then(() => { if (q.value.trim()) draw(); }); };
  const mark = () => $$('[role=option]', box).forEach((a, i) => { a.setAttribute('aria-selected', String(i === at)); if (i === at) { q.setAttribute('aria-activedescendant', a.id); a.scrollIntoView({ block: 'nearest' }); } });
  q.addEventListener('input', () => { need(); draw(); });
  q.addEventListener('focus', () => { need(); if (q.value.trim()) draw(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (box.hidden || !rows.length) return;
    if (e.key === 'ArrowDown') { at = (at + 1) % rows.length; mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { at = (at - 1 + rows.length) % rows.length; mark(); e.preventDefault(); }
    else if (e.key === 'Enter') { const a = $$('[role=option]', box)[at >= 0 ? at : 0]; if (a) { a.click(); e.preventDefault(); } }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.ap-search')) close(); });
}

// ── menus and popovers ───────────────────────────────────────────────────────
/** For organisations: the Build box on the home. On the home, scroll to it; anywhere else, go there. */
export function gotoOrg() {
  const o = $('#ap-org');
  if (!o) { location.assign('/#ap-org'); return; }
  o.scrollIntoView({ behavior: 'smooth', block: 'center' }); o.focus({ preventScroll: true });
  o.classList.remove('ap-flash'); void o.offsetWidth; o.classList.add('ap-flash');
}

export function wireTop() {
  const menu = $('#ap-menu'), notes = $('#ap-notes');
  const shut = (except) => {
    if (except !== menu) { menu.hidden = true; $$('[data-me-open]').forEach((b) => b.setAttribute('aria-expanded', 'false')); }
    if (except !== notes) { notes.hidden = true; $('[data-pop=notes]').setAttribute('aria-expanded', 'false'); }
  };
  document.addEventListener('click', (e) => {
    if (!menu.isConnected) return;
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
    if (e.target.closest('[data-goto-org]')) { shut(); gotoOrg(); return; }
    if (e.target.closest('[data-signout]')) { signOut(); return; }
    if (!e.target.closest('#ap-menu, #ap-notes')) shut();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.isConnected) shut(); });
}

export async function signOut() {
  const b = $('[data-signout]'); if (b) { b.disabled = true; b.textContent = 'Signing out…'; }
  try { if (window.bjxSignOut) await window.bjxSignOut(); else await fetch('/api/bwalletx/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', credentials: 'same-origin' }); } catch {}
  try { localStorage.removeItem('bjx-in'); } catch {}
  location.replace('/');
}

// ── every page but the home ──────────────────────────────────────────────────
const d = document.documentElement;
let mounted = null;

/** Take the bar off again (signed out, or the session turned out not to be there): the shell header comes back. */
export function unmount() {
  d.classList.remove('bjx-top', 'bjx-top-on');
  if (mounted) { mounted.remove(); mounted = null; }
}

/**
 * Put the signed-in bar on a page that isn't the home, in place of the shell header. bwx.js calls this once
 * GET /api/bwalletx/session has named the wallet. Safe to call twice. Returns false if there's nothing to do.
 */
export async function mount(identityKey) {
  if (!identityKey || document.getElementById('app')) return false;
  if (mounted) return true;
  me.identityKey = identityKey;
  d.classList.add('bjx-top');
  if (!$('link[href="/app.css"]')) await new Promise((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/app.css'; l.onload = l.onerror = ok; document.head.appendChild(l); });
  if (mounted || !d.classList.contains('bjx-top')) return !!mounted;
  const current = currentFor(location.pathname);
  mounted = document.createElement('div');
  mounted.id = 'app'; mounted.className = 'ap-chrome';
  mounted.innerHTML = topHTML(current) + tabsHTML(current);
  document.body.prepend(mounted);
  d.classList.add('bjx-top-on');
  wireTop(); paintTop();
  search(async () => {
    const [c, p] = await Promise.all([json('/api/contracts'), json('/api/browse')]);
    data.contracts = Array.isArray(c?.contracts) ? c.contracts : [];
    data.people = p?.profiles || [];
  });
  json('/api/profile?me=1').then((p) => {
    if (p && p.signedIn === false) { try { localStorage.removeItem('bjx-in'); } catch {} unmount(); return; }
    if (p?.page && mounted) { readProfile(p.page); paintTop(); }
  });
  return true;
}
