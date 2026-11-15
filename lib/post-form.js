// /post: the job form's model. Pure (no DOM), so the page (post.js) and the tests share it.
//   emptyDraft()            a new form
//   cleanDraft(raw)         a draft from localStorage, every field checked
//   validate(d)             { field: message }, in form order; {} when it can be sent
//   toRow(d, who, {preview}) the row lib/contracts-view.js normalises into a card (the live preview)
//   toPayload(d, who)       what POST /api/bitsign/contracts receives
//   fieldFromApi(key)       the registry's field name -> ours (for its field errors)
// Pay is BSV, a token (an amount, or terms given to the chosen contractor) or shares in a named company. Shares never
// carry a count or a percentage here: those terms are given privately in the room (CEO, 15 Nov, §9.10).
import { mdToText } from './md.js';

export const CATEGORIES = ['Software', 'Design', 'Content', 'Research', 'Testing your own systems', 'Token work'];
export const PAY_TYPES = ['bsv', 'token', 'equity'];
export const MAX_PARTS = 4;
export const DEFAULT_LAW = 'England and Wales';
export const LIMITS = { title: 140, summary: 300, description: 3000, doneWhen: 600, time: 60, amount: 24, ticker: 21, company: 120, number: 10, licence: 600, law: 80, promoText: 600, legalName: 120 };
export const ADULT_LINE = '18+ posts are hidden until age checks exist';

const s = (v, max) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '');
const t = (v) => String(v ?? '').trim();
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

export const emptyPart = (type = 'bsv') => (type === 'token' ? { type, ticker: '', amount: '', terms: false } : type === 'equity' ? { type, company: '', number: '' } : { type: 'bsv', amount: '' });

export const emptyDraft = () => ({
  title: '', summary: '', description: '', category: '', doneWhen: '', time: '',
  pay: [emptyPart('bsv')],
  takers: 'open', adult: false, ip: 'assign', licence: '', law: DEFAULT_LAW,
  promotes: false, promoBasis: '', promoText: '', promoLawful: false,
  readRules: false, legalName: '', ukResident: false,
});

function cleanPart(p) {
  if (!p || typeof p !== 'object') return null;
  const type = oneOf(p.type, PAY_TYPES, 'bsv');
  if (type === 'token') return { type, ticker: s(p.ticker, LIMITS.ticker), amount: s(p.amount, LIMITS.amount), terms: p.terms === true };
  if (type === 'equity') return { type, company: s(p.company, LIMITS.company), number: s(p.number, LIMITS.number) };
  return { type, amount: s(p.amount, LIMITS.amount) };
}

/** A draft from anywhere (localStorage, a query string): unknown fields dropped, every value the right type. */
export function cleanDraft(raw) {
  const d = emptyDraft();
  if (!raw || typeof raw !== 'object') return d;
  for (const k of ['title', 'summary', 'description', 'doneWhen', 'time', 'licence', 'law', 'promoText', 'legalName']) if (k in raw) d[k] = s(raw[k], LIMITS[k]);
  d.category = oneOf(raw.category, CATEGORIES, '');
  d.takers = oneOf(raw.takers, ['open', 'approve'], 'open');
  d.ip = oneOf(raw.ip, ['assign', 'licence'], 'assign');
  d.promoBasis = oneOf(raw.promoBasis, ['approved', 'exempt'], '');
  for (const k of ['adult', 'promotes', 'promoLawful', 'readRules', 'ukResident']) d[k] = raw[k] === true;
  if (Array.isArray(raw.pay)) d.pay = raw.pay.slice(0, MAX_PARTS).map(cleanPart).filter(Boolean);
  if (!('law' in raw)) d.law = DEFAULT_LAW;
  return d;
}

// ── pay ──────────────────────────────────────────────────────────────────────
const BSV_RE = /^(?:\d{1,8}(?:\.\d{1,8})?|\.\d{1,8})$/;
const AMOUNT_RE = /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/;
const TICKER_RE = /^\$?[A-Za-z0-9]{1,20}$/;
const CH_RE = /^(?:\d{8}|[A-Z]{2}\d{6})$/;
/** "$acme" / "acme" -> "$ACME". */
export const normTicker = (v) => { const x = t(v).replace(/^\$/, ''); return x ? '$' + x.toUpperCase() : ''; };
/** Companies House number: spaces out, upper case. */
export const normCompanyNo = (v) => t(v).replace(/\s+/g, '').toUpperCase();

