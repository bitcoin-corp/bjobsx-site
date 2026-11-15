// bjobsx.com home: the open-contracts coverflow (arrows, keys, drag, trackpad swipe) and the contract's details and
// button under it. Same motion as b0-x.com and bChatX's "Pick a room".
// Data: first paint from the inline #jobs-data snapshot (written from data/contracts.json by `pnpm contracts`), then
// GET /api/contracts, again every 60 s while the tab is visible and whenever it comes back into view. Cards are kept
// by id, so a contract that is added, changed or removed never moves you off the one you're looking at.
// A contract that arrives while the page is open (or was posted in the last 3 days) gets a "New" chip.
// For testing only: ?poll=5 polls every 5 s.
import { esc, posterLine, posterShort, roomUrl, homeRows, statusLabel, payNotes, hasShares } from '/lib/contracts-view.js';

const flow = document.querySelector('.flow');
const info = document.querySelector('.info');
const section = document.querySelector('.jobs');
const announce = document.querySelector('[data-announce]');
const snap = (() => { try { return JSON.parse(document.getElementById('jobs-data').textContent); } catch { return []; } })();
const ext = (h) => /^https?:/.test(h);
const pollParam = Number(new URLSearchParams(location.search).get('poll'));
const POLL_MS = pollParam >= 2 ? pollParam * 1000 : 60000;
const NEW_FOR_MS = 3 * 24 * 3600 * 1000;

let jobs = [];                 // what's on screen, in order
const els = new Map();         // id -> card element
const sigs = new Map();        // id -> what the card was drawn from
const arrived = new Set();     // ids that turned up after the first look
let known = null;              // ids seen on the first look (snapshot + first fetch)
let cur = 0, drag = 0, cw = 300, wide = 1000, shown = '';
const N = () => jobs.length;

const isNew = (j) => arrived.has(j.id) || (j.postedAt && Date.now() - Date.parse(j.postedAt) < NEW_FOR_MS);

