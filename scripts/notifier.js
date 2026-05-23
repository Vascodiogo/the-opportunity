// scripts/notifier.js
// =============================================================================
//  AuthOnce — Notification Backend v5
//
//  Fixes applied (v4.1):
//    - BUGFIX: onInsufficientFunds — removed copy-paste block using out-of-scope
//      variables (amount, timestamp, merchantReceivedEur) that caused a runtime
//      crash, silencing all payment.failed notifications
//    - BUGFIX: onInsufficientFunds — removed duplicate merchant email block
//      (allowance copy-paste) that does not belong in the funds handler
//    - BUGFIX: onSubscriptionExpired — added subscriber email notification
//    - BUGFIX: onSubscriptionExpired webhook — vault_address now uses
//      safe_vault || owner_address fallback
//    - BUGFIX: Basescan URL now env-driven (NETWORK=mainnet uses basescan.org)
//    - COPY: price change email — "may change" → "will change"
//    - COPY: payment.failed merchant email — "cancelled" → "expired"
//
//  Listens to SubscriptionVault.sol events on Base Sepolia / Mainnet
// =============================================================================

require("dotenv").config();
const { ethers } = require("ethers");
const { Resend }  = require("resend");
const db          = require("./db");
const { dispatchWebhook } = require("./webhook");
const { templates }       = require("./email-templates");
const { getMerchantSender } = require("./resend-domains");

const VAULT_ADDRESS  = process.env.VAULT_ADDRESS || "0x12ded877546bdaF500A1FeAd66798d5877c42f1d";
const RPC_URL        = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const POLL_INTERVAL  = 30_000; // 30 seconds
const BLOCK_LAG      = 2;      // Process blocks 2 behind head to avoid reorgs

// Env-driven Basescan base URL — set NETWORK=mainnet in Railway for mainnet
const BASESCAN_URL = process.env.NETWORK === "mainnet"
  ? "https://basescan.org"
  : "https://sepolia.basescan.org";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ─── v4 ABI ──────────────────────────────────────────────────────────────────
const VAULT_ABI = [
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address safeVault, uint256 amount, uint256 introAmount, uint256 introPulls, uint8 interval, address guardian)",
  "event PaymentExecuted(uint256 indexed id, uint256 amount, uint256 merchantReceived, uint256 fee, uint256 pullCount, uint256 timestamp)",
  "event InsufficientFunds(uint256 indexed id, uint256 required, uint256 available, uint256 pausedUntil)",
  "event InsufficientAllowance(uint256 indexed id, uint256 required, uint256 allowance)",
  "event SubscriptionPaused(uint256 indexed id, address indexed pausedBy)",
  "event SubscriptionCancelled(uint256 indexed id, address indexed cancelledBy)",
  "event SubscriptionExpired(uint256 indexed id, uint256 timestamp)",
  "event SubscriptionResumed(uint256 indexed id, uint256 timestamp)",
  "event TrialStarted(uint256 indexed id, uint256 trialEndsAt)",
  // View functions for proactive notifications
  "function subscriptions(uint256 id) external view returns (address owner, address guardian, address merchant, address safeVault, uint256 amount, uint256 introAmount, uint256 introPulls, uint256 pullCount, uint8 interval, uint256 lastPulledAt, uint256 pausedAt, uint256 expiresAt, uint256 trialEndsAt, uint256 gracePeriodDays, uint8 status)",
  "function nextPullAmount(uint256 id) external view returns (uint256)",
  "function vaultAllowance(uint256 id) external view returns (uint256)",
  "function vaultBalance(uint256 id) external view returns (uint256)",
  "function isDue(uint256 id) external view returns (bool)",
];

