# CLAUDE.md — Project Memory
## AuthOnce: An Intent-Based Subscription Manager

> This file is the single source of truth for all project decisions.
> Every coding session must begin by reading this file.
> Every significant decision made during development must be recorded here.

---

## 1. Project Overview

**Name:** AuthOnce
**Domain:** authonce.io
**Tagline:** Authorize once. Pay forever. Stay in control.
**Purpose:** A subscription infrastructure protocol that allows merchants to collect recurring payments via MB Way, Multibanco, credit card, or USDC. Non-custodial, transparent, and blockchain-powered underneath.
**MVP Target:** Portugal first — Base Network (mainnet + Base Sepolia testnet).
**Founder:** Vasco Humberto dos Reis Diogo — Swiss resident, Portuguese citizen, age 51.
**Goal:** Build to sell for €3–10M. Retire at 54–55.
**Contact:** vasco@authonce.io (Zoho Mail — full send + receive)

---

## 2. The Stack

| Layer | Technology | Notes |
|---|---|---|
| Smart Contracts | Solidity v0.8.24 | Hardhat, optimizer 200 runs, viaIR, evmVersion: paris |
| Chain | Base Network | Low gas, EVM-compatible, USDC native |
| Token | USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Token | USDC (Base Mainnet) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Keeper Bot | Node.js | Running on Railway (supportive-prosperity project) |
| Notification Backend | Node.js + PostgreSQL | Running on Railway, polling every 30s |
| Frontend | React + Vite + RainbowKit + wagmi + viem | In `/frontend` folder |
| Deployment | Netlify (frontend) + Railway (backend) | Auto-deploys on git push |
| Email | Zoho Mail | vasco@authonce.io — full send + receive |
| DNS | Cloudflare | kallie + nicolas.ns.cloudflare.com |
| Copy Monitor | monitor.js | Railway service — watches for unauthorized deployments |

