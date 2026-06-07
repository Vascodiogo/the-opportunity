# CLAUDE-CORE.md — AuthOnce Session Context
> This file lives in Project Knowledge. It auto-loads every session.
> For GTM, legal, DataOnce, analytics, decisions log: upload CLAUDE-REFERENCE.md when needed.

---

## 1. Project Overview
**AuthOnce** — Non-custodial multi-token subscription protocol on Base Network.
**Tagline:** Authorize once. Pay forever. Stay in control.
**Domain:** authonce.io · **Target mainnet:** September 2026
**Founder:** Vasco (solo, Swiss/PT). Full-time employment in Switzerland. Exit target: €3–10M, retire at 54–55.
**Local project:** `C:\The-Opportunity\` (frontend: `C:\The-Opportunity\frontend`) — paste files, not synced here.
**Local docs:** `C:\AuthOnce-Docs\` — CLAUDE-CORE.md, CLAUDE-REFERENCE.md, BusinessPlan v2, FinancialProjections, TechnicalDocs, AuthOnce-InvestorQA-2026.docx.

---

## 2. Stack

| Layer | Technology | Status |
|---|---|---|
| Smart Contracts | Solidity 0.8.24 via **Hardhat** | ✅ Base Sepolia v6 (all audit fixes applied May 31) |
| Keeper Bot | Node.js v6 on Railway | ✅ Dedicated service — authonce-keeper |
| Notifier | Node.js v6 on Railway | ✅ Dedicated service — authonce-notifier |
| X Bot | Node.js on Railway | ✅ Dedicated service — authonce-x-bot |
| Backend API | Express.js on Railway | ✅ Dedicated service — the-opportunity (API only) |
| Database | PostgreSQL on Railway | ✅ Schema live |
| Frontend | React + Vite on Cloudflare Pages | ✅ Live at authonce.io |
| Auth (subscriber) | Google OAuth via Passport.js | ✅ Verified + Published May 17 2026 |
| Auth (merchant/admin) | MetaMask / RainbowKit + JWT | ✅ Working |
| Admin security | Cloudflare Access + rate limiting | ✅ May 24 2026 |
| Fiat Onramp | Stripe Checkout (card/MB Way/Multibanco/SEPA) | ✅ Phase A built May 24. SEPA mandate options + MB Way fix Jun 7 |
| Stripe Connect | Merchant OAuth flow | ✅ Built in api.js |
| Notifications | Resend (notifications@authonce.io) + webhooks | ✅ Branded HTML templates v5 |
| Custom Sender Domains | Resend domain API (Business+ tier) | ✅ Built in resend-domains.js |
| DNS | Cloudflare (authonce.io) | ✅ Configured |
| Email receiving | Zoho — vasco@authonce.io | ✅ Working |
| Railway plan | Hobby ($5/month) | ✅ Active |
| Landing page | LandingPage.jsx v3 — Web3 native, gradient hero | ✅ Updated May 30 |

**Contract addresses — Base Sepolia testnet (redeployed May 31 with all audit fixes — v6):**
- SubscriptionVault v6: `0x55180314174B30e778f35357035d49cAEF55C835`
- MerchantRegistry v3:  `0x989376ff6195be2e76871535Db21CB8BdC9175D4`
- USDC Sepolia:         `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Contract addresses — Base Mainnet (not yet deployed):**
- USDC Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- SubscriptionVault v6: `[DEPLOY AND RECORD HERE]`
- MerchantRegistry v3:  `[DEPLOY AND RECORD HERE]`
- Protocol Treasury:    `0x737D4EeAEF67f776724482a29367615703A2DEB1`

**Wallets:**
- Deployer: `0xbb6d960b8671713bb92be92d03BE8d8165EE7782` (new — May 30 2026)
- Keeper:   `0xdCEa737ec293DFF0B18C315CA90f494F8CB2C151` (confirmed May 31 2026)
- Protocol Treasury (Safe 2/2): `0x737D4EeAEF67f776724482a29367615703A2DEB1`
  - Signer 1: Ledger `0x94FD52B6a6FcAcCb41BBE5717264BC9e95a35B4a`
  - Signer 2: MetaMask `0x00df2Dbb2455C372204EdD901894E27281fA02C0`
  - Threshold: 2/2 — upgrade to 2/3 when sister added

