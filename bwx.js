/* Connect bWalletX on bjobsx.com: drop <span data-bwx></span> anywhere and include this after
   @bwalletx/connect's global build and qrcode-generator. Extension / in-app wallets connect straight away;
   on a desktop with no extension it shows a QR to pair the phone app (or paste into web.bwalletx.com).
   Once connected the button shows the wallet's full paymail (name@bwalletx.com); no name yet: short key + Get your name.
   <span data-bwx="studio"></span> turns into a "Your profile" link once connected.
   In the header, a connected slot is a "$handle" link to /studio, and connecting there opens /studio (your profile).
   <span data-bwx="signout"></span> is a Sign out button while connected (nothing when signed out). */
(() => {
  const C = window.bWalletXConnect;
  const slots = [...document.querySelectorAll('[data-bwx]')];
  // No button on this page still finishes a sign-in bWalletX sent back here (#bwx=ok…, connect 0.9.0).
  if (!C || (!slots.length && !C.hasReturnFragment?.())) return;
  const short = (k) => k.slice(0, 6) + '…' + k.slice(-4);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const css = document.createElement('style');
  css.textContent = `.bwx-btn{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,210,77,.45);background:#0b0b0c;color:#ffd24d;font:600 14px 'Space Grotesk',sans-serif;cursor:pointer}
  .bwx-btn{max-width:100%;min-width:0}.bwx-pm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  header [data-bwx]{display:inline-flex;align-items:center;min-width:0;max-width:min(62vw,340px)}
  .bwx-get{margin-left:8px;font-size:12px;color:#ffd24d;white-space:nowrap}
  .bwx-btn:hover{border-color:#ffd24d}.bwx-btn.on{background:linear-gradient(180deg,#ffe58a,#ffd24d 55%,#e0a800);color:#000;border:0}
  .bwx-dot{width:8px;height:8px;border-radius:50%;background:currentColor}
  .bwx-modal{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.8);display:grid;place-items:center;padding:16px}
  .bwx-card{background:#0b0b0c;border:1px solid rgba(255,210,77,.3);border-radius:20px;padding:24px;max-width:360px;width:100%;text-align:center;color:#f4f1e8;font:400 15px/1.5 'IBM Plex Sans',sans-serif}
  .bwx-card h3{font:700 22px 'Space Grotesk',system-ui,sans-serif;margin:0 0 6px}.bwx-qr{background:#fff;border-radius:12px;padding:12px;margin:14px auto;width:max-content}
  .bwx-code{font:700 30px 'Space Grotesk',system-ui,sans-serif;letter-spacing:.2em;color:#ffd24d}.bwx-x{margin-top:14px;background:none;border:0;color:#9a968b;cursor:pointer;font-size:14px}
  .bwx-link{word-break:break-all;font-size:11px;color:#9a968b;background:#000;border-radius:8px;padding:8px;margin-top:8px;cursor:copy}`;
  document.head.appendChild(css);

  let key = null, wallet = null, alias = null, paymail = null;
  /** Main name for an identity key, from the bWalletX paymail server (public lookup): {paymail, alias}. */
  const nameFor = async (k) => {
    try { const r = await fetch('https://pay.bwallet.space/api/paymail/lookup?key=' + k); const j = await r.json(); return r.ok && j.paymail ? { paymail: j.paymail, alias: j.alias || null } : null; } catch { return null; }
  };
  const setKey = async (k) => { key = k || null; alias = null; paymail = null; draw(); if (key) { const n = await nameFor(key); if (key === k && n) { alias = n.alias; paymail = n.paymail; draw(); } } };
  const shortKey = (k) => k.slice(0, 6) + '\u2026' + k.slice(-4);
  window.bjxIdentity = () => ({ identityKey: key, alias, paymail });
  /** The connected BRC-100 wallet (for signing claims): this session's, or a restored extension/pairing. */
  window.bjxWallet = async () => wallet || (wallet = (await C.connectBwalletX({})).wallet);
  const draw = () => slots.forEach((s) => {
    s.innerHTML = '';
    // Signed in: the full paymail (name@bwalletx.com); no name yet: a short key + "Get your name".
    const label = paymail ? `<span class="bwx-pm">${esc(paymail)}</span>` : key ? `<span class="bwx-pm">${esc(shortKey(key))}</span>` : '';
    const inNav = !!s.closest('header');
    // Navbar, connected: full paymail -> your account page (/studio). Sign out lives on the studio page.
    if (key && inNav) {
      const a = document.createElement('a');
      a.className = 'bwx-btn on'; a.href = '/studio'; a.title = 'Your profile: paymail, name, records';
      a.innerHTML = `<span class="bwx-dot"></span>${label}`;
      s.appendChild(a);
      if (!paymail) { const g = document.createElement('a'); g.className = 'bwx-get'; g.href = 'https://bwalletx.com/get'; g.target = '_blank'; g.rel = 'noopener'; g.textContent = 'Get your name'; s.appendChild(g); }
      return;
    }
    if (s.dataset.bwx === 'signout') {
      if (!key) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'bwx-btn'; b.textContent = 'Sign out'; b.title = 'Disconnect bWalletX from bJobsX on this browser';
      b.onclick = disconnect; s.appendChild(b); return;
    }
    if (key && s.dataset.bwx === 'studio') {
      const a = document.createElement('a');
      a.className = 'bwx-btn on'; a.href = '/studio';
      a.innerHTML = `Your profile · ${label} <span aria-hidden="true">&rarr;</span>`;
      s.appendChild(a); return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bwx-btn' + (key ? ' on' : '');
    b.innerHTML = key ? `<span class="bwx-dot"></span>${label}` : 'Connect bWalletX';
    b.title = key ? 'Connected. Click to disconnect.' : 'Connect your bWalletX';
    b.onclick = key ? disconnect : () => connect(inNav || s.dataset.bwx === 'studio');
    s.appendChild(b);
  });
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };
  let modal = null;
  const close = () => { modal?.remove(); modal = null; };
  const show = (html) => {
    close();
    modal = document.createElement('div'); modal.className = 'bwx-modal';
    modal.innerHTML = `<div class="bwx-card">${html}<button class="bwx-x" type="button">Cancel</button></div>`;
    modal.querySelector('.bwx-x').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
    document.body.appendChild(modal);
    return modal.querySelector('.bwx-card');
  };

  // Connect 0.9.0, sign-in on the same phone: bWalletX signs in on its Connect card and sends the user back to this
  // site's root (#bwx=ok…, often in a new tab), where resumeReturned() finishes it. That tab needs the challenge's
  // sealed ticket for /api/bwalletx/verify, so it is kept here by nonce (it holds no secret: the challenge is public)
  // with where to go next. Entries go once used, or after 10 minutes.
  const TICKETS = 'bwx:tickets';
  const tickets = (fn) => {
    try {
      const m = JSON.parse(localStorage.getItem(TICKETS) || '{}') || {};
      for (const n of Object.keys(m)) if (!(Date.now() - m[n].at < 6e5)) delete m[n];
      const out = fn(m);
      localStorage.setItem(TICKETS, JSON.stringify(m));
      return out;
    } catch { return null; }
  };
  const keepTicket = (nonce, ticket, next) => tickets((m) => { m[nonce] = { ticket, next: next || null, at: Date.now() }; });
  const takeTicket = (nonce) => tickets((m) => { const t = m[nonce] || null; delete m[nonce]; return t; });
  const here = () => location.origin + location.pathname;
  const go = (to) => { const u = new URL(to, location.origin); if (u.origin === location.origin && u.href !== here()) location.replace(u.href); };

  const signedIn = (identityKey, w, toStudio) => {
    C.rememberIdentity(identityKey);
    wallet = w || wallet; close(); setKey(identityKey);
    document.dispatchEvent(new CustomEvent('bjobsx-wallet', { detail: { identityKey, fromNav: !!toStudio } }));
  };
  const failed = (e) => {
    if (e && e.code === 'NOT_FOUND') {
      show(`<h3>No bWalletX found</h3><p>Get the bWalletX extension or app, or use the web wallet.</p><p><a class="bwx-btn on" href="https://bwalletx.com/get">Get bWalletX</a></p>`);
    } else if (e && /cancel|denied|reject/i.test(e.message || '')) {
      show(`<h3>Cancelled</h3><p>Nothing was signed. Try again when you’re ready.</p>`);
    } else {
      show(`<h3>Couldn’t connect</h3><p style="color:#ff8a7a">${esc((e && e.message) || 'Try again.')}</p>`);
    }
  };

  // The family connect (connector 0.7.0): find every wallet, use the one in this browser when there's exactly one,
  // otherwise the chooser (bWalletX first, other BRC-100 wallets, Metanet Desktop on tap, the phone QR last).
  async function connect(toStudio) {
    let ticket = null, pre = null;
    const challenge = async (identityKey) => { const ch = await post('/api/bwalletx/challenge', identityKey ? { identityKey } : {}); ticket = ch.ticket; return ch; };
    // Connecting from the navbar (any page) opens your account page. The claim page's own step-3 button stays put.
    // Pages that keep you where you are (<body data-bwx-stay>, e.g. /post with a draft open) don't jump to /studio.
    const next = toStudio && !document.body.hasAttribute('data-bwx-stay') && !/^\/studio\/?$/.test(location.pathname) ? '/studio' : null;
    const pairing = C.pairingModal();
    try {
      const list = await C.discoverWallets({ pairing });
      const choice = C.decideWallet(list, { remembered: C.rememberedWalletChoice() });
      const opt = choice.option || await C.chooseWallet(list);
      if (!opt) { pairing.close(); return; }
      // 0.9.0, the phone on this same phone (pairingModal set returnTo): fold the sign-in into Connect, so bWalletX
      // asks once ("Connect and sign in") and comes back here signed in.
      let login;
      if (opt.kind === 'pairing' && pairing.returnTo) {
        pre = await challenge().catch(() => null);
        login = pre && C.foldableLogin?.(pre, location.origin);
        if (login) keepTicket(pre.nonce, ticket, next);
      }
      const cw = await opt.connect({ identity: false, ...(login && { login }) });
      if (!cw.wallet) throw new Error('That wallet can’t sign in here. Use bWalletX or another BRC-100 wallet.');
      if (!cw.wallet.signedIn) pre = null; // not folded: a fresh challenge for the usual sign-in
      C.rememberWalletChoice(opt);
      // Our routes run connect 0.9.0's server helpers: the challenge needs no key first (one wallet sheet).
      const r = await C.signInWithBwalletX({
        wallet: cw.wallet,
        identityKey: cw.identityKey || C.rememberedIdentity(),
        challenge: (identityKey) => { const c = pre; pre = null; return c ? Promise.resolve(c) : challenge(identityKey); },
      });
      const v = await post('/api/bwalletx/verify', { identityKey: r.identityKey, nonce: r.nonce, signature: r.signature, ticket });
      pairing.close(); takeTicket(r.nonce);
      signedIn(v.identityKey, r.wallet, toStudio);
      if (next) location.assign(next);
    } catch (e) {
      pairing.close();
      // bWalletX came back in another tab, which finished the sign-in: pick up its session here.
      if (e && e.code === 'RETURNED_IN_ANOTHER_TAB') return session();
      failed(e);
    }
  }
  // The tab bWalletX returned to: finish the pairing, post the sign-in it folded into Connect, go on to the next page
  // (or back to the one the sign-in started on). Resolves true when this page is now signed in (or leaving).
  async function resumeReturned() {
    let r = null;
    try { r = await C.resumeReturnedPairing(); } catch {}
    if (!r) return false;
    try {
      const t = r.login && takeTicket(r.login.nonce);
      let v;
      if (r.login && t) {
        v = await post('/api/bwalletx/verify', { identityKey: r.login.identityKey, nonce: r.login.nonce, signature: r.login.signature, ticket: t.ticket });
      } else {
        // Paired, but no sign-in came with it (an older bWalletX): ask the paired wallet for it the usual way.
        let ticket = null;
        const s = await C.signInWithBwalletX({ wallet: r.wallet, challenge: async (identityKey) => { const ch = await post('/api/bwalletx/challenge', identityKey ? { identityKey } : {}); ticket = ch.ticket; return ch; } });
        v = await post('/api/bwalletx/verify', { identityKey: s.identityKey, nonce: s.nonce, signature: s.signature, ticket });
      }
      signedIn(v.identityKey, r.wallet, !!(t && t.next));
      const to = (t && t.next) || r.page;
      if (to) go(to);
      return true;
    } catch (e) {
      failed(e);
      return false;
    }
  }
  async function disconnect() {
    await post('/api/bwalletx/session', {}).catch(() => {});
    try { C.clearPairing?.(); C.rememberIdentity(null); } catch {}
    // Tell the bWalletX extension this site disconnected, so it stops wearing the site's theme.
    try { window.postMessage({ type: 'bwallet:disconnect' }, location.origin); } catch {}
    wallet = null; setKey(null);
    document.dispatchEvent(new CustomEvent('bjobsx-wallet', { detail: { identityKey: null } }));
  }
  // After a reload the session cookie says who you are, but bWalletX only wears this site's theme once the page has
  // talked to it. With an extension or in-app wallet, quietly ask for the identity key again (never pairs).
  const touch = async () => { try { const f = await C.discoverBwalletX?.(800); if (f && f.wallet) await f.wallet.getPublicKey({ identityKey: true }); } catch {} };
  // bjx-in: a hint for the home page that this browser is signed in (it hides the landing while the session is checked).
  const hint = (on) => { try { if (on) localStorage.setItem('bjx-in', '1'); else localStorage.removeItem('bjx-in'); } catch {} };
  // Signed in, every page but the home wears the home's top bar in place of the shell header (topbar.js; the home
  // draws its own in app.js). bjx-top is set before paint from the bjx-in hint (see build-shell.mjs).
  const root = document.documentElement;
  const top = (k) => {
    if (document.getElementById('app') && !document.querySelector('#app.ap-chrome')) return;
    if (!k && !root.classList.contains('bjx-top')) return;
    import('/topbar.js').then((m) => (k ? m.mount(k) : m.unmount())).catch(() => root.classList.remove('bjx-top', 'bjx-top-on'));
  };
  document.addEventListener('bjobsx-wallet', (e) => { hint(!!e.detail?.identityKey); top(e.detail?.identityKey || null); });
  window.bjxSignOut = disconnect;
  const session = () => fetch('/api/bwalletx/session', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { setKey(j.identityKey || null); hint(!!j.identityKey); top(j.identityKey || null); if (j.identityKey) touch(); }).catch(() => { top(null); draw(); });
  (C.hasReturnFragment?.() ? resumeReturned() : Promise.resolve(false)).then((done) => { if (!done) session(); });
  // Signed out and back on this tab (say, from bWalletX): the sign-in may have finished in another tab.
  document.addEventListener('visibilitychange', () => { if (!key && document.visibilityState === 'visible') session(); });
  draw();
})();
