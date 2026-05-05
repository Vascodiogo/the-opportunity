# CLAUDE.md — Project Memory
## AuthOnce: Non-Custodial USDC Subscription Protocol

> This file is the single source of truth for all project decisions.
> Every coding session must begin by reading this file.
> Every significant decision made during development must be recorded here.

---

## 1. Project Overview

**Name:** AuthOnce
**Tagline:** Authorize once. Pay forever. Stay in control.
**Domain:** authonce.io (Namecheap / Cloudflare DNS)
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
| Frontend | React + Vite, deployed on Netlify | ✅ Live at authonce.io |
| Auth (subscriber) | Google OAuth via Passport.js | ✅ Working — tested May 5 2026 |
| Auth (merchant/admin) | MetaMask / RainbowKit + JWT | ✅ Working |
| Fiat Onramp | Stripe Crypto Checkout | ⬜ Not built |
| Stripe Connect | Merchant OAuth flow | ✅ Built in api.js |
| Notifications | Resend (email) + webhook dispatcher | ✅ Built — domain verified |
| Railway plan | Hobby ($5/month) | ✅ Upgraded |
| DNS | Cloudflare (authonce.io) | ✅ Configured |
| Email sending | Resend — notifications@authonce.io | ✅ Verified May 3 2026 |
| Email receiving | Zoho — vasco@authonce.io | ✅ Working |

**Contract addresses (Base Sepolia testnet):**
- `SubscriptionVault.sol`: `0xED9a4322030b2523cBB4eD5479539a3afEe30afA` ✅ v3 — configurable grace period
- `MerchantRegistry.sol`: `0x3124a01D023FA6F0AFDE1e89c6727FE3D0fAa3d5` ✅ v3
- USDC (Base Sepolia): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Contract addresses (Base Mainnet — not yet deployed):**
- USDC (Base Mainnet): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- `SubscriptionVault.sol`: `[DEPLOY AND RECORD HERE]`
- `MerchantRegistry.sol`: `[DEPLOY AND RECORD HERE]`
- Protocol Treasury: `[RECORD HERE]`

**⚠️ Security note:** Deployer wallet `0x44444D60136Cf62804963fA14d62a55c34a96f8F` private key was exposed in chat May 3 2026. Testnet only — no real value. Must be replaced with new wallet before mainnet. Basescan API key also exposed — rotate before mainnet. Local .env RESEND_API_KEY needs updating (Railway already updated).

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
Vault owner OR named guardian can cancel/pause. Only vault owner can resume. Protocol and merchant cannot cancel on behalf of users. AuthOnce processes cancellations independently — merchant cannot block or delay a subscriber's cancellation.

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
- **USDC to wallet** — instant, no conversion, no Stripe needed. **Recommended — most profitable for merchant.**
- **Fiat to bank account** — via licensed offramp partner (Circle/MoonPay/Transak), 1–2 business days, USD as default. Additional conversion fees on top of 0.5%.

Both options must be ready at mainnet launch. Merchant can change settlement preference anytime from dashboard. Subscriber experience is identical — always pays in USDC. UI must clearly communicate USDC is most profitable.

### 3.12 Price Changes (setProductExpiry)
Merchants wanting to change subscription pricing must use `setProductExpiry()`. Smart contract enforces a minimum 30-day notice period — cannot be bypassed. AuthOnce notifies subscribers automatically 30 days before any price change takes effect.

### 3.13 Notifications
- Basic subscriber notifications (payment failed, grace period warning, payment confirmed): **free on all tiers — sent by AuthOnce from notifications@authonce.io**
- Custom branded email notifications on merchant's behalf: **paid feature (Growth tier €49/month and above)**
- Subscriber notified **3 days before** each scheduled payment
- Notification channels: Resend (email) + webhook dispatcher with HMAC-SHA256 signing + 5-attempt exponential backoff retry

### 3.14 Subscriber Payment Methods (LOCKED)
Payment method chosen at subscription creation is used for all subsequent recurring pulls. Consistency is the core principle — no surprises.
- **Credit/debit card** — global, via Stripe Crypto Checkout
- **MB Way** — Portugal only. One-time authorisation; automatic pulls thereafter.
- **Multibanco** — Portugal only. New reference generated and sent by SMS/email before each billing cycle.
- **USDC wallet** — global, crypto-native users.