✅ **Security:** Deployer key replaced May 30. Keeper wallet confirmed May 31. DEPLOYER_PRIVATE_KEY corrected in Railway Jun 7. STRIPE_SECRET_KEY confirmed sk_live_ Jun 7.

⚠️ **Mainnet wallet balances (Jun 7):**
- Keeper `0xdCEa737...` — 0 ETH on Base Mainnet (testnet topped up Jun 7)
- Safe multisig `0x737D4...` — 0.0009 ETH on Base Mainnet
- Both need top-up to 0.05 ETH before September mainnet

---

## 3. Locked Business Rules — Do Not Change

- **Multi-token** — USDC, USDT, DAI, EURC for subscriptions. WETH/cbBTC blocked until v6 Chainlink oracle.
- Admin whitelist controls approved tokens. All whitelisted tokens available to all tiers.
- **Protocol fee: 0.5% global** — same for all merchants, all tokens, all tiers. Hard ceiling 2% hardcoded.
- **Fee is one-way ratchet** — can only be lowered, never raised. Enforced in setFeeBps().
- **Vault funded at exactly 1× subscription amount** — no over-funding, no balance, no refund UX.
- **Keeper bot is the only caller of `executePull()`** — signature: `executePull(id, deadline, signature)`
- **safeVault must equal msg.sender** — enforced in createSubscription() to prevent unauthorised subscriptions.
- **EOA subscribers:** pass `deadline=0, signature="0x"` — ERC-1271 check skipped by contract.
- **EIP-712 + ERC-1271** — contract wallet / AI agent subscribers use structured pull authorisation.
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
- **Stablecoin-only subscriptions** — WETH/cbBTC require Chainlink USD oracle. Planned v6.
- **Multi-currency fiat pricing** — 15 currencies: EUR, USD, GBP, CHF, BRL, CAD, AUD, SEK, NOK, DKK, SGD, HKD, INR, JPY, KRW. No RUB (OFAC).
- **Price type toggle** — merchant sets price in USDC (crypto) or fiat currency. Both supported.
- **Merchant pause cooldown** — 30-day cooldown + 90-day lifetime cap enforced in contract.
- **Blacklist mechanism** — permanently banned merchants cannot re-register.
- **MAX_MERCHANTS cap** — 10,000 merchants maximum in MerchantRegistry.
- **Fee-on-transfer tokens not supported** — admin whitelist enforces standard ERC-20 only.

---

## 4. Backend File Map
```
scripts/
  keeper.js           — polls subscriptions, executes pulls, expires grace periods (v6)
  notifier.js         — on-chain event polling, sends branded notifications (v6)
  api.js              — Express REST API + Google OAuth + Stripe + admin endpoints
  db.js               — PostgreSQL schema, queries, migrations (auto-runs on startup)
  webhook.js          — HMAC-SHA256 dispatcher, branded fallback emails, 5-attempt backoff
  admin-auth.js       — JWT admin auth (email/password + rate limiting)
  email-templates.js  — Branded HTML email templates (all notification types, whitelabel)
  resend-domains.js   — Merchant custom sender domain management via Resend API
  deploy.js           — Hardhat deployment script (MerchantRegistry → SubscriptionVault → tokens)
  x-bot.js            — X/Twitter bot (Mon/Wed/Fri 12:00 UTC)
```

**Stripe Checkout (Phase A — built May 24, SEPA + MB Way fixed Jun 7):**
- `POST /api/stripe/checkout` — creates session with live CoinGecko fiat rate
- `checkout.session.completed` → subscriber wallet auto-created + admin vault funding email
- `payment_intent.payment_failed` → grace period + subscriber email
- `charge.dispute.created` → pauses subscription, notifies merchant, logs to audit_log ✅ Jun 7
- `charge.dispute.closed` → logs outcome to audit_log ✅ Jun 7
- SEPA mandate options + `setup_future_usage: "off_session"` ✅ Jun 7
- MB Way fixed: `mb_way` (was wrongly `card`) ✅ Jun 7
- Admin receives: exact USDC amount, vault address, treasury address, exchange rate
- Phase B (post-audit): automate treasury → vault USDC transfer

