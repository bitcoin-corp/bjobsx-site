// GET /api/mint/config -> what the mint step needs, fresh (no CDN cache):
//   { payee, premiumGbpPerItem, perTx, feeSatPerKb, usdPerBsv, usdPerGbp }
// payee is the bCorp receive address for b's premium, from BJOBSX_PREMIUM_ADDRESS (Vercel env, never in source).
// While it is unset, payee is null and the page refuses real writes (fails safe); dry runs still work.
import { rates } from '../_lib.js';

export const MINT = { premiumGbpPerItem: 0.01, perTx: 25, feeSatPerKb: 100 };

export default async function handler(req, res) {
  const addr = (process.env.BJOBSX_PREMIUM_ADDRESS || '').trim();
  const r = await rates();
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ payee: /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr) ? addr : null, ...MINT, ...r });
}