**Key contract addresses (Base Sepolia testnet — v3):**
- `SubscriptionVault.sol`: `0xED9a4322030b2523cBB4eD5479539a3afEe30afA` ✅ v3 configurable grace period
- `MerchantRegistry.sol`: `0x3124a01D023FA6F0AFDE1e89c6727FE3D0fAa3d5` ✅ v3
- Deployer / Admin (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`
- Protocol Treasury (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`
- Gelato Keeper (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`
- Test Safe Vault: created on Base Sepolia via app.safe.global ("AuthOnce Test Vault")

**Previous addresses (retired):**
- SubscriptionVault v1.0.0: `0x6188D6Bdb9D4DF130914A35aFA2bE66a59Ba25EA`
- MerchantRegistry v1.0.0: `0x1fA825065260a4e775AbD8D2596B1869904e446A`

**Key contract addresses (Base Mainnet — fill in after audit):**
- `SubscriptionVault.sol`: `[DEPLOY AFTER AUDIT]`
- `MerchantRegistry.sol`: `[DEPLOY AFTER AUDIT]`
- Protocol Treasury: `[LEDGER HARDWARE WALLET — ORDER BEFORE MAINNET]`
- Admin: `[SAFE MULTISIG — SET UP BEFORE MAINNET]`

**GitHub:** https://github.com/Vascodiogo/the-opportunity (public)
**Railway:** supportive-prosperity project (keeper + notifier + monitor services)
**Netlify:** authonce.io frontend
**Shopify Partner:** vascodiogo@hotmail.com — registered 28 Apr 2026

---

## 3. Business Rules (Locked — Do Not Change Without Architect Approval)

### 3.1 Payment Initiation
- Keeper bot initiates every USDC payment pull on-chain.
- `SubscriptionVault` has a whitelisted `keeper` address only.

### 3.2 Accepted Token
- USDC only (Base native). Hardcoded in contract.

### 3.3 Grace Period (v3 — configurable)
- `MIN_GRACE_DAYS = 1`, `MAX_GRACE_DAYS = 30`, `DEFAULT_GRACE_DAYS = 7`
- Set per subscription at creation. Pass 0 for default.
- Reactivation: fresh payment link sent to subscriber automatically.

### 3.4 Billing Intervals
- Weekly (7d), Monthly (30d), Yearly (365d). Immutable after creation.

### 3.5 Cancellation Authority
- Vault owner OR guardian can cancel/pause. Only owner can resume.

### 3.6 Spending Cap
- Hard cap enforced on-chain. Contract reverts if exceeded.

### 3.7 Custody Model
- Non-custodial on both fiat and crypto sides.
- For fiat: Stripe Connect — payments go directly to merchant's Stripe account.
- AuthOnce takes 0.5% via Stripe Connect fee splitting — never touches money.

### 3.8 Merchant Access
- Invite-only. First 10 founding merchants: 0% fees for 3 months.
- Standard: 0.5% protocol fee.

### 3.9 Protocol Revenue
- 0.5% fee (feeBps = 50). Hard ceiling: 2% (200 bps) hardcoded.

### 3.10 Merchant Features (v2/v3)
- `setProductExpiry()` — 30-day minimum notice.
- `merchantPauseSubscription()` — up to 90 days.
- Trial periods — up to 90 days.
- `gracePeriodDays` — configurable per subscription (1–30 days, default 7).

### 3.11 Fiat Payment Architecture (Portugal — planned)
- Stripe Connect: merchant has own Stripe account.
- MB Way + Multibanco via Stripe (Portugal).
- SMS notifications via Twilio (~€0.05/SMS).
- No PSP license needed (legal opinion to confirm).
- Subscriber chooses MB Way (automatic) or Multibanco (reference per cycle).

### 3.12 Subscriber Flow (No Wallet Required)
- Subscribers never need a wallet or the authonce.io site.
- Merchant initiates subscription.
- Subscriber pays via MB Way or Multibanco.
- To cancel: signed link in payment confirmation SMS/email.

---

## 4. Product Roadmap (Versions)

| Version | Model | Market | Status |
|---|---|---|---|
| v1 | USDC subscriptions on-chain | Crypto-native merchants | ✅ Built on testnet |
| v2 | MB Way + Multibanco via Stripe Connect | Portuguese mass market | 🔲 In development |
| v3 | Euro stablecoin (Bison Bank) | Post-stablecoin launch Q2 2026 | ⏳ Future |
| v4 | Prepaid wallets — pay per use | Transactional businesses | ⏳ Long term |
| v5 | On-chain identity + universal subscription profile | All merchants, all markets | ⏳ Long term |

### v5 — On-Chain Identity Vision (AuthOnce Identity)

**The concept:** Every subscriber has one encrypted identity profile stored in their mobile wallet (phone = wallet). No company stores their data. The user owns and controls everything.

**How it works:**
- User sets up profile once — name, email, phone, encrypted in their wallet
- Any AuthOnce merchant can request specific fields
- User approves exactly what to share (selective disclosure)
- Merchant receives verified confirmation — never stores raw data
- Subscription created on-chain instantly

**Selective disclosure — what merchants can see:**

| Field | Gym | Doctor | Newsletter | SaaS |
|---|---|---|---|---|
| Name | ✅ | ✅ | ✅ | ✅ |
| Email | ✅ | ✅ | ✅ | ✅ |
| Phone | ✅ | ✅ | ❌ | ❌ |
| Address | ❌ | ✅ | ❌ | ❌ |
| Age verification | ✅ | ✅ | ❌ | ❌ |
| Payment history | ✅ | ❌ | ❌ | ✅ |

Merchants can require specific fields. Subscribers can decline. If subscriber declines required fields, merchant can refuse the subscription. Both parties have sovereignty.

**Physical terminal use case (v5):**
- Merchant uses existing tablet or phone (no new hardware)
- Member scans QR code or taps phone (NFC)
- Identity verified on-chain instantly
- Works for gyms, clinics, coworking, events, hotels
- Monetised independently of subscriptions (per-verification fee + monthly licence)
- Future: partner with Sumup or Sibs for hardware terminals

**Portable payment history:**
- Subscriber's on-chain record proves payment reliability
- New merchant can see "24 months on-time payments" — no credit check needed
- Creates subscriber reputation system — doesn't exist anywhere today

**Network effect:**
- More merchants → more subscriber profiles
- More profiles → more merchants want AuthOnce
- Same flywheel as Visa — network IS the moat

**What data can be sold:**
- The profile data itself — NEVER. User owns it. Selling it = Meta model. Destroys trust.
- Access to verified interactions — YES. Merchant pays for infrastructure. Visa model.

**Legal considerations for v5 (add to lawyer checklist):**
- Name/email/phone verification — GDPR only, no special authorization
- Age verification — may require authorization depending on use case
- KYC/financial data — regulated, requires authorization
- Medical data — GDPR Article 9, special category
- PSD2 implications for payment credentials

---

## 5. Revenue Streams

| Stream | Model | Timing |
|---|---|---|
| Subscription fees | 0.5% per pull | Now (testnet) → mainnet Q3 2026 |
| Terminal licence | €10–20/month per location | v5 post-mainnet |
| Per-verification fee | €0.05–0.10 per check | v5 post-mainnet |
| Developer API (identity) | €49–199/month tiered | v5 post-mainnet |
| Euro stablecoin routing | Revenue share with Bison | Post-Bison stablecoin launch |

**Developer API pricing tiers:**
- Free: up to 100 verifications/month
- Startup: €49/month — up to 2,000 verifications
- Growth: €199/month — up to 10,000 verifications
- Enterprise: custom — unlimited + SLA

**Exit valuation model:**
- €500K ARR → €2.5–5M exit (5–10x revenue multiple)
- €1M ARR → €5–10M exit
- 5 revenue streams + network effect → premium multiple

---

## 6. Competitor Positioning

AuthOnce is NOT competing with POS systems. Target merchants are subscription businesses:

| Merchant type | POS? | AuthOnce fit? |
|---|---|---|
| Gym / fitness studio | Maybe | ✅ Perfect |
| Online newsletter | No | ✅ Perfect |
| SaaS product | No | ✅ Perfect |
| Streaming service | No | ✅ Perfect |
| Coffee shop | Yes | ❌ Wrong fit (v4 prepaid wallets later) |
| Supermarket | Yes | ❌ Wrong fit |

**Real competitors for Portuguese merchants (MB Way subscriptions):**

| Solution | MB Way | Multibanco | Monthly fee | Per transaction |
|---|---|---|---|---|
| Stripe standalone | ✅ | ✅ | €0 | 1.5% + €0.25 |
| Easypay (Portuguese) | ✅ | ✅ | €10–30/month | 0.5–1.5% |
| Ifthenpay (Portuguese) | ✅ | ✅ | Setup fee | ~1% |
| **AuthOnce + Stripe** | ✅ | ✅ | **€0** | **0.5% + 1.5%** |

**AuthOnce wins on:** No monthly fee, no chargebacks, on-chain audit trail, founding offer (0% 3 months), non-custodial, future-proof.

**Bison Digital Assets — NOT in the payment flow:**
- Bison is optional for merchants who want USDC → EUR conversion
- Not needed for MB Way/Multibanco flow (Stripe handles EUR directly)
- Revisit post-mainnet when AuthOnce has real USDC volume and leverage
- Diogo Brás (Chief Crypto Business Officer) — contact post-mainnet

---

## 7. Core Data Structures

```solidity
enum SubscriptionStatus { Active, Paused, Cancelled, Expired }
enum Interval { Weekly, Monthly, Yearly }

struct Subscription {
    address owner;
    address guardian;
    address merchant;
    address safeVault;
    uint256 amount;
    Interval interval;
    uint256 lastPulledAt;
    uint256 pausedAt;
    uint256 expiresAt;
    uint256 trialEndsAt;
    uint256 gracePeriodDays;  // v3 — configurable 1–30 days
    SubscriptionStatus status;
}
```

---

## 8. Access Control Map

| Action | Who Can Call |
|---|---|
| `executePull(id, amount)` | Keeper only |
| `expireSubscription(id)` | Keeper only |
| `createSubscription(...)` | Vault owner only |
| `cancelSubscription(id)` | Vault owner OR guardian |
| `pauseSubscription(id)` | Vault owner OR guardian |
| `resumeSubscription(id)` | Vault owner only |
| `setProductExpiry(id, ts)` | Merchant only |
| `merchantPauseSubscription(id, days)` | Merchant only |
| `approveMerchant(addr)` | Admin only |
| `revokeMerchant(addr)` | Admin only |
| `setFeeBps(bps)` | Admin only (max 200 bps) |
| `setKeeper(addr)` | Admin only |
| `setProtocolTreasury(addr)` | Admin only |

---

## 9. Repository Structure

```
C:\The-Opportunity\
  contracts/
    SubscriptionVault.sol     — v3 BUSL-1.1
    MerchantRegistry.sol      — v3 BUSL-1.1
  scripts/
    deploy.js                 — deploys both contracts
    keeper.js                 — Railway
    notifier.js               — Railway
    monitor.js                — Railway
    api.js                    — merchant + admin REST API
    admin-auth.js             — JWT admin authentication
    db.js                     — PostgreSQL helpers
    webhook.js                — merchant webhook dispatcher
  frontend/
    src/
      App.jsx                 — admin route + landing + dashboard
      LandingPage.jsx         — merchant-first (EN + PT)
      i18n.js                 — bilingual translations
      components/
        Dashboard.jsx
        MerchantDashboard.jsx
        AdminLogin.jsx
        AdminDashboard.jsx
    public/
      logo.svg
      _redirects
  LICENSE                     — BUSL-1.1
  CLAUDE.md
  railway.json
  hardhat.config.js
```

---

## 10. Security Constraints

1. No upgradeability in MVP.
2. Fee cap hardcoded at 200 bps.
3. Re-entrancy guard on `executePull()`.
4. Pull amount validated on-chain.
5. Merchant address locked at creation.
6. Cancellation never moves funds.
7. BUSL-1.1 license — commercial use prohibited until 2030.
8. `ProtocolDeployed` event — monitor.js alerts on copies.
9. Ledger hardware wallet required before mainnet.
10. Safe multisig required before mainnet.

---

## 11. Development Phases

### Phase 0 — Environment Setup ✅
### Phase 1 — Contracts ✅ (v3 — configurable grace period)
### Phase 2 — Keeper Bot ✅
### Phase 3 — Notification Backend ✅
### Phase 4 — Frontend ✅ (bilingual EN/PT, merchant landing, admin login)
### Phase 5 — IP Protection ✅ (BUSL-1.1, watermark, monitor.js)

### Phase 6 — Pre-Mainnet 🔲
- [ ] Order Ledger Nano S Plus from ledger.com (next week)
- [ ] Set up Safe multisig for admin role
- [ ] Privy integration (Google/email login for subscribers)
- [ ] Subscriber cancellation via signed link
- [ ] Stripe Connect merchant onboarding
- [ ] MB Way + Multibanco integration (Portugal)
- [ ] Twilio SMS notifications
- [ ] Geofencing middleware (OFAC sanctions)
- [ ] Terms of Service + Privacy Policy
- [ ] Legal consultation (11-item checklist)
- [ ] Smart contract audit ($15–20K — Hacken or Code4rena)
- [ ] Deploy to Base Mainnet

### Phase 7 — Growth 🔲
- [ ] Shopify app (Month 4–6 post-mainnet)
- [ ] EU expansion via Stripe local payment methods
- [ ] Staff access role (view-only)
- [ ] Bulk subscriber CSV import
- [ ] Portugal Ventures Open Day (requires Portuguese company)
- [ ] Indico Capital Partners outreach
- [ ] Start Ventures by Big outreach
- [ ] Road 2 Web Summit 2026
- [ ] Business Abroad 2026

### Phase 8 — Identity (v5) 🔲
- [ ] On-chain identity profile (encrypted, wallet-stored)
- [ ] Selective disclosure engine
- [ ] QR code / NFC physical terminal (tablet-based)
- [ ] Developer API for identity verification
- [ ] Portable payment history / reputation system
- [ ] Partner with Sumup or Sibs for hardware terminals

---

## 12. Key Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| Project start | Keeper bot initiates pulls | UX friction removal |
| Project start | USDC only | Simplifies token logic |
| Project start | Hard spending cap | Security-first |
| Project start | Non-custodial | Protocol never holds funds |
| Project start | Invite-only merchants | Reduces abuse |
| Project start | 0.5% protocol fee | Revenue model |
| Apr 2026 | Rebranded to AuthOnce | Cleaner brand |
| Apr 2026 | BUSL-1.1 license | Protects until 2030 |
| Apr 2026 | On-chain watermark + monitor.js | Copy detection |
| Apr 2026 | Cloudflare for DNS | Free, replaces Namecheap DNS |
| Apr 2026 | Zoho Mail for email | Full send+receive at vasco@authonce.io |
| Apr 2026 | Admin login via email/password + JWT | Simpler than wallet-only |
| Apr 2026 | Merchant-first landing page | Target is merchants not subscribers |
| Apr 2026 | Wallet optional in apply form | Exchange deposit address works |
| Apr 2026 | Fiat-first architecture for Portugal | MB Way + Multibanco via Stripe Connect |
| Apr 2026 | Non-custodial fiat model | Stripe Connect — never holds EUR |
| Apr 2026 | Configurable grace period (v3) | Merchants need flexibility 1–30 days |
| Apr 2026 | Shopify Partner registered | Distribution channel post-mainnet |
| Apr 2026 | Stay on Railway through early mainnet | Reassess at 10+ active merchants |
| Apr 2026 | Subscriber needs no wallet | MB Way/Multibanco — no crypto needed |
| Apr 2026 | Bison Digital Assets — post-mainnet only | No leverage now; revisit with real volume |
| Apr 2026 | Incorporate in Portugal — not yet | Wait for first merchant + legal advice |
| Apr 2026 | AuthOnce v4 — prepaid wallets | Natural extension for transactional businesses |
| Apr 2026 | AuthOnce v5 — on-chain identity | Network moat; Visa model not Meta model |
| Apr 2026 | Identity data never sold | User owns data; only access to network is monetised |
| Apr 2026 | Terminal = existing tablet + QR | No hardware manufacturing needed for v5 MVP |

---

## 13. Grants & External Relations

| Grant / Program | Status | Date | Notes |
|---|---|---|---|
| Coinbase Base Ecosystem Fund | ✅ Submitted | Apr 2026 | $25–34K ask |
| Circle Alliance Program | ✅ Submitted | Apr 2026 | Pending review — 5+ days |
| Startup Portugal One Stop Shop | ✅ Contacted | Apr 2026 | Replied by Francisca Sampaio |
| Vouchers for Startups (PRR) | 🔲 Next round | — | Reply sent to Francisca asking about next round |
| Indico Founders Program | 📋 Apply now | — | Open call — fintech focus, no company needed |
| Base Builder Grants | 📋 Apply next | — | $5K–25K |
| IAPMEI | 📋 After incorporation | — | Needs Portuguese NIF |
| Portugal 2030 | 📋 After incorporation | — | Needs Portuguese NIF |
| Compete 2030 | 📋 After incorporation | — | Regional focus |
| Road 2 Web Summit 2026 | 📋 Post-mainnet | — | Apply when open |
| Business Abroad 2026 | 📋 Post-mainnet | — | Portuguese delegation |
| EIC Accelerator | ⏳ Post-mainnet | — | Up to €2.5M grant |

**VC contacts (post-mainnet, requires Portuguese company):**
- **Portugal Ventures** — Open Day first Friday of month — requires promoter in Portugal
- **Indico Capital Partners** — Fintech, Pre-Seed to Series A, €100K–€5M — apply now
- **Start Ventures by Big** — B2B Fintech specialist, seed stage

**Potential partners:**
- **Nuno Correia** — Utrust co-founder. Warm door post-mainnet.
- **Bison Digital Assets** — EUR offramp + euro stablecoin. Contact post-mainnet with real volume. Contact: Diogo Brás, diogo.bras@bisondigital.com

---

## 14. Legal Checklist (To Bring to Lawyer)

1. Does AuthOnce need Banco de Portugal registration as PSP?
2. Is Stripe Connect sufficient to avoid PSP licensing?
3. GDPR compliance — subscriber phone number hashing
4. Terms of Service for Portuguese market
5. MB Way / Multibanco regulatory requirements
6. Consumer protection — cancellation rights, grace periods
7. BUSL-1.1 enforceability under Portuguese law
8. Nebenbeschäftigung clause in Swiss employment contract
9. SRO membership — PolyReg (Switzerland)
10. On-chain identity — GDPR implications for selective disclosure
11. Age verification authorization requirements for v5

---

## 15. Infrastructure Cost Strategy

- Stay on Railway ($5/month) through testnet and early mainnet.
- Reassess at 10+ active merchants.
- At scale: Hetzner VPS (~€5-10/month).
- Cloudflare Pages as Netlify alternative if needed (both free).
- Netlify credits: 75% of 300 used (cycle Apr 18–May 17) — batch commits.

---

## 16. Action List (Prioritised)

**Today:**
- [ ] Open Stripe account for AuthOnce (free, 10 min)
- [ ] Apply to Indico Founders Program (open now)
- [ ] Subscribe to Startup Portugal newsletter

**Urgent:**
- [ ] Incorporate company in Portugal (need NIF for all funding)
- [ ] Contact lawyer (11-item legal checklist)
- [ ] Order Ledger Nano S Plus from ledger.com (next week — pay bills first)
- [ ] Wait for Francisca's reply re: Vouchers for Startups next round

**When incorporated:**
- [ ] Apply for Startup Recognition Status (free, 5 days)
- [ ] Register on Ecosystem Mapping Platform (startupportugal.dealroom.co)
- [ ] Apply to Portugal 2030 via Balcão dos Fundos
- [ ] Register on IAPMEI platform

**Post-mainnet:**
- [ ] Portugal Ventures Open Day
- [ ] Indico Capital Partners outreach
- [ ] Start Ventures by Big outreach
- [ ] Bison Digital Assets — Diogo Brás intro email
- [ ] Road 2 Web Summit 2026
- [ ] Shopify app development

---

## 17. Business Documents

Stored locally at `C:\AuthOnce-Docs\` (NOT in GitHub):
- `Business\AuthOnce_BusinessPlan_2026_v2.docx`
- `Financial\AuthOnce_FinancialProjections.xlsx`
- `Grants\AuthOnce_GrantMemo_v3.pdf`
- `Technical\AuthOnce_TechnicalDocs.md`

---

## 18. Session Start Reminder

**Show priority plan visual at the start of every session.**

---

*Last updated: 2026-04-30 — Full product roadmap v1–v5 defined. On-chain identity vision (v5) documented. Revenue streams mapped. Competitor positioning clarified. Bison Digital Assets deferred to post-mainnet. Legal checklist expanded to 11 items.*
*Next actions: Open Stripe account → Apply Indico Founders Program → Incorporate in Portugal → Legal consultation → Order Ledger → Privy integration → Stripe Connect → Audit → Mainnet.*
