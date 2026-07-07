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
const { Pool }   = require("pg");
const { upsertKeeperHeartbeat, logKeeperPullAttempt: _logPullAttempt } = process.env.DATABASE_URL
  ? require("./db.js")
  : { upsertKeeperHeartbeat: async () => {}, logKeeperPullAttempt: async () => {} }; // no-op if DB not configured

// Safe wrapper — never throws
const logPullAttempt = async (data) => { try { await _logPullAttempt(data); } catch {} };

if (!process.env.VAULT_ADDRESS) throw new Error("VAULT_ADDRESS not set in env");
const VAULT_ADDRESS   = ethers.getAddress(process.env.VAULT_ADDRESS.trim());
const RPC_URL         = (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org").trim();
const KEEPER_PRIVKEY  = (process.env.KEEPER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "").trim();
const RUN_INTERVAL_MS = 20_000; // reduced from 60s for faster detection of due subscriptions

// ─── DB pool (optional — falls back to on-chain scan if DATABASE_URL not set) ─
const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
  : null;

if (db) {
  db.on("error", err => console.error("[KEEPER-DB] Pool error:", err.message));
  console.log("  DB: connected — using DB-driven subscription scan");
} else {
  console.log("  DB: DATABASE_URL not set — falling back to on-chain sequential scan");
}

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
  {
    name: "PaymentExecuted", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "merchantReceived", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "pullCount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    name: "MerchantNotApproved", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "merchant", type: "address", indexed: true },
    ],
  },
  {
    name: "MerchantTransferFailed", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "merchant", type: "address", indexed: true },
    ],
  },
  {
    name: "SubscriptionPaused", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "pausedBy", type: "address" },
      { name: "reason", type: "string" },
    ],
  },
  {
    name: "SubscriptionExpired", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "timestamp", type: "uint256" },
    ],
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

