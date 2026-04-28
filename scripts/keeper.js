// scripts/keeper.js
require("dotenv").config();
const { ethers } = require("ethers");

const VAULT_ADDRESS = "0xED9a4322030b2523cBB4eD5479539a3afEe30afA"; // v3 — configurable grace period
const RPC_URL         = process.env.BASE_SEPOLIA_RPC_URL;
const KEEPER_PRIVKEY  = process.env.DEPLOYER_PRIVATE_KEY;
const RUN_INTERVAL_MS = 60_000;

const VAULT_ABI = [
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address safeVault, uint256 amount, uint8 interval, address guardian)",
  "function subscriptions(uint256 id) external view returns (address owner, address guardian, address merchant, address safeVault, uint256 amount, uint8 interval, uint256 lastPulledAt, uint256 pausedAt, uint8 status)",
  "function isDue(uint256 id) external view returns (bool)",
  "function vaultBalance(uint256 id) external view returns (uint256)",
  "function executePull(uint256 id, uint256 pullAmount) external",
  "function expireSubscription(uint256 id) external",
  "function resumeSubscription(uint256 id) external",
];

const STATUS = { Active: 0, Paused: 1, Cancelled: 2, Expired: 3 };
const INTERVAL_NAME = ["Weekly", "Monthly", "Yearly"];
const GRACE_PERIOD_SECONDS = 7 * 24 * 60 * 60;

function setup() {
  if (!RPC_URL)        throw new Error("BASE_SEPOLIA_RPC_URL not set in .env");
  if (!KEEPER_PRIVKEY) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(KEEPER_PRIVKEY, provider);
  const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
  return { provider, wallet, vault };
}

async function getSubscriptionIds(vault) {
  const ids = [];
  let id = 0;
  while (true) {
    try {
      const sub = await vault.subscriptions(id);
      if (sub.owner === ethers.ZeroAddress) break;
      ids.push(id.toString());
      id++;
    } catch {
      break;
    }
  }
  return ids;
}

async function processDueSubscriptions(vault, ids) {
  let pulled = 0;
  let skipped = 0;

  for (const id of ids) {
    const sub    = await vault.subscriptions(id);
    const status = Number(sub.status);

    // --- Active: check if due and pull ---
    if (status === STATUS.Active) {
      const due = await vault.isDue(id);
      if (!due) { skipped++; continue; }

      const pullAmount = sub.amount;
      console.log(`  -> Pulling subscription #${id}`);
      console.log(`    Owner:    ${sub.owner}`);
      console.log(`    Merchant: ${sub.merchant}`);
      console.log(`    Amount:   ${ethers.formatUnits(pullAmount, 6)} USDC`);
      console.log(`    Interval: ${INTERVAL_NAME[Number(sub.interval)]}`);

      try {
        const tx      = await vault.executePull(id, pullAmount);
        console.log(`    TX sent:  ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`    Confirmed in block ${receipt.blockNumber}`);
        pulled++;
      } catch (err) {
        console.log(`    executePull failed: ${err.message}`);
      }
      console.log("");
    }

    // --- Paused: retry if vault topped up within grace period ---
    if (status === STATUS.Paused) {
      const pausedAt       = Number(sub.pausedAt);
      const now            = Math.floor(Date.now() / 1000);
      const gracePeriodEnd = pausedAt + GRACE_PERIOD_SECONDS;

      if (now > gracePeriodEnd) continue;

      const balance  = await vault.vaultBalance(id);
      const required = sub.amount;

      if (balance >= required) {
        console.log(`  -> Retrying subscription #${id} (vault topped up during grace period)`);
        try {
          const tx1 = await vault.resumeSubscription(id);
          await tx1.wait();
          console.log(`    Resumed`);

          const tx2     = await vault.executePull(id, required);
          console.log(`    TX sent:  ${tx2.hash}`);
          const receipt = await tx2.wait();
          console.log(`    Payment confirmed in block ${receipt.blockNumber}`);
          pulled++;
        } catch (err) {
          console.log(`    Retry failed: ${err.message}`);
        }
        console.log("");
      } else {
        const balFmt = ethers.formatUnits(balance, 6);
        const reqFmt = ethers.formatUnits(required, 6);
        console.log(`  Subscription #${id} in grace period — vault still insufficient (${balFmt} / ${reqFmt} USDC)`);
        skipped++;
      }
    }
  }

  return { pulled, skipped };
}

async function expireGracePeriodSubscriptions(vault, ids) {
  let expired = 0;
  const now   = Math.floor(Date.now() / 1000);

  for (const id of ids) {
    const sub    = await vault.subscriptions(id);
    const status = Number(sub.status);

    if (status !== STATUS.Paused) continue;

    const pausedAt = Number(sub.pausedAt);
    if (pausedAt === 0) continue;

    const gracePeriodEnd = pausedAt + GRACE_PERIOD_SECONDS;

    if (now > gracePeriodEnd) {
      const hoursOver = Math.floor((now - gracePeriodEnd) / 3600);
      console.log(`  -> Expiring subscription #${id} (grace period ended ${hoursOver}h ago)`);
      try {
        const tx      = await vault.expireSubscription(id);
        console.log(`    TX sent:  ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`    Expired in block ${receipt.blockNumber}`);
        expired++;
      } catch (err) {
        console.log(`    expireSubscription failed: ${err.message}`);
      }
      console.log("");
    }
  }

  return expired;
}

async function run() {
  const { provider, wallet, vault } = setup();

  console.log("=".repeat(60));
  console.log("  AuthOnce - Keeper Bot");
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
      const ids = await getSubscriptionIds(vault);
      console.log(`  Found ${ids.length} subscription(s) on-chain.`);

      if (ids.length === 0) {
        console.log("  Nothing to do - no subscriptions exist yet.");
        console.log("");
        return;
      }

      const { pulled, skipped } = await processDueSubscriptions(vault, ids);
      const expired = await expireGracePeriodSubscriptions(vault, ids);

      console.log(`  Cycle complete: ${pulled} pulled, ${expired} expired, ${skipped} not due.`);
      console.log("");
    } catch (err) {
      console.error(`  Keeper cycle error: ${err.message}`);
      console.log("");
    }
  }

  await tick();
  setInterval(tick, RUN_INTERVAL_MS);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