### 3.15 Subscriber Portal
`authonce.io/my-subscriptions` — email magic link login (no password, no wallet). Magic links valid 15 minutes, single use. Primary cancellation channel. Cancel/pause/payment history.

### 3.16 Cancellation Contact (Option C — LOCKED)
Primary: `authonce.io/my-subscriptions` (self-service)
Technical issues: `support@authonce.io`
Merchant service questions: contact Merchant directly

---

## 4. Merchant Pricing Tiers

| Tier | Price | Protocol Fee | Notes |
|---|---|---|---|
| Starter | Free | 1.0% per pull | Up to 3 products, hosted pay links, basic dashboard |
| Growth | €49/month | 0.5% per pull | Unlimited products, webhooks, API, analytics, branded emails |
| Business | €199/month | 0.3% per pull | Advanced analytics, compliance export, price rollout management |
| Enterprise | Custom | 0.1–0.2% | White-label, custom domain, SLA, dedicated account manager |

**Notification rules by tier:**

| Notification | Starter | Growth+ |
|---|---|---|
| Payment failed → subscriber | ✅ AuthOnce sends | ✅ AuthOnce sends |
| Grace period warning → subscriber | ✅ AuthOnce sends | ✅ AuthOnce sends |
| Payment confirmed → subscriber | ✅ AuthOnce sends | ✅ Can be merchant-branded |
| Custom merchant emails | ❌ | ✅ |

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
  notifier.js     — listens for on-chain events, sends notifications (polling v3)
  api.js          — Express REST API (merchant registration, admin, Stripe Connect)
  db.js           — PostgreSQL layer (subscriptions, payments, merchants, webhook_deliveries)
  webhook.js      — HMAC-signed webhook dispatcher with retry + Resend email fallback
  admin-auth.js   — JWT-based admin authentication (email/password)

Database tables:
  merchants         — wallet_address, settlement_preference, stripe_account_id, IBAN (AES-256-GCM)
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
- Note: Stripe onramp flow must be built first — webhook handlers depend on metadata structure from onramp.

---

## 8. Frontend Architecture (Current)

```
frontend/src/
  App.jsx                        — main app, wallet connect, view switcher
  LandingPage.jsx                — bilingual landing page (EN/PT)
  i18n.js                        — internationalisation
  components/
    Dashboard.jsx                — subscriber view (active subscriptions, admin panel)
    MerchantDashboard.jsx        — merchant portal (Overview, Products, Subscribers, Webhooks)
```

- Auth: Web3Auth (Google/email) for all users — MetaMask/RainbowKit stays as optional path for crypto-native users only. No user is required to install MetaMask.
- Merchant flow: Apply on landing page → AuthOnce approves → email login via Web3Auth → Merchant Dashboard. Fiat merchants need no wallet — just IBAN. USDC merchants provide any wallet address (Coinbase deposit address works).
- Subscriber flow: authonce.io/pay/:merchantId/:productId → Google login → Stripe payment → invisible wallet created → subscription live.
- Admin flow: authonce.io/admin → JWT email/password → Admin Dashboard.
- Light/dark mode with CSS variables and localStorage
- Bilingual: EN at authonce.io, PT at authonce.io/pt
- Deployed on Netlify — live
- Admin: authonce.io/admin (JWT login, no wallet needed)
- **Subscriber portal: authonce.io/my-subscriptions — NOT YET BUILT**
- **Pay link page: authonce.io/pay/:merchantId/:productId — NOT YET BUILT**
- Launch App button removed from LandingPage.jsx nav — needs restoring or replacing

---