// ─── Get subscription IDs ─────────────────────────────────────────────────────
// DB-driven: queries subscriptions table for active/paused IDs.
// Falls back to sequential on-chain scan if DB unavailable.
// DB is the source of truth — notifier writes to it on SubscriptionCreated events.
async function getSubscriptionIds(vault) {
  // ── DB path (preferred) ──────────────────────────────────────────────────
  if (db) {
    try {
      const result = await db.query(
        `SELECT id FROM subscriptions
         WHERE status IN ('active', 'paused')
         ORDER BY id ASC`
      );
      const ids = result.rows.map(r => Number(r.id));
      console.log(`  DB scan: ${ids.length} active/paused subscription(s).`);
      return ids;
    } catch (err) {
      console.error(`  DB scan failed (${err.message}) — falling back to on-chain scan.`);
      // Fall through to on-chain scan
    }
  }

  // ── On-chain fallback ────────────────────────────────────────────────────
  console.log("  On-chain scan (sequential)...");
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
// Processes subscriptions in parallel batches (CONCURRENCY at a time) instead
// of one-by-one. Same keeper wallet, same executePull() call, same checks —
// just concurrent RPC calls instead of sequential waits. This is the
// throughput fix: most time per pull is RPC round-trip latency, not CPU,
// so batching directly multiplies effective pulls/minute.
const CONCURRENCY = 5;

// [Keeper backoff] Tracks consecutive MerchantNotApproved outcomes per
// subscription id. In-memory only — resets to empty on keeper restart,
// which is harmless (worst case: one extra cycle of retries before the
// pattern re-establishes). Not persisted to DB; this is purely an
// RPC/gas-efficiency optimization, not a correctness requirement, since
// the contract itself (SV-16) already guarantees auto-resume regardless
// of what the keeper does.
const notApprovedBackoff = new Map(); // id -> { count: number, skipUntil: number }
const NOT_APPROVED_BACKOFF_THRESHOLD = 3;
const NOT_APPROVED_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes

async function processOneSubscription(vault, wallet, id) {
  const sub    = await vault.subscriptions(id);
  const status = Number(sub.status);

  // ── Active: check if due and pull ──────────────────────────────────────
  if (status === STATUS.Active) {
    const due = await vault.isDue(id);

    if (!due) {
      const now = Math.floor(Date.now() / 1000);
      const billingPausedUntil = Number(sub.billingPausedUntil);
      if (billingPausedUntil > 0 && now < billingPausedUntil) {
        const hoursLeft = Math.ceil((billingPausedUntil - now) / 3600);
        console.log(`  Subscription #${id} billing paused by merchant for ${hoursLeft}h more.`);
      }
      return { pulled: 0, skipped: 1 };
    }

    const pullAmount     = await vault.nextPullAmount(id);
    const isIntro        = await vault.inIntroPricing(id);
    const introPullsLeft = isIntro ? await vault.introPullsRemaining(id) : 0n;
    const vaultType = sub.isContractVault ? "contract-wallet (ERC-1271)" : "EOA";

    console.log(`  -> Pulling subscription #${id}`);
    console.log(`     Owner:      ${sub.owner}`);
    console.log(`     Merchant:   ${sub.merchant}`);
    console.log(`     Vault type: ${vaultType}`);
    console.log(`     Amount:     ${ethers.formatUnits(pullAmount, 6)} USDC${isIntro ? ` (intro — ${introPullsLeft} pulls remaining at intro price)` : ""}`);
    console.log(`     Interval:   ${INTERVAL_NAME[Number(sub.interval)]}`);

    if (sub.isContractVault) {
      console.warn(`     WARNING: Subscription #${id} is a contract vault. ERC-1271 signing not yet implemented in keeper. Skipping.`);
      console.warn(`     ACTION:  Upgrade keeper to v6.1 before onboarding contract wallet subscribers.`);
      await logPullAttempt({
        subscriptionId: id,
        wallet:   sub.owner,
        merchant: sub.merchant,
        amountUsdc: ethers.formatUnits(pullAmount, 6),
        status:   "skipped",
        error:    "contract-vault: ERC-1271 not yet implemented",
      });
      return { pulled: 0, skipped: 1 };
    }

    const backoffState = notApprovedBackoff.get(id);
    if (backoffState && Date.now() < backoffState.skipUntil) {
      const minsLeft = Math.ceil((backoffState.skipUntil - Date.now()) / 60000);
      console.log(`  Subscription #${id} in MerchantNotApproved backoff — ${minsLeft}min remaining, skipping.`);
      return { pulled: 0, skipped: 1 };
    }

    try {
      const BUILDER_CODE = "0x62635f6361336b376235320b0080218021802180218021802180218021";
      const encodedCall  = vault.interface.encodeFunctionData("executePull", [id, 0, "0x"]);
      const calldataWithCode = encodedCall + BUILDER_CODE.slice(2);
      const tx = await wallet.sendTransaction({
        to: VAULT_ADDRESS,
        data: calldataWithCode,
      });
      console.log(`     TX sent:  ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`     Confirmed in block ${receipt.blockNumber}`);

      let outcome = "unknown";
      for (const log of receipt.logs) {
        try {
          const parsed = vault.interface.parseLog(log);
          if (parsed) { outcome = parsed.name; break; }
        } catch { /* not a vault event, ignore */ }
      }

      if (outcome === "PaymentExecuted") {
        notApprovedBackoff.delete(id);
        await logPullAttempt({
          subscriptionId: id, wallet: sub.owner, merchant: sub.merchant,
          amountUsdc: ethers.formatUnits(pullAmount, 6),
          status: "success", txHash: tx.hash, blockNumber: receipt.blockNumber,
        });
        console.log("");
        return { pulled: 1, skipped: 0 };
      }

      if (outcome === "MerchantNotApproved") {
        const prev = notApprovedBackoff.get(id) || { count: 0, skipUntil: 0 };
        const count = prev.count + 1;
        const skipUntil = count >= NOT_APPROVED_BACKOFF_THRESHOLD
          ? Date.now() + NOT_APPROVED_BACKOFF_MS
          : 0;
        notApprovedBackoff.set(id, { count, skipUntil });
        if (skipUntil > 0) {
          console.log(`  Subscription #${id}: ${count} consecutive MerchantNotApproved — backing off 10min.`);
        }
        await logPullAttempt({
          subscriptionId: id, wallet: sub.owner, merchant: sub.merchant,
          amountUsdc: ethers.formatUnits(pullAmount, 6),
          status: "skipped", error: "merchant_not_approved",
        });
        console.log("");
        return { pulled: 0, skipped: 1 };
      }

      // MerchantTransferFailed, SubscriptionPaused, SubscriptionExpired,
      // or anything else that confirmed without reverting: not a payment,
      // not the specific backoff case — just log accurately and reset.
      notApprovedBackoff.delete(id);
      await logPullAttempt({
        subscriptionId: id, wallet: sub.owner, merchant: sub.merchant,
        amountUsdc: ethers.formatUnits(pullAmount, 6),
        status: "skipped", error: outcome,
      });
      console.log("");
      return { pulled: 0, skipped: 1 };
    } catch (err) {
      console.error(`     executePull failed: ${err.message}`);
      await logPullAttempt({
        subscriptionId: id,
        wallet:   sub.owner,
        merchant: sub.merchant,
        amountUsdc: ethers.formatUnits(pullAmount, 6),
        status:   "failed",
        error:    err.message?.slice(0, 500),
      });
      console.log("");
      return { pulled: 0, skipped: 0 };
    }
  }

  // ── Paused: retry if vault topped up within grace period ────────────────
  if (status === STATUS.Paused) {
    const pausedAt       = Number(sub.pausedAt);
    const graceSecs      = Number(sub.gracePeriodDays) * 86_400;
    const now            = Math.floor(Date.now() / 1000);
    const gracePeriodEnd = pausedAt + graceSecs;

    if (now > gracePeriodEnd) return { pulled: 0, skipped: 0 }; // will be expired by expiry loop

    const balance   = await vault.vaultBalance(id);
    const allowance = await vault.vaultAllowance(id);
    const required  = await vault.nextPullAmount(id);

    if (balance >= required && allowance >= required) {
      console.log(`  -> Subscription #${id} vault funded during grace — awaiting subscriber resume.`);
      console.log(`     Balance: ${ethers.formatUnits(balance, 6)} USDC, Required: ${ethers.formatUnits(required, 6)} USDC`);
      console.log(`     Subscriber must call resumeSubscription to reactivate.`);
      return { pulled: 0, skipped: 1 };
    } else {
      const balFmt         = ethers.formatUnits(balance, 6);
      const reqFmt         = ethers.formatUnits(required, 6);
      const alwFmt         = ethers.formatUnits(allowance, 6);
      const graceRemaining = Math.floor((gracePeriodEnd - now) / 3600);
      console.log(`  Subscription #${id} in grace (${graceRemaining}h left) — balance: ${balFmt} USDC, allowance: ${alwFmt} USDC, required: ${reqFmt} USDC`);
      return { pulled: 0, skipped: 1 };
    }
  }

  return { pulled: 0, skipped: 0 };
}

