# CLAUDE.md — Project Memory
## AuthOnce: An Intent-Based Subscription Manager

> This file is the single source of truth for all project decisions.
> Every coding session must begin by reading this file.
> Every significant decision made during development must be recorded here.

---

## 0. Session Start Reminder
**Always show the priority plan visual at the start of every session.**

---

## 1. Project Overview

**Name:** AuthOnce
**Domain:** authonce.io
**Tagline:** Authorize once. Pay forever. Stay in control.
**Purpose:** A subscription infrastructure protocol that allows merchants to collect recurring payments via MB Way, Multibanco, credit card, SEPA Direct Debit, and USDC. Non-custodial, transparent, and blockchain-powered underneath.
**MVP Target:** Portugal first — Base Network (mainnet + Base Sepolia testnet).
**Founder:** Vasco Humberto dos Reis Diogo — Swiss resident, Portuguese citizen, age 51.
**Goal:** Build to sell for €3–10M. Retire at 54–55.
**Contact:** vasco@authonce.io (Zoho Mail — full send + receive)
**Support:** support@authonce.io (Zoho alias → vasco@authonce.io)

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
| Email | Zoho Mail | vasco@authonce.io + support@authonce.io alias |
| DNS | Cloudflare | kallie + nicolas.ns.cloudflare.com |
| Payments (fiat) | Stripe Connect | Platform model — merchants have own Stripe accounts |
| Copy Monitor | monitor.js | Railway service |

