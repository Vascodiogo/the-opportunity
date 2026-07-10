# CLAUDE-CORE.md — AuthOnce Session Context
> This file lives in Project Knowledge. It auto-loads every session.
> For GTM, legal, DataOnce, analytics, decisions log: upload CLAUDE-REFERENCE.md when needed.

---

## 1. Project Overview
**AuthOnce** — Non-custodial multi-token subscription protocol on Base Network.
**Tagline:** Authorize once. Pay forever. Stay in control.
**Domain:** authonce.io · **Target mainnet:** September 2026
**Founder:** Vasco (solo, Swiss/PT). Full-time employment in Switzerland (Hinti GmbH / Assa Abloy partner). Employer unaware of AuthOnce. Public builder identity: @VascoBuilds on X.
**Exit target:** €3–10M, retire at 54–55.
**Local project:** `C:\The-Opportunity\` (frontend: `C:\The-Opportunity\frontend`) — paste files, not synced here.
**Local docs:** `C:\AuthOnce-Docs\` — CLAUDE-CORE.md, CLAUDE-REFERENCE.md, BusinessPlan v2, FinancialProjections, TechnicalDocs, AuthOnce-InvestorQA-2026.docx.

---

## 2. Stack

| Layer | Technology | Status |
|---|---|---|
| Smart Contracts | Solidity 0.8.24 via **Hardhat** | ✅ Base Sepolia — EIP-2612 permit added June 30. SubscriptionVault verified on Basescan July 4 |
| Keeper Bot | Node.js on Railway | ✅ 20s polling, 5 parallel batch concurrency (June 30). `NotKeeper` revert fixed July 4 — constructor had passed deployer address as `_keeper` instead of keeper wallet; corrected via `setKeeper()` |
| Notifier | Node.js on Railway | ✅ Push Protocol + AI agent webhooks (June 28). v4.2 (July 4): persists `lastBlock` checkpoint to DB — prior version silently dropped any event during a restart window, with no error and no recovery. Also fixed `lastPulledAt` ReferenceError that had silently broken the 3-day payment reminder since inception |
| X Bot | Node.js on Railway | ✅ Mon/Wed/Fri 12:00 UTC |
| Backend API | Express.js on Railway | ✅ /api/subscriptions/link endpoint live |
| Database | PostgreSQL on Railway | ✅ subscriber_email, subscriber_webhook_url, is_contract_vault columns |
| Frontend | React + Vite on Cloudflare Pages | ✅ Live at authonce.io |
| Auth (subscriber) | Google OAuth via Passport.js | ✅ |
| Auth (merchant/admin) | MetaMask / RainbowKit + JWT | ✅ |
| Admin security | Cloudflare Access + rate limiting | ✅ |
| Fiat Onramp | Stripe Checkout (card/MB Way/Multibanco/SEPA) | ✅ Phase A built |
| Stripe Connect | Merchant OAuth flow | ✅ |
| Notifications | Resend + Push Protocol + webhooks | ✅ Branded HTML + wallet-native alerts |
| Custom Sender Domains | Resend domain API (Business+ tier) | ✅ |
| DNS | Cloudflare (authonce.io) | ✅ |
| Email receiving | Zoho — vasco@authonce.io | ✅ |
| Railway plan | Hobby ($5/month) | ✅ Active |
| Landing page | LandingPage.jsx — AI agent payments section + interactive product creator | ✅ June 28 |
| Blog | blog.authonce.io — 12 SEO-optimised articles | ✅ Sitemap valid XML |

---

## 2a. Contract Addresses

**Base Sepolia testnet — CURRENT (vault-only redeploy July 5 2026, adds agent pull cap):**
- SubscriptionVault: `0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d` — ✅ **verified on Basescan July 5** via Standard-JSON-Input, `input` object extracted from build-info wrapper (same method as July 4). Adds `maxAgentPullAmount` / `setAgentPullCap()` — see §Agent Pull Cap below. Confirmed via keeper set correctly (`check-keeper.js` ✅ MATCH) and on-chain test: subscription id 0 (50 USDC) and id 1 (199 USDC, exact cap) both succeeded; two attempts at 250 USDC never reached the chain (consistent with cap rejection, though the exact revert string was never directly captured — MetaMask smart-account wrapper transactions blocked inspection of the failed calls specifically).
- MerchantRegistry:  `0x393BA721aB45f4d4DaAC1B914e7F6377508C0299` — ⬜ **still not verified** — unchanged since July 4, reused as-is by the vault-only redeploy (not redeployed itself)
- USDC Sepolia:      `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Keeper wallet:     `0xdCEa737ec293DFF0B18C315CA90f494F8CB2C151`

⚠️ **Superseded July 5 — do not use for new subscriptions, do not reference in docs/blog/deck:**
- SubscriptionVault: `0x483f59367b2e5BEbbF33a6A110B1F1C42C706564` (July 4 — verified, but predates agent pull cap)

