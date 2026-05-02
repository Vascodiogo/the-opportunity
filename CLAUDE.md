# CLAUDE.md — Project Memory
## AuthOnce: Non-Custodial USDC Subscription Protocol

> This file is the single source of truth for all project decisions.
> Every coding session must begin by reading this file.
> Every significant decision made during development must be recorded here.

---

## 1. Project Overview

**Name:** AuthOnce
**Tagline:** Authorize once. Pay forever. Stay in control.
**Domain:** authonce.io (Namecheap)
**Purpose:** A non-custodial recurring payment protocol on Base Network. Merchants present subscription bills; subscribers authorize once and payments execute automatically via a keeper bot. The protocol never holds funds.
**MVP Target:** Base Network mainnet — planned Q3 2026.
**Founder:** Vasco Humberto dos Reis Diogo (solo, Swiss resident, Portuguese citizen). Full-time at Hinti GmbH (ASSA ABLOY). Building AuthOnce in spare time. Exit target: €3–10M sale, retire at 54–55.
**Legal entity:** Swiss Association (in formation). Sister pending confirmation as Secretary/Treasurer.
**Local docs:** `C:\AuthOnce-Docs\` — BusinessPlan v2, FinancialProjections, GrantMemo, TechnicalDocs.

---

## 2. The Stack

| Layer | Technology | Status |
|---|---|---|
| Smart Contracts | Solidity via Hardhat (not Foundry) | ✅ Deployed Base Sepolia |
| Chain | Base Network | ✅ |
| Token | USDC only (hardcoded) | ✅ |
| Keeper Bot | Node.js on Railway | ✅ Running 24/7 |
| Notifier | Node.js on Railway | ✅ Running |
| Backend API | Express.js on Railway | ✅ Built |
| Database | PostgreSQL on Railway | ✅ Schema live |
| Frontend | React + Vite, deployed on Netlify | ✅ Live |
| Auth (current) | MetaMask / RainbowKit | ✅ Working |
| Auth (planned) | Web3Auth (Google/Email login) | ⬜ Not built |
| Fiat Onramp | Stripe Crypto Checkout | ⬜ Not built |
| Stripe Connect | Merchant OAuth flow | ✅ Built in api.js |
| Notifications | Resend (email) + webhook dispatcher | ✅ Built |
| Railway plan | Hobby ($5/month) | ✅ Upgraded |

**Contract addresses (Base Sepolia testnet):**
- `SubscriptionVault.sol`: `0xED9a4322030b2523cBB4eD5479539a3afEe30afA` ✅ v3 — configurable grace period
- `MerchantRegistry.sol`: `0x3124a01D023FA6F0AFDE1e89c6727FE3D0fAa3d5` ✅ v3
- USDC (Base Sepolia): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Contract addresses (Base Mainnet — not yet deployed):**
- USDC (Base Mainnet): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- `SubscriptionVault.sol`: `[DEPLOY AND RECORD HERE]`
- `MerchantRegistry.sol`: `[DEPLOY AND RECORD HERE]`
- Protocol Treasury: `[RECORD HERE]`

---

## 3. Business Rules (Locked — Do Not Change Without Architect Approval)

### 3.1 Payment Initiation
Keeper bot initiates every pull. Only whitelisted keeper address can call `executePull()`. User signs once at subscription creation, never again.

### 3.2 Accepted Token
USDC only. Hardcoded in contract. No other ERC-20 accepted under any circumstances.

### 3.3 Vault Funding Cap (LOCKED)
Subscriber vault is funded at exactly 1× the subscription amount per billing cycle. No over-funding. No remaining balance. No withdrawal or refund UX. This eliminates an entire category of complexity and is architecturally locked.

### 3.4 Insufficient Funds / Grace Period
- Keeper detects insufficient balance → emits `InsufficientFunds` event
- Subscription enters grace period (configurable per subscription, default 7 days)
- Notifier sends alert to subscriber
- Keeper retries daily during grace period
- If not resolved → `expireSubscription()` called → status = Expired
- Grace period is **configurable per subscription** (not hardcoded) — deployed in v3

### 3.5 Billing Intervals
Three intervals: Weekly (7 days), Monthly (30 days), Yearly (365 days). Immutable after subscription creation.

### 3.6 Cancellation Authority
Vault owner OR named guardian can cancel/pause. Only vault owner can resume. Protocol and merchant cannot cancel on behalf of users.

### 3.7 Spending Cap
Hard cap enforced on-chain. Contract reverts if pull amount > subscription.amount. Merchant can never be paid more than agreed.

### 3.8 Custody Model
Protocol never holds funds. USDC sits in subscriber's own Safe vault at all times. `SubscriptionVault` module uses `execTransactionFromModule()` to move USDC only during authorized pulls. Cancellation never moves funds — only revokes permission.

### 3.9 Merchant Access
Invite-only for MVP. Admin approves via `approveMerchant(address)` on MerchantRegistry. Revoked merchants cannot receive new subscriptions; existing active subscriptions continue until user cancels.

### 3.10 Protocol Revenue
0.5% fee per successful pull (default `feeBps = 50`). Hard ceiling at 200 bps (2%) — hardcoded, not upgradeable. Fee split atomically in `executePull()`: merchant receives `amount - fee`, treasury receives `fee`.

### 3.11 Merchant Settlement Choice
Merchants choose at registration how they receive funds:
- **USDC to wallet** — instant, no conversion, no Stripe needed
- **Fiat to bank account** — via licensed offramp partner (Circle/MoonPay/Transak), 1–2 business days, any currency the merchant's bank accepts, USD as default

Both options must be ready at mainnet launch. Subscriber experience is identical either way — always pays in USDC.

### 3.12 Price Changes (setProductExpiry)
Merchants wanting to change subscription pricing must use `setProductExpiry()`. Smart contract enforces a minimum 30-day notice period — cannot be bypassed. Merchants cannot make pricing changes outside of AuthOnce. AuthOnce notifies subscribers automatically.

### 3.13 Notifications
- Basic subscriber notifications (payment failed, grace period warning): **free on all merchant tiers**
- Custom branded email notifications on merchant's behalf: **paid feature (Growth tier €49/month and above)**
- Notification channels: Resend (email) + webhook dispatcher with HMAC-SHA256 signing + 5-attempt exponential backoff retry

---

## 4. Merchant Pricing Tiers

| Tier | Price | Protocol Fee | Notes |
|---|---|---|---|
| Starter | Free | 1.0% per pull | Up to 3 products, hosted pay links, basic dashboard |
| Growth | €49/month | 0.5% per pull | Unlimited products, webhooks, API, basic analytics, branded emails |
| Business | €199/month | 0.3% per pull | Advanced analytics, compliance export, price rollout management |
| Enterprise | Custom | 0.1–0.2% | White-label, custom domain, SLA, dedicated account manager |

---

## 5. Merchant Integration Paths

### Path A — Hosted Pay Links (No-Code)
`https://app.authonce.io/pay/{merchantId}/{productId}` — merchant shares link, AuthOnce handles everything.