/** The registry's pay_parts. In a preview, empty fields get placeholders so the card always reads. */
export function payParts(d, { preview = false } = {}) {
  return (d.pay || []).map((p) => {
    if (p.type === 'token') {
      const ticker = normTicker(p.ticker) || (preview ? '$TOKEN' : '');
      return { unit: 'token', ticker, amount: p.terms ? null : (t(p.amount) || (preview ? '…' : '')) };
    }
    if (p.type === 'equity') return { unit: 'equity', company: t(p.company) || (preview ? 'the company' : ''), company_number: normCompanyNo(p.number) };
    return { unit: 'BSV', amount: t(p.amount) || (preview ? '…' : '') };
  });
}

// ── checks ───────────────────────────────────────────────────────────────────
export const MSG = {
  title: 'Give the job a title.',
  titleLong: `Keep the title to ${LIMITS.title} characters.`,
  summary: 'Add a one-line summary.',
  summaryLine: 'Keep the summary to one line.',
  description: 'Describe the work.',
  category: 'Choose a category.',
  doneWhen: 'Say when the work counts as done.',
  time: 'Give a time estimate, for example "About 2 hours".',
  pay: 'Add at least one part to the pay.',
  bsv: 'Enter a BSV amount, for example 0.5.',
  ticker: 'Enter the token’s ticker, for example $ACME.',
  tokenAmount: 'Enter an amount, or tick "Terms given to the chosen contractor".',
  company: 'Enter the company’s name.',
  companyTerms: 'Give the company’s name only. Share counts and percentages go to the chosen contractor, in the room.',
  number: 'Enter the 8-character Companies House number, for example 16735102 or SC123456.',
  licence: 'Say what licence you’re giving the work under.',
  law: 'Say which country’s law governs the contract.',
  promoBasis: 'Say whether the promotion is approved by an FCA-authorised firm or is exempt.',
  promoText: 'Give the details: the firm and its FCA number, or the exemption.',
  promoLawful: 'Confirm the promotion is lawful.',
  readRules: 'Confirm you’ve read What you can post.',
};

/** Every problem, keyed by field name ('pay.0.amount' for a pay part), in the order the form shows them. */
export function validate(d) {
  const e = {};
  if (!t(d.title)) e.title = MSG.title; else if (t(d.title).length > LIMITS.title) e.title = MSG.titleLong;
  if (!t(d.summary)) e.summary = MSG.summary; else if (/\n/.test(t(d.summary))) e.summary = MSG.summaryLine;
  if (!t(d.description)) e.description = MSG.description;
  if (!CATEGORIES.includes(d.category)) e.category = MSG.category;
  if (!t(d.doneWhen)) e.doneWhen = MSG.doneWhen;
  if (!t(d.time)) e.time = MSG.time;
  const pay = d.pay || [];
  if (!pay.length) e.pay = MSG.pay;
  pay.forEach((p, i) => {
    const k = (f) => `pay.${i}.${f}`;
    if (p.type === 'token') {
      if (!TICKER_RE.test(t(p.ticker))) e[k('ticker')] = MSG.ticker;
      if (!p.terms && !(AMOUNT_RE.test(t(p.amount)) && Number(t(p.amount).replace(/,/g, '')) > 0)) e[k('amount')] = MSG.tokenAmount;
    } else if (p.type === 'equity') {
      if (!t(p.company)) e[k('company')] = MSG.company;
      else if (/%|\bshares?\b|\d+\s*(?:per\s*cent|percent)/i.test(p.company)) e[k('company')] = MSG.companyTerms;
      if (!CH_RE.test(normCompanyNo(p.number))) e[k('number')] = MSG.number;
    } else if (!(BSV_RE.test(t(p.amount)) && Number(t(p.amount)) > 0)) e[k('amount')] = MSG.bsv;
  });
  if (d.ip === 'licence' && !t(d.licence)) e.licence = MSG.licence;
  if (!t(d.law)) e.law = MSG.law;
  if (d.promotes) {
    if (!['approved', 'exempt'].includes(d.promoBasis)) e.promoBasis = MSG.promoBasis;
    if (!t(d.promoText)) e.promoText = MSG.promoText;
    if (!d.promoLawful) e.promoLawful = MSG.promoLawful;
  }
  if (!d.readRules) e.readRules = MSG.readRules;
  return e;
}

