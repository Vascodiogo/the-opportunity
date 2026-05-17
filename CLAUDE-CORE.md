# CLAUDE-CORE.md — AuthOnce Session Context
> This file lives in Project Knowledge. It auto-loads every session.
> For GTM, legal, DataOnce, analytics, decisions log: upload CLAUDE-REFERENCE.md when needed.

---

## 1. Project Overview
**AuthOnce** — Non-custodial USDC subscription protocol on Base Network.
**Tagline:** Authorize once. Pay forever. Stay in control.
**Domain:** authonce.io · **Target mainnet:** September 2026
**Founder:** Vasco (solo, Swiss/PT). Full-time at Hinti GmbH. Exit target: €3–10M, retire at 54–55.
**Local project:** `C:\The-Opportunity\` (frontend: `C:\The-Opportunity\frontend`) — paste files, not synced here.
**Local docs:** `C:\AuthOnce-Docs\` — CLAUDE-CORE.md, CLAUDE-REFERENCE.md, BusinessPlan v2, FinancialProjections, TechnicalDocs.

---

## 2. Stack

| Layer | Technology | Status |
|---|---|---|
| Smart Contracts | Solidity via **Hardhat** (not Foundry) | ✅ Base Sepolia |
| Keeper Bot | Node.js on Railway | ✅ Running 24/7 |
| Notifier | Node.js on Railway | ✅ Running |
| Backend API | Express.js on Railway | ✅ Built |
| Database | PostgreSQL on Railway | ✅ Schema live |
| Frontend | React + Vite on Netlify | ✅ Live at authonce.io |
| Auth (subscriber) | Google OAuth via Passport.js | ✅ Tested May 5 2026 |
| Auth (merchant/admin) | MetaMask / RainbowKit + JWT | ✅ Working |
| Fiat Onramp | Stripe Checkout (card/MB Way/Multibanco/SEPA) | ⬜ Not built — next |
| Stripe Connect | Merchant OAuth flow | ✅ Built in api.js |
| Notifications | Resend (notifications@authonce.io) + webhooks | ✅ Domain verified |
| DNS | Cloudflare (authonce.io) | ✅ Configured |
| Email receiving | Zoho — vasco@authonce.io | ✅ Working |
| Railway plan | Hobby ($5/month) | ✅ Upgraded |

**Contract addresses — Base Sepolia testnet:**
- SubscriptionVault v3: `0xED9a4322030b2523cBB4eD5479539a3afEe30afA`
- MerchantRegistry v3: `0x3124a01D023FA6F0AFDE1e89c6727FE3D0fAa3d5`
- USDC Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Contract addresses — Base Mainnet (not yet deployed):**
- USDC Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- SubscriptionVault: `[DEPLOY AND RECORD HERE]`
- MerchantRegistry: `[DEPLOY AND RECORD HERE]`
- Protocol Treasury: `0x737D4EeAEF67f776724482a29367615703A2DEB1`

**Protocol Treasury** (Safe 2/2): 0x00df2Db...[full address]
-Signer 1: Ledger (index 0)
-Signer 2: MetaMask

⚠️ **Security:** Deployer wallet key + Basescan API key exposed May 3 — testnet only, replace before mainnet. Local .env RESEND_API_KEY needs updating (Railway already updated).

---

## 3. Locked Business Rules — Do Not Change

- **USDC only** — hardcoded, no other token ever
- **Vault funded at exactly 1× subscription amount** — no over-funding, no balance, no refund UX
- **Keeper bot is the only caller of `executePull()`**
- **Protocol never holds funds** — non-custodial is non-negotiable, eliminates FINMA licence
- **Payment method at signup = all future pulls** — no changes, no surprises
- **Merchant pays all fees** — subscriber always pays the exact price shown
- **Grace period:** default 7 days, configurable per subscription, keeper retries daily
- **Billing intervals:** Weekly / Monthly / Yearly — immutable after creation
- **Cancellation:** vault owner or guardian only — merchant cannot block or delay
- **Protocol fee:** 0.5% default, hard ceiling 2% hardcoded, split atomically in executePull()
- **Price changes:** setProductExpiry() enforces 30-day minimum notice on-chain
- **Basic notifications free** on all tiers · Branded emails = Growth+ paid feature
- **Subscriber notified 3 days before** each scheduled payment
- **Subscriber portal login:** Google OAuth — no password, no wallet required

---

## 4. Backend File Map
```
scripts/
  keeper.js       — polls subscriptions, executes pulls, expires grace periods
  notifier.js     — on-chain event polling, sends notifications
  api.js          — Express REST API + Google OAuth + Stripe Connect
  db.js           — PostgreSQL (merchants, subscriptions, payments, webhook_deliveries, subscribers, data_consents)
  webhook.js      — HMAC-SHA256 dispatcher, 5-attempt exponential backoff
  admin-auth.js   — JWT admin auth (email/password)
```

**Google OAuth routes (built):** `/auth/google` · `/auth/google/callback` · `/api/subscriber/me`
Subscriber wallet: deterministic keccak256(seed:email), AES-256-GCM encrypted in DB.
Subscribers table: email, google_id, name, avatar_url, wallet_address, wallet_private_key (encrypted).

**Stripe Connect routes (built):** `/api/connect/authorize` · `/api/connect/callback` · `/api/connect/status` · `/api/connect/disconnect` · `/api/stripe/webhook`

**Stripe webhook TODO (mainnet blocker):** `payment_intent.payment_failed` → grace period + notifier · `payment_intent.succeeded` → merchant notification.

---

## 5. Frontend File Map
```
frontend/src/
  App.jsx                       — main app, wallet connect, view switcher
  LandingPage.jsx               — bilingual EN/PT
  i18n.js                       — internationalisation
  components/
    Dashboard.jsx               — subscriber view
    MerchantDashboard.jsx       — merchant portal (Overview, Products, Subscribers, Webhooks)
    PayPage.jsx                 — pay link page (Google OAuth working ✅, Stripe ⬜)
