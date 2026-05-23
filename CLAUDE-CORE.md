# CLAUDE-CORE.md — AuthOnce Session Context
> This file lives in Project Knowledge. It auto-loads every session.
> For GTM, legal, DataOnce, analytics, decisions log: upload CLAUDE-REFERENCE.md when needed.

---

## 1. Project Overview
**AuthOnce** — Non-custodial multi-token subscription protocol on Base Network.
**Tagline:** Authorize once. Pay forever. Stay in control.
**Domain:** authonce.io · **Target mainnet:** September 2026
**Founder:** Vasco (solo, Swiss/PT). Full-time at Hinti GmbH. Exit target: €3–10M, retire at 54–55.
**Local project:** `C:\The-Opportunity\` (frontend: `C:\The-Opportunity\frontend`) — paste files, not synced here.
**Local docs:** `C:\AuthOnce-Docs\` — CLAUDE-CORE.md, CLAUDE-REFERENCE.md, BusinessPlan v2, FinancialProjections, TechnicalDocs.

---

## 2. Stack

| Layer | Technology | Status |
|---|---|---|
| Smart Contracts | Solidity 0.8.24 via **Hardhat** | ✅ Base Sepolia v5 |
| Keeper Bot | Node.js v5 on Railway | ✅ Running 24/7 |
| Notifier | Node.js v5 on Railway | ✅ Running |
| Backend API | Express.js on Railway | ✅ Built |
| Database | PostgreSQL on Railway | ✅ Schema live |
| Frontend | React + Vite on Cloudflare Pages | ✅ Live at authonce.io |
| Auth (subscriber) | Google OAuth via Passport.js | ✅ Verified + Published May 17 2026 |
| Auth (merchant/admin) | MetaMask / RainbowKit + JWT | ✅ Working |
| Fiat Onramp | Stripe Checkout (card/MB Way/Multibanco/SEPA) | ⬜ Not built — next |
| Stripe Connect | Merchant OAuth flow | ✅ Built in api.js |
| Notifications | Resend (notifications@authonce.io) + webhooks | ✅ Branded HTML templates v5 |
| Custom Sender Domains | Resend domain API (Business+ tier) | ✅ Built in resend-domains.js |
| DNS | Cloudflare (authonce.io) | ✅ Configured |
| Email receiving | Zoho — vasco@authonce.io | ✅ Working |
| Railway plan | Hobby ($5/month) | ✅ Active |

**Contract addresses — Base Sepolia testnet:**
- SubscriptionVault v5: `0x9ce26F5d8C4cc7942022FFCa9D4D574D8c497662`
- MerchantRegistry v2:  `0xBa8071912Ce59cD9D3D153120C59516fBae10A5C`
- USDC Sepolia:         `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Contract addresses — Base Mainnet (not yet deployed):**
- USDC Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- SubscriptionVault v5: `[DEPLOY AND RECORD HERE]`
- MerchantRegistry v2:  `[DEPLOY AND RECORD HERE]`
- Protocol Treasury:    `0x737D4EeAEF67f776724482a29367615703A2DEB1`

**Wallets:**
- Deployer: `0xDcbFdDD5d849271D984867f682204B43B5eBBD40` (new — May 23 2026)
- Keeper:   `0x08d3817E5D6dfebA6c9E566dc775B5F12D0EEF99` (new — May 23 2026)
- Protocol Treasury (Safe 2/2): `0x737D4EeAEF67f776724482a29367615703A2DEB1`
  - Signer 1: Ledger (index 0)
  - Signer 2: MetaMask `0x00df2Dbb2455C372204EdD901894E27281fA02C0`
  - Threshold: 2/2 — upgrade to 2/3 when sister added

⚠️ **Security:** Old deployer key exposed May 3 — replaced May 23. Basescan API key: uses Etherscan V2 key (same key works for Base). Local .env RESEND_API_KEY needs updating (Railway already updated).

---

## 3. Locked Business Rules — Do Not Change

