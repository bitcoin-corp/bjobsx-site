// bJobsX profile page: /studio (the signed-in wallet's own) and /u/<username> (anyone's; owner tools when it's yours).
// The page names the wallet by its full paymail (name@bwalletx.com); with no name yet, a short key + "Get your name".
//
// Privacy model:
// - The LinkedIn export is parsed here, in the browser (lib/linkedin.js). The import is kept in this browser's
//   localStorage only. It is never sent to our server.
// - Every section is private by default. Only the sections the owner ticks AND publishes (wallet-signed) are sent to
//   the server, and only those are shown at /u/<name> and in Browse.
// - Connections (other people's data) are shown only to the owner, never published, and only minted (privately) when
//   the owner ticks "Include my connections".
// - Everything from the files or the server is escaped before it is put in the page.
import * as L from '/lib/linkedin.js';
import * as R from '/mint/records.js';
import { esc, ls, recordsN, txN, usd, satsText, doneKey, doneFor, loadCfg, pinCheck, liveBlock, friendly } from '/mint/core.js';
import { checklist, state as siteState } from '/status.js';

const $ = (id) => document.getElementById(id);
const TEST = !/^(www\.)?bjobsx\.com$/.test(location.hostname);
const uname = decodeURIComponent((location.pathname.match(/^\/u\/([^/]+)/) || [])[1] || '').toLowerCase();
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const SECTION_NAMES = { intro: 'Name and headline', about: 'About', positions: 'Experience', education: 'Education', skills: 'Skills', certifications: 'Certifications' };
const KIND_NAMES = { profile: 'Whole profile', position: 'Position', education: 'Education', certification: 'Certification', connections: 'Connections' };
const say = (el, text, kind = '') => { el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); };
const badge = (el, live, text) => { el.className = 'badge ' + (live ? 'live' : 'coming'); el.textContent = text || (live ? 'Live' : 'Coming'); };
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'()<>\\]+$/i.test(u) ? u : null);
const enc = new TextEncoder();
const sha256hex = async (t) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t))), (b) => b.toString(16).padStart(2, '0')).join('');

let P = null, pg = null, mode = null; // mode: 'owner' | 'public' | 'guest'
let data = null, sections = new Set(), cfg = null, busy = false, site = null;
const picked = new Set();
const key = () => (mode === 'owner' ? pg.identityKey : null);
const slot = () => key() || 'guest';
const importKey = () => `bjx-import-${slot()}`;
const sectionsKey = () => `bjx-public-${slot()}`;
const done = () => doneFor(key());

if (TEST) $('testbar').hidden = false;

// ── load ──────────────────────────────────────────────────────────────────────
async function load() {
  const p = await fetch(uname ? '/api/profile?name=' + encodeURIComponent(uname) : '/api/profile?me=1', { cache: 'no-store' })
    .then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, status: 0, j: {} }));
  $('loading').hidden = true;
  site = await siteState();
  checklist($('checklist'), site);
  if (uname && p.status === 404) { $('nf').hidden = false; $('nfTitle').textContent = `No profile called ${uname} yet.`; return; }
  if (!p.ok || !p.j.page) {
    if (uname) { $('nf').hidden = false; $('nfTitle').textContent = 'That profile didn’t open.'; $('nfLede').textContent = 'Try again in a minute.'; return; }
    $('gate').hidden = false;
    if (ls.get('bjx-import-guest')) startGuest();
    return;
  }
  P = p.j; pg = P.page;
  mode = P.isOwner ? 'owner' : 'public';
  if (uname && pg.username && uname !== pg.username) history.replaceState(null, '', '/u/' + encodeURIComponent(pg.username) + location.search + location.hash);
  if (mode === 'owner') {
    // An import made before connecting moves to this wallet's slot.
    if (!ls.get(importKey()) && ls.get('bjx-import-guest')) { ls.set(importKey(), ls.get('bjx-import-guest')); ls.del('bjx-import-guest'); }
    data = ls.get(importKey());
    const saved = ls.get(sectionsKey());
    sections = new Set(Array.isArray(saved) ? saved : publishedSections());
  }
  $('page').hidden = false;
  paint();
  if (mode === 'owner') { account(); cfg = await loadCfg(); paintMint(); if (location.hash.slice(1)) openModal(location.hash.slice(1)); }
}

