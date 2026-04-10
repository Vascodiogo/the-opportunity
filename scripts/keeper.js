// scripts/keeper.js
// =============================================================================
//  The Opportunity — Phase 2 Keeper Bot
//
//  What this script does (CLAUDE.md §3.1, §3.3, §3.4):
//
//  Every RUN_INTERVAL_MS milliseconds:
//
//  1. POLL   — Read all SubscriptionCreated events to get known subscription IDs
//  2. CHECK  — For each Active subscription, call isDue() on the contract
//  3. PULL   — If due, call executePull(id, amount) as the keeper wallet
//  4. EXPIRE — For each Paused subscription, check if 7-day grace period has
//              elapsed and call expireSubscription(id) if so
//  5. LOG    — Print a clear summary of every action taken
//
//  Usage:
//    node scripts/keeper.js
//
//  Requirements:
//    .env must contain:
//      DEPLOYER_PRIVATE_KEY   — keeper wallet private key (0x4444...6f8F for testnet)
//      BASE_SEPOLIA_RPC_URL   — Alchemy Base Sepolia endpoint
//
//  Contract addresses are hardcoded below from CLAUDE.md §2.
// =============================================================================

require("dotenv").config();
const { ethers } = require("ethers");

// -----------------------------------------------------------------------------
// Config — from CLAUDE.md §2
// -----------------------------------------------------------------------------

const VAULT_ADDRESS    = "0x2ED847da7f88231Ac6907196868adF4840A97f49";
const RPC_URL          = process.env.BASE_SEPOLIA_RPC_URL;
const KEEPER_PRIVKEY   = process.env.DEPLOYER_PRIVATE_KEY;
const RUN_INTERVAL_MS  = 60_000; // Check every 60 seconds

// -----------------------------------------------------------------------------
// ABI — only the functions and events the keeper needs
// -----------------------------------------------------------------------------

const VAULT_ABI = [
  // Events — for polling subscription IDs
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address safeVault, uint256 amount, uint8 interval, address guardian)",

  // Read functions
  "function subscriptions(uint256 id) external view returns (address owner, address guardian, address merchant, address safeVault, uint256 amount, uint8 interval, uint256 lastPulledAt, uint256 pausedAt, uint8 status)",
  "function isDue(uint256 id) external view returns (bool)",

  // Write functions
  "function executePull(uint256 id, uint256 pullAmount) external",
  "function expireSubscription(uint256 id) external",
];

// Subscription status enum values (must match contract)
const STATUS = { Active: 0, Paused: 1, Cancelled: 2, Expired: 3 };
const STATUS_NAME = ["Active", "Paused", "Cancelled", "Expired"];
const INTERVAL_NAME = ["Weekly", "Monthly", "Yearly"];
const GRACE_PERIOD_SECONDS = 7 * 24 * 60 * 60; // 7 days

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------

function setup() {
  if (!RPC_URL)        throw new Error("BASE_SEPOLIA_RPC_URL not set in .env");
  if (!KEEPER_PRIVKEY) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(KEEPER_PRIVKEY, provider);
  const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);

  return { provider, wallet, vault };
}

// -----------------------------------------------------------------------------
// Step 1 — Get all known subscription IDs by probing the counter
// Avoids eth_getLogs entirely — works on Alchemy free tier
// -----------------------------------------------------------------------------

async function getSubscriptionIds(vault) {
  const ids = [];
  let id = 0;

  while (true) {
    try {
      const sub = await vault.subscriptions(id);
      // If owner is zero address, this ID doesn't exist — we've reached the end
      if (sub.owner === ethers.ZeroAddress) break;
      ids.push(id.toString());
      id++;
    } catch {
      break;
    }
  }

  return ids;
}

// -----------------------------------------------------------------------------
// Step 2 & 3 — Check and pull due subscriptions
// -----------------------------------------------------------------------------

