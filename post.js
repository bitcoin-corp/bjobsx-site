// /post: post a job on bJobsX itself (RB 15 Nov: never bChatX's /room/new). One column of fields, a live preview of
// the card beside it (the same lib/contracts-view.js card /contracts shows), the draft kept in this browser until it's
// sent. Sending: lib/post-client.js, to the bit-sign registry when CONTRACTS_POST_API is set (GET /api/post-config).
// Until then the form and preview work fully, and Send says posting opens soon. Nothing pretends to succeed.
import { esc, normalise, contractArticle, payNotes } from '/lib/contracts-view.js';
import { emptyDraft, emptyPart, cleanDraft, validate, toRow, MAX_PARTS, LIMITS, ADULT_LINE } from '/lib/post-form.js';
import { createPostClient } from '/lib/post-client.js';
import { mdToHtml } from '/lib/md.js';

const DRAFT_KEY = 'bjx-post-draft';
const $ = (id) => document.getElementById(id);
const form = $('pf');
const idFor = (name) => 'f-' + name.replace(/\./g, '-');
const errFor = (name) => 'err-' + name.replace(/\./g, '-');

const lsGet = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
const lsSet = (v) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch {} };
const lsDel = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };

let d = cleanDraft(lsGet());
let tried = false;
let who = { identityKey: null, alias: null };
let veriffUrl = 'https://bit-sign.online/kyc';
let client = createPostClient({});
const configP = fetch('/api/post-config', { headers: { accept: 'application/json' } })
  .then((r) => (r.ok ? r.json() : null))
  .then((c) => { if (c) { client = createPostClient({ base: c.postApi }); if (c.veriffUrl) veriffUrl = c.veriffUrl; } })
  .catch(() => {});

// ?pay=equity (from "Offer equity for work"): make sure the pay has a shares part.
if (new URLSearchParams(location.search).get('pay') === 'equity' && !d.pay.some((p) => p.type === 'equity')) {
  const blank = d.pay.length === 1 && d.pay[0].type === 'bsv' && !d.pay[0].amount;
  if (blank) d.pay = [emptyPart('equity')];
  else if (d.pay.length < MAX_PARTS) d.pay.push(emptyPart('equity'));
}

// ── pay parts ────────────────────────────────────────────────────────────────
const TYPE_LABEL = { bsv: 'BSV', token: 'A token', equity: 'Equity (shares)' };
function textField(name, label, value, { hint = '', placeholder = '', max = 60, suffix = '', mode = '', disabled = false } = {}) {
  const id = idFor(name), err = errFor(name), hid = hint ? `hint-${id}` : '';
  const input = `<input type="text" id="${id}" name="${name}" value="${esc(value)}" maxlength="${max}" autocomplete="off"${mode ? ` inputmode="${mode}"` : ''} placeholder="${esc(placeholder)}"${disabled ? ' disabled' : ''} aria-describedby="${[hid, err].filter(Boolean).join(' ')}">`;
  return `<div class="fld"><label for="${id}">${label}</label>${suffix ? `<div class="amt">${input}<i aria-hidden="true">${esc(suffix)}</i></div>` : input}${hint ? `<p class="hint" id="${hid}">${hint}</p>` : ''}<p class="err" id="${err}" hidden></p></div>`;
}
function partHTML(p, i) {
  const n = i + 1, k = (f) => `pay.${i}.${f}`;
  const opts = Object.entries(TYPE_LABEL).map(([v, t]) => `<option value="${v}"${p.type === v ? ' selected' : ''}>${t}</option>`).join('');
  let body = '';
  if (p.type === 'token') {
    body = `<div class="two">${textField(k('ticker'), 'Ticker', p.ticker, { placeholder: '$ACME', max: LIMITS.ticker })}${textField(k('amount'), 'Amount', p.terms ? '' : p.amount, { placeholder: '50,000', max: LIMITS.amount, mode: 'decimal', disabled: p.terms })}</div>
      <label class="opt" style="margin-top:10px"><input type="checkbox" name="${k('terms')}" id="${idFor(k('terms'))}"${p.terms ? ' checked' : ''}><span><b>Terms given to the chosen contractor</b><span>No amount on the card. You agree it with them in the room.</span></span></label>`;
  } else if (p.type === 'equity') {
    body = `${textField(k('company'), 'Company name', p.company, { placeholder: 'Acme Widgets Ltd', max: LIMITS.company })}
      ${textField(k('number'), 'Companies House number', p.number, { placeholder: '16735102', max: LIMITS.number })}
      <p class="hint">No share count or percentage here. You give those terms to the chosen contractor, privately, in the room.</p>`;
  } else {
    body = textField(k('amount'), 'Amount', p.amount, { placeholder: '0.5', max: LIMITS.amount, suffix: 'BSV', mode: 'decimal' });
  }
  return `<fieldset class="part" data-i="${i}"><legend class="xs-sr">Pay, part ${n}</legend>
    <div class="part-h"><div class="fld"><label for="${idFor(k('type'))}">Part ${n}</label><select id="${idFor(k('type'))}" name="${k('type')}">${opts}</select></div>${d.pay.length > 1 ? `<button type="button" class="part-x" data-rm="${i}" aria-label="Remove part ${n}">Remove</button>` : ''}</div>
    ${body}</fieldset>`;
}
function drawParts() {
  $('f-pay').innerHTML = d.pay.map(partHTML).join('');
  $('addPart').hidden = d.pay.length >= MAX_PARTS;
}

