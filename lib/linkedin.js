// LinkedIn data export -> a bJobsX profile, parsed IN THE BROWSER (node too, for tests). Nothing here touches the network.
//
// Input: the export ZIP (LinkedIn › Settings › Data privacy › Get a copy of your data) or the individual CSVs.
// Read: Profile.csv, Positions.csv, Education.csv, Skills.csv, Certifications.csv, Connections.csv. Every other file
// in the ZIP is ignored and never opened.
//
// The files are untrusted: sizes and row counts are capped, every field is trimmed and length-capped, and nothing is
// ever rendered from here without escaping (the page escapes). From Profile.csv we keep only name, headline, summary,
// industry, location and websites: never address, birth date or zip code.
//
// Connections are other people's personal data. They are parsed so the owner can see them, kept apart from the
// profile (`connections`), never published, and only minted (privately) if the owner ticks them.

export const LIMITS = {
  zipBytes: 60 * 1024 * 1024,   // the whole export
  csvBytes: 8 * 1024 * 1024,    // one CSV, uncompressed
  field: 4000,                  // characters per field (summaries can be long)
  short: 300,                   // names, titles, dates
  positions: 200, education: 60, skills: 600, certifications: 300, connections: 30000,
};

export const FILES = ['Profile.csv', 'Positions.csv', 'Education.csv', 'Skills.csv', 'Certifications.csv', 'Connections.csv'];

/** RFC 4180 CSV -> rows of strings. Handles quotes, "" escapes, CR/LF/CRLF, a BOM. Stops at maxRows. */
export function parseCsv(text, maxRows = 100000) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
      if (rows.length >= maxRows) return rows;
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** http(s) links only, and nothing that could break out of an attribute (the push server checks the same). */
export const SAFE_URL = /^https?:\/\/[^\s"'<>\\]+$/i;
const DATE = 60;
const clean = (v, max = LIMITS.short) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

/**
 * Rows -> objects keyed by header. The header is the first row that contains `need` (Connections.csv starts with a
 * "Notes:" preamble). Header names are matched case-insensitively and trimmed.
 */
export function table(text, need, maxRows) {
  const rows = parseCsv(text, (maxRows || 1000) + 20);
  const at = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === need.toLowerCase()));
  if (at < 0) return [];
  const head = rows[at].map((h) => h.trim().toLowerCase());
  const out = [];
  for (const r of rows.slice(at + 1)) {
    if (!r.some((c) => c.trim())) continue;
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = r[i] ?? ''; });
    out.push(o);
    if (maxRows && out.length >= maxRows) break;
  }
  return out;
}

// LinkedIn dates: "Jan 2020", "2020", "01 Jan 2020", "1/15/20", "2020-01-15". Kept as text, plus a sortable key.
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
export function dateKey(t) {
  const s = String(t || '').trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})/); if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = s.match(/([a-z]{3,4})[a-z]*\.?\s+(\d{4})/); if (m && MON[m[1]]) return Number(m[2]) * 100 + MON[m[1]];
  m = s.match(/^(\d{1,2})\/\d{1,2}\/(\d{2,4})$/); if (m) { const y = Number(m[2]); return (y < 100 ? 2000 + y : y) * 100 + Number(m[1]); }
  m = s.match(/(\d{4})/); if (m) return Number(m[1]) * 100;
  return null;
}

const get = (o, ...keys) => { for (const k of keys) { const v = o[k.toLowerCase()]; if (v != null && String(v).trim()) return v; } return ''; };
const byNewest = (a, b) => (b._end ?? 999999) - (a._end ?? 999999) || (b._start ?? 0) - (a._start ?? 0);
const strip = ({ _start, _end, ...x }) => x;