**Agent Pull Cap (`maxAgentPullAmount` / `setAgentPullCap()`):**
- Applies only to contract-wallet (ERC-1271) subscribers — EOA subscribers unaffected, checked once at creation via `_isContract(safeVault)`
- Starting value: `199_000000` (199 USDC, matches Business tier price)
- One-way ratchet — admin can only raise it, never lower it
- Admin control: no in-app write UI (dashboard is read-only for all contract state, by design) — `AdminDashboard.jsx` shows a static card with a direct Basescan `#writeContract` link, same pattern as `setKeeper`/`setFeeBps`
- **Known bug found and fixed July 5:** `AdminDashboard.jsx` and `LandingPage.jsx` both had their own separate hardcoded vault/registry addresses, not imported from `config.js` — three different wrong values across the two files (neither matching the June 30, July 4, or July 5 deployments). This means the agent-pull-cap admin card added earlier this session was silently pointing at the wrong contract from the moment it was built. **Structural fix applied, not just a value correction:** both files now `import { VAULT_ADDRESS, REGISTRY_ADDRESS } from "./config.js"` (or `"../config.js"` for `AdminDashboard.jsx`'s nested path) instead of maintaining their own copies. `config.js` is now the single source of truth — a future redeploy only requires updating it there, not hunting for every hardcoded copy across the frontend. Lesson: a variable's name is not proof of its value — always check the actual constant, don't assume a file imports correctly just because sibling files in the same codebase do.
- Protocol Treasury Safe: `0x737D4EeAEF67f776724482a29367615703A2DEB1`

⚠️ **These two addresses are dead — superseded June 30, confirmed via constructor-argument decode July 4. Do not reuse anywhere (docs, templates, saved preferences):**
- SubscriptionVault (June 14): `0xeb068B47731261F7B4A5ae8535686D67D7f72321`
- MerchantRegistry (June 14):  `0xAE681E431c353f5930dDFfBC74037d3f2afE3264`
- SubscriptionVault (June 30 first attempt): `0x2ED847da7f88231Ac6907196868adF4840A97f49`
- MerchantRegistry (June 30 first attempt):  `0xE62aF1DcADeF946ecC08978dec565344A63B8f9b`

**Base Mainnet (not yet deployed):**
- USDC:              `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- USDT:              `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`
- EURC:              `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42`
- SubscriptionVault: `[DEPLOY AND RECORD HERE]`
- MerchantRegistry:  `[DEPLOY AND RECORD HERE]`
- Protocol Treasury: `0x737D4EeAEF67f776724482a29367615703A2DEB1`

**Wallets:**
- Deployer:  `0xbb6d960b8671713bb92be92d03BE8d8165EE7782` — ⚠️ MetaMask smart account active, acts as contract-wallet on-chain. Use Rabby for subscriber testing.
- Keeper:    `0xdCEa737ec293DFF0B18C315CA90f494F8CB2C151`
- Subscriber test (Rabby): `0x128cE652e31Ef886376696Adf92ce6E36057c832`
- Push Channel: `0xd3350...2fd0e` (AuthOnce Push Channel, MetaMask)
- Protocol Treasury (Safe 2/2): `0x737D4EeAEF67f776724482a29367615703A2DEB1`
  - Signer 1: Ledger `0x94FD52B6a6FcAcCb41BBE5717264BC9e95a35B4a`
  - Signer 2: MetaMask `0x00df2Dbb2455C372204EdD901894E27281fA02C0`
  - Threshold: 2/2 — upgrade to 2/3 when sister added

⚠️ **Mainnet wallet balances:**
- Keeper `0xdCEa737...` — needs top-up to 0.05 ETH before mainnet
- Safe multisig `0x737D4...` — needs top-up to 0.05 ETH before mainnet

---

## 3. Locked Business Rules — Do Not Change

- **Multi-token** — USDC, USDT, EURC for subscriptions. DAI dropped (§21). WETH/cbBTC blocked until Chainlink oracle.
- Admin whitelist controls approved tokens. All whitelisted tokens available to all tiers.
- **Protocol fee: 0.5% global** — same for all merchants, all tokens, all tiers. Hard ceiling 2% hardcoded.
- **Fee is one-way ratchet** — can only be lowered, never raised. Enforced in setFeeBps().
- **Vault funded at exactly 1× subscription amount** — no over-funding, no balance, no refund UX.
- **Keeper bot is the only caller of `executePull()`** — signature: `executePull(id, deadline, signature)`
- **safeVault must equal msg.sender** — enforced in createSubscription() and createSubscriptionWithPermit().
- **EOA subscribers:** pass `deadline=0, signature="0x"` — ERC-1271 check skipped by contract.
- **EIP-712 + ERC-1271** — contract wallet / AI agent subscribers use structured pull authorisation.
- **EIP-2612 permit:** USDC and EURC support one-signature subscribe via createSubscriptionWithPermit(). USDT has no permit — always two-step fallback.
- **Protocol never holds funds** — non-custodial is non-negotiable, eliminates FINMA licence.
- **Payment token at signup = all future pulls** — token is immutable per subscription.
- **Merchant pays all fees** — subscriber always pays the exact price shown.
- **Grace period:** default 7 days, configurable 1–30 days per subscription, keeper retries daily.
- **Billing intervals:** Weekly / Monthly / Yearly — immutable after creation.
- **Cancellation:** vault owner or guardian only — merchant cannot block or delay.
- **Guardian can pause AND resume** — symmetric access enforced in contract.
- **Price changes:** `setProductExpiry()` enforces 30-day minimum notice on-chain.
- **Basic notifications free** on all tiers · Branded emails (Growth+) · Custom sender domain (Business+).
- **Subscriber notified 3 days before** each scheduled payment.
- **Subscriber portal login:** Google OAuth — no password, no wallet required.
- **DataOnce field:** `dataVaultId` (bytes32) on every subscription — Phase 2 placeholder, zero by default.
- **Tier enforcement is off-chain** — contract knows nothing about tiers. API + Stripe enforces.
- **Product limits:** 10 products per Starter merchant — enforced in API, not contract.
- **Self-serve merchant registration:** off by default (`selfServeEnabled = false`). Admin flips post-launch.
- **Two-step admin transfer** — both vault and registry use propose/accept pattern. No single-step transfer.
- **Stablecoin-only subscriptions** — WETH/cbBTC require Chainlink USD oracle. Planned future version.
- **Multi-currency fiat pricing** — 15 currencies: EUR, USD, GBP, CHF, BRL, CAD, AUD, SEK, NOK, DKK, SGD, HKD, INR, JPY, KRW. No RUB (OFAC).
- **Price type toggle** — merchant sets price in USDC (crypto) or fiat currency. Both supported.
- **Merchant pause cooldown** — 30-day cooldown + 90-day lifetime cap enforced in contract.
- **Blacklist mechanism** — permanently banned merchants cannot re-register.
- **MAX_MERCHANTS cap** — 10,000 merchants maximum in MerchantRegistry.
- **Fee-on-transfer tokens not supported** — admin whitelist enforces standard ERC-20 only.
- **Blog rule** — never name competing payment processors in blog content.

---

## 4. Backend File Map
```
scripts/
  keeper.js           — 20s poll, 5-parallel batch, executePull, expire grace (June 30)
  notifier.js         — Push Protocol wallet alerts + AI agent webhooks + email (June 28)
  api.js              — Express REST API + Google OAuth + Stripe + /api/subscriptions/link
  db.js               — PostgreSQL schema + subscriber_email + subscriber_webhook_url + is_contract_vault
  webhook.js          — HMAC-SHA256 dispatcher, branded fallback emails, 5-attempt backoff
  admin-auth.js       — JWT admin auth (email/password + rate limiting)
  email-templates.js  — Branded HTML email templates (all notification types, whitelabel)
  resend-domains.js   — Merchant custom sender domain management via Resend API
  deploy.js           — Hardhat deploy (MerchantRegistry → 20s delay → SubscriptionVault → 15s delay → tokens → auto-approve deployer on testnet)
  approve-token.js    — Whitelist USDC on new vault (run after deploy)
  approve-merchant.js — Approve deployer as first merchant on new registry (run after deploy)
  set-keeper.js       — Set correct keeper address on vault (run if deployer != keeper)
  x-bot.js            — X/Twitter bot (Mon/Wed/Fri 12:00 UTC)
```

**Keeper architecture:**
- Poll interval: 20 seconds
- Concurrency: 5 parallel pulls per batch (Promise.all)
- Builder code `bc_ca3k7b52` appended to executePull calldata for Base leaderboard attribution
- Scaling path: sequential (current, <20 merchants) → parallel EOAs → Gelato/Chainlink (>50 merchants)

**Notification routing priority:**
1. AI agent webhook (if subscriber_webhook_url set)
2. Subscriber email (if subscriber_email set)
3. Push Protocol wallet notification (always, for wallet-native subscribers)

**Stripe Checkout (Phase A):**
- `POST /api/stripe/checkout` — creates session with live CoinGecko fiat rate
- `checkout.session.completed` → subscriber wallet auto-created + admin vault funding email
- `payment_intent.payment_failed` → grace period + subscriber email
- `charge.dispute.created` → pauses subscription, notifies merchant
- SEPA mandate options + `setup_future_usage: "off_session"`
- Phase B (post-audit): automate treasury → vault USDC transfer

---

## 5. Frontend File Map
```
frontend/src/
  App.jsx                       — main app, light mode default, lang switching
  LandingPage.jsx               — AI agent payments section + interactive product creator + ROI calculator
  i18n.js                       — internationalisation (EN/PT)
  config.js                     — ABI (including createSubscriptionWithPermit), contract addresses
  components/
    Dashboard.jsx               — subscriber view
    MerchantDashboard.jsx       — merchant portal + VAT/country/billing fields
    PayPage.jsx                 — EIP-2612 permit flow (USDC/EURC one-signature) + two-step fallback (USDT) + subscriber email/webhook opt-in
    MySubscriptions.jsx         — subscriber portal
    AdminDashboard.jsx          — admin portal (10 tabs + GDPR pending + wallet balances)
    Pricing.jsx                 — pricing page
```
- Pay link URL: `authonce.io/pay/:merchantHandle/:productSlug` ✅
- Subscriber portal: `authonce.io/my-subscriptions` ✅
- Admin: `authonce.io/admin` — Cloudflare Access (vasco@authonce.io only) + JWT
- Light mode default · Dark mode toggle · Bilingual EN/PT · Deployed Cloudflare Pages

**EIP-2612 permit flow in PayPage.jsx:**
- USDC/EURC: `useSignTypedData` → EIP-712 Permit signature → `createSubscriptionWithPermit(v, r, s, deadline)` — one on-chain tx
- USDT: `approve()` → `createSubscription()` — two on-chain txs (fallback)
- Token domain: `{name: "USDC"/"EURC", version: "2", chainId: 84532}`
- Nonce read via `useReadContract` → `nonces(address)` on token contract
- Deadline: now + 30 minutes
- Auto-fallback: if permit signing rejected or permit() reverts, falls back to approve+subscribe silently
- UI: TrustRow shows "One signature" for USDC/EURC, "Two transactions" for USDT

---

## 6. Smart Contract — Key Functions

**SubscriptionVault.sol (current: June 30 deployment with EIP-2612):**

- `createSubscription(...)` — standard two-step (requires prior approve). Calls `_createSubscriptionInternal()`.
- `createSubscriptionWithPermit(... permitDeadline, v, r, s)` — calls token's `permit()` then `_createSubscriptionInternal()` atomically. Reverts with "PermitFailed" if token doesn't support EIP-2612. USDC + EURC only.
- `_createSubscriptionInternal(...)` — shared validation logic used by both entry points. Single auditable code path.
- `executePull(id, deadline, signature)` — keeper only. EOA: deadline=0, sig="0x". Contract wallet: ERC-1271 path (not yet in keeper).
- `expireSubscription(id)` — keeper only. Marks expired after grace period.

**Permit security notes:**
- `permit()` called with `owner = msg.sender`, `spender = address(this)` — signer must be the caller
- `value` = exact subscription amount, not unlimited approval
- Future pulls use existing `executePull()` allowance checks — no change to recurring security model
- USDT has no permit() — always two-step. DAI dropped entirely (§21) — never whitelisted, blocked on-chain by `decimals() == 6`.

**MAINNET DEPLOY WARNING:**
- Uncomment `require(_admin.code.length > 0)` in MerchantRegistry constructor before mainnet
- Deploy Safe multisig first, pass Safe address as `_admin`

---

## 7. Smart Contract Security Fixes (May 30 — all applied)

**SubscriptionVault.sol:**
- [H2] `require(safeVault == msg.sender)` — prevents unauthorised subscription creation
- [M1] One-way ratchet on `setFeeBps` — fee can only decrease
- [M2] CEI pattern in `executePull` — state updated before transfers
- [M3] SafeERC20 used for all token transfers
- [M6] Merchant pause cooldown (30 days) + lifetime cap (90 days)
- [M7] Merchant transfer uses try/catch — merchant cannot DoS pulls
- [V7-H2] prevLastPulledAt cached before state mutation in executePull
- [V7-P1] createSubscriptionWithPermit() + _createSubscriptionInternal() added June 30

**MerchantRegistry.sol:**
- [H1] `require(_admin.code.length > 0)` — commented out for Sepolia, MUST uncomment for mainnet
- [M2] Blacklist mapping added
- [M3] `setSelfServe()` no-op guard
- [L3] MAX_MERCHANTS = 10,000 cap
- [L4] `batchApproveMerchants()` + `batchRevokeMerchants()` added

---

## 8. Audit Status (June 30)

**Platform:** Areta Market — 6 proposals received

| Firm | Cost | Completion | Notes |
|---|---|---|---|
| Softstack | $4,600 | July 7 | ISO 27001, TÜV SÜD, 0 exploits, on Areta allowlist ⭐ |
| Hashlock | $5,000 | July 8 | Known relationship (Rafail), on Areta allowlist |
| Beosin | $8,000 | July 3 | |
| Nethermind | $9,000 | July 3 | Brand credibility |
| Composable | $11,000 | July 10 | |
| Statemind | $15,000 | July 6 | |

**Decision pending:** Waiting for Areta EF subsidy reply (follow-up sent June 30 to team@areta.io).
**If subsidy confirmed:** Accept Softstack ($4,600) — cheapest, ISO 27001 certified, on allowlist.
**If no reply in 48h:** Accept Softstack regardless — $4,600 is the most defensible choice.
**Funding reality:** No confirmed audit funding. Do NOT spend personal savings on audit.
**Inform winning auditor:** EIP-2612 `createSubscriptionWithPermit()` + `_createSubscriptionInternal()` added June 30 — must be included in audit scope.
**Hashlock reply (June 30):** Rafail following up, offering small discount. Replied: holding pending EF subsidy.

**Previous audit contacts (superseded by Areta):**
- Cyfrin: $12K proposal (old, no longer primary)
- Electisec, Sherlock, Hacken: contacted

---

## 9. Investment & Fundraising Status

**Raising:** €150,000 pre-seed · 10-15% equity
**Use of funds:** 40% audit (€60K) · 35% business co-founder (€52.5K) · 15% legal (€22.5K) · 10% operations (€15K)
**Status: ZERO active conversations. This is the real blocker.**

| Channel | Status |
|---|---|
| Mission Fund (Startup Portugal) | ✅ Submitted |
| OpenVC | ✅ Profile live |
| RR² Capital | ✅ Email sent — no reply |
| Nuno Correia (Utrust co-founder) | 🔄 Warm contact — first outreach target |
| 3 Comma Capital | ✅ Dealflow form submitted |
| Colin Armstrong / Paragraph | ✅ Email sent |
| Subvisual intro call | ✅ Done June 9 |
| Cuatrecasas Acelera | ✅ Applied |
| JoynIgnite | ⬜ Post-incorporation |
| Shilling Capital Partners | ⬜ Post-incorporation |
| BrainCapital | ⬜ Post-incorporation |

**Pitch deck:** `AuthOnce-PitchDeck-v4-2026.pptx` — 12 slides
**Target exit:** €3–10M acquisition in 3–5 years

---

## 10. Regulatory & Legal Status

| Item | Status |
|---|---|
| Banco de Portugal FinTech enquiry | ✅ Submitted — ref 2026/49323/000419 |
| IAPMEI consultation | ✅ Response received — referred to Banco de Portugal |
| Fio Legal — Patent Box | 🔄 €1,200+VAT offer pending decision |
| Company incorporation | ⬜ July 2026 — Empresa Online ~€180 |
| PME Certification | ⬜ Post-incorporation |
| Cuatrecasas Acelera | ✅ Applied |

---

## 11. Social & Community

| Channel | Status |
|---|---|
| authonce.io | ✅ Live |
| @VascoBuilds on X | ✅ Public builder identity |
| @AuthOnce on X | ✅ X bot Mon/Wed/Fri 12:00 UTC |
| @authonce on Farcaster (FID: 3324301) | ✅ Daily 12:00 UTC — 3-week rotation |
| LinkedIn company page | ✅ linkedin.com/company/authonce — Overview updated June 30, tagline set, auto-invite ON |
| blog.authonce.io | ✅ 12 articles, valid XML sitemap, submitted to Search Console |

**LinkedIn company page status (June 30):**
- Tagline: "Non-custodial USDC subscription billing on Base Network. Authorise once. Get paid every cycle. 0.5% flat. AI agent ready."
- Overview: full description written and set
- Workplace policy: Remote
- CTA button: Visit website → authonce.io
- 2 followers (new — invite credits available but personal profile has no connections to invite)
- Auto-invite engagers: ON

---

## 12. Merchant Pricing Tiers

| Tier | Price | Protocol fee | Features |
|---|---|---|---|
| Starter | Free | 0.5% on-chain | Full protocol, all tokens, webhooks, basic notifications |
| Growth | €49/month | 0.5% on-chain | + Branded emails, lower Stripe app fee |
| Business | €199/month | 0.5% on-chain | + Custom sender domain, advanced analytics |
| Enterprise | Custom | 0.5% on-chain | + Custom integrations, SLA, white-label |

20 Growth merchants = €980/month guaranteed before a single transaction.

---

## 13. Phase Status

| Phase | Description | Status |
|---|---|---|
| 0–4 | Contracts, Keeper, Backend, Webhooks, Frontend | ✅ Complete |
| 5a | Google OAuth subscriber auth | ✅ Complete |
| 5b | Stripe Checkout Phase A | ✅ Complete |
| 5c | Stripe webhook wiring | ✅ Complete |
| v5 | Multi-token, EIP-712, ERC-1271, DataOnce, external registry | ✅ Complete |
| 6 | Geofencing middleware (HTTP 451 OFAC) | ✅ Complete |
| 7 | Legal docs | 🔄 Pending |
| 8 | Smart contract audit | 🔄 Pending funds + EF subsidy reply |
| 9 | Safe multisig + Ledger | ✅ Complete |
| 10 | Subscriber portal | ✅ Complete |
| 11 | SEPA bank transfer | ✅ Complete |
| 12–13 | Security fixes + Sepolia redeploy | ✅ Complete |
| 14 | Landing page v3 | ✅ Complete |
| 15 | Pitch deck v4 | ✅ Complete June 30 |
| 16 | GDPR right to erasure | ✅ Complete |
| 17 | Railway service separation | ✅ Complete |
| 18 | EIP-2612 gasless permit | ✅ Complete June 30 |
| 19 | Push Protocol notifications + AI agent webhooks | ✅ Complete June 28 |
| 20 | Keeper 5x parallel throughput + 20s polling | ✅ Complete June 30 |
| 21 | Mainnet deployment | ⬜ Blocked by audit |

---

## 14. Pre-Mainnet Checklist

- [x] EIP-2612 permit — createSubscriptionWithPermit() live and tested ✅ June 30
- [x] Keeper 20s polling + 5 parallel batch ✅ June 30
- [x] Push Protocol wallet notifications ✅ June 28
- [x] AI agent webhooks ✅ June 28
- [x] PayPage permit flow with USDT/DAI fallback ✅ June 30
- [x] Blog 12 articles + valid XML sitemap ✅
- [x] Stripe Checkout Phase A ✅
- [x] SEPA + MB Way fixed ✅
- [x] Geofencing HTTP 451 ✅
- [x] Subscriber portal ✅
- [x] 3-day pre-payment notification ✅ **note: was silently broken since inception (ReferenceError), only actually functional as of July 4 fix — do not assume historical reminders were sent**
- [x] Admin dashboard 10 tabs ✅
- [x] Tax exports XLSX ✅
- [x] Multi-currency pricing 15 currencies ✅
- [x] Cloudflare Access on /admin ✅
- [x] Bot state PostgreSQL-backed ✅
- [x] Pay link step indicator — three-mode `PermissionSteps` component (permit / legacy-two-step / already-approved-direct), shown above Subscribe button ✅ July 4
- [x] SubscriptionVault verified on Basescan ✅ July 4
- [x] Keeper `NotKeeper` revert fixed — constructor had `_keeper` set to deployer address, not keeper wallet ✅ July 4
- [x] Notifier `lastBlock` checkpoint now persisted to DB — prevents silent event loss on every restart ✅ July 4
- [x] Wallet-connect + signature login added to `/my-subscriptions` — self-custody subscribers no longer require Google ✅ July 4
- [x] `/api/subscriber/subscriptions/:walletAddress` now requires signature or matching JWT — was previously open to any address in the URL ✅ July 4
- [ ] Smart contract audit — Softstack $4,600 pending acceptance
- [ ] Stripe Checkout Phase B — automate USDC transfer (post-audit)
- [ ] Subscriber import UI — CSV upload
- [ ] **MerchantRegistry verification on Basescan** — Vault done, Registry still pending
- [ ] **Backfill subscription id 2 into Postgres** — succeeded on-chain, never inserted due to notifier restart gap (fixed going forward, not retroactively)
- [ ] **Seal Railway secrets on the combined api.js/keeper.js service** (`node scripts/api.js & node scripts/keeper.js`, one service, one variable set) — 16 secrets baked into `ARG`/`ENV` per Nixpacks build log, full list in §21. **Highest priority: `DEPLOYER_PRIVATE_KEY` and `KEEPER_PRIVATE_KEY`** — wallet private keys slated for mainnet admin/keeper roles, not API keys. Remaining 12 (incl. `ENCRYPTION_KEY`, `RESEND_API_KEY`, `BASESCAN_API_KEY`) lower urgency. `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` also appear in the log but are stale — confirmed removed from Railway separately, post-dating this capture.
- [ ] Demo video — still not recorded (blocks Base grant nomination)
- [ ] Base grant nomination form — needs demo video
- [ ] CLAUDE-CORE.md update — this file ✅ done now
- [ ] Mainnet deployment — blocked by audit

---

## 15. Partnership Outreach Tracker

| Company | Contact | Channel | Status |
|---|---|---|---|
| CharmVerse | Alex Poon | Email sent June 10 | Awaiting reply |
| Snapshot Pro | Fabien | Email sent June 13 | Awaiting reply |
| Tally | Dennison (@frolic) | Email sent June 16 | Awaiting reply |
| DeepDAO | Eyal (@eithco) | Email sent June 19 | Awaiting reply |
| Boardroom | Kevin (@kevin_leffew) | Email sent June 22 | Awaiting reply |
| Dune Analytics | Fredrik (@hagaetc) | Email sent June 25 | Awaiting reply |
| Messari | Ryan (@twobitidiot) | Email sent June 28 | Awaiting reply |

**Next step for all:** Follow up via Discord (not email) — find partnerships/integrations channel per project.

---

## 16. Co-Founder Search

**Looking for:** Commercial co-founder — Web3 or fintech background, merchant acquisition, partnership development, investor relations.

| Platform | Status |
|---|---|
| CoFoundersLab | ✅ Profile created, 8 messages sent, Riccardo Ferighi replied |
| LinkedIn (Yanislava Hristova) | ✅ Message sent June 30 — talent partner, Web3/FinTech network |
| Top CoFoundersLab leads | Lauritz (Berlin) > Michaela (Glasgow, legal) > Maeve (London) > Andrea (London) > Riccardo (Milan) |

---

## 17. Session Summary — June 28–30 2026

**Contracts:**
- Added IERC20Permit interface, createSubscriptionWithPermit(), _createSubscriptionInternal() to SubscriptionVault.sol
- Redeployed contracts — final addresses: Vault `0x483f593...6564`, Registry `0x393BA721...0299`
- Verified on Sourcify (Sourcify brownout June 30 — Etherscan V2 pending)
- USDC approved on new vault ✅
- Deployer approved as first merchant ✅
- Keeper address set on new vault via set-keeper.js ✅
- Stale DB subscriptions cleared ✅

**Keeper:**
- 60s polling → 20s polling
- Sequential processing → 5 parallel batch (Promise.all)
- ~5x throughput improvement
- Builder code `bc_ca3k7b52` retained for Base leaderboard attribution

**Frontend:**
- PayPage.jsx: EIP-2612 permit flow with useSignTypedData, per-token routing, fallback to approve+subscribe for USDT/DAI
- config.js: new contract addresses + createSubscriptionWithPermit ABI
- LandingPage.jsx: AI agent payments section, interactive product creator, API code snippet

**Backend:**
- notifier.js: Push Protocol SDK, sendPushNotification(), sendAgentWebhook(), notifySubscriber() smart routing
- api.js: POST /api/subscriptions/link endpoint
- db.js: subscriber_email, subscriber_webhook_url, is_contract_vault columns

**Tested end-to-end (June 30):**
- Permit flow: Rabby wallet signed typed data → createSubscriptionWithPermit confirmed → keeper detected within 45s → subscription #0 active as EOA ✅
- MetaMask deployer wallet flagged as contract-wallet (ERC-1271) due to smart account feature — use Rabby for subscriber testing
- Transaction speed on Base Sepolia: ~8 seconds per confirmation
- Keeper cycle time: ~900ms per poll, 20s interval

**Blog:**
- 12 articles live at blog.authonce.io
- Sitemap rebuilt as valid XML — submitted to Search Console
- New article: ai-agent-trading-bot-payments.html

**Pitch deck v4:**
- Slide 2: "Stripe charges" → "Traditional processors charge"
- Slide 9: audit status updated, Push Protocol + AI webhooks added, blog updated to 12 articles

**LinkedIn (June 30):**
- Overview set, tagline set, workplace policy Remote, CTA button → authonce.io
- Auto-invite ON
- Message sent to Yanislava Hristova (co-founder search)
- Message sent to crypto investor (Kevin Miller) — identified as scam, ignored

**Audit:**
- Softstack proposal received ($4,600, July 7, ISO 27001, on Areta allowlist) — new cheapest option
- EF subsidy follow-up sent to team@areta.io June 30
- Hashlock follow-up received from Rafail — holding pending subsidy

**Pending items:**
1. Demo video — blocks Base grant nomination
2. Areta EF subsidy reply — 48h deadline before accepting Softstack regardless
3. Verify contracts on Basescan (retry July 1 after Sourcify brownout)
4. PayPage step indicator UI — show "1 free signature → 2 confirm transaction"
5. Blog post + X + Farcaster on EIP-2612 permit implementation
6. Partnership follow-ups via Discord
7. Start fundraising outreach — Nuno Correia first target
8. grace-periods.html — old contract addresses hardcoded, needs update
9. Landing page Basescan testnet banner link — points to old vault address

*Last updated: 2026-06-30*

---

## 18. Session Summary — July 4 2026

**Contracts:**
- SubscriptionVault verified on Basescan — required extracting Hardhat's raw `input` object from `artifacts/build-info/*.json` (the full build-info wrapper fails silently with empty bytecode; Basescan needs only `{language, sources, settings}`, not Hardhat's `{id, input, output, ...}` wrapper)
- MerchantRegistry still unverified — same process needed

**Critical bug found and fixed — `NotKeeper` revert on every pull:**
- Every `executePull()` call had been reverting since the June 30 redeploy — confirmed via constructor-argument decode: `_keeper` was mistakenly passed the deployer's own address (`0xbb6d960b...EE7782`) instead of the keeper wallet (`0xdCEa737e...C151`) at deploy time
- Fixed via `setKeeper()` on Basescan Write Contract, called from the deployer/admin wallet
- Verified fixed via a small standalone script (`check-keeper.js`) reading the public `keeper()` getter directly

**Critical bug found and fixed — silent event loss in notifier.js:**
- `lastBlock` (the poll checkpoint) only ever lived in memory — every restart reset it to "now," silently skipping any `SubscriptionCreated`/other events in the gap, with no error and no recovery
- This is why a real, on-chain-confirmed test subscription (id 2) never appeared in Postgres — notifier restarted between the transaction confirming and its next poll cycle
- Fixed: `lastBlock` now persisted to a new `notifier_state` table, reloaded on startup. Verified via restart log: `"Resumed from saved checkpoint: block ..."`
- Subscription id 2 itself was not backfilled — fix is forward-only

**Separate bug found in the same file — 3-day payment reminder silently broken since inception:**
- `checkUpcomingPayments()` referenced `lastPulledAt` without ever reading it from the on-chain struct — plain `ReferenceError`, caught and logged every cycle, meaning this notification has likely never successfully fired for any subscriber
- Fixed with a one-line addition: `const lastPulledAt = Number(onchain.lastPulledAt);`

**Frontend — permission step indicator (`PermissionSteps.jsx`), built and wired into `PayPage.jsx`:**
- Original ask was 2-step indicator (permit vs. legacy). Testing surfaced a third real code path: **already-approved / direct** — when USDC allowance is already sufficient, `handleApprove()` skips straight to `createSubscription()` with zero signing and zero approval step. Component now handles all three modes correctly, driven by actual `flowMode` state derived from existing variables (`tokenSupportsPermit`, `approveTxHash`, allowance check) — no new state added to `PayPage.jsx`

**Backend — subscriber identity gap closed:**
- `/my-subscriptions` previously hard-gated on Google OAuth — self-custody subscribers (the entire non-custodial value prop) had no path in at all, not even an empty list
- Added wallet-connect + free-signature login (`"AuthOnce: view my subscriptions (<timestamp>)"`, no gas, no transaction) as an equal path alongside Google, merging results from both sources
- `/api/subscriber/subscriptions/:walletAddress` was previously unauthenticated — any address in the URL returned that address's full subscription list. Now requires either a matching Google JWT or a verified signature, 5-minute replay window

**Custody model clarified (not yet resolved):**
- Google/fiat subscribers: AuthOnce's backend derives and holds a real private key per email (`generateSubscriberWallet()`), can sign transactions unilaterally — this is genuine custody, not just permission
- Self-custody (crypto) subscribers: unaffected, wallet never touches AuthOnce
- Three options discussed, not yet decided: (A) SIWE-based identity for self-custody subscribers — doesn't touch the custodial side; (B) third-party custody provider (Turnkey, Privy, Circle Programmable Wallets) for the fiat path — moves custody, doesn't eliminate it; (C) remove the on-chain wallet for fiat subscribers entirely, treat as pure off-chain Stripe billing — only option that is actually zero-custody
- Needs a real legal opinion before mainnet, not just an audit — current regulatory stance assumes non-custodial throughout, which is not true for the Google/fiat path today

**Infrastructure:**
- Docker/Nixpacks build warnings surfaced 4 secrets (`ENCRYPTION_KEY`, `PUSH_CHANNEL_PRIVATE_KEY`, `RESEND_API_KEY`, `BASESCAN_API_KEY`) baked into image `ARG`/`ENV` — this is inherent to how Railway's Nixpacks builder works for any Node service reading `process.env`, not a fixable misconfiguration. No Railway API/CLI mutation exists for sealing — dashboard-only, one-way, 3-dot menu → Seal. In progress. **Undercounted — see §21 for the corrected full list (16 secrets, including two wallet private keys) from a full build-log check.**
- `fix-keeper.js` found and deleted — targeted a wrong, unrecognized contract address (`0x55180314174B30e778f35357035d49cAEF55C835`), unrelated to any known deployment. Not needed; real fix done via Basescan directly.

**Faucet automation:**
- `fund-test-wallet.js` built using Coinbase CDP's official Faucet API (`cdp.evm.requestFaucet`) — legitimate, documented, rate-respecting automation, not a captcha/UI bypass
- Used to fund two test wallets with Base Sepolia ETH for permit-path vs. already-approved-path testing

**Pending items:**
1. MerchantRegistry verification on Basescan
2. Backfill subscription id 2 into Postgres, if wanted
3. Finish sealing the 4 Railway secrets across all services (not just notifier) — **see §21: actually 16, on one combined service, not 4 across 4 services**
4. Decide on custody model for fiat subscribers (A/B/C above) before mainnet
5. Confirm frontend push of `PayPage.jsx` / `PermissionSteps.jsx` / `MySubscriptions.jsx` actually reached Cloudflare
6. Legal review of non-custodial claim vs. actual fiat-path custody, ideally via Fio Legal
7. Everything carried over from June 30 session (demo video, audit funding, fundraising outreach) — unchanged, not addressed this session

*Last updated: 2026-07-04*

---

## 19. Session Summary — July 5 2026

**Custody pivot decided — full stablecoin, no fiat processor, permanently:**
- Decision: AuthOnce goes crypto-only. No Stripe, anywhere, for any purpose — including AuthOnce's own merchant SaaS tier billing (Growth/Business/Enterprise), which is now billed in USDC via AuthOnce's own protocol (AuthOnce as a merchant inside its own system)
- Fiat access, if built, is via onramp partner (Circle/Coinbase Onramp) delivering USDC directly to the subscriber's own wallet — AuthOnce never touches the fiat leg. **Not yet built** — Coinbase Onramp application still "Pending" as of this session
- Reasoning: closes the actual custody gap found July 4 (Google/fiat subscribers had a real custodial wallet + key, not just "less non-custodial") without needing a legal opinion on a hybrid model; shrinks audit scope; matches actual Day-1 GTM (Web3 SaaS, DAOs) already in this doc
- AI agent payments deliberately NOT promoted to Phase 2 — real institutional momentum (Visa, Mastercard, Coinbase, Stripe all shipped agent-payment infra in 2026) but near-zero actual volume industry-wide (~$28K/day on x402, largely gamed), and current standards (x402/AP2) are per-call micropayments, a different primitive from AuthOnce's recurring subscriptions. Stays Phase 3.

**New feature: Agent Pull Cap — built, deployed, verified, and tested on-chain this session.** See §2a for full detail. Starting value 199 USDC (Business tier), one-way-up ratchet, admin-controlled via Basescan (no in-app write UI, by design).

**Vault-only redeploy process established** — `scripts/deploy-vault-only.js`, reuses existing `MerchantRegistry` instead of redeploying it, avoiding re-approval of every merchant. Hard-fails if `KEEPER_ADDRESS` env var is missing (no silent fallback to deployer — this was the exact root cause of the June 30 `NotKeeper` incident). Warns (doesn't block) if `KEEPER_ADDRESS` doesn't match the known-correct keeper, in case of legitimate rotation.

**`.env` variable naming gotcha found:** `deploy.js`/`deploy-vault-only.js` read `KEEPER_ADDRESS`. A pre-existing `KEEPER_WALLET` variable (different name, different address — `0x08d3817E...`, itself unverified against Railway) was silently ignored by the deploy scripts, which would have re-triggered the deployer-as-keeper fallback bug on this redeploy if not caught. Fixed by adding `KEEPER_ADDRESS` explicitly; `KEEPER_WALLET` left in place in case something else reads it.

**RPC config bug found:** `hardhat.config.js` reads `BASE_SEPOLIA_RPC_URL` from `.env`; an existing value pointed at an Infura project without Base Sepolia enabled, blocking deploy entirely (`HH110` error). Fixed by clearing the variable, falling back to the public `sepolia.base.org` endpoint already used successfully all session.

**Verification repeated successfully** for the new vault (`0x0C8668dE...`), same method as July 4 — extract Hardhat's `input` object from `artifacts/build-info/*.json`, discard the wrapper, upload via Standard-JSON-Input. `npx hardhat verify` was tried first (config already had the Etherscan plugin set up) — succeeded on Sourcify, failed on Basescan itself due to a deprecated V1 API key format (Etherscan V2 migration needed) — not investigated further since the manual method is already proven faster.

**Real bug found in `AdminDashboard.jsx`, unrelated to anything built this session:** `VAULT_ADDRESS` and `REGISTRY_ADDRESS` were hardcoded locally in this file, not imported from `config.js` — and both were wrong, pointing at two previously-unseen stale addresses matching neither the June 30 nor July 4/5 deployments. This means the agent-pull-cap admin card added earlier in this same session was silently pointing at the wrong contract from the moment it was built, until caught and fixed. Lesson: a variable's name is not proof of its value — should have checked the actual constant, not assumed it matched `config.js` just because the pattern looked similar to other files that do import correctly (`PayPage.jsx`, `MySubscriptions.jsx` do import from `config.js`; `AdminDashboard.jsx` does not).

**On-chain proof method for MetaMask smart-account testing:** transaction-hash lookups (via MetaMask's own "view on explorer" link, or Basescan's Transactions tab) were unreliable for this specific wallet — repeatedly resolved to unrelated "Redeem Delegations" wrapper transactions instead of the actual contract call. Reading contract state directly (`subscriptions(id)` on Basescan's Read Contract tab) was the reliable method instead — confirmed subscription creation, exact amounts, and `isContractVault` flag directly, sidestepping the wrapper-transaction problem entirely. Worth using this method first for any future smart-account testing on this setup, rather than chasing transaction hashes.

**Pitch deck (v4) and public site content reviewed for the custody pivot** — landing page, `compliance.html`, `complete-guide.html`, `index-pt.html` all had Stripe/dual-fee/fiat-offloading language removed or rewritten. One **false compliance claim found and removed**: `compliance.html` asserted a "$200 pre-audit per-transaction cap hardcoded in the protocol" — checked against actual verified contract source, confirmed it never existed. Removed entirely rather than replaced, since no real mitigation existed to describe truthfully in its place.

**Pending items, carried and new:**
1. MerchantRegistry verification on Basescan — still not done, unchanged since July 4
2. Backfill subscription id 2 into Postgres (from July 4's notifier checkpoint gap) — still not done
3. Finish sealing the 4 Railway secrets across all services — status unconfirmed this session — **see §21: actually 16, on one combined service, not 4 across 4 services**
4. Legal review of non-custodial claim — now simpler given the full-stablecoin pivot decision, but still not started
5. Google for Startups Cloud Program — rejected for lacking a visible founder/team page with verifiable third-party links; reapply once landing page fixes are live and a real team page exists (not a jobs page — solo founder, jobs page would read worse than none)
6. Farcaster bot repeating content in rotation — reported, not yet investigated (need the actual bot script, not yet uploaded)
7. Confirm `config.js` itself has the new vault address — session ended before this was verified directly; check for the same hardcoded-vs-imported issue found in `AdminDashboard.jsx`
8. Update Railway env vars for `VAULT_ADDRESS` across all 4 services to `0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d` — user confirmed done this session, not independently verified

**Note on this file's size:** 547 lines / ~33KB / ~8,150 tokens as of this session, before this section. Not near any practical size limit for project knowledge. Worth considering, purely for human readability, whether older fully-closed session summaries (§17 particularly) could move to `CLAUDE-REFERENCE.md` or a dedicated archive file, keeping this file focused on current state rather than full history — a maintenance choice, not a technical requirement.

*Last updated: 2026-07-05*

---

## 20. Session Summary — July 5 2026 (continued)

**Confirmed done this session (commit hash cited for each):**

1. **Smart contract fixes SV-13 through SV-16** (`contracts/SubscriptionVault.sol`) — commit `fe74812`:
   - SV-13: permit-based subscriptions now grant `type(uint256).max` allowance via `permit()`, not just the one-cycle `amount` — fixes recurring pulls silently reverting after the first cycle for any permit-based subscriber.
   - SV-14: removed the dead, unused `SafeERC20` library.
   - SV-15: circuit breaker — auto-pauses a subscription after 3 consecutive merchant-transfer failures.
   - SV-16: `executePull()` now re-checks `MerchantRegistry.isApproved()` live on every pull — closes the gap where revoking/blacklisting a merchant had zero effect on subscriptions already created against them.

2. **Deleted the stale v4.0.0 `frontend/src/components/SubscriptionVault.sol`** — confirmed via full diff to have no functional relationship to the real deployed contract (single hardcoded USDC token, no EIP-712/ERC-1271/permit/MerchantRegistry, missing every v5–v7 security fix). Commit `6f0e3fb`.

3. **Added `CLAUDE.md`** to repo root for Claude Code session persistence. Commit `8e60e47`.

4. **Rotated the Postgres password** via Railway's Credentials-tab Regenerate button, after the previous password was pasted in plaintext into this chat session. Confirmed working — all 5 dependent services (API, keeper, notifier, farcaster-bot, Postgres itself) reconnected cleanly, verified via each service's own post-redeploy logs.

5. **Farcaster bot stale-rotation bug — root-caused and fixed.** Confirmed via Railway's own dashboard (Source Repo + Custom Start Command both point here) that the live farcaster-bot service (Root Directory: `farcaster/`) had been running `farcaster/farcaster-bot.js`'s old 21-post/3-week bank the entire time, while a fixed 28-post/4-week version sat unused in `scripts/farcaster-bot.js` since June 18. Merged the newer post bank into the live file, replaced ephemeral `/tmp` rotation state with a Postgres `farcaster_bot_state` table (same connection/query pattern as `scripts/db.js`, same checkpoint shape as `notifier.js`'s `notifier_state`), added a startup warning if `DATABASE_URL` is missing, deleted the now-redundant `scripts/farcaster-bot.js`. Commit `7bd4008`, confirmed pushed to `origin/main`.

**Still open — explicitly unresolved, not to be read as done:**

1. ~~Farcaster Railway service has **not** been redeployed/verified with the new code via fresh logs yet — last log checked predates this fix.~~ **RESOLVED — see §21.** Confirmed via fresh Railway logs: container start at 18:35 today logged "Post bank: 28 posts (4-week rotation)", no `DATABASE_URL` warning.
2. ~~`set-keeper.js` contains a hardcoded vault address (`0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d`) matching no known deployment. Never verified on-chain whether it even has contract code. Also violates the established Basescan-Write-Contract-only admin pattern — recommend deleting the script rather than fixing the address.~~ **RESOLVED — commit `a6b6420`:** file deleted.
3. ~~`package.json`/`package-lock.json` diff from an earlier accidental `git add -A` sweep was never actually reviewed. The `stripe` dependency is still listed despite the full-stablecoin custody pivot (§19) — unconfirmed whether it's dead weight or still imported in `api.js`/`webhook.js`.~~ **RESOLVED — see §21.** Diff reviewed: just `dotenv`/`ethers` version bumps plus the legitimate `@coinbase/cdp-sdk` addition, unrelated to Stripe. `stripe` itself was confirmed actively used (not dead weight), then removed entirely.
4. ~~A `stripe_check...` Postgres table and a separate `bot_state` table (distinct from the new `farcaster_bot_state`) exist in the database — purpose and ownership not investigated.~~ **RESOLVED.** Confirmed via direct query: only these two tables exist, no unexplained third table. `stripe_checkout_sessions` is leftover schema from the removed Stripe integration — harmless, inert. `bot_state` is the old pre-`farcaster_bot_state` key store, superseded but not cleaned up.
5. ~~DAI references found across 21 files (grepped and listed, not yet removed) — confirmed decision to drop DAI support entirely; removal itself not started.~~ **RESOLVED — see §21.** Removed across docs, config, backend, and frontend. `contracts/SubscriptionVault.sol` deliberately untouched — its `decimals() == 6` check in `approveToken()` already permanently blocks DAI (18 decimals) on-chain; no contract change needed.
6. ~~**Blocking dependency:** `PayPage.jsx`'s EIP-2612 permit signing still signs `amount` as the permit value, not `type(uint256).max` — must be fixed before SV-13 (above) reaches subscribers in practice, or every permit-based subscription will revert with a signature mismatch on the second pull.~~ **RESOLVED — commit `8092acf`:** permit `value` now signs `maxUint256`, matching the vault's on-chain call. Same commit also fixed the two-step `approve()` fallback (identical bug class, found separately) to request a standing allowance instead of the per-cycle amount.
7. ~~`keeper.js` has no backoff logic for repeated `MerchantNotApproved` (SV-16) or `MerchantTransferFailed` (SV-15) events — will retry every 20s indefinitely against a merchant that stays unapproved/failing.~~ **RESOLVED — see §21.** Commit `6686fc7`.
8. **Still open, claim corrected.** No `Dockerfile` exists anywhere in this repo (farcaster-bot builds via Nixpacks, confirmed in `farcaster/railway.json`) — the original "Dockerfile declares..." framing was inaccurate. What's actually confirmed: Railway's Variables tab for the live farcaster-bot service still has `ANTHROPIC_API_KEY`, `APPROVAL_EMAIL`, and `APPROVAL_SECRET` set (checked directly), none of which `farcaster/farcaster-bot.js` reads — grepped the whole repo, all three appear nowhere in code. Confirmed harmless (unused) but not yet removed. Near-certainly leftover from the separate `C:\farcaster-bot` repo's design (which does use `@anthropic-ai/sdk` and an approval-email flow) — low-priority Railway cleanup, not a functional bug.
9. Three local directories confirmed distinct: `C:\The-Opportunity` (this repo), `C:\farcaster-bot` (separate `authonce-farcaster-bot.git` repo, not connected to any live Railway service, likely dead), `C:\AuthOnce-Deploy` (not a git repo at all — stale static Netlify mirror, safe to delete given Netlify is fully decommissioned).
10. ~~Stripe removal — decided but not executed. `api.js` still has six live call sites (Checkout session creation, Connect OAuth onboarding, account retrieval, disconnect, webhook signature verification) despite the July 5 crypto-only decision (§19). Needs a deliberate removal pass, not a quick strip — check what currently depends on these endpoints (frontend checkout flow, merchant onboarding UI) before removing.~~ **RESOLVED — see §21.** Commits `2a90abd` (api.js) and `f9aeee0` (frontend).

*Last updated: 2026-07-05*

---

## 21. Session Summary — July 7 2026

**Stripe fully removed from the codebase — decided July 5 (§19), executed this session.**

Before touching code, confirmed via direct DB query that removal was safe: `stripe_checkout_sessions` had 5 rows, all `status = 'pending'`, zero `completed`; a join against `subscriptions` returned 0 — no on-chain subscription ever originated from a Stripe checkout. This is what allowed removing the webhook handler too, not just the forward-looking entry points.

**`scripts/api.js`** — commit `2a90abd`. Removed all six call sites: Checkout session creation, all four Connect OAuth routes (authorize/callback/status/disconnect), and the webhook handler (signature verification + ~350 lines of event-type handling). Also removed helpers left with zero remaining callers once those routes were gone — found during execution, not part of the original plan: `getFiatToUsdcRate`/`getEurToUsdcRate`, `usdcToStripeAmount`, `fiatToUsdc`, and `sendBrandedEmail`. That last one was double-checked separately before committing, since its generic name suggested it might be the real notification path for payment reminders/confirmations — confirmed via full-repo search it was Stripe-webhook-exclusive the whole time, never imported or called anywhere else; the actual reminder/confirmation emails live entirely in `notifier.js`/`email-templates.js`, untouched. `checkLoginRateLimit`, which happened to sit in the same file region as the Stripe `require`, was preserved unchanged. DB schema (`stripe_checkout_sessions` table, `merchants.stripe_account_id`/`stripe_connected_at` columns) deliberately left alone this pass — app code only. `stripe` removed from `package.json`, lockfile regenerated via `npm install`.

**`MerchantDashboard.jsx` + `Pricing.jsx`** — commit `f9aeee0`. Removed the account-level Stripe Connect settings card (state, effects, connect/disconnect handlers) and both fiat-payment-method checkbox grids (product create + edit forms). One deliberate deviation from the original 3-zone plan, decided via a direct question mid-execution: the "Settlement currency" selector was nested inside the fiat-methods block being deleted, but it isn't actually Stripe-specific — it drives `product.fiat_currency` for price *display*, independent of payment method, matching the separate "Multi-currency fiat pricing" business rule (§3). Kept it, ungated from `hasFiatMethods` so it's always visible instead of only appearing once a fiat method was selected, relabeled "Price display currency" in both forms. `Pricing.jsx`: removed the "Stripe fiat onramp" Growth-tier bullet, EN and PT.

**Bug caught during execution, not before:** the edit-form JSX edit initially left an orphaned closing `</div>` (the original block's outer wrapper close wasn't accounted for when the replacement text supplied its own). This broke `npm run build` with a confusing esbuild error ("Unterminated regular expression") that didn't obviously point at the real cause. Fixed, then re-verified with a full production build before committing — passed clean. Worth remembering: a JSX brace/tag mismatch from a block deletion can surface as an unrelated-sounding esbuild error, not a clean "mismatched tag" message.

**Farcaster redeploy also confirmed this session** (§20 item 1, now resolved): fresh Railway logs checked directly — container start at 18:35 today logged `"Post bank: 28 posts (4-week rotation)"` with no `DATABASE_URL` warning, confirming both the post-bank merge and the Postgres-backed rotation state (`7bd4008`) are live and working as deployed, not just committed.

**Railway secrets baked into ARG/ENV — corrected count: 16, not 4, and it's one combined service, not "all 4 services."** There is no dedicated keeper service — the actual Railway start command is `node scripts/api.js & node scripts/keeper.js`, both processes running together in one service sharing one variable set. That's why `DEPLOYER_PRIVATE_KEY` and `KEEPER_PRIVATE_KEY` appear together: not two services each with one key, one service with both. Full list, from the service's Nixpacks build log (`SecretsUsedInArgOrEnv` warnings, ARG and ENV, lines 11-12):

`ADMIN_PASSWORD`, `ADMIN_SECRET`, `BASESCAN_API_KEY`, `DEPLOYER_PRIVATE_KEY`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `KEEPER_PRIVATE_KEY`, `RESEND_API_KEY`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`, `TWITTER_API_KEY`, `TWITTER_API_SECRET`.

**Highest priority for Seal: `DEPLOYER_PRIVATE_KEY` and `KEEPER_PRIVATE_KEY`.** These are wallet private keys, not API keys — the actual admin and keeper wallets slated for mainnet roles. A leaked API key is revocable with a bounded blast radius; a leaked deployer or keeper private key is a wallet compromise. Seal these two first, independent of when the remaining 14 get done.

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are stale in this list — this build predates the Stripe removal (above, commits `2a90abd`/`f9aeee0`), and the Railway env vars themselves have since been confirmed removed separately. Not still exposed, despite appearing in the log.

**`keeper.js` stats-accuracy bug fixed, `MerchantNotApproved` backoff added** — commit `6686fc7` (§20 item 7, now resolved). Previously, any confirmed `executePull` transaction was unconditionally counted as a successful pull and logged as `"success"` — even when the contract's internal logic caused it to skip payment without reverting (SV-15 `MerchantTransferFailed`, SV-16 `MerchantNotApproved`, or a pause/expiry path). Heartbeat stats and pull-attempt logs were silently inaccurate for all of those cases. Now decodes the actual emitted event via `vault.interface.parseLog()` and only counts a genuine `PaymentExecuted` as a real pull; everything else is logged accurately as skipped with the real event name.

Also added: in-memory backoff specifically for `MerchantNotApproved` — after 3 consecutive occurrences per subscription, skip attempting it for 10 minutes instead of retrying every 20s. Not persisted to DB, resets on keeper restart — harmless, since the contract's SV-16 re-check already guarantees correctness regardless of keeper behavior. `SV-15` (`MerchantTransferFailed`) was deliberately left without keeper-side backoff, since the contract's own circuit breaker (auto-pause after 3 failures) already bounds it — a second backoff layer on top would be redundant.

**Pending items, carried and new:**
1. Only §20 item 8 remains genuinely open (Railway env var cleanup, low priority — see item 8 itself for the corrected claim). Item 9 is informational, not an action item. Items 1, 2, 3, 4, 5, 6, 7, and 10 are all resolved (1, 3, 4, 7, 10 this session or later; 2 and 6 predate it, in commits `a6b6420` and `8092acf`; 5 resolved in the DAI removal commits).
2. ~~Seal `DEPLOYER_PRIVATE_KEY` and `KEEPER_PRIVATE_KEY` on the combined api.js/keeper.js Railway service — highest priority, not yet done.~~ **RESOLVED.** Both sealed on Railway. Remaining 12 secrets (`ADMIN_PASSWORD`, `ADMIN_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `RESEND_API_KEY`, `SESSION_SECRET`, `BASESCAN_API_KEY`, `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`) still need sealing but lower urgency. `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` no longer relevant — confirmed removed.
3. ~~Confirm `STRIPE_CONNECT_CLIENT_ID` removal status on Railway — unconfirmed either way.~~ **RESOLVED.** Confirmed removed from Railway (verified directly). All three Stripe env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`) are now off the service.
4. Two leftover `grep -r` background shells from double-checking `sendBrandedEmail` were left running against `node_modules` for longer than intended — killed manually, no actual impact, but a reminder to prefer the `Grep` tool over `Bash grep -r` for whole-repo searches to avoid this.

*Last updated: 2026-07-07*

---

## 22. ERC-1271 Automated Signing (Keeper v6.1) — Deliberately Deferred

**Status:** Deferred, not a bug.

**Reason:** All current testnet subscriptions are internal testing only — no real merchants or AI-agent subscribers exist yet. The two contract-wallet subscriptions (IDs 0, 1) were confirmed self-subscription test artifacts (owner == merchant == safeVault, all the deployer wallet `0xbb6d960b...EE7782`) — `isContractVault = true` was set because MetaMask's smart-account feature makes that wallet appear as a contract on-chain, not because of any real contract-wallet subscriber. Both cancelled and verified via Basescan's Read Contract tab — `subscriptions(0)` and `subscriptions(1)` both show `status: 2` (Cancelled), checked directly rather than trusted from the transaction page, which showed a misleading "Redeem Delegations" wrapper call — the same known MetaMask smart-account quirk already documented from the July 5 session (§19).

**Decision:**
- `isValidSignature()` verification remains correctly implemented in `SubscriptionVault.sol` — no contract changes needed.
- No automated signing path (webhook-based agent signing, or session-key delegation) will be built until a real integration partner requires it.
- When a real partner appears: the implementation choice depends on their wallet standard. Single-owner ERC-1271 (agent backend signs directly) is the cheapest and most common near-term pattern — build that first. Safe modules or ERC-4337 session-key support only if a specific partner using those standards appears.

**Revisit trigger:** Real AI-agent or smart-wallet integration request.

---

## 23. Subscription IDs #2, #3, #4 — Investigation Correction and Fix

**What actually happened:** subscriptions #2, #3, #4 in Postgres are real historical test data from June 30, 2026 — genuine completed payments from real keeper test runs, confirmed by cross-checking the `payments` table. They are **not** stale references to the dead June 14 test vault (`0xeb068B47...`), which was the initial working theory.

**The investigation mistake:** an earlier pass matched these three IDs to unrelated June 14 stress-test data by coincidence of shape alone — same subscription amount, same interval, same EOA-owner-equals-safeVault pattern — without checking the one field that actually disambiguates two on-chain events with the same ID: the transaction hash. A `tx_hash` comparison would have shown immediately that they didn't match. Lesson: matching shape (amount/interval/structure) is not the same as matching identity — two unrelated batches of test data can easily look identical by construction. The unique identifier (tx hash, block) has to be checked directly, not inferred from pattern resemblance, before concluding two records are the same event.

**Root cause of the actual bug:** these three subscriptions genuinely exist, with real payment history, but on an old, superseded vault deployment — not the current live vault (`0x0C8668dE...`). `keeper.js`'s DB-driven scan (`getSubscriptionIds()`) doesn't filter by vault (the `subscriptions` table has no `vault_address` column at all — single-vault schema), so it was handing IDs 2/3/4 to the keeper every cycle, which then read them against the *live* contract. Since those IDs don't exist there, the live vault returned a zero-value struct — and `status` defaults to `0`, which is `STATUS.Active` in the keeper's enum. The keeper treated a nonexistent subscription as genuinely active, proceeded to call `isDue()`/`nextPullAmount()` etc. against it, and hit `CALL_EXCEPTION` on downstream calls involving the zero-address `token` field. This fired every single cycle.

**Fix applied:** updated `status` to `'cancelled'` for IDs 2, 3, 4 directly in Postgres — **not deleted**, preserving the real payment history that belongs to them. `getSubscriptionIds()` only selects `status IN ('active', 'paused')`, so cancelling them removes them from the keeper's scan without destroying data.

**Confirmed fixed via fresh keeper logs:** DB scan now reports 0 active/paused subscriptions, no more `CALL_EXCEPTION` errors, clean ~435ms cycles.