**Admin API routes (built):**
- `GET /api/admin/subscriptions` — searchable, filterable
- `GET /api/admin/subscribers` — email/wallet lookup
- `DELETE /api/admin/subscribers/:email` — GDPR right to erasure ✅ Jun 7
- `GET /api/admin/gdpr/pending` — pending on-chain cancellations ✅ Jun 7
- `POST /api/admin/gdpr/pending/:id/resolve` — mark resolved ✅ Jun 7
- `GET /api/admin/payments` — full history with token + fiat
- `GET /api/admin/webhooks` — delivery log
- `GET /api/admin/audit-log` — admin action history
- `POST /api/admin/subscriptions/:id/cancel` — force cancel
- `GET /api/admin/tax/protocol-fees` — AuthOnce CSV (EUR + CHF)
- `GET /api/admin/tax/merchant` — merchant XLSX (payments + guide tab)

**Whitelabel / branding routes (built):**
- `POST /api/merchant/branding` — set brand_name + brand_color (Growth+)
- `POST /api/merchant/email-domain` — register custom sender domain (Business+)
- `POST /api/merchant/email-domain/verify` — verify DNS with Resend
- `GET/DELETE /api/merchant/email-domain` — manage domain

---

## 5. Frontend File Map
```
frontend/src/
  App.jsx                       — main app, light mode default, lang switching (localStorage)
  LandingPage.jsx               — v3: Web3 native, gradient hero, GTM, competition ✅ May 30
  i18n.js                       — internationalisation (EN/PT)
  config.js                     — v6 ABI, contract addresses, VITE_ALCHEMY_KEY
  components/
    Dashboard.jsx               — subscriber view
    MerchantDashboard.jsx       — merchant portal + VAT/country/billing fields ✅ Jun 7
    PayPage.jsx                 — pay link page (Google OAuth ✅, Stripe Phase A ✅)
    MySubscriptions.jsx         — subscriber portal ✅
    AdminDashboard.jsx          — admin portal v2 (10 tabs + GDPR pending + wallet balances) ✅ Jun 7
    Pricing.jsx                 — pricing page
```
- Pay link URL: `authonce.io/pay/:merchantAddress/:productSlug` ✅
- Subscriber portal: `authonce.io/my-subscriptions` ✅
- Admin: `authonce.io/admin` — Cloudflare Access (vasco@authonce.io only) + JWT
- Light mode default · Dark mode toggle · Bilingual EN/PT · Deployed Cloudflare Pages
- VITE_ALCHEMY_KEY set in frontend/.env and Cloudflare Pages env vars

---

## 6. Phase Status

| Phase | Description | Status |
|---|---|---|
| 0–4 | Contracts, Keeper, Backend, Webhooks, Frontend | ✅ Complete |
| 5a | Google OAuth subscriber auth | ✅ Complete May 5 2026 |
| 5b | Stripe Checkout Phase A — manual USDC bridge | ✅ Complete May 24 2026 |
| 5c | Stripe webhook wiring | ✅ Complete May 24 2026 |
| v5 | Multi-token, EIP-712, ERC-1271, DataOnce, external registry | ✅ Complete May 23 2026 |
| 6 | Geofencing middleware (HTTP 451 OFAC) | ✅ Built — in api.js |
| 7 | Legal docs | 🔄 Fio Legal contacted — Patent Box €1,200 offer pending decision |
| 8 | Smart contract audit | 🔄 Cyfrin proposal received ($12K, 3 days, August) — awaiting funds |
| 9 | Safe multisig + Ledger | ✅ Complete May 30 — Safe confirmed on Base Mainnet |
| 10 | Subscriber portal | ✅ Built May 17 |
| 11 | SEPA bank transfer | ✅ Wired Jun 7 — mandate options + dispute handlers |
| 12 | Security fixes applied to contracts | ✅ Complete May 30 |
| 13 | Contracts redeployed to Base Sepolia | ✅ Complete May 30 |
| 14 | Landing page v3 | ✅ Complete May 30 |
| 15 | Pitch deck v2 | ✅ Complete May 30 |
| 16 | GDPR right to erasure | ✅ Complete Jun 7 |
| 17 | Railway service separation | ✅ Complete Jun 7 |
| 18 | Mainnet deployment | ⬜ Blocked by audit |

