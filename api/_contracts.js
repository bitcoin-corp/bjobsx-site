// Where bJobsX contracts come from. The front end only ever sees GET /api/contracts, so this is the one place to
// change when the list moves to a database.
//  1. House contracts: data/contracts.json (ours, posted and paid by The Bitcoin Corporation Ltd). Always read.
//  2. The bit-sign registry, where organisations and people post their own (later): read only when
//     CONTRACTS_REGISTRY_URL is set, e.g. https://www.bit-sign.online/api/bitsign/contracts?status=open
//     It may answer { contracts: [...] } or a bare array. On an error, a non-200 or a 2.5 s timeout it is skipped.
// The same id in both: the registry row wins field by field, and the house file is the fallback. A row only counts as
// ours (house) when its id is in our file and the registry doesn't name a different poster; registry-only rows are
// never treated as ours, whatever they say.
import { readFileSync } from 'node:fs';
import { get } from './_lib.js';
import { normalise, sortContracts, safeHref, HOUSE_NAME } from '../lib/contracts-view.js';

const HOUSE_FILE = new URL('../data/contracts.json', import.meta.url);

export function readHouse() {
  const j = JSON.parse(readFileSync(HOUSE_FILE, 'utf8'));
  return { rows: Array.isArray(j.contracts) ? j.contracts : [], updatedAt: j.updatedAt || null };
}

export async function readRegistry(url = process.env.CONTRACTS_REGISTRY_URL) {
  if (!url || !/^https:\/\//i.test(url)) return { rows: [], state: 'off' };
  const r = await get(url, 2500);
  const rows = Array.isArray(r.json) ? r.json : r.json?.contracts;
  if (r.status !== 200 || !Array.isArray(rows)) return { rows: [], state: 'skipped' };
  return { rows: rows.slice(0, 500), state: 'ok' };
}

const posterName = (row) => {
  const p = row?.poster;
  return String((p && typeof p === 'object' ? p.legalName ?? p.name : null) ?? row?.posterName ?? '').trim();
};

/** Every contract to show, open first: { contracts, updatedAt, registry }. */
export async function listContracts({ registryUrl } = {}) {
  const house = readHouse();
  const reg = await readRegistry(registryUrl);
  const byId = new Map();
  for (const row of house.rows) byId.set(String(row.id).toLowerCase(), { row, house: true });
  for (const row of reg.rows) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id ?? '').toLowerCase();
    const mine = byId.get(id);
    if (mine?.house) {
      const other = posterName(row) && posterName(row) !== HOUSE_NAME;
      byId.set(id, { row: { ...mine.row, ...row, detail: row.detail ?? mine.row.detail }, house: !other });
    } else if (!mine) byId.set(id, { row, house: false });
  }
  const contracts = sortContracts([...byId.values()].map(({ row, house: h }) => normalise(row, { house: h })).filter(Boolean));
  return { contracts, updatedAt: house.updatedAt, registry: reg.state };
}

/** The "Post a contract" link: shown only when POST_CONTRACT_URL is set (an https URL). Null otherwise. */
export const postContractUrl = (v = process.env.POST_CONTRACT_URL) => (v && /^https:\/\//i.test(v) ? safeHref(v) || null : null);