## 9. Development Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Hardhat setup, Base Sepolia RPC | ✅ Complete |
| Phase 1 | Contracts (SubscriptionVault v3, MerchantRegistry) | ✅ Complete |
| Phase 2 | Keeper bot + grace period logic | ✅ Complete |
| Phase 3 | Backend API, DB, webhook dispatcher, notifier, admin auth | ✅ Complete |
| Phase 4 | Frontend — Merchant Portal, subscriber dashboard, landing page | ✅ Complete |
| Phase 5 | Stripe onramp + webhook → business logic wiring | ⬜ Not started (mainnet blocker) |
| Phase 6 | Geofencing middleware | ⬜ Not started (mainnet blocker) |
| Phase 7 | Legal — ToS, Privacy Policy, Refund Policy, Subscriber Terms | 🔄 In review |
| Phase 8 | Smart contract audit | ⬜ Not started ($15–20K) |
| Phase 9 | Safe multisig for admin + Ledger hardware wallet | ⬜ Not started |
| Phase 10 | Subscriber portal (authonce.io/my-subscriptions) | ⬜ Not started (mainnet blocker) |
| Phase 11 | MB Way + Multibanco integration (Portugal launch) | ⬜ Not started |
| Phase 12 | Mainnet deployment | ⬜ Blocked by Phases 5–11 |

---

## 10. Pre-Mainnet Checklist

### Code
- [ ] Stripe onramp flow — card/MB Way/Multibanco → USDC → vault (build before webhook wiring)
- [ ] Stripe webhook wiring — `payment_intent.payment_failed` → grace period + notifier
- [ ] MB Way + Multibanco integration — Portugal via Stripe
- [ ] Geofencing middleware — HTTP 451 for OFAC regions, IP not logged
- [ ] Subscriber portal — authonce.io/my-subscriptions, email magic link, cancel/pause/history
- [ ] 3-day pre-payment notification — not wired
- [ ] Price change 30-day notification — not wired
- [ ] Notification tier enforcement — Starter vs Growth+ branded emails
- [ ] Merchant settlement change UI — switch USDC ↔ fiat from dashboard
- [ ] Separate keeper/notifier Railway services

### Infrastructure
- [ ] New deployer wallet — current key exposed May 3 2026
- [ ] Rotate Basescan API key — exposed May 3 2026
- [ ] Update local .env RESEND_API_KEY (Railway already updated)
- [ ] Safe multisig for admin
- [ ] Ledger hardware wallet
- [ ] Smart contract audit ($15–20K)

### Legal
- [ ] ToS §7 — fix Stripe flow description
- [ ] ToS §21 — remove class action waiver
- [ ] ToS §22 — remove inline draft note
- [ ] Refund Policy §3 — soften access retention language
- [ ] Privacy Policy §9 — remove "(planned)" from Privy
- [ ] Subscriber Terms — 4 fixes: notification sender, cancellation Option C, EU withdrawal, contact split
- [ ] Legal docs — add merchant tier notification rules
- [ ] Portuguese lawyer review — MB Way/Multibanco, DL 24/2014

### Social
- [ ] Post @AuthOnce Twitter thread (5 tweets, character-checked, ready)
- [ ] Post @authonce Farcaster first post

---

## 11. Legal Documents (authonce.io/legal)

Four documents in `legal.html` — bilingual EN/PT, tabbed:
- **Terms of Service** (25 sections) — v0.1 testnet draft
- **Privacy Policy** (16 sections) — GDPR draft
- **Refund Policy** (11 sections) — draft pending legal review
- **Subscriber Terms** (12 sections) — v0.1 drafted May 3 2026 — 4 fixes pending

**Open issues:**
1. ToS §7 — Stripe flow inaccurate
2. Refund Policy §3 — access retention language too strong
3. ToS §21 — class action waiver not enforceable in EU
4. Privacy Policy §9 — Privy "(planned)" label
5. ToS §22 — governing law draft note
6. Subscriber Terms — notification sender, cancellation Option C, EU withdrawal, contact split

---

## 12. Compliance

- **Non-custodial:** Protocol facilitates, never holds. No FINMA custodian licence required.
- **Geofencing:** OFAC regions blocked at edge. IP transient, never stored.
- **Data minimisation:** No PII stored. Vault address as primary identifier. Phone for MB Way/Multibanco only.
- **GDPR:** Data controller = Vasco Humberto dos Reis Diogo. CNPD supervisory authority.
- **Fiat settlement via licensed partners** (Circle/MoonPay/Transak).
- **BUSL-1.1** until 2030-01-01, then GPL v2.
- **Portugal:** MB Way/Multibanco authorisation clauses need Portuguese lawyer review.

