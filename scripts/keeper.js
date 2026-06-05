// scripts/keeper.js
// AuthOnce Keeper Bot — v6
//
// Changes from v5:
//   - ABI updated for SubscriptionVault v6:
//       subscriptions() now returns billingPausedUntil and isContractVault fields
//   - isDue() on-chain already accounts for billingPausedUntil (v6 contract).
//       Keeper reads it from struct for logging purposes only.
//   - processDueSubscriptions: logs billingPausedUntil state when subscription
//       is active but not due, to distinguish "interval not elapsed" from
//       "merchant billing pause active".
//   - expireGracePeriodSubscriptions: no change — still uses pausedAt field.
//   - ERC-1271 note: isContractVault is now stored in the struct. Keeper logs
//       vault type. Full ERC-1271 signature generation for contract wallets is
//       planned for v6.1 — EOA-only path is still used for all current subscribers.

require("dotenv").config();
const { ethers } = require("ethers");

if (!process.env.VAULT_ADDRESS) throw new Error("VAULT_ADDRESS not set in env");
const VAULT_ADDRESS   = process.env.VAULT_ADDRESS;
const RPC_URL         = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const KEEPER_PRIVKEY  = process.env.KEEPER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
const RUN_INTERVAL_MS = 60_000;

// ─── ABI — v6 ───────────────────────────────────────────────────────────────
// Key changes from v5:
//   - subscriptions() returns billingPausedUntil (new field, SV-02 fix)
//   - subscriptions() returns isContractVault (new field, SV-01 fix)
//   - isDue() updated in contract: also gates on billingPausedUntil
//   - nextPullDue() updated: returns later of interval due and billingPausedUntil
//   - SubscriptionCreated event has isContractVault field
//   - SafeVaultUpdated event has newIsContractVault field
//   - MerchantRegistry constructor takes (address, bool) — deploy.js updated

const VAULT_ABI = [
  {
    name: "subscriptions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "owner",              type: "address" },
      { name: "guardian",           type: "address" },
      { name: "merchant",           type: "address" },
      { name: "safeVault",          type: "address" },
      { name: "token",              type: "address" },
      { name: "amount",             type: "uint256" },
      { name: "introAmount",        type: "uint256" },
      { name: "introPulls",         type: "uint256" },
      { name: "pullCount",          type: "uint256" },
      { name: "interval",           type: "uint8"   },
      { name: "lastPulledAt",       type: "uint256" },
      { name: "billingPausedUntil", type: "uint256" }, // [SV-02] new field
      { name: "pausedAt",           type: "uint256" },
      { name: "expiresAt",          type: "uint256" },
      { name: "trialEndsAt",        type: "uint256" },
      { name: "gracePeriodDays",    type: "uint256" },
      { name: "dataVaultId",        type: "bytes32" },
      { name: "status",             type: "uint8"   },
      { name: "isContractVault",    type: "bool"    }, // [SV-01] new field
    ],
  },
  {
    name: "isDue",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "nextPullAmount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "vaultBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "vaultAllowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    // v6: EOA subscribers pass deadline=0 and signature="0x" (isContractVault=false)
    // Contract wallet subscribers pass EIP-712 deadline + signature bytes (isContractVault=true)
    name: "executePull",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id",        type: "uint256" },
      { name: "deadline",  type: "uint256" },
      { name: "signature", type: "bytes"   },
    ],
    outputs: [],
  },
  {
    name: "expireSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "resumeSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "inIntroPricing",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "introPullsRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "pullAuthorisationDigest",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "id",       type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
];

const STATUS        = { Active: 0, Paused: 1, Cancelled: 2, Expired: 3 };
const INTERVAL_NAME = ["Weekly", "Monthly", "Yearly"];

// ─── Setup ───────────────────────────────────────────────────────────────────
function setup() {
  if (!KEEPER_PRIVKEY) throw new Error("KEEPER_PRIVATE_KEY not set in env");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(KEEPER_PRIVKEY, provider);
  const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
  return { provider, wallet, vault };
}

