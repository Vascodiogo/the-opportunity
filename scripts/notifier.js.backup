// scripts/notifier.js
// =============================================================================
//  The Opportunity — Phase 3 Notification Backend
//
//  What this script does (CLAUDE.md §3.10):
//
//  Listens to SubscriptionVault events in real time and sends alerts:
//
//  Event                → Action
//  ─────────────────────────────────────────────────────────────────
//  PaymentExecuted      → Email merchant + subscriber "payment received"
//  InsufficientFunds    → Email subscriber "top up your vault"
//  SubscriptionCreated  → Email subscriber "subscription active"
//  SubscriptionCancelled→ Email subscriber "subscription cancelled"
//  SubscriptionExpired  → Email subscriber "subscription expired"
//
//  Stack:
//  - ethers.js  — listens to on-chain events via Alchemy WebSocket
//  - Resend     — sends transactional emails (free tier: 3,000/month)
//
//  Usage:
//    node scripts/notifier.js
//
//  Required .env variables:
//    BASE_SEPOLIA_RPC_URL   — Alchemy Base Sepolia HTTP endpoint
//    RESEND_API_KEY         — get free at resend.com
//    NOTIFY_EMAIL           — your email address for testnet alerts
// =============================================================================

require("dotenv").config();
const { ethers } = require("ethers");

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const VAULT_ADDRESS  = "0x2ED847da7f88231Ac6907196868adF4840A97f49";
const RPC_URL        = process.env.BASE_SEPOLIA_RPC_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL   = process.env.NOTIFY_EMAIL || "test@example.com";

// Interval names for human-readable emails
const INTERVAL_NAME  = ["Weekly", "Monthly", "Yearly"];

// -----------------------------------------------------------------------------
// ABI — only the events we need to listen to
// -----------------------------------------------------------------------------

const VAULT_ABI = [
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address safeVault, uint256 amount, uint8 interval, address guardian)",
  "event PaymentExecuted(uint256 indexed id, uint256 amount, uint256 merchantReceived, uint256 fee, uint256 timestamp)",
  "event InsufficientFunds(uint256 indexed id, uint256 required, uint256 available, uint256 pausedUntil)",
  "event SubscriptionPaused(uint256 indexed id, address pausedBy, string reason)",
  "event SubscriptionCancelled(uint256 indexed id, address cancelledBy)",
  "event SubscriptionExpired(uint256 indexed id, uint256 timestamp)",
  "event SubscriptionResumed(uint256 indexed id, uint256 timestamp)",
];

