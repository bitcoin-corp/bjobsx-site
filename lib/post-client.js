// Sends a job from /post to the bit-sign registry: POST <CONTRACTS_POST_API>/api/bitsign/contracts, which files it as
// pending_review. The base URL comes from config (GET /api/post-config, env CONTRACTS_POST_API). With no base set,
// nothing is sent, ever: submit() answers { unavailable: true } and the page says posting opens soon.
//
// submit(form) answers exactly one of:
//   { ok: true, id, status }   filed for review
//   { errors: { field: msg } } the registry rejected fields (names mapped to the form's: lib/post-form.js)
//   { needs: ['veriff', …] }   steps the poster must take first (veriff, legal_name, uk_resident, companies_house, connect…)
//   { unavailable: true }      no base URL configured
//   { error: 'message' }       anything else (network, server); the draft stays on the device
import { toPayload, fieldFromApi } from './post-form.js';

export const POST_PATH = '/api/bitsign/contracts';
const TIMEOUT_MS = 15000;
const clip = (v, n) => String(v ?? '').slice(0, n);

/** The endpoint for a base URL: https only (or a same-site path), never anything else. '' when unset or unsafe. */
export function endpoint(base) {
  const b = String(base ?? '').trim();
  if (!b) return '';
  const ok = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>]*)?$/i.test(b) || (b.startsWith('/') && !b.startsWith('//'));
  if (!ok) return '';
  const root = b.replace(/\/+$/, '');
  return root.endsWith(POST_PATH) ? root : root + POST_PATH;
}

/** { field: msg } from the registry's errors ({field: msg} or [{field, message}]), in our field names. null if none. */
export function fieldErrors(j) {
  const raw = j && j.errors;
  if (!raw || typeof raw !== 'object') return null;
  const pairs = Array.isArray(raw)
    ? raw.filter((x) => x && typeof x === 'object').map((x) => [x.field ?? x.path ?? x.name, x.message ?? x.error ?? x.msg])
    : Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
  const out = {};
  for (const [k, v] of pairs.slice(0, 30)) {
    const msg = clip(typeof v === 'string' ? v : '', 300).trim() || 'Check this.';
    const f = fieldFromApi(k) || '_form';
    out[f] = out[f] ? `${out[f]} ${msg}` : msg;
  }
  return Object.keys(out).length ? out : null;
}

/** What a registry answer means for the page. */
export function mapResponse(status, j) {
  if (j && Array.isArray(j.needs)) {
    const needs = j.needs.filter((x) => typeof x === 'string' && /^[a-z0-9_]{1,40}$/.test(x)).slice(0, 10);
    if (needs.length) return { needs };
  }
  const errors = fieldErrors(j);
  if (status >= 200 && status < 300 && !errors) {
    const id = j && (typeof j.id === 'string' || typeof j.id === 'number') ? clip(j.id, 80) : '';
    if (id) return { ok: true, id, status: clip((j && j.status) || 'pending_review', 40) };
    return { error: 'The server didn’t confirm the post. Your draft is saved on this device. Try again.' };
  }
  if (errors) return { errors };
  if (status === 401) return { needs: ['connect'] };
  const msg = j && typeof j.error === 'string' ? clip(j.error, 200).trim() : '';
  return { error: msg || 'Something went wrong. Your draft is saved on this device. Try again.' };
}

/** A client for one base URL. fetch is injectable for tests. */
export function createPostClient({ base = '', fetch: f = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const url = endpoint(base);
  return {
    enabled: !!url,
    url,
    async submit(form, who = {}) {
      if (!url) return { unavailable: true };
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
      let r;
      try {
        r = await f(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(toPayload(form, who)),
          ...(ctl ? { signal: ctl.signal } : {}),
        });
      } catch {
        return { error: 'We couldn’t reach the server. Your draft is saved on this device. Try again.' };
      } finally {
        if (timer) clearTimeout(timer);
      }
      const j = await r.json().catch(() => null);
      return mapResponse(r.status, j);
    },
  };
}

/** One-off: submit(form, { base, who, fetch }). */
export const submit = (form, { base, who, fetch } = {}) => createPostClient({ base, fetch }).submit(form, who);