// ─── Scan all subscription IDs ───────────────────────────────────────────────
// TODO v6.1: replace with DB-driven query for scale.
// Current approach scans from 0 until ZeroAddress owner — works for testnet.
async function getSubscriptionIds(vault) {
  const ids = [];
  let id = 0;
  while (true) {
    try {
      const sub = await vault.subscriptions(id);
      if (sub.owner === ethers.ZeroAddress) break;
      ids.push(id);
      id++;
    } catch {
      break;
    }
  }
  return ids;
}

// ─── Process active subscriptions ────────────────────────────────────────────
async function processDueSubscriptions(vault, ids) {
  let pulled  = 0;
  let skipped = 0;

  for (const id of ids) {
    const sub    = await vault.subscriptions(id);
    const status = Number(sub.status);

    // ── Active: check if due and pull ──────────────────────────────────────
    if (status === STATUS.Active) {
      const due = await vault.isDue(id);

      if (!due) {
        // [SV-02] Log reason for skip: billing pause vs interval not elapsed.
        const now = Math.floor(Date.now() / 1000);
        const billingPausedUntil = Number(sub.billingPausedUntil);
        if (billingPausedUntil > 0 && now < billingPausedUntil) {
          const hoursLeft = Math.ceil((billingPausedUntil - now) / 3600);
          console.log(`  Subscription #${id} billing paused by merchant for ${hoursLeft}h more.`);
        }
        skipped++;
        continue;
      }

      const pullAmount     = await vault.nextPullAmount(id);
      const isIntro        = await vault.inIntroPricing(id);
      const introPullsLeft = isIntro ? await vault.introPullsRemaining(id) : 0n;

      // [SV-01] Log vault type for observability.
      const vaultType = sub.isContractVault ? "contract-wallet (ERC-1271)" : "EOA";

      console.log(`  -> Pulling subscription #${id}`);
      console.log(`     Owner:      ${sub.owner}`);
      console.log(`     Merchant:   ${sub.merchant}`);
      console.log(`     Vault type: ${vaultType}`);
      console.log(`     Amount:     ${ethers.formatUnits(pullAmount, 6)} USDC${isIntro ? ` (intro — ${introPullsLeft} pulls remaining at intro price)` : ""}`);
      console.log(`     Interval:   ${INTERVAL_NAME[Number(sub.interval)]}`);

      // [SV-01] Contract vault path — ERC-1271 signature required.
      // Currently all subscribers are EOA. ERC-1271 full flow planned for v6.1.
      if (sub.isContractVault) {
        console.warn(`     WARNING: Subscription #${id} is a contract vault. ERC-1271 signing not yet implemented in keeper. Skipping.`);
        console.warn(`     ACTION:  Upgrade keeper to v6.1 before onboarding contract wallet subscribers.`);
        skipped++;
        continue;
      }

      try {
        // EOA path: deadline=0, signature="0x"
        const tx      = await vault.executePull(id, 0, "0x");
        console.log(`     TX sent:  ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`     Confirmed in block ${receipt.blockNumber}`);
        pulled++;
      } catch (err) {
        console.error(`     executePull failed: ${err.message}`);
      }
      console.log("");
    }

    // ── Paused: retry if vault topped up within grace period ────────────────
    if (status === STATUS.Paused) {
      const pausedAt       = Number(sub.pausedAt);
      const graceSecs      = Number(sub.gracePeriodDays) * 86_400;
      const now            = Math.floor(Date.now() / 1000);
      const gracePeriodEnd = pausedAt + graceSecs;

      if (now > gracePeriodEnd) continue; // will be expired by expiry loop

      const balance   = await vault.vaultBalance(id);
      const allowance = await vault.vaultAllowance(id);
      const required  = await vault.nextPullAmount(id);

      if (balance >= required && allowance >= required) {
        // Vault is funded and allowance restored during grace period.
        // Keeper does NOT call resumeSubscription — only the subscriber/guardian
        // can resume. Keeper's role is executePull and expireSubscription only.
        // Log the recovery state so notifier can send subscriber a reminder.
        console.log(`  -> Subscription #${id} vault funded during grace — awaiting subscriber resume.`);
        console.log(`     Balance: ${ethers.formatUnits(balance, 6)} USDC, Required: ${ethers.formatUnits(required, 6)} USDC`);
        console.log(`     Subscriber must call resumeSubscription to reactivate.`);
        skipped++;
      } else {
        const balFmt         = ethers.formatUnits(balance, 6);
        const reqFmt         = ethers.formatUnits(required, 6);
        const alwFmt         = ethers.formatUnits(allowance, 6);
        const graceRemaining = Math.floor((gracePeriodEnd - now) / 3600);
        console.log(`  Subscription #${id} in grace (${graceRemaining}h left) — balance: ${balFmt} USDC, allowance: ${alwFmt} USDC, required: ${reqFmt} USDC`);
        skipped++;
      }
    }
  }

  return { pulled, skipped };
}

// ─── Expire subscriptions past grace period ───────────────────────────────────
async function expireGracePeriodSubscriptions(vault, ids) {
  let expired = 0;
  const now   = Math.floor(Date.now() / 1000);

  for (const id of ids) {
    const sub    = await vault.subscriptions(id);
    const status = Number(sub.status);

    if (status !== STATUS.Paused) continue;

    const pausedAt = Number(sub.pausedAt);
    if (pausedAt === 0) continue;

    const graceSecs      = Number(sub.gracePeriodDays) * 86_400;
    const gracePeriodEnd = pausedAt + graceSecs;

    if (now > gracePeriodEnd) {
      const hoursOver = Math.floor((now - gracePeriodEnd) / 3600);
      console.log(`  -> Expiring subscription #${id} (grace ended ${hoursOver}h ago)`);
      try {
        const tx      = await vault.expireSubscription(id);
        console.log(`     TX sent:  ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`     Expired in block ${receipt.blockNumber}`);
        expired++;
      } catch (err) {
        console.error(`     expireSubscription failed: ${err.message}`);
      }
      console.log("");
    }
  }

  return expired;
}

// ─── Main loop ────────────────────────────────────────────────────────────────
async function run() {
  const { provider, wallet, vault } = setup();

  console.log("=".repeat(60));
  console.log("  AuthOnce — Keeper Bot v6");
  console.log("=".repeat(60));
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log(`  Keeper:   ${wallet.address}`);
  console.log(`  RPC:      ${RPC_URL}`);
  console.log(`  Interval: every ${RUN_INTERVAL_MS / 1000}s`);
  console.log("=".repeat(60));
  console.log("");

  // ─── ETH balance alert ───────────────────────────────────────────────────────
  const KEEPER_ETH_WARN_THRESHOLD = ethers.parseEther("0.005");

  async function checkKeeperBalance(provider, address) {
    try {
      const balance = await provider.getBalance(address);
      if (balance < KEEPER_ETH_WARN_THRESHOLD) {
        console.error(`⚠️  KEEPER WALLET LOW ON ETH — Balance: ${ethers.formatEther(balance)} ETH (threshold: 0.005 ETH)`);
        console.error(`⚠️  Top up ${address} to avoid missed pulls.`);
      }
    } catch (err) {
      console.error(`  Could not fetch keeper ETH balance: ${err.message}`);
    }
  }

  async function tick() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Keeper cycle...`);

    try {
      await checkKeeperBalance(provider, wallet.address);

      const ids = await getSubscriptionIds(vault);
      console.log(`  Found ${ids.length} subscription(s).`);

      if (ids.length === 0) {
        console.log("  Nothing to do.");
        console.log("");
        return;
      }

      const { pulled, skipped } = await processDueSubscriptions(vault, ids);
      const expired = await expireGracePeriodSubscriptions(vault, ids);

      console.log(`  Done: ${pulled} pulled, ${expired} expired, ${skipped} not due / skipped.`);
      console.log("");
    } catch (err) {
      console.error(`  Keeper error: ${err.message}`);
      console.log("");
    }
  }

  await tick();
  setInterval(tick, RUN_INTERVAL_MS);
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