const INTERVAL_SECONDS = { 0: 7 * 86400, 1: 30 * 86400, 2: 365 * 86400 };
const INTERVAL_NAME    = ["weekly", "monthly", "yearly"];
const USDC_DECIMALS    = 6n;
const THREE_DAYS_SECS  = 3 * 86400;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchEurRate() {
  try {
    const res  = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=eur");
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

async function sendEmail({ to, subject, html, text, from = "AuthOnce <notifications@authonce.io>" }) {
  if (!resend) { console.warn("[NOTIFIER] RESEND_API_KEY not set — skipping email"); return; }
  try {
    await resend.emails.send({ from, to, subject, html, text });
    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err.message);
  }
}

// Get whitelabel config for a merchant (tier, brand, custom domain)
async function getMerchantEmailConfig(merchantAddress) {
  try {
    const merchant = await db.getMerchant(merchantAddress.toLowerCase());
    const tier       = merchant?.tier        || "starter";
    const brandName  = merchant?.brand_name  || null;
    const brandColor = merchant?.brand_color || "#34d399";
    const sender     = await getMerchantSender(db, merchantAddress);
    return { tier, brandName, brandColor, from: sender.fromHeader };
  } catch {
    return { tier: "starter", brandName: null, brandColor: "#34d399", from: "AuthOnce <notifications@authonce.io>" };
  }
}

// Get subscriber email for a vault address
async function getSubscriberEmail(vaultAddress) {
  try {
    const res = await db.query(
      "SELECT email, name FROM subscribers WHERE wallet_address = $1",
      [vaultAddress.toLowerCase()]
    );
    return res.rows[0] || null;
  } catch { return null; }
}

// Get merchant email for a merchant address
async function getMerchantEmail(merchantAddress) {
  try {
    const merchant = await db.getMerchant(merchantAddress.toLowerCase());
    return merchant?.email || null;
  } catch { return null; }
}

// Get merchant business name
async function getMerchantName(merchantAddress) {
  try {
    const merchant = await db.getMerchant(merchantAddress.toLowerCase());
    return merchant?.business_name || shortAddr(merchantAddress);
  } catch { return shortAddr(merchantAddress); }
}

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ─── 3-Day Pre-Payment Notification ──────────────────────────────────────────
// Runs every poll cycle. Checks all active subscriptions due in 1–3 days.
// Sends email to subscriber + webhook to merchant.
// Uses a DB flag to avoid sending duplicate notifications.

async function checkUpcomingPayments(vault) {
  const now = Math.floor(Date.now() / 1000);
  const windowEnd = now + THREE_DAYS_SECS;

  // Get all active subscriptions from DB
  const result = await db.query(
    "SELECT * FROM subscriptions WHERE status = 'active'",
    []
  );

  for (const sub of result.rows) {
    try {
      // Read on-chain subscription to get latest state
      const onchain = await vault.subscriptions(BigInt(sub.id));
      const lastPulledAt    = Number(onchain.lastPulledAt);
      const interval        = Number(onchain.interval);
      const status          = Number(onchain.status);
      const trialEndsAt     = Number(onchain.trialEndsAt);

      if (status !== 0) continue; // Skip non-active

      const intervalSecs = INTERVAL_SECONDS[interval] || INTERVAL_SECONDS[1];
      const nextPullAt   = lastPulledAt + intervalSecs;

      // Skip if in trial
      if (trialEndsAt > 0 && now < trialEndsAt) continue;

      // Check if due within 3 days but not yet due
      if (nextPullAt <= now || nextPullAt > windowEnd) continue;

      // Check if we already sent this notification (within last interval)
      const notifKey = `payment_reminder_${sub.id}_${Math.floor(nextPullAt / intervalSecs)}`;
      const alreadySent = await db.query(
        "SELECT 1 FROM webhook_deliveries WHERE event_type = $1 AND merchant_address = $2 AND created_at > NOW() - INTERVAL '3 days'",
        [notifKey, sub.merchant_address]
      );
      if (alreadySent.rows.length > 0) continue;

      const daysUntil   = Math.ceil((nextPullAt - now) / 86400);
      const pullAmount  = await vault.nextPullAmount(BigInt(sub.id));
      const amountUsdc  = (Number(pullAmount) / 1e6).toFixed(2);
      const nextDate    = new Date(nextPullAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const merchantName = await getMerchantName(sub.merchant_address);

      console.log(`[NOTIFIER] 3-day notice: sub #${sub.id} due in ${daysUntil} day(s) — $${amountUsdc} USDC`);

      // Email subscriber
      const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
      if (subscriber?.email) {
        const tplRemind = templates.paymentReminder({ name: subscriber.name, merchantName, amountUsdc, nextDate, daysUntil });
        await sendEmail({ to: subscriber.email, subject: templates.subjects.paymentReminder(amountUsdc, daysUntil), ...tplRemind });
      }

      // Webhook to merchant
      await dispatchWebhook(sub.merchant_address, "payment.upcoming", {
        subscription_id: sub.id,
        vault_address:   sub.safe_vault || sub.owner_address,
        merchant_address: sub.merchant_address,
        amount_usdc:     amountUsdc,
        due_at:          new Date(nextPullAt * 1000).toISOString(),
        days_until:      daysUntil,
      });

      // Log notification sent
      await db.query(
        "INSERT INTO webhook_deliveries (merchant_address, event_type, payload, delivered, created_at) VALUES ($1, $2, $3, TRUE, NOW())",
        [sub.merchant_address, notifKey, JSON.stringify({ subscription_id: sub.id, sent_at: new Date().toISOString() })]
      );

    } catch (err) {
      console.error(`[NOTIFIER] 3-day check error for sub #${sub.id}:`, err.message);
    }
  }
}

// ─── Price Change 30-Day Notice ───────────────────────────────────────────────
// Checks subscriptions with expiresAt set within the next 30 days.
// Sends email to subscriber warning them of the upcoming price change.

async function checkPriceChangeNotices(vault) {
  const now        = Math.floor(Date.now() / 1000);
  const thirtyDays = 30 * 86400;

  const result = await db.query(
    "SELECT * FROM subscriptions WHERE status = 'active'",
    []
  );

  for (const sub of result.rows) {
    try {
      const onchain   = await vault.subscriptions(BigInt(sub.id));
      const expiresAt = Number(onchain.expiresAt);
      const status    = Number(onchain.status);

      if (status !== 0) continue;
      if (expiresAt === 0) continue; // No expiry set
      if (expiresAt <= now) continue; // Already expired
      if (expiresAt > now + thirtyDays) continue; // Too far away

      // Only send notice once
      const notifKey = `price_change_notice_${sub.id}_${expiresAt}`;
      const alreadySent = await db.query(
        "SELECT 1 FROM webhook_deliveries WHERE event_type = $1",
        [notifKey]
      );
      if (alreadySent.rows.length > 0) continue;

      const daysUntil   = Math.ceil((expiresAt - now) / 86400);
      const expiryDate  = new Date(expiresAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const merchantName = await getMerchantName(sub.merchant_address);
      const amountUsdc  = (Number(onchain.amount) / 1e6).toFixed(2);

      console.log(`[NOTIFIER] Price change notice: sub #${sub.id} expires in ${daysUntil} day(s)`);

      // Email subscriber
      const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
      if (subscriber?.email) {
        const tplPrice = templates.priceChangeNotice({ name: subscriber.name, merchantName, amountUsdc, expiryDate, daysUntil });
        await sendEmail({ to: subscriber.email, subject: templates.subjects.priceChangeNotice(merchantName, expiryDate), ...tplPrice });
      }

      // Webhook to merchant
      await dispatchWebhook(sub.merchant_address, "subscription.expiring", {
        subscription_id: sub.id,
        vault_address:   sub.safe_vault || sub.owner_address,
        merchant_address: sub.merchant_address,
        expires_at:      new Date(expiresAt * 1000).toISOString(),
        days_until:      daysUntil,
        current_amount_usdc: amountUsdc,
      });

      // Log notification sent
      await db.query(
        "INSERT INTO webhook_deliveries (merchant_address, event_type, payload, delivered, created_at) VALUES ($1, $2, $3, TRUE, NOW())",
        [sub.merchant_address, notifKey, JSON.stringify({ subscription_id: sub.id, expires_at: expiresAt })]
      );

    } catch (err) {
      console.error(`[NOTIFIER] Price change check error for sub #${sub.id}:`, err.message);
    }
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

async function onSubscriptionCreated(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, owner, merchant, safeVault, amount, introAmount, introPulls, interval, guardian } = parsed.args;

  console.log(`\n[EVENT] SubscriptionCreated #${id}`);
  console.log(`  Owner:    ${owner}`);
  console.log(`  Merchant: ${merchant}`);
  console.log(`  Amount:   ${formatUsdc(amount)} USDC / ${INTERVAL_NAME[interval]}`);
  if (introAmount > 0n) console.log(`  Intro:    ${formatUsdc(introAmount)} USDC × ${introPulls}`);

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

  // Email subscriber + merchant
  const merchantName = await getMerchantName(merchant);
  const amountUsdc   = (Number(amount) / 1e6).toFixed(2);

  const subscriber = await getSubscriberEmail(safeVault);
  if (subscriber?.email) {
    const tpl = templates.subscriptionConfirmed({
      name: subscriber.name, merchantName, amountUsdc,
      interval: INTERVAL_NAME[interval],
      trialDays: 0, introAmount: introAmount > 0n ? (Number(introAmount)/1e6).toFixed(2) : null,
      introPulls: Number(introPulls),
    });
    await sendEmail({ to: subscriber.email, subject: templates.subjects.subscriptionConfirmed(merchantName), ...tpl });
  }

  // Merchant: new subscriber notification (was missing)
  const merchantEmail = await getMerchantEmail(merchant);
  if (merchantEmail) {
    const tpl = templates.merchantNewSubscriber({
      amountUsdc, interval: INTERVAL_NAME[interval],
      subscriptionId: id.toString(),
      vaultAddress: safeVault,
      txHash: log.transactionHash,
      basescanUrl: BASESCAN_URL,
    });
    await sendEmail({ to: merchantEmail, subject: templates.subjects.merchantNewSubscriber(amountUsdc, INTERVAL_NAME[interval]), ...tpl });
  }

  await dispatchWebhook(merchant, "subscription.created", {
    subscription_id: id.toString(),
    vault_address: safeVault,
    owner_address: owner,
    merchant_address: merchant,
    amount_usdc: formatUsdc(amount),
    intro_amount_usdc: introAmount > 0n ? formatUsdc(introAmount) : null,
    intro_pulls: Number(introPulls),
    interval: INTERVAL_NAME[interval],
    guardian: guardian === ethers.ZeroAddress ? null : guardian,
    tx_hash: log.transactionHash,
    status: "active",
  });
}

async function onPaymentExecuted(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, amount, merchantReceived, fee, pullCount, timestamp } = parsed.args;
  const date = new Date(Number(timestamp) * 1000).toISOString();

  console.log(`\n[EVENT] PaymentExecuted #${id} (pull #${pullCount})`);
  console.log(`  Amount:   ${formatUsdc(amount)} USDC`);
  console.log(`  Merchant: ${formatUsdc(merchantReceived)} USDC`);
  console.log(`  Fee:      ${formatUsdc(fee)} USDC`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) { console.warn(`[NOTIFIER] No subscription found for id ${id} — skipping`); return; }

  const eurRate = await fetchEurRate();
  const merchantReceivedUsdc = parseFloat(formatUsdc(merchantReceived));
  const merchantReceivedEur  = eurRate ? (merchantReceivedUsdc * eurRate).toFixed(2) : null;
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

  // Email subscriber receipt
  const amountUsdc2      = (Number(amount) / 1e6).toFixed(2);
  const merchantName2    = await getMerchantName(sub.merchant_address);
  const dateStr          = new Date(Number(timestamp) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const merchantRcvUsdc  = (Number(merchantReceived) / 1e6).toFixed(4);

  const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriber?.email) {
    const tpl = templates.paymentReceipt({
      name: subscriber.name, merchantName: merchantName2, amountUsdc: amountUsdc2,
      date: dateStr, txHash: log.transactionHash, basescanUrl: BASESCAN_URL,
    });
    await sendEmail({ to: subscriber.email, subject: templates.subjects.paymentReceipt(amountUsdc2, merchantName2), ...tpl });
  }

  const merchantEmail2 = await getMerchantEmail(sub.merchant_address);
  if (merchantEmail2) {
    const tpl = templates.merchantPaymentReceived({
      amountUsdc: amountUsdc2, merchantReceivedUsdc: merchantRcvUsdc,
      merchantReceivedEur, date: dateStr,
      subscriptionId: id.toString(),
      txHash: log.transactionHash, basescanUrl: BASESCAN_URL,
    });
    await sendEmail({ to: merchantEmail2, subject: templates.subjects.merchantPaymentReceived(amountUsdc2), ...tpl });
  }

  await dispatchWebhook(sub.merchant_address, "payment.success", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault,
    merchant_address: sub.merchant_address,
    amount_usdc: formatUsdc(amount),
    merchant_received_usdc: formatUsdc(merchantReceived),
    merchant_received_eur: merchantReceivedEur,
    eur_rate: eurRate,
    protocol_fee_usdc: formatUsdc(fee),
    pull_count: Number(pullCount),
    tx_hash: log.transactionHash,
    block_number: Number(log.blockNumber),
    executed_at: date,
  });
}

async function onInsufficientFunds(log, iface) {
  // FIX: removed copy-paste block from onPaymentExecuted that referenced
  // out-of-scope variables (amount, timestamp, merchantReceivedEur),
  // causing a runtime crash that silenced all payment.failed notifications.
  // FIX: removed duplicate merchant allowance email block that does not
  // belong in the InsufficientFunds handler.

  const parsed = iface.parseLog(log);
  const { id, required, available, pausedUntil } = parsed.args;
  const gracePeriodEndsAt = new Date(Number(pausedUntil) * 1000).toISOString();

  console.log(`\n[EVENT] InsufficientFunds #${id}`);
  console.log(`  Required:  ${formatUsdc(required)} USDC`);
  console.log(`  Available: ${formatUsdc(available)} USDC`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "paused", { pausedAt: new Date() });

  const reqUsdc   = (Number(required) / 1e6).toFixed(2);
  const availUsdc = (Number(available) / 1e6).toFixed(2);
  const graceDate = new Date(Number(pausedUntil) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const mName     = await getMerchantName(sub.merchant_address);

  const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriber?.email) {
    const tpl = templates.paymentFailedFunds({ name: subscriber.name, merchantName: mName, requiredUsdc: reqUsdc, availableUsdc: availUsdc, graceDate });
    await sendEmail({ to: subscriber.email, subject: templates.subjects.paymentFailedFunds(mName), ...tpl });
  }

  const merchantEmail = await getMerchantEmail(sub.merchant_address);
  if (merchantEmail) {
    const tpl = templates.merchantPaymentFailed({ requiredUsdc: reqUsdc, graceDate, reason: "insufficient_funds", subscriptionId: id.toString() });
    await sendEmail({ to: merchantEmail, subject: templates.subjects.merchantPaymentFailed(), ...tpl });
  }

  await dispatchWebhook(sub.merchant_address, "payment.failed", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault || sub.owner_address,
    merchant_address: sub.merchant_address,
    reason: "insufficient_funds",
    required_usdc: formatUsdc(required),
    available_usdc: formatUsdc(available),
    grace_period_ends_at: gracePeriodEndsAt,
    status: "paused",
  });
}

async function onInsufficientAllowance(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, required, allowance } = parsed.args;

  console.log(`\n[EVENT] InsufficientAllowance #${id}`);
  console.log(`  Required:  ${formatUsdc(required)} USDC`);
  console.log(`  Allowance: ${formatUsdc(allowance)} USDC`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;

  await db.updateSubscriptionStatus(id.toString(), "paused", { pausedAt: new Date() });

  const mNameAllow = await getMerchantName(sub.merchant_address);
  const graceAllow = new Date(Date.now() + Number(sub.grace_period_days || 7) * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriber?.email) {
    const tpl = templates.paymentFailedAllowance({ name: subscriber.name, merchantName: mNameAllow });
    await sendEmail({ to: subscriber.email, subject: templates.subjects.paymentFailedAllowance(mNameAllow), ...tpl });
  }

  const merchantEmail = await getMerchantEmail(sub.merchant_address);
  if (merchantEmail) {
    const tpl = templates.merchantPaymentFailed({ requiredUsdc: (Number(required) / 1e6).toFixed(2), graceDate: graceAllow, reason: "insufficient_allowance", subscriptionId: id.toString() });
    await sendEmail({ to: merchantEmail, subject: templates.subjects.merchantPaymentFailed(), ...tpl });
  }

  await dispatchWebhook(sub.merchant_address, "payment.failed", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault || sub.owner_address,
    merchant_address: sub.merchant_address,
    reason: "insufficient_allowance",
    required_usdc: formatUsdc(required),
    current_allowance_usdc: formatUsdc(allowance),
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

  // Subscriber email (was missing)
  const mNamePaused = await getMerchantName(sub.merchant_address);
  const subscriberP = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriberP?.email) {
    const tpl = templates.subscriptionPaused({ name: subscriberP.name, merchantName: mNamePaused });
    await sendEmail({ to: subscriberP.email, subject: templates.subjects.subscriptionPaused(mNamePaused), ...tpl });
  }

  await dispatchWebhook(sub.merchant_address, "subscription.paused", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault || sub.owner_address,
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

  const mNameCancel   = await getMerchantName(sub.merchant_address);
  const subscriberC   = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriberC?.email) {
    const tpl = templates.subscriptionCancelled({ name: subscriberC.name, merchantName: mNameCancel });
    await sendEmail({ to: subscriberC.email, subject: templates.subjects.subscriptionCancelled(mNameCancel), ...tpl });
  }

  // Merchant: cancellation notification (was missing)
  const merchantEmailC = await getMerchantEmail(sub.merchant_address);
  if (merchantEmailC) {
    const tpl = templates.merchantCancellation({ subscriptionId: id.toString(), cancelledBy });
    await sendEmail({ to: merchantEmailC, subject: templates.subjects.merchantCancellation(), ...tpl });
  }

  await dispatchWebhook(sub.merchant_address, "subscription.cancelled", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault || sub.owner_address,
    cancelled_by: cancelledBy,
    status: "cancelled",
  });
}