// ── card and payload ─────────────────────────────────────────────────────────
/** The row for normalise() (lib/contracts-view.js): the same card /contracts shows. who: {legalName, alias}. */
export function toRow(d, who = {}, { preview = true } = {}) {
  const ph = (v, p) => t(v) || (preview ? p : '');
  const cat = d.category || '';
  const legal = t(d.legalName) || t(who.legalName) || (preview ? 'Your legal name' : '');
  const build = mdToText(d.description);
  return {
    id: 'preview', ref: 'NEW', version: '1', status: 'open',
    poster: { legalName: legal, handle: who.alias || '' },
    scope: cat, kind: cat,
    title: ph(d.title, 'Your job title'),
    line: ph(d.summary, 'A one-line summary of the work.'),
    pay_parts: payParts(d, { preview }),
    time: t(d.time),
    detail: {
      anchor: 'c-preview',
      area: cat.toUpperCase(),
      est: t(d.time),
      build: build.length > 600 ? build.slice(0, 597).trimEnd() + '…' : build,
      done: t(d.doneWhen) ? [t(d.doneWhen)] : [],
    },
  };
}

/** The body for POST /api/bitsign/contracts (pending_review on the registry). */
export function toPayload(d, who = {}) {
  return {
    site: 'bjobsx.com',
    title: t(d.title),
    line: t(d.summary),
    description: t(d.description),
    category: d.category,
    done_when: t(d.doneWhen),
    time: t(d.time),
    pay_parts: payParts(d),
    takers: d.takers === 'approve' ? 'approve' : 'open',
    adult: d.adult === true,
    ip: d.ip === 'licence' ? { mode: 'licence', licence: t(d.licence) } : { mode: 'assign' },
    governing_law: t(d.law) || DEFAULT_LAW,
    promotion: d.promotes ? { basis: d.promoBasis, statement: t(d.promoText), lawful: d.promoLawful === true } : null,
    read_rules: d.readRules === true,
    ...(t(d.legalName) ? { legal_name: t(d.legalName) } : {}),
    ...(d.ukResident ? { uk_resident: true } : {}),
    ...(who.identityKey ? { identity_key: who.identityKey } : {}),
  };
}

const API_FIELDS = {
  title: 'title', line: 'summary', summary: 'summary', description: 'description', category: 'category',
  done_when: 'doneWhen', time: 'time', pay: 'pay', pay_parts: 'pay', takers: 'takers', adult: 'adult',
  ip: 'licence', licence: 'licence', 'ip.licence': 'licence', governing_law: 'law',
  promotion: 'promoText', 'promotion.basis': 'promoBasis', 'promotion.statement': 'promoText', 'promotion.lawful': 'promoLawful',
  read_rules: 'readRules', legal_name: 'legalName', uk_resident: 'ukResident',
};
const PART_FIELDS = { amount: 'amount', ticker: 'ticker', company: 'company', company_number: 'number', number: 'number', unit: 'amount' };

/** The registry's field name ('pay_parts.1.company_number', 'pay_parts[1].ticker', 'done_when') -> ours, or '' when unknown. */
export function fieldFromApi(key) {
  const k = String(key ?? '').replace(/\[(\d+)\]/g, '.$1');
  const m = k.match(/^(?:pay_parts|pay)\.(\d+)(?:\.(\w+))?$/);
  if (m) {
    const i = Number(m[1]);
    if (i >= MAX_PARTS) return 'pay';
    return m[2] ? (PART_FIELDS[m[2]] ? `pay.${i}.${PART_FIELDS[m[2]]}` : 'pay') : 'pay';
  }
  return API_FIELDS[k] || '';
}
