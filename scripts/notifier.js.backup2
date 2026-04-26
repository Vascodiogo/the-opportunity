// scripts/notifier.js
// =============================================================================
//  AuthOnce — Notification Backend v2
//
//  What changed from v1:
//    - Writes every event to PostgreSQL (subscriptions, payments tables)
//    - Fires HMAC-signed webhooks to merchant endpoints (not direct emails)
//    - Email fallback only for merchants with no webhook configured
//    - AuthOnce never contacts subscribers directly
//
//  Listens to all SubscriptionVault.sol events on Base Sepolia
// =============================================================================

require("dotenv").config();
const { ethers } = require("ethers");
const db = require("./db");
const { dispatchWebhook } = require("./webhook");

const VAULT_ADDRESS = "0x2ED847da7f88231Ac6907196868adF4840A97f49";
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;

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

function formatUsdc(raw) {
  return (BigInt(raw.toString()) / BigInt(10 ** Number(USDC_DECIMALS))).toString();
}

// -----------------------------------------------------------------------------
// Event handlers — each writes to DB then fires webhook
// -----------------------------------------------------------------------------

async function onSubscriptionCreated(id, owner, merchant, safeVault, amount, interval, guardian, event) {
  const txHash = event?.log?.transactionHash || null;
  const blockNumber = event?.log?.blockNumber || null;

  console.log(`\n[EVENT] SubscriptionCreated #${id}`);
  console.log(`  Owner:    ${owner}`);
  console.log(`  Merchant: ${merchant}`);
  console.log(`  Amount:   ${formatUsdc(amount)} USDC / ${INTERVAL_NAME[interval]}`);

  // Write to database
  await db.upsertSubscription({
    id: id.toString(),
    ownerAddress: owner,
    merchantAddress: merchant,
    safeVault,
    amount: amount.toString(),
    interval: INTERVAL_NAME[interval],
    status: "active",
    txHash,
    blockNumber: blockNumber ? Number(blockNumber) : null,
    guardianAddress: guardian === ethers.ZeroAddress ? null : guardian,
  });

  // Fire webhook to merchant
  await dispatchWebhook(merchant, "subscription.created", {
    subscription_id: id.toString(),
    vault_address: safeVault,
    owner_address: owner,
    merchant_address: merchant,
    amount_usdc: formatUsdc(amount),
    interval: INTERVAL_NAME[interval],
    guardian: guardian === ethers.ZeroAddress ? null : guardian,
    tx_hash: txHash,
    status: "active",
  });
}

async function onPaymentExecuted(id, amount, merchantReceived, fee, timestamp, event) {
  const txHash = event?.log?.transactionHash || null;
  const blockNumber = event?.log?.blockNumber || null;
  const date = new Date(Number(timestamp) * 1000).toISOString();

  console.log(`\n[EVENT] PaymentExecuted #${id}`);
  console.log(`  Amount:   ${formatUsdc(amount)} USDC`);
  console.log(`  Merchant: ${formatUsdc(merchantReceived)} USDC`);
  console.log(`  Fee:      ${formatUsdc(fee)} USDC`);

  // Get subscription details for merchant address
  const sub = await db.getSubscription(id.toString());
  if (!sub) {
    console.warn(`[NOTIFIER] No subscription found for id ${id} — skipping`);
    return;
  }

  // Write payment to database
  await db.insertPayment({
    subscriptionId: id.toString(),
    merchantAddress: sub.merchant_address,
    ownerAddress: sub.owner_address,
    amount: amount.toString(),
    merchantReceived: merchantReceived.toString(),
    fee: fee.toString(),
    txHash,
    blockNumber: blockNumber ? Number(blockNumber) : null,
  });

  // Update lastPulledAt on subscription
  await db.updateSubscriptionStatus(id.toString(), "active", {
    lastPulledAt: new Date(Number(timestamp) * 1000),
  });

  // Fire webhook to merchant
  await dispatchWebhook(sub.merchant_address, "payment.success", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    amount_usdc: formatUsdc(amount),
    merchant_received_usdc: formatUsdc(merchantReceived),
    protocol_fee_usdc: formatUsdc(fee),
    tx_hash: txHash,
    block_number: blockNumber ? Number(blockNumber) : null,
    executed_at: date,
  });
}

async function onInsufficientFunds(id, required, available, pausedUntil, event) {
  const gracePeriodEndsAt = new Date(Number(pausedUntil) * 1000).toISOString();

  console.log(`\n[EVENT] InsufficientFunds #${id}`);
  console.log(`  Required:  ${formatUsdc(required)} USDC`);
  console.log(`  Available: ${formatUsdc(available)} USDC`);
  console.log(`  Grace ends: ${gracePeriodEndsAt}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "paused", {
    pausedAt: new Date(),
  });

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

async function onSubscriptionPaused(id, pausedBy, reason, event) {
  console.log(`\n[EVENT] SubscriptionPaused #${id} by ${pausedBy}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "paused", {
    pausedAt: new Date(),
  });

  await dispatchWebhook(sub.merchant_address, "subscription.paused", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    paused_by: pausedBy,
    status: "paused",
  });
}

async function onSubscriptionCancelled(id, cancelledBy, event) {
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

async function onSubscriptionExpired(id, timestamp, event) {
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

async function onSubscriptionResumed(id, timestamp, event) {
  const date = new Date(Number(timestamp) * 1000).toISOString();
  console.log(`\n[EVENT] SubscriptionResumed #${id} at ${date}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "active", {
    pausedAt: null,
  });

  await dispatchWebhook(sub.merchant_address, "subscription.resumed", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    resumed_at: date,
    status: "active",
  });
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  if (!RPC_URL) throw new Error("BASE_SEPOLIA_RPC_URL not set in .env");

  // Initialise database schema
  await db.initSchema();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);

  console.log("=".repeat(60));
  console.log("  AuthOnce — Notification Backend v2");
  console.log("=".repeat(60));
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log(`  Network:  Base Sepolia`);
  console.log(`  DB:       ${process.env.DATABASE_URL ? "PostgreSQL connected" : "NO DATABASE_URL SET"}`);
  console.log("=".repeat(60));
  console.log("\n  Listening for events...\n");

  vault.on("SubscriptionCreated",  onSubscriptionCreated);
  vault.on("PaymentExecuted",      onPaymentExecuted);
  vault.on("InsufficientFunds",    onInsufficientFunds);
  vault.on("SubscriptionPaused",   onSubscriptionPaused);
  vault.on("SubscriptionCancelled",onSubscriptionCancelled);
  vault.on("SubscriptionExpired",  onSubscriptionExpired);
  vault.on("SubscriptionResumed",  onSubscriptionResumed);

  process.on("SIGINT", () => {
    console.log("\n  Shutting down notifier...");
    vault.removeAllListeners();
    db.pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