### Path B — Checkout Widget / SDK
`npm install @authonce/sdk` — SubscribeButton component, opens modal, fires callback on success.

### Path C — Developer API & Webhooks
REST API at `https://api.authonce.io/v1`. Bearer token auth. HMAC-SHA256 signed webhooks. Events: `payment.success`, `payment.failed`, `subscription.cancelled`, `subscription.expired`. Retry: 10s → 1min → 5min → 30min → 2hr.

---

## 6. Access Control Map

| Action | Who Can Call |
|---|---|
| `executePull(id)` | Keeper bot only |
| `expireSubscription(id)` | Keeper bot only (after grace period) |
| `createSubscription(...)` | Vault owner only |
| `cancelSubscription(id)` | Vault owner OR guardian |
| `pauseSubscription(id)` | Vault owner OR guardian |
| `resumeSubscription(id)` | Vault owner only |
| `setProductExpiry(id, ts)` | Merchant only (min 30-day notice enforced) |
| `approveMerchant(addr)` | Protocol admin only |
| `revokeMerchant(addr)` | Protocol admin only |
| `setFeeBps(bps)` | Protocol admin only (max 200 bps) |
| `setKeeper(addr)` | Protocol admin only |
| `setProtocolTreasury(addr)` | Protocol admin only |

---

## 7. Backend Architecture (Current)