**Key contract addresses (Base Sepolia testnet — v3):**
- `SubscriptionVault.sol`: `0xED9a4322030b2523cBB4eD5479539a3afEe30afA` ✅ v3 configurable grace period
- `MerchantRegistry.sol`: `0x3124a01D023FA6F0AFDE1e89c6727FE3D0fAa3d5` ✅ v3
- Deployer / Admin (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`
- Protocol Treasury (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`
- Gelato Keeper (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`

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
**Netlify:** authonce.io frontend (auto-deploys on git push)
**Shopify Partner:** vascodiogo@hotmail.com — registered 28 Apr 2026

---

## 3. Stripe Configuration

**Account:** AuthOnce (Switzerland, Einzelunternehmen)
**Live account:** ✅ Activated
**Payout:** EUR → UBS Switzerland AG
**Statement descriptor:** AUTHONCE

**Payment methods enabled:**
| Method | Status | Market |
|---|---|---|
| Cards (Visa, Mastercard) | ✅ Active | Global |
| MB Way | ✅ Active | Portugal |
| Multibanco | ✅ Active | Portugal |
| Google Pay | ✅ Active | Global |
| Apple Pay | ✅ Active | Global |
| SEPA Direct Debit | ✅ Active | Europe |
| Klarna | ✅ Active | Europe |
| Bancontact | ✅ Active | Belgium |
| BLIK | ✅ Active | Poland |
| TWINT | ❌ Ineligible | Switzerland — after incorporation |

**Stripe Connect:** Platform model ✅ configured in sandbox
**Webhook:** AuthOnce Railway API → `https://the-opportunity-production.up.railway.app/api/stripe/webhook` ✅
**Webhook secret:** stored in Railway as `STRIPE_WEBHOOK_SECRET`
**Branding:** AuthOnce logo + green #34d399 ✅
**Customer emails:** Portuguese, successful payments ON, support@authonce.io ✅
**Privacy Policy URL:** https://authonce.io/legal.html ✅
**Terms of Service URL:** https://authonce.io/legal.html ✅

**Stripe remaining (after incorporation):**
- Tax details (VAT number)
- TWINT reactivation
- Stripe Connect go live (needs code integration first)
- Merchant support email per connected account (part of onboarding build)

---

## 4. Business Rules (Locked)

### 4.1 Payment Initiation
- Keeper bot initiates every USDC payment pull on-chain.
- `SubscriptionVault` has a whitelisted `keeper` address only.

### 4.2 Accepted Token
- USDC only (Base native). Hardcoded in contract.

### 4.3 Grace Period (v3 — configurable)
- `MIN_GRACE_DAYS = 1`, `MAX_GRACE_DAYS = 30`, `DEFAULT_GRACE_DAYS = 7`
- Set per subscription at creation. Pass 0 for default.
- Reactivation: fresh payment link sent to subscriber automatically.

### 4.4 Billing Intervals
- Weekly (7d), Monthly (30d), Yearly (365d). Immutable after creation.

### 4.5 Cancellation Authority
- Vault owner OR guardian can cancel/pause. Only owner can resume.

### 4.6 Spending Cap
- Hard cap enforced on-chain. Contract reverts if exceeded.

### 4.7 Custody Model
- Non-custodial on both fiat and crypto sides.
- Fiat: Stripe Connect — payments go directly to merchant's Stripe account.
- USDC: on-chain via Base Network smart contracts.
- AuthOnce takes 0.5% via Stripe Connect fee splitting — never touches money.

### 4.8 Merchant Access
- Invite-only. First 10 founding merchants (Parceiros Fundadores): 0% fees for 3 months.
- Standard: 0.5% protocol fee per transaction.

### 4.9 Protocol Revenue
- 0.5% fee (feeBps = 50). Hard ceiling: 2% (200 bps) hardcoded.

### 4.10 Fiat Payment Architecture (Portugal — planned)
- Stripe Connect: merchant has own Stripe account.
- MB Way + Multibanco via Stripe (Portugal).
- SMS notifications via Twilio (~€0.05/SMS).
- No PSP license needed (legal opinion to confirm).
- Subscriber chooses MB Way (automatic) or Multibanco (reference per cycle).

### 4.11 Subscriber Flow (No Wallet Required)
- Subscribers never need a wallet or the authonce.io site.
- Merchant initiates subscription.
- Subscriber pays via MB Way or Multibanco.
- To cancel: signed link in payment confirmation SMS/email.

### 4.12 Tax and Invoicing
- Merchants are solely responsible for their own tax obligations.
- AuthOnce must issue VAT invoices for protocol fees — legal opinion to confirm.
- Transaction history downloadable from merchant dashboard (to build).
- Monthly fee invoice/receipt for 0.5% AuthOnce fee (to build).

---

## 5. Product Roadmap (Versions)

| Version | Model | Market | Status |
|---|---|---|---|
| v1 | USDC subscriptions on-chain | Crypto-native merchants | ✅ Built on testnet |
| v2 | MB Way + Multibanco via Stripe Connect | Portuguese mass market | 🔲 In development |
| v3 | Euro stablecoin (Bison Bank) | Post-stablecoin launch | ⏳ Future |
| v4 | Prepaid wallets — pay per use | Transactional businesses | ⏳ Long term |
| v5 | On-chain identity + universal subscription profile | All markets | ⏳ Long term |

### v5 — On-Chain Identity Vision
- Subscriber has one encrypted profile stored in their mobile wallet
- Selective disclosure — merchant sees only what subscriber approves
- Physical terminal: QR code / NFC on existing tablet (no hardware needed)
- Portable payment history — on-chain reputation system
- Developer API: €49–199/month tiered pricing
- Per-verification fee: €0.05–0.10
- Network moat: more merchants → more profiles → more merchants (Visa flywheel)
- Data never sold — only access to verified interactions monetised (Visa model, not Meta)

---

## 6. Revenue Streams

| Stream | Model | Timing |
|---|---|---|
| Subscription fees | 0.5% per pull | Now (testnet) → mainnet Q3 2026 |
| Terminal licence | €10–20/month per location | v5 post-mainnet |
| Per-verification fee | €0.05–0.10 per check | v5 post-mainnet |
| Developer API (identity) | €49–199/month tiered | v5 post-mainnet |
| Euro stablecoin routing | Revenue share with Bison | Post-Bison stablecoin launch |

**Exit valuation model:**
- €500K ARR → €2.5–5M exit (5–10x revenue multiple)
- €1M ARR → €5–10M exit
- 5 revenue streams + network effect → premium multiple

---

## 7. Competitor Positioning

AuthOnce targets subscription businesses, NOT POS/transactional merchants.

**Real competitors for Portuguese merchants (MB Way subscriptions):**

| Solution | MB Way | Multibanco | Monthly fee | Per transaction |
|---|---|---|---|---|
| Stripe standalone | ✅ | ✅ | €0 | 1.5% + €0.25 |
| Easypay (Portuguese) | ✅ | ✅ | €10–30/month | 0.5–1.5% |
| Ifthenpay (Portuguese) | ✅ | ✅ | Setup fee | ~1% |
| **AuthOnce + Stripe** | ✅ | ✅ | **€0** | **0.5% + Stripe** |

**AuthOnce wins on:** No monthly fee, no chargebacks, on-chain audit trail, founding offer (0% 3 months), non-custodial, future-proof.

**Bison Digital Assets — post-mainnet only:**
- EUR offramp for USDC merchants
- Euro stablecoin (planned July 2026) — could eliminate conversion step
- Contact: Diogo Brás, diogo.bras@bisondigital.com
- Only approach when AuthOnce has real USDC volume and leverage

---

## 8. Core Data Structures

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
      logo.svg                — AuthOnce SVG logo
      logo.png                — AuthOnce PNG logo (for Stripe)
      legal.html              — ToS + Privacy Policy + Refund Policy (EN/PT)
      _redirects              — Netlify SPA routing
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
- [ ] Order Ledger Nano S Plus from ledger.com
- [ ] Set up Safe multisig for admin role
- [ ] Privy integration (Google/email login for subscribers)
- [ ] Subscriber cancellation via signed link (no wallet required)
- [ ] Stripe Connect merchant onboarding (code)
- [ ] Merchant support email per Stripe Connect account
- [ ] MB Way + Multibanco integration (Portugal)
- [ ] Twilio SMS notifications
- [ ] Geofencing middleware (OFAC sanctions)
- [ ] Merchant payment notification email (notifier.js)
- [ ] Transaction history download from merchant dashboard
- [ ] Monthly fee invoice/receipt for merchants
- [ ] Terms of Service + Privacy Policy — lawyer review
- [ ] Legal consultation (13-item checklist)
- [ ] Smart contract audit ($15–20K — Hacken or Code4rena)
- [ ] Deploy to Base Mainnet

### Phase 7 — Growth 🔲
- [ ] Shopify app (Month 4–6 post-mainnet)
- [ ] EU expansion via Stripe local payment methods
- [ ] Staff access role (view-only, no financials)
- [ ] Bulk subscriber CSV import
- [ ] Getting Started guide (after first merchant onboarded)
- [ ] Portugal Ventures Open Day (requires Portuguese company)
- [ ] Indico Capital Partners — follow up
- [ ] Start Ventures by Big outreach
- [ ] Road 2 Web Summit 2026
- [ ] Business Abroad 2026
- [ ] TWINT reactivation (after incorporation)

### Phase 8 — Identity (v5) 🔲
- [ ] On-chain identity profile (encrypted, wallet-stored)
- [ ] Selective disclosure engine
- [ ] QR code / NFC physical terminal (tablet-based)
- [ ] Developer API for identity verification
- [ ] Portable payment history / reputation system

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
| Apr 2026 | Cloudflare for DNS | Free, replaces Namecheap DNS |
| Apr 2026 | Zoho Mail for email | Full send+receive at vasco@authonce.io |
| Apr 2026 | Stripe Connect — Platform model | Non-custodial fiat; merchants own their Stripe |
| Apr 2026 | Fiat-first architecture for Portugal | MB Way + Multibanco via Stripe Connect |
| Apr 2026 | Configurable grace period (v3) | Merchants need flexibility 1–30 days |
| Apr 2026 | Shopify Partner registered | Distribution channel post-mainnet |
| Apr 2026 | Bison Digital Assets — post-mainnet | No leverage now; revisit with real volume |
| Apr 2026 | Incorporate in Portugal — not yet | Wait for first merchant + legal advice |
| Apr 2026 | AuthOnce v4 — prepaid wallets | Natural extension for transactional businesses |
| Apr 2026 | AuthOnce v5 — on-chain identity | Network moat; Visa model not Meta model |
| Apr 2026 | Identity data never sold | User owns data; only network access monetised |
| Apr 2026 | Terminal = existing tablet + QR | No hardware manufacturing for v5 MVP |
| Apr 2026 | Dispute separation — merchant/subscriber | AuthOnce is infrastructure, not mediator |
| Apr 2026 | Legal docs drafted (ToS, Privacy, Refund) | EN/PT bilingual; lawyer review before mainnet |
| Apr 2026 | Liability cap €100 in ToS | Maximum legal protection for AuthOnce |
| Apr 2026 | "Parceiro fundador" in PT | More prestigious than "comerciante fundador" |
| May 2026 | Getting Started guide — post first merchant | Document real pain points first |
| May 2026 | Referral links — post-mainnet | Trust first, monetise later |

---

## 13. Grants & External Relations

| Grant / Program | Status | Date | Notes |
|---|---|---|---|
| Coinbase Base Ecosystem Fund | ✅ Submitted | Apr 2026 | $25–34K ask |
| Circle Alliance Program | ✅ Submitted | Apr 2026 | Follow up if no reply by May 5 |
| Startup Portugal One Stop Shop | ✅ Contacted | Apr 2026 | Francisca Sampaio — awaiting Vouchers reply |
| Startup Portugal Newsletter | ✅ Subscribed | May 2026 | |
| Indico Capital Partners | ✅ Email sent | May 2026 | futureunicorn@indicocapital.com |
| Vouchers for Startups (PRR) | 🔲 Next round | — | Reply sent to Francisca asking about next round |
| Base Builder Grants | 📋 Apply next | — | $5K–25K |
| IAPMEI | 📋 After incorporation | — | Needs Portuguese NIF |
| Portugal 2030 | 📋 After incorporation | — | Needs Portuguese NIF |
| Compete 2030 | 📋 After incorporation | — | Regional focus |
| Road 2 Web Summit 2026 | 📋 Post-mainnet | — | |
| Business Abroad 2026 | 📋 Post-mainnet | — | |
| EIC Accelerator | ⏳ Post-mainnet | — | Up to €2.5M grant |

**VC contacts (post-mainnet):**
- **Portugal Ventures** — Open Day first Friday of month (requires Portuguese company)
- **Indico Capital Partners** — Fintech, Pre-Seed to Series A, €100K–€5M
- **Start Ventures by Big** — B2B Fintech specialist, seed stage

**Potential partners:**
- **Nuno Correia** — Utrust co-founder. Warm door post-mainnet.
- **Bison Digital Assets** — EUR offramp + euro stablecoin. Contact post-mainnet.

---

## 14. Legal Checklist (To Bring to Lawyer)

1. Does AuthOnce need Banco de Portugal registration as PSP?
2. Is Stripe Connect sufficient to avoid PSP licensing?
3. GDPR compliance — subscriber phone number hashing
4. Terms of Service for Portuguese market — review draft at authonce.io/legal.html
5. Privacy Policy — review draft at authonce.io/legal.html
6. Refund Policy — review draft at authonce.io/legal.html
7. MB Way / Multibanco regulatory requirements
8. Consumer protection — cancellation rights, grace periods
9. BUSL-1.1 enforceability under Portuguese law
10. Nebenbeschäftigung clause in Swiss employment contract
11. SRO membership — PolyReg (Switzerland)
12. On-chain identity — GDPR implications for selective disclosure (v5)
13. Does AuthOnce need to issue VAT invoices for 0.5% protocol fee?
14. Governing law — Swiss vs Portuguese (confirm for ToS)
15. Data retention period — confirm 10 years under Portuguese law

---

## 15. Infrastructure Cost Strategy

- Stay on Railway ($5/month) through testnet and early mainnet.
- Reassess at 10+ active merchants.
- At scale: Hetzner VPS (~€5-10/month).
- Cloudflare Pages as Netlify alternative if needed (both free).
- Netlify credits: monitor usage (cycle Apr 18–May 17) — batch commits.

---

## 16. Action List (Prioritised)

**Immediate (this week):**
- [ ] Order Ledger Nano S Plus from ledger.com
- [ ] Contact lawyer (15-item legal checklist)
- [ ] Stripe Connect code integration (merchant onboarding flow)
- [ ] Circle Alliance Program — follow up if no reply by May 5

**When incorporated:**
- [ ] Apply for Startup Recognition Status (free, 5 days)
- [ ] Register on Ecosystem Mapping Platform (startupportugal.dealroom.co)
- [ ] Apply to Portugal 2030 via Balcão dos Fundos
- [ ] Register on IAPMEI platform
- [ ] Update Stripe account to company details
- [ ] TWINT reactivation

**Post-mainnet:**
- [ ] Portugal Ventures Open Day
- [ ] Indico Capital Partners follow-up
- [ ] Start Ventures by Big outreach
- [ ] Bison Digital Assets — Diogo Brás intro
- [ ] Road 2 Web Summit 2026
- [ ] Shopify app development
- [ ] Getting Started guide
- [ ] Referral links for Coinbase/Binance/Kraken

---

## 17. Business Documents

Stored locally at `C:\AuthOnce-Docs\` (NOT in GitHub):
- `Business\AuthOnce_BusinessPlan_2026_v2.docx`
- `Financial\AuthOnce_FinancialProjections.xlsx`
- `Grants\AuthOnce_GrantMemo_v3.pdf`
- `Technical\AuthOnce_TechnicalDocs.md`

---

*Last updated: 2026-05-02 — Full session: Stripe fully configured. Legal documents live (authonce.io/legal.html). Stripe Connect backend deployed to Railway (api.js v2, 761 lines). stripe npm package added. DB migration ran (stripe_account_id, stripe_connected_at columns). API health confirmed. Technical Documentation v0.1 created (13 sections, lawyer-ready). Startup Portugal newsletter subscribed. Indico Capital Partners contacted.*

*Pending tomorrow (first thing):*
*1. Fix Stripe Connect — switch from OAuth (ca_ Client ID) to modern Account Sessions approach*
*2. Add STRIPE_CONNECT_CLIENT_ID and FRONTEND_URL to Railway (or remove if switching to Account Sessions)*
*3. Privy integration (subscriber login — no wallet needed)*

*Next actions: Stripe Connect fix → Privy → MB Way build → Subscriber cancellation link → Merchant notification email → Audit → Mainnet.*