// ── form <-> draft ───────────────────────────────────────────────────────────
const TEXT = ['title', 'summary', 'description', 'category', 'doneWhen', 'time', 'licence', 'law', 'promoText'];
const CHECK = ['adult', 'promotes', 'promoLawful', 'readRules'];
function fill() {
  for (const k of TEXT) form.elements[k].value = d[k];
  for (const k of CHECK) form.elements[k].checked = d[k];
  for (const k of ['takers', 'ip', 'promoBasis']) for (const r of form.querySelectorAll(`input[name="${k}"]`)) r.checked = r.value === d[k];
  drawParts();
}
function read() {
  const next = { ...d };
  for (const k of TEXT) next[k] = form.elements[k].value;
  for (const k of CHECK) next[k] = form.elements[k].checked;
  for (const k of ['takers', 'ip', 'promoBasis']) next[k] = form.querySelector(`input[name="${k}"]:checked`)?.value || '';
  next.pay = [...$('f-pay').querySelectorAll('.part')].map((fs, i) => {
    const v = (f) => form.elements[`pay.${i}.${f}`];
    const type = v('type').value;
    if (type === 'token') return { type, ticker: v('ticker').value, amount: v('amount').value, terms: v('terms').checked };
    if (type === 'equity') return { type, company: v('company').value, number: v('number').value };
    return { type: 'bsv', amount: v('amount').value };
  });
  const ln = form.elements.legalName, uk = form.elements.ukResident;
  if (ln) next.legalName = ln.value;
  if (uk) next.ukResident = uk.checked;
  d = cleanDraft(next);
}
let saveT;
const save = (now = false) => { clearTimeout(saveT); if (now) lsSet(d); else saveT = setTimeout(() => lsSet(d), 250); };

// ── preview ──────────────────────────────────────────────────────────────────
function identity() {
  const id = typeof window.bjxIdentity === 'function' ? window.bjxIdentity() : null;
  if (id && id.identityKey) who = { identityKey: id.identityKey, alias: id.alias || null };
  return who;
}
function paint() {
  identity();
  const c = normalise(toRow(d, { alias: who.alias || '' }));
  $('card').innerHTML = c ? contractArticle(c) : '';
  $('payNotes').innerHTML = c ? payNotes(c).map((n) => `<p class="note">${esc(n)}</p>`).join('') : '';
  const rows = [
    ['Category', d.category || 'Not chosen yet'],
    ['Who can take it', d.takers === 'approve' ? 'You approve takers' : 'Open to all'],
    ...(d.adult ? [['18+', ADULT_LINE]] : []),
    ['The work', d.ip === 'licence' ? `A licence${d.licence.trim() ? `: ${d.licence.trim()}` : ''}` : 'Assigned to you on payment'],
    ['Governing law', d.law.trim() || 'Not given yet'],
    ...(d.promotes ? [['Promotion', d.promoBasis === 'approved' ? 'Approved by an FCA-authorised firm' : d.promoBasis === 'exempt' ? 'Exempt' : 'Basis not given yet']] : []),
  ];
  $('meta').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  $('licenceBox').hidden = d.ip !== 'licence';
  $('promoBox').hidden = !d.promotes;
  for (const el of document.querySelectorAll('[data-count]')) { const k = el.dataset.count; el.textContent = `${d[k].length}/${LIMITS[k]}`; }
  if (!$('panel-preview').hidden) drawMd();
  $('connectBox').hidden = !!who.identityKey;
}
const drawMd = () => { $('panel-preview').innerHTML = d.description.trim() ? mdToHtml(d.description) : '<p class="empty">Nothing to preview yet.</p>'; };