async function onSubscriptionExpired(log, iface) {
  // FIX: added subscriber email notification (was missing entirely).
  // FIX: vault_address now uses safe_vault || owner_address fallback.

  const parsed = iface.parseLog(log);
  const { id, timestamp } = parsed.args;
  const date = new Date(Number(timestamp) * 1000).toISOString();
  console.log(`\n[EVENT] SubscriptionExpired #${id} at ${date}`);

  const sub = await db.getSubscription(id.toString());
  if (!sub) return;
  await db.updateSubscriptionStatus(id.toString(), "expired");

  const expDate    = new Date(Number(timestamp) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const mNameExp   = await getMerchantName(sub.merchant_address);

  const subscriberE = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriberE?.email) {
    const tpl = templates.subscriptionExpired({ name: subscriberE.name, merchantName: mNameExp, expiredDate: expDate });
    await sendEmail({ to: subscriberE.email, subject: templates.subjects.subscriptionExpired(mNameExp), ...tpl });
  }

  const merchantEmailE = await getMerchantEmail(sub.merchant_address);
  if (merchantEmailE) {
    const tpl = templates.merchantExpired({ subscriptionId: id.toString(), expiredDate: expDate });
    await sendEmail({ to: merchantEmailE, subject: templates.subjects.merchantExpired(), ...tpl });
  }

  await dispatchWebhook(sub.merchant_address, "subscription.expired", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault || sub.owner_address,
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

  // Subscriber + merchant emails (were missing)
  const mNameRes   = await getMerchantName(sub.merchant_address);
  const amtRes     = (Number(sub.amount) / 1e6).toFixed(2);
  const subscriberR = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriberR?.email) {
    const tpl = templates.subscriptionResumed({ name: subscriberR.name, merchantName: mNameRes, amountUsdc: amtRes, interval: sub.interval });
    await sendEmail({ to: subscriberR.email, subject: templates.subjects.subscriptionResumed(mNameRes), ...tpl });
  }
  const merchantEmailR = await getMerchantEmail(sub.merchant_address);
  if (merchantEmailR) {
    const tpl = templates.merchantResumed({ subscriptionId: id.toString(), amountUsdc: amtRes, interval: sub.interval });
    await sendEmail({ to: merchantEmailR, subject: templates.subjects.merchantResumed(), ...tpl });
  }

  await dispatchWebhook(sub.merchant_address, "subscription.resumed", {
    subscription_id: id.toString(),
    vault_address: sub.safe_vault || sub.owner_address,
    resumed_at: date,
    status: "active",
  });
}

