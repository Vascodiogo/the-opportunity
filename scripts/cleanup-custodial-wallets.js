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
// This script uses its OWN dedicated pg Pool with a generous connection
// timeout, instead of db.js's shared pool. db.js's pool is intentionally
// tuned tight (connectionTimeoutMillis: 2000) for the live production API,
// where a hanging request is bad — that's correct there and wrong here.
// A one-off manual script over the public Railway proxy needs more time
// for the full TCP+SSL+Postgres handshake.
//
// Run with:
//   $env:DATABASE_URL="<DATABASE_PUBLIC_URL from railway variables --service Postgres>"
//   node scripts/cleanup-custodial-wallets.js

const { Pool } = require("pg");

console.log(`DATABASE_URL is ${process.env.DATABASE_URL ? "set (" + process.env.DATABASE_URL.length + " chars)" : "NOT SET"}.`);
console.log(`NODE_ENV is "${process.env.NODE_ENV || "(unset)"}".`);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Set it to the DATABASE_PUBLIC_URL value from `railway variables --service Postgres` first.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Public Railway proxy uses a managed cert — same relaxed SSL check db.js
  // uses in production. Always on here since this script only ever talks to
  // the public proxy, never localhost.
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 20000,
  query_timeout: 20000,
});

async function main() {
  console.log("Connecting (up to 20s timeout)...");

  const { rows } = await pool.query(
    "SELECT id, email, wallet_address FROM subscribers WHERE wallet_private_key IS NOT NULL"
  );

  if (rows.length === 0) {
    console.log("Nothing to clean up — no subscriber rows have a stored wallet_private_key.");
    await pool.end();
    return;
  }

  console.log(`Found ${rows.length} subscriber row(s) with a stored custodial key:`);
  rows.forEach(r => console.log(`  - id=${r.id} email=${r.email} wallet_address=${r.wallet_address}`));

  const result = await pool.query(
    "UPDATE subscribers SET wallet_address = NULL, wallet_private_key = NULL WHERE wallet_private_key IS NOT NULL RETURNING id"
  );

  console.log(`Cleared wallet_address and wallet_private_key on ${result.rows.length} row(s).`);
  console.log("Note: this does not touch any on-chain subscription. If any of these subscribers have active on-chain subscriptions, they now cancel those themselves by connecting their wallet in the app — same as any non-custodial subscriber.");

  await pool.end();
}

main().catch(err => {
  console.error("Cleanup failed.");
  console.error("err.message:", err.message || "(empty)");
  console.error("err.code:", err.code || "(none)");
  // AggregateError (common with Node's DNS/network resolution) has an
  // empty top-level .message but real detail nested in .errors — surface it.
  if (Array.isArray(err.errors) && err.errors.length) {
    console.error("Nested errors:");
    err.errors.forEach((e, i) => console.error(`  [${i}]`, e.message || e));
  }
  console.error("Full error object:", err);
  process.exit(1);
});
