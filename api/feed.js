// GET /api/feed -> { posts: [...], live, source } — public posts from bChatX's open feed, for the signed-in home.
// A read-through proxy: bJobsX stores nothing. Rows are cleaned by lib/feed-view.js (only safe fields survive; posts the
// source marks nsfw, blurred or sensitive are dropped). Cached 60 s at the CDN.
// If bChatX is slow (3 s), down or answers nonsense, this answers 200 with an empty list, never an error page.
// Public and signed-out: no wallet, no cookies.
import { get } from './_lib.js';
import { cleanFeed, FEED_SOURCE } from '../lib/feed-view.js';

export const FEED_MS = 3000;

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Use GET.' });
  }
  const r = await get(FEED_SOURCE, FEED_MS);
  const live = r.status === 200 && (Array.isArray(r.json) || Array.isArray(r.json?.posts));
  let posts = [];
  try { posts = live ? cleanFeed(r.json, 20) : []; } catch { posts = []; }
  res.setHeader('Cache-Control', live ? 'public, s-maxage=60, stale-while-revalidate=300' : 'public, s-maxage=15');
  return res.status(200).json({ posts, live, source: 'bChatX open feed' });
}
