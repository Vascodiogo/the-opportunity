/**
 * backfill-stress-test.js
 * One-shot: scan blocks 42838400 → current for SubscriptionCreated events on
 * SubscriptionVault v7 and insert any missing rows into the DB.
 *
 * Targets stress test subscriptions IDs 0-4 created June 14 2026.
 *
 * Handler logic mirrors notifier.js onSubscriptionCreated exactly.
 * ABI uses the fixed v6 13-param SubscriptionCreated signature.
 */

require("dotenv").config({ path: ".env.stress-test" });

const { ethers }          = require("ethers");
const { Resend }          = require("resend");
const db                  = require("./scripts/db");
const { dispatchWebhook } = require("./scripts/webhook");

// ── Config ────────────────────────────────────────────────────────────────────

// Hardcoded unconditionally — this script targets v7 specifically and must not
// be redirected by a stale VAULT_ADDRESS env var from a prior session.
const VAULT_ADDRESS = "0xeb068B47731261F7B4A5ae8535686D67D7f72321";
const RPC_URL       = process.env.BASE_SEPOLIA_RPC_URL;
const START_BLOCK   = 42838400; // v7 deploy block — stress test IDs 0-4 created here
const CHUNK_SIZE    = 9; // Alchemy free tier: stay under 10-block getLogs limit
const BLOCK_LAG     = 2;

if (!RPC_URL) {
  console.error("FATAL: BASE_SEPOLIA_RPC_URL not set");
  process.exit(1);
}

// ── v6 ABI — fixed 13-param SubscriptionCreated (matches notifier.js) ─────────

const VAULT_ABI = [
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address safeVault, address token, uint256 amount, uint256 introAmount, uint256 introPulls, uint8 interval, address guardian, uint256 trialEndsAt, uint256 gracePeriodDays, bool isContractVault)",
];

// ── Helpers (mirrored from notifier.js) ──────────────────────────────────────

const resend        = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const INTERVAL_NAME = ["weekly", "monthly", "yearly"];

function formatUsdc(raw) {
  return (BigInt(raw.toString()) / BigInt(1e6)).toString();
}

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function sendEmail({ to, subject, html, text }) {
  if (!resend) { return; }
  try {
    await resend.emails.send({ from: "AuthOnce <notifications@authonce.io>", to, subject, html, text });
    console.log(`    [EMAIL] Sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`    [EMAIL] Failed:`, err.message);
  }
}

async function getSubscriberEmail(vaultAddress) {
  try {
    const res = await db.query(
      "SELECT email, name FROM subscribers WHERE wallet_address = $1",
      [vaultAddress.toLowerCase()]
    );
    return res.rows[0] || null;
  } catch { return null; }
}

async function getMerchantName(merchantAddress) {
  try {
    const merchant = await db.getMerchant(merchantAddress.toLowerCase());
    return merchant?.business_name || shortAddr(merchantAddress);
  } catch { return shortAddr(merchantAddress); }
}

// ── Handler — mirrors notifier.js onSubscriptionCreated exactly ───────────────

async function onSubscriptionCreated(log, iface) {
  const parsed = iface.parseLog(log);
  const { id, owner, merchant, safeVault, amount, introAmount, introPulls, interval, guardian } = parsed.args;

  console.log(`  #${id} — block ${log.blockNumber} — ${formatUsdc(amount)} USDC/${INTERVAL_NAME[interval]}`);
  console.log(`    owner: ${owner}  merchant: ${merchant}`);

  await db.upsertSubscription({
    id:              id.toString(),
    ownerAddress:    owner,
    merchantAddress: merchant,
    safeVault,
    amount:          amount.toString(),
    interval:        INTERVAL_NAME[interval],
    status:          "active",
    txHash:          log.transactionHash,
    blockNumber:     Number(log.blockNumber),
    guardianAddress: guardian === ethers.ZeroAddress ? null : guardian,
  });
  console.log(`    DB: upserted`);

  const subscriber = await getSubscriberEmail(safeVault);
  if (subscriber?.email) {
    const merchantName = await getMerchantName(merchant);
    const amountUsdc   = (Number(amount) / 1e6).toFixed(2);
    await sendEmail({
      to:      subscriber.email,
      subject: `Subscription confirmed — ${merchantName}`,
      html: `
        <p>Hi ${subscriber.name || "there"},</p>
        <p>Your subscription to <strong>${merchantName}</strong> is now active.</p>
        <p>Amount: <strong>$${amountUsdc} USDC / ${INTERVAL_NAME[interval]}</strong></p>
        <p>Manage your subscription at <a href="https://authonce.io/my-subscriptions">authonce.io/my-subscriptions</a>.</p>
        <hr/>
        <p style="font-size:12px;color:#94a3b8;">AuthOnce · Non-custodial subscription protocol</p>
      `,
      text: `Your ${merchantName} subscription of $${amountUsdc} USDC/${INTERVAL_NAME[interval]} is now active.`,
    });
  }

  await dispatchWebhook(merchant, "subscription.created", {
    subscription_id:   id.toString(),
    vault_address:     safeVault,
    owner_address:     owner,
    merchant_address:  merchant,
    amount_usdc:       formatUsdc(amount),
    intro_amount_usdc: introAmount > 0n ? formatUsdc(introAmount) : null,
    intro_pulls:       Number(introPulls),
    interval:          INTERVAL_NAME[interval],
    guardian:          guardian === ethers.ZeroAddress ? null : guardian,
    tx_hash:           log.transactionHash,
    status:            "active",
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await db.initSchema();

  const provider   = new ethers.JsonRpcProvider(RPC_URL);
  const iface      = new ethers.Interface(VAULT_ABI);
  const eventTopic = iface.getEvent("SubscriptionCreated").topicHash;

  const currentBlock = await provider.getBlockNumber();
  const toBlock      = currentBlock - BLOCK_LAG;

  console.log("=".repeat(60));
  console.log("  AuthOnce — SubscriptionCreated backfill");
  console.log("=".repeat(60));
  console.log(`  Vault:  ${VAULT_ADDRESS}`);
  console.log(`  Blocks: ${START_BLOCK} → ${toBlock} (${toBlock - START_BLOCK + 1} blocks)`);
  console.log(`  Topic:  ${eventTopic}`);
  console.log("=".repeat(60) + "\n");

  let fromBlock = START_BLOCK;
  let found     = 0;

  while (fromBlock <= toBlock) {
    const chunkTo = Math.min(fromBlock + CHUNK_SIZE - 1, toBlock);

    const logs = await provider.getLogs({
      address:   VAULT_ADDRESS,
      topics:    [eventTopic],
      fromBlock,
      toBlock:   chunkTo,
    });

    if (logs.length > 0) {
      console.log(`Blocks ${fromBlock}–${chunkTo}: ${logs.length} event(s)`);
      for (const log of logs) {
        try {
          await onSubscriptionCreated(log, iface);
          found++;
        } catch (err) {
          console.error(`  ERROR at block ${log.blockNumber}:`, err.message);
        }
      }
    }

    fromBlock = chunkTo + 1;
    await new Promise(r => setTimeout(r, 150)); // avoid Alchemy free-tier CU/s limit
  }

  console.log(`\nDone. ${found} subscription(s) upserted into DB.`);
  await db.pool.end();
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
