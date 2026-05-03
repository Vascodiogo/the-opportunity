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
      tx_hash             TEXT,
      block_number        BIGINT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Payments — indexed from PaymentExecuted events
  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id                    SERIAL PRIMARY KEY,
      subscription_id       BIGINT NOT NULL REFERENCES subscriptions(id),
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

  // Indexes for common queries
  await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_merchant ON subscriptions(merchant_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions(owner_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_merchant ON webhook_deliveries(merchant_address)`);
  await pool.query("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS stripe_account_id TEXT, ADD COLUMN IF NOT EXISTS stripe_connected_at TIMESTAMPTZ");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_merchants_stripe_account_id ON merchants(stripe_account_id) WHERE stripe_account_id IS NOT NULL");

  // DataOnce — Phase 2 data consent registry
  // Stores subscriber consent records for data access by companies.
  // data_category examples: subscription_behaviour, spending_categories,
  //   health_lifestyle, demographic, browsing_interests, financial_profile,
  //   location_region, professional, commerce_retail, digital_behaviour
  // data_source: authonce_onchain, authonce_payment, stripe_verified,
  //   self_declared, connected_account, browser_extension
  await query(`
    CREATE TABLE IF NOT EXISTS data_consents (
      id                  SERIAL PRIMARY KEY,

      -- Subscriber identity
      subscriber_address  TEXT NOT NULL,

      -- Data details
      data_category       TEXT NOT NULL,
      data_source         TEXT NOT NULL DEFAULT 'authonce_onchain',
      verification_level  TEXT NOT NULL DEFAULT 'on_chain_verified',
      data_freshness_days INTEGER DEFAULT 30,

      -- Access grant
      access_granted_to   TEXT,
      data_buyer_name     TEXT,
      purpose             TEXT,

      -- Pricing
      price_per_month     NUMERIC(18,6) DEFAULT 0,
      payment_frequency   TEXT NOT NULL DEFAULT 'monthly',
      minimum_term_days   INTEGER DEFAULT 30,
      total_earned        NUMERIC(18,6) DEFAULT 0,

      -- GDPR compliance
      consent_given_at    TIMESTAMPTZ,
      consent_version     TEXT,
      legal_basis         TEXT NOT NULL DEFAULT 'consent',
      ip_country          TEXT,
      revoked_at          TIMESTAMPTZ,

      -- Access tracking
      last_accessed_at    TIMESTAMPTZ,
      access_count        INTEGER DEFAULT 0,

      -- Status
      active              BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at          TIMESTAMPTZ,

      -- Audit
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_data_consents_subscriber ON data_consents(subscriber_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_data_consents_category ON data_consents(data_category)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_data_consents_buyer ON data_consents(access_granted_to) WHERE access_granted_to IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_data_consents_active ON data_consents(active) WHERE active = TRUE`);

  console.log("[DB] Schema ready ✓");
}

// -----------------------------------------------------------------------------
// Subscription helpers
// -----------------------------------------------------------------------------

async function upsertSubscription(data) {
  const {
    id, ownerAddress, merchantAddress, safeVault, amount,
    interval, status, txHash, blockNumber, guardianAddress
  } = data;

  await query(`
    INSERT INTO subscriptions
      (id, owner_address, merchant_address, safe_vault, amount, interval,
       status, tx_hash, block_number, guardian_address, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
    ON CONFLICT (id) DO UPDATE SET
      status     = EXCLUDED.status,
      updated_at = NOW()
  `, [id, ownerAddress, merchantAddress, safeVault, amount, interval,
      status, txHash, blockNumber, guardianAddress || null]);
}

async function updateSubscriptionStatus(id, status, extra = {}) {
  const updates = ["status = $2", "updated_at = NOW()"];
  const values = [id, status];
  let i = 3;

  if (extra.pausedAt !== undefined) {
    updates.push(`paused_at = $${i++}`);
    values.push(extra.pausedAt);
  }
  if (extra.lastPulledAt !== undefined) {
    updates.push(`last_pulled_at = $${i++}`);
    values.push(extra.lastPulledAt);
  }

  await query(
    `UPDATE subscriptions SET ${updates.join(", ")} WHERE id = $1`,
    values
  );
}

async function getSubscription(id) {
  const res = await query("SELECT * FROM subscriptions WHERE id = $1", [id]);
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
    subscriptionId, merchantAddress, ownerAddress,
    amount, merchantReceived, fee, txHash, blockNumber,
    eurRate, merchantReceivedEur
  } = data;

  await query(`
    INSERT INTO payments
      (subscription_id, merchant_address, owner_address, amount,
       merchant_received, fee, tx_hash, block_number,
       eur_rate, merchant_received_eur, executed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
    ON CONFLICT (tx_hash) DO NOTHING
  `, [subscriptionId, merchantAddress, ownerAddress,
      amount, merchantReceived, fee, txHash, blockNumber,
      eurRate || null, merchantReceivedEur || null]);
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
    settlementPreference, ibanPlaintext, bic, accountHolder
  } = data;

  const ibanEncrypted = ibanPlaintext ? encrypt(ibanPlaintext) : null;

  await query(`
    INSERT INTO merchants
      (wallet_address, business_name, email, webhook_url, webhook_secret,
       settlement_preference, iban_encrypted, bic, account_holder,
       approved_at, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),NOW())
    ON CONFLICT (wallet_address) DO UPDATE SET
      business_name         = COALESCE(EXCLUDED.business_name, merchants.business_name),
      email                 = COALESCE(EXCLUDED.email, merchants.email),
      webhook_url           = COALESCE(EXCLUDED.webhook_url, merchants.webhook_url),
      webhook_secret        = COALESCE(EXCLUDED.webhook_secret, merchants.webhook_secret),
      settlement_preference = COALESCE(EXCLUDED.settlement_preference, merchants.settlement_preference),
      iban_encrypted        = COALESCE(EXCLUDED.iban_encrypted, merchants.iban_encrypted),
      bic                   = COALESCE(EXCLUDED.bic, merchants.bic),
      account_holder        = COALESCE(EXCLUDED.account_holder, merchants.account_holder),
      updated_at            = NOW()
  `, [walletAddress, businessName || null, email || null, webhookUrl || null,
      webhookSecret || null, settlementPreference || "usdc",
      ibanEncrypted, bic || null, accountHolder || null]);
}

async function getMerchant(walletAddress) {
  const res = await query(
    "SELECT * FROM merchants WHERE wallet_address = $1",
    [walletAddress]
  );
  if (!res.rows[0]) return null;
  const m = res.rows[0];
  // Decrypt IBAN only when needed — never expose in general queries
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
// Exports
// -----------------------------------------------------------------------------

module.exports = {
  query,
  initSchema,
  encrypt,
  decrypt,
  // Subscriptions
  upsertSubscription,
  updateSubscriptionStatus,
  getSubscription,
  getSubscriptionsByMerchant,
  // Payments
  insertPayment,
  getPaymentsByMerchant,
  // Merchants
  upsertMerchant,
  getMerchant,
  getMerchantWebhook,
  // Webhooks
  logWebhookDelivery,
  // Health
  healthCheck,
  pool,
};
