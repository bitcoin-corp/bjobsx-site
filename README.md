# bJobsX.com

**Licence: [Open BSV License version 4](LICENSE)**, © The Bitcoin Corporation Ltd. (GitHub labels it "Other" because it is not on GitHub's standard licence list.)

The website for **bJobsX**, bjobsx.com: Work, paid in Bitcoin.. Part of the bWalletX family, by The Bitcoin Corporation Ltd (company no. 16735102).

Live at https://bjobsx.com. Deploys from `main` on Vercel.

## Public profiles live on chain

bJobsX hosts no profile data. **Publish** on /studio writes one transaction from the owner's BRC-100 wallet: an OP_RETURN with only the ticked sections (`B <json> application/json utf-8 | MAP SET app bjobsx type profile v 1 | BRC3 <identityKey> <signature>`), plus 1 sat to the owner's profile key and 1 sat to the bJobsX directory address so address indexes can find it. The signature is BRC-3 (`[2,'bjobsx records']`, keyID `public profile`, counterparty `anyone`), so anyone can check the identity key signed exactly that JSON. /u/<name> and Browse read the newest valid one from chain through WhatsOnChain (`api/_chain.js`). The push server keeps only usernames. Format and helpers: `mint/records.js`; tests: `test/profile-chain.test.mjs`.
