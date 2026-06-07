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
  // Migration: add trial_days to existing products table
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS intro_amount   NUMERIC(18,6) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS intro_pulls    INTEGER       NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS yearly_amount  NUMERIC(18,6) DEFAULT NULL`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS payment_methods TEXT[] DEFAULT ARRAY['crypto']`);

  // Stripe checkout sessions — track pending payments before on-chain confirmation
  await query(`
    CREATE TABLE IF NOT EXISTS stripe_checkout_sessions (
      id                  SERIAL PRIMARY KEY,
      session_id          TEXT UNIQUE NOT NULL,
      merchant_address    TEXT NOT NULL,
      product_slug        TEXT NOT NULL,
      subscriber_email    TEXT NOT NULL,
      subscriber_wallet   TEXT NOT NULL,
      amount_eur          NUMERIC(10,2) NOT NULL,
      currency            TEXT NOT NULL DEFAULT 'eur',
      status              TEXT NOT NULL DEFAULT 'pending',
      stripe_payment_intent TEXT,
      completed_at        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stripe_sessions_session_id ON stripe_checkout_sessions(session_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stripe_sessions_merchant ON stripe_checkout_sessions(merchant_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stripe_sessions_subscriber ON stripe_checkout_sessions(subscriber_email)`);

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

  console.log("[DB] Schema ready ✓");
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

  await query(`
    INSERT INTO payments
      (subscription_id, merchant_address, owner_address, amount,
       merchant_received, fee, tx_hash, block_number,
       token_address, token_symbol,
       eur_rate, merchant_received_eur,
       chf_rate, chf_amount,
       fiat_currency, fiat_rate, fiat_amount,
       protocol_fee_usdc, protocol_fee_eur, protocol_fee_chf,
       executed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
    ON CONFLICT (tx_hash) DO NOTHING
  `, [
    subscriptionId, merchantAddress?.toLowerCase(), ownerAddress?.toLowerCase(),
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
// Product helpers
// -----------------------------------------------------------------------------

async function upsertProduct(merchantAddress, data) {
  const {
    slug, name, amount, interval,
    trialDays = 0, introAmount = 0, introPulls = 0,
    yearlyAmount = null, paymentMethods = ["crypto"],
    price_type = "crypto", fiat_currency = "eur",
    fiat_price = null, fiat_yearly_price = null,
    description = null, image_url = null,
  } = data;

  const res = await query(`
    INSERT INTO products (
      merchant_address, slug, name, amount, interval,
      trial_days, intro_amount, intro_pulls, yearly_amount, payment_methods,
      price_type, fiat_currency, fiat_price, fiat_yearly_price,
      created_at, updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
    ON CONFLICT (merchant_address, slug) DO UPDATE SET
      name              = EXCLUDED.name,
      amount            = EXCLUDED.amount,
      interval          = EXCLUDED.interval,
      trial_days        = EXCLUDED.trial_days,
      intro_amount      = EXCLUDED.intro_amount,
      intro_pulls       = EXCLUDED.intro_pulls,
      yearly_amount     = EXCLUDED.yearly_amount,
      payment_methods   = EXCLUDED.payment_methods,
      price_type        = EXCLUDED.price_type,
      fiat_currency     = EXCLUDED.fiat_currency,
      fiat_price        = EXCLUDED.fiat_price,
      fiat_yearly_price = EXCLUDED.fiat_yearly_price,
      active            = TRUE,
      updated_at        = NOW()
    RETURNING *
  `, [
    merchantAddress, slug, name, amount, interval,
    trialDays, introAmount, introPulls, yearlyAmount, paymentMethods,
    price_type, fiat_currency, fiat_price, fiat_yearly_price,
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
// Stripe checkout session helpers
// -----------------------------------------------------------------------------

async function createCheckoutSession(data) {
  const { sessionId, merchantAddress, productSlug, subscriberEmail, subscriberWallet, amountEur, currency } = data;
  const res = await query(`
    INSERT INTO stripe_checkout_sessions
      (session_id, merchant_address, product_slug, subscriber_email, subscriber_wallet, amount_eur, currency, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    RETURNING *
  `, [sessionId, merchantAddress, productSlug, subscriberEmail, subscriberWallet, amountEur, currency || "eur"]);
  return res.rows[0];
}

async function getCheckoutSession(sessionId) {
  const res = await query(
    "SELECT * FROM stripe_checkout_sessions WHERE session_id = $1",
    [sessionId]
  );
  return res.rows[0] || null;
}

async function completeCheckoutSession(sessionId, paymentIntentId) {
  await query(`
    UPDATE stripe_checkout_sessions
    SET status = 'completed', stripe_payment_intent = $2, completed_at = NOW()
    WHERE session_id = $1
  `, [sessionId, paymentIntentId]);
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
    RETURNING *
  `, [merchantAddress?.toLowerCase(), importType, email?.toLowerCase(), walletAddress?.toLowerCase(), productSlug, amountUsdc, interval]);
  return res.rows[0];
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
  getSubscription,
  getSubscriptionsByMerchant,
  // Payments
  insertPayment,
  getPaymentsByMerchant,
  // Merchants
  upsertMerchant,
  getMerchant,
  getMerchantWebhook,
  // Products
  upsertProduct,
  getProduct,
  getMerchantProducts,
  deactivateProduct,
  // Stripe checkout sessions
  createCheckoutSession,
  getCheckoutSession,
  completeCheckoutSession,
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
};
