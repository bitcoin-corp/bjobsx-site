// The one bJobsX shell: the "Part of bWalletX" strip, the header (b JobsX, Jobs, People, Your profile, a gold
// Post a job and the Connect pill) and the footer (with the Connect scripts). Written here once and stamped into
// every page between its markers, so the pages can't drift apart and it all works without JavaScript:
//   <!-- shell:strip -->  …  <!-- /shell:strip -->
//   <!-- shell:header --> …  <!-- /shell:header -->
//   <!-- shell:footer --> …  <!-- /shell:footer -->
// Styles: shell.css. The landing (index.html) carries the header inside its hero; every other page under the strip.
// Usage: pnpm shell          (write)
//        pnpm shell --check  (exit 1 if a page is out of date; the tests run this)
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');

/** Every page and the header link it is (for aria-current). Add a page here and it gets the shell. */
export const PAGES = {
  'index.html': '',
  'contracts.html': '/contracts',
  'browse.html': '/browse',
  'studio.html': '/studio',
  'post.html': '/post',
  'what-you-can-post.html': '',
  'privacy.html': '',
  'terms.html': '',
};

export const NAV = [['/contracts', 'Jobs'], ['/browse', 'People'], ['/studio', 'Your profile']];
export const POST_HREF = '/post';
export const CONNECT_SRC = 'https://unpkg.com/@bwalletx/connect@0.7.0/dist/bwalletx-connect.global.js';
const CONNECT_SRI = 'sha384-VkIrDOw3Hmv7qnytbLGT1hNz7DbJ3IJiI91HSOTqjWu146/hl1KINi4v/hPzTfvI';
const B_PATH = 'M45 12V72H27V30Z M27 72a33 33 0 1 1 66 0a33 33 0 1 1-66 0Z M45 72a15 15 0 1 0 30 0a15 15 0 1 0-30 0Z';

export function strip() {
  return `<aside class="xs-strip" aria-label="bWalletX"><a href="https://bwalletx.com/"><svg viewBox="23 8 74 100" aria-hidden="true" focusable="false"><defs><linearGradient id="xs-sg" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="105"><stop offset="0" stop-color="#FFE58A"/><stop offset=".55" stop-color="#FFD24D"/><stop offset="1" stop-color="#C98F00"/></linearGradient></defs><path fill="url(#xs-sg)" d="${B_PATH}"/></svg><span>Part of <b>bWalletX</b></span><span class="xs-go" aria-hidden="true">&rarr;</span></a></aside>`;
}

export function header(current = '') {
  const cur = (href) => (href === current ? ' aria-current="page"' : '');
  const links = NAV.map(([href, label]) => `<a href="${href}"${cur(href)}>${label}</a>`).join('');
  return `<header class="xs-bar"><div class="xs-wrap xs-nav"><a class="xs-brand" href="/" aria-label="bJobsX home"><svg viewBox="23 8 74 100" aria-hidden="true" focusable="false"><path fill="currentColor" d="${B_PATH}"/></svg><span><span class="xs-sr">b</span><span class="xs-nm">Jobs</span><i>X</i></span><span class="beta">Beta</span></a><nav class="xs-links" aria-label="Main">${links}</nav><div class="xs-acts"><a class="xs-post" href="${POST_HREF}"${cur(POST_HREF)}>Post a job</a><span data-bwx></span></div></div></header>`;
}

export const FOOT_LINKS = [['/', 'Home'], ['/contracts', 'Jobs'], ['/post', 'Post a job'], ['/browse', 'People'], ['/studio', 'Your profile'], ['/what-you-can-post', 'What you can post'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['https://www.bchatx.com/s/bjobs', 'The bJobs Board']];

export function footer() {
  return `<footer class="xs-foot">
  <nav aria-label="Footer">${FOOT_LINKS.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
  <p>bJobsX · part of the bWalletX family · THE BITCOIN CORPORATION LTD, company no. 16735102</p>
</footer>
<script src="${CONNECT_SRC}" integrity="${CONNECT_SRI}" crossorigin="anonymous"></script>
<script src="/bwx.js"></script>`;
}

const BLOCKS = { strip: () => strip(), header: (cur) => header(cur), footer: () => footer() };

/** One page with its shell blocks filled in. Throws if a marker is missing. */
export function stamp(file, text) {
  if (!(file in PAGES)) throw new Error(`${file} isn't in PAGES.`);
  let out = text;
  for (const [name, make] of Object.entries(BLOCKS)) {
    const re = new RegExp(`(<!-- shell:${name} -->)[\\s\\S]*?(<!-- /shell:${name} -->)`);
    if (!re.test(out)) throw new Error(`${file} has no <!-- shell:${name} --> block.`);
    out = out.replace(re, (_, a, b) => `${a}\n${make(PAGES[file])}\n${b}`);
  }
  return out;
}

export function render() {
  const out = {};
  for (const f of Object.keys(PAGES)) out[f] = stamp(f, readFileSync(new URL(f, root), 'utf8'));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = render();
  const stale = [];
  for (const [f, text] of Object.entries(out)) {
    if (readFileSync(new URL(f, root), 'utf8') === text) continue;
    stale.push(f);
    if (!check) writeFileSync(new URL(f, root), text);
  }
  if (check && stale.length) { console.error(`Out of date: ${stale.join(', ')}. Run pnpm shell.`); process.exit(1); }
  console.log(stale.length ? `${check ? 'Stale' : 'Wrote'}: ${stale.join(', ')}` : 'Every page has the current shell.');
}