---

## 13. Grants & Partnerships

| Programme | Status |
|---|---|
| Coinbase Base Ecosystem Fund | Submitted April 2026 |
| Circle Alliance Program | Submitted April 2026, pending |
| Base Builder Grants | ✅ Submitted May 3 2026 — awaiting response |
| IAPMEI (Portugal) | Pending |
| Startup Portugal mentorship | Pending |
| Ethereum Foundation | After mainnet |
| Gitcoin | After mainnet |

**Key contact:** Nuno Correia, co-founder Utrust. Approach after mainnet.

---

## 14. Social & Community

| Channel | Handle | Status |
|---|---|---|
| Twitter | @AuthOnce | ✅ Created — 0 posts, thread ready |
| Twitter | @VascoAlgoTrader | ✅ 586 followers, bio updated |
| Farcaster | @authonce | ✅ Created May 3 2026 |
| Website | authonce.io | ✅ Live |

---

## 15. Key Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| Project start | Keeper bot initiates pulls | User signs once |
| Project start | USDC only | Dominant on Base |
| Project start | Hard spending cap on-chain | Prevents merchant overreach |
| Project start | Funds inside Safe vault | Non-custodial |
| Project start | Invite-only merchants for MVP | Reduces abuse |
| Project start | 0.5% fee (max 2% hardcoded) | Revenue with user ceiling |
| Architecture v2 | Hardhat (not Foundry) | Actually used |
| Architecture v2 | Gelato → custom keeper on Railway | Cost and control |
| Architecture v2 | Resend for email | Simple, reliable |
| Architecture v3 | Three integration paths | All technical levels |
| Architecture v3 | Webhook HMAC-SHA256 + retry | Industry standard |
| Architecture v3 | Vault address as primary identifier | No PII needed |
| Architecture v3 | HTTP 451 for geofenced regions | Correct semantic |
| Architecture v3 | No sweep/emergencyDrain | Non-custodial unbreakable |
| 2026-04 | Grace period configurable per subscription (v3) | Merchant flexibility |
| 2026-04 | setProductExpiry() 30-day notice on-chain | Subscriber protection |
| 2026-04 | Vault funding 1× subscription amount | Eliminates UX complexity |
| 2026-04 | Basic notifications free; branded paid (Growth+) | Trust + monetisation |
| 2026-04 | Fiat settlement ships with mainnet | Not Phase 6 |
| 2026-04 | Stripe Connect built in api.js | Fiat settlement foundation |
| 2026-05 | Web3Auth over Privy | $79 vs $499/month at 10K MAU |
| 2026-05 | Payment method at signup = all recurring pulls | Consistency, no surprises |
| 2026-05 | Subscriber portal via email magic link | Portugal-first, no wallet needed |
| 2026-05 | MB Way + Multibanco — Portugal Phase 1 | Primary market, Stripe supports both |
| 2026-05 | USDC recommended as most profitable to merchants | Transparent, reduces complexity |
| 2026-05 | Merchant can change settlement preference anytime | Flexibility |
| 2026-05 | Cancellation: Option C — self-service, support, merchant | Scalable, clear split |
| 2026-05 | Subscriber notified 3 days before each payment | EU best practice |
| 2026-05 | Base Builder Grants — no equity, no strings | Preserves clean exit |
| 2026-05 | Resend domain verified — notifications@authonce.io | Production email ready |

---

## 16. SRO Inquiry

Draft prepared, **not yet sent**. Review before sending. Target: PolyReg.

---

## 17. Employment Contract

Reviewed May 2026 — **no issues** with Nebenbeschäftigung clause.

---

## 18. DataOnce — Phase 2 Product Vision

**Name:** DataOnce
**Domain:** dataonce.io — register May 25 2026 (salary day)
**Concept:** Users own their personal data in an encrypted on-chain vault. Companies pay subscribers directly via the AuthOnce protocol to access consensual, verified data. AuthOnce is the payment rail — never the data broker.

**Why it's different from Ocean Protocol:**
Ocean Protocol trades bulk datasets between data scientists and enterprises. DataOnce is consumer-facing — real subscribers with verified payment behaviour, tied to a trust relationship that no data broker can replicate.

