// scripts/notifier.js
// =============================================================================
//  AuthOnce — Notification Backend v3
//
//  What changed from v2:
//    - Switched from WebSocket event listeners to POLLING
//    - Polls for new events every 30 seconds using getLogs()
//    - Much more reliable on Alchemy free tier
//    - Tracks last processed block to avoid duplicate processing
//    - Auto-reconnects on any RPC failure
//
//  Listens to all SubscriptionVault.sol events on Base Sepolia
// =============================================================================

require("dotenv").config();
const { ethers } = require("ethers");
const db = require("./db");
const { dispatchWebhook } = require("./webhook");

const VAULT_ADDRESS  = "0x2ED847da7f88231Ac6907196868adF4840A97f49";
const RPC_URL        = process.env.BASE_SEPOLIA_RPC_URL;
const POLL_INTERVAL  = 30_000; // 30 seconds
const BLOCK_LAG      = 2;      // Process blocks 2 behind head to avoid reorgs

const VAULT_ABI = [
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address safeVault, uint256 amount, uint8 interval, address guardian)",
  "event PaymentExecuted(uint256 indexed id, uint256 amount, uint256 merchantReceived, uint256 fee, uint256 timestamp)",
  "event InsufficientFunds(uint256 indexed id, uint256 required, uint256 available, uint256 pausedUntil)",
  "event SubscriptionPaused(uint256 indexed id, address indexed pausedBy, uint8 reason)",
  "event SubscriptionCancelled(uint256 indexed id, address indexed cancelledBy)",
  "event SubscriptionExpired(uint256 indexed id, uint256 timestamp)",
  "event SubscriptionResumed(uint256 indexed id, uint256 timestamp)",
];

const INTERVAL_NAME = ["weekly", "monthly", "yearly"];
const USDC_DECIMALS = 6n;


// Fetch EUR/USD rate from CoinGecko at time of payment
async function fetchEurRate() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=eur");
    const data = await res.json();
    return data?.["usd-coin"]?.eur || null;
  } catch (err) {
    console.warn("[NOTIFIER] Could not fetch EUR rate:", err.message);
    return null;
  }
}

function formatUsdc(raw) {
  return (BigInt(raw.toString()) / BigInt(10 ** Number(USDC_DECIMALS))).toString();
}

// -----------------------------------------------------------------------------
// Event handlers — each writes to DB then fires webhook
// -----------------------------------------------------------------------------

async function onSubscriptionCreated(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, owner, merchant, safeVault, amount, interval, guardian } = parsed.args;

  console.log(`\n[EVENT] SubscriptionCreated #${id}`);
  console.log(`  Owner:    ${owner}`);
  console.log(`  Merchant: ${merchant}`);
  console.log(`  Amount:   ${formatUsdc(amount)} USDC / ${INTERVAL_NAME[interval]}`);

  await db.upsertSubscription({
    id: id.toString(),
    ownerAddress: owner,
    merchantAddress: merchant,
    safeVault,
    amount: amount.toString(),
    interval: INTERVAL_NAME[interval],
    status: "active",
    txHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    guardianAddress: guardian === ethers.ZeroAddress ? null : guardian,
  });

  await dispatchWebhook(merchant, "subscription.created", {
    subscription_id: id.toString(),
    vault_address: safeVault,
    owner_address: owner,
    merchant_address: merchant,
    amount_usdc: formatUsdc(amount),
    interval: INTERVAL_NAME[interval],
    guardian: guardian === ethers.ZeroAddress ? null : guardian,
    tx_hash: log.transactionHash,
    status: "active",
  });
}

async function onPaymentExecuted(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, amount, merchantReceived, fee, timestamp } = parsed.args;
  const date = new Date(Number(timestamp) * 1000).toISOString();

  console.log(`\n[EVENT] PaymentExecuted #${id}`);
  console.log(`  Amount:   ${formatUsdc(amount)} USDC`);
  console.log(`  Merchant: ${formatUsdc(merchantReceived)} USDC`);
  console.log(`  Fee:      ${formatUsdc(fee)} USDC`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) {
    console.warn(`[NOTIFIER] No subscription found for id ${id} — skipping`);
    return;
  }

  const eurRate = await fetchEurRate();
  const merchantReceivedUsdc = parseFloat(formatUsdc(merchantReceived));
  const merchantReceivedEur = eurRate ? (merchantReceivedUsdc * eurRate).toFixed(2) : null;
  if (eurRate) console.log(`  EUR rate: ${eurRate} → merchant received €${merchantReceivedEur}`);

  await db.insertPayment({
    subscriptionId: id.toString(),
    merchantAddress: sub.merchant_address,
    ownerAddress: sub.owner_address,
    amount: amount.toString(),
    merchantReceived: merchantReceived.toString(),
    fee: fee.toString(),
    txHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    eurRate: eurRate ? eurRate.toString() : null,
    merchantReceivedEur,
  });

  await db.updateSubscriptionStatus(id.toString(), "active", {
    lastPulledAt: new Date(Number(timestamp) * 1000),
  });

  await dispatchWebhook(sub.merchant_address, "payment.success", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    amount_usdc: formatUsdc(amount),
    merchant_received_usdc: formatUsdc(merchantReceived),
    merchant_received_eur: merchantReceivedEur,
    eur_rate: eurRate,
    protocol_fee_usdc: formatUsdc(fee),
    tx_hash: log.transactionHash,
    block_number: Number(log.blockNumber),
    executed_at: date,
  });
}

