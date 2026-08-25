// scripts/cleanup-custodial-wallets.js
// One-off cleanup — custody-gap fix, 2026-08-25.
//
// Backend code no longer generates or reads subscriber private keys
// (see api.js: generateSubscriberWallet() removed, /api/subscriber/cancel
// no longer signs on a subscriber's behalf). This script clears any
// wallet_address / wallet_private_key values already sitting in the
// subscribers table from before that fix, so nothing derived from the old
// custodial path remains stored anywhere.
//
// Safe to run any number of times — it only touches rows that still have
// a wallet_private_key set. Testnet only; no real transactions are affected,
// this only clears a derived-address/encrypted-key pair, never anything
// on-chain.
//
// Run with: node scripts/cleanup-custodial-wallets.js
// (uses the same DATABASE_URL / connection config as db.js — run it
// wherever that's already configured, e.g. locally with your .env, or via
// `railway run node scripts/cleanup-custodial-wallets.js`)

const db = require("./db.js");

async function main() {
  const { rows } = await db.query(
    "SELECT id, email, wallet_address FROM subscribers WHERE wallet_private_key IS NOT NULL"
  );

  if (rows.length === 0) {
    console.log("Nothing to clean up — no subscriber rows have a stored wallet_private_key.");
    await db.pool.end();
    return;
  }

  console.log(`Found ${rows.length} subscriber row(s) with a stored custodial key:`);
  rows.forEach(r => console.log(`  - id=${r.id} email=${r.email} wallet_address=${r.wallet_address}`));

  const result = await db.query(
    "UPDATE subscribers SET wallet_address = NULL, wallet_private_key = NULL WHERE wallet_private_key IS NOT NULL RETURNING id"
  );

  console.log(`Cleared wallet_address and wallet_private_key on ${result.rows.length} row(s).`);
  console.log("Note: this does not touch any on-chain subscription. If any of these subscribers have active on-chain subscriptions, they now cancel those themselves by connecting their wallet in the app — same as any non-custodial subscriber.");

  await db.pool.end();
}

main().catch(err => {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
});