/** Guest: no wallet. The import works and stays in this browser; publishing and minting need a wallet. */
function startGuest() {
  mode = 'guest'; pg = { username: null, alias: null, paymail: null, profile: null, settingsLive: false };
  data = ls.get(importKey());
  const saved = ls.get(sectionsKey());
  sections = new Set(Array.isArray(saved) ? saved : []);
  $('gate').hidden = true; $('page').hidden = false;
  paint();
}

const publishedSections = () => {
  const pr = pg?.profile; if (!pr) return [];
  return L.PUBLIC_SECTIONS.filter((s) => (s === 'intro' ? 'name' in pr : s === 'about' ? 'summary' in pr : s in pr));
};

// ── header ───────────────────────────────────────────────────────────────────
function setAvatar(url, name) {
  const av = $('av'); av.setAttribute('aria-label', name || '');
  av.textContent = (name || 'b').trim().charAt(0).toUpperCase(); av.classList.add('init'); av.style.backgroundImage = '';
  const u = safeUrl(url); if (!u) return;
  const i = new Image();
  i.onload = () => { av.style.backgroundImage = `url("${u}")`; av.textContent = ''; av.classList.remove('init'); };
  i.src = u;
}

function head() {
  const p = data?.profile, pub = pg.profile;
  const own = mode !== 'public';
  const importedName = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
  const name = (own ? importedName : pub?.name) || pg.displayName || pg.alias || (mode === 'guest' ? 'Your profile' : 'bJobsX profile');
  document.title = `${own ? 'Your profile' : name} · bJobsX`;
  $('kick').textContent = own ? (mode === 'guest' ? 'Your profile · on this device' : 'Your profile') : 'Profile';
  $('name').textContent = name;
  // Full paymail is the primary identity label (never the key alone or the bare $handle).
  const sk = pg.identityKey ? pg.identityKey.slice(0, 6) + '\u2026' + pg.identityKey.slice(-4) : '';
  $('handle').textContent = pg.paymail || (mode === 'guest' ? 'Connect bWalletX to get your link' : sk);
  $('mail').textContent = (own ? p?.headline : pub?.headline) || '';
  if (!pg.paymail && mode === 'owner') $('mail').insertAdjacentHTML('beforeend', ' <a href="https://bwalletx.com/get" target="_blank" rel="noopener">Get your name</a>');
  setAvatar(pg.avatar, name);
  if (pg.username && mode !== 'guest') {
    $('linkRow').hidden = false; $('pubLink').textContent = 'bjobsx.com/u/' + pg.username;
    $('copyLink').onclick = async () => { try { await navigator.clipboard.writeText('https://bjobsx.com/u/' + pg.username); $('copyLink').textContent = 'Copied'; } catch { $('copyLink').textContent = 'Copy failed'; } setTimeout(() => { $('copyLink').textContent = 'Copy link'; }, 1600); };
  }
}

// ── profile sections ─────────────────────────────────────────────────────────
const when = (a, b) => [a, b || (a ? 'Present' : '')].filter(Boolean).join(' – ');
const toggle = (s) => mode === 'public' ? '' : `<label class="vis"><input type="checkbox" data-sec="${s}"${sections.has(s) ? ' checked' : ''}> <span>${sections.has(s) ? 'Public' : 'Private'}</span></label>`;
const panel = (s, title, body) => `<section class="panel sec" aria-label="${esc(title)}"><div class="sec-h"><h2>${esc(title)}</h2>${toggle(s)}</div>${body}</section>`;

