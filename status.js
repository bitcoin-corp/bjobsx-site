// The Live / Coming checklist, shared by the home page and the profile page. Rows that depend on the server are
// checked live: sign-in (session secret set), publishing + Browse (push /v1/job-profiles deployed), real minting (payee set).
// bWalletX must pin [2,'bjobsx records'] to bjobsx.com (pinnedProtocols v3) before real mints can run. Flip when shipped.
export const WALLET_PIN_SHIPPED = false;
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const j = (u) => fetch(u, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);

export async function state() {
  const [s, b, c] = await Promise.all([j('/api/bwalletx/session'), j('/api/browse'), j('/api/mint/config')]);
  return { signIn: !!s && !s.off, publish: !!b?.live, payee: !!c?.payee };
}

export async function checklist(el, st) {
  if (!el) return;
  const x = st || await state();
  const rows = [
    ['Connect bWalletX (your $name, never your key)', x.signIn],
    ['Import the LinkedIn export ZIP or CSVs, read in your browser', true],
    ['See your profile: headline, positions, education, skills', true],
    ['Choose which sections are public (all private by default)', true],
    ['Your public page at bjobsx.com/u/your-name', x.publish],
    ['Pick your own username', x.publish],
    ['Browse public profiles', x.publish],
    ['Mint a dry run (your wallet encrypts, nothing is sent)', true],
    ['Mint private records on chain, 1p each, checked on chain before Done', x.payee && WALLET_PIN_SHIPPED],
    ['Make a minted record public', x.payee && WALLET_PIN_SHIPPED],
    ['Video walkthrough for the LinkedIn export', false],
    ['Paid work board (bwalletx.com/jobs)', true],
  ];
  el.innerHTML = rows.map(([t, live]) => `<li><span>${esc(t)}</span><span class="badge ${live ? 'live' : 'coming'}">${live ? 'Live' : 'Coming'}</span></li>`).join('');
}
