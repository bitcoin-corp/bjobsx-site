// Shared mint rules for the profile page (studio.js). Same rules as bvideox.com mint/core.js.
// LIVE gates real writes; there is no mint cap (users mint what they choose and pay for it). Real writes also need the
// wallet to pin [2,'bjobsx records'] to bjobsx.com (getVersion().pinnedProtocols >= PIN_VERSION, or a "+pN" version
// suffix) and the premium payee set on the server. Any check failing = the page refuses to write.
import * as R from './records.js';

export const LIVE = true;

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
export const recordsN = (n) => `${n} record${n === 1 ? '' : 's'}`;
export const txN = (n) => `${n} transaction${n === 1 ? '' : 's'}`;

/** Dollars, large: "$0.03". Sats small, shown next to it by the page. */
export const usd = (sats, cfg) => {
  if (!cfg?.usdPerBsv) return null;
  const d = (sats / 1e8) * cfg.usdPerBsv;
  return d < 0.01 ? 'under $0.01' : `$${d.toFixed(2)}`;
};
export const satsText = (sats) => `${Math.round(sats).toLocaleString('en-GB')} sats`;

/** Items this identity has minted, kept on this device: itemId -> { outpoint, kid }. */
export const doneKey = (key) => `bjx-mint-${key}`;
export const doneFor = (key) => (key && ls.get(doneKey(key))) || {};

/** Fresh config + live rates. Null (no quote, no writes) when either rate is missing. */
export async function loadCfg() {
  const c = await fetch('/api/mint/config', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  if (!c || !c.usdPerBsv || !c.usdPerGbp) return null;
  return { ...c, gbpPerItem: c.premiumGbpPerItem, satPerKb: c.feeSatPerKb };
}

/** Does the wallet keep bjobsx records locked to this site? -> { ok, seen } */
export async function pinCheck(w) {
  try {
    const v = await w.getVersion({});
    const m = v && typeof v.version === 'string' ? v.version.match(/\+p(\d+)\b/) : null;
    const lock = Math.max(Number(v && v.pinnedProtocols) || 0, m ? Number(m[1]) : 0);
    return { ok: lock >= R.PIN_VERSION, seen: `${(v && v.version) || 'unknown version'}${lock ? `, lock v${lock}` : ', no lock'}` };
  } catch (e) { return { ok: false, seen: `no answer (${(e && e.message) || 'error'})` }; }
}

/** Why a real write is refused right now, or null. */
export function liveBlock({ cfg, key, walletKey, pinned, seen }) {
  if (!LIVE) return 'Real minting is off. Dry run only.';
  if (!key) return 'Connect bWalletX first.';
  if (!cfg) return 'Prices are still loading.';
  if (walletKey && walletKey !== key) return 'The wallet in this browser is a different identity from the one signed in. Reconnect bWalletX.';
  if (pinned === false) return `Your bWalletX needs an update that keeps these records locked to bjobsx.com (the connected wallet reports: ${seen}). Dry run works now.`;
  if (!cfg.payee) return 'Real minting opens shortly (payments are being set up). Dry run works now.';
  return null;
}

/** "Your wallet said no" etc., in plain words. */
export const friendly = (e) => /denied|declin|reject|cancel|permission/i.test(String(e?.message)) ? 'Your wallet said no, so nothing was written. Try again when you’re ready.'
  : e?.code === 'NOT_FOUND' ? 'Your wallet is not connected in this browser any more. Press Connect bWalletX, then try again.'
  : (e?.message || 'It stopped. Try again: it carries on from the last saved batch.');
