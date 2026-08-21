// scripts/create-test-subscriptions.js
// AuthOnce — Test Subscription Generator (volume/load test)
//
// Creates a batch of real subscriptions on Base Sepolia, spread across 3
// subscriber wallets, alternating USDC/EURC, all against one already-approved
// test merchant. Built for the 100-transaction keeper/notifier load test
// (see CLAUDE-CORE.md §39/§40).
//
// IMPORTANT — read before running:
//   - Each subscription can only be pulled ONCE in a same-day test run.
//     isDue() only returns true immediately after creation (lastPulledAt==0)
//     or after a full billing interval (shortest = 7 days) has elapsed —
//     confirmed directly from SubscriptionVault.sol. So the subscription
//     COUNT below is what drives the keeper's real pull count later, not
//     repeated pulls from fewer subscriptions.
//   - Only the FIRST subscription per wallet+token needs a signed permit.
//     Per SV-13, permit() sets a STANDING MAX allowance (not per-cycle), so
//     once that's set, every later subscription for that same wallet+token
//     just calls plain createSubscription() — cheaper, no signature needed.
//     The script checks on-chain allowance first and picks the right path
//     automatically; you don't need to track this by hand.
//   - Run with a SMALL count first (see TOTAL_SUBSCRIPTIONS below) to confirm
//     the whole flow works end-to-end before committing to the full 100 —
//     same evidence-first approach as everything else in this project.
//
// Setup:
//   npm install ethers dotenv
//
// .env (same file as fund-test-wallet-multi.js, add these):
//   BASE_SEPOLIA_RPC_URL=... (optional — defaults to public RPC)
//   SUBSCRIBER_1_KEY=0x...
//   SUBSCRIBER_2_KEY=0x...
//   SUBSCRIBER_3_KEY=0x...
//
// Run:
//   node create-test-subscriptions.js

// .env lives at the project root (C:\The-Opportunity\.env), one level up
// from this scripts/ folder — same file keeper.js/notifier.js presumably
// share. Pointing at it explicitly via __dirname means this works no matter
// which directory you actually run `node` from.
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const { ethers } = require("ethers");