```
scripts/
  keeper.js       — polls subscriptions, executes pulls, expires grace periods
  notifier.js     — listens for on-chain events, sends notifications
  api.js          — Express REST API (merchant registration, admin, Stripe Connect)
  db.js           — PostgreSQL layer (subscriptions, payments, merchants, webhook_deliveries)
  webhook.js      — HMAC-signed webhook dispatcher with retry logic + Resend email fallback
  admin-auth.js   — JWT-based admin authentication (email/password)

Database tables:
  merchants         — wallet_address, settlement_preference, stripe_account_id, IBAN (encrypted AES-256-GCM)
  subscriptions     — indexed from on-chain SubscriptionCreated events
  payments          — indexed from on-chain PaymentExecuted events
  webhook_deliveries — delivery log (success/failure per attempt)
```

**Stripe Connect (fully built in api.js):**
- `GET /api/connect/authorize` — generates OAuth URL
- `GET /api/connect/callback` — handles redirect, saves stripe_account_id
- `GET /api/connect/status` — returns connection status
- `DELETE /api/connect/disconnect` — deauthorizes
- `POST /api/stripe/webhook` — receives Stripe events (signature verified)

**Stripe webhook TODO (mainnet blocker):**
- `payment_intent.payment_failed` → wire to grace period trigger + notifier
- `payment_intent.succeeded` → wire to merchant payment notification

---

## 8. Frontend Architecture (Current)

```
frontend/src/
  App.jsx                        — main app, wallet connect, view switcher
  LandingPage.jsx                — bilingual landing page (EN/PT)
  i18n.js                        — internationalisation
  components/
    Dashboard.jsx                — subscriber view (active subscriptions, admin panel)
    MerchantDashboard.jsx        — merchant portal (Overview, Products & Pay Links,
                                   Subscribers, Webhooks tabs)
```

- Auth: MetaMask via RainbowKit (Web3Auth/social login deferred)
- Light/dark mode toggle with CSS variables and localStorage persistence
- Bilingual: English at authonce.io, Portuguese at authonce.io/pt
- Deployed on Netlify

---

## 9. Development Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Foundry/Hardhat setup, Base Sepolia RPC | ✅ Complete |
| Phase 1 | Contracts (SubscriptionVault v3, MerchantRegistry) | ✅ Complete |
| Phase 2 | Keeper bot + grace period logic | ✅ Complete |
| Phase 3 | Backend API, DB, webhook dispatcher, notifier, admin auth | ✅ Complete |
| Phase 4 | Frontend — Merchant Portal, subscriber dashboard, landing page | ✅ Complete |
| Phase 5 | Stripe webhook → business logic wiring | ⬜ In progress (mainnet blocker) |
| Phase 6 | Geofencing middleware | ⬜ Not started (mainnet blocker) |
| Phase 7 | Legal — Merchant ToS, Privacy Policy, Refund Policy | 🔄 In review |
| Phase 8 | Smart contract audit | ⬜ Not started ($15–20K) |
| Phase 9 | Safe multisig for admin + Ledger hardware wallet | ⬜ Not started |
| Phase 10 | Mainnet deployment | ⬜ Blocked by Phases 5–9 |

---

## 10. Pre-Mainnet Checklist

- [ ] **Stripe webhook → grace period + notifier wiring** — `payment_intent.payment_failed` must trigger grace period and subscriber notification
- [ ] **Geofencing middleware** — `checkGeofence(req, res, next)` on all API routes and frontend edge; HTTP 451 for OFAC regions; IP not logged
- [ ] **Merchant Terms of Service** — legal review in progress; 4 material issues flagged (Stripe flow description, class action waiver, access retention language)
- [ ] **Smart contract audit** — $15–20K budget
- [ ] **Safe multisig** — replace EOA admin with Safe multisig before mainnet
- [ ] **Ledger hardware wallet** — treasury key management
- [ ] **Separate keeper/notifier Railway services** — currently co-located
- [ ] **Full product review** — notification matrix, flows, pricing tiers, end-to-end testing

---

## 11. Legal Documents (authonce.io/legal)

Three documents in `legal.html` — bilingual EN/PT, tabbed interface:
- **Terms of Service** (25 sections) — v0.1 testnet draft
- **Privacy Policy** (16 sections) — GDPR compliant draft
- **Refund Policy** (11 sections) — draft pending legal review

**Open issues (flagged May 2026):**
1. ToS §7 — Stripe flow description inaccurate (fiat does not flow directly to merchant; it goes CC → USDC → vault → merchant)
2. Refund Policy §3 — "retain access until end of billing period" — AuthOnce cannot enforce this; soften language
3. ToS §21 — Class action waiver not enforceable in Portugal/EU — remove or replace
4. Privacy Policy §9 — Privy listed as "(planned)" — remove "(planned)" once integrated
5. ToS §22 — Governing law has inline draft note — clean before mainnet