function cardHTML(j) {
  const flags = [isNew(j) ? '<span class="flag new">New</span>' : '', hasShares(j) ? '<span class="flag equity">Equity</span>' : '', j.status !== 'open' ? `<span class="flag">${statusLabel(j.status)}</span>` : ''].join('');
  return `<div class="job-art">${j.art ? `<img src="${esc(j.art)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<span class="job-ghost">${esc(j.ghost || '')}</span>`}</div>
    ${flags ? `<span class="job-flags">${flags}</span>` : ''}
    <div class="job-body"><span class="chip"><i></i>${esc(j.scope)} · ${esc(j.kind)}</span><h3>${esc(j.title)}</h3><p>${esc(j.line)}</p>${payNotes(j).map((n) => `<p class="job-tok">${esc(n)}</p>`).join('')}
    <div class="job-foot"><b>${esc(j.pay)}</b><span>${esc(posterShort(j))}</span></div></div>`;
}

function makeCard(j) {
  const a = document.createElement('a');
  a.className = 'job';
  a.dataset.id = j.id;
  a.addEventListener('click', (e) => {
    // A side card brings itself to the middle; only the middle card follows its link. A drag is never a click.
    const k = jobs.findIndex((x) => x.id === a.dataset.id);
    if (st.moved || k !== cur) { e.preventDefault(); if (!st.moved && k >= 0) go(k); }
  });
  a.addEventListener('animationend', () => a.classList.remove('arrive'));
  flow.appendChild(a);
  return a;
}

function fill(a, j) {
  a.href = j.href;
  if (ext(j.href)) { a.target = '_blank'; a.rel = 'noopener'; } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
  a.style.setProperty('--c', j.color);
  a.classList.toggle('is-taken', j.status === 'taken');
  a.setAttribute('aria-label', `${j.title}. ${j.pay}. ${posterShort(j)}`);
  a.innerHTML = cardHTML(j);
}

/** Draw a list. Keeps the card you're on in the middle, whatever was added or removed around it. */
function apply(list, { first = false } = {}) {
  const keep = jobs[cur]?.id;
  const ids = new Set(list.map((j) => j.id));
  for (const [id, a] of els) if (!ids.has(id)) { a.remove(); els.delete(id); sigs.delete(id); }
  const fresh = [];
  for (const j of list) {
    if (known && !known.has(j.id) && !arrived.has(j.id)) { arrived.add(j.id); fresh.push(j); }
    let a = els.get(j.id);
    if (!a) { a = makeCard(j); els.set(j.id, a); if (!first) a.classList.add('nodur', 'arrive'); }
    const sig = JSON.stringify(j) + isNew(j);
    if (sigs.get(j.id) !== sig) { fill(a, j); sigs.set(j.id, sig); }
  }
  jobs = list;
  const k = keep ? jobs.findIndex((j) => j.id === keep) : -1;
  cur = k >= 0 ? k : Math.min(cur, Math.max(0, N() - 1));
  shown = '';
  section.classList.toggle('empty', !N());
  if (first) measure(); else place();
  requestAnimationFrame(() => els.forEach((a) => a.classList.remove('nodur')));
  if (fresh.length && announce) announce.textContent = fresh.map((j) => `New contract: ${j.title}.`).join(' ');
}

function measure() { wide = flow.clientWidth; const a = els.get(jobs[0]?.id); cw = a?.offsetWidth || cw; place(); }

function place() {
  const n = N();
  const gap = cw * (wide < cw * 2.4 ? 0.42 : 0.5);
  jobs.forEach((j, k) => {
    const c = els.get(j.id);
    let o = k - cur - drag;
    o = n > 1 ? (((o % n) + n + n / 2) % n) - n / 2 : 0;
    const ab = Math.abs(o), s = Math.sign(o);
    const x = ab < 1 ? o * cw * 0.62 : s * (cw * 0.62 + (ab - 1) * gap);
    const ry = Math.max(-1, Math.min(1, o)) * -42;
    const z = -Math.min(ab, 1) * cw * 0.5 - Math.max(0, ab - 1) * 30;
    c.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${ry.toFixed(1)}deg)`;
    c.style.zIndex = 100 - Math.round(ab * 10);
    c.style.opacity = Math.max(0.25, 1 - ab * 0.16);
    c.style.filter = ab < 0.5 ? 'none' : `brightness(${Math.max(0.45, 1 - ab * 0.2).toFixed(2)})`;
    c.style.visibility = ab > 3.5 ? 'hidden' : '';
    c.classList.toggle('on', k === cur && !drag);
    if (drag) c.classList.add('nodur'); else if (!c.classList.contains('arrive')) c.classList.remove('nodur');
    c.toggleAttribute('aria-hidden', k !== cur);
    c.tabIndex = k === cur ? 0 : -1;
  });
  if (!n) return show(-1);
  const near = (((Math.round(cur + drag) % n) + n) % n);
  const key = jobs[near].id + sigs.get(jobs[near].id) + n;
  if (key !== shown) { show(near); shown = key; }
}

