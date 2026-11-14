// GET /api/contracts -> { contracts: [...], updatedAt, registry, postUrl }
// Every contract on bJobsX, open first, then taken, then done. Feeds the home carousel (polled every 60 s) and
// /contracts. Each contract: id, ref, version, status, poster {house, name, handle, short}, scope, kind, title, line,
// pay, time, art | ghost, color, href, go, room, and detail (anchor, area, heading, est, build, done[], claim) when it
// has full terms. Sources: see api/_contracts.js. postUrl is the "Post a contract" link, or null to hide it.
// Public and signed-out: no wallet, no cookies.
import { listContracts, postContractUrl } from './_contracts.js';

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Use GET.' });
  }
  try {
    const { contracts, updatedAt, registry } = await listContracts();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ contracts, updatedAt, registry, postUrl: postContractUrl() });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Contracts are not available right now.', contracts: [] });
  }
}