- **Multi-token** — USDC, USDT, DAI, EURC, WETH, cbBTC. Admin whitelist controls approved tokens.
- All whitelisted tokens available to all merchants and tiers — no tier restrictions on tokens.
- **Protocol fee: 0.5% global** — same for all merchants, all tokens, all tiers. Hard ceiling 2% hardcoded.
- **Vault funded at exactly 1× subscription amount** — no over-funding, no balance, no refund UX.
- **Keeper bot is the only caller of `executePull()`** — signature: `executePull(id, deadline, signature)`
- **EOA subscribers:** pass `deadline=0, signature="0x"` — ERC-1271 check skipped by contract.
- **EIP-712 + ERC-1271** — contract wallet / AI agent subscribers use structured pull authorisation.
- **Protocol never holds funds** — non-custodial is non-negotiable, eliminates FINMA licence.
- **Payment token at signup = all future pulls** — token is immutable per subscription.
- **Merchant pays all fees** — subscriber always pays the exact price shown.
- **Grace period:** default 7 days, configurable 1–30 days per subscription, keeper retries daily.
- **Billing intervals:** Weekly / Monthly / Yearly — immutable after creation.
- **Cancellation:** vault owner or guardian only — merchant cannot block or delay.
- **Price changes:** `setProductExpiry()` enforces 30-day minimum notice on-chain.
- **Basic notifications free** on all tiers · Branded emails (Growth+) · Custom sender domain (Business+).
- **Subscriber notified 3 days before** each scheduled payment.
- **Subscriber portal login:** Google OAuth — no password, no wallet required.
- **DataOnce field:** `dataVaultId` (bytes32) on every subscription — Phase 2 placeholder, zero by default.
- **Tier enforcement is off-chain** — contract knows nothing about tiers. API + Stripe enforces.
- **Product limits:** 10 products per Starter merchant — enforced in API, not contract.
- **Self-serve merchant registration:** off by default (`selfServeEnabled = false`). Admin flips post-launch.
- **Two-step admin transfer** — both vault and registry use propose/accept pattern. No single-step transfer.

---

## 4. Backend File Map
```
scripts/
  keeper.js           — polls subscriptions, executes pulls, expires grace periods (v5)
  notifier.js         — on-chain event polling, sends branded notifications (v5)
  api.js              — Express REST API + Google OAuth + Stripe Connect + domain/branding endpoints
  db.js               — PostgreSQL schema and queries
  webhook.js          — HMAC-SHA256 dispatcher, 5-attempt exponential backoff
  admin-auth.js       — JWT admin auth (email/password)
  email-templates.js  — Branded HTML email templates (all notification types, whitelabel support)
  resend-domains.js   — Merchant custom sender domain management via Resend API
  deploy.js           — Hardhat deployment script (MerchantRegistry → SubscriptionVault → tokens)
```

**Google OAuth routes (built):** `/auth/google` · `/auth/google/callback` · `/api/subscriber/me`
Subscriber wallet: deterministic keccak256(seed:email), AES-256-GCM encrypted in DB.

**Stripe Connect routes (built):** `/api/connect/authorize` · `/api/connect/callback` · `/api/connect/status` · `/api/connect/disconnect`

**Stripe webhook TODO (mainnet blocker):** `payment_intent.payment_failed` → grace period + notifier · `payment_intent.succeeded` → vault funding + merchant notification.

**Whitelabel / branding routes (built):**
- `POST /api/merchant/branding` — set brand_name + brand_color (Growth+)
- `GET  /api/merchant/branding` — get current branding
- `POST /api/merchant/email-domain` — register custom sender domain (Business+)
- `POST /api/merchant/email-domain/verify` — verify DNS records with Resend
- `GET  /api/merchant/email-domain` — get domain status + DNS instructions
- `DELETE /api/merchant/email-domain` — remove custom domain

---

## 5. Frontend File Map
```
frontend/src/
  App.jsx                       — main app, wallet connect, view switcher, lang switching (localStorage)
  LandingPage.jsx               — bilingual EN/PT, mobile responsive, multi-token copy
  i18n.js                       — internationalisation (EN/PT)
  components/
    Dashboard.jsx               — subscriber view
    MerchantDashboard.jsx       — merchant portal (Overview, Products, Subscribers, Webhooks)
    PayPage.jsx                 — pay link page (Google OAuth ✅, Stripe ⬜)
    MySubscriptions.jsx         — subscriber portal ✅ Built May 17
    AdminDashboard.jsx          — admin portal
    Pricing.jsx                 — pricing page
```
- Pay link URL: `authonce.io/pay/:merchantAddress/:productSlug` ✅
- Subscriber portal: `authonce.io/my-subscriptions` ✅ Built May 17
- Admin: `authonce.io/admin` — JWT login, no wallet needed
- Light/dark mode · Bilingual EN/PT · Deployed Cloudflare Pages
- PT/EN language switching via localStorage (fixes browser language override bug)
- Mobile responsive via CSS media queries (640px + 480px breakpoints)

---

## 6. Phase Status

