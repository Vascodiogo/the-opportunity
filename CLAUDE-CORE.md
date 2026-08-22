# CLAUDE-CORE.md — AuthOnce Session Context
> This file lives in Project Knowledge. It auto-loads every session.
> For GTM, legal, DataOnce, analytics, decisions log: upload CLAUDE-REFERENCE.md when needed.

---

## 1. Project Overview
**AuthOnce** — Non-custodial multi-token subscription protocol on Base Network.
**Tagline:** Authorize once. Pay forever. Stay in control.
**Domain:** authonce.io · **Mainnet target:** not yet set — pending audit completion
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

**Base Sepolia testnet — CURRENT (v9, deployed + verified Aug 9 2026):**
- SubscriptionVault: `0xDd41E5C83d000ff63d3e9E8cBBD79609b7029d3C` — ✅ **verified on Basescan, Exact Match**, v0.8.24+commit.e11b9ed9, optimizer 200 runs, paris. Adds [SV-21] two-step merchant payout rotation (`proposeMerchantChange`/`acceptMerchantChange`/`cancelMerchantChange`, requires new address already MerchantRegistry-approved at both steps) and a permit front-running fix (`createSubscriptionWithPermit`'s catch block no longer hard-reverts on a stale/front-run permit signature — falls through to the existing allowance check instead). Both fixes tested live end-to-end on-chain: permit fix proven via nonce evidence (front-run simulation script), merchant rotation proven via a real propose→accept cycle between two test merchant wallets, confirmed via direct contract-state reads.
- MerchantRegistry:  `0x393BA721aB45f4d4DaAC1B914e7F6377508C0299` — ✅ **verified on Basescan July 22 2026, Exact Match** — unchanged, reused as-is by v9 (not redeployed). See §24
- USDC Sepolia:      `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Keeper wallet:     `0x6F76FF4f2d759620eDC3870f286823Eb0A7E0536` — **note: this is a DIFFERENT address than the `0xdCEa737e...C151` keeper documented elsewhere in older sections of this file.** The keeper wallet was legitimately rotated at some point between sessions; confirmed correct via a live on-chain `keeper()` read against the v8 vault before the v9 deploy. If `0xdCEa737e...C151` appears anywhere else in this doc, it's stale.
- Full cutover confirmed live Aug 9 2026: `config.js` (frontend), `authonce-keeper`, and `authonce-notifier` Railway env vars all updated to the v9 address, all confirmed via fresh boot logs. Keeper's first post-cutover cycle correctly pulled a payment to a rotated merchant, confirming the whole pipeline reads live on-chain state correctly.
- **Admin (as of Aug 9 2026):** Treasury Safe `0x737D4EeAEF67f776724482a29367615703A2DEB1` — transferred from deployer wallet via two-step propose/accept (`proposeAdminTransfer`/`acceptAdminTransfer`), verified via direct `admin()` read on Basescan, not trusted from any UI. See §36 for full detail. MerchantRegistry admin unchanged — still the deployer wallet (`0xbb6d960b...EE7782`), deliberately deferred to mainnet, not testnet-rehearsed.

⚠️ **Superseded Aug 9 2026 — do not use for new subscriptions, do not reference in docs/blog/deck:**
- SubscriptionVault (v8, vault-only redeploy July 5 2026, agent pull cap): `0xd6377Fa4809C4b745F5F1801193e5a90cD4AAE26` — was "CURRENT" from July 5 through Aug 9. ✅ verified on Basescan July 5, Exact Match. Adds `maxAgentPullAmount` / `setAgentPullCap()` — see §Agent Pull Cap below (mechanism unchanged in v9, this section still applies). Confirmed via keeper set correctly (`check-keeper.js` ✅ MATCH) and on-chain test: subscription id 0 (50 USDC) and id 1 (199 USDC, exact cap) both succeeded; two attempts at 250 USDC never reached the chain (consistent with cap rejection, though the exact revert string was never directly captured — MetaMask smart-account wrapper transactions blocked inspection of the failed calls specifically).

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
- Keeper:    `0x6F76FF4f2d759620eDC3870f286823Eb0A7E0536` (rotated at some point since the June 30 deploy — the `0xdCEa737e...C151` value below/elsewhere is stale; see v9 note in §2a for how this was confirmed)
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

**STATUS AS OF LATEST CHECK: still the accurate, current state — see also the correction to §38's audit-vendor claim, which was wrong.**

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

**Raising:** $150,000 pre-seed · 10-15% equity
**Use of funds:** 15% audit ($22.5K) · 50% business co-founder ($75K) · 20% legal ($30K) · 15% operations ($22.5K)
**Note:** corrected to match the later, verified figure (§38, Aug 16 2026) — this section was previously stale.
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
- [x] **MerchantRegistry verification on Basescan** ✅ **July 22 2026** — Exact Match, not just partial. See §24
- [ ] **Backfill subscription id 2 into Postgres** — succeeded on-chain, never inserted due to notifier restart gap (fixed going forward, not retroactively)
- [x] **Seal Railway secrets across all 6 real services** ✅ **July 23 2026** — all 16 secrets sealed and verified via fresh post-redeploy logs. §21's "one combined service" description was wrong — see §25 for the corrected 6-service architecture and full seal confirmation.
- [ ] Demo video — still not recorded (blocks Base grant nomination)
- [ ] Base grant nomination form — needs demo video
- [ ] CLAUDE-CORE.md update — this file ✅ done now
- [ ] Mainnet deployment — blocked by audit
- [ ] **USDT checkbox in `MerchantDashboard.jsx` should be disabled/grayed out with a "not available on this network" tooltip** when the token isn't in the network's configured list — currently low priority since it's testnet-only (no Sepolia USDT deployment exists). Revisit if worth doing before mainnet, or handle at mainnet launch once USDT is actually whitelisted there.
- [x] **Dead Stripe/non-crypto payment path + "Crypto discount" feature removed** ✅ **Aug 2 2026** — `PayPage.jsx`: deleted the payment-method selector, the `/api/stripe/checkout` call, and all discount/fiat-currency-symbol math. `MerchantDashboard.jsx`: removed the "Crypto discount" toggle and dead `paymentMethods` state (no real fiat-method UI existed — it was plumbing only) in both the create and edit forms. `api.js`: stripped `crypto_discount_pct` from all request/response bodies; removed the now-orphaned `GET /api/products/:merchantAddress/:productSlug/payment-methods` endpoint along with `COUNTRY_METHODS`, `EU_COUNTRIES`, `getMethodsForCountry()`, and the `stripe_account_id` fiat-stripping guard; stripped stale fiat method names and `dai` out of both product-endpoint whitelists (now `["crypto","usdc","usdt","eurc"]`). `products.crypto_discount_pct` DB column left in place unused (defaults to 0, no migration needed). Existing products with legacy fiat `payment_methods` entries (the 5 test-wallet products) will have those silently dropped next time they're edited and saved. Production build verified clean.

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
4. A `stripe_check...` Postgres table and a separate `bot_state` table (distinct from the new `farcaster_bot_state`) exist in the database — purpose and ownership not investigated.
5. ~~DAI references found across 21 files (grepped and listed, not yet removed) — confirmed decision to drop DAI support entirely; removal itself not started.~~ **RESOLVED — see §21.** Removed across docs, config, backend, and frontend. `contracts/SubscriptionVault.sol` deliberately untouched — its `decimals() == 6` check in `approveToken()` already permanently blocks DAI (18 decimals) on-chain; no contract change needed.
6. ~~**Blocking dependency:** `PayPage.jsx`'s EIP-2612 permit signing still signs `amount` as the permit value, not `type(uint256).max` — must be fixed before SV-13 (above) reaches subscribers in practice, or every permit-based subscription will revert with a signature mismatch on the second pull.~~ **RESOLVED — commit `8092acf`:** permit `value` now signs `maxUint256`, matching the vault's on-chain call. Same commit also fixed the two-step `approve()` fallback (identical bug class, found separately) to request a standing allowance instead of the per-cycle amount.
7. ~~`keeper.js` has no backoff logic for repeated `MerchantNotApproved` (SV-16) or `MerchantTransferFailed` (SV-15) events — will retry every 20s indefinitely against a merchant that stays unapproved/failing.~~ **RESOLVED — see §21.** Commit `6686fc7`.
8. Farcaster-bot service's Dockerfile declares `ANTHROPIC_API_KEY`, `APPROVAL_SECRET`, `NEYNAR_API_KEY` — the first two don't match `farcaster/farcaster-bot.js`'s actual functionality (static post bank, no AI generation, no approval flow). Unexplained — possibly a leftover from the separate `C:\farcaster-bot` repo's design, never cleaned up.
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

**Railway secrets baked into ARG/ENV — corrected count: 16, not 4, and it's one combined service, not "all 4 services."** ⚠️ **CORRECTION (July 23 2026, see §25): this "one combined service" description was itself wrong.** There is actually no dedicated keeper service — the actual Railway start command is `node scripts/api.js & node scripts/keeper.js`, both processes running together in one service sharing one variable set. That's why `DEPLOYER_PRIVATE_KEY` and `KEEPER_PRIVATE_KEY` appear together: not two services each with one key, one service with both. Full list, from the service's Nixpacks build log (`SecretsUsedInArgOrEnv` warnings, ARG and ENV, lines 11-12):

`ADMIN_PASSWORD`, `ADMIN_SECRET`, `BASESCAN_API_KEY`, `DEPLOYER_PRIVATE_KEY`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `KEEPER_PRIVATE_KEY`, `RESEND_API_KEY`, `SESSION_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`, `TWITTER_API_KEY`, `TWITTER_API_SECRET`.

**Highest priority for Seal: `DEPLOYER_PRIVATE_KEY` and `KEEPER_PRIVATE_KEY`.** These are wallet private keys, not API keys — the actual admin and keeper wallets slated for mainnet roles. A leaked API key is revocable with a bounded blast radius; a leaked deployer or keeper private key is a wallet compromise. Seal these two first, independent of when the remaining 14 get done.

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are stale in this list — this build predates the Stripe removal (above, commits `2a90abd`/`f9aeee0`), and the Railway env vars themselves have since been confirmed removed separately. Not still exposed, despite appearing in the log.

**`keeper.js` stats-accuracy bug fixed, `MerchantNotApproved` backoff added** — commit `6686fc7` (§20 item 7, now resolved). Previously, any confirmed `executePull` transaction was unconditionally counted as a successful pull and logged as `"success"` — even when the contract's internal logic caused it to skip payment without reverting (SV-15 `MerchantTransferFailed`, SV-16 `MerchantNotApproved`, or a pause/expiry path). Heartbeat stats and pull-attempt logs were silently inaccurate for all of those cases. Now decodes the actual emitted event via `vault.interface.parseLog()` and only counts a genuine `PaymentExecuted` as a real pull; everything else is logged accurately as skipped with the real event name.

Also added: in-memory backoff specifically for `MerchantNotApproved` — after 3 consecutive occurrences per subscription, skip attempting it for 10 minutes instead of retrying every 20s. Not persisted to DB, resets on keeper restart — harmless, since the contract's SV-16 re-check already guarantees correctness regardless of keeper behavior. `SV-15` (`MerchantTransferFailed`) was deliberately left without keeper-side backoff, since the contract's own circuit breaker (auto-pause after 3 failures) already bounds it — a second backoff layer on top would be redundant.

**Pending items, carried and new:**
1. Everything still open from §20 (items 4, 5, 8–9 as listed there) — unchanged by this session. Items 1, 2, 3, 6, 7, and 10 are all resolved (1, 3, 7, 10 this session; 2 and 6 predate it, in commits `a6b6420` and `8092acf`).
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

---

## 24. Session Summary — July 22 2026

**MerchantRegistry verified on Basescan — Exact Match.**

- Address: `0x393BA721aB45f4d4DaAC1B914e7F6377508C0299`
- Two `artifacts/build-info/*.json` files existed locally (`059cbe54be65cfd9b988e43864942272.json`, `d20fd3071734fde8a0a537158cd66bd9.json`). Both contained MerchantRegistry source (Hardhat build-info bundles all compiled sources per run, whether or not they changed), so file inspection alone couldn't identify the right one.
- Disambiguated by comparing each build-info's compiled `deployedBytecode` (via a small Node script, since PowerShell's `ConvertFrom-Json` failed on the large nested AST content in these files) against the actual on-chain runtime bytecode fetched directly from Base Sepolia RPC (`eth_getCode`). `059cbe54be65cfd9b988e43864942272.json` matched (ignoring the trailing CBOR metadata hash); `d20fd3071734fde8a0a537158cd66bd9.json` didn't contain a MerchantRegistry entry in its output at all.
- Compiler settings confirmed directly from the matching build-info before submitting, rather than assumed: `v0.8.24+commit.e11b9ed9`, optimizer enabled at 200 runs, `evmVersion: paris`.
- Extracted the `input` object from that build-info (same method as the July 4/5 SubscriptionVault verifications — Basescan needs only `{language, sources, settings}`, not Hardhat's full `{id, input, output, ...}` wrapper) and submitted via Basescan's Standard-JSON-Input verification form.
- Result: **Exact Match** (not partial) — bytecode and metadata hash both matched, confirmed on the contract's Code tab.
- License field shows as BSL 1.1 on Basescan (displayed license options don't include BUSL-1.1 by that exact name; this is a display-only distinction, not a licensing change).

**Both Base Sepolia contracts are now verified:** SubscriptionVault (July 4/5) and MerchantRegistry (July 22).

**Pending items, unchanged by this session** — carried from §21/§23: Railway secrets (12 of 16 still unsealed — see §21 for full list), Farcaster-bot Dockerfile's unexplained `ANTHROPIC_API_KEY`/`APPROVAL_SECRET`, `stripe_check...`/`bot_state` Postgres table ownership, demo video, audit funding, WooCommerce/PrestaShop plugin status (unconfirmed against codebase).

*Last updated: 2026-07-22*

---

## 25. Session Summary — July 23 2026

**§21's "one combined service" architecture description was wrong — corrected here.**

Actual Railway topology: **6 independent services**, not one combined service, sharing one Postgres:
- **`AuthOnce`** (main) — the live API server (`node scripts/api.js`, after this session's fix — see below). Holds `ADMIN_PASSWORD`, `ADMIN_SECRET`, `API_URL`, `BASE_MAINNET_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `BASESCAN_API_KEY`, `DATABASE_URL`, `DEPLOYER_PRIVATE_KEY`, `ENCRYPTION_KEY`, `FRONTEND_URL`, `GELATO_KEEPER_ADDRESS`, `GOOGLE_CALLBACK_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `KEEPER_PRIVATE_KEY`, `NOTIFY_EMAIL`, `PROTOCOL_TREASURY_ADDRESS`, `REPORT_GAS`, `RESEND_API_KEY`, `SESSION_SECRET`, plus 4 Twitter keys — its own independent copies, not shared with other services.
- **`authonce-keeper`** — dedicated keeper bot (`node scripts/keeper.js`). Own copies of `BASESCAN_API_KEY`, `ENCRYPTION_KEY`, `KEEPER_PRIVATE_KEY`, `RESEND_API_KEY` via Railway's shared-variable pool, plus `ADMIN_EMAIL`, `NETWORK`, `PROTOCOL_TREASURY_ADDRESS`, `VAULT_ADDRESS`.
- **`authonce-notifier`** — notification backend. Own `PUSH_CHANNEL_PRIVATE_KEY`/`PUSH_CHANNEL_ADDRESS`, plus shared-pool `ENCRYPTION_KEY`, `BASESCAN_API_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`, `NETWORK`, `PROTOCOL_TREASURY_ADDRESS`, `VAULT_ADDRESS`.
- **`authonce-x-bot`** — X bot. `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`, `DATABASE_URL`.
- **`farcaster-bot`** — Farcaster bot. `NEYNAR_API_KEY`, `NEYNAR_SIGNER_UUID`, `FARCASTER_FID`, `BOT_BASE_URL`, `DATABASE_URL`.
- **`monitor`** — deployment monitor watching both Sepolia and Mainnet for contract deployments. `AUTHORIZED_DEPLOYER`, `ALERT_EMAIL`, `BASE_SEPOLIA_RPC_URL`, `BASE_MAINNET_RPC_URL`, `RESEND_API_KEY`.

**Critically: variables with the same name on different services are independent values, not shared state**, except where Railway's shared-variable pool is explicitly used (visible as "N of 10 shared variables in use" per service). Sealing a variable on one service does not seal or affect the same-named variable on another. This was confirmed the hard way this session — sealing `ENCRYPTION_KEY`/`BASESCAN_API_KEY` on `authonce-keeper` early in the session had no effect on `AuthOnce` main's independent copies, which were sealed separately later.

**All 16 Railway secrets now sealed, across the correct 6 services** (previously miscounted as "1 combined service" in §21):
- `AuthOnce` main: `ADMIN_PASSWORD`, `ADMIN_SECRET`, `BASESCAN_API_KEY`, `DEPLOYER_PRIVATE_KEY`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `KEEPER_PRIVATE_KEY`, `RESEND_API_KEY`, `SESSION_SECRET`, `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` — all sealed.
- `authonce-keeper`: `BASESCAN_API_KEY`, `ENCRYPTION_KEY`, `KEEPER_PRIVATE_KEY`, `RESEND_API_KEY` — all sealed.
- `authonce-notifier`: `PUSH_CHANNEL_PRIVATE_KEY`, `ENCRYPTION_KEY`, `BASESCAN_API_KEY`, `RESEND_API_KEY` — all sealed.
- `authonce-x-bot`: `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET` — all sealed.
- `farcaster-bot`: `NEYNAR_API_KEY`, `NEYNAR_SIGNER_UUID` — all sealed.
- `monitor`: `RESEND_API_KEY` — sealed.

Every seal was verified via a fresh post-redeploy log confirming clean boot (DB connect, correct checkpoint resume where applicable, no auth/env crash) — not just assumed from the Railway UI showing a lock icon.

**Security fix — duplicate keeper process removed.** `AuthOnce` main's Custom Start Command was `node scripts/api.js & node scripts/keeper.js` — running a second, redundant keeper loop using the same keeper wallet (`0xdCEa737e...C151`) as the dedicated `authonce-keeper` service, polling the same vault independently. This is a genuine nonce-collision risk (two processes holding the same private key can race on the next nonce for `executePull()` transactions), not just wasted resources. Root cause: `AuthOnce` main almost certainly predates the later split into dedicated single-purpose services (`authonce-keeper`, `authonce-notifier`, etc.) and never had the redundant keeper half removed. Fixed by changing the Custom Start Command to `node scripts/api.js` only. Confirmed via fresh log: `AuthOnce` main now shows only "AuthOnce — Merchant & Admin API," no "Keeper Bot v6" banner, clean boot. `authonce-keeper` remains the sole keeper process for the vault. **Note:** `KEEPER_PRIVATE_KEY` is now dead weight on `AuthOnce` main (still sealed there, no longer needed) — not removed this session, flagged for later cleanup since fewer live copies of a wallet key is strictly better.

**Bug found and fixed — stale `DATABASE_URL` on `authonce-x-bot`.** Sealing the four Twitter keys surfaced `[x-bot] DB init failed: password authentication failed for user "postgres"` on the very next redeploy. This predates this session entirely — traced to the Postgres password rotation described in §20 (rotated after being pasted in plaintext into a chat session). §20 claimed "all 5 dependent services... reconnected cleanly, verified via each service's own post-redeploy logs" — **that verification did not actually cover `authonce-x-bot`,** which had been silently running on a broken DB connection since that rotation, undetected until this session's redeploy exposed it. Fixed by copying the exact working `DATABASE_URL` value from `authonce-notifier` (a service confirmed working) directly onto `authonce-x-bot`, rather than trying to diagnose a byte-level difference in two masked/truncated password strings. Confirmed fixed via fresh log: `[x-bot] Running — posts Mon/Wed/Fri 12:00 UTC` with no DB error following.

**Farcaster-bot rotation-state survival confirmed directly**, not just trusted from the boot log (which shows an ambiguous "Post bank: 28 posts" message whether or not state actually persisted). Checked the `farcaster_bot_state` table in Postgres directly before and after the redeploy: `index = 16`, `updated_at = 2026-07-22 13:00:33` — unchanged after redeploy, confirming the July 5 fix (§20, Postgres-backed rotation state replacing the old `/tmp`-based approach) is genuinely holding under a real redeploy, not just assumed from a generic log line.

**Bug found and fixed — `monitor`'s `AUTHORIZED_DEPLOYER` was a completely unrelated address.** Configured value was `0xDcbFdDD5d849271D984867f682204B43B5eBBD40` — not a typo or case variant of the real deployer, a structurally different address entirely. Real deployer, confirmed directly against the "AuthOnce Deployer" account in MetaMask: `0xbb6d960b8671713bb92be92d03BE8d8165EE7782`. This means the deployment monitor had likely never fired a meaningful alert tied to any real deployment activity since it was set up — it was filtering on the wrong address the entire time. Origin of the wrong address not established (possibly a stray/placeholder value from initial setup, never caught). Fixed by updating the variable to the correct deployer address. Confirmed via fresh log: `[MONITOR] Authorized deployer: 0xbb6d960b8671713bb92be92d03be8d8165ee7782`, watching both Sepolia and Mainnet correctly.

**Postgres findings, noted but not acted on this session:**
- `keeper_pull_attempts` table has 325,800+ rows, 0 sequential scans, 0 index scans recorded — written to constantly, apparently never read by anything. Candidate for investigation (dead logging vs. an external consumer not visible in this stats view) and possible archiving/pruning strategy, given its size (177.8 MB data + 19 MB indexes).
- `notifier_state`, `system_health`, and `farcaster_bot_state` all show very high dead-row percentages (checkpoint-pattern tables with frequent single-row updates); `farcaster_bot_state` has never been vacuumed. Likely contributing to the recurring "slow query" warnings on `notifier_state` inserts seen across multiple sessions. Worth an autovacuum tuning pass, not urgent.

**Pending items, carried and new:**
1. Everything still open from §20/§21/§24 not addressed this session: Farcaster-bot Dockerfile's unexplained `ANTHROPIC_API_KEY`/`APPROVAL_SECRET`, `stripe_check...`/`bot_state` Postgres table ownership, demo video, audit funding, WooCommerce/PrestaShop plugin status.
2. Remove now-dead `KEEPER_PRIVATE_KEY` from `AuthOnce` main (no longer used since the duplicate keeper process was removed).
3. Investigate `keeper_pull_attempts` table usage — is anything actually reading it, and does it need pruning/archiving.
4. Consider autovacuum tuning for high-churn single-row checkpoint tables (`notifier_state`, `system_health`, `farcaster_bot_state`).
5. Origin of the incorrect `AUTHORIZED_DEPLOYER` address on `monitor` was never established — not urgent, but worth understanding if it points to a broader copy-paste risk in initial service setup.

*Last updated: 2026-07-23*

---

## 26. Session Summary — July 24 2026

**Landing page overhaul — LandingPage.jsx substantially rewritten.** All changes verified via a compiled/rendered preview (real Babel+React build, not guessed):

- **Fabricated metrics removed.** Hero previously showed "653 active subscribers," "$18,200 MRR processed," "0% churn," "100% keeper success" under a tiny "illustrative — testnet simulation" disclaimer. Replaced with three true, verifiable facts: "Live on Base Sepolia testnet," "Sep 2026 targeted mainnet," "Verified contracts on Basescan." Flagged as a real credibility/legal risk — could easily be mistaken for genuine traction.
- **False "$200 pre-audit cap" claim removed** from the Roadmap section (2 places, EN+PT) — same claim already found false and removed from `compliance.html` back on July 4/5; had resurfaced here.
- **Testnet banner removed** per request. This also removed the only visible Basescan verification link — restored it on the "Verified" stat further down the page instead (now clickable, points to the real deployed vault address).
- **Nav collapsed:** "Pricing / How it works / Blog" merged into a single "Menu ▾" dropdown. PT/EN language toggle removed. Manual dark/light toggle (moon/sun button) removed — theme should now follow system `prefers-color-scheme` in `App.jsx` (not yet confirmed).
- **Eyebrow tagline simplified:** "Non-custodial subscription protocol · Base Network" → "Subscription billing for crypto-native businesses" — removes jargon that indieappcircle testers and Vasco's own family couldn't parse in the 10-second test.
- **New "who this is for" callout** added directly under the H1 — explicit, boxed, states the audience plainly rather than only implying it through feature bullets.
- **New signature visual:** circular "billing cycle" diagram (sign once → day 30 → day 60, "$0.005 / 0.5% flat fee" centered) sits beside the who-it's-for callout, right after the headline. Colored to the real brand gradient (`#34d399` → `#3b82f6`, from `logo.svg`) rather than an invented palette.
- **Subheadline restyled** from small quiet gray text to bold, high-contrast copy with "straight to yours" highlighted in the brand accent.
- **New real-dashboard proof section**, right after the merchant-suite pills: two actual (confirmed real) merchant-portal screenshots — Overview and Subscriber Breakdown — framed in a browser-chrome window, explicitly labeled "Real merchant dashboard — Base Sepolia testnet, live data." Screenshots need saving into the real project's `public/` folder as `dashboard-overview.png` and `dashboard-detail.png`.
- **New favicon designed.** The actual deployed `favicon.svg` was a generic unrelated placeholder (purple abstract blob, likely leftover from a starter template) — confirmed exactly what an indieappcircle tester flagged. New favicon derived from the real `logo.svg` shield-lock gradient icon, checked for legibility at true 16px/32px sizes.

**Open/unconfirmed items from the landing page work:**
1. Whether `App.jsx` auto-detects system dark/light preference — not yet verified.
2. Dashboard screenshots need saving into `public/` with exact filenames referenced in code.
3. Demo video still needs a slot on the page once ready.
4. Vasco needs to merge the edited `LandingPage.jsx` into the real repo and test a real local build — everything so far verified via a standalone compiled preview, not the actual Vite project.

**AI Agent Payments — major direction decision this session.**

The live landing page had a full, equal-weight dedicated section pitching AI-agent billing, directly contradicting the previously-documented strategy (§19: "deliberately NOT promoted... stays Phase 3"). **Vasco's decision: proceed with a real AI-agent billing launch, not defer it** — reverses the Phase 3 deferral.

**Critical finding from reading the actual `SubscriptionVault.sol` (v7) — marketing/reality mismatch:**

The AI-agent section's "Authorises once" claim does **not** match how the contract works for contract-wallet (ERC-1271) subscribers:
- Signature is bound to `(id, token, pullAmount, pullCount, deadline)` — a **fresh signature is required every billing cycle**, not a single upfront authorization.
- `deadline` must be `> block.timestamp` and `<= block.timestamp + PULL_DEADLINE_TOLERANCE` (`PULL_DEADLINE_TOLERANCE = 24 hours`).
- EIP-712 domain confirmed from the constructor: `{name: "AuthOnce", version: "7", chainId, verifyingContract}` — one header comment still says version "6," which is stale documentation, not the real constant.
- `isContractVault` is set once via `extcodesize` at `createSubscription` time and never rechecked live — the agent wallet must already have code deployed on-chain before subscribing.

**"No human intervention" is only true if something automated produces a fresh signature every cycle** — a session key, Safe module, or delegated signer bot. None of that exists yet. Marketing copy currently overstates what's built; needs correcting regardless of implementation path chosen.

**Confirmed:** the deployer wallet (`0xbb6d960b...EE7782`) is a genuine smart contract wallet (MetaMask's smart account feature) — explains why subscriptions #0/#1 showed `isContractVault = true`.

**Decision: build on-chain session keys / wallet-native spend permissions (ERC-4337, Safe modules, or Coinbase Smart Wallet), not an off-chain delegated signer service.**
- An off-chain signer service just relocates a hot key that must stay online and uncompromised — recreates the same custody/key-leak risk already identified for the fiat/Google subscriber wallet path.
- On-chain session keys let the wallet itself enforce the spending policy — a leaked session key's blast radius is capped by wallet-enforced rules, not by trusting AuthOnce's own signer code.
- Session keys are a maintained, audited, industry-wide standard — better long-term bet than bespoke signer infrastructure.
- An off-chain signer is acceptable only as an internal test harness to validate the ERC-1271 path quickly — never customer-facing.

**Pending items, carried and new:**
1. Keeper still does not implement the ERC-1271 pull path at all — real engineering work, not yet started.
2. Need to design and deploy a real test smart wallet on Sepolia with session-key support to validate end-to-end.
3. AI-agent section copy needs correcting to reflect per-cycle signing reality once the implementation approach is finalized.
4. Everything from §25 not yet addressed (dead `KEEPER_PRIVATE_KEY` cleanup, `keeper_pull_attempts` table investigation, autovacuum tuning, unexplained origin of the old wrong `AUTHORIZED_DEPLOYER` address).
5. Demo video, audit funding, WooCommerce/PrestaShop plugin status — unchanged, still open.

*Last updated: 2026-07-24*

---

## 27. Security & Anti-Fraud Recommendations — July 25 2026

Discussion prompted by Vasco asking how to detect/prevent an attack or hack attempt against the protocol. Not yet actioned — recorded for a future session.

**Already in place, working in the project's favor:**
- Circuit breaker (SV-15) — auto-pauses a subscription after 3 consecutive merchant-transfer failures
- Merchant blacklist/revoke with live re-check on every pull (SV-16) — a revoked merchant is cut off immediately, including subscriptions already running
- Two-step admin transfer (propose/accept) — no single transaction can hijack admin control
- Fee one-way ratchet — can only be lowered, never raised
- `monitor` service already watches for contract deployments on both Sepolia and Mainnet with email alerts
- All 16 Railway secrets sealed, duplicate keeper process removed (§25)

**Gaps identified, not yet built:**
1. **On-chain anomaly monitoring is logged but never read.** `keeper_pull_attempts` has 325,000+ rows and zero reads (flagged since §23). Should feed simple threshold alerts: repeated failed ERC-1271 signature attempts against one subscription, unusual pull volume/value spikes, sudden bursts of new subscriptions from one address.
2. **No real-time contract-activity monitoring beyond deployments.** `monitor` only watches for new deployments, not ongoing suspicious contract activity (unexpected admin calls, abnormal transfers, repeated reverts). Consider OpenZeppelin Defender or Forta.
3. **API rate-limiting coverage unconfirmed.** `checkLoginRateLimit` exists in the codebase (survived the Stripe removal) but it's unconfirmed whether it's actually applied to every sensitive endpoint (admin login, wallet-signature login on `/my-subscriptions`), not just wherever it happened to be wired in originally.
4. **Safe multisig is 2/2, no redundancy.** If either signer key is lost or compromised, the Safe is stuck — no backup signer. Already flagged in project notes as "upgrade to 2/3 when sister added"; worth prioritizing before mainnet.
5. **No documented incident response runbook.** No written "who does what, in what order" plan for a drained vault, compromised key, or contract exploit scenario.
6. **No bug bounty yet.** Recommended post-paid-audit (e.g., via Immunefi) to give researchers an incentive to report privately rather than exploit or disclose publicly.

*Last updated: 2026-07-25*

---

## 28. Session Summary — July 26 2026

**Landing page — hero restructured per direct feedback.**

- **"Built for SaaS companies, DAOs, and Web3 businesses..." promoted to the very first thing under the nav** — above the H1, not buried after it. Removes the "who is this for" ambiguity at the actual top of the page, not just further down.
- **Founding-offer badge ("First 10 get 0% fees...") removed from the top of the hero**, relocated to sit directly above the existing "Founding Merchants" section further down the page, where the full offer is explained — avoids competing with the headline for first-impression space.
- **Redundant "who it's for" boxed callout removed** from lower in the hero (was repeating the same message now stated at the top) — the billing-cycle diagram now stands alone in that spot.
- Real JSX structural bug caught and fixed during this edit: a wrapper `<div>` had its opening tag stripped but its closing tag left in place, breaking the whole file's parse. Caught via a real Babel parse check before shipping, not just visual inspection.

**AI-agent section — corrected and demoted, not just reworded.**

Per last session's decision (proceed with a real AI-agent launch, but the marketing was overstating what's built): the entire standalone "AI Agent Payments" section was removed — its own H2 ("The first recurring billing protocol built for autonomous AI agents"), flow diagram, 4-item feature grid, tag list, and dedicated CTA are gone (file dropped from 1673 to 1542 lines, confirming real removal). Replaced with:
- A single feature pill ("AI agent ready · ERC-1271, per-cycle sig") inside the existing "Not just payments" feature grid — same visual weight as "Webhooks" or "15 currencies," not a competing pitch.
- The false "authorises once / without human intervention" claim was found and corrected in **four separate places** across the page (hero pain-point card, the 3-card "Built for Web3" grid, the Developer API card, and the "Built for Web3" subheadline) — all now accurately describe per-cycle wallet signing, with session-key wallets as the path to automation, not a built-in guarantee.
- Verified at the text level post-rebuild: zero occurrences of "autonomous AI agents" as a standalone claim, zero occurrences of "without human intervention" anywhere on the page.

**Dark-mode bug — found, root-caused, and fixed.**

Landing page was loading in dark mode despite Vasco's OS being set to Light (confirmed via Windows Personalisation settings screenshot). Investigation of the actual `App.jsx` found:
- There was **no system-preference detection code at all** — contrary to the assumption made two sessions ago when the manual toggle was removed from the landing page. The real logic was just `useState(() => localStorage.getItem("theme") || "light")`.
- Root cause: a stale `"dark"` value already saved in Vasco's browser `localStorage` from earlier testing (back when the landing page still had its own toggle button), silently overriding the correct `"light"` default on every load.
- Confirmed via `localStorage.removeItem("theme")` + refresh — loaded light correctly once the stale value was cleared.
- **Real fix applied to `App.jsx`**: `theme` now initializes from `localStorage` only if an explicit choice was previously saved; otherwise falls back to `window.matchMedia("(prefers-color-scheme: dark)")`. This is what actually delivers the "browser/OS controls it" behavior that was intended when the manual toggle was removed — the previous code never implemented it, it just accidentally defaulted to light for anyone with empty `localStorage`.
- Vasco confirmed: file replaced at `C:\The-Opportunity\frontend\src\App.jsx`, loads light correctly now.

**New objection-handling FAQ section added**, placed right before the founding-merchant CTA — answers the real questions a skeptical merchant has before switching billing providers, all grounded in things actually built (not aspirational claims):
1. What happens if a customer's payment fails? → grace period + auto-retry
2. Can pricing change later? → 30-day on-chain-enforced notice
3. Can funds be withdrawn anytime? → non-custodial, nothing to withdraw
4. What if AuthOnce disappears/gets hacked? → no custodied fund pool, verified contracts, audit underway
5. Is this actually live? → real testnet, ties back to the real dashboard screenshots already on the page

**Files delivered this session:** updated `LandingPage.jsx`, updated `App.jsx` — both confirmed merged into the real repo and tested locally by Vasco.

**Pending items, carried and new:**
1. Everything from §26/§27 not addressed this session: keeper ERC-1271 support, test smart wallet on Sepolia, `keeper_pull_attempts` investigation, Safe 2/3 upgrade (see below — blocked on finding a third signer), demo video, audit funding, WooCommerce/PrestaShop status.
2. **Safe multisig 2/3 upgrade blocked** — sister (originally planned third signer) has declined. Needs a new candidate; discussed this session, no decision made yet (see below).

*Last updated: 2026-07-26*

---

## 29. Session Summary — July 28 2026 (AI-agent test wallet setup — completed July 29, see §30)

**Goal this session:** deploy a real ERC-1271 smart wallet on Base Sepolia to test AuthOnce's AI-agent billing path, per the July 24 decision (build the universal ERC-1271 signature-per-cycle path first, before any Coinbase Spend Permissions work).

**Coinbase Smart Wallet attempt — abandoned, not our bug.** Created a real Coinbase Smart Wallet (`0x591f35C39f4A461C0f78dF1CCc0b84d312F01C37`), successfully funded it with 0.015 test ETH, but **every attempt to send a transaction from it failed identically** ("Something went wrong") in both the browser (`keys.coinbase.com`) and the Base mobile app — same error, different amount, different device. This points to a genuine problem with Coinbase's sponsored-gas service for Base Sepolia specifically, not anything wrong with the wallet or Vasco's actions. **Do not retry this path** — pivoted to Safe instead, which doesn't depend on any sponsorship service (pays gas directly from a funded EOA).

**⚠️ Wallet inventory reconciled this session — first time these are documented:**

MetaMask accounts (all checked on Base Sepolia unless noted), from a full account-list review:
- **AuthOnce Deployer** — `0xbb6d960b8671713bb92be92d03BE8d8165EE7782` — the known deployer, 0.0456 ETH
- **AuthOnce Push Channel** — `0xd3350...2fd0e` — 0.0200 ETH — matches documented Push Channel wallet
- **Fresh 1** — `0x93e5a...57e18` — 0.0206 ETH, 30 USDC, 0 USDT — **undocumented until now**, purpose unclear, likely an ad hoc test wallet from a past session
- **Subscriber** — `0xBE6a5...E9e35` — 0.0100 ETH — **undocumented until now**, name suggests a subscriber-role test wallet
- **Merchant** — `0x4503E...2088F` — 0.0601 ETH, 20 USDC — **undocumented until now**, name suggests a merchant-role test wallet
- **PK Signer 2 Multi-Sig** — `0x00df2Dbb2455C372204EdD901894E27281fA02C0` — confirmed this IS Signer 2 of the real Treasury Safe (2/2, `0x737D4...A2DEB1`) per existing docs. Also holds ~0.0062 ETH on Base Sepolia, used as the signer for today's test Safe work.
- 3 hidden/unlabeled accounts (Account 3, 7, 8) — all $0 — not investigated, likely unused.

**Note:** `Fresh 1`, `Subscriber`, and `Merchant` were not in any prior session's memory — they appear to be test wallets Vasco created at some point outside a recorded Claude session. Worth clarifying their intended purpose next time, so they don't get treated as unknowns again.

**Ledger:** confirmed only used for Signer 1 of the real Treasury Safe — not otherwise involved in today's testing.

**Safe #1 — dead end, do not use.** Created a Safe named "AuthOnce Test Vault" (`0xB3d493F6bFF750719c10Cef10214B9d619891fCd`), funded it with 20 USDC via Circle's faucet, but discovered — after ~2 hours of failed transaction attempts and repeated "wrong signer" errors — that its actual on-chain registered owner is `0x44444d60136cf62804963fa14d62a55c34a96f8f`, an address that **matches none of Vasco's known wallets**. Confirmed via direct `getOwners()` call, not just UI. This address has real history (27 transactions, near-zero balance left) — genuinely someone's active wallet, not a placeholder — but its origin is unknown. Likely explanation: some other wallet/extension was actively connected in the browser at the exact moment this Safe was created, silently overriding the intended MetaMask account. **This Safe holds 20 USDC that is now effectively stuck** (no known key controls it) — low priority to recover given it's testnet play-money, but worth remembering it exists and why it's unusable.

**Safe #2 — the real one, in progress now.** Created **"AuthOnce Test Vault 2"** at `0x4159E9C4c9525acE25A6fA3303dD466E4A7a5ebC`, this time verifying the owner on-chain *before* funding it or attempting any transaction:
- Confirmed via `getOwners()`: owner is `0x00df2dbb2455c372204edd901894e27281fa02c0` (`PK Signer 2 Multi-Sig`) — correct.
- Confirmed via `eth_getCode`: real deployed Safe proxy bytecode — correct.
- Threshold: 1/1.
- Funded: **0.005 ETH** (for gas) + **20 USDC** + **20 EURC** (from Circle's faucet), all confirmed on-chain.

**Where we are right now, exactly:** a Transaction Builder batch has just been successfully created (not yet signed/executed) on Safe #2, calling:
```
approve(spender: 0x0C8668dE16BDaF4FC6aAddc5Ac24954e5EFBb95d, value: 1000000)
```
on the USDC contract (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`), at nonce 0. The Safe UI showed "Batch Created! Success!" and is ready for the next step: **click "Send Batch" (or return to it and continue), sign with MetaMask (`PK Signer 2 Multi-Sig`), and execute.**

**Exact next steps to resume:** — **all 6 steps completed July 29 2026, see §30.**
1. ~~Sign and execute the pending `approve` batch on Safe #2.~~ **DONE.**
2. ~~Verify on-chain that the USDC allowance from Safe #2 to the vault is `1000000`.~~ **DONE.**
3. ~~Call `createSubscription()` on the vault directly from Safe #2.~~ **DONE — subscription ID 5.**
4. ~~Verify the subscription was created with `isContractVault: true`.~~ **DONE — confirmed via direct `subscriptions(5)` on-chain read.**
5. ~~Write and run a Node.js/ethers.js script to construct the digest, get it Safe-signed, call `executePull()`.~~ **DONE — `scripts/test-erc1271-pull.js`.**
6. ~~Once a real pull succeeds, this proves the universal ERC-1271 path works end-to-end.~~ **DONE — see §30. Keeper still needs the equivalent logic added (`keeper.js` has no ERC-1271 pull support) — carried forward as the next task.**

**Key contract facts confirmed this session** (from the uploaded `SubscriptionVault.sol` v7):
- `enum Interval { Weekly, Monthly, Yearly }` — Weekly = 0.
- `MIN_GRACE_DAYS = 1`, `MAX_GRACE_DAYS = 30`.
- `createSubscription()` full parameter order confirmed directly from source (see above).

*Last updated: 2026-07-28*

---

## 30. Session Summary — July 29 2026 (First real ERC-1271 pull — end-to-end success)

**Goal this session:** finish steps 1–6 carried from §29 and get a real ERC-1271 pull executed against Safe #2.

**Env setup confirmed:** `SAFE_OWNER_PRIVATE_KEY` and `KEEPER_PRIVATE_KEY` added to the root `.env`. Verified by deriving public addresses (never printing the keys) — `SAFE_OWNER_PRIVATE_KEY` → `0x00df2Dbb2455C372204EdD901894E27281fA02C0` (Safe #2's confirmed 1/1 owner), `KEEPER_PRIVATE_KEY` → `0xdCEa737ec293DFF0B18C315CA90f494F8CB2C151` (the correct keeper address, post-July 4 `NotKeeper` fix). Both matched expected values exactly.

**Subscription 5 confirmed on-chain** (direct `subscriptions(5)` read via public RPC, not assumed from prior session notes): `safeVault` = Safe #2 (`0x4159E9C4...a5ebC`), `token` = Sepolia USDC, `amount` = `1000000`, `interval` = Weekly, `pullCount` = `0`, `status` = `0` (Active), **`isContractVault` = `true`**.

**`scripts/test-erc1271-pull.js` written and run.** One fix needed: the script had no fallback RPC URL, and `BASE_SEPOLIA_RPC_URL` isn't set in `.env`, so `ethers.JsonRpcProvider(undefined)` tried `localhost:8545` and failed. Added the same fallback `hardhat.config.js` already uses: `process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"`.

**Result: pull succeeded.**
- Tx: `0x9f8e14f94f8726d9780d84921fb7f95c42faba6852760947281874d1540492c6`, block `44793439`.
- `pullCount`: `0 → 1`. `lastPulledAt`: `0 → 1785355166`.
- Confirms the full chain: vault's `pullAuthorisationDigest()` → SafeMessage EIP-712 wrapping (domain = `{chainId, verifyingContract: safe}`, no name/version) → signed by Safe owner key → `executePull()` submitted by keeper wallet → Safe's `isValidSignature()` accepted it → funds moved.

**This is the first confirmed end-to-end proof that the universal ERC-1271 path works** — not just deployed code, an actual successful pull through a real Gnosis Safe on Base Sepolia.

**Carried forward:**
1. **`keeper.js` still has no ERC-1271 pull support** — this was a manual one-off script (`test-erc1271-pull.js`), not the production keeper loop. Real engineering work, not yet started.
2. Everything else open from §26–§28 not touched this session: `keeper_pull_attempts` table investigation, Safe 2/3 upgrade (blocked on finding a third signer), demo video, audit funding, WooCommerce/PrestaShop status verification, dead `KEEPER_PRIVATE_KEY` cleanup on the main service (note: a working `KEEPER_PRIVATE_KEY` is now back in the *local* `.env` for this test — confirm whether that's also meant to exist on Railway or stay local-only).

*Last updated: 2026-07-29*

---

## 31. Session Summary — July 30 2026 (Remove Portuguese language support — English-only)

**Goal:** Remove all Portuguese (`/pt`) language support from the site; English-only going forward.

**Investigation before touching anything:** mapped every dependency on `/pt` across the codebase — `main.jsx` (no dedicated route, falls through the catch-all), `App.jsx` (`isOnPtPath` detection + `lang` state + `localStorage["ao_lang"]` + `replaceState` toggling between `/` and `/pt`), `i18n.js` (small translations object + `detectLang`/`t` helpers, used only by `App.jsx`), `LandingPage.jsx` and `Pricing.jsx` (both had extensive `lang === "pt"` ternaries plus their own separate PT/EN toggle buttons), `sitemap.xml` (main + blog, hreflang pairs + a dedicated `/pt` URL entry), `legal.html` (a full parallel Portuguese translation of all 4 legal documents — Terms, Privacy, Refund, Subscriber Terms — not just a stray mention), and two long-orphaned `index-pt.html` files (repo root + `frontend/`), confirmed unreferenced by any build config.

**Correctly scoped out during investigation:**
- `MerchantDashboard.jsx`/`AdminDashboard.jsx` "PT" matches were the ISO country code for Portugal (merchant billing address/VAT), not language — untouched.
- `legal.html`'s "Portuguese law"/"DL 24/2014" references are governing-law/jurisdiction facts, not translation artifacts — explicitly preserved.
- Blog and docs pages already had zero PT content — nothing to do there.

**Mechanical execution:** given the scale (`LandingPage.jsx` alone had ~250 `lang === "en" ? EN : PT` ternaries interleaved with Vasco's own in-progress mobile-nav redesign, still uncommitted), wrote a pair of AST-based Node scripts (`@babel/parser` + `@babel/traverse`, already present as transitive deps) to collapse ternaries to their English branch and flatten `Pricing.jsx`'s `{en, pt}`-shaped `TIERS` object — exact-text splicing off original source offsets, not codegen, so untouched code stayed byte-identical. `legal.html`'s bilingual `<div lang-content="pt">`/`<span lang-inline="pt">` structure needed a separate hand-rolled HTML tag-depth tracker (no HTML parser available in `node_modules`) since regex alone can't safely match nested divs.

**Verification before shipping:**
- Confirmed English text unchanged byte-for-byte (not just structurally) — checked via paragraph/heading counts and div/span tag balance, and the full diffs were reviewed directly by Vasco (pasted in full, not summarized) before anything was applied.
- Production build succeeded; ESLint run against pre/post versions confirmed all 8 unused-var warnings were pre-existing (from Vasco's own uncommitted nav redesign + unrelated `Pricing.jsx` items), none introduced by this work.
- Verified live in a local dev server (homepage + pricing) before anything was pushed.

**A real mistake caught before pushing:** the approved `legal.html` diff was built and reviewed entirely in a scratch copy but never actually copied over the real file during the "apply all files" step — a genuine oversight. Caught when investigating a live-site bug report ("`/pt` showing up on terms/privacy") — traced to the still-deployed, pre-fix `/legal` page's PT toggle button, which also revealed the local file itself hadn't been updated yet. Fixed before committing.

**Shipped (commit `218c69c`):** `App.jsx`, `LandingPage.jsx`, `Pricing.jsx`, `i18n.js` (deleted), `sitemap.xml` (main + blog), `legal.html`, both orphaned `index-pt.html` files (deleted). Verified live: `/legal` no longer shows the PT toggle; `/pt` now serves the normal English homepage instead of erroring or showing Portuguese.

**Deliberately kept separate, still uncommitted:** Vasco's in-progress mobile nav/content redesign in `LandingPage.jsx` (menuOpen dropdown, hero restructure, new dashboard-screenshot section, removed AI-agent section, new FAQ section, fabricated-metrics cleanup) — isolated from this PT-removal work via a snapshot/restore staging technique so the two changes could ship independently. Resume review of that separately when ready.

*Last updated: 2026-07-30*

---

## 32. Session Summary — July 30 2026 (SEO/technical fixes: canonical tags, dead links, /docs routing)

**Goal this session:** three SEO/technical fixes flagged by an external audit — canonical tag bugs on 4 blog URLs + /docs + /pricing, one broken internal link, one robots.txt conflict.

**1. Dead "Related reading" links in `ai-agent-trading-bot-payments.html`.** The 4 "canonical bug" blog URLs from the original report weren't real articles at all — `blog.authonce.io` has a catch-all that serves the homepage's exact HTML (same canonical, same title) for any unmatched path. 3 of the 4 slugs never existed in git history; the 4th (`why-onchain-recurring-payments-are-broken`) was a real page deleted in commit `4bc98ed`. The only place any of them were still linked was this file's "Related reading" block. Fixed: 3 repointed to real articles (`eip2612-explained`, `ai-agent-payments`, `base-network-subscriptions`); the 4th rewritten with honest anchor text pointing to `what-is-noncustodial-billing` rather than force a misleading blurb onto an unrelated destination. Commit `f6a3283`.

**2. `/docs`, `/docs/web3`, `/docs/ai-agents` were completely unreachable in production.** Every request silently fell through to the SPA homepage shell instead of the real static files (`docs-saas.html`, `docs-web3.html`, `docs-ai-agents.html`) — a bigger problem than the canonical tag symptom suggested, since it meant the docs section was invisible to users and crawlers alike, not just mis-canonicalized. Fixed via `_redirects` rewrites, no file renames. Took two iterations: the first attempt pointed rewrite targets at the `.html` files, which Cloudflare Pages' own clean-URL redirect turned into a visible 308 instead of a silent 200 rewrite; fixed by pointing directly at the clean URLs. Verified live: all three return 200 with correct titles ("AuthOnce Docs — SaaS Merchant Integration Guide", etc.). Commits `f6a3283`, `14b5511`.

**3. Per-route canonical tags on `/pricing` and `/status` via `react-helmet-async`.** Root cause: this is a client-rendered SPA served from one static `index.html` with a hardcoded `<link rel="canonical" href="https://authonce.io">` — every route inherited the homepage's canonical since nothing updated it per route. Installed `react-helmet-async`, wrapped the app in `HelmetProvider`, added per-page `<Helmet>` blocks in `Pricing.jsx` and `Status.jsx` (component-level, not route-level in `App.jsx`, since `/pricing` is actually rendered via its own top-level `react-router-dom` route in `main.jsx`, bypassing `App.jsx` entirely). Also removed the now-duplicate static canonical from `index.html` — Google respects the first canonical tag it finds, so leaving the static one in place would have kept the bug live even with Helmet working correctly. Verified via real browser DevTools inspection, not curl — `react-helmet-async` only injects the tag client-side after JS executes, which is invisible to curl, non-JS crawlers, and bundle-hash comparisons alike. Several verification attempts this session (curl, direct deployment URL, cache-busted query string, bundle-hash diffing) were misleading dead ends for this specific fix, until browser inspection settled it directly. Commits `12d94a6`, `f7a4c4a`.

Later the same day, the `/` and `/pt` canonical (lang-aware `<Helmet>` in `LandingPage.jsx`) was extracted and shipped separately (commit `89b4bf8`) — see §31, since `/pt` itself was subsequently removed entirely.

**4. Two deploy-pipeline points of confusion, no actual regressions found:**
- Two separate Cloudflare Pages projects exist — `authonce-blog` (root dir `blog-site`, static, no build step) and `authonce` (root dir `frontend`, real Vite build). Initial deploy-verification confusion came from checking the wrong project's build log against the wrong deployment.
- Adding the `/docs` rewrites above the SPA catch-all (`/* /index.html 200`) caused Cloudflare to flag and ignore that catch-all line as an "infinite loop" rule. Confirmed via direct testing (`/pricing`, `/status`, and a nonexistent route all still return 200) that Cloudflare's default asset-fallback behavior covers for the ignored rule — no broken routes resulted.

**Deliberately deferred:**
1. **Internal 4xx from the original Screaming Frog crawl — dropped.** No specific URL was ever identified; the report only had summary counts, not per-URL detail, and guessing further wasn't worth the risk of fixing the wrong thing.
2. `blog-site/sitemap.xml`'s matching hreflang pair on the main site's homepage entry was flagged mid-session as a related finding — resolved same day as part of §31's PT-removal work, not left open.

*Last updated: 2026-07-30*

---

## 33. Session Summary — August 6 2026 (Merchant auth polish, webhook race-condition fixes)

**Merchant auth fix from the prior session (`requireMerchantAuth` JWT rewrite) went live and was verified working** — confirmed via a real webhook test delivering an actual `200` response.

**Real bug found and fixed: auth-race 401s.** `loadWebhooks`/`loadPayments`/handle-fetch/`AnalyticsPanel` all fired on component mount, racing the async wallet-signature login (`attemptMerchantLogin`) — any call landing before the signature resolved got a 401 with no retry. Root cause of "Could not load analytics: HTTP 401" and webhooks silently failing to save. Fixed: these now wait for `merchantAuthReady` and re-fire the moment it flips true, instead of only trying once at mount.

**Two more real bugs found via live testing on the actual "Add Webhook" flow:**
- Webhook save silently swallowed the real failure reason behind a generic alert. Fixed to surface the actual status/message, with a specific "session expired, sign in again" message for 401s.
- A stray leading space in a pasted URL (`https:// promerchant.com`) passed validation but broke real delivery — invisible because the test button was separately broken (see §34). No trim/validation existed on save.

**README.md corrected** — was live-published with dead June 30 contract addresses, dead Stripe references (removed in the July 5 pivot but never scrubbed from the README), and EIP-712 domain shown as `version: "5"` instead of the real `"7"`. Fixed all three; no other content changed.

**Contract v8 + `AdminDashboard.jsx` committed to git** — these had been deployed and live-tested back on Aug 4 but the source diff was never actually committed; repo didn't match what was live on-chain. Fixed, byte-verified against the deployed bytecode before committing (immutable-slot-adjusted diff, 100% match on everything else).

**Stuck-funds warning shipped** — dashboard copy (next to the merchant's wallet address in the sidebar) + a draft ToS clause (needs Tiago Monteiro/Fio Legal review before publishing, not yet sent).

**Git hygiene pass** — six stale one-off scratch scripts from past verification sessions deleted (`compare-bytecode.js`, `extract-input.js`, `merchant-registry-input.json`, `verify-input.json`, `check-keeper-key-address.js`, an earlier `find-correct-build-info.js` — the last was recreated by Claude by mistake, then correctly restored from Vasco's own original copy from Downloads). Confirmed-useful tooling (`extract-input.js`, `find-correct-build-info.js`) kept and properly committed. `test/SubscriptionVaultV8.test.js` + `contracts/mocks/*.sol` (a real local test suite from the Aug 3 v8 deployment, previously untracked) also committed.

**Talent Protocol profile set up** (personal builder reputation, separate from AuthOnce's own accounts) — domain ownership verified via a `talentapp:project_verification` meta tag (unrelated to and non-conflicting with the existing `base:app_id` tag). Base App Store listing confirmed already correctly registered under the `vasco@authonce.io`-linked org (app id `6a2adea10cfd412b2ab2bb46`) — a second "Add Domain" screen seen mid-session was Talent Protocol's own flow, not a duplicate Base registration; no conflict.

**Demo video recorded and uploaded** (Unlisted on YouTube: `https://youtu.be/DALHFJfysD4`) — unblocks the Base Builder Grant nomination, which had been sitting incomplete since May with no video. Resubmission drafted, not yet confirmed submitted this session.

**LinkedIn:** AuthOnce company page post published (video-led). Personal profile fields deliberately left generic/unrelated to AuthOnce — employer is still unaware of the project, confirmed this remains intentional.

**Real, deferred architectural finding — NOT fixed this session, fixed Aug 8 (see §34):** the entire multi-endpoint "Add Webhook" UI (per-event subscriptions, HMAC secret, "Recent Deliveries" panel) was discovered to be completely disconnected from the actual live event-dispatch pipeline. Real events (`payment.success` etc.) only ever checked a legacy `merchants.webhook_url` single field that nothing in the product had any UI to set — meaning every real event, for every merchant, had always silently fallen back to email regardless of what was configured in the dashboard. `webhook_endpoints` table itself also had no `CREATE TABLE` in the schema bootstrap at all (existed live only via an undocumented manual creation).

*Last updated: 2026-08-06*

---

## 34. Session Summary — August 8 2026 (Full webhook system rebuild)

**Fixed the disconnect found Aug 6, in full — four layered bugs, not one:**

1. **`webhook_endpoints` table now properly created in `db.js`'s schema bootstrap** (was previously live only via an undocumented manual creation — a fresh database would have silently broken every webhook-management API route).
2. **`dispatchWebhook()` in `webhook.js` rewritten** to query `webhook_endpoints` for every active endpoint subscribed to the firing event, dispatch to all of them in parallel (each with independent retry/backoff), and only fall back to email if every endpoint fails or none are configured. Legacy `merchants.webhook_url` kept as an additional fallback target for backward compatibility, deduped by URL.
3. **The dashboard's "Test" button was separately broken even after fix #2** — `test.ping` isn't a real subscribable event type, so testing via the generic dispatcher would still always find zero matches. Added `testWebhookOnce()` — fires directly at the specific endpoint under test, single attempt, returns the real HTTP status. `POST /api/webhooks/test` rewritten to use it (previously ignored the specific webhook row it had already fetched and returned a hardcoded `{success:true, status:200}` regardless of what actually happened).
4. **Frontend was checking `res.ok`** (whether the API call itself succeeded — always true) **instead of `data.success`** (whether the webhook delivery actually succeeded) — would have kept showing false "Delivered" even with 1–3 fixed.

**Also added, found missing during this same pass:**
- `DELETE /api/webhooks/:id` — didn't exist at all; a merchant with a typo'd/dead webhook URL had no way to remove or fix it.
- URL trim-on-save — closes the exact stray-space bug from Aug 6.

**Fully live-tested, both directions:** a real working URL (`x.com`) correctly showed `Delivered — 200`; a deliberately broken one (initially `httpstat.us/500`, then the original bad `promerchant.com` with its stray space) correctly showed an honest failure — proving the fix reports both outcomes truthfully, not just the happy path that fooled the old code.

*Last updated: 2026-08-08*

---

## 35. Session Summary — August 9 2026 (v9 deploy, full cutover, batch merchant rotation)

**v9 deployed and verified** — see updated §2a above. Both fixes (SV-21 merchant rotation, permit front-run fix) proven live on-chain before any cutover decision was made.

**Full cutover to v9 performed** — `config.js` (frontend), `authonce-keeper`, `authonce-notifier` all repointed. Confirmed via fresh boot logs on all three. **Real proof of correctness, not just "no errors on boot":** the keeper's very first cycle after cutover correctly pulled a payment to the *rotated* merchant (Merchant B, not the original Merchant A) — confirming the whole pipeline reads live on-chain state correctly, not cached/stale data.

**Real bug found and fixed while wiring the new UI: Subscribers tab was showing wrong data for every row.** Field-name mismatches (`sub.vault_address` vs. the real `sub.safeVault`, `sub.amount_usdc` vs. real `sub.amount`, string-keyed `interval`/`status` lookups against values that were already the numeric enums directly) — every subscriber row showed blank addresses, "$undefined" amounts, and broken status badges. Unrelated to today's actual task, found only because it was the exact code being touched to add the rotation UI. Fixed.

**Merchant payout wallet rotation UI built — the actual point of the day's work.** Two-step propose/accept, matching the contract's design exactly:
- Dashboard-native propose flow (per subscription), no Basescan needed.
- Prominent incoming-request banner, shown above all tabs, when another merchant proposes moving a subscription's payouts to the current wallet.
- Backend (`db.js` new `merchant_change_requests` table + indexes, `notifier.js` event listeners for `MerchantChangeProposed`/`Accepted`/`Cancelled`, `api.js` two new endpoints) was — surprisingly — already fully built and correct by the time this session picked it up (present in the uploaded `config.js`/`db.js`/`api.js`/`notifier.js` from the start of the session, verified line-by-line rather than trusted blindly). Only the frontend UI was genuinely missing.

**Real bug found and fixed post-build: merchant-change banner showed the wrong "who proposed this" label** (a defunct deployer wallet from a much earlier deployment, instead of the real proposing merchant). Root cause: the `subscriptions` table has no `vault_address` scoping at all — its primary key is just the raw numeric `id`, which collides across every contract redeploy. Subscription ID `0` already existed from an early self-testing deployment; since `notifier.js` was still pointed at v8 when v9's real subscription #0 was created, it never overwrote that stale row. Fixed by reading the old merchant live from the contract itself at index time (always correctly scoped to `VAULT_ADDRESS`) rather than trusting the local DB. **The underlying `vault_address`-scoping gap itself was NOT fixed — flagged as a separate, larger architectural item; every table keyed by subscription ID alone has this same latent risk, not just this one banner.**

**Batch/bulk rotation built** — deliberate scope decision, discussed explicitly: built as a frontend-only loop through the existing single-subscription contract functions (checkbox selection + "select all", progress-bar UI matching the existing `PriceChangeModal` pattern for both propose and accept), NOT a new on-chain batch function. Reasoning: a real batch contract function would expand audit scope before Hashlock has even priced the current v9 engagement; the frontend-loop approach ships against already-tested code with zero new audit surface. **Explicitly flagged that this doesn't remove the underlying signature/gas cost — N subscriptions still need N wallet signatures and N transactions, just triggered from one place instead of reopening a modal N times.** A real on-chain batch function (`proposeMerchantChangeBatch`/`acceptMerchantChangeBatch`) was discussed as a likely eventual need once real post-mainnet subscriber volume exists, deferred deliberately, not built.

**Three more real bugs found via actually clicking through the batch flow live (not just deploying and assuming):**
1. Bulk-propose success screen said "Proposed for 0 subscriptions" despite both real transactions succeeding on-chain — the modal was reading a live prop (`subscriptionIds`) that the very success callback (`onSaved` → clears the parent's selection state) changed out from under it mid-flow. Fixed by snapshotting the ids once on mount into local state.
2. Only one of two proposed subscriptions showed as "Pending" after a bulk propose — the dashboard's reload was scheduled for 3 seconds, but `authonce-notifier` only polls for new events every 30 seconds (confirmed in its own boot log). Fixed everywhere this pattern appeared (5 separate call sites, not just bulk propose) — now reloads at both 5s (fast path) and 35s (guaranteed-correct path).
3. Both individual and bulk Accept buttons stayed stuck on "Confirming..." forever even after the underlying transactions genuinely succeeded on-chain — the success path reset the overall "in progress" flag but never the per-request "confirming" flag. Fixed on both the single-accept and accept-all code paths.

**Fully live-tested end to end, every on-chain path exercised, not just deployed:** propose (single + bulk), accept (single + bulk), cancel — all confirmed via direct contract-state reads and/or clean dashboard state after the real 30–35s reload window, using two real test merchant wallets rotating a subscription back and forth multiple times over the session.

**Pending items, carried:**
1. `vault_address` scoping gap in the database schema — real, flagged, not fixed (see above).
2. Real on-chain batch propose/accept contract functions — deferred to post-mainnet, revisit when real subscriber volume makes single-subscription rotation genuinely painful; flag to Hashlock as a *possible* future scope item even if not built yet, to avoid it landing as a surprise addition later.
3. Cosmetic: bulk-select header checkbox shows checked even when zero rows are actually eligible/selected underneath it (edge case: all visible subscriptions already have a pending change). Not fixed, very minor.
4. Hashlock audit scope email — drafted (flags both v9 fixes), still not sent, holding until audit funding is actually confirmed.
5. Base Builder Grant — video now attached, resubmission drafted, send-confirmation status unclear across sessions — worth explicitly confirming next time whether it was actually submitted.
6. Everything else already open from §26–§32 (WooCommerce/PrestaShop status, Safe 2/3 upgrade blocked on a third signer, `keeper_pull_attempts` investigation, autovacuum tuning) — untouched, still open.

*Last updated: 2026-08-09*

---

## 36. Session Summary — August 9 2026 (continued) — Vault admin → Safe transfer, WooCommerce plugin environment setup

**SubscriptionVault v9 admin transferred from deployer wallet to Treasury Safe — Base Sepolia, verified on-chain.**

- Two-step propose/accept pattern executed: `proposeAdminTransfer(newAdmin)` called by deployer wallet (`0xbb6d960b...EE7782`), then `acceptAdminTransfer()` called by the Safe, requiring both signers (Ledger + MetaMask).
- **Real finding: the AuthOnce Treasury Safe (`0x737D4EeAEF67f776724482a29367615703A2DEB1`) had never been deployed on Base Sepolia** — it existed only on Base Mainnet (funded, 0.089 ETH). The Sepolia address was a counterfactual placeholder only. Activated this session via Safe's "Activate account" flow (real on-chain deployment tx, confirmed via `eth_getCode`).
- Ledger hit a `DeviceLockedError` mid-signing, then a second "Failed to sign" error even with blind signing enabled — resolved by fully disconnecting the Ledger, physically unplugging/replugging, and reconnecting fresh. Worth remembering for mainnet: the Ledger browser connection can drop mid-session and needs a hard reconnect, not just a retry.
- **Confirmed via direct `admin()` read on Basescan (not trusted from any UI):** vault admin is now `0x737D4EeAEF67f776724482a29367615703A2DEB1`. Genuine on-chain proof.
- **MerchantRegistry admin transfer NOT done** — deliberately deferred. Registry still has the deployer wallet as admin. Decision: full admin-transfer rehearsal will be redone properly at mainnet deployment time; this Sepolia exercise was Vault-only.

**AuthOnce Lda. incorporation status — confirmed NOT yet incorporated.** Resolves the open unknown from prior session close-outs (target was July 2026, never confirmed either way until now).

**WooCommerce/PrestaShop plugin status — confirmed via repo-wide search (`findstr /s /i /m`), definitively closed as an open question:**
- Zero plugin code exists for either platform. All matches were blog copy (`blog-site/*.html`) and this doc's own checklist entries mentioning them as planned features.
- Resolves the "unconfirmed against codebase" status this had carried since July.

**WooCommerce plugin — environment setup started (code not yet written):**
- Local (WP Engine's local WordPress tool) installed on Vasco's Windows machine.
- Test site created: `authonce-woo-test`.
- Hit a port-80 router conflict on first boot (something else on the machine — likely IIS — already listening on port 80). Fixed by switching Local's Router Mode to `localhost` (Preferences → Advanced → Router Mode). Site now runs at `localhost:10004`.
- WooCommerce plugin installed and activated (official, by Automattic).
- One test product created ("Test Product 1", CHF 5.00/4.50, Simple/Virtual product type) — confirms working cart + checkout pages.
- **Not yet started:** actual AuthOnce payment gateway plugin code (PHP). Scope agreed: build WooCommerce integration first (larger market), PrestaShop later. MVP plan — merchant enters AuthOnce credentials, "Pay with AuthOnce" checkout option redirects to existing `authonce.io/pay/...` link, webhook marks WooCommerce order paid on successful subscription. No crypto/private key handling inside the plugin itself.

**Pending items, carried and new:**
1. WooCommerce plugin — actual PHP code, next session. Environment is ready.
2. MerchantRegistry admin transfer to Safe — deliberately deferred to mainnet, not testnet-rehearsed.
3. AuthOnce Lda. incorporation — still not done, no longer an "unknown," now a known open task.
4. Everything else carried from §35 (vault_address scoping gap, batch propose/accept functions, Safe 2/3 upgrade still blocked on a third signer, Hashlock audit-scope email, Base Builder Grant submission-confirmation status, Merchant ToS, autovacuum tuning, keeper_pull_attempts investigation).

*Last updated: 2026-08-09*

---

## 37. Session Summary — August 11 2026 — vault_address scoping: the real fix, two real incidents, and a correction to yesterday's fix

**Goal:** finish verifying yesterday's vault_address scoping fix (§36 area) by testing a real new subscription end-to-end. Turned into a much larger, multi-incident debugging session — all resolved, all verified directly against the database, not just logs.

**Incident 1 — deploy crash-loop on first attempt.** Yesterday's migration didn't account for `payments.subscription_id` carrying a foreign key into `subscriptions(id)`. Postgres correctly refused to drop the old single-column primary key while that FK depended on it — `AuthOnce` main crash-looped safely (no data corruption) but was down until fixed.

**Real fix, not a workaround:** extended `payments` with the same `vault_address` scoping as `subscriptions`, and rebuilt the FK as a proper composite `(subscription_id, vault_address) REFERENCES subscriptions(id, vault_address)` — closing the same collision class in `payments` that was just fixed in `subscriptions`, rather than just dropping the constraint and losing that integrity check. `insertPayment()` in `db.js` and its one call site in `notifier.js` updated to pass `vaultAddress` through. Confirmed via direct query against `pg_constraint` — not trusted from logs — that both the composite primary key and composite foreign key are live.

**Two more issues found and fixed while re-verifying, before either ever reached production:**
- The `payments` table needed to be created *before* the vault_address migration tries to `ALTER` it — original ordering would have broken any genuinely fresh database (e.g. a new dev/test environment), not just this live one.
- A copy-paste duplication in one of Claude's own edits (the same drop-then-add FK statement pair ran twice in a row) — harmless but sloppy, cleaned up.

**Incident 2 — yesterday's backfill choice itself was flawed, found via a real second data-loss event.** Yesterday's fix backfilled every pre-existing, origin-unknown row with the *current* vault address as a best-effort label. That reasoning was incomplete: it meant an old, unrelated row could still collide with a genuinely new subscription that later reused the same numeric id — the exact bug the whole fix was supposed to prevent, reintroduced through the backfill itself. Confirmed directly: `id=6` was stale June 20 2026 test data; a real new subscription created today collided with it and its data was silently lost, identically to the original `id=5` incident from Aug 10.

**Real, permanent fix:** the v9 vault did not exist before Aug 9 2026 — a hard, verifiable fact, not a guess. Any row created before that date cannot possibly be a real v9 subscription, however it was labeled. Added a corrective re-labeling step to `initSchema()`: any row still carrying the current `VAULT_ADDRESS` but created before `2026-08-09` gets re-tagged with a sentinel value (`legacy-unknown-pre-v9`) that can never collide with a real vault address again. Payments are relabeled based on their *parent subscription's* relabeling (a join), not an independent date check on the payment itself — a payment's `executed_at` doesn't necessarily track its subscription's `created_at`, so matching on the parent avoids a possible FK mismatch. The relabeling runs *before* the FK is re-added each boot, since Postgres enforces FK integrity on UPDATEs to the referenced table too, not just inserts — got this ordering wrong on the first attempt within this same fix, caught and corrected before shipping.

**Deliberately not done:** no attempt to repair the two known lost rows (`id=5`, `id=6`) — per Vasco's explicit call, testnet data has no real value, so the priority was a permanent fix over a data repair. Confirmed working with a fresh end-to-end test afterward instead.

**Final verification, direct from the database, not inferred from logs:**
- `pg_constraint` query confirmed both composite keys live and correct.
- `id=6` confirmed re-labeled to `legacy-unknown-pre-v9`.
- A genuinely new test subscription today landed as a **second, independent row at `id=7`** — sitting alongside an old `id=7` row now correctly labeled `legacy-unknown-pre-v9`. This is the exact collision scenario that used to destroy data, now proven to work correctly, not just theoretically fixed.

**New, separate bug found in the same final test — not related to vault_address, flagged for next session:** the new row's `external_ref` came back `NULL` despite `?ref=vaultfix-final-test` being in the pay link. Root cause: a real race condition, present since the `external_ref` feature was first built (§36) — `PayPage.jsx`'s `/link` call fires the instant the transaction confirms in-browser, but the notifier only creates the row on its own ~30s polling cycle. If `/link` arrives first, it gets a "not indexed yet" response and never retries, silently losing the ref. Not a vault_address issue — would have shown up on the very first test regardless, just happened to land the other way at the time.

**Recommended fix, not yet built:** make `PayPage.jsx` retry the `/link` call a few times with a short delay instead of giving up after one attempt, now that the notifier is confirmed to catch up quickly under normal conditions.

**Pending items, carried and new:**
1. `PayPage.jsx` `/link` retry logic — next session, closes the original WooCommerce `external_ref` task properly.
2. WooCommerce plugin PHP code itself — still not started, environment from Aug 9 (§36) is ready and unaffected by any of today's backend work.
3. Everything else carried from §36 (MerchantRegistry admin transfer to Safe still deferred to mainnet, AuthOnce Lda. incorporation, Safe 2/3 upgrade blocked on a third signer, Hashlock audit-scope email, Base Builder Grant submission-confirmation status, Merchant ToS, autovacuum tuning, `keeper_pull_attempts` investigation).
4. Two pre-existing bugs found but deliberately not fixed today (flagged during the vault_address work, unrelated to it): a broken subscriber-cancellation code path referencing a `cancelled_at` column that doesn't exist anywhere in the schema, and `getSubscriptionsByMerchant` being called with 4 arguments in `api.js` while the real function only accepts 1 — pagination/status filtering on that endpoint is silently a no-op.

*Last updated: 2026-08-11*

---

## 38. Session Summary — August 16 2026 (Admin merchant approval UI, Base Ecosystem Fund resubmission, pitch deck corrections)

**Admin dashboard — real on-chain merchant approve/revoke UI built and deployed.** Replaced the old `ManualApprove` component (which only copied the address and handed off to Basescan Write Contract) with a genuine wallet-connected write UI in `AdminDashboard.jsx`, using `wagmi` hooks already present in the stack (`useAccount`, `useConnect`, `useWriteContract`, `useWaitForTransactionReceipt`) against `REGISTRY_ADDRESS`/`REGISTRY_ABI` from `config.js`. Honest status reporting throughout (waiting → confirming → confirmed, or a real error) — no fake success states. Deliberately does **not** hardcode an "is this the right wallet" check client-side, since `MerchantRegistry`'s `onlyAdmin` check is the real authority and the deployer wallet (not the Safe) is still registry admin. Committed `9a5c9bd`, pushed, build verified clean, deployed live.

**Real security proof obtained during testing (not just theoretical):** used a genuinely unapproved test merchant + a real pay link (`authonce.io/pay/.../non-approved-merch-`) and attempted a real subscribe from a separate test wallet (Edge browser, isolated from the admin session in Chrome). The transaction failed with a misleading RPC gas-limit error (`eth_sendRawTransaction: exceeds max transaction gas limit`) rather than a clean `MerchantNotApproved` revert — but **confirmed via Network tab and no on-chain subscription created that the actual security held**: an unapproved merchant genuinely cannot receive a subscription. The misleading error message itself is a new, low-priority backlog item — `PayPage.jsx` should pre-check `isApproved()` before attempting the transaction so an unapproved-merchant pay link shows a clear message instead of a cryptic gas error.

**MetaMask connect-button bug — root-caused, not a code bug.** After the merchant-approve UI shipped, "Connect wallet to approve/revoke" appeared to do nothing. Root cause chain, confirmed via console: (1) initial cause was two wallet extensions (MetaMask + Rabby) both injecting `window.ethereum`, throwing `"another Ethereum wallet extension also setting the global Ethereum provider"` — fixed by disabling Rabby; (2) after that, a **separate, second issue** surfaced — a stuck MetaMask `wallet_requestPermissions` request already pending for `authonce.io` (error code `-32002`), left over from earlier troubleshooting clicks, silently blocking any new connection attempt with zero visible error. Confirmed the wallet↔page bridge itself was fine the whole time via a direct `window.ethereum.request({method:'eth_requestAccounts'})` console call, which surfaced the real `-32002` error. Fix: full browser restart (clears MetaMask's in-memory pending-request state). **Not independently re-confirmed after the fix** — the actual "approve merchant → retest the previously-blocked pay link → confirm it now succeeds" end-to-end loop was never completed this session; picked up other work instead. First task next session: finish that loop for real, and independently verify via `isApproved()` on Basescan, not just the UI's own "Confirmed on-chain" message.

**Also flagged, not yet checked:** the existing per-row "Revoke" button already present elsewhere in `AdminDashboard.jsx`'s merchant list (separate from the new card) — unknown whether it's a real on-chain write or the same kind of database-only action the old `ManualApprove` used to be. Needs verification before being trusted.

**Base Ecosystem Fund — application resubmitted.** Follow-up to the unanswered April 2026 submission, prompted by a live @buildonbase post confirming the fund is still actively soliciting applications. All 5 sections (Company / Team / Idea / Funding / Why Base) filled and reviewed for accuracy against actual project state, not aspirational copy:
- **Funding ask:** $150K pre-seed. Use of funds: 15% audit / 50% business co-founder / 20% legal / 15% operations — deliberately corrected from an earlier stale 40/35/15/10 split once the real audit quote ($20–25K, not $60K) was clarified.
- **No equity % stated** — deliberate, to avoid anchoring a negotiating position before any real conversation, especially since BEF may itself invest directly.
- **Traction answer kept deliberately unflashy and accurate:** pre-revenue, testnet-only, named the real blocker (audit, no funding secured yet) rather than inflating anything — same discipline as the landing-page fabricated-metrics cleanup from July.
- **AI-agent framing scoped carefully:** mentioned only in the Idea section, stated precisely — ERC-1271 proven on-chain with one real Safe wallet pull, keeper-side production automation explicitly flagged as not yet built. Did not oversell this to match BEF's "Agentic Commerce" focus area.

**Pitch deck — full accuracy and tone pass, v4 → v9, all changes grounded in actual project history:**
1. **DAI removed** from all token lists (was dropped from the project in July, actively blocked on-chain).
2. **AI-agent claim corrected** — "autonomous agents... without human intervention" (the exact overclaim already caught and removed from the live site once before, per the July 24/26 sessions) replaced with the accurate per-cycle-signing description. Competitive-table cell softened from an unqualified ✓ to `~` with an explanatory footnote.
3. **Audit status corrected** — removed a fabricated-looking firm list (Cyfrin, Hashlock, Hacken, Guardian, "in progress") that matches no real audit history; replaced with the true state: Audit vendor undecided — six competing offers received via Areta Market (June 30): Softstack $4,600, Hashlock $5,000, Beosin $8,000, Nethermind $9,000, Composable $11,000, Statemind $15,000. No firm engaged or accepted. Decision was pending an Areta EF subsidy reply — status of that reply needs confirming with Vasco.
4. **Verification status corrected** — MerchantRegistry is actually verified now; the deck understated this.
5. **Budget breakdown corrected** to match the live application (15/50/20/15%), including fixing the *visual progress-bar widths* (separate hardcoded shapes that don't auto-update with the text — silently still showed the old 40/35/15/10 proportions after the numbers were edited).
6. **Currency standardized to USD ($)** throughout the fundraising slide, matching the live application's "$150K" wording — SaaS tier product pricing (slide 6, $49/$199-equivalent) deliberately left as real, separate product pricing, then also converted to USDC on user's own request for internal consistency with "Billed in USDC" copy on the same slide.
7. **"Target exit: $3–10M acquisition" line removed entirely** — judged as an unhelpful, self-limiting signal to send an investor/fund unprompted (caps their own upside thinking, contradicts the deck's own "standard subscription primitive for Base" framing).
8. **SaaS tier billing marked "(in development)"** — confirmed via full session-history review that tier billing-to-access linkage was never actually built (tier enforcement is off-chain per locked business rules, and no listener exists connecting a successful USDC payment to a merchant's tier flag in Postgres). This is a **real, unbuilt gap**, not just a hedge phrase — flagged as a backlog item, not started.
9. **Tone/readability pass** — removed stiff, jargon-heavy phrasing that read as written-for-a-deck rather than said-by-a-person: "structurally," "no custodial code path," "primitive," "agentic economy," "atomically" (→ "same transaction, no separate step," applied consistently across slides 4 and 6), "bridging EU regulatory awareness with Swiss precision" (cliché), "100% commitment to the mission" (vague) → replaced with a concrete, accurate line about building solo alongside full-time employment (also fixes a consistency gap with the Team section, which already discloses the Hinti employment).
10. **Deliberately left untouched, user's call:** slide 11's "20+ years in technology... hardware, software" founder-bio claim — unverifiable from project history, conflicts with what was told to Claude when drafting the Team section minutes earlier ("nothing relevant to put there, I just work at Hinti"). Not resolved either direction.
11. Final version hosted as `AuthOnce-PitchDeck-2026.pdf` on Google Drive (public "anyone with the link"), confirmed via screenshot to be the correct final content, linked in the submitted application.

**Real, unbuilt gap identified and discussed, not started:** SaaS tier access is completely disconnected from tier billing. Even once USDC tier billing works, nothing currently grants/revokes dashboard tier access based on payment success or failure. Would need: a listener on `PaymentExecuted` events where AuthOnce itself is the merchant, tier matching by payment amount, a DB flag update — plus an undecided product question (does tier access hold through the grace period on a missed payment, or drop immediately?).

**Pending items, carried and new:**
1. **Finish and independently verify the merchant approve/revoke end-to-end loop** — approve the test merchant via the new UI, confirm via direct `isApproved()` Basescan read (not just the UI message), then retest the previously-blocked pay link to confirm a real subscription now succeeds.
2. Verify whether the pre-existing per-row "Revoke" button (separate from today's new card) is a real on-chain write or a stale database-only action.
3. `PayPage.jsx` pre-flight `isApproved()` check — low priority, but would fix the misleading gas-error message an unapproved merchant's subscriber currently sees.
4. SaaS tier billing → tier access linkage — not started. Needs the listener design above plus the grace-period product decision.
5. Slide 11 founder bio claim — still unresolved, left as-is per explicit instruction.
6. Everything else already open from §37 (MerchantRegistry admin transfer to Safe deferred to mainnet, AuthOnce Lda. incorporation, Safe 2/3 upgrade blocked on a third signer, Hashlock audit-scope email still unsent, autovacuum tuning, `keeper_pull_attempts` investigation, WooCommerce cart/checkout `external_ref` `/link` retry logic) — untouched this session.
7. Awaiting reply from the resubmitted Base Ecosystem Fund application.

*Last updated: 2026-08-16*

---

## 39. Session Summary — August 16 2026, continued (Connect-button real root cause found and fixed; approve/revoke loop verified on-chain both directions; second real bug found and fixed — DB-only fake approve/revoke buttons in merchant list)

**Correction to §38:** the browser restart described in §38 did *not* actually fix the connect issue — it only cleared the stuck MetaMask permission request from the *previous* bug (two wallet extensions conflicting). A second, separate, code-level bug remained and was still silently blocking the connect button after the restart. §38's "not independently re-confirmed" caveat was correct to include.

### Bug 1 — silent connect no-op (FIXED, confirmed working end-to-end)

**Root cause:** `AdminDashboard.jsx`'s `handleConnect()` looked up the MetaMask connector via `connectors.find(c => c.id === "metaMask")`. In this app's actual RainbowKit build, the MetaMask connector's real id is `"metaMaskSDK"`, not `"metaMask"`. The `find()` silently returned `undefined`, so the code fell through to `connectors[0]` — which is the **Safe** connector in this app's connector order. Safe's connector only functions inside a Safe multisig iframe context; called elsewhere it fails to open anything, with no thrown error. That's why clicking the button produced no MetaMask popup, no modal, and no console error.

**Diagnosis method:** evidence-first, not guesswork. Added a temporary `console.log(connectors)` right before render, rebuilt, deployed, and read the actual printed connector array in the browser console. It showed `[{id:'safe',...}, {id:'walletConnect',...}, {id:'baseAccount',...}, {id:'metaMaskSDK',...}, {id:'walletConnect',...}, {id:'walletConnect',...}]` — proving the id mismatch directly rather than assuming it. (Also confirmed along the way that `config.js`'s separately-exported `wagmiConfig` is unused dead code — `main.jsx` builds its own config via RainbowKit's `getDefaultConfig` instead. Not fixed tonight; flagged below.)

**Fix:** `handleConnect()` now checks both `"metaMaskSDK"` and `"metaMask"` before falling back to `connectors[0]`, so a future RainbowKit/wagmi version bump that renames the id again won't silently reintroduce this bug.

**File:** `frontend/src/components/AdminDashboard.jsx`
**Commits:** `401aaaa` (temp debug log, since removed) → `66dc224` (real fix, debug log stripped)

**Verified on-chain, end-to-end, in both directions:**
- Connected the **Deployer wallet** (`0xbb6d960b8671713bb92be92d03BE8d8165EE7782`) via the fixed button — MetaMask popped up correctly.
- Approved test merchant `0xF6CcD9524964B9433773f77C270F724339B9B9E5` ("merch test") on `MerchantRegistry` (`0x393BA721aB45f4d4DaAC1B914e7F6377508C0299`).
- Confirmed via **Basescan transaction logs** (not the UI's own success message): real `MerchantApproved` event, `merchant = 0xF6CcD...B9B9E5`, `approvedBy = 0xbb6d960b...EE7782`.
- Retested the previously-blocked pay link for that merchant — subscription completed successfully on-chain ("You're subscribed!", Basescan link shown). A revert would have occurred if `isApproved()` were still false, so this is functional proof, not just a UI read.
- Then tested **Revoke** the same way: `MerchantRevoked` event confirmed on Basescan, `merchant = 0xF6CcD...B9B9E5`, `revokedBy = 0xbb6d960b...EE7782`.
- One transient error during revoke testing: `revokeMerchant` reverted with a confusing `"exceeds max transaction gas limit"` RPC message. Root cause was unrelated to gas — the wallet connected at that moment was the **Subscriber test wallet**, not the Deployer/admin, so the real cause was an admin-only access-control revert; Alchemy's RPC surfaced it as a gas-estimation error instead of a clean revert reason. Reconnecting the Deployer wallet resolved it immediately. Worth remembering this misleading error string if it recurs elsewhere in the app.
- Also observed and confirmed as expected behavior, not a bug: a product created *before* its merchant was approved automatically became usable the moment approval landed on-chain — no separate activation step needed.

### Bug 2 — merchant list's per-row Approve/Revoke buttons were DB-only, no blockchain interaction (FOUND and FIXED — buttons removed)

**Found while retesting Bug 1's fix.** Below the on-chain card, the merchant list table had its own, separate, pre-existing Approve/Revoke buttons per row (the ones §38 flagged as "needs verification"). These called `POST /api/admin/merchants/:wallet/approve` and `.../reject` — plain backend API calls with a Bearer token. **No `writeContract`, no wagmi, no MetaMask, no on-chain interaction whatsoever.** The row's status badge was driven entirely by the database column `merchant.approved_at`, not a live `isApproved()` read.

**Confirmed as a real, live inconsistency, not hypothetical:** after revoking the test merchant on-chain via the working card, the list row still showed "Approved" with a Revoke button — because nothing had told the database anything happened. Clicking that stale "Revoke" button then flipped the DB flag to "Pending" — coincidentally landing on the correct-looking state, but only because the on-chain revoke had already happened separately moments earlier via the real button. Had the DB-only "Approve" been clicked instead at any point, the dashboard would have shown "Approved" for a merchant that was still blocked on-chain (subscriber pulls would keep reverting) — or vice versa, shown "Pending" for an actually-approved, live merchant.

Notably, the **merchant-facing portal** (`authonce.io`, merchant's own view) correctly showed "⚠ Pending" for the revoked wallet throughout — so this divergence was isolated to the admin dashboard's list table, not systemic.

**Fix:** removed the DB-only `handleApprove`/`handleReject` functions and their buttons from `MerchantRow` entirely. The row is now read-only (Merchant / Email / Registered / Status / View), with the on-chain card as the single control surface for approve/revoke. Table header and grid columns adjusted to match (5 columns instead of 6). Checked `MerchantDetail` (the "View →" modal) too — it only displays the approval date, no similar fake action buttons there.

**File:** `frontend/src/components/AdminDashboard.jsx`
**Commit:** `aa8430e`

**Known residual limitation, not fixed tonight, flagged for later:** the list row's Status badge still reads `merchant.approved_at` from the database — it's informational only, not a live `isApproved()` read. It can still lag or diverge from real on-chain state (e.g. the register-on-approve `fetch` in `ManualApprove` is explicitly best-effort with a swallowed `.catch(() => {})`, so a failed DB write there wouldn't surface anywhere). Options for later: (a) wire the badge to a live per-row `isApproved()` read via `useReadContract`, or (b) accept the DB lag as informational-only and label it as such in the UI. Not urgent now that it's no longer paired with an actionable, misleading button — but worth closing before mainnet.

### Updated pre-mainnet checklist status

- ~~Finish and independently verify the merchant approve/revoke end-to-end loop~~ — **DONE**, verified on-chain both directions with Basescan event-log evidence, not UI messages.
- ~~Verify whether the pre-existing per-row "Revoke" button is a real on-chain write or a stale database-only action~~ — **DONE**. It was DB-only. Removed, along with its matching fake "Approve."
- **New follow-up, low urgency:** decide whether to wire the merchant list's status badge to a live `isApproved()` read, or leave it clearly labeled as DB-derived/informational.
- **New follow-up, low urgency:** `config.js`'s exported `wagmiConfig` is dead code — `main.jsx` never imports it, using RainbowKit's `getDefaultConfig` instead. Same class of "unused/duplicate config" issue as §2a and §19. Not investigated further tonight; worth a cleanup pass so there's only one wagmi config in the codebase.
- **New, not yet started — flagged this session, not investigated further:** no load/volume testing has been done at any point in this project. Everything verified so far has been single-digit manual test transactions on Base Sepolia. Before mainnet, need to run a real volume test — **at least 1,000 transactions** — to find actual throughput limits across: the keeper bot's pull-execution loop (sequential vs. parallel/batched — `keeper.js` not yet reviewed for this), RPC provider rate limits at the current Alchemy tier, and Postgres behavior under load (ties into the already-open `autovacuum tuning` item). Also need to calculate real ETH (gas)/USDC/EURC required to fund that test, and check whether the current RPC tier can sustain it or whether a paid tier is needed for the test month. Vasco has a faucet script for generating test funds — needs review to determine which wallets and how many are usable/available before this test can run.
- Unchanged from before this session: `PayPage.jsx` pre-flight `isApproved()` check (misleading gas-error message), SaaS tier billing → tier access linkage, slide 11 founder bio claim, MerchantRegistry admin transfer to the Safe (deferred to mainnet), AuthOnce Lda. incorporation, Safe 2-of-3 signer, Hashlock audit-scope email still unsent, autovacuum tuning, `keeper_pull_attempts` investigation, WooCommerce `external_ref` `/link` retry logic.
- Awaiting reply from the resubmitted Base Ecosystem Fund application (submitted this session, per §38 — not yet confirmed received).

*Last updated: 2026-08-16*

---

## 40. Session Summary — August 18 2026 (config.js cleanup deployed; live on-chain merchant-status badge built; keeper/notifier load-test review; EURC approval — full saga including a Safe multisig admin discovery; merchant re-approval; session paused on a public RPC outage)

### config.js dead-code cleanup — DONE, deployed

Removed the unused `wagmiConfig` export from §39's cleanup list. Confirmed via `Select-String -Pattern "wagmiConfig"` across the whole `frontend/src` that nothing imported it. Removed it along with its now-unused imports (`http`, `fallback`, `createConfig` from wagmi, `baseSepolia`, the four wallet connector imports, `projectId`). `RPC_URLS` and everything else in the file untouched — confirmed still used elsewhere (`createPublicClient` calls).
**File:** `frontend/src/config.js`
**Commit:** `c79e32b`

### Merchant list status badge — wired to a live on-chain read, BUILT but NOT YET DEPLOYED

Addressed the residual limitation flagged at the end of §39 (badge was DB-derived only). Added a single batched `useReadContracts` call (one multicall for the whole visible merchant list, not one RPC call per row) that reads `isApproved()` live from `MerchantRegistry` for every merchant currently loaded. A new `isMerchantApprovedLive()` helper prefers the live result and falls back to the DB `approved_at` flag only while the read is still loading. This same helper now drives **all three** previously-DB-only surfaces consistently — the per-row badge, the "Pending"/"Approved" filter tabs, and the `pendingCount`/`approvedCount` numbers shown in the stat cards and the "Merchants · N ⚠" tab label — so none of them can disagree with each other or with the chain anymore.
**File:** `frontend/src/components/AdminDashboard.jsx` (not yet committed/pushed — sitting as a local diff only, per the file exchanged this session)
**Status:** written and syntax-checked, but **not yet built, deployed, or tested live**. Next session: `npm run build`, deploy, then verify by loading `/admin` and confirming the badge now matches Basescan's `isApproved()` read directly (which we exercised heavily later this same session, so a good live merchant to test against already exists).

### keeper.js / notifier.js reviewed for real throughput risk (prompted by Vasco asking whether the system has been evaluated at volume — it had not)

No load testing has ever been done on this project before tonight. Reviewing the actual keeper/notifier code (not guessing) surfaced three real structural risks, all evidence-based:

1. **Keeper re-checks every active subscription every cycle, not just due ones.** `processDueSubscriptions` loops all active/paused IDs every 20 seconds (`RUN_INTERVAL_MS`), calling `isDue()` on each to find out if it's due — no server-side pre-filter. At meaningful volume (hundreds+ of active subscriptions) this means hundreds of RPC calls every cycle just to check status, batched 5-at-a-time (`CONCURRENCY = 5`).
2. **Keeper's scheduler doesn't wait for the previous cycle to finish** — plain `setInterval(tick, RUN_INTERVAL_MS)`. If a cycle overruns the interval (plausible per #1 at volume), the next cycle fires anyway and cycles can stack. `notifier.js` does this correctly (self-rescheduling `setTimeout` inside its own poll function) — keeper doesn't have that safety.
3. **Notifier's proactive-notification loop (3-day reminders, price-change notices) is fully sequential**, one subscription at a time — on-chain read, DB dedup check, email, webhook, DB insert, no batching. Runs every 5th poll cycle (~2.5 min budget).

These are risks found in code, not measured results — the actual numbers only come from running the real test.

### The volume test plan settled on: 100 transactions first, not 1,000

Real contract facts, found by reading `SubscriptionVault.sol` directly, that reshaped the plan:

- **Funding model is direct wallet balance + allowance/permit** — no separate pre-funded "vault" per subscription. One subscriber wallet can create many subscription IDs; confirmed no owner/product uniqueness restriction in `createSubscription`/`createSubscriptionWithPermit`.
- **`isDue()` only returns true immediately after creation (`lastPulledAt == 0`) or after a full interval has elapsed** — shortest interval is `Weekly` (7 days), no test-only short interval, no admin override. **This means N real `executePull()` successes in one session requires N distinct subscriptions** — you cannot get repeat same-day pulls from fewer subscriptions.
- **Permit only needs signing once per wallet+token** — per SV-13, `permit()`'s `value` is `type(uint256).max` (a standing allowance), not the per-cycle amount. Once set, later subscriptions for that same wallet+token can use the plain `createSubscription()` call, no signature needed.
- `require(amount > 0)` is the only floor on subscription amount; `MAX_SUBSCRIPTION_AMOUNT` is far above anything relevant here.

**Faucet constraint that actually drives the numbers:** Vasco has a **manual USDC/EURC faucet limited to 20 of each per wallet per day** — confirmed per-wallet, not account-wide. ETH is not the constraint (see gas estimate below).

**Wallets chosen for the test — no new wallets needed:**
- Subscriber 1 = existing **Subscriber** wallet (`0xBE6a5cFFd807e85602E2434e6EAa9BDb866E9e35`)
- Subscriber 2 = existing **Account 7** (`0xA7C03E93545dF9Df3e006E13E4aF993C208Dc1aB`)
- Subscriber 3 = existing **Account 8** (`0x35B5a617a91C0ABC400D6e704A259Add551BdD07`)
- Merchant target: already-approved **"merch test"** (`0xF6CcD9524964B9433773f77C270F724339B9B9E5`) — no need for merchant diversity in this test.
- Explicitly NOT used: Merchant A/B/C (kept merchant-role-only), Deployer/Push Channel/Vasco Builds/PK Signer 2 Multi-Sig (protocol-level roles, kept out of subscriber testing to avoid contaminating admin/treasury testing later).

**Real bug caught before it went into any script:** Vasco supplied an EURC address (`0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4`) that turned out to be **Ethereum Sepolia's** EURC contract, not Base Sepolia's — confirmed against Circle's official contract list. Correct Base Sepolia EURC: `0x808456652fdb597867f38412077A9182bf77359F`. Would have caused every EURC transaction in the test to fail or hit an unrelated contract. Always cross-check token addresses against the official source per network — a plausible-looking address from the person is not sufecient confirmation.

**Gas estimate methodology (a real number, not fabricated):** read a real `approveMerchant` transaction on Basescan (`106,320 gas @ 0.00597 Gwei = 0.000000634678571575 ETH`) to get the current real Base Sepolia gas price, then estimated generously (200,000 gas) for `executePull()`. Conclusion: **ETH is not the bottleneck for this test** — even 100 pulls costs roughly one single faucet claim's worth of ETH. USDC/EURC's daily cap is the real constraint.

**`fund-test-wallet-multi.js` reviewed (not modified):** only funds ETH (not USDC/EURC) for three wallets — Safe multisig, Deployer, Keeper. Found a real bug in its own numbers: `MAX_CLAIMS_TOTAL = 750` claims (`0.075 ETH` budget) is less than the combined `targetEth` of those three wallets (`0.16 ETH`) — the shared daily budget can't reach its own configured targets in one run. Not fixed tonight; flagged for whoever next touches that script. Doesn't block anything since ETH isn't the constraint for this test.

### `create-test-subscriptions.js` — new script, written this session

Creates a configurable number of test subscriptions (`TOTAL_SUBSCRIPTIONS`, deliberately starts at `6` — same "prove it small first" pattern as everything else this project does) split across the 3 subscriber wallets above, alternating USDC/EURC, all against `merch test`. Safety checks built in, run before spending any gas: refuses to run on the wrong chain id, confirms both tokens are `approvedTokens` on the vault, confirms each wallet's actual token balance covers what it's about to commit, confirms each `.env` private key actually resolves to the expected wallet address. Uses the permit-once-per-wallet-per-token optimization described above. Loaded via `require("dotenv").config({ path: ... "..", ".env" })` pointed explicitly at the project root, since the script lives in `scripts/` and `.env` lives at `C:\The-Opportunity\.env` — a real, found-and-fixed bug (`dotenv` only looks in the CWD by default, and the script is run from `scripts/`).
**File:** `scripts/create-test-subscriptions.js`

### EURC approval — the actual saga

Running the script for the first time correctly caught, before spending any gas, that **EURC was not an approved token on the vault at all** (`approvedTokens(EURC) == false`; USDC was already `true`). Fixing this required `SubscriptionVault.approveToken(address)`, `onlyAdmin`-gated — which led to a real, previously-unknown discovery:

**The Vault's admin is not the Deployer wallet — it's the Safe multisig treasury** (`0x737D4EeAEF67f776724482a29367615703A2DEB1`), confirmed via `admin()` read directly on Basescan. This is a *different* fact from the already-documented "MerchantRegistry admin transfer to the Safe — deferred to mainnet": that's a separate contract, and evidently the **Vault's** admin was already the Safe, even on testnet. Worth keeping these two facts distinct going forward.

Three consecutive `approveToken` attempts via Basescan's Write Contract tab (using the Deployer wallet) failed with a misleading `"RPC 0x14a34 ... exceeds max transaction gas limit"` error — same misleading-error pattern as the Revoke test in §39, twice compounding: once because the Deployer isn't the Vault's admin at all, and a second time because the "Self" autofill button had put the **connected wallet's own address** into the `token` field instead of EURC's address (a real, human, easy-to-make mistake worth remembering: always re-check autofill/"Self" buttons on Basescan write forms before submitting).

Since the Safe requires **2 of 2** signatures (confirmed directly in the Safe app's Settings — Ledger `0x94FD52B6a6FcAcCb41BBE5717264BC9e95a35B4a` + MetaMask "PK Signer 2 Multi-Sig" `0x00df2Dbb2455C372204EdD901894E27281fA02C0`), this had to go through Safe's Transaction Builder rather than a direct wallet call. Along the way:

- **Safe's Transaction Builder silently bundled in an unrelated, unintended `acceptAdminTransfer()` call via `multiSend`**, alongside the correct `approveToken` action — caught and confirmed via the exported batch JSON before anyone signed, and removed using the per-row trash icon (not the top-level batch trash, which would have deleted the whole batch). Checked `pendingAdmin()` afterward out of caution — returned the zero address, confirming there was no real pending admin transfer and this was very likely stale Transaction Builder UI state, not a genuine threat. Cause not fully understood; worth being alert to this recurring if the Transaction Builder is used again.
- **First signature was accidentally provided by the MetaMask "PK Signer 2 Multi-Sig" account, not the intended Ledger** — the audit log showed "Signed (1/2), By MetaMask" when the Ledger was expected. Since a 2-of-2 Safe requires two genuinely different signers, the same account could not later provide the second confirmation (Safe correctly disabled its own "Confirm" button and showed "You've already signed this transaction").
- **Fix:** connected the actual physical Ledger device as a new hardware-wallet account in MetaMask (first attempt showed "0 total address found" because the device wasn't yet PIN-unlocked and on the Ethereum app — worth remembering as a checklist for next time), selected the correct address (`0x94FD52B6a6...5B4a`) specifically, and signed with that. Audit log then correctly showed "Signed (2/2), By Ledger."
- **Execution then failed** with "Your connected wallet doesn't have enough funds" — the Ledger account had no testnet ETH. Resolved by switching MetaMask to the **Deployer wallet** (which had ETH) and executing from there — a Safe's execution step can be triggered by any wallet once the signature threshold is met, it doesn't have to be one of the two signers.
- **Confirmed on-chain**, not just via the success toast: `approvedTokens(0x808456652fdb597867f38412077A9182bf77359F)` on the vault read back `true` via Basescan Read Contract directly.

### Merchant re-approval needed — a second, unrelated blocker

Rerunning the script after EURC was approved hit a *new* error: `MerchantNotApproved` reverted on `merch test`, despite the merchant having been confirmed approved earlier in §39. Root cause: **`merch test` had been deliberately revoked during §39's own Revoke-button testing and never re-approved afterward** — the vault correctly checking `MerchantRegistry.isApproved()` and finding it false, exactly as designed. Not a new bug — leftover state from earlier testing this same night. Re-approved `merch test` via the Deployer wallet on `MerchantRegistry` (tx `0xf41fe905...`, confirmed via direct `isApproved()` read = `true`, not just the UI message).

### Session paused on a public RPC outage, not a code or contract bug

Rerunning immediately after the merchant re-approval hit the *same* `MerchantNotApproved` error one more time — investigated by reading the vault's own `merchantRegistry` address (`admin()`-style Read Contract call), which correctly matched `0x393BA721...C0299`, ruling out a "vault pointed at the wrong registry" theory. The very next run then surfaced the real cause directly: an explicit RPC error, **`"no backend is currently healthy to serve traffic"`**, from the public shared `https://sepolia.base.org` endpoint — an outage/instability on Base's public infrastructure, unrelated to any of tonight's code or contract work. The earlier repeat `MerchantNotApproved` was very likely this same instability serving a stale read.

**Recommended fix for next session, not yet applied:** point `create-test-subscriptions.js` at Alchemy instead of the public endpoint via `.env`'s `BASE_SEPOLIA_RPC_URL` (the script already prefers this variable if set, falling back to the public endpoint only if it's absent) — removes dependence on the public endpoint's health entirely, worth doing regardless of whether the outage has cleared by then, especially before the real 100-transaction run.

### Updated pre-mainnet checklist status

- ~~`config.js` dead-code cleanup~~ — **DONE**, deployed (`c79e32b`).
- **Merchant list live-badge fix** — written, **not yet deployed or tested**. Next session: build, commit, push, verify against a real merchant on Basescan.
- **EURC approved on `SubscriptionVault`** — **DONE**, confirmed on-chain (`approvedTokens(EURC) == true`).
- **`merch test` re-approved** after earlier revoke-testing left it in the wrong state — **DONE**, confirmed on-chain.
- **New, important, standing fact to remember:** `SubscriptionVault`'s admin is the Safe multisig (2-of-2: Ledger + "PK Signer 2 Multi-Sig" MetaMask), not the Deployer wallet. Any future `onlyAdmin` vault call (fee changes, keeper address changes, treasury changes, further token approvals, etc.) needs to go through the Safe, not a direct Basescan write from Deployer.
- **Volume test — still not run.** `create-test-subscriptions.js` exists and is unblocked (both tokens approved, merchant approved), but has not yet completed a successful run due to the RPC outage. Next session: switch to Alchemy RPC, rerun with `TOTAL_SUBSCRIPTIONS = 6` first to confirm end-to-end success (including the EIP-712 permit signing, which has never yet been proven working in practice), then scale toward the real 100-transaction test.
- `fund-test-wallet-multi.js`'s own budget-math bug (`MAX_CLAIMS_TOTAL` vs. combined `targetEth`) — noted, not fixed, low urgency since ETH isn't the test's constraint.
- Everything else unchanged from §39: `PayPage.jsx` pre-flight `isApproved()` check, SaaS tier billing → tier access linkage, slide 11 founder bio claim, MerchantRegistry admin transfer to the Safe (deferred to mainnet — note this is now confirmed to be a *different, still-pending* transfer from the Vault's, which is already done), AuthOnce Lda. incorporation, Safe 2-of-3 signer, Hashlock audit-scope email still unsent, autovacuum tuning, `keeper_pull_attempts` investigation, WooCommerce `external_ref` `/link` retry logic, Base Ecosystem Fund reply still awaited.

*Last updated: 2026-08-18*

---

## 41. Session Summary — August 20 2026 (RPC outage resolved, first real subscription confirmed; CDP faucet API isolated as a Coinbase-side account issue via their own CLI; Alchemy free tier exhausted — confirmed root cause is keeper.js's polling design, not testnet activity; AUTHONCE-BACKLOG.md created as a structural fix for how work gets tracked)

### RPC outage from §40 — resolved on its own, confirmed

Two days after §40's pause, `create-test-subscriptions.js`'s first `approvedTokens` check succeeded immediately — the public Base Sepolia endpoint's outage had cleared. Continuing the run produced the **first-ever real, confirmed success**: Subscriber 1's USDC subscription created on-chain (permit signing included), tx `0xafa0616919d65fd94cd0ecdf254b7afed1441c91115072f6db256fc48161a02e`. This is the first time the EIP-712 permit signing path in the script has been proven working in practice, not just written.

### Real blockers found on the next run — both fixed

- **Subscriber 2 (Account 7) and Subscriber 3 (Account 8) had zero ETH** — never funded. Only Subscriber 1 had testnet ETH from earlier sessions. `fund-test-wallet-multi.js` updated to add all three subscriber wallets (0.0005 ETH target each — generous margin for the eventual ~35-50 creation transactions per wallet needed for the real 100-subscription test), listed *first* in the `WALLETS` array so their tiny combined budget (0.0015 ETH = 15 claims) is guaranteed to clear before the pre-existing Safe/Deployer/Keeper budget-math issue (flagged in §40) can interfere. Also raised `MAX_CLAIMS_TOTAL` from 750 to 950 while in the file, since 750 was already below just Safe+Deployer+Keeper's combined target on its own.
  **File:** `C:\authonce-faucet\fund-test-wallet-multi.js` — updated, given to Vasco, not yet confirmed saved/run as of this writing.
- **Genuine RPC rate limit** on Subscriber 1's EURC attempt (`-32016 over rate limit`) — from 3 wallets firing near-simultaneously against the public endpoint. Root cause turned out to be moot once the Alchemy switch was made (see below), though the underlying Alchemy account then hit its own separate cap.
- **`.env` location bug in the script itself, found and fixed:** `dotenv` only looks in the current working directory by default; the script lives in `scripts/` but `.env` lives at the project root. Fixed via `require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") })`.
  **File:** `scripts/create-test-subscriptions.js`

### CDP faucet API — isolated conclusively as a Coinbase-side account/project issue, not local

Continuing to chase the `"Unauthorized"` error from earlier sessions:

- **Confirmed the credentials weren't the problem.** Fully wiped and regenerated both the API Key and Wallet Secret together (not incrementally) — still failed identically.
- **Ruled out `.env` naming/truncation** — checked variable names and value lengths directly (`CDP_API_KEY_ID` 36 chars, `CDP_API_KEY_SECRET` 88 chars, `CDP_WALLET_SECRET` 184 chars), all correct and unchanged from before rotation.
- **Ruled out the wrong-permission-page theory** (the "Coinbase App & Advanced Trade" checkboxes with View/Trade/Transfer/Receive) — confirmed via Coinbase's own CLI documentation that faucet access has nothing to do with those toggles at all; that page governs a separate retail-trading product, not the CDP Wallet/Onchain API.
- **Decisive test:** installed Coinbase's own official `@coinbase/cdp-cli` tool, configured it with the same freshly-rotated credentials via `cdp env live --key-id ... --key-secret ...` and `cdp env live --wallet-secret ...`, confirmed correct setup via `cdp env` (showed `live` with key ID and `(wallet)` indicator). Ran `cdp evm accounts list` directly — **failed with the identical `401 Unauthorized`**, trace `7179795976991766943`. Since this bypasses our script and the npm SDK entirely, this conclusively rules out anything on our end. It is very likely an account/project-level restriction on Coinbase's side (e.g. the Wallet API/Faucet product not actually enabled for this specific CDP project).
- **Next step, not yet done:** contact Coinbase CDP support directly with the reproducible CLI failure and trace ID above. **Workaround in the meantime:** fund test wallets manually via the CDP portal's own web UI faucet button, which bypasses this broken API auth path entirely — this is how Account 7/8 in fact got funded this session.
- **Third credential exposure incident this project** (after Aug 3-4 and this session's earlier full-value paste): a fragment of `CDP_API_KEY_SECRET` was pasted into chat again mid-debugging. Low urgency to rotate again specifically since the key isn't functional anyway, but should happen once support resolves the underlying issue.

### Alchemy billing — free tier fully exhausted, and the root cause is now proven, not suspected

`create-test-subscriptions.js` hung silently for minutes after switching to an Alchemy RPC URL. Direct isolation test (`Invoke-RestMethod` calling `eth_chainId` directly against the Alchemy URL, bypassing the script) revealed the real cause: **`429 Monthly capacity limit exceeded`** — the free tier's 30M compute-unit allowance was fully consumed, apps paused account-wide.

**Real, hard evidence pulled from Alchemy's dashboard (not inference) directly confirms the structural risk flagged in earlier sessions' review of `keeper.js`:**
- 100% of the 30M CUs came from one app ("Authonce"), one network (Base Sepolia), all HTTP.
- Method breakdown: `eth_call` overwhelmingly dominates (peaking ~6M CUs in a single day) while `eth_blockNumber`/`eth_getTransactionCount`/`eth_getTransactionByHash`/`eth_getTransactionReceipt` stay essentially flat at zero.
- Usage climbed smoothly and continuously from Aug 9 through Aug 17 until hitting the cap — a shape consistent with a 24/7 background service, not occasional manual test sessions.
- `eth_call` is exactly what `keeper.js`'s `processDueSubscriptions` loop generates on every active subscription, every 20-second cycle, regardless of whether that subscription is actually due — the exact risk identified by reading the code in an earlier session, now confirmed with real production billing data. Even a small handful of test subscriptions running continuously in the background was enough to exhaust a 30M/month free tier.

**Cost estimate given (explicitly caveated as based on current usage continuing unchanged, not a guarantee):** roughly $13.50/month on Alchemy's Pay-As-You-Go tier ($0.45/M CUs) at current usage — but this number is expected to drop significantly once the keeper polling fix (see backlog T1) lands, since the fix directly targets the exact `eth_call` volume shown to be the entire problem.

**Not yet decided:** whether to upgrade Alchemy's plan now to unblock testing immediately, or wait for the keeper fix first. Recommendation given: fix `keeper.js` before or alongside any billing decision, since paying for the current inefficiency without fixing it just means paying more as subscriber count grows toward mainnet.

### Structural change: AUTHONCE-BACKLOG.md created

Prompted by Vasco naming a real, recurring pattern directly: sessions repeatedly branch from one task into an unrelated fix into another unrelated fix, with no checkpoint marking task boundaries, no reset between sessions, and this single chat thread having quietly spanned 2026-08-16 through 2026-08-20 (four real days) without any structural marker distinguishing one session's work from the next.

**Response:** built `AUTHONCE-BACKLOG.md` — a flat, numbered, status-tracked list (Business/CEO pains + Technical pains, both ordered by real importance), explicitly designed to replace narrative-only tracking as the thing work gets picked *from*, with CLAUDE-CORE.md remaining the historical *why*-record alongside it. Includes an explicit session-start ritual (upload both files, pick one item, log new problems as new backlog lines instead of silently tunneling into them, update statuses before ending) and a status legend (`OPEN`/`IN PROGRESS`/`BUILT, UNVERIFIED`/`BLOCKED`/`DONE`) that requires real verification evidence before anything is marked done, not just "looks right."

**File:** `AUTHONCE-BACKLOG.md`, saved at `C:\The-Opportunity\` — same root location as this file (correcting a stale assumption from earlier project history that these lived at `C:\AuthOnce-Docs\`; that path is no longer accurate).

**T1 (keeper.js polling rewrite) named as the single highest-leverage item on the entire backlog** — it's the one item already causing confirmed, measured real-world damage (this session's Alchemy incident) rather than a theoretical risk, and it's the reason the volume test keeps stalling across multiple sessions. Recommended as the very next thing to work on, before resuming the volume test itself.

### Updated status — going forward, see AUTHONCE-BACKLOG.md for the full authoritative list; this section is now just a pointer, not a duplicate

This is the last session where open items are enumerated in prose here. From next session onward, **AUTHONCE-BACKLOG.md is the single source of truth for open items** — check it directly rather than searching back through CLAUDE-CORE.md's session summaries for outstanding work. This file (`CLAUDE-CORE.md`) continues to record *what happened and why*, session by session, but no longer needs to also serve as the task list.

*Last updated: 2026-08-20*

## 42. Session Summary — August 21–22 2026 (Alchemy PAYG confirmed; T1/T2 evidence strengthened across 4 windows; T16 scoped into mainnet; T17 closed with dashboard proof; T10 status corrected — already pushed; Q3 2026 target removed; direct device access established)

**Alchemy upgraded to Pay-As-You-Go, confirmed via billing screenshot** — monthly, auto-renews Sep 1 2026, $0.45/M CUs (0–300M), matching T5's own Aug 20 cost estimate exactly. T5 closed DONE.

**T1/T2 (keeper polling rewrite) evidence built up across four independent sampling windows over ~24.5 hours** — Aug 21 18:12 (1 cycle), Aug 22 06:17–06:21 (11 cycles), Aug 22 18:22–18:30, and Aug 22 18:44–18:47 (10 cycles). All show ~20–21s cadence, cycle times in the 667–756ms range, no overlap, no repeated boot banners. The earlier "Starting Container" crash-loop suspicion is resolved: it belonged to a separate Railway service (`AuthOnce — Merchant & Admin API`), confirmed by its own distinct boot banner appearing interleaved in the same combined log paste — same explanation applies to an `x-bot` boot banner seen in a later paste. Deliberately still not marked DONE: these are discontinuous snapshots, not continuous multi-day logging, and the real proof of T1's cost benefit (Alchemy CU trend dropping from the Aug 9–17 baseline) still hasn't been observed on the dashboard.

**T16 (keeper has no ERC-1271 pull support) formalized as a numbered item and then explicitly scoped into mainnet.** All 11 currently-skipped subscriptions confirmed via a vault-filtered DB query to be internal test data (owner/merchant addresses match documented test wallets), so there's no live subscriber currently stuck. But Vasco gave explicit direction Aug 22: "everything ready for mainnet... fix as it is found," which removes T16 from the "decide later" pile — ERC-1271 support is now required work, not optional, given AI-agent/smart-wallet support is a stated core value prop. Flagged clearly that this is real engineering (signing per SV pull digest, ERC-1271 verification round-trip), not a same-session fix, and needs its own estimate before being sequenced against T1/T2/T4.

**T17 — 4th credential-exposure incident on this project (Alchemy key pasted in plaintext in a boot log) — closed with real evidence, not just the rotation claim.** Vasco rotated the key in Railway + `.env`, then provided an Alchemy dashboard screenshot (Aug 22 ~21:08): 24h Request Health at 0% invalid / 0% throughput-limited, plus a live 5-minute request log (`eth_getLogs`/`eth_chainId`/`eth_blockNumber`/`eth_call`, all HTTP 200, 0–2ms, zero errors). This is the same verification standard applied to catch the x-bot's silently-broken DB connection weeks earlier (§20/§25) — this time the evidence held up. One standing assumption not independently re-verified: that Alchemy's key reset invalidates the old key value immediately (standard behavior); if a second key had been added without revoking the first, this traffic alone wouldn't distinguish which key served it.

**T10 status corrected — the prior "local unpushed diff in AdminDashboard.jsx" claim was stale and wrong.** With direct device access to `C:\The-Opportunity` (see below), `git diff` on `AdminDashboard.jsx` came back empty — zero uncommitted changes. `git reflog show origin/main` confirmed commit `aa8430e` ("remove DB-only fake approve/revoke buttons from merchant list row") was pushed to `origin/main` on Aug 16. Local `main` and `origin/main` are identical at `087e3ec` — the same commit backing the T1/T2 keeper fix, with `c79e32b` (T15's dead-`wagmiConfig` cleanup) one commit earlier in the same chain. The real open question on T10 isn't build-or-push, it's deployment: the repo has both a `netlify.toml` and a `frontend/railway.json`, and **Vasco confirmed Netlify is no longer in use** — Railway is the live frontend host, deploy history there is what needs checking against `aa8430e` or later, plus a live on-chain `isApproved()` verification against Basescan.

**Mainnet timeline: Q3 2026 target removed from the backlog, not softened — removed.** Two facts converged: Hashlock's audit payment terms are confirmed full-amount-upfront with no deposit/milestone option and not open to negotiation, and B6 funding remains externally blocked (no reply from Base Ecosystem Fund, Circle Alliance needs mainnet traction AuthOnce doesn't have yet, IAPMEI pending). Chaining funding-arrives → audit-starts → audit-completes → mainnet inside any fixed near-term date is not realistic while every link is unstarted and funding is unpaced. Backlog item B4a added to carry this explicitly: no fixed mainnet date is carried in `AUTHONCE-BACKLOG.md` until B6 funding actually lands and B4's Hashlock scope quote is in hand. Note this project's own Project description/custom instructions on claude.ai still state "Q3 2026" — that's outside what any session can edit from here; only Vasco can change it directly in project settings.

**Direct device access established — this session was granted read/write access to `C:\The-Opportunity`** (Vasco's actual working repo) via the desktop device bridge, moving past the prior workflow of manually copy-pasting `CLAUDE-CORE.md` and `AUTHONCE-BACKLOG.md` content back and forth between chat and the local repo. Working agreement set for code changes going forward: edits get made and committed locally on Vasco's machine (via the device bridge), Vasco reviews and pushes to GitHub himself — except anything touching `contracts/`, `keeper.js`'s pull/signing logic, or code adjacent to `executePull()`, where a full diff gets shown *before* even committing, no exceptions, given this is fund-adjacent logic on a non-custodial protocol run by a solo founder with no one else to catch a mistake. Full unsupervised autonomy (edit + commit + push with no review) was explicitly not adopted, and pushing to GitHub isn't mechanically possible from the device bridge shell anyway — no network access there.

**New finding, not yet triaged: authonce.io is broken on mobile.** Vasco checked the live site on a phone and called it "a disaster" — no specifics yet on which pages or what actually breaks. Logged as a new backlog item (B9) per this file's own discipline (surface new problems as backlog lines, don't silently absorb them into whatever's already being worked). Needs Vasco to describe or screenshot the actual failure before this can be scoped.

*Last updated: 2026-08-22*