export function readProfile(text) {
  const r = table(text, 'First Name', 5)[0];
  if (!r) return null;
  const sites = clean(get(r, 'Websites'), 1000);
  return {
    firstName: clean(get(r, 'First Name')), lastName: clean(get(r, 'Last Name')),
    headline: clean(get(r, 'Headline'), 400), summary: clean(get(r, 'Summary'), LIMITS.field),
    industry: clean(get(r, 'Industry')), location: clean(get(r, 'Geo Location', 'Location')),
    // "[PORTFOLIO:https://…],[COMPANY:https://…]" or plain URLs. Only http(s) links survive.
    websites: (sites.match(/https?:\/\/[^\s,\]"'<>\\]+/gi) || []).slice(0, 10).map((u) => clean(u, 300)),
  };
}

export function readPositions(text) {
  return table(text, 'Company Name', LIMITS.positions).map((r) => {
    const startedOn = clean(get(r, 'Started On', 'Start Date'), DATE), finishedOn = clean(get(r, 'Finished On', 'End Date'), DATE);
    return {
      company: clean(get(r, 'Company Name')), title: clean(get(r, 'Title')), location: clean(get(r, 'Location')),
      description: clean(get(r, 'Description'), LIMITS.field), startedOn, finishedOn,
      _start: dateKey(startedOn), _end: finishedOn ? dateKey(finishedOn) : null,
    };
  }).filter((p) => p.company || p.title).sort(byNewest).map(strip);
}

export function readEducation(text) {
  return table(text, 'School Name', LIMITS.education).map((r) => {
    const startedOn = clean(get(r, 'Start Date', 'Started On'), DATE), finishedOn = clean(get(r, 'End Date', 'Finished On'), DATE);
    return {
      school: clean(get(r, 'School Name')), degree: clean(get(r, 'Degree Name', 'Degree')),
      notes: clean(get(r, 'Notes'), LIMITS.field), activities: clean(get(r, 'Activities'), LIMITS.field),
      startedOn, finishedOn, _start: dateKey(startedOn), _end: finishedOn ? dateKey(finishedOn) : null,
    };
  }).filter((e) => e.school).sort(byNewest).map(strip);
}

export function readSkills(text) {
  const seen = new Set(), out = [];
  for (const r of table(text, 'Name', LIMITS.skills)) {
    const n = clean(get(r, 'Name'), 120); const k = n.toLowerCase();
    if (n && !seen.has(k)) { seen.add(k); out.push(n); }
  }
  return out;
}

export function readCertifications(text) {
  return table(text, 'Name', LIMITS.certifications).map((r) => {
    const url = clean(get(r, 'Url', 'URL'), 500);
    return {
      name: clean(get(r, 'Name')), authority: clean(get(r, 'Authority')), licenseNumber: clean(get(r, 'License Number')),
      url: SAFE_URL.test(url) ? url : '', startedOn: clean(get(r, 'Started On'), DATE), finishedOn: clean(get(r, 'Finished On'), DATE),
    };
  }).filter((c) => c.name);
}

export function readConnections(text) {
  return table(text, 'First Name', LIMITS.connections).map((r) => {
    const url = clean(get(r, 'URL', 'Profile URL'), 300);
    return {
      firstName: clean(get(r, 'First Name')), lastName: clean(get(r, 'Last Name')),
      company: clean(get(r, 'Company')), position: clean(get(r, 'Position')),
      email: clean(get(r, 'Email Address')), connectedOn: clean(get(r, 'Connected On')),
      url: /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(url) ? url : '',
    };
  }).filter((c) => c.firstName || c.lastName);
}

const READERS = {
  'profile.csv': ['profile', readProfile], 'positions.csv': ['positions', readPositions], 'education.csv': ['education', readEducation],
  'skills.csv': ['skills', readSkills], 'certifications.csv': ['certifications', readCertifications], 'connections.csv': ['connections', readConnections],
};
const base = (name) => String(name || '').split(/[\\/]/).pop().toLowerCase();

/** An empty import. */
export const empty = () => ({ profile: null, positions: [], education: [], skills: [], certifications: [], connections: [], files: [] });

/** Merge {name, text} CSVs into an import. Unknown names are skipped. Later files of the same kind replace earlier ones. */
export function fromTexts(list, into = empty()) {
  const out = { ...into, files: [...into.files] };
  for (const { name, text } of list) {
    const r = READERS[base(name)];
    if (!r) continue;
    if (String(text).length > LIMITS.csvBytes) throw new Error(`${base(name)} is too big to read (over ${LIMITS.csvBytes / 1048576} MB).`);
    out[r[0]] = r[1](text);
    out.files = [...out.files.filter((f) => f !== r[0]), r[0]];
  }
  return out;
}

/**
 * Read the export ZIP with JSZip (`JSZip` is the library: window.JSZip from cdnjs in the page, the npm package in tests).
 * `data` is an ArrayBuffer / Uint8Array / Blob. Only the six CSVs are decompressed.
 */
export async function fromZip(JSZip, data, into = empty()) {
  const size = data?.byteLength ?? data?.size ?? 0;
  if (size > LIMITS.zipBytes) throw new Error(`That file is over ${LIMITS.zipBytes / 1048576} MB. Upload just the CSV files instead.`);
  let zip;
  try { zip = await JSZip.loadAsync(data); } catch { throw new Error('That is not a ZIP file we can open. Upload the LinkedIn export ZIP, or the CSV files.'); }
  const list = [];
  for (const f of Object.values(zip.files)) {
    if (f.dir || !READERS[base(f.name)]) continue;
    const declared = f._data?.uncompressedSize;
    if (Number.isFinite(declared) && declared > LIMITS.csvBytes) throw new Error(`${base(f.name)} is too big to read.`);
    list.push({ name: f.name, text: await f.async('string') });
  }
  if (!list.length) throw new Error('No LinkedIn files found in that ZIP. Look for Profile.csv and Positions.csv inside it.');
  return fromTexts(list, into);
}

/** Counts for the UI. */
export const counts = (d) => ({
  profile: d.profile ? 1 : 0, positions: d.positions.length, education: d.education.length,
  skills: d.skills.length, certifications: d.certifications.length, connections: d.connections.length,
});

/** The sections a user can publish (never connections). */
export const PUBLIC_SECTIONS = ['intro', 'about', 'positions', 'education', 'skills', 'certifications'];

/** The public profile JSON: only the ticked sections, nothing else (null when none is ticked). */
export function publicProfile(d, sections) {
  const on = new Set(sections || []);
  if (!PUBLIC_SECTIONS.some((s) => on.has(s))) return null;
  const p = d.profile || {};
  const out = { v: 1 };
  if (on.has('intro')) Object.assign(out, { name: [p.firstName, p.lastName].filter(Boolean).join(' ').slice(0, 120), headline: p.headline || '' });
  if (on.has('about')) Object.assign(out, { summary: p.summary || '', location: p.location || '', industry: p.industry || '', websites: p.websites || [] });
  if (on.has('positions')) out.positions = d.positions;
  if (on.has('education')) out.education = d.education;
  if (on.has('skills')) out.skills = d.skills;
  if (on.has('certifications')) out.certifications = d.certifications;
  return out;
}
