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
**Contact:** vasco@authonce.io

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
| Deployment | Netlify (frontend) + Railway (backend) | |
| Email routing | Cloudflare → Hotmail | vasco@authonce.io forwards to vascodiogo@hotmail.com |
| Email sending | Resend | monitor@authonce.io for system notifications |
| Copy Monitor | monitor.js | Watches for unauthorized contract deployments |
| DNS | Cloudflare | Nameservers: kallie + nicolas.ns.cloudflare.com |

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
**Netlify:** authonce.io frontend (auto-deploys on git push)
**Shopify Partner:** vascodiogo@hotmail.com — registered 28 Apr 2026

---

## 3. Business Rules (Locked — Do Not Change Without Architect Approval)

### 3.1 Payment Initiation
- **Rule:** A trusted off-chain **keeper bot** initiates every payment pull.
- **Implication:** `SubscriptionVault` has a whitelisted `keeper` address. Only that address can call `executePull()`.

### 3.2 Accepted Token
- **Rule:** **USDC only** (Base native contract). Hardcoded in contract.

### 3.3 Insufficient Funds Handling
- Subscription enters grace period (`status = Paused`).
- Grace period is now **configurable per subscription** (1–30 days, default 7).
- Keeper retries daily during grace period.
- If no top-up, keeper calls `expireSubscription(id)`.

### 3.4 Billing Intervals
- Three supported intervals — weekly (7 days), monthly (30 days), yearly (365 days).
- Stored as enum. Immutable after subscription creation.

### 3.5 Cancellation Authority
- Vault owner (subscriber) OR named guardian can cancel/pause.
- Only vault owner can resume.
- Guardian address stored per subscription (zero address if none).

### 3.6 Spending Cap (Hard Enforcement)
- `amount` set at creation is a hard cap.
- `require(pullAmount <= subscription.amount, "ExceedsCap")` — enforced on-chain.

### 3.7 Custody Model
- Non-custodial on both fiat and crypto sides.
- Protocol never holds user funds.
- For fiat: payments go directly to merchant's Stripe account via Stripe Connect.
- AuthOnce takes 0.5% via Stripe Connect fee splitting — never touches the money.

### 3.8 Merchant Access (MVP)
- Invite-only. Only admin-whitelisted addresses can register as merchants.
- First 10 founding merchants: 0% fees for 3 months.
- After 3 months: standard 0.5% protocol fee.

### 3.9 Protocol Revenue
- 0.5% coordination fee (feeBps = 50) on every successful pull.
- Hard ceiling: 2% (200 bps) — hardcoded, not upgradeable.

### 3.10 Merchant Features (v2/v3)
- `setProductExpiry()` — 30-day minimum notice. Cannot shorten once set.
- `merchantPauseSubscription()` — up to 90 days. Does NOT trigger grace period.
- Trial periods — up to 90 days.
- `gracePeriodDays` — configurable per subscription (1–30 days, default 7).

### 3.11 Grace Period Configuration (v3)
- `MIN_GRACE_DAYS = 1`
- `MAX_GRACE_DAYS = 30`
- `DEFAULT_GRACE_DAYS = 7`
- Pass 0 at creation to use default. Merchant sets at subscription creation.
- Reactivation: subscriber pays overdue amount via fresh link. Bill regenerated automatically.

### 3.12 Fiat Payment Architecture (Portugal — planned)
- Stripe Connect: each merchant has own Stripe account. Payments go directly to them.
- AuthOnce takes 0.5% via Stripe Connect fee splitting.
- MB Way + Multibanco supported via Stripe (Portugal).
- SMS notifications via Twilio (~€0.05/SMS).
- No PSP license needed (Stripe Connect model — legal opinion to confirm).
- Subscriber chooses payment method at signup (MB Way or Multibanco).
- MB Way = automatic recurring. Multibanco = reference per cycle.

### 3.13 Subscriber Flow (No Wallet Required)
- Subscribers never need a wallet, crypto knowledge, or the authonce.io site.
- Merchant initiates subscription (gym staff flow).
- Subscriber receives SMS with payment request.
- Subscriber pays via MB Way or Multibanco.
- Subscription activates automatically.
- To cancel: subscriber uses signed link in payment confirmation SMS/email.

---

## 4. Core Data Structures