/** Section bodies from a view {name, headline, location, industry, summary, websites, positions, education, skills, certifications}. */
function sectionsHtml(v, show) {
  const out = [];
  if (show('intro') && (v.name || v.headline)) out.push(panel('intro', 'Name and headline', `<p style="margin:0;font:700 20px 'Space Grotesk';overflow-wrap:anywhere">${esc(v.name || '')}</p><p class="mute" style="margin:4px 0 0;overflow-wrap:anywhere">${esc(v.headline || '')}</p>`));
  if (show('about') && (v.summary || v.location || v.industry || v.websites?.length)) {
    const facts = [v.location && `<span>${esc(v.location)}</span>`, v.industry && `<span>${esc(v.industry)}</span>`,
      ...(v.websites || []).map((u) => (safeUrl(u) ? `<a href="${esc(u)}" rel="nofollow ugc noopener" target="_blank">${esc(u.replace(/^https:\/\//, '').replace(/\/$/, ''))}</a>` : ''))].filter(Boolean).join('');
    out.push(panel('about', 'About', `${facts ? `<p class="facts">${facts}</p>` : ''}${v.summary ? `<p class="summary">${esc(v.summary)}</p>` : ''}`));
  }
  if (show('positions') && v.positions?.length) out.push(panel('positions', 'Experience', `<ol class="tl">${v.positions.map((x) => `<li><b>${esc(x.title)}</b><span class="at">${esc(x.company)}${x.location ? ' · ' + esc(x.location) : ''}</span><br><span class="when">${esc(when(x.startedOn, x.finishedOn))}</span>${x.description ? `<p>${esc(x.description)}</p>` : ''}</li>`).join('')}</ol>`));
  if (show('education') && v.education?.length) out.push(panel('education', 'Education', `<ol class="tl">${v.education.map((x) => `<li><b>${esc(x.school)}</b><span class="at">${esc(x.degree)}</span><br><span class="when">${esc([x.startedOn, x.finishedOn].filter(Boolean).join(' – '))}</span>${x.notes ? `<p>${esc(x.notes)}</p>` : ''}${x.activities ? `<p>${esc(x.activities)}</p>` : ''}</li>`).join('')}</ol>`));
  if (show('skills') && v.skills?.length) out.push(panel('skills', `Skills (${v.skills.length})`, `<div class="chips">${v.skills.map((s) => `<span>${esc(s)}</span>`).join('')}</div>`));
  if (show('certifications') && v.certifications?.length) out.push(panel('certifications', 'Certifications', `<ol class="tl">${v.certifications.map((x) => `<li><b>${esc(x.name)}</b><span class="at">${esc(x.authority)}</span><br><span class="when">${esc([x.startedOn, x.finishedOn].filter(Boolean).join(' – '))}${x.licenseNumber ? ' · ' + esc(x.licenseNumber) : ''}</span>${safeUrl(x.url) ? `<p><a class="gold" href="${esc(x.url)}" rel="nofollow ugc noopener" target="_blank">See credential</a></p>` : ''}</li>`).join('')}</ol>`));
  return out.join('');
}

const viewOf = (d) => {
  const p = d.profile || {};
  return { name: [p.firstName, p.lastName].filter(Boolean).join(' '), headline: p.headline, location: p.location, industry: p.industry, summary: p.summary, websites: p.websites, positions: d.positions, education: d.education, skills: d.skills, certifications: d.certifications };
};

function paint() {
  head();
  const own = mode !== 'public';
  $('owner3').hidden = !own; $('ownerLinks').hidden = !own; $('pubLinks').hidden = own;
  $('unameChip').hidden = mode === 'guest';
  $('st1').classList.toggle('done', mode === 'owner');
  $('st1b').textContent = mode === 'owner' ? 'Wallet connected' : 'Connect bWalletX';
  $('st1s').textContent = mode === 'owner' ? (pg.paymail || (pg.identityKey ? pg.identityKey.slice(0, 6) + '\u2026' + pg.identityKey.slice(-4) : 'Connected')) : 'To publish and mint';
  if (own) {
    const c = data ? L.counts(data) : null;
    $('st2').classList.toggle('done', !!data);
    $('st2s').textContent = c ? `${c.positions} positions · ${c.education} schools · ${c.skills} skills` : 'Not imported yet';
    if (!data) {
      $('profile').innerHTML = `<section class="panel"><h2>Bring in your LinkedIn data</h2><p class="mute">Your profile fills in from the export LinkedIn gives you. Everything stays private until you choose.</p><div class="row2"><button class="btn btn-gold" type="button" data-open="import">Import LinkedIn</button><button class="btn btn-ghost" type="button" data-walk>How to get the export</button></div></section>`;
    } else {
      $('profile').innerHTML = sectionsHtml(viewOf(data), () => true) || '<section class="panel"><p class="mute">That import had no profile sections. Try the full ZIP.</p></section>';
    }
    paintPubbar(); paintConnections();
    $('mint').hidden = !data;
    if (data) paintMint();
  } else {
    const pr = pg.profile;
    $('profile').innerHTML = pr ? sectionsHtml(pr, () => true) : '<section class="panel"><p class="mute" style="margin:0">Nothing on this profile is public yet.</p></section>';
    if (P.signedIn === false) $('profile').insertAdjacentHTML('beforeend', '<p class="hint">Is this yours? Connect bWalletX at the top to manage it.</p>');
  }
}

