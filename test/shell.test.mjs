// One shell on every page (RB 15 Nov: "the navbar switches to pages without navbars"), and Post a job everywhere,
// never through bChatX's /room/new.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { render, PAGES, header, footer, strip, NAV, HINT } from '../scripts/build-shell.mjs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html'));

test('every page in the site is in the shell list', () => {
  assert.deepEqual(htmlFiles.sort(), Object.keys(PAGES).sort());
});

test('every page carries the current shell (pnpm shell)', () => {
  const out = render();
  for (const [f, text] of Object.entries(out)) assert.equal(read(f), text, `${f} is out of date: run pnpm shell`);
});

test('every page: strip, header with the same links, gold Post a job, Connect, footer, shell.css, one bwx.js', () => {
  for (const f of htmlFiles) {
    const page = read(f);
    assert.ok(page.includes(strip()), `${f}: strip`);
    assert.ok(page.includes('Part of <b>bWalletX</b>'), `${f}: strip text`);
    assert.equal((page.match(/<header class="xs-bar">/g) || []).length, 1, `${f}: one header`);
    const head = page.slice(page.indexOf('<header class="xs-bar">'), page.indexOf('</header>', page.indexOf('<header class="xs-bar">')));
    assert.match(head, /<a class="xs-brand" href="\/" aria-label="bJobsX home">/, `${f}: logo goes home`);
    for (const [href, label] of NAV) assert.match(head, new RegExp(`<a href="${href}"(?: aria-current="page")?>${label}</a>`), `${f}: ${label}`);
    assert.match(head, /<a class="xs-post" href="\/post"(?: aria-current="page")?>Post a job<\/a>/, `${f}: Post a job`);
    assert.ok(head.includes('<span data-bwx></span>'), `${f}: Connect`);
    assert.ok(page.includes(footer()), `${f}: footer`);
    assert.match(page, /<footer class="xs-foot">[\s\S]*<a href="\/">Home<\/a>/, `${f}: footer Home`);
    assert.ok(page.includes('<link rel="stylesheet" href="/shell.css">'), `${f}: shell.css`);
    assert.equal((page.match(/<script src="\/bwx\.js"><\/script>/g) || []).length, 1, `${f}: bwx.js once`);
    assert.equal((page.match(/bwalletx-connect\.global\.js/g) || []).length, 1, `${f}: connector once`);
    assert.ok(!/<header class="wrap nav">/.test(page), `${f}: no old header`);
  }
});

test('aria-current marks the page you are on, and only that one', () => {
  assert.match(header('/contracts'), /<a href="\/contracts" aria-current="page">Jobs<\/a>/);
  assert.match(header('/post'), /<a class="xs-post" href="\/post" aria-current="page">/);
  assert.equal((header('/browse').match(/aria-current/g) || []).length, 1);
  assert.ok(!header('').includes('aria-current'));
  assert.ok(read('contracts.html').includes('<a href="/contracts" aria-current="page">Jobs</a>'));
});

test('new pages: title, description, canonical and the existing og image', () => {
  for (const f of ['post.html', 'what-you-can-post.html']) {
    const page = read(f);
    assert.match(page, /<title>[^<]+ · bJobsX<\/title>/);
    assert.match(page, /<meta name="description" content="[^"]{40,}">/);
    assert.match(page, /<link rel="canonical" href="https:\/\/bjobsx\.com\/[a-z-]+">/);
    assert.ok(page.includes('<meta property="og:image" content="https://bjobsx.com/og-bjobsx-v4.png">'));
    assert.ok(page.includes('<meta name="twitter:image" content="https://bjobsx.com/og-bjobsx-v4.png">'));
  }
});

test('Post a job: in the landing hero, under the carousel and in the signed-in app (top bar, composer, Build box)', () => {
  const index = read('index.html');
  assert.match(index, /<div class="xs-ctas"><a class="xs-btn xs-white" href="#jobs">See open contracts<\/a><a class="xs-btn xs-gold" href="\/post">Post a job<\/a>/);
  assert.ok(index.includes('<p class="info-more"><a href="/contracts">All contracts and how they work</a><a href="/post">Post a job</a></p>'));
  const app = read('app.js'), top = read('topbar.js');
  assert.match(top, /post: '\/post', postEquity: '\/post\?pay=equity'/);
  assert.ok(top.includes('<a class="ap-btn ap-btn-gold ap-post" href="${L.post}"'), 'top bar');
  assert.ok(app.includes('<a class="ap-lk ap-lk-1" href="${L.postEquity}">Offer equity for work</a>'), 'Build box');
  assert.ok(app.includes('<a class="ap-compose-post" href="${L.post}">'), 'composer');
  assert.ok(!/postUrl/.test(app + read('home.js') + read('contracts.js')), 'no client uses the old postUrl any more');
});