// -----------------------------------------------------------------------------
// Email sender via Resend API
// -----------------------------------------------------------------------------

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY || RESEND_API_KEY === "YOUR_RESEND_API_KEY") {
    // No API key — just log the email to console for testnet
    console.log(`  📧 [EMAIL SIMULATED]`);
    console.log(`     To:      ${to}`);
    console.log(`     Subject: ${subject}`);
    console.log(`     Body:    ${html.replace(/<[^>]+>/g, "")}`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "The Opportunity <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });

    if (res.ok) {
      console.log(`  📧 Email sent to ${to}: "${subject}"`);
    } else {
      const err = await res.json();
      console.log(`  ⚠️  Email failed: ${JSON.stringify(err)}`);
    }
  } catch (err) {
    console.log(`  ⚠️  Email error: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// Activity log — in-memory store for the frontend API
// (Phase 4 will replace this with a database)
// -----------------------------------------------------------------------------

const activityLog = [];

function logActivity(type, data) {
  const entry = {
    type,
    timestamp: new Date().toISOString(),
    ...data,
  };
  activityLog.unshift(entry); // newest first
  if (activityLog.length > 100) activityLog.pop(); // keep last 100
  return entry;
}

// Expose a simple getter for the frontend (Phase 4)
function getActivityLog(address) {
  if (!address) return activityLog;
  return activityLog.filter(
    (e) =>
      e.owner?.toLowerCase()    === address.toLowerCase() ||
      e.merchant?.toLowerCase() === address.toLowerCase()
  );
}

// -----------------------------------------------------------------------------
// Event handlers — one per event type
// -----------------------------------------------------------------------------

async function onSubscriptionCreated(id, owner, merchant, safeVault, amount, interval, guardian) {
  const usdcAmount = ethers.formatUnits(amount, 6);
  const intervalName = INTERVAL_NAME[Number(interval)] || "Unknown";

  console.log(`\n[EVENT] SubscriptionCreated #${id}`);
  console.log(`  Owner:    ${owner}`);
  console.log(`  Merchant: ${merchant}`);
  console.log(`  Amount:   $${usdcAmount} USDC ${intervalName}`);

  logActivity("SubscriptionCreated", { id: id.toString(), owner, merchant, safeVault, amount: usdcAmount, interval: intervalName });

  await sendEmail(
    NOTIFY_EMAIL,
    `✅ Subscription #${id} activated — $${usdcAmount} ${intervalName}`,
    `
      <h2>Your subscription is active</h2>
      <p>Subscription <strong>#${id}</strong> has been created.</p>
      <ul>
        <li>Amount: <strong>$${usdcAmount} USDC</strong></li>
        <li>Billing: <strong>${intervalName}</strong></li>
        <li>Merchant: <code>${merchant}</code></li>
        <li>Your vault: <code>${safeVault}</code></li>
      </ul>
      <p>Your first payment will be pulled automatically. Make sure your vault has enough USDC.</p>
    `
  );
}

async function onPaymentExecuted(id, amount, merchantReceived, fee, timestamp) {
  const usdcAmount   = ethers.formatUnits(amount, 6);
  const merchantUSDC = ethers.formatUnits(merchantReceived, 6);
  const feeUSDC      = ethers.formatUnits(fee, 6);
  const date         = new Date(Number(timestamp) * 1000).toUTCString();

  console.log(`\n[EVENT] PaymentExecuted #${id}`);
  console.log(`  Amount:   $${usdcAmount} USDC`);
  console.log(`  Merchant: $${merchantUSDC} | Fee: $${feeUSDC}`);
  console.log(`  Time:     ${date}`);

  logActivity("PaymentExecuted", { id: id.toString(), amount: usdcAmount, merchantReceived: merchantUSDC, fee: feeUSDC, date });

  await sendEmail(
    NOTIFY_EMAIL,
    `💸 Payment pulled — $${usdcAmount} USDC for subscription #${id}`,
    `
      <h2>Payment successfully pulled</h2>
      <p>A payment has been executed for subscription <strong>#${id}</strong>.</p>
      <ul>
        <li>Total pulled: <strong>$${usdcAmount} USDC</strong></li>
        <li>Merchant received: <strong>$${merchantUSDC} USDC</strong></li>
        <li>Protocol fee: <strong>$${feeUSDC} USDC</strong></li>
        <li>Date: <strong>${date}</strong></li>
      </ul>
    `
  );
}

async function onInsufficientFunds(id, required, available, pausedUntil) {
  const requiredUSDC  = ethers.formatUnits(required, 6);
  const availableUSDC = ethers.formatUnits(available, 6);
  const deadline      = new Date(Number(pausedUntil) * 1000).toUTCString();

  console.log(`\n[EVENT] InsufficientFunds #${id}`);
  console.log(`  Required:  $${requiredUSDC} USDC`);
  console.log(`  Available: $${availableUSDC} USDC`);
  console.log(`  Top up by: ${deadline}`);

  logActivity("InsufficientFunds", { id: id.toString(), required: requiredUSDC, available: availableUSDC, deadline });

  await sendEmail(
    NOTIFY_EMAIL,
    `⚠️ Top up your vault — subscription #${id} is paused`,
    `
      <h2>Your vault needs topping up</h2>
      <p>Subscription <strong>#${id}</strong> could not be pulled due to insufficient funds.</p>
      <ul>
        <li>Required: <strong>$${requiredUSDC} USDC</strong></li>
        <li>Available: <strong>$${availableUSDC} USDC</strong></li>
        <li>Top up deadline: <strong>${deadline}</strong></li>
      </ul>
      <p><strong>You have 7 days to top up your vault before this subscription is automatically cancelled.</strong></p>
      <p><a href="https://app.theopportunity.xyz">Open your dashboard →</a></p>
    `
  );
}

async function onSubscriptionCancelled(id, cancelledBy) {
  console.log(`\n[EVENT] SubscriptionCancelled #${id} by ${cancelledBy}`);
  logActivity("SubscriptionCancelled", { id: id.toString(), cancelledBy });

  await sendEmail(
    NOTIFY_EMAIL,
    `❌ Subscription #${id} cancelled`,
    `
      <h2>Subscription cancelled</h2>
      <p>Subscription <strong>#${id}</strong> has been cancelled.</p>
      <p>Any remaining USDC stays in your vault — it is never swept.</p>
    `
  );
}

async function onSubscriptionExpired(id, timestamp) {
  const date = new Date(Number(timestamp) * 1000).toUTCString();
  console.log(`\n[EVENT] SubscriptionExpired #${id} at ${date}`);
  logActivity("SubscriptionExpired", { id: id.toString(), date });

  await sendEmail(
    NOTIFY_EMAIL,
    `🔴 Subscription #${id} expired — vault was not topped up in time`,
    `
      <h2>Subscription expired</h2>
      <p>Subscription <strong>#${id}</strong> has expired because the vault was not topped up within the 7-day grace period.</p>
      <p>Your remaining USDC is still in your vault. You can create a new subscription at any time.</p>
    `
  );
}

async function onSubscriptionResumed(id, timestamp) {
  const date = new Date(Number(timestamp) * 1000).toUTCString();
  console.log(`\n[EVENT] SubscriptionResumed #${id} at ${date}`);
  logActivity("SubscriptionResumed", { id: id.toString(), date });

  await sendEmail(
    NOTIFY_EMAIL,
    `✅ Subscription #${id} resumed`,
    `<h2>Subscription resumed</h2><p>Subscription <strong>#${id}</strong> is active again.</p>`
  );
}

// -----------------------------------------------------------------------------
// Main — start listening
// -----------------------------------------------------------------------------

async function main() {
  if (!RPC_URL) throw new Error("BASE_SEPOLIA_RPC_URL not set in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);

  console.log("=".repeat(60));
  console.log("  The Opportunity — Notification Backend");
  console.log("=".repeat(60));
  console.log(`  Vault:   ${VAULT_ADDRESS}`);
  console.log(`  Network: Base Sepolia`);
  console.log(`  Email:   ${RESEND_API_KEY ? "Resend API connected" : "SIMULATED (no API key)"}`);
  console.log(`  Notify:  ${NOTIFY_EMAIL}`);
  console.log("=".repeat(60));
  console.log("\n  Listening for events...\n");

  // Attach event listeners
  vault.on("SubscriptionCreated", onSubscriptionCreated);
  vault.on("PaymentExecuted",     onPaymentExecuted);
  vault.on("InsufficientFunds",   onInsufficientFunds);
  vault.on("SubscriptionCancelled", onSubscriptionCancelled);
  vault.on("SubscriptionExpired", onSubscriptionExpired);
  vault.on("SubscriptionResumed", onSubscriptionResumed);

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\n  Shutting down notifier...");
    vault.removeAllListeners();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

// Export activity log for Phase 4 frontend API
module.exports = { getActivityLog };