---

## 7. Smart Contract Security Fixes (May 30)

Both contracts fixed following AI audit (Hashlock AI tool). Key fixes:

**SubscriptionVault.sol:**
- [H2] `require(safeVault == msg.sender)` — prevents unauthorised subscription creation
- [M1] One-way ratchet on `setFeeBps` — fee can only decrease
- [M2] CEI pattern in `executePull` — state updated before transfers
- [M3] SafeERC20 used for all token transfers
- [M6] Merchant pause cooldown (30 days) + lifetime cap (90 days)
- [M7] Merchant transfer uses try/catch — merchant cannot DoS pulls
- [L1] `approvedTokenList()` filters revoked tokens
- [L3] Guardian can resume subscription
- [L4] `updateSafeVault()` added
- [L5] `nextPullDue()` returns block.timestamp when lastPulledAt == 0
- [L7] Dead pausedAt == 0 branch removed

**MerchantRegistry.sol:**
- [H1] `require(_admin.code.length > 0)` — commented out for Sepolia, MUST uncomment for mainnet
- [M2] Blacklist mapping added
- [M3] `setSelfServe()` no-op guard
- [L2] Cancellation event on admin nomination overwrite
- [L3] MAX_MERCHANTS = 10,000 cap
- [L4] `batchApproveMerchants()` + `batchRevokeMerchants()` added

⚠️ **MAINNET DEPLOY:** Uncomment `require(_admin.code.length > 0)` in MerchantRegistry constructor before mainnet. Deploy Safe multisig first, pass Safe address as `_admin`.

---

## 8. Audit Outreach Status (Jun 7)

| Firm | Contact | Status |
|---|---|---|
| Cyfrin | will@cyfrin.io | ✅ Proposal received: $12K, 3 days, August. Awaiting funds to confirm. Replied "what did you have in mind?" — awaiting Will's response. |
| Hashlock | fletcher@hashlock.com.au | ✅ Call done May 30. $5-10K range. Deck sent. Deferred payment declined. |
| Hacken | prusela.andrade@hacken.io | 🔄 João no-show — Prusela Andrade covering — email sent Jun 5 |
| Guardian | audits@guardianaudits.com | 🔄 Awaiting reply |

**Decision:** Will not commit to Cyfrin until funds secured. Proposal is live and available.

---

## 9. Investment & Fundraising Status (Jun 7)

**Raising:** €150,000 pre-seed · 10-15% equity
**Use of funds:** 40% audit · 35% business co-founder · 15% legal · 10% operations

| Channel | Status |
|---|---|
| Mission Fund (Startup Portugal) | ✅ Form submitted with deck |
| OpenVC | ✅ Profile live · Deck uploaded · Outreach email set · 1 submission left |
| RR² Capital (investments@rr2.capital) | ✅ Email sent with deck |
| Nuno Correia / SumCap | ✅ LinkedIn connection request sent |
| Colin Armstrong / Paragraph | ✅ Email sent Jun 2 — colin@armstr.ng |
| Subvisual intro call | ✅ Booked June 9th 13:30 |
| João Andrade / Hacken Portugal | ✅ Replied Jun 2 — personal contact established |
| Cyfrin (Will) — VC intro asked | 🔄 Pending |
| Hashlock (Fletcher) — VC intro asked | 🔄 Pending |
| Jesse Pollak (@jessepollak) | ✅ Two X replies posted |
| Cuatrecasas Acelera (11th edition) | ✅ Application submitted Jun 7 — deadline June 26 |
| JoynIgnite | ⬜ Post-July — after PME Certification (FinTech focus, max €375K) |
| Shilling Capital Partners II | ⬜ Post-July — rjacinto@shillingcapital.com |
| BrainCapital | ⬜ Post-July — tiago.morais.santos@braintrust.pt |