**Grace period clause (§5 Refund Policy) — RESOLVED:** Correctly states configurable grace period. Contract v3 supports this.

---

## 12. Compliance

- **Non-custodial positioning:** Protocol facilitates, never holds. No FINMA custodian licence required.
- **Geofencing:** OFAC-sanctioned regions blocked at edge (Iran, North Korea, Russia, Syria, Cuba, Belarus). IP used transiently, never stored.
- **Data minimisation:** No PII stored. Primary user identifier = vault address. PII stays with Stripe (card/KYC) and auth provider.
- **GDPR:** Data controller = Vasco Humberto dos Reis Diogo. Will update to AuthOnce Lda. on incorporation. CNPD supervisory authority.
- **Fiat settlement via licensed partners** (Circle/MoonPay/Transak) — partners hold payment licences, not AuthOnce.
- **BUSL-1.1 licence** on protocol code until 2030-01-01, then GPL v2.

---

## 13. Grants & Partnerships

| Programme | Status |
|---|---|
| Coinbase Base Ecosystem Fund | Submitted April 2026 |
| Circle Alliance Program | Submitted April 2026, pending review |
| Base Builder Grants | Apply next |
| IAPMEI (Portugal) | Free consultation — pending |
| Startup Portugal mentorship | Pending |
| Ethereum Foundation | After mainnet |
| Gitcoin | After mainnet |

**Key partnership contact:** Nuno Correia, co-founder of Utrust (crypto payments, SL Benfica). Utrust = one-time payments; AuthOnce = recurring. Complementary. Approach when live on mainnet.

---

## 14. Key Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| Project start | Keeper bot initiates pulls | User signs once; no manual triggers |
| Project start | USDC only | Dominant on Base; simplifies approval logic |
| Project start | Hard spending cap on-chain | Prevents merchant overreach |
| Project start | Funds inside Safe vault | Non-custodial; protocol never holds |
| Project start | Invite-only merchants for MVP | Reduces abuse vectors |
| Project start | 0.5% protocol fee (max 2% hardcoded) | Revenue model with user-protection ceiling |
| Architecture v2 | Hardhat (not Foundry) | Actually used in build |
| Architecture v2 | Gelato replaced by custom keeper on Railway | Cost and control |
| Architecture v2 | Resend for email notifications | Simple, reliable |
| Architecture v3 | Three merchant integration paths | Serves all technical levels |
| Architecture v3 | Webhook HMAC-SHA256 + retry policy | Industry standard; prevents spoofing |
| Architecture v3 | Vault address as primary user identifier | No PII needed |
| Architecture v3 | HTTP 451 for geofenced regions | Correct semantic; signals legal block |
| Architecture v3 | No sweep/emergencyDrain functions | Non-custodial claim must be technically unbreakable |
| 2026-04 | Grace period configurable per subscription (v3) | Merchant flexibility; not hardcoded at 7 days |
| 2026-04 | setProductExpiry() — 30-day minimum notice enforced on-chain | Protects subscribers from sudden price changes |
| 2026-04 | Vault funding capped at exactly 1× subscription amount | Eliminates balance/withdrawal/refund UX complexity |
| 2026-04 | Basic notifications free; branded notifications paid (Growth+) | Protects protocol trust; monetises premium feature |
| 2026-04 | Merchant settlement: USDC or fiat — both ready at mainnet launch | Fiat settlement is not Phase 6; it ships with mainnet |
| 2026-04 | Stripe Connect OAuth flow built in api.js | Foundation for fiat settlement path |
| 2026-05 | Web3Auth preferred over Privy for social login | Cheaper at scale ($79/month vs $499/month at 10K MAU) |

---

## 15. SRO Inquiry

Draft letter prepared but **not yet sent**. Must be reviewed before sending. PolyReg is the target SRO.

---

## 16. Employment Contract

Review needed for **Nebenbeschäftigung** (secondary employment) clause before AuthOnce generates revenue.

---

*Last updated: 2026-05-02 — Full project state captured after code review session.*
*Next actions: Stripe webhook → business logic wiring | Geofencing middleware | Legal docs material issues*