// ─── Event Topic Map ──────────────────────────────────────────────────────────

const EVENT_HANDLERS = {
  "SubscriptionCreated":   onSubscriptionCreated,
  "PaymentExecuted":       onPaymentExecuted,
  "InsufficientFunds":     onInsufficientFunds,
  "InsufficientAllowance": onInsufficientAllowance,
  "SubscriptionPaused":    onSubscriptionPaused,
  "SubscriptionCancelled": onSubscriptionCancelled,
  "SubscriptionExpired":   onSubscriptionExpired,
  "SubscriptionResumed":   onSubscriptionResumed,
};

// ─── Polling Loop ─────────────────────────────────────────────────────────────

async function pollEvents(provider, iface, topicMap, lastBlock) {
  try {
    const currentBlock = await provider.getBlockNumber();
    const toBlock      = currentBlock - BLOCK_LAG;
    if (toBlock <= lastBlock) return lastBlock;

    const CHUNK_SIZE = 9; // Stay under Alchemy free tier 10-block limit
    let fromBlock    = lastBlock + 1;
    let processed    = lastBlock;

    while (fromBlock <= toBlock) {
      const chunkTo = Math.min(fromBlock + CHUNK_SIZE - 1, toBlock);

      const logs = await provider.getLogs({
        address: VAULT_ADDRESS,
        fromBlock,
        toBlock: chunkTo,
      });

      if (logs.length > 0) {
        console.log(`[NOTIFIER] Processing ${logs.length} event(s) from blocks ${fromBlock}–${chunkTo}`);
      }

      for (const log of logs) {
        const topic     = log.topics[0];
        const eventName = topicMap[topic];
        if (!eventName) continue;
        const handler = EVENT_HANDLERS[eventName];
        if (!handler) continue;
        try { await handler(log, iface); }
        catch (err) { console.error(`[NOTIFIER] Error processing ${eventName}:`, err.message); }
      }

      processed  = chunkTo;
      fromBlock  = chunkTo + 1;
    }

    return processed;
  } catch (err) {
    console.error(`[NOTIFIER] Poll error:`, err.message);
    return lastBlock;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await db.initSchema();

  console.log("=".repeat(60));
  console.log("  AuthOnce — Notification Backend v5.0");
  console.log("=".repeat(60));
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log(`  RPC:      ${RPC_URL}`);
  console.log(`  Network:  ${process.env.NETWORK === "mainnet" ? "Base Mainnet" : "Base Sepolia"}`);
  console.log(`  Basescan: ${BASESCAN_URL}`);
  console.log(`  Mode:     Polling every ${POLL_INTERVAL / 1000}s`);
  console.log(`  Email:    ${resend ? "Resend configured" : "NO RESEND_API_KEY"}`);
  console.log(`  DB:       ${process.env.DATABASE_URL ? "PostgreSQL connected" : "NO DATABASE_URL"}`);
  console.log("=".repeat(60));

  const iface    = new ethers.Interface(VAULT_ABI);
  const topicMap = {};
  for (const eventName of Object.keys(EVENT_HANDLERS)) {
    try {
      const topic = iface.getEvent(eventName).topicHash;
      topicMap[topic] = eventName;
    } catch { /* skip events not in ABI */ }
  }

  let provider  = new ethers.JsonRpcProvider(RPC_URL);
  let lastBlock = 41000000; // SubscriptionVault v4 deployment block

  try {
    lastBlock = (await provider.getBlockNumber()) - BLOCK_LAG;
    console.log(`\n  Starting from block ${lastBlock}\n`);
  } catch (err) {
    console.error("[NOTIFIER] Failed to get block number:", err.message);
    await new Promise(r => setTimeout(r, 10_000));
  }

  // Vault contract for proactive checks
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);

  // Proactive notification cycle counter (run every 5 poll cycles = ~2.5 min)
  let proactiveCycle = 0;

  const poll = async () => {
    try {
      lastBlock = await pollEvents(provider, iface, topicMap, lastBlock);

      // Run proactive checks every 5 cycles
      proactiveCycle++;
      if (proactiveCycle % 5 === 0) {
        const vaultWithProvider = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
        await checkUpcomingPayments(vaultWithProvider);
        await checkPriceChangeNotices(vaultWithProvider);
      }
    } catch (err) {
      console.error("[NOTIFIER] Unexpected error:", err.message);
    }
    setTimeout(poll, POLL_INTERVAL);
  };

  await poll();

  process.on("SIGINT", () => {
    console.log("\n  Shutting down notifier...");
    db.pool.end();
    process.exit(0);
  });
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
