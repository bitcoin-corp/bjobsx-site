// /contracts: the cards are baked into the page from data/contracts.json (pnpm contracts), so it works without
// JavaScript. Here we fetch /api/contracts and redraw a grid when its contracts differ (new, removed, a new version,
// taken or done), so contracts posted since the last deploy show up. Same renderer as the build: lib/contracts-view.js.
import { contractArticle, gridFor, cardSig } from '/lib/contracts-view.js';

const grids = [...document.querySelectorAll('[data-contracts]')];
const own = grids.map((g) => g.dataset.contracts).filter((s) => s !== '*');

async function refresh() {
  let j;
  try {
    const r = await fetch('/api/contracts', { cache: 'no-cache', headers: { accept: 'application/json' } }); // the CDN caches for 60 s; the browser always asks it
    if (!r.ok) return;
    j = await r.json();
  } catch { return; }
  if (!Array.isArray(j?.contracts)) return;
  for (const g of grids) {
    const list = gridFor(j.contracts, g.dataset.contracts, own);
    const was = [...g.querySelectorAll('article')].map((a) => `${a.dataset.id}@${a.dataset.version}@${a.dataset.status}`).join();
    if (was === list.map(cardSig).join()) continue;
    g.innerHTML = list.map(contractArticle).join('\n');
  }
  const post = document.querySelector('[data-post-contract]');
  if (post && j.postUrl) { post.href = j.postUrl; post.hidden = false; }
}

refresh();