**Pitch deck:** `AuthOnce-PitchDeck-v2-2026.pptx` — 12 slides including GTM + Competition
**Business Plan:** `AuthOnce_BusinessPlan_2026_Updated.pdf` — updated Jun 7 ✅
**Investor Q&A:** `AuthOnce-InvestorQA-2026.docx` — 30 Q&A for founder preparation (not to share)

---

## 10. Regulatory & Legal Status (Jun 7)

| Item | Status |
|---|---|
| Banco de Portugal FinTech enquiry | ✅ Submitted — ref 2026/49323/000419 |
| IAPMEI consultation | ✅ Response received — referred to Banco de Portugal |
| Fio Legal — Patent Box | 🔄 Offer €1,200+VAT pending decision |
| Fio Legal — MiCA | ❌ Out of scope at current budget |
| Portugal FinLab | ❌ Edition 7 closed — next edition late 2026 |
| Company incorporation | ⬜ July 2026 — Empresa Online ~€180 |
| Cuatrecasas Acelera | ✅ Application submitted Jun 7 |
| PME Certification | ⬜ Post-incorporation — free, 2-4 weeks, required for Business Angels funds |

**Post-incorporation sequence:**
1. Incorporate July 2026 (~€180)
2. Apply PME Certification (free, 2-4 weeks)
3. Approach JoynIgnite, Shilling, BrainCapital
4. Flag to Fio Legal: BSL 1.1 must be assigned to Lda, supports commercial licensing

---

## 11. Social & Community (Jun 7)

| Channel | Status |
|---|---|
| authonce.io | ✅ Live — Landing page v3 deployed |
| @VascoAlgoTrader on X | ✅ Handle change to @VascoBuilds pending X approval. Bio updated Jun 7. Birthday set to private. |
| @AuthOnce on X | ✅ Pinned post live. X bot running Mon/Wed/Fri 12:00 UTC. |
| @authonce on Warpcast (FID: 3324301) | ✅ Farcaster bot posting daily 12:00 UTC — 21 posts, 3-week rotation |
| LinkedIn company page | ✅ Created May 30 — linkedin.com/company/authonce |
| builders.to | ⬜ Register after mainnet — do-follow backlinks + build-in-public audience |

---

## 12. Merchant Pricing Tiers

| Tier | Price | Protocol fee | Features |
|---|---|---|---|
| Starter | Free | 0.5% on-chain | Full protocol, all tokens, webhooks, basic notifications |
| Growth | €49/month | 0.5% on-chain | + Branded emails (merchant name/color), lower Stripe app fee |
| Business | €199/month | 0.5% on-chain | + Custom sender domain (noreply@merchant.com), advanced analytics |
| Enterprise | Custom | 0.5% on-chain | + Custom integrations, SLA, white-label |

20 Growth merchants = €980/month guaranteed before a single transaction.

---