async function processDueSubscriptions(vault, ids) {
  let pulled = 0;
  let skipped = 0;

  for (const id of ids) {
    const sub = await vault.subscriptions(id);
    const status = Number(sub.status);

    // Only process Active subscriptions
    if (status !== STATUS.Active) continue;

    const due = await vault.isDue(id);
    if (!due) {
      skipped++;
      continue;
    }

    // Pull the full subscription amount (hard cap enforced on-chain)
    const pullAmount = sub.amount;

    console.log(`  → Pulling subscription #${id}`);
    console.log(`    Owner:    ${sub.owner}`);
    console.log(`    Merchant: ${sub.merchant}`);
    console.log(`    Amount:   ${ethers.formatUnits(pullAmount, 6)} USDC`);
    console.log(`    Interval: ${INTERVAL_NAME[Number(sub.interval)]}`);

    try {
      const tx = await vault.executePull(id, pullAmount);
      console.log(`    TX sent:  ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`    ✅ Confirmed in block ${receipt.blockNumber}`);
      pulled++;
    } catch (err) {
      // executePull() emits InsufficientFunds and pauses the subscription
      // instead of reverting — but we catch any unexpected errors here
      console.log(`    ⚠️  executePull failed: ${err.message}`);
    }

    console.log("");
  }

  return { pulled, skipped };
}

// -----------------------------------------------------------------------------
// Step 4 — Expire subscriptions past their 7-day grace period
// -----------------------------------------------------------------------------

async function expireGracePeriodSubscriptions(vault, ids) {
  let expired = 0;
  const now   = Math.floor(Date.now() / 1000);

  for (const id of ids) {
    const sub    = await vault.subscriptions(id);
    const status = Number(sub.status);

    // Only process Paused subscriptions
    if (status !== STATUS.Paused) continue;

    const pausedAt = Number(sub.pausedAt);
    if (pausedAt === 0) continue;

    const gracePeriodEnd = pausedAt + GRACE_PERIOD_SECONDS;

    if (now > gracePeriodEnd) {
      console.log(`  → Expiring subscription #${id} (grace period ended ${
        Math.floor((now - gracePeriodEnd) / 3600)
      }h ago)`);

      try {
        const tx      = await vault.expireSubscription(id);
        console.log(`    TX sent:  ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`    ✅ Expired in block ${receipt.blockNumber}`);
        expired++;
      } catch (err) {
        console.log(`    ⚠️  expireSubscription failed: ${err.message}`);
      }

      console.log("");
    }
  }

  return expired;
}

// -----------------------------------------------------------------------------
// Main run loop
// -----------------------------------------------------------------------------

async function run() {
  const { provider, wallet, vault } = setup();

  console.log("=".repeat(60));
  console.log("  The Opportunity — Keeper Bot");
  console.log("=".repeat(60));
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log(`  Keeper:   ${wallet.address}`);
  console.log(`  Network:  Base Sepolia`);
  console.log(`  Interval: every ${RUN_INTERVAL_MS / 1000}s`);
  console.log("=".repeat(60));
  console.log("");

  async function tick() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Running keeper cycle...`);

    try {
      // Step 1 — get all subscription IDs
      const ids = await getSubscriptionIds(vault);
      console.log(`  Found ${ids.length} subscription(s) on-chain.`);

      if (ids.length === 0) {
        console.log("  Nothing to do — no subscriptions exist yet.");
        console.log("");
        return;
      }

      // Step 2 & 3 — pull due subscriptions
      const { pulled, skipped } = await processDueSubscriptions(vault, ids);

      // Step 4 — expire grace period subscriptions
      const expired = await expireGracePeriodSubscriptions(vault, ids);

      // Summary
      console.log(`  Cycle complete: ${pulled} pulled, ${expired} expired, ${skipped} not due.`);
      console.log("");

    } catch (err) {
      console.error(`  ❌ Keeper cycle error: ${err.message}`);
      console.log("");
    }
  }

  // Run immediately, then on interval
  await tick();
  setInterval(tick, RUN_INTERVAL_MS);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
