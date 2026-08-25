// scripts/db.js
// =============================================================================
//  AuthOnce — Database Layer
//
//  PostgreSQL connection + schema creation + helper functions
//  Used by: notifier.js, keeper.js, api.js
//
//  Tables:
//    subscriptions  — indexed from on-chain SubscriptionCreated events
//    payments       — indexed from on-chain PaymentExecuted events
//    merchants      — off-chain merchant profiles, webhook URLs, settlement prefs
//    webhooks       — webhook delivery log (success/failure tracking)
//    subscribers    — Google OAuth subscriber accounts
//    products       — merchant subscription products (migrated from localStorage)
//    data_consents  — DataOnce Phase 2: subscriber data access consent registry
// =============================================================================

require("dotenv").config();
const { Pool } = require("pg");
const crypto = require("crypto");

// -----------------------------------------------------------------------------
// Connection pool
// -----------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

// Simple query wrapper
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 80));
    }
    return res;
  } catch (err) {
    console.error("[DB] Query error:", err.message, "\nQuery:", text.substring(0, 120));
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Encryption helpers (AES-256-GCM) for sensitive merchant data (IBAN etc.)
// -----------------------------------------------------------------------------

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, "hex")
  : crypto.randomBytes(32); // fallback for dev — set ENCRYPTION_KEY in .env for prod!

function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// -----------------------------------------------------------------------------
// Schema — create all tables if they don't exist
// -----------------------------------------------------------------------------