## 13. Pre-Mainnet Checklist (Code)
- [x] Stripe Checkout Phase A — manual USDC bridge ✅ May 24
- [ ] Stripe Checkout Phase B — automate USDC transfer (post-audit)
- [x] SEPA bank transfer — mandate options + dispute handlers ✅ Jun 7
- [x] MB Way Stripe identifier fixed (card → mb_way) ✅ Jun 7
- [x] Geofencing — HTTP 451 OFAC ✅
- [x] Subscriber portal ✅
- [x] 3-day pre-payment notification ✅
- [x] Price change 30-day notification ✅
- [x] Whitelabel notifications (Growth+) + custom domain (Business+) ✅
- [x] Admin dashboard v2 — 10 tabs ✅ May 24
- [x] Tax exports — XLSX with accountant guide tab ✅ May 24
- [x] Multi-currency pricing — 15 currencies ✅ May 24
- [x] Stablecoin restriction — WETH/cbBTC blocked ✅
- [x] Subscriber import DB schema ✅
- [ ] Subscriber import UI — CSV upload (post-mainnet ready)
- [x] MRR + GTV charts — AdminDashboard + MerchantDashboard Analytics ✅ Jun 4-5
- [x] ARPU, LTV, churn rate, new vs churned — MerchantDashboard Analytics ✅ Jun 5
- [x] Separate keeper/notifier/x-bot Railway services ✅ Jun 7
- [x] New deployer + keeper wallets ✅ May 30
- [x] DEPLOYER_PRIVATE_KEY corrected in Railway ✅ Jun 7
- [x] STRIPE_SECRET_KEY confirmed sk_live_ ✅ Jun 7
- [x] Cloudflare Access on /admin ✅ May 24
- [x] Rate limiting on admin login ✅ May 24
- [x] Basescan API key ✅ Etherscan V2
- [x] Update local .env RESEND_API_KEY ✅
- [ ] Smart contract audit — Cyfrin $12K proposal on table, awaiting funds
- [x] PostgreSQL session store — MemoryStore warning fixed ✅ May 31
- [x] Merchant webhook route POST /api/merchants/:address/webhook added ✅ May 31
- [x] Keeper resumeSubscription removed — keeper only calls executePull + expireSubscription ✅ May 31
- [x] Bot state PostgreSQL-backed — survives Railway restarts ✅ May 31
- [ ] Pay link dark/light mode toggle (post-mainnet)
- [x] Stripe application_fee_amount 0.5% wired ✅ Jun 3
- [x] Multi-token product creation fixed ✅ Jun 3
- [x] Railway PORT fix — API on port 8080 ✅ Jun 3
- [x] Keeper DB-driven subscription scan + on-chain fallback ✅ Jun 5
- [x] Keeper cycle timer + heartbeat to DB (system_health table) ✅ Jun 5
- [x] /api/status public endpoint ✅ Jun 5
- [x] Status.jsx — public status page at authonce.io/status ✅ Jun 5
- [x] AdminDashboard System ⚙ tab ✅ Jun 5
- [x] DM Sans self-hosted — Google Fonts removed ✅ Jun 5
- [x] Cloudflare Bot Fight Mode + AI crawler blocking ✅ Jun 5
- [x] security@authonce.io Zoho group + security.txt ✅ Jun 5
- [x] Netlify fully decommissioned — Git unlinked, domains removed ✅ Jun 7
- [x] Google OAuth app publishing ✅
- [x] Cloudflare Pages SPA routing ✅
- [x] Legal pages live ✅
- [x] v6 contracts — all ChainShield audit fixes applied ✅ May 31
- [x] v6 contracts redeployed + verified Base Sepolia ✅ May 31
- [x] Safe multisig confirmed on Base Mainnet ✅ May 30
- [x] Landing page v3 deployed ✅ May 30
- [x] End-to-end Sepolia subscriber flow test ✅ May 31 — all 10 flows passed
- [x] GDPR delete endpoint + auto on-chain cancellation ✅ Jun 7
- [x] GDPR pending on-chain dashboard ✅ Jun 7
- [x] Keeper/Safe/Deployer/Treasury wallet balance monitoring ✅ Jun 7
- [x] ETH balance email alerts — 24h cooldown ✅ Jun 7
- [x] Merchant VAT number + country + billing address ✅ Jun 7
- [ ] Keeper + Safe ETH top-up on Base Mainnet (both at 0 — do before September)
- [ ] MerchantRegistry H1 guard — uncomment before mainnet deploy
- [ ] Stripe webhook events: charge.dispute.created + charge.dispute.closed registered ✅ Jun 7

---

## 14. Go-To-Market

**Phase 1 (Months 1-6) — Crypto-native merchants**
- Pay link live — authonce.io/pay/yourname — share anywhere, no code
- Full merchant dashboard live — products, webhooks, exports, 15 currencies
- Founding merchant offer: 0% fees for 3 months
- Channels: Base Discord, Farcaster, X/crypto Twitter
- Target: 10 founding merchants

**Phase 2 (Months 6-18) — B2B2C partnerships**
- Integration partnerships: Dune Analytics, Nansen, Messari
- Stripe fiat onramp — subscribers pay by card, merchant receives stablecoins
- Coinbase Base ecosystem grants and co-marketing
- Target: 100+ merchants

**Phase 3 (Months 18+) — Fiat merchants + AI agents**
- Embeddable widget and REST API for any platform
- Zapier integration — connect AuthOnce to 6,000+ apps
- AI agent marketplaces — ERC-1271 native integration
- Target: 1,000+ merchants

