# AuthOnce Protocol — Testnet Milestone Report
## End-to-End Proof of Concept: Base Sepolia

**Date:** 25 April 2026  
**Author:** Vasco Humberto dos Reis Diogo  
**Status:** ✅ COMPLETE — Core protocol proven on Base Sepolia testnet

---

## 1. Summary

On 25 April 2026, the AuthOnce protocol successfully executed its first complete end-to-end subscription payment on Base Sepolia testnet. A user vault (Safe Smart Account) authorised a recurring USDC pull, and the keeper bot automatically executed the payment — splitting 99.5% to the merchant and 0.5% to the protocol treasury — entirely on-chain, non-custodially.

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

---

## 3. Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| SubscriptionVault | `0xA3358266106fd5b610C24AB4E01e5Bf25C36dA7c` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

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
| SubscriptionVault deployed | `0x8f57eb47d13998dfa59004b4297cfcdb0ed23bbb04fad68a1478248c1c5a1517` | ✅ |
| Merchant approved | (via setup.js) | ✅ |
| Subscription created | (via setup.js) | ✅ |
| Module enabled on Safe | `0x6009d33ccd86d90e85ca65259cc469bda7e39cbe7ee144c17a646f3f6fbd9447` | ✅ |
| **First payment pulled** | **`0x5c89c5301a32e18470f34d34b1f4e496537b2c7317058caf48f9a55df7c35f93`** | ✅ |

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
        └── SubscriptionVault Module: 0xA3358266...
              ├── executePull() called by Keeper Bot
              ├── 0.995 USDC → Merchant
              └── 0.005 USDC → Protocol Treasury
```

---

## 8. Known Testnet Differences vs. Mainnet

| Item | Testnet | Mainnet |
|---|---|---|
| USDC address | `0x036CbD53...` | `0x833589fC...` |
| Keeper | Deployer EOA | Gelato Network |
| Auth | MetaMask | Privy (Google/Email) |
| Onramp | Faucet | Stripe Crypto Checkout |
| Admin | Single EOA | Safe multisig |

---

## 9. Next Steps

- [ ] Smart contract audit ($15–20K budget)
- [ ] Deploy to Base Mainnet with correct USDC address
- [ ] Integrate Gelato as production keeper
- [ ] Integrate Privy for social login
- [ ] Integrate Stripe Crypto Checkout for fiat onramp
- [ ] Set up Safe multisig for admin functions
- [ ] Front-end subscriber and merchant dashboards

---

*This document serves as proof of technical feasibility for grant applications, investor due diligence, and audit baseline.*