function show(k) {
  const j = jobs[k];
  const goEl = info.querySelector('.info-go'), talk = info.querySelector('.info-talk');
  if (!j) {
    info.querySelector('.info-t').textContent = 'No open contracts right now';
    for (const s of ['.info-l', '.info-by', '.info-m', '[data-count]']) info.querySelector(s).textContent = '';
    const tok = info.querySelector('.info-tok'); if (tok) tok.hidden = true;
    goEl.href = '/contracts'; goEl.textContent = 'See all contracts'; talk.hidden = true;
    return;
  }
  info.querySelector('.info-t').textContent = j.title;
  info.querySelector('.info-l').textContent = j.line;
  info.querySelector('.info-by').textContent = posterLine(j);
  const tok = info.querySelector('.info-tok');
  if (tok) { tok.textContent = payNotes(j).join(' '); tok.hidden = !payNotes(j).length; }
  info.querySelector('.info-m').innerHTML = [j.status !== 'open' ? `<span>${statusLabel(j.status)}</span>` : '', hasShares(j) ? '<span class="pay">Equity</span>' : '', `<span class="pay">${esc(j.pay)}</span>`, `<span>${esc(j.time)}</span>`, `<span>${esc(j.scope)}</span>`, `<span>${esc(j.kind)}</span>`].join('');
  goEl.href = j.href;
  goEl.textContent = j.status === 'open' ? j.go : `See ${j.ref}`;
  if (ext(j.href)) { goEl.target = '_blank'; goEl.rel = 'noopener'; } else { goEl.removeAttribute('target'); goEl.removeAttribute('rel'); }
  // Later: a private bChatX room per contract. Shown only when the contract has room: true (none do yet).
  const room = roomUrl(j);
  talk.hidden = !room;
  if (room) talk.href = room;
  info.querySelector('[data-count]').textContent = `${k + 1} / ${N()}`;
}

const go = (k) => {
  if (!N()) return;
  cur = ((k % N()) + N()) % N(); drag = 0; place();
  if (pending && !st.down) { const p = pending; pending = null; apply(p); }
};
flow.querySelector('.prev').onclick = () => go(cur - 1);
flow.querySelector('.next').onclick = () => go(cur + 1);
flow.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { go(cur - 1); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { go(cur + 1); e.preventDefault(); }
});

const st = { down: false, moved: false, x: 0, y: 0 };
let pending = null; // a list that arrived mid-drag waits until the finger lifts
flow.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.arrow')) return;
  Object.assign(st, { down: true, moved: false, x: e.clientX, y: e.clientY });
});
flow.addEventListener('pointermove', (e) => {
  if (!st.down) return;
  const dx = e.clientX - st.x;
  if (!st.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - st.y)) {
    st.moved = true;
    try { flow.setPointerCapture(e.pointerId); } catch {}
  }
  if (st.moved) { drag = -dx / (cw * 0.6); place(); }
});
const up = () => {
  if (!st.down) return;
  st.down = false;
  if (st.moved) { go(Math.round(cur + drag)); setTimeout(() => { st.moved = false; }, 0); }
  else if (pending) { const p = pending; pending = null; apply(p); }
};
flow.addEventListener('pointerup', up);
flow.addEventListener('pointercancel', up);

// Trackpad / Magic Mouse: horizontal scroll follows the finger, then snaps.
let wheelEnd;
section.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || !N()) return;
  e.preventDefault();
  drag += e.deltaX / (cw * 0.6);
  place();
  clearTimeout(wheelEnd);
  wheelEnd = setTimeout(() => go(Math.round(cur + drag)), 120);
}, { passive: false });
addEventListener('resize', measure);

// ── Live list ──
let last = JSON.stringify(snap), lastAt = 0, timer;
async function poll() {
  clearTimeout(timer);
  lastAt = Date.now();
  let j = null;
  try {
    const r = await fetch('/api/contracts', { cache: 'no-cache', headers: { accept: 'application/json' } }); // the CDN caches for 60 s; the browser always asks it
    if (r.ok) j = await r.json();
  } catch { /* offline or the API is down: keep what's on screen */ }
  if (j) {
    if (Array.isArray(j.contracts)) {
      const list = homeRows(j.contracts);
      const s = JSON.stringify(list);
      if (!known) known = new Set([...snap, ...list].map((x) => x.id));
      if (s !== last) { last = s; if (st.down || drag) pending = list; else apply(list); }
    }
  }
  if (!known) known = new Set(snap.map((x) => x.id));
  if (!document.hidden) timer = setTimeout(poll, POLL_MS);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else if (Date.now() - lastAt > 5000) poll();
  else timer = setTimeout(poll, POLL_MS);
});

apply(snap, { first: true });
poll();
