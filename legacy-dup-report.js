// Read-only diagnostic script. Does NOT modify any data.
// Requires DATABASE_URL to be set in the environment before running.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in this shell. Set it first, then re-run.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const out = {};

  out.subscriptions_columns = (await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' ORDER BY ordinal_position
  `)).rows.map(r => r.column_name);

  out.legacy_subscriptions_count = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM subscriptions WHERE vault_address = 'legacy-unknown-pre-v9'`
  )).rows[0].n;

  out.legacy_payments_count = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM payments WHERE vault_address = 'legacy-unknown-pre-v9'`
  )).rows[0].n;

  out.legacy_subscriptions_all = (await pool.query(`
    SELECT id, owner_address, merchant_address, tx_hash, block_number, created_at
    FROM subscriptions WHERE vault_address = 'legacy-unknown-pre-v9'
    ORDER BY id, created_at
  `)).rows;

  out.current_vault_ids_overlap = (await pool.query(`
    SELECT id, vault_address, COUNT(*)::int AS n
    FROM subscriptions
    WHERE id::int <= 11 AND vault_address <> 'legacy-unknown-pre-v9'
    GROUP BY id, vault_address
    ORDER BY id
  `)).rows;

  out.legacy_payments_all = (await pool.query(`
    SELECT id, subscription_id, merchant_address, owner_address, amount, tx_hash, block_number, executed_at
    FROM payments WHERE vault_address = 'legacy-unknown-pre-v9'
    ORDER BY subscription_id, executed_at
  `)).rows;

  console.log(JSON.stringify(out, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  await pool.end();
}

main().catch(e => {
  console.error('Query failed:', e.message);
  process.exit(1);
});
