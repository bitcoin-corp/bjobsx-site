// GET /api/post-config -> { postApi, veriffUrl }
// What /post needs to send a job. Public, no cookies.
//   postApi    env CONTRACTS_POST_API: the bit-sign registry's base URL (POST <base>/api/bitsign/contracts files a job as
//              pending_review). null until it's set: /post then works as a form and preview, and says posting opens soon.
//   veriffUrl  env VERIFF_URL: where a poster runs the ID check (Veriff) when the registry says it's needed.
const httpsOnly = (v) => { const s = String(v || '').trim(); return /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>]*)?$/i.test(s) ? s : ''; };
export const DEFAULT_VERIFF_URL = 'https://bit-sign.online/kyc';

export function postConfig(env = process.env) {
  return {
    postApi: httpsOnly(env.CONTRACTS_POST_API) || null,
    veriffUrl: httpsOnly(env.VERIFF_URL) || DEFAULT_VERIFF_URL,
  };
}

export default function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Use GET.' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json(postConfig());
}