```solidity
enum SubscriptionStatus { Active, Paused, Cancelled, Expired }
enum Interval { Weekly, Monthly, Yearly }

struct Subscription {
    address owner;            // Safe vault owner (subscriber)
    address guardian;         // Can also cancel/pause — zero address if none
    address merchant;         // Approved merchant — immutable after creation
    address safeVault;        // The Safe wallet that holds the USDC
    uint256 amount;           // USDC per pull, 6-decimal precision (hard cap)
    Interval interval;        // Weekly / Monthly / Yearly — immutable
    uint256 lastPulledAt;     // Timestamp of last successful pull
    uint256 pausedAt;         // Timestamp of pause start (0 = not paused)
    uint256 expiresAt;        // Timestamp of scheduled expiry (0 = no expiry set)
    uint256 trialEndsAt;      // Timestamp when trial ends (0 = no trial)
    uint256 gracePeriodDays;  // Grace period in days before auto-expiry (1–30)
    SubscriptionStatus status;
}
```

---

## 5. Access Control Map

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
| `setFeeBps(bps)` | Admin only (max 200 bps hardcoded) |
| `setKeeper(addr)` | Admin only |
| `setProtocolTreasury(addr)` | Admin only |

---

## 6. Repository Structure

```
C:\The-Opportunity\
  contracts/
    SubscriptionVault.sol     — core vault logic (v3 BUSL-1.1)
    MerchantRegistry.sol      — invite-only merchant whitelist (v3 BUSL-1.1)
  scripts/
    deploy.js                 — deploys both contracts in one run
    keeper.js                 — keeper bot (Railway)
    notifier.js               — notification backend (Railway)
    monitor.js                — copy detector (Railway)
    api.js                    — merchant + admin REST API (Railway)
    admin-auth.js             — JWT admin authentication module
    db.js                     — PostgreSQL helpers
    webhook.js                — merchant webhook dispatcher
  frontend/
    src/
      App.jsx                 — main app with admin route + landing page + dashboard
      LandingPage.jsx         — merchant-first landing page (EN + PT)
      i18n.js                 — bilingual translations
      components/
        Dashboard.jsx         — subscriber dashboard
        MerchantDashboard.jsx — merchant dashboard
        AdminLogin.jsx        — admin email/password login
        AdminDashboard.jsx    — admin stats dashboard
    public/
      logo.svg                — AuthOnce logo
      _redirects              — Netlify SPA routing
  LICENSE                     — BUSL-1.1
  CLAUDE.md                   — this file
  railway.json                — Railway build config
  hardhat.config.js
  .env                        — secrets (gitignored)
```

---

## 7. Security Constraints (Non-Negotiable)

1. **No upgradeability in MVP.** No proxy pattern. Deploy and freeze.
2. **Fee cap hardcoded at 200 bps (2%).** Not adjustable past this, even by admin.
3. **Re-entrancy guard on `executePull()`.** Inlined ReentrancyGuard.
4. **Pull amount validated on-chain.**
5. **Merchant address locked at creation.** Cannot change post-creation.
6. **Cancellation never moves funds.** Only revokes module permission.
7. **BUSL-1.1 license.** Commercial use prohibited until 2030-01-01.
8. **`ProtocolDeployed` event** — monitor.js alerts on unauthorized copies.
9. **Ledger hardware wallet required before mainnet** — order next week.
10. **Safe multisig required before mainnet** for admin role.

---

## 8. Development Phases

### Phase 0 — Environment Setup ✅
### Phase 1 — Contracts ✅ (v3 — configurable grace period)
### Phase 2 — Keeper Bot ✅
### Phase 3 — Notification Backend ✅
### Phase 4 — Frontend ✅ (bilingual EN/PT, merchant landing page, admin login)
### Phase 5 — IP Protection ✅ (BUSL-1.1, watermark, monitor.js)

### Phase 6 — Pre-Mainnet 🔲
- [ ] Order Ledger Nano S Plus from ledger.com
- [ ] Set up Safe multisig for admin role
- [ ] Privy integration (Google/email login for subscribers)
- [ ] Subscriber cancellation via signed link (no wallet required)
- [ ] Stripe Connect merchant onboarding
- [ ] MB Way + Multibanco integration (Portugal)
- [ ] Twilio SMS notifications
- [ ] Geofencing middleware (OFAC sanctions)
- [ ] Terms of Service + Privacy Policy
- [ ] Legal opinion on Banco de Portugal PSP registration
- [ ] Smart contract audit ($15–20K — Hacken or Code4rena)
- [ ] Deploy to Base Mainnet
- [ ] Record mainnet addresses in Section 2

### Phase 7 — Growth 🔲
- [ ] Shopify app (post-mainnet, Month 4–6)
- [ ] EU expansion via Stripe local payment methods
- [ ] Staff access role (view-only, no financials)
- [ ] Bulk subscriber CSV import
- [ ] Configurable grace period per merchant (UI)

---