**Revenue model (AuthOnce profits without touching data):**

| Stream | How |
|---|---|
| Protocol fee | 0.5% of every data access payment between company and subscriber |
| Data buyer API access | Companies pay monthly SaaS fee to access the data marketplace |
| Subscriber premium tier | €2–5/month for advanced vault controls, earnings dashboard, auto opt-out rules |
| Protocol licensing | Developers/fintechs licence AuthOnce+DataOnce stack — flat fee or revenue share |

**Data categories (all handled by `data_category` column):**
- `subscription_behaviour` — on-chain verified, highest value, available immediately
- `spending_categories` — types of services subscribed to
- `subscription_loyalty` — tenure, upgrade/downgrade patterns
- `payment_method_preference` — card, MB Way, Multibanco, USDC
- `demographic` — age range, gender, occupation, household size (self-declared)
- `location_region` — country/region only, never precise
- `health_lifestyle` — activity, sleep, fitness (connected account)
- `financial_profile` — income range, spending habits (self-declared or bank-linked)
- `browsing_interests` — topics of interest (browser extension, local only)
- `digital_behaviour` — app usage, device type, content consumption
- `professional` — industry, company size, job function
- `commerce_retail` — purchase frequency, brand loyalty, price sensitivity

**Data sources (`data_source` column):**
- `authonce_onchain` — verified from blockchain — highest trust, highest price
- `authonce_payment` — from payment behaviour — high trust
- `stripe_verified` — KYC-verified via Stripe
- `self_declared` — subscriber filled in form — lower trust
- `connected_account` — linked bank/fitness/Google account
- `browser_extension` — local browsing data — unverified

**Database:** `data_consents` table added to db.js May 3 2026. Full schema with GDPR compliance columns: `consent_given_at`, `consent_version`, `legal_basis`, `ip_country`, `revoked_at`, `purpose`, `data_buyer_name`, `verification_level`, `data_source`, `total_earned`, `access_count`, `last_accessed_at`.

**How to design it in now (done):**
- ✅ `data_consents` table in PostgreSQL schema — complete
- ⬜ `/api/data/` route namespace in api.js — placeholder to add
- ⬜ Safe vault architecture supports encrypted data storage alongside USDC

**Legal:** Add brief note to Privacy Policy before mainnet — "AuthOnce is developing DataOnce, a voluntary data monetisation feature. Subject to separate privacy impact assessment before launch."

**Tracking:** All DataOnce decisions recorded in this section. When build starts, create `DATAONCE.md` as separate project file.

**Status:** Schema designed and built into db.js. Build after AuthOnce mainnet launch.

**Open questions for DataOnce build:**
- [ ] Encrypted data storage layer — IPFS vs on-chain vs off-chain encrypted DB
- [ ] Access control mechanism — how does data buyer query without seeing raw data
- [ ] Compute-to-data vs raw access — privacy-preserving queries
- [ ] Pricing discovery — how does subscriber know what their data is worth
- [ ] Data buyer onboarding — KYC/AML requirements for companies buying data
- [ ] Portuguese lawyer review — GDPR data marketplace compliance
- [ ] Mobile access — subscriber portal at authonce.io/my-subscriptions with "My Data" tab (Option A). Convert to PWA when user base grows.

---

## 19. QR Code Access Feature

**What it is:** When a subscriber pays their first payment via AuthOnce, they receive a unique QR code — proof of active subscription. Physical merchants (gyms, clubs, coworking spaces) scan it at entry. If subscription active → access granted. If expired or cancelled → access denied.

**Technical flow:**
```
First payment confirmed
→ AuthOnce generates signed JWT QR code
→ Contains: subscription_id, merchant_address, subscriber_address, valid_until, status
→ Subscriber receives QR in email + subscriber portal
→ Merchant scans QR → calls GET /api/subscriptions/verify/{qr_token}
→ Returns: active/expired/cancelled + subscriber tier
→ Merchant turnstile/door opens or stays closed
```

**What needs to be built:**
- QR generation on first payment confirmation — 1 day
- `GET /api/subscriptions/verify/:token` endpoint — half day
- QR display in subscriber portal and email — half day
- Merchant scanner integration — webhook, merchant responsibility

