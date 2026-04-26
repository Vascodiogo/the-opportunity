# AuthOnce Protocol — Testnet Milestone Report
## End-to-End Proof of Concept: Base Sepolia

**Date:** 25 April 2026 (updated 26 April 2026)
**Author:** Vasco Humberto dos Reis Diogo  
**Status:** ✅ COMPLETE — Core protocol proven on Base Sepolia testnet

---

## 1. Summary

On 25 April 2026, the AuthOnce protocol successfully executed its first complete end-to-end subscription payment on Base Sepolia testnet. A user vault (Safe Smart Account) authorised a recurring USDC pull, and the keeper bot automatically executed the payment — splitting 99.5% to the merchant and 0.5% to the protocol treasury — entirely on-chain, non-custodially.

On 26 April 2026, the contracts were upgraded to v1.0.0 with BUSL-1.1 licensing, on-chain watermarking, and deployment tracking — and redeployed to Base Sepolia.

---

## 2. What Was Proven

| Capability | Result |
|---|---|
| Safe Smart Account acts as subscriber vault | ✅ Proven |
| SubscriptionVault enabled as Safe module | ✅ Proven |
| Keeper bot detects due subscriptions | ✅ Proven |
| `executePull()` moves USDC via `execTransactionFromModule()` | ✅ Proven |
| 99.5% merchant / 0.5% protocol fee split | ✅ Proven |
| All state changes emitted as on-chain events | ✅ Proven |
| Non-custodial: protocol never holds user funds | ✅ Proven |
| BUSL-1.1 license + on-chain watermark | ✅ Added v1.0.0 |
| Deployment tracking via `ProtocolDeployed` event | ✅ Added v1.0.0 |
| Copy detection monitor (`monitor.js`) | ✅ Added v1.0.0 |

---

## 3. Deployed Contracts (Base Sepolia — v1.0.0 BUSL-1.1)

| Contract | Address | Version |
|---|---|---|
| SubscriptionVault | `0x6188D6Bdb9D4DF130914A35aFA2bE66a59Ba25EA` | v1.0.0 ✅ verified |
| MerchantRegistry | `0x1fA825065260a4e775AbD8D2596B1869904e446A` | v1.0.0 ✅ verified |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | — |

**Previous addresses (retired):**
- SubscriptionVault v0: `0xA3358266106fd5b610C24AB4E01e5Bf25C36dA7c`
- MerchantRegistry v0: `0xE62aF1DcADeF946ecC08978dec565344A63B8f9b`

---

## 4. Test Wallet Addresses

| Role | Address |
|---|---|
| Deployer / Admin / Keeper | `0x44444D60136Cf62804963fA14d62a55c34a96f8F` |
| Subscriber Safe Vault | `0xB3d493F6bFF750719c10Cef10214B9d619891fCd` |
| Merchant (test) | `0x44444D60136Cf62804963fA14d62a55c34a96f8F` |
| Protocol Treasury (test) | `0x44444D60136Cf62804963fA14d62a55c34a96f8F` |

---

## 5. Transaction Log

| Step | Transaction Hash | Status |
|---|---|---|
| Safe vault deployed | `0x4fe4cab9998f95296ba999222aa9b751f12ed14bdc44c5dfef45485bd35b023d` | ✅ |
| 1 USDC funded to Safe | `0x84ec4ecf992071fc50d9fa980654c415c5daa8e445429d41e54506cf2bf04097` | ✅ |
| SubscriptionVault v0 deployed | `0x8f57eb47d13998dfa59004b4297cfcdb0ed23bbb04fad68a1478248c1c5a1517` | ✅ |
| Merchant approved | (via setup.js) | ✅ |
| Subscription created | (via setup.js) | ✅ |
| Module enabled on Safe | `0x6009d33ccd86d90e85ca65259cc469bda7e39cbe7ee144c17a646f3f6fbd9447` | ✅ |
| **First payment pulled** | **`0x5c89c5301a32e18470f34d34b1f4e496537b2c7317058caf48f9a55df7c35f93`** | ✅ |
| v1.0.0 MerchantRegistry deployed | `0x4adddc8225a40f43d8bbf494fe8940d5f7b3630c6549378540bcecdcc50177a3` | ✅ |
| v1.0.0 SubscriptionVault deployed | `0xead1ceb762ce4d9c27d4fbf9d827556c47191e20d75225265f5a932c6985687b` | ✅ |

---

## 6. First Payment — On-Chain Proof

**Transaction:** `0x5c89c5301a32e18470f34d34b1f4e496537b2c7317058caf48f9a55df7c35f93`  
**Block:** 40672988  
**Timestamp:** 25 April 2026, 10:51:04 UTC  
**Basescan:** https://sepolia.basescan.org/tx/0x5c89c5301a32e18470f34d34b1f4e496537b2c7317058caf48f9a55df7c35f93

| Transfer | Amount | From | To |
|---|---|---|---|
| Merchant payment | 0.995 USDC | Safe Vault | Merchant |
| Protocol fee | 0.005 USDC | Safe Vault | Treasury |
| **Total pulled** | **1.000 USDC** | | |

Fee split: 99.5% merchant / 0.5% protocol — exactly as specified in CLAUDE.md §3.9.

---

## 7. Architecture Validated

```
Subscriber (Google login → Privy → Safe Smart Account)
  └── Safe Vault: 0xB3d493F6...
        └── SubscriptionVault Module: 0x6188D6Bd... (v1.0.0)
              ├── executePull() called by Keeper Bot
              ├── 0.995 USDC → Merchant
              └── 0.005 USDC → Protocol Treasury
```

---

## 8. IP Protection (Added v1.0.0 — 26 April 2026)

| Protection | Implementation |
|---|---|
| BUSL-1.1 License | Commercial use prohibited until 2030-01-01 |
| On-chain watermark | 5 constants baked into contract bytecode permanently |
| `ProtocolDeployed` event | Fires on every deployment — tracked by monitor.js |
| Copy detection | `monitor.js` watches Base Sepolia + Base Mainnet; alerts via email |

---

## 9. Known Testnet Differences vs. Mainnet

| Item | Testnet | Mainnet |
|---|---|---|
| USDC address | `0x036CbD53...` | `0x833589fC...` |
| Keeper | Deployer EOA | Gelato Network |
| Auth | MetaMask | Privy (Google/Email) |
| Onramp | Faucet | Stripe Crypto Checkout |
| Admin | Single EOA | Safe multisig + Ledger |

---

## 10. Next Steps

- [ ] Order Ledger Nano S Plus from ledger.com
- [ ] Set up Safe multisig for admin role
- [ ] Add monitor.js as third Railway service
- [ ] Make GitHub repo public
- [ ] Connect Netlify for auto-deploy
- [ ] Smart contract audit ($15–20K budget)
- [ ] Deploy to Base Mainnet with Ledger addresses
- [ ] Integrate Gelato as production keeper
- [ ] Integrate Privy for social login
- [ ] Integrate Stripe Crypto Checkout for fiat onramp

---

*This document serves as proof of technical feasibility for grant applications, investor due diligence, and audit baseline.*  
*authonce.io | vasco@authonce.io*
