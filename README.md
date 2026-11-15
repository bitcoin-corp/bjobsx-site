# bJobsX.com

**Licence: [Open BSV License version 4](LICENSE)**, © The Bitcoin Corporation Ltd. (GitHub labels it "Other" because it is not on GitHub's standard licence list.)

The website for **bJobsX**, bjobsx.com: Work, paid in Bitcoin.. Part of the bWalletX family, by The Bitcoin Corporation Ltd (company no. 16735102).

Live at https://bjobsx.com. Deploys from `main` on Vercel.

## Public profiles live on chain

bJobsX hosts no profile data. **Publish** on /studio writes one transaction from the owner's BRC-100 wallet: an OP_RETURN with only the ticked sections (`B <json> application/json utf-8 | MAP SET app bjobsx type profile v 1 | BRC3 <identityKey> <signature>`), plus 1 sat to the owner's profile key and 1 sat to the bJobsX directory address so address indexes can find it. The signature is BRC-3 (`[2,'bjobsx records']`, keyID `public profile`, counterparty `anyone`), so anyone can check the identity key signed exactly that JSON. /u/<name> and Browse read the newest valid one from chain through WhatsOnChain (`api/_chain.js`). The push server keeps only usernames. Format and helpers: `mint/records.js`; tests: `test/profile-chain.test.mjs`.

## One shell on every page

The strip, header (Jobs, People, Your profile, a gold **Post a job**, Connect) and footer are written once in `scripts/build-shell.mjs` and stamped into every page between `<!-- shell:… -->` markers. Change them there and run `pnpm shell`; `test/shell.test.mjs` fails if a page is out of date or missing them. A new page goes in `PAGES`. Styles: `shell.css`.

## Posting a job (/post)

`/post` is the job form, with a live preview of the `/contracts` card. The draft stays in the browser (`localStorage`) until it's sent. Sending goes through `lib/post-client.js` to the bit-sign registry: `POST <CONTRACTS_POST_API>/api/bitsign/contracts` (pending review). Set `CONTRACTS_POST_API` (https) and optionally `VERIFF_URL` on Vercel; `GET /api/post-config` hands them to the page. With `CONTRACTS_POST_API` unset, nothing is sent and Send says "Posting opens soon". The rules are on `/what-you-can-post`.