**DataOnce connection:**
Every scan generates behaviour data subscriber owns:
- Entry/exit timestamps
- Visit frequency and patterns
- Day of week preferences
This data can be monetised via DataOnce with subscriber consent.

**Why this is powerful for Portugal:**
Gyms are the most common recurring subscription business in Portugal. QR access eliminates plastic cards, expired memberships still getting in, and chargebacks from cancelled cards.

**Door type compatibility:**

| Door type | AuthOnce integration | Fit |
|---|---|---|
| Smart lock (Yale, Nuki, August) | API call revokes access automatically | ✅ Perfect |
| Electronic fob/card system | QR code replaces fob — revoked instantly | ✅ Perfect |
| Intercom with app (Akuvox, 2N) | API integration possible | ✅ Good |
| Traditional key lock | No integration possible | ❌ Manual only |

**Real estate use case:**
AuthOnce as recurring rent collection infrastructure. Tenant authorises once — rent pulls automatically every month. No late payments, no bank transfers, no chargebacks. Payment history on-chain — auditable for tax. If payment fails → grace period → subscription expires → QR/smart lock access revoked automatically.

AuthOnce does NOT handle eviction — that remains the landlord's legal responsibility under local tenancy law. AuthOnce revokes digital access only. This is a feature, not a limitation — neutral infrastructure that doesn't make legal decisions.

**Best real estate targets (digital access already in place):**
- Coworking spaces — electronic access standard
- Student accommodation — fob systems common
- Short-term rentals — smart locks common (Airbnb hosts use Nuki/August)
- Office buildings — electronic access standard
- Traditional residential — payment automation works, physical access revocation manual

**Status:** Designed. Build at mainnet launch alongside subscriber portal.

---

## 20. Portugal Beta Merchant Targets — Gyms

**Target segment:** Gym chains — perfect fit for AuthOnce QR access + recurring subscriptions.

**Why gyms:**
- Recurring monthly/annual subscriptions ✅
- Physical access control problem AuthOnce solves ✅
- Chargeback and cancellation penalty problems ✅
- Large subscriber bases = high transaction volume ✅

**The pitch:**
> "No more plastic cards. No more chargebacks. No more cancellation disputes. Subscribers pay via AuthOnce — QR code grants access automatically. Subscription expires → access revoked instantly. 0.5% fee vs 2.9% + chargebacks with Stripe."

**Target chains:**

| Chain | Segment | Monthly fee | Notes |
|---|---|---|---|
| Fitness Hut | Low-cost | €20-30/month | Biggest operator in Portugal, 30+ sites, most agile |
| Solinca | Mid-market | €40/month | Shopping mall locations, good tech adoption |
| Holmes Place | Premium | €59-67/month | Largest revenue but most corporate, approach last |

**Contact timing:** After mainnet launch (Q3 2026) with working product + QR demo.

**First target:** Fitness Hut — largest, most agile, budget-conscious (AuthOnce saves them fees).

**Research needed before contact:**
- [ ] Find Head of Operations / Partnerships at Fitness Hut Portugal
- [ ] Find equivalent contact at Solinca
- [ ] Find IT/Digital Director at Holmes Place Portugal
- [ ] Research their current payment/access system (likely proprietary card system)
- [ ] Prepare gym-specific pitch deck

**Additional Portuguese subscription businesses to target (beyond gyms):**
- Coworking spaces (Second Home, Selina, Heden)
- Yoga/pilates studios (independent, no card readers)
- Swimming clubs
- Martial arts academies
- Portuguese SaaS companies (Jscrambler, Coverflex, Datasailr)

---

## 21. Merchant Dashboard Analytics Roadmap

**Goal:** ChartMogul-level analytics built natively. All data already exists in PostgreSQL — this is a frontend + API exercise.

**What already exists in MerchantDashboard.jsx:**
- Active subscriber count ✅
- MRR calculation ✅
- Gross/net revenue ✅
- Subscriber status breakdown ✅
- Products, Subscribers, Webhooks, Settings tabs ✅

**What needs to be built (priority order):**