## 9. Key Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| Project start | Keeper bot initiates pulls | Removes UX friction |
| Project start | USDC only | Simplifies token approval logic |
| Project start | 7-day grace period | Balances merchant reliability with user protection |
| Project start | Hard spending cap on-chain | Security-first |
| Project start | Funds inside Safe vault | Non-custodial |
| Project start | Invite-only merchants for MVP | Reduces abuse vectors |
| Project start | 0.5% protocol fee (max 2% hardcoded) | Revenue model |
| Apr 2026 | Rebranded to AuthOnce | Cleaner brand |
| Apr 2026 | BUSL-1.1 license | Protects commercial use until 2030 |
| Apr 2026 | On-chain watermark + ProtocolDeployed event | Copy detection |
| Apr 2026 | monitor.js on Railway | Zero extra cost |
| Apr 2026 | Ledger required before mainnet | Hardware security for admin |
| Apr 2026 | GitHub repo public | BUSL-1.1 in place; open for visibility |
| Apr 2026 | Cloudflare for DNS + email routing | Free; replaces Migadu |
| Apr 2026 | Admin login via email/password + JWT | Simpler than wallet-only |
| Apr 2026 | Merchant-first landing page | Target audience is merchants, not subscribers |
| Apr 2026 | Wallet optional in apply form | Exchange deposit address works (Coinbase, Binance, Kraken) |
| Apr 2026 | Fiat-first architecture for Portugal | MB Way + Multibanco via Stripe Connect |
| Apr 2026 | Non-custodial fiat model | Stripe Connect — protocol never holds EUR |
| Apr 2026 | Configurable grace period (v3) | Merchants need flexibility (1–30 days) |
| Apr 2026 | Shopify Partner account registered | Distribution channel post-mainnet |
| Apr 2026 | Stay on Railway through early mainnet | Reassess at 10+ active merchants |
| Apr 2026 | Subscriber needs no wallet | MB Way/Multibanco; Privy for crypto side |
| Apr 2026 | Bison Digital Assets noted | EUR offramp partner — revisit post-mainnet |
| Apr 2026 | Monerium noted | IBAN on-chain alternative to Bison — evaluate later |

---

## 10. Grants & External Relations

| Grant / Program | Status | Date | Notes |
|---|---|---|---|
| Coinbase Base Ecosystem Fund | ✅ Submitted | Apr 2026 | $25–34K ask |
| Circle Alliance Program | ✅ Submitted | Apr 2026 | Pending review |
| Base Builder Grants | 📋 Apply next | — | $5K–25K |
| IAPMEI (Portugal) | 📋 Consult | — | Portuguese startup support |
| Startup Portugal | 📋 Apply | — | Mentorship program |
| Ethereum Foundation | ⏳ After mainnet | — | Prefer live mainnet projects |

**Potential partners:**
- **Nuno Correia** — Portuguese co-founder of Utrust. Utrust = one-time payments; AuthOnce = recurring. Complementary. Warm door when live on mainnet.
- **Bison Digital Assets** — Portuguese regulated bank (Banco de Portugal). EUR offramp candidate. Revisit post-mainnet as Phase 2 feature.

---

## 11. Legal Checklist (To Bring to Lawyer)

1. Does AuthOnce need Banco de Portugal registration as PSP?
2. Is Stripe Connect sufficient to avoid PSP licensing?
3. GDPR compliance — subscriber phone number hashing approach
4. Terms of Service requirements for Portuguese market
5. MB Way / Multibanco regulatory requirements
6. Consumer protection law — cancellation rights, grace periods
7. BUSL-1.1 enforceability under Portuguese law
8. Nebenbeschäftigung clause in Swiss employment contract
9. SRO membership — PolyReg (Switzerland)

---

## 12. Infrastructure Cost Strategy

- Stay on Railway ($5/month) through testnet and early mainnet.
- Reassess at 10+ active merchants generating real fee revenue.
- At scale: consider Hetzner VPS (~€5-10/month) for more control.
- Infrastructure cost should be covered by protocol fees before it becomes a problem.
- Cloudflare Pages as Netlify alternative if needed (both free).

---

## 13. Business Documents

Stored locally at `C:\AuthOnce-Docs\` (NOT in GitHub):
- `Business\AuthOnce_BusinessPlan_2026_v2.docx`
- `Financial\AuthOnce_FinancialProjections.xlsx`
- `Grants\AuthOnce_GrantMemo_v3.pdf`
- `Technical\AuthOnce_TechnicalDocs.md`

---

*Last updated: 2026-04-28 — v3 contracts deployed (configurable grace period). Shopify Partner registered. Fiat-first architecture decided. Legal checklist started. All phases 0–5 complete.*
*Next actions: Order Ledger → Privy integration → Stripe Connect → MB Way/Multibanco → Legal consultation → Audit → Mainnet.*
