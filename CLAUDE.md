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
**Purpose:** A Web3 subscription manager that allows users to authorize recurring USDC pulls from a Safe (Gnosis) Smart Account vault, replacing traditional credit-card subscriptions with a self-custodied, on-chain alternative.
**MVP Target:** Functional on Base Network (mainnet + Base Sepolia testnet).
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
| Email | Resend via vasco@authonce.io | |
| Copy Monitor | monitor.js | Watches for unauthorized contract deployments |

**Key contract addresses (Base Sepolia testnet — v1.0.0 BUSL-1.1):**
- `SubscriptionVault.sol`: `0xED9a4322030b2523cBB4eD5479539a3afEe30afA` ✅ v3 configurable grace period
- `MerchantRegistry.sol`: `0x3124a01D023FA6F0AFDE1e89c6727FE3D0fAa3d5` ✅ v3
- Deployer / Admin (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`
- Protocol Treasury (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`
- Gelato Keeper (testnet): `0x44444D60136Cf62804963fA14d62a55c34a96f8F`
- Test Safe Vault: created on Base Sepolia via app.safe.global ("AuthOnce Test Vault")

**Key contract addresses (Base Mainnet — fill in after audit):**
- `SubscriptionVault.sol`: `[DEPLOY AFTER AUDIT]`
- `MerchantRegistry.sol`: `[DEPLOY AFTER AUDIT]`
- Protocol Treasury: `[LEDGER HARDWARE WALLET — ORDER BEFORE MAINNET]`
- Admin: `[SAFE MULTISIG — SET UP BEFORE MAINNET]`

**GitHub:** https://github.com/Vascodiogo/the-opportunity
**Railway:** supportive-prosperity project (keeper + notifier services)
**Netlify:** authonce.io frontend

---

## 3. Business Rules (Locked — Do Not Change Without Architect Approval)

### 3.1 Payment Initiation
- **Rule:** A trusted off-chain **keeper bot** initiates every payment pull.
- **Implication:** `SubscriptionVault` has a whitelisted `keeper` address. Only that address can call `executePull()`. The user never manually triggers a payment.

### 3.2 Accepted Token
- **Rule:** **USDC only** (Base native contract). Hardcoded in contract.
- **Implication:** No other ERC-20 accepted even if passed as parameter. Security constraint, not a limitation.

### 3.3 Insufficient Funds Handling
- **Rule:** If vault balance is below subscription amount at pull time:
  1. Emit on-chain `InsufficientFunds(subscriptionId, required, available, pausedUntil)` event.
  2. Notifier backend catches event, sends merchant webhook + email alert.
  3. Subscription enters **7-day grace period** (`status = Paused`).
  4. Keeper retries daily during grace period.
  5. If user tops up within 7 days, keeper resumes and pulls.
  6. If 7 days pass with no top-up, keeper calls `expireSubscription(id)`.

### 3.4 Billing Intervals
- **Rule:** Three supported intervals — weekly (7 days), monthly (30 days), yearly (365 days).
- Stored as enum. Immutable after subscription creation.

### 3.5 Cancellation Authority
- Vault owner (subscriber) OR named guardian can cancel/pause.
- Only vault owner can resume.
- Guardian address stored per subscription (zero address if none).

### 3.6 Spending Cap (Hard Enforcement)
- `amount` set at creation is a hard cap. Contract reverts if keeper tries to pull more.
- `require(pullAmount <= subscription.amount, "ExceedsCap")` — enforced on-chain.

### 3.7 Custody Model
- User USDC sits inside their own Safe vault at all times.
- Protocol never holds user funds. Non-custodial architecture.
- Cancellation never moves funds — only revokes module permission.

### 3.8 Merchant Access (MVP)
- Invite-only. Only admin-whitelisted addresses can register as merchants.
- `MerchantRegistry.sol` with admin role. Revoked merchants cannot receive new subscriptions; existing ones continue until user cancels.

### 3.9 Protocol Revenue
- 0.5% coordination fee (feeBps = 50) on every successful pull.
- Hard ceiling: 2% (200 bps) — hardcoded, not upgradeable.
- Two transfers per pull: merchant receives 99.5%, protocol treasury 0.5%.

### 3.10 Merchant Features (v2)
- `setProductExpiry()` — merchant can schedule subscription expiry with minimum 30-day notice. Cannot shorten once set.
- `merchantPauseSubscription()` — merchant can pause billing for up to 90 days (customer service tool). Does NOT trigger grace period.
- Trial periods — up to 90 days. `lastPulledAt` set to `trialEndsAt` so first pull happens after trial.

### 3.11 Audit Trail & Notifications
- **Layer 1:** On-chain Solidity events (source of truth)
- **Layer 2:** Notifier backend polls events every 30s, fires merchant webhooks
- **Layer 3:** Email via Resend as fallback
- **Layer 4:** In-app activity feed (frontend reads events)

**Events emitted:**
- `ProtocolDeployed(protocol, version, deployer, chainId, timestamp)` — deployment tracking
- `SubscriptionCreated(id, owner, merchant, safeVault, amount, interval, guardian)`
- `PaymentExecuted(id, amount, merchantReceived, fee, timestamp)`
- `InsufficientFunds(id, required, available, pausedUntil)`
- `SubscriptionPaused(id, pausedBy, reason)`
- `SubscriptionCancelled(id, cancelledBy)`
- `SubscriptionResumed(id, timestamp)`
- `SubscriptionExpired(id, timestamp)`
- `SubscriptionPausedByMerchant(id, merchant, resumesAt)`
- `TrialStarted(id, trialEndsAt)`
- `ProductExpirySet(id, merchant, expiresAt, noticeDays)`
- `MerchantApproved(merchant)`
- `MerchantRevoked(merchant)`

---

## 4. Core Data Structures

```solidity
enum SubscriptionStatus { Active, Paused, Cancelled, Expired }
enum Interval { Weekly, Monthly, Yearly }

struct Subscription {
    address owner;          // Safe vault owner (subscriber)
    address guardian;       // Can also cancel/pause — zero address if none
    address merchant;       // Approved merchant — immutable after creation
    address safeVault;      // The Safe wallet that holds the USDC
    uint256 amount;         // USDC per pull, 6-decimal precision (hard cap)
    Interval interval;      // Weekly / Monthly / Yearly — immutable
    uint256 lastPulledAt;   // Timestamp of last successful pull
    uint256 pausedAt;       // Timestamp of pause start (0 = not paused)
    uint256 expiresAt;      // Timestamp of scheduled expiry (0 = no expiry set)
    uint256 trialEndsAt;    // Timestamp when trial ends (0 = no trial)
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
| `setProductExpiry(id, ts)` | Merchant only (on their own subscriptions) |
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
    SubscriptionVault.sol     — core vault logic (v1.0.0 BUSL-1.1)
    MerchantRegistry.sol      — invite-only merchant whitelist (v1.0.0 BUSL-1.1)
  scripts/
    deploy.js                 — deploys both contracts in one run
    keeper.js                 — keeper bot (also on Railway)
    notifier.js               — notification backend (also on Railway)
    monitor.js                — copy detector (watches for ProtocolDeployed events)
    db.js                     — PostgreSQL helpers
    webhook.js                — merchant webhook dispatcher
    approveMerchant.js        — admin utility
    createSubscription.js     — test utility
    checkBalance.js           — test utility
    diagnose.js               — debug utility
  frontend/
    src/App.jsx               — React frontend with RainbowKit wallet connection
  LICENSE                     — BUSL-1.1
  CLAUDE.md                   — this file (project memory)
  hardhat.config.js
  .env                        — secrets (gitignored)
  .env.example                — template (committed)
```

---

## 7. Security Constraints (Non-Negotiable)

1. **No upgradeability in MVP.** No proxy pattern. Deploy and freeze.
2. **Fee cap hardcoded at 200 bps (2%).** Not adjustable past this, even by admin.
3. **Re-entrancy guard on `executePull()`.** Inlined ReentrancyGuard.
4. **Pull amount validated on-chain.** `require(pullAmount <= subscription.amount)`.
5. **Merchant address locked at creation.** Cannot change post-creation.
6. **Cancellation never moves funds.** Only revokes module permission.
7. **BUSL-1.1 license.** Commercial use prohibited until 2030. Watermark constants baked into contract bytecode.
8. **`ProtocolDeployed` event** emitted on every deployment — monitor.js alerts on unauthorized copies.
9. **Ledger hardware wallet required before mainnet** for admin key and protocol treasury.
10. **Safe multisig required before mainnet** for admin role.

---

## 8. Development Phases

### Phase 0 — Environment Setup ✅
- [x] Hardhat project initialised
- [x] OpenZeppelin contracts installed
- [x] Base Sepolia RPC configured
- [x] `.env` template created

### Phase 1 — Contracts ✅
- [x] `MerchantRegistry.sol` — admin whitelist
- [x] `SubscriptionVault.sol` — core vault logic
- [x] Deploy to Base Sepolia — verified on Basescan
- [x] v2 additions: `setProductExpiry()`, `merchantPauseSubscription()`, trial periods
- [x] v1.0.0: BUSL-1.1 license, watermark constants, `ProtocolDeployed` event

### Phase 2 — Keeper Bot ✅
- [x] Node.js keeper service
- [x] Subscription polling logic
- [x] `executePull()` transaction signing
- [x] Grace period / auto-expire logic
- [x] Running on Railway

### Phase 3 — Notification Backend ✅
- [x] Event polling (getLogs every 30s — reliable on Alchemy free tier)
- [x] PostgreSQL storage (Railway)
- [x] Merchant webhook dispatcher with HMAC-SHA256 signing
- [x] Email via Resend
- [x] EUR/USD rate from CoinGecko on each payment
- [x] Running on Railway

### Phase 4 — Frontend ✅
- [x] React + Vite scaffolded
- [x] RainbowKit wallet connection
- [x] Dashboard: active subscriptions
- [x] Wallet connection working

### Phase 5 — IP Protection ✅
- [x] BUSL-1.1 LICENSE file added
- [x] Watermark constants in both contracts
- [x] `ProtocolDeployed` tracking event
- [x] `monitor.js` copy detector written

### Phase 6 — Audit & Mainnet 🔲
- [ ] Order Ledger Nano S Plus (ledger.com — do NOT buy from Amazon)
- [ ] Set up Safe multisig for admin role
- [ ] Add monitor.js as third Railway service
- [ ] Make GitHub repo public
- [ ] Connect Netlify to GitHub for auto-deploy
- [ ] External smart contract audit ($15–20K budget)
- [ ] Deploy to Base Mainnet with Ledger addresses
- [ ] Record mainnet addresses in Section 2

---

## 9. Key Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| Project start | Keeper bot initiates pulls | Removes UX friction; user signs once at setup |
| Project start | USDC only | Simplifies token approval logic; USDC is dominant on Base |
| Project start | 7-day grace period on low funds | Balances merchant reliability with user protection |
| Project start | Hard spending cap on-chain | Security-first; prevents merchant overreach |
| Project start | Funds inside Safe vault | Cleanest UX; Safe IS the wallet |
| Project start | Invite-only merchants for MVP | Reduces abuse vectors while ecosystem matures |
| Project start | 0.5% protocol fee (max 2% hardcoded) | Revenue model with user-protection ceiling |
| Project start | Full notification stack | Required for trust in a financial product |
| Apr 2026 | Rebranded from "The Opportunity" to AuthOnce | Cleaner brand; authonce.io domain purchased |
| Apr 2026 | Hardhat over Foundry | Already working; no need to switch |
| Apr 2026 | Polling over WebSocket for notifier | More reliable on Alchemy free tier |
| Apr 2026 | Railway for keeper + notifier | Simple deployment; $5/month Hobby plan |
| Apr 2026 | Resend for email | Simple API; free tier sufficient |
| Apr 2026 | RainbowKit for wallet connection | Best UX; supports MetaMask + WalletConnect |
| Apr 2026 | BUSL-1.1 license | Protects commercial use until 2030 |
| Apr 2026 | On-chain watermark + ProtocolDeployed event | Permanent proof of origin; enables copy detection |
| Apr 2026 | monitor.js on Railway | Zero extra cost; alerts on unauthorized deployments |
| Apr 2026 | Ledger required before mainnet | Admin key and treasury must be hardware-secured |

---

## 10. Grants & External Relations

| Grant / Program | Status | Date | Notes |
|---|---|---|---|
| Coinbase Base Ecosystem Fund | ✅ Submitted | Apr 2026 | $25–34K ask; PDF memo uploaded |
| Circle Alliance Program | ✅ Submitted | Apr 2026 | Pending review |
| Base Builder Grants | 📋 Apply next | — | $5K–25K; quick wins |
| IAPMEI (Portugal) | 📋 Consult | — | Portuguese startup support |
| Startup Portugal | 📋 Apply | — | Mentorship program |
| Ethereum Foundation | ⏳ After mainnet | — | Prefer live mainnet projects |

**Potential partner:** Nuno Correia — Portuguese co-founder of Utrust (crypto payments, SL Benfica). Utrust = one-time crypto payments; AuthOnce = recurring. Complementary, not competing. Warm door when live on mainnet.

---

## 11. Compliance & Legal

- **Non-custodial:** Protocol never holds user funds. Users hold USDC in their own Safe vault.
- **Swiss law:** Employment contract must be reviewed for Nebenbeschäftigung clause before commercializing.
- **Geofencing:** Block OFAC-sanctioned regions at API and frontend level (middleware required before mainnet).
- **Data minimisation:** No PII stored. Primary user identifier is vault address.
- **SRO membership:** Legal opinion needed before deciding whether to join PolyReg.
- **BUSL-1.1:** Commercial use of codebase prohibited until 2030-01-01.

---

## 12. Business Documents

Stored locally at `C:\AuthOnce-Docs\` (NOT in GitHub — sensitive):
- `Business\AuthOnce_BusinessPlan_2026_v2.docx`
- `Financial\AuthOnce_FinancialProjections.xlsx`
- `Grants\AuthOnce_GrantMemo_v3.pdf`
- `Technical\AuthOnce_TechnicalDocs.md`

---

*Last updated: 2026-04-26 — v1.0.0 deployed with BUSL-1.1 watermark. All phases 0–5 complete. Phase 6 (Audit & Mainnet) is next.*
*Next actions: Order Ledger → Make GitHub public → Connect Netlify → Add monitor.js to Railway.*