| Priority | Feature | Effort |
|---|---|---|
| 1 | MRR growth chart — 6 months line graph (Chart.js) | 3h |
| 2 | Date range filter | 3h |
| 3 | Churn rate + new subscriber stat cards | 2h |
| 4 | Filter by product/plan | 2h |
| 5 | ARR + subscriber LTV metrics | 2h |
| 6 | Subscriber detail view — payment history per subscriber | 4h |
| 7 | Invoice generation and download | 6h |
| 8 | Settlement preference UI — change USDC ↔ fiat from dashboard | 3h |
| 9 | Trial-to-paid conversion rate (when free trials added) | 2h |

**Planned build session:** Weekend of May 10–11 2026
- Saturday 9am–3pm — backend API endpoints (MRR history, churn, filters)
- Sunday 9am–3pm — frontend charts, filter UI, subscriber detail view

**Total estimated effort:** ~25 hours across 2 weekends if needed.

---

## 22. Session Start Priorities

Every coding session must begin in this order. Do not skip ahead.

1. **Web3Auth integration** — subscriber invisible wallet (Google/email login)
2. **Stripe onramp** — card/MB Way/Multibanco → USDC → subscriber vault
3. **Stripe webhook wiring** — payment events → grace period + notifier
4. **Subscriber portal** — authonce.io/my-subscriptions with magic link login
5. **Geofencing middleware** — HTTP 451 for OFAC regions
6. **Merchant dashboard analytics** — MRR chart, churn, filters

**This week (May 4–9) target:**
- Monday: Web3Auth account + SDK + Google login
- Tuesday: Stripe Crypto Checkout setup + test keys
- Wednesday: Pay link page — login + payment UI
- Thursday: Webhook wiring + end-to-end test
- Friday: Buffer
- Saturday–Sunday: Merchant dashboard analytics

---

## 23. Mainnet Schedule (20 Weeks)

| Phase | Dates | Focus |
|---|---|---|
| Phase 1 | May 3–31 | Stripe onramp — Web3Auth + card/MB Way/Multibanco → USDC |
| Phase 2 | Jun 1–28 | Subscriber portal — magic link, cancel/pause, QR code, notifications |
| Phase 3 | Jun 29–Jul 26 | Security — geofencing, new deployer wallet, Safe multisig, Ledger |
| Summer | Jul–Aug | Reduced capacity — audit kick-off, Portuguese lawyer review, legal fixes |
| Phase 4 | Aug 10–Sep 30 | Audit fixes, mainnet deployment, first merchant, PR push |

**Target mainnet date: end of September 2026.**

---

## 24. Admin Dashboard — Merchant Approval UI

**Current process (manual):**
Merchant applies via landing page → email received → go to Basescan → MerchantRegistry → Write Contract → `approveMerchant(address)` → sign transaction. Works for first 10 founding merchants.

**Planned UI (Saturday May 10):**
- Pending merchant applications list in Admin Dashboard
- One-click Approve button → calls `approveMerchant()` on-chain
- Requires wallet connected in admin panel (MetaMask or Ledger via MetaMask)
- Merchant receives approval email automatically via Resend

**Ledger integration:**
When Ledger arrives — connect Ledger to MetaMask. Admin approval flow stays identical but private key never leaves hardware. Physical button confirmation on Ledger device before any on-chain action.

**Saturday May 10 plan (9am–3pm):**
- 9am–12pm: Merchant approval UI + wallet connect in Admin Dashboard + MRR chart backend API
- 12pm–1pm: Lunch
- 1pm–3pm: MRR chart frontend + churn rate + subscriber stats cards

---

## 25. Competitive Landscape

### Stripe Onchain Subscriptions (October 2025)
Stripe launched stablecoin subscription payments. Key facts:
- Still **custodial** — Stripe holds/routes funds, merchants receive fiat
- Built for their existing 350K+ merchants, not Web3-native market
- No non-custodial architecture, no physical access, no MB Way/Portugal
- **Verdict:** Validates the market. Not a direct threat to AuthOnce's lane.

**AuthOnce response tweet (ready to post):**
> "Stripe launched onchain subscriptions. They still hold your funds and route your money. AuthOnce doesn't touch a single USDC. Funds stay in the subscriber's own vault. Authorize once. Pay forever. Non-custodial wins. @buildonbase"