| Phase | Description | Status |
|---|---|---|
| 0–4 | Contracts, Keeper, Backend, Webhooks, Frontend | ✅ Complete |
| 5a | Google OAuth subscriber auth | ✅ Complete May 5 2026 |
| 5b | Stripe Checkout — card/MB Way/Multibanco/SEPA → vault | ⬜ **Next — mainnet blocker** |
| 5c | Stripe webhook wiring | ⬜ Not started — **mainnet blocker** |
| v5 | Multi-token, EIP-712, ERC-1271, DataOnce, external registry | ✅ Complete May 23 2026 |
| 6 | Geofencing middleware (HTTP 451 OFAC) | ✅ Built — in api.js |
| 7 | Legal docs | 🔄 In review (Fio Legal contacted) |
| 8 | Smart contract audit ($15–20K) | ⬜ Not started |
| 9 | Safe multisig + Ledger | ⬜ Ledger ordered |
| 10 | Subscriber portal | ✅ Built May 17 |
| 11 | MB Way + Multibanco + SEPA | ⬜ Enabled on Stripe, not wired |
| 12 | Mainnet deployment | ⬜ Blocked by 5b, 5c, 8 |

---

## 7. Session Priorities (in order — do not skip)

1. ✅ Google OAuth — DONE
2. ✅ v5 contracts — multi-token, EIP-712, ERC-1271 — DONE May 23
3. ✅ Notification system — branded HTML, all missing emails fixed — DONE May 23
4. ✅ Whitelabel emails + custom sender domains — DONE May 23
5. **Stripe Checkout** — card/MB Way/Multibanco → EUR → vault funding (Phase A: manual USDC transfer)
6. **Stripe webhook wiring** — payment events → grace period + notifier
7. **Smart contract audit** — Cyfrin or Hashlock ($15–20K)
8. **Developer SDK** — `npm install @authonce/sdk`

**Session file protocol:** Upload CLAUDE-CORE.md every session. Upload specific files being touched (max 2-3). Never upload CLAUDE-REFERENCE.md unless specifically needed.

---

## 8. Merchant Pricing Tiers

| Tier | Price | Protocol fee | Features |
|---|---|---|---|
| Starter | Free | 0.5% on-chain | Full protocol, all tokens, webhooks, basic notifications |
| Growth | €49/month | 0.5% on-chain | + Branded emails (merchant name/color), lower Stripe app fee |
| Business | €199/month | 0.5% on-chain | + Custom sender domain (noreply@merchant.com), advanced analytics |
| Enterprise | Custom | 0.5% on-chain | + Custom integrations, SLA, white-label |

**Note:** Protocol fee is 0.5% for everyone — same on-chain. Tier differences are platform features + Stripe application fee. Tier enforcement is off-chain (API + Stripe Connect).

20 Growth merchants = €980/month guaranteed before a single transaction.

---

## 9. Pre-Mainnet Checklist (Code)
- [ ] Stripe Checkout — card/MB Way/Multibanco → vault (Phase A: manual USDC transfer)
- [ ] Stripe webhook wiring — payment_intent events → grace period + notifier
- [ ] SEPA bank transfer — enabled on Stripe, needs wiring
- [x] Geofencing — HTTP 451 OFAC, IP never logged ✅
- [x] Subscriber portal — authonce.io/my-subscriptions ✅ Built May 17
- [x] 3-day pre-payment notification ✅ Built in notifier.js v5
- [x] Price change 30-day notification ✅ Built in notifier.js v5
- [ ] Notification tier enforcement (Starter vs Growth+ branding)
- [ ] Merchant approval UI in Admin Dashboard
- [ ] MRR chart + Saved Revenue analytics in Merchant Dashboard
- [ ] Separate keeper/notifier Railway services
- [x] New deployer wallet ✅ May 23 — `0xDcbFdDD5d849271D984867f682204B43B5eBBD40`
- [x] New keeper wallet ✅ May 23 — `0x08d3817E5D6dfebA6c9E566dc775B5F12D0EEF99`
- [x] Basescan API key ✅ Using Etherscan V2 (same key, works for Base)
- [ ] Update local .env RESEND_API_KEY
- [ ] Safe multisig for admin (Ledger ordered)
- [ ] Smart contract audit ($15–20K) — Cyfrin or Hashlock
- [x] Google OAuth app publishing ✅ Verified May 17
- [x] Cloudflare Pages SPA routing ✅
- [x] Legal pages live — authonce.io/privacy/ and authonce.io/terms/ ✅
- [x] v5 contracts deployed Base Sepolia ✅ May 23
- [x] v5 contracts verified Sourcify ✅ May 23
- [x] Branded HTML email templates ✅ May 23
- [x] All notification gaps fixed ✅ May 23
- [x] Whitelabel email support (Growth+) ✅ May 23
- [x] Custom sender domain support (Business+) ✅ May 23
- [x] DB migration — tier, brand_name, brand_color, merchant_email_domains ✅ May 23

