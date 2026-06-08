# AuthOnce Protocol

![Base Network](https://img.shields.io/badge/Base-Network-0052FF?style=flat&logo=coinbase&logoColor=white)
![License](https://img.shields.io/badge/License-BUSL--1.1-orange?style=flat)
![Mainnet](https://img.shields.io/badge/Mainnet-Q3%202026-34d399?style=flat)
![Testnet](https://img.shields.io/badge/Testnet-Live%20on%20Base%20Sepolia-blue?style=flat)

**Non-custodial recurring payments on Base. Authorize once. Pay forever.**

AuthOnce is an on-chain subscription protocol built on Base Network. Merchants create subscription products. Subscribers authorize once using an **EIP-2612 gasless permit signature** and are billed automatically — in USDC, USDT, DAI, or EURC — without ever giving up custody of their funds.

---

## How it works

1. **Merchant** registers and creates a subscription product with a price, interval, and accepted token.
2. **Subscriber** signs a single EIP-2612 permit off-chain — no gas required, no on-chain approval transaction.
3. **Keeper bot** executes pulls automatically on each billing date using the stored permit.
4. **Protocol** collects 0.5% atomically on every payment. Merchant receives the rest instantly.

No funds are ever held by the protocol. The subscriber's wallet is never drained beyond the exact subscription amount per cycle.

---

## Key features

- **EIP-2612 gasless authorization** — Subscribers sign once off-chain. No approval transaction, no gas cost at signup.
- **Multi-token** — USDC, USDT, DAI, EURC. Admin-controlled whitelist.
- **EIP-712 + ERC-1271** — Standard wallet-native authorization. Compatible with MetaMask, Ledger, Coinbase Wallet, Gnosis Safe, and AI agent wallets.
- **Programmable grace period** — 1–30 day configurable dunning window. Keeper retries daily before expiring.
- **Intro pricing** — Up to 12 pulls at a reduced introductory rate before switching to full price.
- **Free trials** — Up to 90-day trial periods before first payment.
- **30-day price change notice** — Enforced on-chain. Merchants cannot change prices without minimum notice.
- **Non-custodial** — Protocol never holds funds. No VASP/CASP licence required.
- **AI agent payments** — Smart contract wallets authorize pulls via EIP-712 structured signatures with per-pull deadlines.
- **DataOnce ready** — `dataVaultId` field on every subscription for Phase 2 encrypted data vaults.

---

## Architecture

```
SubscriptionVault.sol     — Core protocol. Subscriptions, pulls, grace periods.
MerchantRegistry.sol      — Merchant whitelist. Invite-only with self-serve toggle.
scripts/keeper.js         — Keeper bot. Polls due subscriptions, executes pulls.
scripts/notifier.js       — Event listener. Sends webhooks and emails on all events.
scripts/api.js            — REST API. Merchant dashboard, Google OAuth, Stripe Connect.
scripts/db.js             — PostgreSQL schema and queries.
scripts/webhook.js        — HMAC-SHA256 webhook dispatcher with exponential backoff.
frontend/                 — React + Vite merchant and subscriber portal.
```

---

## Smart contracts

### Base Sepolia (testnet — live)

| Contract | Address |
|---|---|
| SubscriptionVault | `0x2ED847da7f88231Ac6907196868adF4840A97f49` |
| MerchantRegistry | `0xE62aF1DcADeF946ecC08978dec565344A63B8f9b` |
| USDC (test) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

### Base Mainnet

| Contract | Address |
|---|---|
| SubscriptionVault | `[deploy pending — Q3 2026]` |
| MerchantRegistry | `[deploy pending — Q3 2026]` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Protocol Treasury | `0x737D4EeAEF67f776724482a29367615703A2DEB1` |

---

## Protocol rules (locked)

- Vault funded at exactly **1× subscription amount** per billing cycle — no over-funding, no balance, no refund UX.
- **Keeper bot** is the only caller of `executePull()` and `expireSubscription()`.
- **Protocol fee: 0.5%** — global constant, same for all merchants and tokens. Hard ceiling 2%, never raiseable above it.
- **Payment token at signup = all future pulls** — token is immutable per subscription.
- **Cancellation**: subscriber or guardian only — merchant cannot block or delay.
- **Price changes**: `setProductExpiry()` enforces 30-day minimum notice on-chain.
- **Grace period**: default 7 days, configurable 1–30 days per subscription.

---

## EIP-2612 permit authorization (EOA subscribers)

EOA subscribers (MetaMask, Ledger, Coinbase Wallet) authorize via EIP-2612 permit — a gasless off-chain signature that grants the vault a one-time pull allowance per billing cycle. No on-chain approval transaction required at signup.

The permit is signed once and stored. The keeper bot presents it on each billing date. If the permit is expired or revoked, the pull fails gracefully and the grace period begins.

## EIP-712 pull authorization (smart wallet subscribers)

Contract wallet subscribers (AI agents, Gnosis Safe, smart wallets) authorize pulls via EIP-712 structured signatures.

**Domain:**
```
name:              "AuthOnce"
version:           "5"
chainId:           <runtime>
verifyingContract: <SubscriptionVault address>
```

**PullAuthorisation type:**
```
PullAuthorisation(
  uint256 subscriptionId,
  address token,
  uint256 amount,
  uint256 pullCount,
  uint256 deadline
)
```

`pullCount` acts as a nonce — each pull has a unique hash. `deadline` enforces a tight 24-hour TTL per pull signature.

---

## Merchant tiers

**On-chain protocol fee: 0.5% on every payment. Same for all merchants, all tokens.**

Merchant tiers determine platform features and Stripe application fee — not the on-chain fee.

| Tier | Price | What you get |
|---|---|---|
| Starter | Free | Full protocol access, all tokens, webhooks, basic notifications |
| Growth | €49/month | Branded subscriber emails, priority support, lower Stripe fee |
| Business | €199/month | Advanced analytics, dedicated support, lowest Stripe fee |
| Enterprise | Custom | Custom integrations, SLA, white-label options |

Tier enforcement is off-chain (API + Stripe Connect). The contract is tier-agnostic.

---

## Tech stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity 0.8.24, Hardhat, Base Network |
| Keeper + Notifier | Node.js, Railway |
| Backend API | Express.js, PostgreSQL, Railway |
| Frontend | React, Vite, Cloudflare Pages |
| Subscriber auth | Google OAuth via Passport.js |
| Merchant auth | MetaMask / RainbowKit + JWT |
| Fiat onramp | Stripe Checkout (card, MB Way, Multibanco, SEPA) |
| Merchant payouts | Stripe Connect |
| Notifications | Resend + HMAC-signed webhooks |
| DNS + CDN | Cloudflare |

---

## Local development

### Prerequisites

- Node.js 18+
- PostgreSQL
- A funded Base Sepolia wallet

### Setup

```bash
git clone https://github.com/Vascodiogo/the-opportunity
cd the-opportunity
npm install
cp .env.example .env
# Fill in .env values
```

### Environment variables

```
DEPLOYER_PRIVATE_KEY=      # Deployer wallet private key (deploy only)
KEEPER_PRIVATE_KEY=        # Keeper bot wallet private key
VAULT_ADDRESS=             # SubscriptionVault contract address
BASE_SEPOLIA_RPC_URL=      # Base Sepolia RPC endpoint
DATABASE_URL=              # PostgreSQL connection string
RESEND_API_KEY=            # Resend email API key
STRIPE_SECRET_KEY=         # Stripe secret key
STRIPE_WEBHOOK_SECRET=     # Stripe webhook signing secret
STRIPE_CONNECT_CLIENT_ID=  # Stripe Connect client ID
GOOGLE_CLIENT_ID=          # Google OAuth client ID
GOOGLE_CLIENT_SECRET=      # Google OAuth client secret
JWT_SECRET=                # Admin JWT secret
ENCRYPTION_KEY=            # AES-256 encryption key for subscriber wallets
PROTOCOL_TREASURY_ADDRESS= # Safe multisig treasury address
```

### Deploy contracts

```bash
# Base Sepolia
npx hardhat run scripts/deploy.js --network base-sepolia

# Base Mainnet
npx hardhat run scripts/deploy.js --network base-mainnet
```

### Run locally

```bash
node scripts/api.js       # Backend API
node scripts/keeper.js    # Keeper bot
node scripts/notifier.js  # Notification backend
cd frontend && npm run dev # Frontend
```

---

## Webhook events

AuthOnce sends HMAC-SHA256 signed webhooks to registered merchant endpoints on all subscription lifecycle events.

| Event | Trigger |
|---|---|
| `subscription.created` | New subscription authorized |
| `payment.success` | Pull executed successfully |
| `payment.failed` | Insufficient funds or allowance |
| `payment.upcoming` | 3 days before next payment |
| `subscription.paused` | Subscription entered grace period |
| `subscription.resumed` | Subscription resumed after grace |
| `subscription.cancelled` | Subscriber cancelled |
| `subscription.expired` | Grace period ended, no recovery |
| `subscription.expiring` | Price change notice (30 days) |

---

## License

Business Source License 1.1 (BUSL-1.1)

© 2026 Vasco Humberto dos Reis Diogo. All Rights Reserved.

Production use requires a commercial licence. Contact: vasco@authonce.io

---

## Links

- Website: [authonce.io](https://authonce.io)
- App: [app.authonce.io](https://authonce.io)
- X: [@AuthOnce](https://x.com/AuthOnce)
- X: [@VascoBuilds](https://x.com/VascoBuilds)
- Farcaster: [@authonce](https://warpcast.com/authonce)
- Contact: vasco@authonce.io
