// scripts/notifier.js
// =============================================================================
//  AuthOnce — Notification Backend v4
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

if (!process.env.VAULT_ADDRESS) {
  console.error("FATAL: VAULT_ADDRESS env var is not set — refusing to start with a stale fallback address");
  process.exit(1);
}
const VAULT_ADDRESS  = ethers.getAddress(process.env.VAULT_ADDRESS.trim());
const RPC_URL        = (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org").trim();
const POLL_INTERVAL  = 30_000; // 30 seconds
const BLOCK_LAG      = 2;      // Process blocks 2 behind head to avoid reorgs

// Env-driven Basescan base URL — set NETWORK=mainnet in Railway for mainnet
const BASESCAN_URL = process.env.NETWORK === "mainnet"
  ? "https://basescan.org"
  : "https://sepolia.basescan.org";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ─── v4 ABI ──────────────────────────────────────────────────────────────────
const VAULT_ABI = [
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address safeVault, address token, uint256 amount, uint256 introAmount, uint256 introPulls, uint8 interval, address guardian, uint256 trialEndsAt, uint256 gracePeriodDays, bool isContractVault)",
  "event PaymentExecuted(uint256 indexed id, address indexed token, uint256 amount, uint256 merchantReceived, uint256 fee, uint256 pullCount, uint256 timestamp)",
  "event InsufficientFunds(uint256 indexed id, address indexed token, uint256 required, uint256 available, uint256 pausedUntil)",
  "event InsufficientAllowance(uint256 indexed id, address indexed token, uint256 required, uint256 allowance)",
  "event SubscriptionPaused(uint256 indexed id, address pausedBy, string reason)",
  "event SubscriptionCancelled(uint256 indexed id, address cancelledBy)",
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

// Fetch fiat rates for all supported currencies in one call
// Returns { eur: 0.92, usd: 1.00, chf: 0.90, ... }
let _rateCache = { rates: null, ts: 0 };
async function fetchFiatRates() {
  const now = Date.now();
  if (_rateCache.rates && now - _rateCache.ts < 300_000) return _rateCache.rates;
  try {
    const vs  = "eur,usd,chf,gbp,brl,cad,aud,sek,nok,dkk,sgd,hkd,inr,jpy,krw";
    const res  = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=${vs}`);
    const data = await res.json();
    const rates = data?.["usd-coin"];
    if (rates && Object.keys(rates).length > 0) {
      _rateCache = { rates, ts: now };
      return rates;
    }
  } catch (err) {
    console.warn("[NOTIFIER] Could not fetch fiat rates:", err.message);
  }
  return _rateCache.rates || { eur: 0.92, usd: 1.00, chf: 0.90 };
}

// Backward compat
async function fetchEurRate() {
  const rates = await fetchFiatRates();
  return rates?.eur || null;
}

// Resolve token symbol from address
function resolveTokenSymbol(tokenAddress) {
  const map = {
    "0x036cbd53842c5426634e7929541ec2318f3dcf7e": "USDC", // Base Sepolia
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC", // Base Mainnet
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT",
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": "DAI",
    "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": "EURC",
    "0x4200000000000000000000000000000000000006": "WETH",
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": "cbBTC",
  };
  return map[tokenAddress?.toLowerCase()] || "USDC";
}

function formatUsdc(raw) {
  return (BigInt(raw.toString()) / BigInt(10 ** Number(USDC_DECIMALS))).toString();
}

async function sendEmail({ to, subject, html, text }) {
  if (!resend) { console.warn("[NOTIFIER] RESEND_API_KEY not set — skipping email"); return; }
  try {
    await resend.emails.send({ from: "AuthOnce <noreply@authonce.io>", replyTo: "support@authonce.io", to, subject, html, text });
    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err.message);
  }
}

// ─── Push Protocol (wallet notifications) ────────────────────────────────────
// Uses Push Protocol staging for testnet, mainnet channel for production.
// Requires PUSH_CHANNEL_PRIVATE_KEY env var.

let _pushAPI = null;
async function getPushAPI() {
  if (_pushAPI) return _pushAPI;
  if (!process.env.PUSH_CHANNEL_PRIVATE_KEY) return null;
  try {
    const { PushAPI, CONSTANTS } = await import("@pushprotocol/restapi");
    const { ethers: _ethers } = await import("ethers");
    const signer = new _ethers.Wallet(process.env.PUSH_CHANNEL_PRIVATE_KEY);
    _pushAPI = await PushAPI.initialize(signer, {
      env: process.env.NETWORK === "mainnet" ? CONSTANTS.ENV.PROD : CONSTANTS.ENV.STAGING,
    });
    console.log("[PUSH] Push Protocol API initialized");
    return _pushAPI;
  } catch (err) {
    console.warn("[PUSH] Push Protocol unavailable:", err.message);
    return null;
  }
}

async function sendPushNotification({ walletAddress, title, body, cta }) {
  const pushAPI = await getPushAPI();
  if (!pushAPI) { console.warn("[PUSH] No Push API — skipping wallet notification"); return; }
  try {
    await pushAPI.channel.send([`eip155:1:${walletAddress}`], {
      notification: { title, body },
      payload: { title, body, cta: cta || "https://authonce.io/my-subscriptions", img: "" },
      channel: `eip155:1:${process.env.PUSH_CHANNEL_ADDRESS || ""}`,
    });
    console.log(`[PUSH] Sent notification to ${walletAddress}: ${title}`);
  } catch (err) {
    console.error(`[PUSH] Failed to send to ${walletAddress}:`, err.message);
  }
}

// ─── AI Agent webhook notification ───────────────────────────────────────────
async function sendAgentWebhook({ webhookUrl, event, payload }) {
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AuthOnce-Event": event },
      body: JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[AGENT_WEBHOOK] ${event} → ${webhookUrl} [${res.status}]`);
  } catch (err) {
    console.error(`[AGENT_WEBHOOK] Failed to deliver ${event} to ${webhookUrl}:`, err.message);
  }
}

