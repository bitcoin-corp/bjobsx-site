// GET /api/browse -> public bJobsX profiles, newest first: { profiles: [{username, name, headline, updatedAt}], live }
// Only profiles whose owner made at least one section public are listed (the push server never lists the rest).
// Public and signed-out: no wallet, no cookies.
import { get, PUSH_API } from './_lib.js';

export default async function handler(req, res) {
  const r = await get(`${PUSH_API()}/v1/job-profiles?recent=1&limit=100`, 3000);
  const live = r.status === 200 && Array.isArray(r.json?.profiles);
  const profiles = live ? r.json.profiles.map((p) => ({
    username: String(p.username || ''), name: String(p.name || '').slice(0, 120), headline: String(p.headline || '').slice(0, 400), updatedAt: p.updatedAt || null,
  })).filter((p) => p.username) : [];
  res.setHeader('Cache-Control', live ? 'public, s-maxage=120, stale-while-revalidate=600' : 'no-store');
  res.status(200).json({ profiles, live });
}