async function processDueSubscriptions(vault, wallet, ids) {
  let pulled  = 0;
  let skipped = 0;

  // Process in batches of CONCURRENCY, parallel within each batch.
  // Sequential pulls were the bottleneck — each await blocked on RPC
  // round-trip even when nothing depends on the previous result.
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(id => processOneSubscription(vault, wallet, id).catch(err => {
        console.error(`  Subscription #${id} processing error: ${err.message}`);
        return { pulled: 0, skipped: 0 };
      }))
    );
    for (const r of results) {
      pulled  += r.pulled;
      skipped += r.skipped;
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
  console.log(`  Concurrency: ${CONCURRENCY} parallel pulls per batch`);
  console.log("=".repeat(60));
  console.log("");

  // ─── ETH balance alert ───────────────────────────────────────────────────────
  const KEEPER_ETH_WARN_THRESHOLD    = ethers.parseEther("0.005");
  const DEPLOYER_ETH_WARN_THRESHOLD  = ethers.parseEther("0.005");
  const SAFE_ETH_WARN_THRESHOLD      = ethers.parseEther("0.01");

  // Generic wallet ETH balance checker — returns { ethBalance, warn }
  // Email alert fires at most once every 24 hours per wallet to avoid spam
  const alertCooldowns = {}; // in-memory cooldown tracker per address

  async function checkWalletEthBalance(provider, address, threshold, label) {
    try {
      const balance    = await provider.getBalance(address);
      const ethBalance = parseFloat(ethers.formatEther(balance));
      const warn       = balance < threshold;

      if (warn) {
        console.error(`⚠️  ${label} LOW ON ETH — Balance: ${ethBalance.toFixed(6)} ETH`);

        // Cooldown — only email once per 24 hours per wallet
        const lastAlerted = alertCooldowns[address] || 0;
        const hoursSince  = (Date.now() - lastAlerted) / (1000 * 60 * 60);

        if (hoursSince >= 24) {
          alertCooldowns[address] = Date.now();
          const RESEND_API_KEY = process.env.RESEND_API_KEY;
          const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || "vasco@authonce.io";
          if (RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "AuthOnce <notifications@authonce.io>",
                to:   [ADMIN_EMAIL],
                subject: `⚠️ ${label} low on ETH — ${ethBalance.toFixed(6)} ETH remaining`,
                html: `<!DOCTYPE html><html><body style="font-family:monospace;background:#0f172a;color:#f1f5f9;padding:24px;">
                  <h2 style="color:#f59e0b;">⚠️ ${label} Low on ETH</h2>
                  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                    <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">Wallet</td><td style="padding:8px;font-family:monospace;">${address}</td></tr>
                    <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">Balance</td><td style="padding:8px;color:#f59e0b;font-weight:bold;">${ethBalance.toFixed(6)} ETH</td></tr>
                    <tr><td style="padding:8px;color:#94a3b8;">Action</td><td style="padding:8px;color:#34d399;">Top up with at least 0.05 ETH on Base Network</td></tr>
                  </table>
                  <p style="color:#475569;font-size:12px;">AuthOnce Keeper Bot · Next alert in 24 hours if not resolved</p>
                </body></html>`,
                text: `${label} LOW ON ETH\n\nWallet: ${address}\nBalance: ${ethBalance.toFixed(6)} ETH\n\nTop up on Base Network. Next alert in 24 hours.`,
              }),
            }).catch(e => console.error(`  ETH alert email failed: ${e.message}`));
            console.log(`  ETH low-balance alert sent for ${label} (next alert in 24h)`);
          }
        } else {
          console.warn(`  ${label} still low on ETH — alert cooldown active (${(24 - hoursSince).toFixed(1)}h remaining)`);
        }
      }
      return { ethBalance, warn };
    } catch (err) {
      console.error(`  Could not fetch ETH balance for ${label}: ${err.message}`);
      return { ethBalance: null, warn: false };
    }
  }

  async function checkKeeperBalance(provider, address) {
    const result = await checkWalletEthBalance(provider, address, KEEPER_ETH_WARN_THRESHOLD, "Keeper wallet");
    return { ethBalance: result.ethBalance, ethBalanceWarn: result.warn };
  }

  // ─── Treasury USDC balance check ─────────────────────────────────────────────
  // Reads accumulated protocol fees — display only, no alert needed
  const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];
  const USDC_ADDRESS = process.env.NETWORK === "base-mainnet"
    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia

  async function checkTreasuryUsdc(provider) {
    try {
      const TREASURY = process.env.PROTOCOL_TREASURY_ADDRESS || "0x737D4EeAEF67f776724482a29367615703A2DEB1";
      const usdc     = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const balance  = await usdc.balanceOf(TREASURY);
      return parseFloat(ethers.formatUnits(balance, 6)); // USDC has 6 decimals
    } catch (err) {
      console.error(`  Could not fetch treasury USDC balance: ${err.message}`);
      return null;
    }
  }

  async function tick() {
    const timestamp = new Date().toISOString();
    const cycleStart = Date.now();
    console.log(`[${timestamp}] Keeper cycle...`);

    let pulled = 0, expired = 0, skipped = 0, cycleError = null;
    let ethBalance = null, ethBalanceWarn = false;
    let deployerEthBalance = null, deployerEthWarn = false;
    let safeEthBalance = null, safeEthWarn = false;
    let treasuryUsdc = null;

    try {
      ({ ethBalance, ethBalanceWarn } = await checkKeeperBalance(provider, wallet.address));

      // Deployer ETH — alert only
      const DEPLOYER_ADDRESS = process.env.DEPLOYER_ADDRESS || "0xbb6d960b8671713bb92be92d03BE8d8165EE7782";
      ({ ethBalance: deployerEthBalance, warn: deployerEthWarn } =
        await checkWalletEthBalance(provider, DEPLOYER_ADDRESS, DEPLOYER_ETH_WARN_THRESHOLD, "Deployer wallet"));

      // Safe multisig ETH — alert + dashboard
      const SAFE_ADDRESS = process.env.PROTOCOL_TREASURY_ADDRESS || "0x737D4EeAEF67f776724482a29367615703A2DEB1";
      ({ ethBalance: safeEthBalance, warn: safeEthWarn } =
        await checkWalletEthBalance(provider, SAFE_ADDRESS, SAFE_ETH_WARN_THRESHOLD, "Safe multisig"));

      // Treasury USDC — dashboard only
      treasuryUsdc = await checkTreasuryUsdc(provider);

      const ids = await getSubscriptionIds(vault);
      console.log(`  Found ${ids.length} subscription(s).`);

      if (ids.length === 0) {
        console.log("  Nothing to do.");
        console.log("");
      } else {
        ({ pulled, skipped } = await processDueSubscriptions(vault, wallet, ids));
        expired = await expireGracePeriodSubscriptions(vault, ids);
        console.log(`  Done: ${pulled} pulled, ${expired} expired, ${skipped} not due / skipped.`);
      }
    } catch (err) {
      cycleError = err.message;
      console.error(`  Keeper error: ${err.message}`);
    }

    const cycleMs = Date.now() - cycleStart;
    console.log(`  Cycle time: ${cycleMs}ms`);
    console.log("");

    // Write heartbeat to DB
    try {
      await upsertKeeperHeartbeat({ cycleMs, pulled, expired, skipped, error: cycleError, ethBalance, ethBalanceWarn, deployerEthBalance, deployerEthWarn, safeEthBalance, safeEthWarn, treasuryUsdc });
    } catch (err) {
      console.error(`  Heartbeat write failed: ${err.message}`);
    }
  }

  await tick();
  setInterval(tick, RUN_INTERVAL_MS);
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