// ── errors ───────────────────────────────────────────────────────────────────
function showErrors(errs, { summary = false } = {}) {
  for (const el of form.querySelectorAll('.err')) { el.hidden = true; el.textContent = ''; }
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  const list = [];
  for (const [name, msg] of Object.entries(errs)) {
    const box = $(errFor(name));
    if (box) { box.textContent = msg; box.hidden = false; }
    const input = $(idFor(name));
    if (input && input.matches('input,select,textarea')) input.setAttribute('aria-invalid', 'true');
    list.push([name, msg]);
  }
  const sum = $('errsum');
  if (!list.length) { sum.hidden = true; sum.innerHTML = ''; return; }
  if (!summary && sum.hidden) return;
  const n = list.length;
  sum.innerHTML = `<h2 id="errsumH">${n === 1 ? 'Check one thing' : `Check ${n} things`} before you send</h2><ul>${list.map(([name, msg]) => (name === '_form' || !$(idFor(name)) ? `<li>${esc(msg)}</li>` : `<li><a href="#${idFor(name)}" data-go="${idFor(name)}">${esc(msg)}</a></li>`)).join('')}</ul>`;
  sum.hidden = false;
}
$('errsum').addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]'); if (!a) return;
  e.preventDefault();
  const el = $(a.dataset.go);
  if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
});

// ── status, connect, needs ───────────────────────────────────────────────────
function say(html, bad = false) { const s = $('status'); s.classList.toggle('bad', bad); s.innerHTML = html; }
const NEEDS = {
  connect: () => `<li><b>Connect bWalletX</b><span>You post as yourself, with your wallet.</span></li>`,
  veriff: () => `<li><b>Check your ID with Veriff</b><span>A one-off ID check, with a sanctions check, before your first contract goes live.</span><a class="btn btn-ghost" href="${esc(veriffUrl)}" target="_blank" rel="noopener">Start the ID check</a></li>`,
  legal_name: () => `<li><label class="lbl" for="f-legalName">Your full legal name</label><span>As on your ID. It goes on your contract cards.</span><input type="text" id="f-legalName" name="legalName" maxlength="${LIMITS.legalName}" autocomplete="name" value="${esc(d.legalName)}"></li>`,
  uk_resident: () => `<li><b>You live in the UK</b><span>For the beta, posters must live in the UK. Contractors can be anywhere.</span><label class="opt"><input type="checkbox" name="ukResident" id="f-ukResident"${d.ukResident ? ' checked' : ''}><span><b>I live in the UK</b></span></label></li>`,
  companies_house: () => { const i = d.pay.findIndex((p) => p.type === 'equity'); return `<li><b>Check the company</b><span>We couldn't match the company in your pay with Companies House. Check its name and number.</span>${i >= 0 ? `<button type="button" class="btn btn-ghost" data-go="${idFor(`pay.${i}.number`)}">Go to the company</button>` : ''}</li>`; },
};
const NEED_OTHER = (code) => `<li><b>One more step</b><span>${esc(code.replace(/_/g, ' '))}. Ask b in bWalletX if you're not sure what to do.</span></li>`;
function showNeeds(needs) {
  if (needs.includes('connect')) $('connectBox').hidden = false;
  $('needs').innerHTML = `<div class="needs" role="group" aria-labelledby="needsH"><h3 id="needsH">Before this can go for review</h3><ol>${needs.map((n) => (NEEDS[n] || (() => NEED_OTHER(n)))()).join('')}</ol></div>`;
  say('Do the steps above, then press <b>Send for review</b> again. Your draft is saved on this device.');
  $('needs').querySelector('input,a,button')?.focus();
}
$('needs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  const el = $(b.dataset.go); if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
});

async function signedIn() {
  if (identity().identityKey) return true;
  try { const j = await (await fetch('/api/bwalletx/session', { credentials: 'same-origin', cache: 'no-store' })).json(); who.identityKey = j?.identityKey || null; } catch {}
  return !!who.identityKey;
}