test('no bJobsX link posts a job through bchatx.com/room/new (only "Start an organisation" and the deal room go there)', () => {
  const sources = [...htmlFiles, 'app.js', 'topbar.js', 'home.js', 'contracts.js', 'post.js', 'bwx.js', 'studio.js', ...readdirSync(new URL('lib/', root)).map((f) => 'lib/' + f)];
  for (const f of sources) {
    const text = read(f);
    // Links written out in HTML.
    for (const m of text.matchAll(/<a\b[^>]*href="([^"]*room\/new[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const label = m[2].replace(/<[^>]+>/g, ' ');
      assert.match(label, /Start an organisation|private deal room/, `${f}: ${m[1]} is labelled "${label.trim()}"`);
    }
  }
  // app.js builds them from L.org: only those two labels use it.
  const app = read('app.js') + read('topbar.js');
  for (const m of app.matchAll(/href="\$\{L\.org\}"[^>]*>([^<]*)/g)) assert.match(m[1], /Start an organisation|Raise in a private deal room/, m[1]);
  assert.ok(!/Offer equity for work[^\n]*L\.org|L\.org[^\n]*Offer equity for work/.test(app));
  assert.ok(!/Post a (job|contract)[^\n]*room\/new|room\/new[^\n]*Post a (job|contract)/i.test(htmlFiles.map(read).join('\n') + app));
});

test('Connect from the header on /post stays on /post (the draft is open)', () => {
  assert.ok(read('post.html').includes('<body data-bwx-stay>'));
  assert.ok(read('bwx.js').includes("!document.body.hasAttribute('data-bwx-stay')"));
});

test('What you can post: the approved body, no draft header or editorial notes', () => {
  const page = read('what-you-can-post.html');
  for (const s of ['Work you can post', 'Testing your own systems:', 'Until bJobsX has age checks, 18+ posts are seen only by you and our moderators.', 'unless you say the promotion is approved by an FCA-authorised firm or is exempt', 'For the beta, you must live in the UK to post.', 'bCorp never holds the money.', "Posted and paid by &lt;legal name&gt; ($handle). bCorp runs bJobsX and isn't a party", 'Monday to Friday, 09:00–17:30 UK time.', 'with "Appeal" in the subject']) assert.ok(page.includes(s), s);
  for (const s of ['DRAFT', 'CEO review', 'RULING-2026', '§7', 'bit-sign #715']) assert.ok(!page.includes(s), s);
});

// RB 15 Nov: "the navbar isn't persisting across the different pages". Signed in, every page wears the home's top bar.
test('signed in: one top bar for every page (topbar.js), drawn by the home and mounted everywhere else', () => {
  const top = read('topbar.js'), app = read('app.js'), bwx = read('bwx.js');
  // One source: the home uses the shared markup, and keeps no copy of its own.
  assert.ok(app.includes("${topHTML('home')}") && app.includes("${tabsHTML('home')}"));
  assert.ok(!app.includes('<header class="ap-top">') && !app.includes('<nav class="ap-tabs"'));
  for (const label of ['Search people and contracts', "'Home', '/'", "'People', '/browse'", "'Contracts', '/contracts'", "'Messages', L.msg", 'Notifications', 'For organisations', 'Post a job', 'Sign out']) assert.ok(top.includes(label), label);
  // Every page loads bwx.js (the shell footer), and bwx.js mounts the bar once the session names a wallet.
  assert.ok(bwx.includes("import('/topbar.js').then((m) => (k ? m.mount(k) : m.unmount()))"));
  assert.match(bwx, /hint\(!!j\.identityKey\); top\(j\.identityKey \|\| null\);/);
  // The home draws its own: mount() leaves a page that has #app alone.
  assert.ok(top.includes("if (!identityKey || document.getElementById('app')) return false;"));
  // "For organisations" works off the home too.
  assert.ok(top.includes("location.assign('/#ap-org')") && app.includes("if (location.hash === '#ap-org') gotoOrg();"));
});

test('signed in: the shell header is hidden before paint on every page but the landing; signed out nothing changes', () => {
  for (const f of Object.keys(PAGES)) {
    const page = read(f), n = page.split(HINT).length - 1;
    assert.equal(n, f === 'index.html' ? 0 : 1, `${f}: hint script`);
    if (n) assert.ok(page.indexOf(HINT) < page.indexOf('<header class="xs-bar">'), `${f}: hint runs before the header`);
    assert.equal((page.match(/<header class="xs-bar">/g) || []).length, 1, `${f}: the signed-out header is still there`);
  }
  assert.match(HINT, /localStorage\.getItem\('bjx-in'\)==='1'/);
  const css = read('shell.css');
  assert.ok(css.includes('html.bjx-top .xs-strip,html.bjx-top body>.xs-bar{display:none}'));
  assert.ok(!/(^|[},])\s*\.xs-(strip|bar)\{display:none/.test(css), 'never hidden without bjx-top');
  assert.ok(read('app.css').includes('#app.ap-chrome{display:contents}'));
});