function paintPubbar() {
  const bar = $('pubbar');
  bar.hidden = !data;
  if (!data) return;
  const want = L.PUBLIC_SECTIONS.filter((s) => sections.has(s));
  const live = publishedSections();
  const changed = want.join() !== live.join() || (pg.profile && JSON.stringify(L.publicProfile(data, want)) !== JSON.stringify(pg.profile));
  const names = (l) => (l.length ? l.map((s) => SECTION_NAMES[s]).join(', ') : 'nothing');
  $('pubQ').textContent = mode === 'guest' ? `Public when you publish: ${names(want)}. Connect bWalletX to publish.`
    : `Public now: ${names(live)}.${changed ? ` After publishing: ${names(want)}.` : ''}`;
  $('pubSave').textContent = want.length ? 'Publish' : live.length ? 'Make all private' : 'Publish';
  $('pubSave').disabled = busy || mode === 'guest' || !changed;
}

function paintConnections() {
  const list = data?.connections || [];
  $('connPanel').hidden = !list.length;
  if (!list.length) return;
  $('cSum').textContent = `Show ${list.length.toLocaleString('en-GB')} connections`;
  const SHOW = 300;
  $('cList').innerHTML = list.slice(0, SHOW).map((c) => `<tr><td><b>${esc([c.firstName, c.lastName].filter(Boolean).join(' '))}</b></td><td>${esc([c.position, c.company].filter(Boolean).join(' · '))}<br><span class="mute">${esc(c.connectedOn)}</span></td></tr>`).join('');
  $('cMore').textContent = list.length > SHOW ? `Showing the first ${SHOW}. All ${list.length.toLocaleString('en-GB')} are kept on this device.` : '';
}

$('profile').addEventListener('change', (e) => {
  const s = e.target.dataset?.sec; if (!s) return;
  e.target.checked ? sections.add(s) : sections.delete(s);
  e.target.nextElementSibling.textContent = e.target.checked ? 'Public' : 'Private';
  ls.set(sectionsKey(), [...sections]);
  say($('pubMsg'), '');
  paintPubbar();
});