---

## 10. Go-To-Market — Day 1 Target

**Crypto-native merchants first. Portuguese gyms second.**

- Day 1: Crypto-native merchants — zero onramp friction, pure 0.5% fee
- First merchant candidate: @AlgoSniperCrypto Telegram channel (Vasco's algo trading channel)
- Year 2: Fiat merchants — after Stripe Checkout integration

**B2B2C model:** Sell to SaaS tools (Dune Analytics, Messari etc) → they bring DAO subscribers automatically.

**Fiat → USDC bridge (Phase A — manual):**
- Stripe collects EUR → backend records payment → admin email sent to Vasco
- Vasco manually sends USDC from treasury to subscriber vault
- Keeper picks up funded vault and executes pull within 60s
- Phase B (post-audit): automate USDC transfer from treasury wallet via webhook

**Protocol Treasury float needed for Phase A:** ~$200–500 USDC. Recycled via 0.5% protocol fee returns.

**Stripe keys (test):**
- Publishable: `pk_test_51TRzB99OrTZ08FUb...` (in frontend/.env as VITE_STRIPE_PUBLISHABLE_KEY)
- Secret: in Railway env as STRIPE_SECRET_KEY

---

## 11. Infrastructure Reference

**Frontend hosting:** Cloudflare Pages
  Project: authonce · Build: `npm run build` · Dist: `dist` · Root: `frontend`
  Domain: authonce.io (Cloudflare DNS, auto-updated on push)

**Railway project:** supportive-prosperity (Hobby $5/month)
  Services: the-opportunity (keeper + notifier + api), postgres, monitor, farcaster-bot
  Key env vars: VAULT_ADDRESS, KEEPER_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY, DATABASE_URL,
                RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
                GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, ENCRYPTION_KEY,
                PROTOCOL_TREASURY_ADDRESS, BASE_SEPOLIA_RPC_URL, BASESCAN_API_KEY

**Farcaster Bot:**
  Service: farcaster-bot on Railway
  URL: farcaster-bot-production.up.railway.app
  Repo: github.com/Vascodiogo/authonce-farcaster-bot
  Account: @authonce on Warpcast (FID: 3324301)
  Neynar API key: EE7602A6-... (in Railway env)
  Posts: Mon + Thu 09:00 UTC to /base and /defi channels
  Mention monitor: every 10 min → approval email to vasco@authonce.io

**Hardhat networks:**
  - `base-sepolia` — chainId 84532, `https://sepolia.base.org`
  - `base-mainnet` — chainId 8453, `https://mainnet.base.org`

**Deploy command:** `npx hardhat run scripts/deploy.js --network base-sepolia`
**Verify command:** `npx hardhat verify --network base-sepolia <address> <constructor args>`

---

## 12. Next Session Priorities

1. **Stripe Checkout** — `POST /api/stripe/checkout` creates session, `POST /api/stripe/webhook` handles events
2. **Stripe webhook** — `payment_intent.succeeded` → admin email (Phase A manual USDC) + vault record
3. **Stripe webhook** — `payment_intent.payment_failed` → grace period trigger
4. **keeper.js** — update `getSubscriptionIds()` to DB-driven query (scale prep)
5. **Merchant approval UI** — Admin Dashboard approve/reject pending merchants
6. **MRR chart + Saved Revenue** — Merchant Dashboard analytics
7. **Smart contract audit** — contact Cyfrin or Hashlock
8. **Developer SDK** — `npm install @authonce/sdk`
9. **GitHub repo metadata** — topics, description (pending v5 mainnet)
10. **Farcaster bio** — update from "Base Sepolia" to "Base Network" after mainnet

**How to update this file:**
Paste the section to change into chat → Claude produces replacement text → copy-paste into
`C:\AuthOnce-Docs\CLAUDE-CORE.md` → re-upload to Project Knowledge (replace existing file).

**CLAUDE-REFERENCE.md** contains: decisions log, fee analysis, competitive landscape, legal notes,
marketing strategy, DataOnce, social media. Upload only when needed.

*Last updated: 2026-05-23*