### Reccura (Somnia Network)
Native onchain scheduling — the chain itself fires recurring transactions, no keeper bot needed. Targets DAOs, DCA strategies, crypto-native users.
- **Not a threat** — completely different target market (DAOs vs gyms/merchants)
- Somnia is unproven; Base has Coinbase backing and real ecosystem
- WSDT token wrapping is UX nightmare for normal users
- **One thing to learn:** Native scheduling is architecturally superior to keeper bot. Post-mainnet: consider migrating to Chainlink Automation to eliminate keeper centralisation risk.

### Other Players
BoomFi, Loop Crypto, SubscribeOnChain, Sphere, OnChainPay — all custodial or crypto-native only. None have MB Way, Multibanco, QR physical access, or DataOnce layer.

### AuthOnce Competitive Moat
| Advantage | Why it matters |
|---|---|
| Non-custodial | No FINMA licence, subscriber trust, GDPR compliant |
| Base Network | Coinbase backing, lowest fees, growing ecosystem |
| Portugal-first | MB Way + Multibanco — no competitor has this |
| QR physical access | Gyms, coworking, clubs — unique vertical |
| DataOnce | Second product nobody else is building |
| EU-compliant | MiCA, GDPR — getting stronger every year |

---

*Last updated: 2026-05-05 — Competitive analysis added (Stripe, Reccura). Keeper bot centralisation risk noted — post-mainnet: consider Chainlink Automation.*
*Next session: Web3Auth Google login in PayPage.jsx | Saturday May 10: Merchant approval UI + MRR chart*

---

## 26. Subscriber Authentication — Completed May 5 2026

**Decision:** Google OAuth via Passport.js instead of Web3Auth.

**Why:** Web3Auth v9/v10 incompatible with Vite 8 due to Node.js polyfill issues. Google OAuth via Passport.js is server-side, zero polyfill issues, $0/month at any scale, and we own the auth layer completely.

**How it works:**
```
Subscriber clicks "Sign in with Google" on pay link
→ Redirected to Railway /auth/google
→ Google OAuth → callback to Railway /auth/google/callback
→ Subscriber created in PostgreSQL subscribers table
→ Deterministic wallet generated from email (ethers.js keccak256)
→ JWT token returned to frontend via redirect
→ Frontend stores token in localStorage
→ GET /api/subscriber/me returns profile
→ Subscribe button shown with name + avatar
```

**Wallet generation:** Deterministic from email using `keccak256(seed:email)`. Same email always generates same wallet. Private key encrypted with AES-256-GCM and stored in DB.

**Routes added to api.js:**
- `GET /auth/google` — starts OAuth flow with state parameter (returnTo + origin)
- `GET /auth/google/callback` — handles return, creates subscriber, returns JWT
- `GET /api/subscriber/me` — returns subscriber profile from JWT

**DB table added:** `subscribers` — email, google_id, name, avatar_url, wallet_address, wallet_private_key (encrypted), phone, country

**Environment variables added to Railway:**
- `GOOGLE_CLIENT_ID` — from Google Cloud Console (project: authonce-pay-safe)
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `FRONTEND_URL` — https://authonce.io
- `GOOGLE_CALLBACK_URL`

**Google OAuth app:** console.cloud.google.com → project authonce-pay-safe → needs publishing before mainnet (currently in test mode — shows "Developer info" warning)

**Tested:** Two different Google accounts → two different subscribers → two different wallet addresses → both confirmed working May 5 2026.

**What's still TODO before payment works:**
1. Stripe Crypto Checkout — card → USDC → subscriber wallet (handleSubscribe currently simulates)
2. On-chain createSubscription() after payment confirmed
3. Netlify `_redirects` or `netlify.toml` needed for SPA routing on production

**Session Start Priorities (updated):**
1. ~~Google OAuth~~ ✅ DONE
2. **Stripe Crypto Checkout** — card → USDC → subscriber wallet
3. **Stripe webhook wiring** — payment events → business logic
4. **Subscriber portal** — authonce.io/my-subscriptions
5. **Geofencing middleware**
6. **Merchant dashboard analytics** (Saturday May 10)