// ── send ─────────────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  read(); save(true); paint();
  tried = true;
  const errs = validate(d);
  showErrors(errs, { summary: true });
  if (Object.keys(errs).length) { say(''); $('errsum').focus(); return; }
  await configP;
  if (!client.enabled) {
    say(`<b>Posting opens soon.</b> Your draft is saved on this device.${(await signedIn()) ? '' : ' You’ll need bWalletX connected to post.'}`);
    return;
  }
  if (!(await signedIn())) {
    $('connectBox').hidden = false;
    say('Connect bWalletX to send this for review. Your draft is saved on this device.');
    $('connectBox').querySelector('button,a')?.focus();
    return;
  }
  const btn = $('send');
  btn.disabled = true; btn.classList.add('busy'); btn.textContent = 'Sending…'; say('');
  const r = await client.submit(d, who);
  btn.disabled = false; btn.classList.remove('busy'); btn.textContent = 'Send for review';
  if (r.ok) return sent(r.id);
  $('needs').innerHTML = '';
  if (r.errors) { showErrors(r.errors, { summary: true }); say(''); $('errsum').focus(); return; }
  if (r.needs) return showNeeds(r.needs);
  if (r.unavailable) return say('<b>Posting opens soon.</b> Your draft is saved on this device.');
  say(esc(r.error || 'Something went wrong. Your draft is saved on this device.'), true);
});

function sent(id) {
  lsDel();
  form.hidden = true; $('errsum').hidden = true; $('ph').hidden = true;
  $('doneId').textContent = id;
  $('done').hidden = false; $('done').focus();
  scrollTo({ top: 0 });
}
$('again').addEventListener('click', () => {
  d = emptyDraft(); tried = false; fill(); paint(); showErrors({}); say(''); $('needs').innerHTML = '';
  $('done').hidden = true; $('ph').hidden = false; form.hidden = false; $('f-title').focus();
});

// ── events ───────────────────────────────────────────────────────────────────
const onEdit = () => { read(); save(); paint(); if (tried) showErrors(validate(d)); };
form.addEventListener('input', onEdit);
form.addEventListener('change', (e) => {
  if (e.target.matches('select[name^="pay."]')) {
    read();
    const i = Number(e.target.closest('.part').dataset.i);
    d.pay[i] = emptyPart(e.target.value);
    drawParts(); $(idFor(`pay.${i}.type`)).focus();
  } else if (e.target.matches('input[name$=".terms"]')) {
    const amt = e.target.closest('.part').querySelector('input[name$=".amount"]');
    if (amt) { amt.disabled = e.target.checked; if (e.target.checked) amt.value = ''; }
  }
  onEdit();
});
$('f-pay').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]'); if (!b) return;
  read(); d.pay.splice(Number(b.dataset.rm), 1); drawParts(); onEdit();
  ($('f-pay').querySelector('select') || $('addPart')).focus();
});
$('addPart').addEventListener('click', () => {
  read(); if (d.pay.length >= MAX_PARTS) return;
  const used = new Set(d.pay.map((p) => p.type));
  d.pay.push(emptyPart(['bsv', 'token', 'equity'].find((t) => !used.has(t)) || 'bsv'));
  drawParts(); onEdit(); $(idFor(`pay.${d.pay.length - 1}.type`)).focus();
});
let clearArm = 0;
$('clear').addEventListener('click', (e) => {
  if (Date.now() - clearArm > 4000) { clearArm = Date.now(); e.target.textContent = 'Press again to clear'; setTimeout(() => { e.target.textContent = 'Clear the form'; }, 4000); return; }
  clearArm = 0; e.target.textContent = 'Clear the form';
  lsDel(); d = emptyDraft(); tried = false; fill(); paint(); showErrors({}); say(''); $('needs').innerHTML = '';
});

// Description: Write / Preview tabs (arrow keys move between them).
const tabs = [$('tab-write'), $('tab-preview')];
function tab(i) {
  tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(i === j)); t.tabIndex = i === j ? 0 : -1; });
  $('panel-write').hidden = i !== 0; $('panel-preview').hidden = i !== 1;
  if (i === 1) drawMd();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => tab(i));
  t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const j = (i + 1) % 2; tab(j); tabs[j].focus(); e.preventDefault(); } });
});

// Wallet: the header pill and the box above Send stay in step; the card picks up your $name.
document.addEventListener('bjobsx-wallet', (e) => { who = { identityKey: e.detail?.identityKey || null, alias: null }; paint(); setTimeout(paint, 1500); });

fill();
paint();
// bwx.js learns the session and the $name a moment after load.
setTimeout(paint, 1200); setTimeout(paint, 4000);
