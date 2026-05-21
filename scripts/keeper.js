// scripts/keeper.js
// AuthOnce Keeper Bot — v5
// Works with SubscriptionVault v5:
//   - executePull(id, deadline, signature) — updated v5 signature
//   - EOA subscribers: deadline=0, signature="0x" (ERC-1271 check skipped by contract)
//   - Contract wallet subscribers: keeper must call pullAuthorisationDigest(id, deadline)
//     off-chain, request EIP-712 signature, then pass to executePull
//   - Per-subscription gracePeriodDays (read from contract)
//   - Intro pricing aware (logged, not calculated — contract handles it)
//   - Multi-token: token address read from subscription struct

require("dotenv").config();
const { ethers } = require("ethers");

const VAULT_ADDRESS   = process.env.VAULT_ADDRESS || "0x724C9FF037CeF94b3d03a0F231Ca4580eAA2CECA";
const RPC_URL         = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const KEEPER_PRIVKEY  = process.env.DEPLOYER_PRIVATE_KEY;
const RUN_INTERVAL_MS = 60_000;

// ─── ABI — v5 ───────────────────────────────────────────────────────────────
// Key changes from v4:
//   - executePull(id, deadline, signature) — EIP-712 + ERC-1271 support
//   - subscriptions() now returns token (multi-token) and dataVaultId (DataOnce)
//   - pullAuthorisationDigest(id, deadline) — EIP-712 hash for contract wallets
//   - EOA subscribers: pass deadline=0, signature="0x" to executePull

const VAULT_ABI = [
  {
    name: "subscriptions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "owner",           type: "address" },
      { name: "guardian",        type: "address" },
      { name: "merchant",        type: "address" },
      { name: "safeVault",       type: "address" },
      { name: "token",           type: "address" },
      { name: "amount",          type: "uint256" },
      { name: "introAmount",     type: "uint256" },
      { name: "introPulls",      type: "uint256" },
      { name: "pullCount",       type: "uint256" },
      { name: "interval",        type: "uint8"   },
      { name: "lastPulledAt",    type: "uint256" },
      { name: "pausedAt",        type: "uint256" },
      { name: "expiresAt",       type: "uint256" },
      { name: "trialEndsAt",     type: "uint256" },
      { name: "gracePeriodDays", type: "uint256" },
      { name: "dataVaultId",     type: "bytes32" },
      { name: "status",          type: "uint8"   },
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
    // v5: EOA subscribers pass deadline=0 and signature="0x"
    // Contract wallet subscribers pass EIP-712 deadline + signature bytes
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
    // Used by keeper to build EIP-712 digest for contract wallet subscribers
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
  if (!KEEPER_PRIVKEY) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(KEEPER_PRIVKEY, provider);
  const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
  return { provider, wallet, vault };
}

// ─── Scan all subscription IDs ───────────────────────────────────────────────
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

    // ── Active: check if due and pull ───────────────────────────────────────
    if (status === STATUS.Active) {
      const due = await vault.isDue(id);
      if (!due) { skipped++; continue; }

      // nextPullAmount tells us exactly what the contract will pull
      const pullAmount    = await vault.nextPullAmount(id);
      const isIntro       = await vault.inIntroPricing(id);
      const introPullsLeft = isIntro ? await vault.introPullsRemaining(id) : 0n;

      console.log(`  -> Pulling subscription #${id}`);
      console.log(`     Owner:    ${sub.owner}`);
      console.log(`     Merchant: ${sub.merchant}`);
      console.log(`     Amount:   ${ethers.formatUnits(pullAmount, 6)} USDC${isIntro ? ` (intro — ${introPullsLeft} pulls remaining at intro price)` : ""}`);
      console.log(`     Interval: ${INTERVAL_NAME[Number(sub.interval)]}`);

      try {
        // v5: EOA subscribers — deadline=0, signature="0x" (ERC-1271 skipped by contract)
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

    // ── Paused: retry if vault topped up within grace period ─────────────────
    if (status === STATUS.Paused) {
      const pausedAt       = Number(sub.pausedAt);
      const graceSecs      = Number(sub.gracePeriodDays) * 86_400;
      const now            = Math.floor(Date.now() / 1000);
      const gracePeriodEnd = pausedAt + graceSecs;

      if (now > gracePeriodEnd) continue;  // will be expired by expiry loop

      const balance    = await vault.vaultBalance(id);
      const allowance  = await vault.vaultAllowance(id);
      const required   = await vault.nextPullAmount(id);

      if (balance >= required && allowance >= required) {
        console.log(`  -> Retrying subscription #${id} (vault funded + allowance restored during grace period)`);
        try {
          const tx1 = await vault.resumeSubscription(id);
          await tx1.wait();
          console.log(`     Resumed`);

          const tx2     = await vault.executePull(id, 0, "0x");
          console.log(`     TX sent:  ${tx2.hash}`);
          const receipt = await tx2.wait();
          console.log(`     Payment confirmed in block ${receipt.blockNumber}`);
          pulled++;
        } catch (err) {
          console.error(`     Retry failed: ${err.message}`);
        }
        console.log("");
      } else {
        const balFmt = ethers.formatUnits(balance, 6);
        const reqFmt = ethers.formatUnits(required, 6);
        const alwFmt = ethers.formatUnits(allowance, 6);
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

    const pausedAt   = Number(sub.pausedAt);
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
  const { wallet, vault } = setup();

  console.log("=".repeat(60));
  console.log("  AuthOnce — Keeper Bot v5");
  console.log("=".repeat(60));
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log(`  Keeper:   ${wallet.address}`);
  console.log(`  RPC:      ${RPC_URL}`);
  console.log(`  Interval: every ${RUN_INTERVAL_MS / 1000}s`);
  console.log("=".repeat(60));
  console.log("");

  async function tick() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Keeper cycle...`);

    try {
      const ids = await getSubscriptionIds(vault);
      console.log(`  Found ${ids.length} subscription(s).`);

      if (ids.length === 0) {
        console.log("  Nothing to do.");
        console.log("");
        return;
      }

      const { pulled, skipped } = await processDueSubscriptions(vault, ids);
      const expired = await expireGracePeriodSubscriptions(vault, ids);

      console.log(`  Done: ${pulled} pulled, ${expired} expired, ${skipped} not due.`);
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