// ─── Config ───────────────────────────────────────────────────────────────
const RPC_URL = (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org").trim();

const VAULT_ADDRESS    = "0xDd41E5C83d000ff63d3e9E8cBBD79609b7029d3C"; // SubscriptionVault v9
const MERCHANT_ADDRESS = "0xF6CcD9524964B9433773f77C270F724339B9B9E5"; // "merch test", confirmed approved on-chain

// Confirmed against Circle's official contract list — do NOT reuse Ethereum
// Sepolia addresses here, they are different deployments on a different chain.
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
const EURC_ADDRESS = "0x808456652fdb597867f38412077A9182bf77359F"; // Base Sepolia EURC

const SUBSCRIBERS = [
  { name: "Subscriber 1", address: "0xBE6a5cFFd807e85602E2434e6EAa9BDb866E9e35", key: process.env.SUBSCRIBER_1_KEY },
  { name: "Subscriber 2", address: "0xA7C03E93545dF9Df3e006E13E4aF993C208Dc1aB", key: process.env.SUBSCRIBER_2_KEY },
  { name: "Subscriber 3", address: "0x35B5a617a91C0ABC400D6e704A259Add551BdD07", key: process.env.SUBSCRIBER_3_KEY },
];

// START SMALL. Confirm this works end-to-end with e.g. 3-6 before raising
// to 100. Nothing here stops you from running the script again later to top
// up toward 100 once the first pass is verified on Basescan.
const TOTAL_SUBSCRIPTIONS = 6;

const AMOUNT_PER_SUB = "0.50"; // per subscription, in the token's own units (not wei)
                                 // 100 subs @ $0.50, split ~50/50 USDC/EURC across 3
                                 // wallets = ~$8-9 per wallet per token — comfortably
                                 // under the 20/day/wallet/token faucet cap.

const INTERVAL_WEEKLY = 0; // enum Interval { Weekly, Monthly, Yearly } — confirmed in contract.
                            // Doesn't matter which we pick: we're only ever doing the
                            // first pull in this test, never a repeat pull.
const GRACE_PERIOD_DAYS = 7; // DEFAULT_GRACE_DAYS in the contract
const DELAY_MS = 1500;       // pause between transactions, avoid RPC rate limiting

// ─── ABIs (minimal — only what this script needs) ────────────────────────
const VAULT_ABI = [
  "function approvedTokens(address) view returns (bool)",
  "function createSubscription(address merchant, address safeVault, address token, uint256 amount, uint256 introAmount, uint256 introPulls, uint8 interval, address guardian, uint256 trialDays, uint256 gracePeriodDays_, bytes32 dataVaultId_) returns (uint256 id)",
  "function createSubscriptionWithPermit(address merchant, address safeVault, address token, uint256 amount, uint256 introAmount, uint256 introPulls, uint8 interval, address guardian, uint256 trialDays, uint256 gracePeriodDays_, bytes32 dataVaultId_, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) returns (uint256 id)",
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address token, uint256 amount)",
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── EIP-712 domain resolution ────────────────────────────────────────────
// Tries EIP-5267 eip712Domain() first (self-describing, most reliable). Falls
// back to name() + version "2" — the convention used by Circle's Fiat Token
// contracts (USDC/EURC), which is what these test tokens are. If a permit
// call fails with a signature error, this is the first place to check —
// it means the real on-chain domain doesn't match this assumption.
async function resolveEip712Domain(tokenContract, chainId, verifyingContract) {
  try {
    const d = await tokenContract.eip712Domain();
    return { name: d.name, version: d.version, chainId: Number(d.chainId), verifyingContract: d.verifyingContract };
  } catch {
    const name = await tokenContract.name();
    return { name, version: "2", chainId, verifyingContract }; // Circle Fiat Token convention
  }
}

async function signPermit(wallet, tokenContract, spender, value, chainId) {
  const owner = wallet.address;
  const domain = await resolveEip712Domain(tokenContract, chainId, await tokenContract.getAddress());
  const nonce = await tokenContract.nonces(owner);
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const message = { owner, spender, value, nonce, deadline };

  const sig = await wallet.signTypedData(domain, types, message);
  const { v, r, s } = ethers.Signature.from(sig);
  return { v, r, s, deadline };
}

// ─── Core: create N subscriptions for one wallet, alternating tokens ─────
async function createSubscriptionsForWallet(subInfo, provider, vaultReadOnly, plan, chainId) {
  if (!subInfo.key) {
    console.error(`[${subInfo.name}] No private key set (check .env) — skipping entirely.`);
    return { created: 0, failed: 0 };
  }

  const wallet = new ethers.Wallet(subInfo.key, provider);
  if (wallet.address.toLowerCase() !== subInfo.address.toLowerCase()) {
    console.error(`[${subInfo.name}] MISMATCH: private key resolves to ${wallet.address}, expected ${subInfo.address}. Skipping — wrong key in .env.`);
    return { created: 0, failed: 0 };
  }

  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
  let created = 0, failed = 0;

  for (const tokenAddress of ["USDC", "EURC"]) {
    const address = tokenAddress === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;
    const count = plan[tokenAddress];
    if (count === 0) continue;

    const token = new ethers.Contract(address, ERC20_ABI, wallet);
    const decimals = await token.decimals();
    const amount = ethers.parseUnits(AMOUNT_PER_SUB, decimals);
    const totalNeeded = amount * BigInt(count);

    // Fail fast with a clear message rather than a mid-run revert.
    const balance = await token.balanceOf(wallet.address);
    if (balance < totalNeeded) {
      console.error(
        `[${subInfo.name}] Insufficient ${tokenAddress}: have ${ethers.formatUnits(balance, decimals)}, ` +
        `need ${ethers.formatUnits(totalNeeded, decimals)} for ${count} subscription(s). Skipping ${tokenAddress} for this wallet.`
      );
      failed += count;
      continue;
    }

    for (let i = 0; i < count; i++) {
      try {
        const allowance = await token.allowance(wallet.address, VAULT_ADDRESS);
        let tx;

        if (allowance < amount) {
          // First subscription for this wallet+token — sign a max-allowance
          // permit and use the permit entry point.
          const { v, r, s, deadline } = await signPermit(wallet, token, VAULT_ADDRESS, ethers.MaxUint256, chainId);
          tx = await vault.createSubscriptionWithPermit(
            MERCHANT_ADDRESS, wallet.address, address, amount, 0, 0,
            INTERVAL_WEEKLY, ethers.ZeroAddress, 0, GRACE_PERIOD_DAYS, ethers.ZeroHash,
            deadline, v, r, s
          );
        } else {
          // Allowance already sufficient (set by a prior subscription this
          // run, or a prior run) — plain path, cheaper, no signature.
          tx = await vault.createSubscription(
            MERCHANT_ADDRESS, wallet.address, address, amount, 0, 0,
            INTERVAL_WEEKLY, ethers.ZeroAddress, 0, GRACE_PERIOD_DAYS, ethers.ZeroHash
          );
        }

        console.log(`[${subInfo.name}] ${tokenAddress} #${i + 1}/${count} — tx sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`[${subInfo.name}] ${tokenAddress} #${i + 1}/${count} — confirmed, block ${receipt.blockNumber} — https://sepolia.basescan.org/tx/${tx.hash}`);
        created++;
      } catch (err) {
        console.error(`[${subInfo.name}] ${tokenAddress} #${i + 1}/${count} — FAILED: ${err.message}`);
        failed++;
      }
      await sleep(DELAY_MS);
    }
  }

  return { created, failed };
}

// ─── Split TOTAL_SUBSCRIPTIONS across 3 wallets, ~50/50 USDC/EURC each ────
function buildPlan(total, walletCount) {
  const base = Math.floor(total / walletCount);
  const remainder = total % walletCount;
  const perWallet = Array.from({ length: walletCount }, (_, i) => base + (i < remainder ? 1 : 0));

  return perWallet.map((n) => {
    const usdc = Math.ceil(n / 2);
    const eurc = n - usdc;
    return { USDC: usdc, EURC: eurc };
  });
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== 84532) {
    console.error(`Refusing to run — connected chain id is ${chainId}, expected 84532 (Base Sepolia).`);
    process.exit(1);
  }

  const vaultReadOnly = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
  const usdcApproved = await vaultReadOnly.approvedTokens(USDC_ADDRESS);
  const eurcApproved = await vaultReadOnly.approvedTokens(EURC_ADDRESS);
  console.log(`USDC approved on vault: ${usdcApproved}`);
  console.log(`EURC approved on vault: ${eurcApproved}`);
  if (!usdcApproved || !eurcApproved) {
    console.error("One or both tokens are not marked approved on the vault — stopping before spending any gas. Check REGISTRY_ADDRESS/vault admin config.");
    process.exit(1);
  }

  const plan = buildPlan(TOTAL_SUBSCRIPTIONS, SUBSCRIBERS.length);
  console.log(`\nPlan: ${TOTAL_SUBSCRIPTIONS} total subscription(s) across ${SUBSCRIBERS.length} wallet(s):`);
  SUBSCRIBERS.forEach((s, i) => console.log(`  ${s.name}: ${plan[i].USDC} USDC + ${plan[i].EURC} EURC`));
  console.log("");

  // Wallets are independent (separate nonces) — safe to run concurrently.
  // Each wallet's own transactions are sequential internally (awaited).
  const results = await Promise.all(
    SUBSCRIBERS.map((s, i) => createSubscriptionsForWallet(s, provider, vaultReadOnly, plan[i], chainId))
  );

  const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
  const totalFailed  = results.reduce((sum, r) => sum + r.failed, 0);
  console.log(`\nDone. ${totalCreated} subscription(s) created, ${totalFailed} failed.`);
  console.log(`Verify on Basescan, then run the keeper manually / wait for its next cycle to confirm real pulls.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