// ── publish (wallet-signed) ──────────────────────────────────────────────────
/** Sign and save {username, profile}. The server checks the signature against the signed-in identity. */
async function saveSigned(username, profile) {
  const w = await window.bjxWallet();
  const timestamp = Date.now();
  const hash = profile ? await sha256hex(JSON.stringify(profile)) : '-';
  const msg = `bjobsx profile ${key()} ${username} ${hash} ${timestamp}`;
  const { signature } = await w.createSignature({ protocolID: [2, 'bjobsx profile'], keyID: 'settings', counterparty: 'anyone', data: Array.from(enc.encode(msg)) });
  const r = await fetch('/api/profile/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, profile, timestamp, signature }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'That wasn’t saved.');
  return j;
}
const walletWords = (e) => /denied|declin|reject|cancel/i.test(String(e?.message)) ? 'Your wallet said no, so nothing changed.'
  : e?.code === 'NOT_FOUND' ? 'Your wallet isn’t connected in this browser. Press Connect bWalletX at the top, then try again.' : (e?.message || 'That didn’t work. Try again.');

$('pubSave').onclick = async () => {
  if (busy || mode !== 'owner') return;
  const want = L.PUBLIC_SECTIONS.filter((s) => sections.has(s));
  const profile = L.publicProfile(data, want);
  if (profile && enc.encode(JSON.stringify(profile)).length > 64 * 1024) return say($('pubMsg'), 'That is too much to publish at once. Make fewer sections public, or shorten long descriptions.', 'bad');
  if (!pg.settingsLive) return say($('pubMsg'), 'Publishing opens shortly. Your choices are saved on this device until then.');
  const username = pg.username && USERNAME_RE.test(pg.username) ? pg.username : null;
  if (!username) { openModal('account'); return say($('uMsg'), 'Pick a username first. Your $name has a character a link can’t use.', 'bad'); }
  busy = true; paintPubbar(); $('pubSave').classList.add('busy'); say($('pubMsg'), 'Check your wallet: it signs what goes public.');
  try {
    const j = await saveSigned(username, profile);
    pg.profile = j.profile ?? profile; pg.username = j.username || username; pg.usernameSaved = true;
    say($('pubMsg'), profile ? `Published ✓ Your page shows: ${want.map((s) => SECTION_NAMES[s]).join(', ')}.` : 'Done ✓ Nothing on your page is public now.', 'ok');
    head();
  } catch (e) { say($('pubMsg'), walletWords(e), 'bad'); }
  busy = false; $('pubSave').classList.remove('busy'); paintPubbar();
};

// ── username ─────────────────────────────────────────────────────────────────
function account() {
  badge($('uBadge'), pg.settingsLive);
  $('uIn').value = pg.username && USERNAME_RE.test(pg.username) ? pg.username : '';
  $('uIn').oninput = () => { const v = $('uIn').value.trim().toLowerCase(); $('uIn').setAttribute('aria-invalid', String(!!v && !USERNAME_RE.test(v))); };
  $('uForm').onsubmit = async (e) => {
    e.preventDefault();
    const out = $('uMsg'), btn = $('uSave'), username = $('uIn').value.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return say(out, 'Use 3 to 30 letters, numbers, - or _, starting with a letter or number.', 'bad');
    if (!pg.settingsLive) return say(out, `Coming soon: choosing your own username opens shortly.${pg.username ? ' Your link is bjobsx.com/u/' + pg.username + ' until then.' : ''}`);
    if (pg.usernameSaved && username === pg.username) return say(out, 'Nothing to change: that’s already saved.');
    btn.disabled = true; btn.classList.add('busy'); btn.textContent = 'Check your wallet…'; say(out, '');
    try {
      const j = await saveSigned(username, pg.profile || null);
      pg.username = j.username || username; pg.usernameSaved = true;
      say(out, 'Saved ✓ Your profile is at bjobsx.com/u/' + pg.username, 'ok'); head();
      if (uname) history.replaceState(null, '', '/u/' + encodeURIComponent(pg.username));
    } catch (er) { say(out, walletWords(er), 'bad'); }
    btn.disabled = false; btn.classList.remove('busy'); btn.textContent = 'Save';
  };
}

// ── import (in the browser only) ─────────────────────────────────────────────
async function importFiles(files) {
  const msg = $('iMsg');
  say(msg, 'Reading…');
  $('iDone').hidden = true;
  try {
    let d = data || L.empty();
    const list = [...files];
    if (!list.length) throw new Error('Choose a file first.');
    const csvs = [];
    for (const f of list) {
      if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
        if (f.size > L.LIMITS.zipBytes) throw new Error(`That ZIP is over ${L.LIMITS.zipBytes / 1048576} MB. Upload just the CSV files inside it instead.`);
        if (!window.JSZip) throw new Error('The ZIP reader didn’t load. Reload the page, or upload the CSV files instead.');
        d = await L.fromZip(window.JSZip, await f.arrayBuffer(), d);
      } else if (/\.csv$/i.test(f.name)) {
        if (f.size > L.LIMITS.csvBytes) throw new Error(`${f.name} is too big to read.`);
        csvs.push({ name: f.name, text: await f.text() });
      }
    }
    if (csvs.length) d = L.fromTexts(csvs, d);
    if (!d.files.length) throw new Error('None of those are LinkedIn files. Look for Profile.csv, Positions.csv, Education.csv, Skills.csv.');
    data = d;
    const kept = ls.set(importKey(), data);
    const c = L.counts(data);
    $('counts').innerHTML = [['Profile', c.profile ? 'Yes' : 'No'], ['Positions', c.positions], ['Education', c.education], ['Skills', c.skills], ['Certifications', c.certifications], ['Connections (private)', c.connections]]
      .map(([t, n]) => `<div><b>${esc(String(n))}</b><span>${esc(t)}</span></div>`).join('');
    say(msg, kept ? 'Imported ✓ Kept in this browser only. Everything is private until you choose.' : 'Imported ✓ This browser has no room to keep it, so it is here until you close the tab.', 'ok');
    $('iDone').hidden = false;
    paint();
  } catch (e) { say(msg, e?.message || 'That file didn’t open.', 'bad'); }
}
$('file').onchange = (e) => { importFiles(e.target.files); e.target.value = ''; };
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => importFiles(e.dataTransfer?.files || []));
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
drop.tabIndex = 0;
$('iClear').onclick = () => { ls.del(importKey()); data = null; $('counts').innerHTML = ''; $('iDone').hidden = true; say($('iMsg'), 'Removed from this browser.'); paint(); };