async function onInsufficientFunds(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, required, available, pausedUntil } = parsed.args;
  const gracePeriodEndsAt = new Date(Number(pausedUntil) * 1000).toISOString();

  console.log(`\n[EVENT] InsufficientFunds #${id}`);
  console.log(`  Required:  ${formatUsdc(required)} USDC`);
  console.log(`  Available: ${formatUsdc(available)} USDC`);
  console.log(`  Grace ends: ${gracePeriodEndsAt}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "paused", { pausedAt: new Date() });

  await dispatchWebhook(sub.merchant_address, "payment.failed", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    required_usdc: formatUsdc(required),
    available_usdc: formatUsdc(available),
    grace_period_ends_at: gracePeriodEndsAt,
    status: "paused",
  });
}

async function onSubscriptionPaused(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, pausedBy } = parsed.args;
  console.log(`\n[EVENT] SubscriptionPaused #${id} by ${pausedBy}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "paused", { pausedAt: new Date() });

  await dispatchWebhook(sub.merchant_address, "subscription.paused", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    paused_by: pausedBy,
    status: "paused",
  });
}

async function onSubscriptionCancelled(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, cancelledBy } = parsed.args;
  console.log(`\n[EVENT] SubscriptionCancelled #${id} by ${cancelledBy}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "cancelled");

  await dispatchWebhook(sub.merchant_address, "subscription.cancelled", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    cancelled_by: cancelledBy,
    status: "cancelled",
    funds_remain_in_vault: true,
  });
}

async function onSubscriptionExpired(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, timestamp } = parsed.args;
  const date = new Date(Number(timestamp) * 1000).toISOString();
  console.log(`\n[EVENT] SubscriptionExpired #${id} at ${date}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "expired");

  await dispatchWebhook(sub.merchant_address, "subscription.expired", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    expired_at: date,
    status: "expired",
  });
}

async function onSubscriptionResumed(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, timestamp } = parsed.args;
  const date = new Date(Number(timestamp) * 1000).toISOString();
  console.log(`\n[EVENT] SubscriptionResumed #${id} at ${date}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "active", { pausedAt: null });

  await dispatchWebhook(sub.merchant_address, "subscription.resumed", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    resumed_at: date,
    status: "active",
  });
}

// -----------------------------------------------------------------------------
// Event topic map
// -----------------------------------------------------------------------------

const EVENT_HANDLERS = {
  "SubscriptionCreated":  onSubscriptionCreated,
  "PaymentExecuted":      onPaymentExecuted,
  "InsufficientFunds":    onInsufficientFunds,
  "SubscriptionPaused":   onSubscriptionPaused,
  "SubscriptionCancelled":onSubscriptionCancelled,
  "SubscriptionExpired":  onSubscriptionExpired,
  "SubscriptionResumed":  onSubscriptionResumed,
};

// -----------------------------------------------------------------------------
// Polling loop
// -----------------------------------------------------------------------------

async function pollEvents(provider, iface, topicMap, lastBlock) {
  try {
    const currentBlock = await provider.getBlockNumber();
    const toBlock = currentBlock - BLOCK_LAG;

    if (toBlock <= lastBlock) {
      return lastBlock; // Nothing new
    }

    // Fetch all logs from our vault contract
    const logs = await provider.getLogs({
      address: VAULT_ADDRESS,
      fromBlock: lastBlock + 1,
      toBlock,
    });

    if (logs.length > 0) {
      console.log(`[NOTIFIER] Processing ${logs.length} event(s) from blocks ${lastBlock + 1}–${toBlock}`);
    }

    for (const log of logs) {
      const topic = log.topics[0];
      const eventName = topicMap[topic];
      if (!eventName) continue;

      const handler = EVENT_HANDLERS[eventName];
      if (!handler) continue;

      try {
        await handler(log, iface);
      } catch (err) {
        console.error(`[NOTIFIER] Error processing ${eventName}:`, err.message);
      }
    }

    return toBlock;
  } catch (err) {
    console.error(`[NOTIFIER] Poll error:`, err.message);
    return lastBlock; // Don't advance on error
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  if (!RPC_URL) throw new Error("BASE_SEPOLIA_RPC_URL not set in .env");

  await db.initSchema();

  console.log("=".repeat(60));
  console.log("  AuthOnce — Notification Backend v3");
  console.log("=".repeat(60));
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log(`  Network:  Base Sepolia`);
  console.log(`  Mode:     Polling every ${POLL_INTERVAL / 1000}s`);
  console.log(`  DB:       ${process.env.DATABASE_URL ? "PostgreSQL connected" : "NO DATABASE_URL SET"}`);
  console.log("=".repeat(60));

  // Build topic → event name map
  const iface = new ethers.Interface(VAULT_ABI);
  const topicMap = {};
  for (const eventName of Object.keys(EVENT_HANDLERS)) {
    const topic = iface.getEvent(eventName).topicHash;
    topicMap[topic] = eventName;
  }

  // Start from current block
  let provider = new ethers.JsonRpcProvider(RPC_URL);
  let lastBlock = 0;

  try {
    lastBlock = (await provider.getBlockNumber()) - BLOCK_LAG;
    console.log(`\n  Starting from block ${lastBlock}\n`);
  } catch (err) {
    console.error("[NOTIFIER] Failed to get block number:", err.message);
    console.log("  Retrying in 10s...");
    await new Promise(r => setTimeout(r, 10_000));
  }

  console.log("  Listening for events...\n");

  // Poll loop
  const poll = async () => {
    try {
      // Recreate provider on each poll for reliability
      provider = new ethers.JsonRpcProvider(RPC_URL);
      lastBlock = await pollEvents(provider, iface, topicMap, lastBlock);
    } catch (err) {
      console.error("[NOTIFIER] Unexpected error:", err.message);
    }
    setTimeout(poll, POLL_INTERVAL);
  };

  // Start polling
  await poll();

  process.on("SIGINT", () => {
    console.log("\n  Shutting down notifier...");
    db.pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