async function initSchema() {
  console.log("[DB] Initialising schema...");

  // Merchant vanity handles
  await query(`
    CREATE TABLE IF NOT EXISTS merchant_handles (
      handle          VARCHAR(30) PRIMARY KEY,
      wallet_address  VARCHAR(42) NOT NULL UNIQUE,
      created_at      TIMESTAMP DEFAULT NOW()
    )
  `);

  // Merchants — off-chain profiles
  await query(`
    CREATE TABLE IF NOT EXISTS merchants (
      wallet_address        TEXT PRIMARY KEY,
      business_name         TEXT,
      email                 TEXT,
      webhook_url           TEXT,
      webhook_secret        TEXT,
      settlement_preference TEXT NOT NULL DEFAULT 'usdc',
      iban_encrypted        TEXT,
      bic                   TEXT,
      account_holder        TEXT,
      country_code          TEXT DEFAULT 'PT',
      vat_number            TEXT,
      billing_address       TEXT,
      approved_at           TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Subscriptions — indexed from on-chain events
  await query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id                  BIGINT PRIMARY KEY,
      owner_address       TEXT NOT NULL,
      merchant_address    TEXT NOT NULL,
      safe_vault          TEXT NOT NULL,
      amount              TEXT NOT NULL,
      interval            TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'active',
      last_pulled_at      TIMESTAMPTZ,
      paused_at           TIMESTAMPTZ,
      guardian_address    TEXT,
      product_slug        TEXT,
      tx_hash             TEXT,
      block_number        BIGINT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS product_slug TEXT`);
  // Subscriber notification preferences
  await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscriber_email TEXT`);
  await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscriber_webhook_url TEXT`);
  await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_contract_vault BOOLEAN DEFAULT FALSE`);
  // External order reference — set by storefront plugins (e.g. WooCommerce) so
  // an incoming webhook can be matched back to the exact originating order.
  await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS external_ref TEXT`);

  // Payments — indexed from PaymentExecuted events. Created here, before the
  // vault_address migration below, so the table is guaranteed to exist by the
  // time that migration needs to ALTER it — matters for a genuinely fresh
  // database, where payments wouldn't exist yet if this were left in its
  // original position further down the file.
  // subscription_id has no inline REFERENCES here — a plain single-column FK
  // can't target subscriptions.id once it's part of a composite primary key
  // (id, vault_address). The real FK is added further below, once both
  // tables have vault_address, as a proper composite constraint.
  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id                    SERIAL PRIMARY KEY,
      subscription_id       BIGINT NOT NULL,
      merchant_address      TEXT NOT NULL,
      owner_address         TEXT NOT NULL,
      amount                TEXT NOT NULL,
      merchant_received     TEXT NOT NULL,
      fee                   TEXT NOT NULL,
      tx_hash               TEXT NOT NULL UNIQUE,
      block_number          BIGINT,
      eur_rate              TEXT,
      merchant_received_eur TEXT,
      executed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add EUR columns to existing payments table if upgrading
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS eur_rate TEXT`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS merchant_received_eur TEXT`);

  // vault_address scoping — subscription IDs are assigned sequentially by each
  // vault deployment's own internal counter, so the same numeric id can (and
  // has) collided across different deployments (v7/v8/v9/etc). Previously `id`
  // alone was the primary key, so a genuinely new subscription on the current
  // vault could silently overwrite/be-blocked-by an unrelated old subscription
  // that happened to share the same id. Found via a real data-loss incident
  // Aug 10 2026 — see CLAUDE-CORE.md. Fix is forward-only: existing rows are
  // backfilled with the CURRENT vault address as a best-effort label (their
  // true origin vault was never recorded and can't be recovered), but going
  // forward every read/write is scoped by vault_address so this collision
  // class cannot happen again for new data.
  await query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS vault_address TEXT`);
  if (process.env.VAULT_ADDRESS) {
    await query(
      `UPDATE subscriptions SET vault_address = $1 WHERE vault_address IS NULL`,
      [process.env.VAULT_ADDRESS.trim()]
    );
  } else {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM subscriptions WHERE vault_address IS NULL`
    );
    if (rows[0].n > 0) {
      throw new Error(
        `[DB] Cannot migrate subscriptions.vault_address: ${rows[0].n} existing row(s) ` +
        `have no vault_address and VAULT_ADDRESS is not set in this service's environment. ` +
        `Set VAULT_ADDRESS before starting this service, or backfill vault_address manually.`
      );
    }
  }
  await query(`ALTER TABLE subscriptions ALTER COLUMN vault_address SET NOT NULL`);
  // payments.subscription_id carries a foreign key into subscriptions(id) —
  // that FK must be dropped before subscriptions_pkey can be rebuilt as a
  // composite key. It's recreated further below, once both tables have
  // vault_address, as a proper composite FK so this same collision class
  // can't happen in payments either. Found the hard way: this migration
  // crash-looped the AuthOnce main service on first deploy (Aug 11 2026)
  // because this drop was missing — see CLAUDE-CORE.md. payments is created
  // above, before this line, specifically so this ALTER TABLE never runs
  // against a table that doesn't exist yet on a fresh database.
  await query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_subscription_id_fkey`);
  // Existing ids were already unique among themselves (old single-column PK
  // enforced that), so backfilling them all with one shared vault_address
  // value cannot introduce a duplicate (id, vault_address) pair — this
  // upgrade is safe to run against live data with no manual cleanup needed.
  await query(`ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_pkey`);
  await query(`ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id, vault_address)`);

  // Same vault_address scoping as subscriptions, and for the same reason —
  // subscription_id alone is not globally unique across vault deployments,
  // so payments needs the same scoping to correctly reference the right
  // subscription row.
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS vault_address TEXT`);
  if (process.env.VAULT_ADDRESS) {
    await query(
      `UPDATE payments SET vault_address = $1 WHERE vault_address IS NULL`,
      [process.env.VAULT_ADDRESS.trim()]
    );
  } else {
    const { rows: payRows } = await query(
      `SELECT COUNT(*)::int AS n FROM payments WHERE vault_address IS NULL`
    );
    if (payRows[0].n > 0) {
      throw new Error(
        `[DB] Cannot migrate payments.vault_address: ${payRows[0].n} existing row(s) ` +
        `have no vault_address and VAULT_ADDRESS is not set in this service's environment.`
      );
    }
  }
  await query(`ALTER TABLE payments ALTER COLUMN vault_address SET NOT NULL`);
  // Drop the FK now, before the corrective re-labeling below — Postgres
  // enforces FK integrity on UPDATEs to the referenced table too, not just
  // inserts, so relabeling subscriptions.vault_address while the FK is
  // still active would fail (or relabeling payments first would equally
  // fail, since the sentinel value wouldn't exist as a matching parent key
  // yet). Re-added further below, once both tables are already consistent.
  await query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_subscription_id_fkey`);

  // Corrective re-labeling — found Aug 11 2026, the day after the fix above
  // first shipped. The original backfill labeled every pre-existing,
  // origin-unknown row with the CURRENT vault address as a best-effort
  // guess. That was itself a mistake: it meant an old, unrelated row could
  // still collide with a genuinely new subscription that later reused the
  // same id on the current vault — exactly the bug this whole migration
  // exists to prevent, just reintroduced through the backfill choice. A
  // real example: id=6 was stale June 2026 data, silently swallowed a
  // genuine new subscription's data today.
  //
  // Fix: the v9 vault (current VAULT_ADDRESS) did not exist before
  // 2026-08-09. Any row created before that date cannot possibly be a real
  // subscription on it, however it was labeled. Re-tag those with a
  // sentinel that can never equal a real vault address, permanently
  // removing them from the collision surface — not another guess, a hard
  // fact about when the contract came into existence. Safe to leave running
  // on every boot: once a row is re-tagged, its vault_address no longer
  // matches the current VAULT_ADDRESS, so this never touches it again, and
  // genuinely new rows always have a created_at far after the cutoff.
  // Both tables are relabeled here, before the FK below is re-added, so
  // they're already consistent with each other by the time it validates.
  if (process.env.VAULT_ADDRESS) {
    await query(
      `UPDATE subscriptions SET vault_address = 'legacy-unknown-pre-v9'
       WHERE vault_address = $1 AND created_at < '2026-08-09'::timestamptz`,
      [process.env.VAULT_ADDRESS.trim()]
    );
    // Relabeled based on the PARENT subscription's own relabeling, not an
    // independent date check on the payment itself — a payment's
    // executed_at doesn't necessarily track its subscription's created_at
    // (e.g. a stale old subscription could in principle have a payment
    // recorded later). Matching on the parent guarantees payments stay
    // consistent with subscriptions no matter what, so the FK below always
    // validates cleanly.
    await query(
      `UPDATE payments p SET vault_address = 'legacy-unknown-pre-v9'
       FROM subscriptions s
       WHERE p.subscription_id = s.id
         AND s.vault_address = 'legacy-unknown-pre-v9'
         AND p.vault_address = $1`,
      [process.env.VAULT_ADDRESS.trim()]
    );
  }

  // Drop-then-add so this is safe to run on every boot, same idiom as
  // subscriptions_pkey above. Both tables are already consistent with each
  // other by this point (corrective re-labeling above ran first), so this
  // validates cleanly.
  await query(`ALTER TABLE payments ADD CONSTRAINT payments_subscription_id_fkey
    FOREIGN KEY (subscription_id, vault_address) REFERENCES subscriptions(id, vault_address)`);

  // Webhook delivery log
  await query(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id                  SERIAL PRIMARY KEY,
      merchant_address    TEXT NOT NULL,
      event_type          TEXT NOT NULL,
      payload             JSONB NOT NULL,
      response_status     INTEGER,
      response_body       TEXT,
      attempt             INTEGER NOT NULL DEFAULT 1,
      delivered           BOOLEAN NOT NULL DEFAULT FALSE,
      delivered_at        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // [FIX — Aug 2026] webhook_endpoints — the multi-endpoint, per-event
  // webhook system managed via the merchant dashboard's "Add Webhook" UI
  // (POST/GET/DELETE /api/webhooks in api.js). This table existed live in
  // the database but had NO corresponding CREATE TABLE statement anywhere
  // in this schema-bootstrap file — it was created manually, out of band,
  // at some point. That meant a fresh database (new environment, disaster
  // recovery, a teammate's local setup) would have every webhook-management
  // API route fail with "relation does not exist" the moment anyone tried
  // to add a webhook, with no indication why. Folding it into the normal
  // bootstrap process, matching every other table here.
  await query(`
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id                  SERIAL PRIMARY KEY,
      merchant_address    TEXT NOT NULL,
      url                 TEXT NOT NULL,
      events              JSONB NOT NULL DEFAULT '[]',
      secret              TEXT NOT NULL,
      active              BOOLEAN NOT NULL DEFAULT TRUE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_merchant ON webhook_endpoints (LOWER(merchant_address))`);

  // [v9 — SV-21] Merchant payout rotation requests. Indexed from the
  // MerchantChangeProposed/Accepted/Cancelled events by notifier.js — the
  // contract itself only ever stores ONE pending change at a time per
  // subscription (sub.pendingMerchant), with no history. This table keeps
  // the full history and, more importantly, makes it possible to answer
  // "which subscriptions have proposed ME as their new payout wallet" —
  // something the contract alone can't answer without scanning every
  // subscription ID, since pendingMerchant isn't indexed on-chain.
  await query(`
    CREATE TABLE IF NOT EXISTS merchant_change_requests (
      id                  SERIAL PRIMARY KEY,
      subscription_id     BIGINT NOT NULL,
      old_merchant        TEXT NOT NULL,
      new_merchant        TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | cancelled
      proposed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at         TIMESTAMPTZ,
      propose_tx_hash     TEXT,
      resolve_tx_hash     TEXT
    )
  `);
  // Only one PENDING request per subscription can exist at once — matches
  // the contract's own invariant (a new propose overwrites sub.pendingMerchant
  // rather than stacking). Partial unique index, not a table-level UNIQUE,
  // since multiple historical accepted/cancelled rows for the same
  // subscription are expected and fine.
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_change_one_pending ON merchant_change_requests (subscription_id) WHERE status = 'pending'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_merchant_change_new_merchant ON merchant_change_requests (LOWER(new_merchant), status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_merchant_change_old_merchant ON merchant_change_requests (LOWER(old_merchant), status)`);

  // Subscriber imports/invites — "Invite past customers to subscribe"
  // feature. Helper functions below (createSubscriberImport etc.) were
  // already written against this table, but the table itself was never
  // actually created here, and nothing called those functions — a
  // disconnected, half-built feature until now (Aug 2026 fix).
  await query(`
    CREATE TABLE IF NOT EXISTS subscriber_imports (
      id                        SERIAL PRIMARY KEY,
      merchant_address          TEXT NOT NULL,
      import_type               TEXT NOT NULL DEFAULT 'fiat',
      email                     TEXT,
      wallet_address            TEXT,
      product_slug              TEXT NOT NULL,
      amount_usdc               NUMERIC,
      interval                  TEXT NOT NULL DEFAULT 'monthly',
      status                    TEXT NOT NULL DEFAULT 'pending',
      error_message             TEXT,
      onboarding_email_sent_at  TIMESTAMPTZ,
      subscribed_at             TIMESTAMPTZ,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (merchant_address, product_slug, email)
    )
  `);

  // Indexes for common queries
  await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_merchant ON subscriptions(merchant_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_merchant ON webhook_deliveries(merchant_address)`);

  // DataOnce — Phase 2 data consent registry
  await query(`
    CREATE TABLE IF NOT EXISTS data_consents (
      id                  SERIAL PRIMARY KEY,
      subscriber_address  TEXT NOT NULL,
      data_category       TEXT NOT NULL,
      data_source         TEXT NOT NULL DEFAULT 'authonce_onchain',
      verification_level  TEXT NOT NULL DEFAULT 'on_chain_verified',
      data_freshness_days INTEGER DEFAULT 30,
      access_granted_to   TEXT,
      data_buyer_name     TEXT,
      purpose             TEXT,
      price_per_month     NUMERIC(18,6) DEFAULT 0,
      payment_frequency   TEXT NOT NULL DEFAULT 'monthly',
      minimum_term_days   INTEGER DEFAULT 30,
      total_earned        NUMERIC(18,6) DEFAULT 0,
      consent_given_at    TIMESTAMPTZ,
      consent_version     TEXT,
      legal_basis         TEXT NOT NULL DEFAULT 'consent',
      ip_country          TEXT,
      revoked_at          TIMESTAMPTZ,
      last_accessed_at    TIMESTAMPTZ,
      access_count        INTEGER DEFAULT 0,
      active              BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at          TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_data_consents_subscriber ON data_consents(subscriber_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_data_consents_category ON data_consents(data_category)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_data_consents_buyer ON data_consents(access_granted_to) WHERE access_granted_to IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_data_consents_active ON data_consents(active) WHERE active = TRUE`);

  // Subscribers — Google OAuth login, magic link, MB Way/Multibanco identity
  await query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id                  SERIAL PRIMARY KEY,
      email               TEXT UNIQUE NOT NULL,
      google_id           TEXT UNIQUE,
      name                TEXT,
      avatar_url          TEXT,
      wallet_address      TEXT UNIQUE,
      wallet_private_key  TEXT,
      phone               TEXT,
      country             TEXT DEFAULT 'PT',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at       TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscribers_google_id ON subscribers(google_id) WHERE google_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscribers_wallet ON subscribers(wallet_address) WHERE wallet_address IS NOT NULL`);

  // Products — merchant subscription products
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id               SERIAL PRIMARY KEY,
      merchant_address TEXT NOT NULL,
      slug             TEXT NOT NULL,
      name             TEXT NOT NULL,
      amount           NUMERIC(18,6) NOT NULL,
      interval         TEXT NOT NULL CHECK (interval IN ('weekly','monthly','yearly')),
      trial_days       INTEGER NOT NULL DEFAULT 0,
      active           BOOLEAN NOT NULL DEFAULT TRUE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(merchant_address, slug)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_address)`);
  // Migration: add columns to existing products table
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS trial_days       INTEGER       NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS intro_amount     NUMERIC(18,6) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS intro_pulls      INTEGER       NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS yearly_amount    NUMERIC(18,6) DEFAULT NULL`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS payment_methods  TEXT[]        DEFAULT ARRAY['crypto']`);
  // ✅ v7: grace period per product (1–30 days, default 7)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 7`);

  // System health — keeper heartbeat and service monitoring
  await query(`
    CREATE TABLE IF NOT EXISTS system_health (
      service             TEXT PRIMARY KEY,
      last_run_at         TIMESTAMPTZ,
      last_cycle_ms       INTEGER,
      last_pulled         INTEGER DEFAULT 0,
      last_expired        INTEGER DEFAULT 0,
      last_skipped        INTEGER DEFAULT 0,
      last_error          TEXT,
      total_cycles        BIGINT DEFAULT 0,
      eth_balance         NUMERIC(18,8),
      eth_balance_warn    BOOLEAN DEFAULT FALSE,
      deployer_eth        NUMERIC(18,8),
      deployer_eth_warn   BOOLEAN DEFAULT FALSE,
      safe_eth            NUMERIC(18,8),
      safe_eth_warn       BOOLEAN DEFAULT FALSE,
      treasury_usdc       NUMERIC(18,6),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // v5 migrations — add new columns if upgrading from v4
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS token_address      TEXT`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS token_symbol       TEXT DEFAULT 'USDC'`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS chf_rate           NUMERIC(18,8)`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS chf_amount         NUMERIC(18,2)`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS fiat_currency      TEXT DEFAULT 'eur'`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS fiat_rate          NUMERIC(18,8)`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS fiat_amount        NUMERIC(18,2)`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS protocol_fee_usdc  NUMERIC(18,6)`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS protocol_fee_eur   NUMERIC(18,2)`);
  await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS protocol_fee_chf   NUMERIC(18,2)`);
  await query(`ALTER TABLE products  ADD COLUMN IF NOT EXISTS price_type        TEXT DEFAULT 'crypto'`);
  await query(`ALTER TABLE products  ADD COLUMN IF NOT EXISTS fiat_currency     TEXT DEFAULT 'eur'`);
  await query(`ALTER TABLE products  ADD COLUMN IF NOT EXISTS fiat_price        NUMERIC(18,6)`);
  await query(`ALTER TABLE products  ADD COLUMN IF NOT EXISTS fiat_yearly_price NUMERIC(18,6)`);
  await query(`ALTER TABLE products  ADD COLUMN IF NOT EXISTS crypto_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tier              TEXT DEFAULT 'starter'`);
  await query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS brand_name        TEXT`);
  await query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS brand_color       TEXT`);
  await query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS fiat_currency     TEXT DEFAULT 'eur'`);

  // v6 migrations — keeper ETH balance tracking
  await query(`ALTER TABLE system_health ADD COLUMN IF NOT EXISTS eth_balance      NUMERIC(18,8)`);
  await query(`ALTER TABLE system_health ADD COLUMN IF NOT EXISTS eth_balance_warn BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE system_health ADD COLUMN IF NOT EXISTS deployer_eth     NUMERIC(18,8)`);
  await query(`ALTER TABLE system_health ADD COLUMN IF NOT EXISTS deployer_eth_warn BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE system_health ADD COLUMN IF NOT EXISTS safe_eth         NUMERIC(18,8)`);
  await query(`ALTER TABLE system_health ADD COLUMN IF NOT EXISTS safe_eth_warn    BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE system_health ADD COLUMN IF NOT EXISTS treasury_usdc    NUMERIC(18,6)`);

  // v6 migrations — merchant VAT and billing fields
  await query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS country_code    TEXT DEFAULT 'PT'`);
  await query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS vat_number      TEXT`);
  await query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS billing_address TEXT`);

  // GDPR pending on-chain cancellations — crypto-native subscribers
  await query(`
    CREATE TABLE IF NOT EXISTS gdpr_pending_onchain (
      id                  SERIAL PRIMARY KEY,
      subscriber_hash     TEXT NOT NULL,
      subscription_ids    INTEGER[] NOT NULL,
      requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved            BOOLEAN DEFAULT FALSE,
      resolved_at         TIMESTAMPTZ,
      resolved_by         TEXT,
      notes               TEXT
    )
  `);

  // Keeper pull attempt log — every executePull attempt, success or failure
  await query(`
    CREATE TABLE IF NOT EXISTS keeper_pull_attempts (
      id                SERIAL PRIMARY KEY,
      subscription_id   BIGINT NOT NULL,
      wallet            TEXT NOT NULL,
      merchant          TEXT NOT NULL,
      amount_usdc       TEXT NOT NULL,
      status            TEXT NOT NULL,   -- 'success' | 'failed' | 'skipped'
      tx_hash           TEXT,
      block_number      BIGINT,
      error             TEXT,
      attempted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_kpa_sub      ON keeper_pull_attempts(subscription_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_kpa_status   ON keeper_pull_attempts(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_kpa_attempted ON keeper_pull_attempts(attempted_at)`);

  // Merchant API keys — server-to-server auth for integrations with no
  // wallet/browser in the loop (WooCommerce plugin, etc.). Only the SHA-256
  // hash is ever stored; the raw key is shown once at generation time in
  // api.js's POST /api/merchant/api-key response and cannot be recovered
  // after that. Deliberately a separate secret from the webhook signing
  // secret — see api.js for why reusing one secret for both would be wrong.
  await query(`
    CREATE TABLE IF NOT EXISTS merchant_api_keys (
      id                SERIAL PRIMARY KEY,
      merchant_address  TEXT NOT NULL,
      key_hash          TEXT NOT NULL UNIQUE,
      label             TEXT NOT NULL DEFAULT 'default',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at      TIMESTAMPTZ,
      revoked_at        TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_hash
    ON merchant_api_keys (key_hash) WHERE revoked_at IS NULL
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_merchant_api_keys_merchant
    ON merchant_api_keys (merchant_address) WHERE revoked_at IS NULL
  `);

  console.log("[DB] Schema ready ✓");
}

// -----------------------------------------------------------------------------
// Keeper pull attempt logging
// -----------------------------------------------------------------------------

// Disabled as of 2026-08-16 — confirmed via pg_stat_user_tables (seq_scan=0,
// idx_scan=0, checked twice three weeks apart) that nothing has ever read
// keeper_pull_attempts. It grew to 221MB/428k rows of write-only logging
// and was truncated. Every real diagnostic signal this fed already exists
// in the keeper's own console output (captured by Railway logs) right next
// to each of these call sites in keeper.js — this table added disk usage
// without adding any actual observability. Table/indexes deliberately left
// in the schema above (not dropped) so a future anomaly-monitoring feature
// can resume writing here deliberately, rather than this being silently
// gone if someone assumes it still works.
//
// keeper.js's 5 call sites and its own try/catch wrapper are untouched —
// this no-op keeps the exact same function name and parameters, so nothing
// else needs to change.
async function logKeeperPullAttempt() {
  // Intentionally a no-op. See comment above.
}

// -----------------------------------------------------------------------------
// GDPR pending on-chain cancellation helpers
// -----------------------------------------------------------------------------

async function createGdprPendingOnchain({ subscriberHash, subscriptionIds }) {
  await query(
    `INSERT INTO gdpr_pending_onchain (subscriber_hash, subscription_ids, requested_at)
     VALUES ($1, $2, NOW())`,
    [subscriberHash, subscriptionIds]
  );
}

async function getGdprPendingOnchain() {
  const res = await query(
    `SELECT * FROM gdpr_pending_onchain WHERE resolved = FALSE ORDER BY requested_at ASC`
  );
  return res.rows;
}

async function resolveGdprPendingOnchain({ id, resolvedBy, notes }) {
  await query(
    `UPDATE gdpr_pending_onchain SET resolved = TRUE, resolved_at = NOW(), resolved_by = $1, notes = $2 WHERE id = $3`,
    [resolvedBy, notes || null, id]
  );
}

// -----------------------------------------------------------------------------
// System health helpers
// -----------------------------------------------------------------------------

async function upsertKeeperHeartbeat({ cycleMs, pulled, expired, skipped, error, ethBalance, ethBalanceWarn, deployerEthBalance, deployerEthWarn, safeEthBalance, safeEthWarn, treasuryUsdc }) {
  await query(`
    INSERT INTO system_health (service, last_run_at, last_cycle_ms, last_pulled, last_expired, last_skipped, last_error, total_cycles, eth_balance, eth_balance_warn, deployer_eth, deployer_eth_warn, safe_eth, safe_eth_warn, treasury_usdc, updated_at)
    VALUES ('keeper', NOW(), $1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10, $11, $12, NOW())
    ON CONFLICT (service) DO UPDATE SET
      last_run_at       = NOW(),
      last_cycle_ms     = $1,
      last_pulled       = $2,
      last_expired      = $3,
      last_skipped      = $4,
      last_error        = $5,
      total_cycles      = system_health.total_cycles + 1,
      eth_balance       = $6,
      eth_balance_warn  = $7,
      deployer_eth      = $8,
      deployer_eth_warn = $9,
      safe_eth          = $10,
      safe_eth_warn     = $11,
      treasury_usdc     = $12,
      updated_at        = NOW()
  `, [cycleMs, pulled, expired, skipped, error || null,
      ethBalance || null, ethBalanceWarn || false,
      deployerEthBalance || null, deployerEthWarn || false,
      safeEthBalance || null, safeEthWarn || false,
      treasuryUsdc || null]);
}

async function getSystemHealth() {
  const res = await query(`SELECT * FROM system_health`);
  return res.rows;
}

// -----------------------------------------------------------------------------
// Subscription helpers
// -----------------------------------------------------------------------------

async function upsertSubscription(data) {
  const {
    id, vaultAddress, ownerAddress, merchantAddress, safeVault, amount,
    interval, status, txHash, blockNumber, guardianAddress, productSlug,
    subscriberEmail, subscriberWebhookUrl, isContractVault
  } = data;

  if (!vaultAddress) {
    throw new Error("upsertSubscription: vaultAddress is required — subscription ids are not globally unique across vault deployments");
  }

  await query(`
    INSERT INTO subscriptions
      (id, vault_address, owner_address, merchant_address, safe_vault, amount, interval,
       status, tx_hash, block_number, guardian_address, product_slug,
       subscriber_email, subscriber_webhook_url, is_contract_vault,
       created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
    ON CONFLICT (id, vault_address) DO UPDATE SET
      status                 = EXCLUDED.status,
      product_slug           = COALESCE(EXCLUDED.product_slug, subscriptions.product_slug),
      subscriber_email       = COALESCE(EXCLUDED.subscriber_email, subscriptions.subscriber_email),
      subscriber_webhook_url = COALESCE(EXCLUDED.subscriber_webhook_url, subscriptions.subscriber_webhook_url),
      is_contract_vault      = COALESCE(EXCLUDED.is_contract_vault, subscriptions.is_contract_vault),
      updated_at             = NOW()
  `, [id, vaultAddress, ownerAddress, merchantAddress, safeVault, amount, interval,
      status, txHash, blockNumber, guardianAddress || null, productSlug || null,
      subscriberEmail || null, subscriberWebhookUrl || null, isContractVault || false]);
}

// Update subscriber notification preferences post-subscription
async function updateSubscriberNotificationPrefs(subscriptionId, vaultAddress, { subscriberEmail, subscriberWebhookUrl } = {}) {
  if (!vaultAddress) throw new Error("updateSubscriberNotificationPrefs: vaultAddress is required");
  await query(`
    UPDATE subscriptions SET
      subscriber_email       = COALESCE($3, subscriber_email),
      subscriber_webhook_url = COALESCE($4, subscriber_webhook_url),
      updated_at             = NOW()
    WHERE id = $1 AND vault_address = $2
  `, [subscriptionId, vaultAddress, subscriberEmail || null, subscriberWebhookUrl || null]);
}

async function updateSubscriptionStatus(id, vaultAddress, status, extra = {}) {
  if (!vaultAddress) throw new Error("updateSubscriptionStatus: vaultAddress is required");
  const updates = ["status = $3", "updated_at = NOW()"];
  const values = [id, vaultAddress, status];
  let i = 4;

  if (extra.pausedAt !== undefined) {
    updates.push(`paused_at = $${i++}`);
    values.push(extra.pausedAt);
  }
  if (extra.lastPulledAt !== undefined) {
    updates.push(`last_pulled_at = $${i++}`);
    values.push(extra.lastPulledAt);
  }

  await query(
    `UPDATE subscriptions SET ${updates.join(", ")} WHERE id = $1 AND vault_address = $2`,
    values
  );
}

async function getSubscription(id, vaultAddress) {
  if (!vaultAddress) throw new Error("getSubscription: vaultAddress is required");
  const res = await query("SELECT * FROM subscriptions WHERE id = $1 AND vault_address = $2", [id, vaultAddress]);
  return res.rows[0] || null;
}

async function getSubscriptionsByMerchant(merchantAddress) {
  const res = await query(
    "SELECT * FROM subscriptions WHERE merchant_address = $1 ORDER BY created_at DESC",
    [merchantAddress]
  );
  return res.rows;
}

// -----------------------------------------------------------------------------
// Payment helpers
// -----------------------------------------------------------------------------

async function insertPayment(data) {
  const {
    subscriptionId, vaultAddress, merchantAddress, ownerAddress,
    amount, merchantReceived, fee, txHash, blockNumber,
    // v5 multi-token + multi-currency fiat
    tokenAddress    = null,
    tokenSymbol     = "USDC",
    eurRate         = null,
    merchantReceivedEur = null,
    chfRate         = null,
    chfAmount       = null,
    fiatCurrency    = "eur",
    fiatRate        = null,
    fiatAmount      = null,
    protocolFeeUsdc = null,
    protocolFeeEur  = null,
    protocolFeeChf  = null,
  } = data;

  if (!vaultAddress) {
    throw new Error("insertPayment: vaultAddress is required — must exactly match subscriptions.vault_address for the foreign key to validate");
  }

  await query(`
    INSERT INTO payments
      (subscription_id, vault_address, merchant_address, owner_address, amount,
       merchant_received, fee, tx_hash, block_number,
       token_address, token_symbol,
       eur_rate, merchant_received_eur,
       chf_rate, chf_amount,
       fiat_currency, fiat_rate, fiat_amount,
       protocol_fee_usdc, protocol_fee_eur, protocol_fee_chf,
       executed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
    ON CONFLICT (tx_hash) DO NOTHING
  `, [
    // vaultAddress deliberately NOT lowercased — must exactly match
    // subscriptions.vault_address (stored checksummed) for the composite FK.
    subscriptionId, vaultAddress, merchantAddress?.toLowerCase(), ownerAddress?.toLowerCase(),
    amount, merchantReceived, fee, txHash, blockNumber,
    tokenAddress?.toLowerCase(), tokenSymbol,
    eurRate || null, merchantReceivedEur || null,
    chfRate || null, chfAmount || null,
    fiatCurrency || "eur", fiatRate || null, fiatAmount || null,
    protocolFeeUsdc || null, protocolFeeEur || null, protocolFeeChf || null,
  ]);
}

async function getPaymentsByMerchant(merchantAddress, limit = 50) {
  const res = await query(`
    SELECT p.*, s.owner_address as subscriber_vault
    FROM payments p
    JOIN subscriptions s ON p.subscription_id = s.id
    WHERE p.merchant_address = $1
    ORDER BY p.executed_at DESC
    LIMIT $2
  `, [merchantAddress, limit]);
  return res.rows;
}

// -----------------------------------------------------------------------------
// Merchant helpers
// -----------------------------------------------------------------------------

async function upsertMerchant(walletAddress, data = {}) {
  const {
    businessName, email, webhookUrl, webhookSecret,
    settlementPreference, ibanPlaintext, bic, accountHolder,
    countryCode, vatNumber, billingAddress,
  } = data;

  const ibanEncrypted = ibanPlaintext ? encrypt(ibanPlaintext) : null;

  await query(`
    INSERT INTO merchants
      (wallet_address, business_name, email, webhook_url, webhook_secret,
       settlement_preference, iban_encrypted, bic, account_holder,
       country_code, vat_number, billing_address,
       approved_at, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW(),NOW())
    ON CONFLICT (wallet_address) DO UPDATE SET
      business_name         = COALESCE(EXCLUDED.business_name, merchants.business_name),
      email                 = COALESCE(EXCLUDED.email, merchants.email),
      webhook_url           = COALESCE(EXCLUDED.webhook_url, merchants.webhook_url),
      webhook_secret        = COALESCE(EXCLUDED.webhook_secret, merchants.webhook_secret),
      settlement_preference = COALESCE(EXCLUDED.settlement_preference, merchants.settlement_preference),
      iban_encrypted        = COALESCE(EXCLUDED.iban_encrypted, merchants.iban_encrypted),
      bic                   = COALESCE(EXCLUDED.bic, merchants.bic),
      account_holder        = COALESCE(EXCLUDED.account_holder, merchants.account_holder),
      country_code          = COALESCE(EXCLUDED.country_code, merchants.country_code),
      vat_number            = COALESCE(EXCLUDED.vat_number, merchants.vat_number),
      billing_address       = COALESCE(EXCLUDED.billing_address, merchants.billing_address),
      updated_at            = NOW()
  `, [walletAddress, businessName || null, email || null, webhookUrl || null,
      webhookSecret || null, settlementPreference || "usdc",
      ibanEncrypted, bic || null, accountHolder || null,
      countryCode || "PT", vatNumber || null, billingAddress || null]);
}

async function getMerchant(walletAddress) {
  const res = await query(
    "SELECT * FROM merchants WHERE wallet_address = $1",
    [walletAddress]
  );
  if (!res.rows[0]) return null;
  const m = res.rows[0];
  if (m.iban_encrypted) {
    m.iban_decrypted = decrypt(m.iban_encrypted);
    delete m.iban_encrypted;
  }
  return m;
}

async function getMerchantWebhook(merchantAddress) {
  const res = await query(
    "SELECT webhook_url, webhook_secret FROM merchants WHERE wallet_address = $1",
    [merchantAddress]
  );
  return res.rows[0] || null;
}

// [FIX — Aug 2026] The real, UI-managed webhook system. Returns every
// ACTIVE webhook_endpoints row for this merchant that is subscribed to the
// given event type — a merchant can have multiple endpoints, each
// subscribed to a different subset of events, and all matching ones should
// receive a given event. Previously nothing in the codebase queried this
// table for real event dispatch at all; dispatchWebhook() in webhook.js
// only ever read the legacy single-URL merchants.webhook_url field, which
// has no UI path to set it — meaning every real event silently fell back
// to email for every merchant, regardless of what was configured in the
// dashboard's "Add Webhook" screen.
async function getActiveWebhooksForEvent(merchantAddress, eventType) {
  const res = await query(
    `SELECT id, url, secret FROM webhook_endpoints
     WHERE LOWER(merchant_address) = LOWER($1)
       AND active = TRUE
       AND events @> $2::jsonb`,
    [merchantAddress, JSON.stringify([eventType])]
  );
  return res.rows;
}

// [v9 — SV-21] Merchant payout rotation — indexing functions, called by
// notifier.js's event listeners.

async function createMerchantChangeRequest({ subscriptionId, oldMerchant, newMerchant, txHash }) {
  await query(
    `INSERT INTO merchant_change_requests (subscription_id, old_merchant, new_merchant, propose_tx_hash)
     VALUES ($1, $2, $3, $4)`,
    [subscriptionId, oldMerchant, newMerchant, txHash]
  );
}

async function resolveMerchantChangeRequest({ subscriptionId, status, txHash }) {
  // Resolves whichever row is currently 'pending' for this subscription —
  // there can only ever be one, enforced by the partial unique index above.
  await query(
    `UPDATE merchant_change_requests
     SET status = $2, resolved_at = NOW(), resolve_tx_hash = $3
     WHERE subscription_id = $1 AND status = 'pending'`,
    [subscriptionId, status, txHash]
  );
}

// Requests THIS merchant proposed, still awaiting the new address's accept.
async function getOutgoingPendingChanges(merchantAddress) {
  const res = await query(
    `SELECT * FROM merchant_change_requests
     WHERE LOWER(old_merchant) = LOWER($1) AND status = 'pending'
     ORDER BY proposed_at DESC`,
    [merchantAddress]
  );
  return res.rows;
}

// Requests where THIS merchant is the proposed new payout wallet — the
// thing the contract alone can't answer, since pendingMerchant isn't
// indexed on-chain by new-merchant address.
async function getIncomingPendingChanges(merchantAddress) {
  const res = await query(
    `SELECT * FROM merchant_change_requests
     WHERE LOWER(new_merchant) = LOWER($1) AND status = 'pending'
     ORDER BY proposed_at DESC`,
    [merchantAddress]
  );
  return res.rows;
}

// -----------------------------------------------------------------------------
// Product helpers
// -----------------------------------------------------------------------------

async function upsertProduct(merchantAddress, data) {
  const {
    slug, name, amount, interval,
    trialDays = 0, introAmount = 0, introPulls = 0,
    yearlyAmount = null, payment_methods = ["crypto"],
    fiat_currency = "eur", crypto_discount_pct = 0,
    grace_period_days = 7,                              // ✅ v7
    description = null, image_url = null,
  } = data;

  const res = await query(`
    INSERT INTO products (
      merchant_address, slug, name, amount, interval,
      trial_days, intro_amount, intro_pulls, yearly_amount, payment_methods,
      fiat_currency, crypto_discount_pct, grace_period_days,
      created_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
    ON CONFLICT (merchant_address, slug) DO UPDATE SET
      name                = EXCLUDED.name,
      amount              = EXCLUDED.amount,
      interval            = EXCLUDED.interval,
      trial_days          = EXCLUDED.trial_days,
      intro_amount        = EXCLUDED.intro_amount,
      intro_pulls         = EXCLUDED.intro_pulls,
      yearly_amount       = EXCLUDED.yearly_amount,
      payment_methods     = EXCLUDED.payment_methods,
      fiat_currency       = EXCLUDED.fiat_currency,
      crypto_discount_pct = EXCLUDED.crypto_discount_pct,
      grace_period_days   = EXCLUDED.grace_period_days,
      active              = TRUE,
      updated_at          = NOW()
    RETURNING *
  `, [
    merchantAddress, slug, name, amount, interval,
    trialDays, introAmount, introPulls, yearlyAmount, payment_methods,
    fiat_currency, crypto_discount_pct, grace_period_days,
  ]);
  return res.rows[0];
}

async function getProduct(merchantAddress, slug) {
  const res = await query(
    "SELECT * FROM products WHERE merchant_address = $1 AND slug = $2 AND active = TRUE",
    [merchantAddress, slug]
  );
  return res.rows[0] || null;
}

async function getMerchantProducts(merchantAddress) {
  const res = await query(
    "SELECT * FROM products WHERE merchant_address = $1 AND active = TRUE ORDER BY created_at DESC",
    [merchantAddress]
  );
  return res.rows;
}

async function deactivateProduct(merchantAddress, slug) {
  await query(
    "UPDATE products SET active = FALSE, updated_at = NOW() WHERE merchant_address = $1 AND slug = $2",
    [merchantAddress, slug]
  );
}

// -----------------------------------------------------------------------------
// Webhook delivery log
// -----------------------------------------------------------------------------

async function logWebhookDelivery(data) {
  const { merchantAddress, eventType, payload, responseStatus, responseBody, attempt, delivered } = data;
  await query(`
    INSERT INTO webhook_deliveries
      (merchant_address, event_type, payload, response_status, response_body,
       attempt, delivered, delivered_at, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
  `, [merchantAddress, eventType, JSON.stringify(payload),
      responseStatus || null, responseBody || null,
      attempt || 1, delivered || false,
      delivered ? new Date() : null]);
}

// -----------------------------------------------------------------------------
// Subscriber helpers
// -----------------------------------------------------------------------------

async function upsertSubscriber(data) {
  const { email, googleId, name, avatarUrl, walletAddress, walletPrivateKey, phone, country } = data;
  const res = await query(`
    INSERT INTO subscribers
      (email, google_id, name, avatar_url, wallet_address, wallet_private_key, phone, country, created_at, updated_at, last_login_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),NOW())
    ON CONFLICT (email) DO UPDATE SET
      google_id          = COALESCE(EXCLUDED.google_id, subscribers.google_id),
      name               = COALESCE(EXCLUDED.name, subscribers.name),
      avatar_url         = COALESCE(EXCLUDED.avatar_url, subscribers.avatar_url),
      wallet_address     = COALESCE(EXCLUDED.wallet_address, subscribers.wallet_address),
      wallet_private_key = COALESCE(EXCLUDED.wallet_private_key, subscribers.wallet_private_key),
      phone              = COALESCE(EXCLUDED.phone, subscribers.phone),
      updated_at         = NOW(),
      last_login_at      = NOW()
    RETURNING *
  `, [email, googleId || null, name || null, avatarUrl || null,
      walletAddress || null, walletPrivateKey || null, phone || null, country || 'PT']);
  return res.rows[0];
}

async function getSubscriberByEmail(email) {
  const res = await query("SELECT * FROM subscribers WHERE email = $1", [email]);
  return res.rows[0] || null;
}

async function getSubscriberByGoogleId(googleId) {
  const res = await query("SELECT * FROM subscribers WHERE google_id = $1", [googleId]);
  return res.rows[0] || null;
}

// -----------------------------------------------------------------------------
// Health check
// -----------------------------------------------------------------------------

async function healthCheck() {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Subscriber import helpers
// -----------------------------------------------------------------------------

async function createSubscriberImport({ merchantAddress, importType = "fiat", email = null, walletAddress = null, productSlug, amountUsdc, interval = "monthly" }) {
  const res = await query(`
    INSERT INTO subscriber_imports
      (merchant_address, import_type, email, wallet_address, product_slug, amount_usdc, interval, status, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NOW(),NOW())
    ON CONFLICT (merchant_address, product_slug, email) DO NOTHING
    RETURNING *
  `, [merchantAddress?.toLowerCase(), importType, email?.toLowerCase(), walletAddress?.toLowerCase(), productSlug, amountUsdc, interval]);
  return res.rows[0] || null; // null means this email was already invited for this product
}

async function updateSubscriberImport(id, { status, walletAddress, errorMessage, onboardingEmailSentAt, subscribedAt } = {}) {
  const res = await query(`
    UPDATE subscriber_imports SET
      status                   = COALESCE($2, status),
      wallet_address           = COALESCE($3, wallet_address),
      error_message            = COALESCE($4, error_message),
      onboarding_email_sent_at = COALESCE($5, onboarding_email_sent_at),
      subscribed_at            = COALESCE($6, subscribed_at),
      updated_at               = NOW()
    WHERE id = $1 RETURNING *
  `, [id, status, walletAddress?.toLowerCase(), errorMessage, onboardingEmailSentAt, subscribedAt]);
  return res.rows[0];
}

async function getSubscriberImports(merchantAddress, { status = null, limit = 100, offset = 0 } = {}) {
  const params = [merchantAddress?.toLowerCase(), limit, offset];
  let where = "WHERE merchant_address = $1";
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  const res = await query(`SELECT * FROM subscriber_imports ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`, params);
  return res.rows;
}

// -----------------------------------------------------------------------------
// Admin audit log
// -----------------------------------------------------------------------------

async function logAdminAction({ adminEmail, action, targetType = null, targetId = null, details = null, ipAddress = null }) {
  await query(`
    INSERT INTO admin_audit_log (admin_email, action, target_type, target_id, details, ip_address, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
  `, [adminEmail, action, targetType, targetId, details ? JSON.stringify(details) : null, ipAddress]);
}

async function getAdminAuditLog({ limit = 50, offset = 0 } = {}) {
  const res = await query("SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
  return res.rows;
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

module.exports = {
  query,
  pool,
  upsertKeeperHeartbeat,
  getSystemHealth,
  initSchema,
  encrypt,
  decrypt,
  // Subscriptions
  upsertSubscription,
  updateSubscriptionStatus,
  updateSubscriberNotificationPrefs,
  getSubscription,
  getSubscriptionsByMerchant,
  // Payments
  insertPayment,
  getPaymentsByMerchant,
  logKeeperPullAttempt,
  // Merchants
  upsertMerchant,
  getMerchant,
  getMerchantWebhook,
  getActiveWebhooksForEvent,
  createMerchantChangeRequest,
  resolveMerchantChangeRequest,
  getOutgoingPendingChanges,
  getIncomingPendingChanges,
  // Products
  upsertProduct,
  getProduct,
  getMerchantProducts,
  deactivateProduct,
  // Subscribers
  upsertSubscriber,
  getSubscriberByEmail,
  getSubscriberByGoogleId,
  // Webhooks
  logWebhookDelivery,
  // Health
  healthCheck,
  // Subscriber imports
  createSubscriberImport,
  updateSubscriberImport,
  getSubscriberImports,
  // Admin audit log
  logAdminAction,
  getAdminAuditLog,
  // GDPR pending on-chain cancellations
  createGdprPendingOnchain,
  getGdprPendingOnchain,
  resolveGdprPendingOnchain,
};