// ── mint ─────────────────────────────────────────────────────────────────────
const items = () => (data ? R.itemsFor(data, { withConnections: $('withConn').checked }) : []);
const selection = () => items().filter((it) => picked.has(it.id) && !done()[it.id]);
const gate = () => (mode !== 'owner' ? 'Connect bWalletX to mint. Your import stays in this browser.' : liveBlock({ cfg, key: key(), walletKey: null, pinned: null, seen: '' }));

async function paintMint() {
  if (!data || $('mint').hidden) return;
  const list = items(), d = done();
  $('items').innerHTML = list.map((it) => {
    const m = !!d[it.id], sel = picked.has(it.id);
    return `<label class="it${sel ? ' sel' : ''}"><input type="checkbox" data-id="${esc(it.id)}"${sel || m ? ' checked' : ''}${m || busy ? ' disabled' : ''} aria-label="Select ${esc(it.title)}"><span style="min-width:0"><span class="k">${esc(KIND_NAMES[it.kind])}</span><br><span class="t">${esc(it.title || KIND_NAMES[it.kind])}</span></span>${m ? '<span class="seal">MINTED</span>' : '<span></span>'}</label>`;
  }).join('');
  const n = Object.keys(d).length;
  $('st3s').textContent = n ? `${recordsN(n)} minted` : 'Ready when you are';
  $('st3').classList.toggle('done', n > 0);
  const left = list.filter((it) => !d[it.id]), sel = selection();
  $('selAll').textContent = left.length && sel.length === left.length ? 'Clear' : 'Select all';
  $('selAll').disabled = busy || !left.length;
  const block = gate();
  badge($('mBadge'), !block, block ? 'Dry run' : 'Live');
  $('mintBtn').textContent = sel.length ? `Mint ${recordsN(sel.length)}` : 'Mint';
  $('mintBtn').disabled = busy || !sel.length || !!block;
  $('dryBtn').disabled = busy || !sel.length || mode !== 'owner';
  if (!sel.length) { $('usd').textContent = ''; $('sats').textContent = left.length ? 'Pick the records to mint.' : 'Everything here is minted.'; }
  else if (!cfg) { $('usd').textContent = ''; $('sats').textContent = 'Pricing…'; }
  else {
    const p = await R.plan(sel, cfg);
    $('usd').textContent = usd(p.totalSats, cfg) || '';
    $('sats').textContent = `${satsText(p.totalSats)} · 1p × ${sel.length} + network fee ${satsText(p.feeSats)} · ${txN(p.txs)}, one approval each`;
  }
  if (!busy) { const m = $('mintMsg'); if (block && !m.textContent) say(m, block); }
}

$('items').addEventListener('change', (e) => { const id = e.target.dataset?.id; if (!id) return; e.target.checked ? picked.add(id) : picked.delete(id); paintMint(); });
$('withConn').onchange = () => { if (!$('withConn').checked) for (const it of R.itemsFor(data, { withConnections: true })) if (it.kind === 'connections') picked.delete(it.id); paintMint(); };
$('selAll').onclick = () => { const left = items().filter((it) => !done()[it.id]); const all = left.length && left.every((it) => picked.has(it.id)); left.forEach((it) => (all ? picked.delete(it.id) : picked.add(it.id))); paintMint(); };
$('mintBtn').onclick = () => run(false);
$('dryBtn').onclick = () => run(true);
$('openBtn').onclick = () => readBack();