// ─── Smart subscriber notification routing ────────────────────────────────────
// Priority: AI agent webhook → email → Push Protocol wallet notification
async function notifySubscriber({ sub, title, emailHtml, emailText, emailSubject, pushBody, ctaUrl }) {
  const ownerAddress = sub.owner_address;

  // 1. AI agent — webhook takes priority
  if (sub.is_contract_vault && sub.subscriber_webhook_url) {
    await sendAgentWebhook({
      webhookUrl: sub.subscriber_webhook_url,
      event: "payment.alert",
      payload: { subscription_id: sub.id?.toString(), title, body: pushBody, vault_address: sub.safe_vault || ownerAddress },
    });
    return;
  }

  // 2. Email — if subscriber provided one
  const email = sub.subscriber_email || null;
  if (email) {
    await sendEmail({ to: email, subject: emailSubject, html: emailHtml, text: emailText });
    return;
  }

  // 3. Push Protocol — fallback for crypto-native subscribers without email
  if (ownerAddress) {
    await sendPushNotification({ walletAddress: ownerAddress, title, body: pushBody, cta: ctaUrl || "https://authonce.io/my-subscriptions" });
  }
}

// Get subscriber email for a vault address (legacy — checks subscribers table)
async function getSubscriberEmail(vaultAddress) {
  try {
    // First check subscription record for directly provided email
    const subRes = await db.query(
      "SELECT subscriber_email, owner_address FROM subscriptions WHERE safe_vault = $1 OR owner_address = $1 LIMIT 1",
      [vaultAddress.toLowerCase()]
    );
    if (subRes.rows[0]?.subscriber_email) {
      return { email: subRes.rows[0].subscriber_email, name: null };
    }
    // Fallback to subscribers table (Google OAuth users)
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
    `SELECT s.*, p.name AS product_name
     FROM subscriptions s
     LEFT JOIN products p ON p.merchant_address = s.merchant_address AND p.slug = s.product_slug
     WHERE s.status = 'active'`,
    []
  );

  for (const sub of result.rows) {
    try {
      // Read on-chain subscription to get latest state
      const onchain = await vault.subscriptions(BigInt(sub.id));
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
        const reminderTpl = templates.paymentReminder({ name: subscriber.name, merchantName, amountUsdc, nextDate, daysUntil });
        await sendEmail({
          to: subscriber.email,
          subject: templates.subjects.paymentReminder(amountUsdc, daysUntil),
          ...reminderTpl,
        });
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
    `SELECT s.*, p.name AS product_name
     FROM subscriptions s
     LEFT JOIN products p ON p.merchant_address = s.merchant_address AND p.slug = s.product_slug
     WHERE s.status = 'active'`,
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
        const priceTpl = templates.priceChangeNotice({ name: subscriber.name, merchantName, amountUsdc, expiryDate, daysUntil });
        await sendEmail({ to: subscriber.email, subject: templates.subjects.priceChangeNotice(merchantName, expiryDate), ...priceTpl });
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

  // product_slug is linked via POST /api/subscriptions/link from PayPage after confirmation
  // notifier preserves existing product_slug if already set (COALESCE in upsertSubscription)
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

  // Email subscriber (fiat only — crypto-native subscribers are anonymous)
  const subscriber = await getSubscriberEmail(safeVault);
  if (subscriber?.email) {
    const merchantName = await getMerchantName(merchant);
    const amountUsdc   = (Number(amount) / 1e6).toFixed(2);
    const confirmedTpl2 = templates.subscriptionConfirmed({ name: subscriber.name, merchantName, amountUsdc, interval: INTERVAL_NAME[interval], trialDays: 0, gracePeriodDays: 7 });
    await sendEmail({ to: subscriber.email, subject: templates.subjects.subscriptionConfirmed(merchantName), ...confirmedTpl2 });
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

  // Fetch all fiat rates in one call — used for tax records
  const fiatRates            = await fetchFiatRates();
  const eurRate              = fiatRates?.eur || null;
  const chfRate              = fiatRates?.chf || null;
  const merchantReceivedUsdc = parseFloat(formatUsdc(merchantReceived));
  const amountUsdc           = parseFloat(formatUsdc(amount));
  const feeUsdc              = parseFloat(formatUsdc(fee));
  const merchantReceivedEur  = eurRate ? (merchantReceivedUsdc * eurRate).toFixed(2) : null;
  const merchantReceivedChf  = chfRate ? (merchantReceivedUsdc * chfRate).toFixed(2) : null;
  const protocolFeeEur       = eurRate ? (feeUsdc * eurRate).toFixed(2) : null;
  const protocolFeeChf       = chfRate ? (feeUsdc * chfRate).toFixed(2) : null;

  // Get merchant's preferred fiat currency for their tax export
  const merchant             = await db.getMerchant(sub.merchant_address);
  const merchantCurrency     = merchant?.fiat_currency || "eur";
  const merchantFiatRate     = fiatRates?.[merchantCurrency] || eurRate;
  const merchantFiatAmount   = merchantFiatRate ? (merchantReceivedUsdc * merchantFiatRate).toFixed(2) : null;

  // Resolve token symbol from on-chain address
  const tokenAddress = sub.token_address || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const tokenSymbol  = resolveTokenSymbol(tokenAddress);

  if (eurRate) console.log(`  EUR rate: ${eurRate} → merchant received €${merchantReceivedEur} | CHF ${merchantReceivedChf}`);

  await db.insertPayment({
    subscriptionId:     id.toString(),
    merchantAddress:    sub.merchant_address,
    ownerAddress:       sub.owner_address,
    amount:             amount.toString(),
    merchantReceived:   merchantReceived.toString(),
    fee:                fee.toString(),
    txHash:             log.transactionHash,
    blockNumber:        Number(log.blockNumber),
    // Token data (v5 multi-token)
    tokenAddress,
    tokenSymbol,
    // EUR fiat data
    eurRate:            eurRate ? eurRate.toString() : null,
    merchantReceivedEur,
    // CHF fiat data (AuthOnce Swiss tax)
    chfRate:            chfRate ? chfRate.toString() : null,
    chfAmount:          merchantReceivedChf,
    // Merchant preferred currency
    fiatCurrency:       merchantCurrency,
    fiatRate:           merchantFiatRate ? merchantFiatRate.toString() : null,
    fiatAmount:         merchantFiatAmount,
    // Protocol fee in fiat (AuthOnce tax records)
    protocolFeeUsdc:    feeUsdc.toFixed(6),
    protocolFeeEur:     protocolFeeEur,
    protocolFeeChf:     protocolFeeChf,
  });

  await db.updateSubscriptionStatus(id.toString(), "active", {
    lastPulledAt: new Date(Number(timestamp) * 1000),
  });

  // Email subscriber receipt
  const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriber?.email) {
    const merchantName = await getMerchantName(sub.merchant_address);
    const amountUsdc   = (Number(amount) / 1e6).toFixed(2);
    const receiptDate = new Date(Number(timestamp) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const receiptTpl  = templates.paymentReceipt({ name: subscriber.name, merchantName, amountUsdc, date: receiptDate, txHash: log.transactionHash, basescanUrl: BASESCAN_URL });
    await sendEmail({ to: subscriber.email, subject: templates.subjects.paymentReceipt(amountUsdc, merchantName, tokenSymbol), ...receiptTpl });
  }

  // Email merchant receipt
  const merchantEmail = await getMerchantEmail(sub.merchant_address);
  if (merchantEmail) {
    const merchantPayDate = new Date(Number(timestamp) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const merchantPayTpl  = templates.merchantPaymentReceived({
      amountUsdc: amountUsdc.toString(), merchantReceivedUsdc: merchantReceivedUsdc.toString(),
      merchantReceivedEur: merchantFiatAmount || merchantReceivedEur,
      date: merchantPayDate, subscriptionId: id.toString(),
      txHash: log.transactionHash, basescanUrl: BASESCAN_URL,
      productName: sub.product_name || null, subscriberWallet: sub.owner_address || null,
      subscriberEmail: subscriber?.email || null, token: tokenSymbol,
      fiatCurrency: merchantCurrency.toUpperCase(),
    });
    await sendEmail({ to: merchantEmail, subject: templates.subjects.merchantPaymentReceived(merchantReceivedUsdc, tokenSymbol), ...merchantPayTpl });
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

  // Notify subscriber — smart routing (AI agent webhook → email → Push Protocol)
  const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  const merchantName  = await getMerchantName(sub.merchant_address);
  const requiredUsdc  = (Number(required) / 1e6).toFixed(2);
  const availableUsdc = (Number(available) / 1e6).toFixed(2);
  const graceDate     = new Date(Number(pausedUntil) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const fundsTpl2 = templates.paymentFailedFunds({ name: subscriber?.name, merchantName, requiredUsdc, availableUsdc, graceDate });
  await notifySubscriber({
    sub,
    title: `Payment failed — top up by ${graceDate}`,
    emailSubject: templates.subjects.paymentFailedFunds(merchantName),
    emailHtml: fundsTpl2.html,
    emailText: fundsTpl2.text || `Payment of $${requiredUsdc} USDC to ${merchantName} failed. Top up before ${graceDate} to keep your subscription.`,
    pushBody: `Your ${merchantName} subscription payment of $${requiredUsdc} failed. Top up your wallet by ${graceDate} to stay subscribed.`,
    ctaUrl: "https://authonce.io/my-subscriptions",
  });

  // Email merchant
  const merchantEmail = await getMerchantEmail(sub.merchant_address);
  if (merchantEmail) {
    const fundsMerchantTpl2 = templates.merchantPaymentFailed({ requiredUsdc, graceDate, reason: "insufficient_funds", subscriptionId: id.toString(), productName: sub.product_name || null, subscriberWallet: sub.owner_address || null, subscriberEmail: subscriber?.email || sub.subscriber_email || null });
    await sendEmail({ to: merchantEmail, subject: templates.subjects.merchantPaymentFailed(), ...fundsMerchantTpl2 });
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

  // Email subscriber
  const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriber?.email) {
    const merchantName = await getMerchantName(sub.merchant_address);
    const allowTpl2 = templates.paymentFailedAllowance({ name: subscriber.name, merchantName });
    await sendEmail({ to: subscriber.email, subject: templates.subjects.paymentFailedAllowance(merchantName), ...allowTpl2 });
    if (false) { await sendEmail({ to: subscriber.email, subject: "", html: `
        <p>REPLACED</p>
        <p>REPLACED</p>
        <p>REPLACED</p>
        <hr/>
        <p style="font-size:12px;color:#94a3b8;">AuthOnce · Non-custodial subscription protocol</p>
      `,
      text: `Your USDC approval for ${merchantName} has expired. Re-approve at authonce.io/my-subscriptions.`,
    }); }
  }

  // Email merchant
  const merchantEmail = await getMerchantEmail(sub.merchant_address);
  if (merchantEmail) {
    const allowMerchantTpl2 = templates.merchantPaymentFailed({ requiredUsdc: sub.amount ? (Number(sub.amount) / 1e6).toFixed(2) : "0.00", graceDate: "see dashboard", reason: "insufficient_allowance", subscriptionId: id.toString(), productName: sub.product_name || null, subscriberWallet: sub.owner_address || null, subscriberEmail: null });
    await sendEmail({ to: merchantEmail, subject: templates.subjects.merchantPaymentFailed(), ...allowMerchantTpl2 });
    if (false) { await sendEmail({ to: merchantEmail, subject: "", html: `
        <p>REPLACED</p>
        <p>REPLACED</p>
        <hr/>
        <p style="font-size:12px;color:#94a3b8;">AuthOnce · <a href="https://authonce.io">authonce.io</a></p>
      `,
      text: `A subscriber's USDC approval expired. Subscription paused. Subscriber has been notified.`,
    }); }
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

  // Email subscriber confirmation
  const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  if (subscriber?.email) {
    const merchantName = await getMerchantName(sub.merchant_address);
    const cancelledTpl = templates.subscriptionCancelled({ name: subscriber.name, merchantName });
    await sendEmail({ to: subscriber.email, subject: templates.subjects.subscriptionCancelled(merchantName), ...cancelledTpl });
    // REPLACED_CANCEL_SUB
    if (false) { await sendEmail({ to: subscriber.email, subject: "", html: `
        <p>REPLACED</p>
        <hr/>
        <p style="font-size:12px;color:#94a3b8;">AuthOnce · Non-custodial subscription protocol</p>
      `,
      text: `Your ${merchantName} subscription has been cancelled. No further payments will be collected.`,
    }); }
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

  // Notify subscriber — smart routing (AI agent webhook → email → Push Protocol)
  const subscriber = await getSubscriberEmail(sub.safe_vault || sub.owner_address);
  const merchantName = await getMerchantName(sub.merchant_address);
  const expiredDate  = new Date(Number(timestamp) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const expiredSubTpl = templates.subscriptionExpired({ name: subscriber?.name, merchantName, expiredDate });
  await notifySubscriber({
    sub,
    title: `Your ${merchantName} subscription has expired`,
    emailSubject: templates.subjects.subscriptionExpired(merchantName),
    emailHtml: expiredSubTpl.html,
    emailText: expiredSubTpl.text || `Your ${merchantName} subscription expired on ${expiredDate}. Resubscribe at authonce.io/my-subscriptions.`,
    pushBody: `Your ${merchantName} subscription expired on ${expiredDate}. Resubscribe to restore access.`,
    ctaUrl: "https://authonce.io/my-subscriptions",
  });

  // Email merchant
  const merchantEmail = await getMerchantEmail(sub.merchant_address);
  if (merchantEmail) {
    const expiredMerchantTpl = templates.merchantExpired({ subscriptionId: id.toString(), expiredDate, productName: sub.product_name || null, subscriberWallet: sub.owner_address || null, subscriberEmail: subscriber?.email || sub.subscriber_email || null });
    await sendEmail({ to: merchantEmail, subject: templates.subjects.merchantExpired(), ...expiredMerchantTpl });
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

// ─── Block checkpoint persistence ───────────────────────────────────────────
// Without this, lastBlock only ever lives in memory — every restart (deploy,
// crash, platform maintenance) resets it to "now," silently skipping any
// SubscriptionCreated/PaymentExecuted/etc. events that happened in the gap.
// This is what caused subscription id 2 to succeed on-chain but never reach
// Postgres. One row, one key ("lastBlock"), updated after every successful
// poll cycle.
async function ensureCheckpointTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notifier_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadLastBlock(fallback) {
  try {
    const result = await db.query(`SELECT value FROM notifier_state WHERE key = 'lastBlock'`);
    if (result.rows.length > 0) {
      const saved = parseInt(result.rows[0].value, 10);
      if (Number.isFinite(saved)) return saved;
    }
  } catch (err) {
    console.error("[NOTIFIER] Failed to load checkpoint, using fallback:", err.message);
  }
  return fallback;
}

async function saveLastBlock(block) {
  try {
    await db.query(
      `INSERT INTO notifier_state (key, value, updated_at) VALUES ('lastBlock', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [String(block)]
    );
  } catch (err) {
    console.error("[NOTIFIER] Failed to save checkpoint:", err.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await db.initSchema();
  await ensureCheckpointTable();

  console.log("=".repeat(60));
  console.log("  AuthOnce — Notification Backend v4.2");
  console.log("=".repeat(60));
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log(`  RPC:      ${RPC_URL}`);
  console.log(`  Network:  ${process.env.NETWORK === "mainnet" ? "Base Mainnet" : "Base Sepolia"}`);
  console.log(`  Basescan: ${BASESCAN_URL}`);
  console.log(`  Mode:     Polling every ${POLL_INTERVAL / 1000}s`);
  console.log(`  Email:    ${resend ? "Resend configured" : "NO RESEND_API_KEY"}`);
  console.log(`  Push:     ${process.env.PUSH_CHANNEL_PRIVATE_KEY ? "Push Protocol enabled" : "No PUSH_CHANNEL_PRIVATE_KEY (email/webhook only)"}`);
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

  // Fallback only used if both the checkpoint AND the live block-number
  // fetch fail — deliberately conservative (deployment block), not "now."
  let currentBlockNow;
  try {
    currentBlockNow = (await provider.getBlockNumber()) - BLOCK_LAG;
  } catch (err) {
    console.error("[NOTIFIER] Failed to get block number:", err.message);
    await new Promise(r => setTimeout(r, 10_000));
    currentBlockNow = 41000000; // SubscriptionVault v4 deployment block
  }

  let lastBlock = await loadLastBlock(currentBlockNow);
  const resumedFromCheckpoint = lastBlock !== currentBlockNow;
  console.log(
    resumedFromCheckpoint
      ? `\n  Resumed from saved checkpoint: block ${lastBlock}\n`
      : `\n  No checkpoint found — starting from block ${lastBlock}\n`
  );

  // Vault contract for proactive checks
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);

  // Proactive notification cycle counter (run every 5 poll cycles = ~2.5 min)
  let proactiveCycle = 0;

  const poll = async () => {
    try {
      const newLastBlock = await pollEvents(provider, iface, topicMap, lastBlock);
      if (newLastBlock !== lastBlock) {
        lastBlock = newLastBlock;
        await saveLastBlock(lastBlock);
      }

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