```
- Pay link URL: `authonce.io/pay/:merchantAddress/:productSlug` ✅ routing works
- Subscriber portal `authonce.io/my-subscriptions` — **NOT YET BUILT**
- Admin: `authonce.io/admin` — JWT login, no wallet needed
- Light/dark mode · Bilingual EN/PT · Deployed Netlify

---

## 6. Phase Status

| Phase | Description | Status |
|---|---|---|
| 0–4 | Contracts, Keeper, Backend, Webhooks, Frontend | ✅ Complete |
| 5a | Google OAuth subscriber auth | ✅ Complete May 5 2026 |
| 5b | Stripe Checkout — card/MB Way/Multibanco/SEPA → vault | ⬜ **Next — mainnet blocker** |
| 5c | Stripe webhook wiring | ⬜ Not started — **mainnet blocker** |
| 6 | Geofencing middleware (HTTP 451 OFAC) | ⬜ Not started — **mainnet blocker** |
| 7 | Legal docs | 🔄 In review (Fio Legal contacted) |
| 8 | Smart contract audit ($15–20K) | ⬜ Not started |
| 9 | Safe multisig + Ledger (Ledger ordered) | ⬜ Not started |
| 10 | Subscriber portal (authonce.io/my-subscriptions) | ⬜ Not started — **mainnet blocker** |
| 11 | MB Way + Multibanco + SEPA | ⬜ Enabled on Stripe, not wired |
| 12 | Mainnet deployment | ⬜ Blocked by 5b–11 |

---

## 7. Session Priorities (in order — do not skip)

1. ✅ Google OAuth — DONE
2. **Stripe Checkout** — card/MB Way/Multibanco → EUR collected → USDC → vault
3. **Stripe webhook wiring** — payment events → grace period + notifier
4. **Subscriber portal** — authonce.io/my-subscriptions
5. **Geofencing** — HTTP 451 OFAC regions
6. **Sat May 10** — Merchant approval UI + MRR chart + Saved Revenue analytics

**Session file protocol:** Upload CLAUDE-CORE.md every session. Upload specific files being touched (max 2-3). Never upload CLAUDE-REFERENCE.md unless specifically needed.

---

## 8. Merchant Pricing Tiers

| Tier | Price | Protocol Fee |
|---|---|---|
| Starter | Free | 1.0% per pull |
| Growth | €49/month | 0.5% per pull |
| Business | €199/month | 0.3% per pull |
| Enterprise | Custom | 0.1–0.2% |

20 Growth merchants = €980/month guaranteed before a single transaction.

---

## 9. Pre-Mainnet Checklist (Code)
- [ ] Stripe Checkout — card/MB Way/Multibanco → vault
- [ ] Stripe webhook wiring — payment_intent events → grace period + notifier
- [ ] SEPA bank transfer — enabled on Stripe, needs wiring
- [ ] Geofencing — HTTP 451 OFAC, IP never logged
- [ ] Subscriber portal — Google OAuth login, cancel/pause/history
- [ ] 3-day pre-payment notification — not wired
- [ ] Price change 30-day notification — not wired
- [ ] Notification tier enforcement (Starter vs Growth+)
- [ ] Merchant approval UI in Admin Dashboard
- [ ] MRR chart + Saved Revenue analytics in Merchant Dashboard
- [ ] Separate keeper/notifier Railway services
- [ ] New deployer wallet (key exposed May 3)
- [ ] Rotate Basescan API key (exposed May 3)
- [ ] Update local .env RESEND_API_KEY
- [ ] Safe multisig for admin
- [ ] Ledger hardware wallet (ordered — arriving ~May 12)
- [ ] Smart contract audit ($15–20K)
- [ ] Google OAuth app publishing (console.cloud.google.com → authonce-pay-safe)
- [ ] Netlify _redirects for SPA routing on production

---

## 10. Go-To-Market — Day 1 Target

**Web3 SaaS + DAOs first. Portuguese gyms second.**

- Day 1: Crypto-native merchants — zero onramp friction, pure 0.5% fee
- Year 2: Fiat merchants — after Circle CPN integration

**B2B2C model:** Sell to SaaS tools (Dune Analytics, Messari etc) → they bring DAO subscribers automatically.

**Stripe keys (test):**
- Publishable: `pk_test_51TRzB99OrTZ08FUb...` (in frontend/.env as VITE_STRIPE_PUBLISHABLE_KEY)
- Secret: in Railway env as STRIPE_SECRET_KEY

---

## 11. How to Update This File
Paste the section to change into chat → Claude produces replacement text → copy-paste into local `C:\AuthOnce-Docs\CLAUDE-CORE.md` → re-upload to Project Knowledge (replace existing file).

**CLAUDE-REFERENCE.md** contains: decisions log, fee analysis, competitive landscape, legal notes, marketing strategy, DataOnce, social media. Upload only when needed.

*Last updated: 2026-05-08*