async function run(dryRun) {
  if (busy || mode !== 'owner') return;
  const msg = $('mintMsg'), err = $('mintErr');
  busy = true; say(err, '', 'bad'); paintMint();
  try {
    const w = await window.bjxWallet();
    const walletKey = (await w.getPublicKey({ identityKey: true })).publicKey;
    const pin = await pinCheck(w); // fresh on every press: an old answer never sticks
    cfg = await loadCfg();
    if (!cfg) throw new Error("We couldn't get today's prices. Try again in a minute.");
    if (!dryRun) { const b = liveBlock({ cfg, key: key(), walletKey, pinned: pin.ok, seen: pin.seen }); if (b) throw new Error(b); }
    const sel = selection();
    if (!sel.length) throw new Error('Pick the records to mint.');
    const p = await R.plan(sel, cfg);
    const payeeScript = cfg.payee ? await R.p2pkhScriptFor(cfg.payee) : null;
    if (!dryRun && !payeeScript) throw new Error('No payee set.');
    say(msg, dryRun ? 'Check your wallet: it encrypts your records with your keys. Nothing is sent.'
      : `Check your wallet: one approval per batch, "Mint ${recordsN(sel.length)}, locked to you on bjobsx.com", covers locking and paying (${usd(p.totalSats, cfg)}).`);
    let n = 0; const dry = [];
    await R.runMint({
      wallet: w, items: sel, dryRun, perTx: cfg.perTx || R.PER_TX, payeeScript, premiumSatsPerItem: p.premiumSatsPerItem,
      done: dryRun ? {} : done(),
      onChecking: () => say(msg, 'Approved. Checking the network has it…'),
      onBatch: (es) => {
        n += es.length;
        if (dryRun) dry.push(...es);
        else { const d = done(); for (const e of es) d[e.itemId] = { outpoint: e.outpoint, kid: e.kid }; ls.set(doneKey(key()), d); }
        say(msg, `${dryRun ? 'Dry run: ' : ''}${n} of ${recordsN(sel.length)} ${dryRun ? 'encrypted on this device. Nothing sent.' : 'written and seen on chain.'}`);
      },
    });
    if (dryRun) ls.set(`bjx-dry-${key()}`, dry.map((e) => ({ outpoint: e.outpoint, kid: e.kid, script: e.script })));
    picked.clear();
    say(msg, dryRun ? `Dry run done: ${recordsN(n)} encrypted by your wallet, about ${usd(p.totalSats, cfg)} if minted. Nothing was sent or spent.`
      : `Done: ${recordsN(n)} written, locked with your keys, and seen on chain.`, 'ok');
    readBack(w);
  } catch (e) { say(msg, ''); say(err, friendly(e), 'bad'); }
  busy = false; paintMint();
}

/** "Your minted records": live records from the wallet's actions + this device's dry run, decrypted locally. */
async function readBack(w) {
  const out = $('minted'), rows = [];
  out.innerHTML = '<p class="mute">Opening your records on this device…</p>';
  try {
    w = w || await window.bjxWallet();
    const seen = new Set();
    try {
      const a = await w.listActions({ labels: [R.LABEL], includeOutputs: true, includeOutputLockingScripts: true, limit: 200 });
      for (const t of a.actions || []) for (const o of t.outputs || []) {
        if (!o.lockingScript || !R.parseRecordScript(o.lockingScript)) continue;
        const r = await R.openRecord(w, o.lockingScript).catch(() => null);
        if (r && !seen.has(r.record.id)) { seen.add(r.record.id); rows.push({ ...r, outpoint: `${t.txid}:${o.outputIndex}`, dry: false }); }
      }
      if (rows.length) { const d = done(); for (const r of rows) d[r.record.id] = d[r.record.id] || { outpoint: r.outpoint, kid: r.kid }; ls.set(doneKey(key()), d); }
    } catch {}
    for (const e of ls.get(`bjx-dry-${key()}`) || []) {
      const r = await R.openRecord(w, e.script).catch(() => null);
      if (r) rows.push({ ...r, outpoint: e.outpoint, dry: true });
    }
  } catch (e) { out.innerHTML = `<p class="msg bad">${esc(friendly(e))}</p>`; return; }
  const title = (r) => (r.record.kind === 'profile' ? 'Whole profile' : r.record.kind === 'connections' ? `Connections (${r.record.data.length})` : r.record.data.title || r.record.data.school || r.record.data.name || KIND_NAMES[r.record.kind]);
  out.innerHTML = rows.length ? rows.map((r, i) => `<div class="rec"><div><b>${esc(title(r))}</b><br><span class="mute">${esc(KIND_NAMES[r.record.kind])} · ${r.dry ? 'Dry run, on this device only' : 'On chain · ' + esc(r.outpoint.slice(0, 10)) + '…'} · <span class="vis-t" data-i="${i}">private</span></span></div>${r.record.kind === 'connections' ? '<span class="mute" style="font-size:13px">Always private</span>' : `<button class="btn btn-ghost pubBtn" type="button" data-i="${i}">Make public</button>`}</div>`).join('')
    : '<p class="mute">No minted records yet.</p>';
  out.onclick = (e) => { const b = e.target.closest('.pubBtn'); if (b) makePublic(rows[Number(b.dataset.i)], b); };
  paintMint();
}