---

## 15. Infrastructure Reference

**Frontend hosting:** Cloudflare Pages
  Project: authonce · Build: `npm run build` · Dist: `dist` · Root: `frontend`
  Domain: authonce.io (Cloudflare DNS, auto-updated on push)
  Env vars: VITE_ALCHEMY_KEY, VITE_API_URL, VITE_NETWORK, VITE_STRIPE_PUBLISHABLE_KEY

**Railway API port:** 8080 (Railway injects PORT=8080 · Public networking configured to port 8080 · Do not change)

**Admin security:** Cloudflare Zero Trust → Access → Applications → AuthOnce Admin
  Domain: authonce.io/admin · Policy: Emails → vasco@authonce.io · Session: 24h
  Team: frosty-lake-d608.cloudflareaccess.com

**Railway project:** supportive-prosperity (Hobby $5/month)
  Services (Jun 7 — fully separated):
  - the-opportunity → `node scripts/api.js` (public port 8080)
  - authonce-keeper → `node scripts/keeper.js` (no public port)
  - authonce-notifier → `node scripts/notifier.js` (no public port)
  - authonce-x-bot → `node scripts/x-bot.js` (no public port)
  - farcaster-bot → separate service (existing)
  - monitor → separate service (existing)
  - postgres → database

  Build command for all services: `echo "build done"` (prevents Nixpacks build-time script execution)
  nixpacks.toml in repo root: `[phases.build] cmds = []`

  Key env vars: VAULT_ADDRESS, KEEPER_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY, DATABASE_URL,
                RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
                GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, ENCRYPTION_KEY,
                PROTOCOL_TREASURY_ADDRESS, BASE_SEPOLIA_RPC_URL, BASESCAN_API_KEY,
                ADMIN_EMAIL, ADMIN_PASSWORD, NOTIFY_EMAIL, NETWORK

**Farcaster Bot:**
  Service: farcaster-bot on Railway
  Account: @authonce on Warpcast (FID: 3324301)
  Posts: Daily 12:00 UTC — 21 posts, 3-week rotation. PostgreSQL state (survives restarts).

**Hardhat networks:**
  - `base-sepolia` — chainId 84532
  - `base-mainnet` — chainId 8453

**Deploy command:** `npx hardhat run scripts/deploy.js --network base-sepolia`
**Verify command:** `npx hardhat verify --network base-sepolia <address> <constructor args>`

---

## 16. Next Session Priorities

1. **Subvisual call** — June 9th 13:30 — call structure ready in PT + EN
2. **Subvisual follow-up email** — draft and send within 2 hours after the call
3. **Prusela @ Hacken** — follow up if no reply by Mon Jun 8
4. **Will @ Cyfrin** — awaiting reply on "what did you have in mind"
5. **Keeper + Safe ETH top-up** — both wallets at 0 ETH on Base Mainnet — send 0.05 ETH each via bridge.base.org
6. **@VascoBuilds handle** — check if X approved the change
7. **Base Ecosystem Fund** — follow up late June (no reply since May 14)
8. **Coinbase Onramp case 01559408** — parked, follow up January 2027

**Audit outreach status:**
- Cyfrin: replied "what did you have in mind?" — awaiting Will's response
- Hacken: João no-show — Prusela Andrade covering — email sent Jun 5
- Hashlock: deferred payment declined — $5-10K proposal on table
- Guardian: awaiting reply

**Stripe webhook events registered (13 total — Jun 7):**
checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed,
invoice.paid, invoice.payment_failed, customer.subscription.deleted/created/updated/paused/resumed,
charge.refunded, charge.dispute.created, charge.dispute.closed

**Session file protocol:** Upload CLAUDE-CORE.md every session. Upload specific files being touched (max 2-3). Never upload CLAUDE-REFERENCE.md unless specifically needed.

**CLAUDE-REFERENCE.md** contains: decisions log, fee analysis, competitive landscape, legal notes,
marketing strategy, DataOnce, social media. Upload only when needed.

*Last updated: 2026-06-07*