/** Styled in-page confirm (never a browser dialog). */
function ask(title, body, yes) {
  return new Promise((resolve) => {
    const m = document.createElement('div'); m.className = 'ask'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = `<div><h3>${esc(title)}</h3><p>${esc(body)}</p><div class="row"><button type="button" class="btn btn-ghost no">Cancel</button><button type="button" class="btn btn-gold go">${esc(yes)}</button></div></div>`;
    const close = (v) => { m.remove(); document.removeEventListener('keydown', k); resolve(v); };
    const k = (e) => { if (e.key === 'Escape') close(false); };
    m.onclick = (e) => { if (e.target === m || e.target.closest('.no')) close(false); else if (e.target.closest('.go')) close(true); };
    document.addEventListener('keydown', k); document.body.appendChild(m); m.querySelector('.go').focus();
  });
}

async function makePublic(r, btn) {
  if (!r || r.record.kind === 'connections') return;
  const ok = await ask('Make this record public?', 'It goes on chain in clear, signed by you. Anyone can read it. That can’t be undone.', 'Make public');
  if (!ok) return;
  btn.disabled = true;
  try {
    const w = await window.bjxWallet();
    const script = await R.publicScript(w, r.record, r.kid, r.outpoint);
    const pin = await pinCheck(w);
    if (r.dry || !pin.ok) { btn.textContent = `Dry run: ${script.length / 2} bytes, not sent`; return; }
    const t = await w.createAction({ description: 'bJobsX: make one profile record public', outputs: [{ lockingScript: script, satoshis: 0, outputDescription: 'Public profile record' }], labels: [R.LABEL, 'bjobsx public'], options: { randomizeOutputs: false, acceptDelayedBroadcast: false, spendingAuthorization: { protocolID: R.PROTOCOL } } });
    if (!t?.txid) throw new Error('Not sent');
    btn.textContent = 'Checking the network…';
    if (!(await R.confirmOnChain(t.txid, { pending: t.pending === true }))) throw R.notOnChain(t.txid);
    btn.textContent = 'Public ✓';
    const v = $('minted').querySelector(`.vis-t[data-i="${btn.dataset.i}"]`); if (v) v.textContent = 'public';
  } catch (e) { btn.disabled = false; btn.textContent = 'Try again'; say($('mintErr'), friendly(e), 'bad'); }
}

// ── wallet changes ───────────────────────────────────────────────────────────
document.addEventListener('bjobsx-wallet', (e) => {
  const k = e.detail?.identityKey || null;
  say($('mintErr'), '', 'bad');
  if ((!P || mode === 'guest') && k) location.reload();
  else if (mode === 'owner' && k !== pg.identityKey) location.assign(uname ? location.pathname : '/studio');
  else if (mode === 'public' && k) location.reload();
});

// ── modals: short steps open over the page; the mint list stays on the page ──
const MODALS = ['import', 'account', 'status'];
function openModal(id) {
  if (id === 'mint') { if (!data) id = 'import'; else { $('mint').scrollIntoView({ behavior: 'smooth' }); return; } }
  if (!MODALS.includes(id)) return;
  if (id === 'import' && !mode) startGuest();
  if (id === 'account' && mode !== 'owner') return;
  MODALS.forEach((m) => { const d = $(m); if (d.open && m !== id) d.close(); });
  const d = $(id); if (!d.open) d.showModal();
}
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  if (o) { e.preventDefault(); openModal(o.dataset.open); return; }
  const dlg = e.target.closest('dialog.modal');
  if (dlg && dlg.id !== 'walk' && (e.target === dlg || e.target.closest('[data-close]'))) dlg.close();
});

load();
