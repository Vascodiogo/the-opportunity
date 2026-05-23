// scripts/api.js
// =============================================================================
//  AuthOnce — Merchant Registration API
//
//  Endpoints:
//    POST   /api/merchants/register     — Register a new merchant
//    GET    /api/merchants/:address     — Get merchant profile
//    PUT    /api/merchants/:address     — Update merchant profile
//    GET    /api/merchants/:address/subscriptions — Get all subscriptions
//    GET    /api/merchants/:address/payments      — Get payment history
//    POST   /api/webhooks/test          — Test webhook delivery
//    GET    /api/health                 — Health check
//
//  Product endpoints:
//    GET    /api/products/:merchantAddress/:productSlug — Public: get product (used by PayPage)
//    GET    /api/products/:merchantAddress              — Merchant: list all products
//    POST   /api/products/:merchantAddress              — Merchant: create/update product
//    DELETE /api/products/:merchantAddress/:productSlug — Merchant: deactivate product
//
//  Admin endpoints (JWT auth):
//    POST   /api/admin/login            — Email/password login → JWT token
//    GET    /api/admin/me               — Verify token
//    GET    /api/admin/stats            — Protocol overview stats
//    GET    /api/admin/fees/summary     — Fee summary
//    GET    /api/admin/fees/export      — CSV export
// =============================================================================

require("dotenv").config();
const express = require("express");
const crypto  = require("crypto");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const db             = require("./db");
const resendDomains   = require("./resend-domains");
const { templates }    = require("./email-templates");
const { Resend }       = require("resend");
const resend           = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const app  = express();
const PORT = process.env.API_PORT || 3001;

// Admin config
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "vasco@authonce.io";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET     = process.env.JWT_SECRET     || process.env.ADMIN_SECRET || "dev-secret-change-me";
const TOKEN_EXPIRY   = "12h";

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Merchant-Address, X-Admin-Secret");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// -----------------------------------------------------------------------------
// Geofencing — OFAC + Swiss SECO + EU sanctions compliance
//
// Returns HTTP 451 (Unavailable For Legal Reasons) for requests from
// sanctioned countries. IP is looked up but NEVER stored or logged.
//
// Sanctioned countries:
//   OFAC:      CU IR KP RU SY
//   OFAC+EU:   BY (Belarus)
//   OFAC+EU:   VE (Venezuela — financial sanctions)
//   Swiss SECO adds no additional countries beyond OFAC/EU for crypto
//
// Implementation uses ipapi.co — free tier, no API key, no IP logging.
// Falls back to ALLOW on lookup failure (better UX than blocking on error).
// -----------------------------------------------------------------------------

const SANCTIONED_COUNTRIES = new Set(["CU", "IR", "KP", "RU", "SY", "BY", "VE"]);

// Simple in-memory cache to avoid repeated lookups for the same IP
// Cache entries expire after 1 hour. IP → { country, cachedAt }
const geoCache = new Map();
const GEO_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function lookupCountry(ip) {
  // Skip lookup for localhost / private IPs
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip === "::ffff:127.0.0.1"
  ) {
    return null;
  }

  // Check cache
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.cachedAt < GEO_CACHE_TTL) {
    return cached.country;
  }

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2000); // 2s timeout
    const response   = await fetch(`https://ipapi.co/${ip}/country/`, {
      signal: controller.signal,
      headers: { "User-Agent": "AuthOnce-Compliance/1.0" },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const country = (await response.text()).trim().toUpperCase();

    // Validate it looks like a country code (2 letters)
    if (!/^[A-Z]{2}$/.test(country)) return null;

    // Cache the result — do NOT log the IP
    geoCache.set(ip, { country, cachedAt: Date.now() });

    // Clean old cache entries periodically
    if (geoCache.size > 10000) {
      const now = Date.now();
      for (const [key, val] of geoCache.entries()) {
        if (now - val.cachedAt > GEO_CACHE_TTL) geoCache.delete(key);
      }
    }

    return country;
  } catch {
    return null; // Fail open — don't block on lookup error
  }
}

async function geofenceMiddleware(req, res, next) {
  // Get real IP — Railway sets X-Forwarded-For
  const forwarded = req.headers["x-forwarded-for"];
  const ip        = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;

  const country = await lookupCountry(ip);

  if (country && SANCTIONED_COUNTRIES.has(country)) {
    console.log(`[GEOFENCE] Blocked request from sanctioned country: ${country} (IP not logged)`);
    return res.status(451).json({
      error:   "unavailable_for_legal_reasons",
      message: "This service is not available in your region due to applicable sanctions regulations.",
      status:  451,
    });
  }

  next();
}

// -----------------------------------------------------------------------------
// Auth middleware — merchant wallet
// -----------------------------------------------------------------------------

function requireMerchantAuth(req, res, next) {
  const address = req.headers["x-merchant-address"] || req.body?.wallet_address;
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return res.status(401).json({ error: "invalid_address", message: "Valid wallet address required in X-Merchant-Address header" });
  }
  req.merchantAddress = address.toLowerCase();
  next();
}

// -----------------------------------------------------------------------------
// Auth middleware — admin (JWT)
// -----------------------------------------------------------------------------

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== "admin") {
        return res.status(403).json({ error: "forbidden", message: "Admin access only." });
      }
      req.admin = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: "invalid_token", message: "Token expired or invalid." });
    }
  }

  const secret = req.headers["x-admin-secret"];
  if (secret && secret === process.env.ADMIN_SECRET) {
    req.admin = { email: ADMIN_EMAIL, role: "admin" };
    return next();
  }

  return res.status(401).json({ error: "unauthorized", message: "Admin authentication required." });
}

// -----------------------------------------------------------------------------
// Utility
// -----------------------------------------------------------------------------

function generateWebhookSecret() {
  return "whsec_" + crypto.randomBytes(32).toString("hex");
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

// Health check
app.get("/api/health", async (req, res) => {
  const dbOk = await db.healthCheck();
  res.json({
    status: dbOk ? "ok" : "degraded",
    service: "AuthOnce API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    database: dbOk ? "connected" : "disconnected",
  });
});

// -----------------------------------------------------------------------------
// POST /api/admin/login
// -----------------------------------------------------------------------------
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "missing_fields", message: "Email and password required." });
  }

  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password." });
  }

  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "server_error", message: "ADMIN_PASSWORD not configured in environment." });
  }

  if (!JWT_SECRET || JWT_SECRET === "dev-secret-change-me") {
    console.warn("[ADMIN] WARNING: Using default JWT_SECRET — set a real secret in Railway environment variables.");
  }

  let valid = false;
  if (ADMIN_PASSWORD.startsWith("$2")) {
    valid = await bcrypt.compare(password, ADMIN_PASSWORD);
  } else {
    valid = password === ADMIN_PASSWORD;
  }

  if (!valid) {
    console.warn(`[ADMIN] Failed login attempt for ${email}`);
    return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password." });
  }

  const token = jwt.sign(
    { email: ADMIN_EMAIL, role: "admin" },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  console.log(`[ADMIN] Login: ${email}`);
  res.json({ token, email: ADMIN_EMAIL, expires_in: TOKEN_EXPIRY });
});

// -----------------------------------------------------------------------------
// GET /api/admin/me
// -----------------------------------------------------------------------------
app.get("/api/admin/me", requireAdminAuth, (req, res) => {
  res.json({ email: req.admin.email, role: req.admin.role });
});

// -----------------------------------------------------------------------------
// GET /api/admin/stats
// -----------------------------------------------------------------------------
app.get("/api/admin/stats", requireAdminAuth, async (req, res) => {
  try {
    const [subResult, payResult] = await Promise.all([
      db.pool.query("SELECT COUNT(*) as total, status FROM subscriptions GROUP BY status"),
      db.pool.query("SELECT COUNT(*) as total, COALESCE(SUM(merchant_received::numeric), 0) as volume FROM payments"),
    ]);

    const statusCounts = {};
    subResult.rows.forEach(r => { statusCounts[r.status] = parseInt(r.total); });

    res.json({
      subscriptions: {
        active:    statusCounts.active    || 0,
        paused:    statusCounts.paused    || 0,
        cancelled: statusCounts.cancelled || 0,
        expired:   statusCounts.expired   || 0,
        total:     Object.values(statusCounts).reduce((a, b) => a + parseInt(b), 0),
      },
      payments: {
        total:        parseInt(payResult.rows[0]?.total || 0),
        volume_usdc:  parseFloat(payResult.rows[0]?.volume || 0) / 1e6,
      },
    });
  } catch (err) {
    console.error("[ADMIN] Stats error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// -----------------------------------------------------------------------------
// GET /api/admin/merchants — list all merchants with pending/approved status
// -----------------------------------------------------------------------------
app.get("/api/admin/merchants", requireAdminAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT wallet_address, business_name, email, approved_at, created_at
      FROM merchants
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json({ merchants: result.rows });
  } catch (err) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/admin/merchants/:address/approve — approve a merchant (off-chain DB flag)
// -----------------------------------------------------------------------------
app.post("/api/admin/merchants/:address/approve", requireAdminAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    await db.query(
      "UPDATE merchants SET approved_at = NOW() WHERE wallet_address = $1",
      [address]
    );
    res.json({ success: true, approved_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/admin/merchants/:address/reject — remove approval
// -----------------------------------------------------------------------------
app.post("/api/admin/merchants/:address/reject", requireAdminAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    await db.query(
      "UPDATE merchants SET approved_at = NULL WHERE wallet_address = $1",
      [address]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/merchants/register
// -----------------------------------------------------------------------------
app.post("/api/merchants/register", async (req, res) => {
  try {
    const {
      wallet_address, business_name, email, webhook_url,
      settlement_preference, iban, bic, account_holder,
    } = req.body;

    if (!wallet_address || !wallet_address.startsWith("0x") || wallet_address.length !== 42) {
      return res.status(400).json({ error: "invalid_wallet", message: "Valid Ethereum wallet address required" });
    }

    if (settlement_preference && !["usdc", "fiat"].includes(settlement_preference)) {
      return res.status(400).json({ error: "invalid_settlement", message: "settlement_preference must be 'usdc' or 'fiat'" });
    }

    if (settlement_preference === "fiat" && (!iban || !bic)) {
      return res.status(400).json({ error: "missing_bank_details", message: "IBAN and BIC required for fiat settlement" });
    }

    const webhookSecret = webhook_url ? generateWebhookSecret() : null;

    await db.upsertMerchant(wallet_address.toLowerCase(), {
      businessName: business_name, email, webhookUrl: webhook_url,
      webhookSecret, settlementPreference: settlement_preference || "usdc",
      ibanPlaintext: iban || null, bic: bic || null, accountHolder: account_holder || null,
    });

    const response = {
      success: true,
      merchant: {
        wallet_address: wallet_address.toLowerCase(),
        business_name: business_name || null,
        settlement_preference: settlement_preference || "usdc",
        webhook_configured: !!webhook_url,
      },
    };

    if (webhookSecret) {
      response.webhook_secret = webhookSecret;
      response.message = "Save your webhook secret — it will not be shown again.";
    }

    res.status(201).json(response);
  } catch (err) {
    console.error("[API] Registration error:", err.message);
    res.status(500).json({ error: "server_error", message: "Registration failed" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/merchants/:address
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address", async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    const merchant = await db.getMerchant(address);
    if (!merchant) {
      return res.status(404).json({ error: "not_found", message: "Merchant not found" });
    }

    res.json({
      wallet_address: merchant.wallet_address,
      business_name: merchant.business_name,
      email: merchant.email,
      webhook_configured: !!merchant.webhook_url,
      settlement_preference: merchant.settlement_preference,
      bank_account_configured: !!merchant.iban_encrypted || !!merchant.iban_decrypted,
      approved_at: merchant.approved_at,
      created_at: merchant.created_at,
    });
  } catch (err) {
    console.error("[API] Get merchant error:", err.message);
    res.status(500).json({ error: "server_error", message: "Failed to fetch merchant" });
  }
});

// -----------------------------------------------------------------------------
// PUT /api/merchants/:address
// -----------------------------------------------------------------------------
app.put("/api/merchants/:address", async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { business_name, email, webhook_url, settlement_preference, iban, bic, account_holder } = req.body;
    const webhookSecret = webhook_url ? generateWebhookSecret() : undefined;

    await db.upsertMerchant(address, {
      businessName: business_name, email, webhookUrl: webhook_url,
      webhookSecret, settlementPreference: settlement_preference,
      ibanPlaintext: iban, bic, accountHolder: account_holder,
    });

    const response = { success: true, message: "Merchant profile updated" };
    if (webhookSecret) {
      response.webhook_secret = webhookSecret;
      response.message = "Profile updated. Save your new webhook secret — it will not be shown again.";
    }

    res.json(response);
  } catch (err) {
    console.error("[API] Update merchant error:", err.message);
    res.status(500).json({ error: "server_error", message: "Failed to update merchant" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/merchants/:address/subscriptions
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address/subscriptions", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { status, limit = 50, offset = 0 } = req.query;
    const subs = await db.getSubscriptionsByMerchant(address, parseInt(limit), parseInt(offset), status);    res.json({
      merchant_address: address,
      subscriptions: subs.map(s => ({
        subscription_id: s.id,
        vault_address: s.owner_address,
        status: s.status,
        amount_usdc: (parseFloat(s.amount) / 1e6).toFixed(2),
        interval: s.interval,
        last_pulled_at: s.last_pulled_at,
        created_at: s.created_at,
      })),
      count: subs.length,
    });
  } catch (err) {
    console.error("[API] Subscriptions error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/merchants/:address/payments
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address/payments", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { limit = 50, offset = 0 } = req.query;
    const payments = await db.getPaymentsByMerchant(address, parseInt(limit), parseInt(offset));
    res.json({
      merchant_address: address,
      payments: payments.map(p => ({
        payment_id: p.id,
        subscription_id: p.subscription_id,
        vault_address: p.owner_address,
        amount_usdc: (parseFloat(p.amount) / 1e6).toFixed(2),
        merchant_received_usdc: (parseFloat(p.merchant_received) / 1e6).toFixed(2),
        protocol_fee_usdc: (parseFloat(p.fee) / 1e6).toFixed(4),
        merchant_received_eur: p.merchant_received_eur,
        tx_hash: p.tx_hash,
        executed_at: p.executed_at,
      })),
      count: payments.length,
    });
  } catch (err) {
    console.error("[API] Payments error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/merchants/:address/subscribers
// Cross-references on-chain vault addresses with the subscribers table
// Returns name + email for fiat subscribers, wallet address only for crypto-native
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address/subscribers", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Get all subscriptions for this merchant from DB
    const subsResult = await db.query(`
      SELECT id, owner_address, safe_vault, amount, interval, status, last_pulled_at, created_at
      FROM subscriptions
      WHERE LOWER(merchant_address) = $1
      ORDER BY created_at DESC
    `, [address]);

    // For each subscription, try to match vault address to a subscriber record
    const subscribers = await Promise.all(subsResult.rows.map(async (sub) => {
      const vaultAddress = sub.safe_vault || sub.owner_address;

      // Look up subscriber by wallet address
      const subscriberResult = await db.query(
        "SELECT email, name, avatar_url, created_at FROM subscribers WHERE LOWER(wallet_address) = $1",
        [vaultAddress.toLowerCase()]
      );
      const subscriberRecord = subscriberResult.rows[0];

      return {
        subscription_id:  sub.id,
        vault_address:    vaultAddress,
        amount_usdc:      (parseFloat(sub.amount) / 1e6).toFixed(2),
        interval:         sub.interval,
        status:           sub.status,
        last_pulled_at:   sub.last_pulled_at,
        subscribed_at:    sub.created_at,
        // Subscriber identity — null for crypto-native (anonymous)
        email:            subscriberRecord?.email || null,
        name:             subscriberRecord?.name  || null,
        type:             subscriberRecord ? "fiat" : "crypto",
      };
    }));

    res.json({ merchant_address: address, subscribers, count: subscribers.length });
  } catch (err) {
    console.error("[API] Merchant subscribers error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/webhooks — save a new webhook endpoint
app.post("/api/webhooks", requireMerchantAuth, async (req, res) => {
  try {
    const { url, events } = req.body;
    if (!url || !url.startsWith("https://")) {
      return res.status(400).json({ error: "invalid_url", message: "URL must start with https://" });
    }

    // Check if already exists for this merchant
    const existing = await db.query(
      "SELECT id FROM webhook_endpoints WHERE merchant_address = $1 AND url = $2",
      [req.merchantAddress, url]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "duplicate", message: "A webhook with this URL already exists." });
    }

    const secret = require("crypto").randomBytes(32).toString("hex");
    const result = await db.query(
      `INSERT INTO webhook_endpoints (merchant_address, url, events, secret, active, created_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW()) RETURNING id`,
      [req.merchantAddress, url, JSON.stringify(events || []), secret]
    );

    res.json({ success: true, id: result.rows[0].id, secret });
  } catch (err) {
    console.error("[API] Create webhook error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /api/merchants/:address/webhooks — list webhooks from DB
app.get("/api/merchants/:address/webhooks", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) return res.status(403).json({ error: "forbidden" });

    const result = await db.query(
      `SELECT id, url, events, active, created_at FROM webhook_endpoints 
       WHERE LOWER(merchant_address) = $1 AND active = TRUE 
       ORDER BY created_at DESC`,
      [address]
    );
    res.json({ webhooks: result.rows });
  } catch (err) {
    console.error("[API] List webhooks error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// -----------------------------------------------------------------------------
// POST /api/webhooks/test — fire a test ping to a specific webhook
// -----------------------------------------------------------------------------
app.post("/api/webhooks/test", requireMerchantAuth, async (req, res) => {
  try {
    const { webhook_id } = req.body;
    const result = await db.query(
      "SELECT * FROM webhook_endpoints WHERE id = $1 AND merchant_address = $2",
      [webhook_id, req.merchantAddress]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "not_found" });

    const wh = result.rows[0];
    const payload = {
      event: "test.ping",
      merchant_address: req.merchantAddress,
      timestamp: new Date().toISOString(),
      message: "This is a test delivery from AuthOnce.",
    };

    const { dispatchWebhook } = require("./webhook.js");
    await dispatchWebhook(req.merchantAddress, "test.ping", payload);
    res.json({ success: true, status: 200, url: wh.url });
  } catch (err) {
    console.error("[API] Webhook test error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// -----------------------------------------------------------------------------
// GET /api/admin/fees/summary
// -----------------------------------------------------------------------------
app.get("/api/admin/fees/summary", requireAdminAuth, async (req, res) => {
  try {
    const year  = req.query.year  ? parseInt(req.query.year)  : null;
    const month = req.query.month || null;

    let whereClause = "";
    let params = [];

    if (month) {
      const [y, m] = month.split("-");
      whereClause = "WHERE EXTRACT(YEAR FROM executed_at) = $1 AND EXTRACT(MONTH FROM executed_at) = $2";
      params = [parseInt(y), parseInt(m)];
    } else if (year) {
      whereClause = "WHERE EXTRACT(YEAR FROM executed_at) = $1";
      params = [year];
    }

    const result = await db.query(`
      SELECT
        COUNT(*)::int                     AS payment_count,
        SUM(fee::numeric)                 AS total_fees_raw,
        AVG(eur_rate::numeric)            AS avg_eur_rate,
        SUM(CASE WHEN eur_rate IS NOT NULL THEN (fee::numeric / 1000000) * eur_rate::numeric ELSE NULL END) AS total_fees_eur,
        MIN(executed_at)                  AS first_payment,
        MAX(executed_at)                  AS last_payment
      FROM payments ${whereClause}
    `, params);

    const row = result.rows[0];

    const breakdown = await db.query(`
      SELECT merchant_address, COUNT(*)::int AS payment_count, SUM(fee::numeric) AS fees_raw
      FROM payments ${whereClause}
      GROUP BY merchant_address ORDER BY fees_raw DESC
    `, params);

    res.json({
      period: month || (year ? year.toString() : "all time"),
      protocol_fees: {
        payment_count: row.payment_count || 0,
        total_fees_usdc: row.total_fees_raw ? (parseFloat(row.total_fees_raw) / 1000000).toFixed(6) : "0",
        total_fees_eur: row.total_fees_eur ? parseFloat(row.total_fees_eur).toFixed(2) : null,
        avg_eur_rate: row.avg_eur_rate ? parseFloat(row.avg_eur_rate).toFixed(4) : null,
        first_payment: row.first_payment,
        last_payment: row.last_payment,
      },
      per_merchant: breakdown.rows.map(r => ({
        merchant_address: r.merchant_address,
        payment_count: r.payment_count,
        fees_usdc: (parseFloat(r.fees_raw) / 1000000).toFixed(6),
      }))
    });
  } catch (err) {
    console.error("[API] Admin fees summary error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/admin/fees/export
// -----------------------------------------------------------------------------
app.get("/api/admin/fees/export", requireAdminAuth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

    const result = await db.query(`
      SELECT p.id, p.subscription_id, p.merchant_address, p.amount, p.merchant_received,
             p.fee, p.eur_rate, p.merchant_received_eur, p.tx_hash, p.executed_at
      FROM payments p
      WHERE EXTRACT(YEAR FROM p.executed_at) = $1
      ORDER BY p.executed_at ASC
    `, [year]);

    const rows = [
      ["Payment ID","Subscription ID","Merchant Address",
       "Total Amount USDC","Merchant Received USDC","Protocol Fee USDC",
       "EUR Rate","Protocol Fee EUR","Transaction Hash","Date"].join(",")
    ];

    for (const p of result.rows) {
      const feeUsdc = (parseFloat(p.fee) / 1000000).toFixed(6);
      const feeEur  = p.eur_rate ? (parseFloat(feeUsdc) * parseFloat(p.eur_rate)).toFixed(2) : "";
      rows.push([
        p.id, p.subscription_id, p.merchant_address,
        (parseFloat(p.amount) / 1000000).toFixed(6),
        (parseFloat(p.merchant_received) / 1000000).toFixed(6),
        feeUsdc, p.eur_rate || "", feeEur, p.tx_hash,
        new Date(p.executed_at).toISOString(),
      ].join(","));
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="authonce-fees-${year}.csv"`);
    res.send(rows.join("\n"));
  } catch (err) {
    console.error("[API] Admin fees export error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// -----------------------------------------------------------------------------
// POST /api/merchants/notify-admin
// -----------------------------------------------------------------------------
app.post("/api/merchants/notify-admin", async (req, res) => {
  try {
    const { business_name, email, wallet_address, website, use_case } = req.body;
    const { Resend } = require("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "AuthOnce <monitor@authonce.io>",
      to: process.env.ADMIN_EMAIL || "vasco@authonce.io",
      subject: `New merchant application: ${business_name}`,
      text: `New merchant application\n\nBusiness: ${business_name}\nEmail: ${email}\nWallet: ${wallet_address}\nWebsite: ${website || "N/A"}\n\nUse case:\n${use_case}`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[API] Notify admin error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// =============================================================================
// Products
// NOTE: Two-param route MUST be registered before one-param route.
// =============================================================================

// GET /api/products/:merchantAddress/:productSlug — PUBLIC (geofenced)
app.get("/api/products/:merchantAddress/:productSlug", geofenceMiddleware, async (req, res) => {
  try {
    const address = req.params.merchantAddress.toLowerCase();
    const slug    = req.params.productSlug;
    const product = await db.getProduct(address, slug);
    if (!product) return res.status(404).json({ error: "not_found", message: "Product not found or inactive." });
   res.json({
      id:               product.id,
      merchant_address: product.merchant_address,
      slug:             product.slug,
      name:             product.name,
      amount:           parseFloat(product.amount),
      interval:         product.interval,
      trial_days:       product.trial_days   || 0,
      intro_amount:     parseFloat(product.intro_amount || 0),
      intro_pulls:      parseInt(product.intro_pulls    || 0),
      yearly_amount:    product.yearly_amount ? parseFloat(product.yearly_amount) : null,
    });
  } catch (err) {
    console.error("[API] Get product error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/products/:merchantAddress — list all active products (merchant auth)
app.get("/api/products/:merchantAddress", async (req, res) => {
  try {
    const address = req.params.merchantAddress.toLowerCase();
    const products = await db.getMerchantProducts(address);
    res.json({
      products: products.map(p => ({
        id: p.id, slug: p.slug, name: p.name,
        amount:        parseFloat(p.amount),
        interval:      p.interval,
        trial_days:    p.trial_days   || 0,
        intro_amount:  parseFloat(p.intro_amount || 0),
        intro_pulls:   parseInt(p.intro_pulls    || 0),
        yearly_amount: p.yearly_amount ? parseFloat(p.yearly_amount) : null,
        created_at:    p.created_at,
      })),
    });
  } catch (err) {
    console.error("[API] List products error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

const VOLATILE_TOKENS = new Set(["weth", "cbbtc", "wbtc"]);

// POST /api/products/:merchantAddress — create or update a product (merchant auth)
app.post("/api/products/:merchantAddress", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.merchantAddress.toLowerCase();
    if (address !== req.merchantAddress) return res.status(403).json({ error: "forbidden" });

    const {
      name, amount, interval, trial_days = 0,
      intro_amount = 0, intro_pulls = 0,
      yearly_amount = null, payment_methods = ["crypto"],
      price_type = "crypto", fiat_currency = "eur",
      fiat_price = null, fiat_yearly_price = null,
    } = req.body;

    // Validate — reject volatile tokens (WETH, cbBTC require v6 oracle pricing)
    if (Array.isArray(payment_methods)) {
      const invalidTokens = payment_methods.filter(m => VOLATILE_TOKENS.has(m.toLowerCase()));
      if (invalidTokens.length > 0) {
        return res.status(400).json({
          error: "volatile_token",
          message: `Volatile tokens (${invalidTokens.join(", ")}) require USD-denominated oracle pricing. Available in v6. Use USDC, USDT, DAI or EURC.`,
          invalid_tokens: invalidTokens,
        });
      }
    }
    if (!name || !amount || !interval) {
      return res.status(400).json({ error: "missing_fields", message: "name, amount, interval required." });
    }
    if (!["weekly", "monthly", "yearly"].includes(interval)) {
      return res.status(400).json({ error: "invalid_interval", message: "interval must be weekly, monthly, or yearly." });
    }
    if (isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "invalid_amount", message: "amount must be a positive number." });
    }

    const trialDays      = Math.min(Math.max(parseInt(trial_days)    || 0, 0), 90);
    const introAmount    = Math.min(Math.max(parseFloat(intro_amount) || 0, 0), parseFloat(amount));
    const introPulls     = Math.min(Math.max(parseInt(intro_pulls)    || 0, 0), 12);
    const yearlyAmount   = yearly_amount && parseFloat(yearly_amount) > 0 ? parseFloat(yearly_amount) : null;
    const paymentMethods = Array.isArray(payment_methods) && payment_methods.length > 0
      ? payment_methods.filter(m => ["crypto","card","sepa","ideal","bancontact","eps","klarna","blik","mbway","multibanco"].includes(m))
      : ["crypto"];
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const product = await db.upsertProduct(address, { slug, name, amount: parseFloat(amount), interval, trialDays, introAmount, introPulls, yearlyAmount, paymentMethods });

    console.log(`[PRODUCTS] Upserted: ${address} / ${slug} (methods: ${paymentMethods.join(",")})`);
    res.status(201).json({
      id: product.id, slug: product.slug, name: product.name,
      amount:           parseFloat(product.amount),
      interval:         product.interval,
      trial_days:       product.trial_days   || 0,
      intro_amount:     parseFloat(product.intro_amount || 0),
      intro_pulls:      parseInt(product.intro_pulls    || 0),
      yearly_amount:    product.yearly_amount ? parseFloat(product.yearly_amount) : null,
      payment_methods:  product.payment_methods || ["crypto"],
      price_type:       product.price_type       || "crypto",
      fiat_currency:    product.fiat_currency    || "eur",
      fiat_price:       product.fiat_price       || null,
      fiat_yearly_price: product.fiat_yearly_price || null,
    });
  } catch (err) {
    console.error("[API] Create product error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/products/:merchantAddress/:productSlug — deactivate a product (merchant auth)
app.delete("/api/products/:merchantAddress/:productSlug", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.merchantAddress.toLowerCase();
    if (address !== req.merchantAddress) return res.status(403).json({ error: "forbidden" });
    await db.deactivateProduct(address, req.params.productSlug);
    console.log(`[PRODUCTS] Deactivated: ${address} / ${req.params.productSlug}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[API] Delete product error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// =============================================================================
// Payment Methods — country-aware
// =============================================================================

// Country → available local payment methods
const COUNTRY_METHODS = {
  PT: ["crypto", "card", "mbway", "multibanco", "sepa"],
  CH: ["crypto", "card", "sepa"],
  DE: ["crypto", "card", "sepa", "klarna"],
  AT: ["crypto", "card", "eps", "sepa"],
  NL: ["crypto", "card", "ideal", "sepa"],
  BE: ["crypto", "card", "bancontact", "sepa"],
  PL: ["crypto", "card", "blik", "sepa"],
  SE: ["crypto", "card", "klarna", "sepa"],
  NO: ["crypto", "card", "klarna"],
  FI: ["crypto", "card", "klarna", "sepa"],
  FR: ["crypto", "card", "sepa", "klarna"],
  ES: ["crypto", "card", "sepa"],
  IT: ["crypto", "card", "sepa"],
  // Default EU
  DEFAULT_EU: ["crypto", "card", "sepa"],
  // Default global
  DEFAULT: ["crypto", "card"],
};

// EU countries for SEPA
const EU_COUNTRIES = new Set(["AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK"]);

function getMethodsForCountry(countryCode) {
  if (!countryCode) return COUNTRY_METHODS.DEFAULT;
  const upper = countryCode.toUpperCase();
  if (COUNTRY_METHODS[upper]) return COUNTRY_METHODS[upper];
  if (EU_COUNTRIES.has(upper)) return COUNTRY_METHODS.DEFAULT_EU;
  return COUNTRY_METHODS.DEFAULT;
}

// GET /api/products/:merchantAddress/:productSlug/payment-methods
// Returns available payment methods for subscriber's country (IP-based)
// Intersects merchant-enabled methods with country-available methods
app.get("/api/products/:merchantAddress/:productSlug/payment-methods", async (req, res) => {
  try {
    const address = req.params.merchantAddress.toLowerCase();
    const slug    = req.params.productSlug;
    const product = await db.getProduct(address, slug);
    if (!product) return res.status(404).json({ error: "not_found" });

    // Get subscriber country from IP
    const forwarded = req.headers["x-forwarded-for"];
    const ip        = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;
    let country     = null;

    // Reuse geofencing country lookup (it's cached)
    try {
      country = await lookupCountry(ip);
    } catch { /* fail open */ }

    // Get country-available methods
    const countryMethods = getMethodsForCountry(country);

    // Get merchant-enabled methods (defaults to crypto only)
    const merchantMethods = product.payment_methods || ["crypto"];

    // Intersection: only show methods both merchant enabled AND available in country
    const available = merchantMethods.filter(m => countryMethods.includes(m));

    // Always include crypto if merchant has it enabled
    if (merchantMethods.includes("crypto") && !available.includes("crypto")) {
      available.unshift("crypto");
    }

    res.json({
      methods:  available.length > 0 ? available : ["crypto"],
      country:  country || "unknown",
      all_merchant_methods: merchantMethods,
    });
  } catch (err) {
    console.error("[API] Payment methods error:", err.message);
    res.json({ methods: ["crypto"], country: "unknown" });
  }
});

// POST /api/stripe/checkout — create Stripe Checkout session for fiat subscriber
app.post("/api/stripe/checkout", geofenceMiddleware, async (req, res) => {
  try {
    const { merchant_address, product_slug, payment_method, interval, success_url, cancel_url } = req.body;
    if (!merchant_address || !product_slug || !payment_method) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const address = merchant_address.toLowerCase();
    const product = await db.getProduct(address, product_slug);
    if (!product) return res.status(404).json({ error: "product_not_found" });

    // Get merchant's Stripe connected account
    const merchant = await db.getMerchant(address);
    if (!merchant?.stripe_account_id) {
      return res.status(400).json({ error: "stripe_not_connected", message: "This merchant has not connected Stripe. Only crypto payments are available." });
    }

    // Determine amount and currency
    const isYearly    = interval === "yearly" && product.yearly_amount;
    const priceType   = product.price_type   || "crypto";    // "crypto" | "fiat"
    const fiatCurrency = (product.fiat_currency || "eur").toLowerCase();

    let amountUsdc, stripeAmount, stripeCurrency;

    if (priceType === "fiat" && product.fiat_price > 0) {
      // Fixed fiat price — subscriber always pays same fiat amount
      // USDC amount varies slightly with exchange rate
      stripeCurrency = fiatCurrency;
      const fiatPrice  = isYearly && product.fiat_yearly_price
        ? parseFloat(product.fiat_yearly_price)
        : parseFloat(product.fiat_price);
      stripeAmount = ZERO_DECIMAL_CURRENCIES.has(fiatCurrency)
        ? Math.round(fiatPrice)
        : Math.round(fiatPrice * 100);
      amountUsdc = fiatToUsdc(fiatPrice, fiatCurrency);
      console.log(`[CHECKOUT] Fixed fiat: ${fiatPrice} ${fiatCurrency.toUpperCase()} → ${amountUsdc} USDC`);
    } else {
      // Fixed crypto price — subscriber pays fiat equivalent of USDC amount
      // Fiat amount varies with exchange rate
      stripeCurrency = fiatCurrency;
      amountUsdc   = isYearly && product.yearly_amount
        ? parseFloat(product.yearly_amount)
        : parseFloat(product.amount);
      await getFiatToUsdcRate(fiatCurrency); // warm cache
      stripeAmount = usdcToStripeAmount(amountUsdc, fiatCurrency);
      const displayFiat = ZERO_DECIMAL_CURRENCIES.has(fiatCurrency)
        ? stripeAmount
        : (stripeAmount / 100).toFixed(2);
      console.log(`[CHECKOUT] Fixed crypto: ${amountUsdc} USDC → ${displayFiat} ${fiatCurrency.toUpperCase()}`);
    }

    const amountEur = stripeAmount; // alias for downstream code

    // Map payment method to Stripe payment method types
    const stripeMethodMap = {
      card:       ["card"],
      sepa:       ["sepa_debit"],
      ideal:      ["ideal"],
      bancontact: ["bancontact"],
      eps:        ["eps"],
      klarna:     ["klarna"],
      blik:       ["blik"],
      mbway:      ["card"], // MB Way goes through card flow on Stripe
      multibanco: ["multibanco"],
    };
    const stripePaymentMethods = stripeMethodMap[payment_method] || ["card"];

    // Create Stripe Checkout session on merchant's connected account
    const session = await stripe.checkout.sessions.create({
      payment_method_types: stripePaymentMethods,
      line_items: [{
        price_data: {
          currency: stripeCurrency,
          unit_amount: stripeAmount,
          product_data: {
            name: product.name,
            description: `${product.name} — ${isYearly ? "yearly" : product.interval} subscription via AuthOnce`,
          },
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: success_url || `${process.env.FRONTEND_URL || "https://authonce.io"}/pay/${address}/${product_slug}?checkout=success`,
      cancel_url:  cancel_url  || `${process.env.FRONTEND_URL || "https://authonce.io"}/pay/${address}/${product_slug}`,
      metadata: {
        merchant_address: address,
        product_slug:     product_slug,
        payment_method:   payment_method,
        interval:         interval || product.interval,
        authonce_protocol: "v5",
      },
    }, {
      stripeAccount: merchant.stripe_account_id,
    });

    // Save checkout session to DB
    await db.createCheckoutSession({
      sessionId:        session.id,
      merchantAddress:  address,
      productSlug:      product_slug,
      subscriberEmail:  "pending",
      subscriberWallet: "pending",
      amountEur:        amountUsdc, // stored as USDC equivalent for vault funding
      currency:         stripeCurrency,
    });

    console.log(`[CHECKOUT] Created session ${session.id} for ${address}/${product_slug} via ${payment_method}`);
    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error("[CHECKOUT] Error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// =============================================================================
// STRIPE CONNECT — Merchant onboarding
// =============================================================================

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ── Multi-currency fiat/USDC rates via CoinGecko ─────────────────────────────
// Fetches all supported currencies in one call, cached 5 minutes.
// Zero-decimal currencies (JPY, KRW) are flagged for Stripe integer handling.

const SUPPORTED_CURRENCIES = [
  "eur", "usd", "gbp", "chf", "brl", "cad", "aud",
  "sek", "nok", "dkk", "sgd", "hkd", "inr", "jpy", "krw",
];

// Currencies with no decimal places — Stripe requires integer amounts
const ZERO_DECIMAL_CURRENCIES = new Set(["jpy", "krw"]);

// Fallback rates (approximate) if CoinGecko is unavailable
const FALLBACK_RATES = {
  eur: 0.92, usd: 1.00, gbp: 0.79, chf: 0.90, brl: 5.05,
  cad: 1.37, aud: 1.54, sek: 10.4, nok: 10.7, dkk: 6.89,
  sgd: 1.35, hkd: 7.82, inr: 83.5, jpy: 150.0, krw: 1330.0,
};

let _rateCache = { rates: null, ts: 0 };

async function getFiatToUsdcRate(currency = "eur") {
  const cur = currency.toLowerCase();
  const now = Date.now();

  // Refresh cache if stale (5 minutes)
  if (!_rateCache.rates || now - _rateCache.ts > 300_000) {
    try {
      const vs = SUPPORTED_CURRENCIES.join(",");
      const res  = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=${vs}`);
      const data = await res.json();
      const rates = data?.["usd-coin"];
      if (rates && Object.keys(rates).length > 0) {
        _rateCache = { rates, ts: now };
        console.log(`[RATE] Refreshed ${Object.keys(rates).length} currency rates`);
      }
    } catch (err) {
      console.warn("[RATE] CoinGecko fetch failed:", err.message);
    }
  }

  const rate = _rateCache.rates?.[cur] || FALLBACK_RATES[cur] || 1.0;
  return rate; // how many {currency} units = 1 USDC
}

// Convert USDC amount to Stripe integer (cents or base units)
// Zero-decimal currencies use whole numbers, others use cents
function usdcToStripeAmount(amountUsdc, currency) {
  const cur = currency.toLowerCase();
  const rate = _rateCache.rates?.[cur] || FALLBACK_RATES[cur] || 1.0;
  const fiatAmount = amountUsdc * rate;
  if (ZERO_DECIMAL_CURRENCIES.has(cur)) {
    return Math.round(fiatAmount); // JPY/KRW: no decimals
  }
  return Math.round(fiatAmount * 100); // all others: cents
}

// Convert fiat amount (fixed price) to USDC
function fiatToUsdc(fiatAmount, currency) {
  const cur = currency.toLowerCase();
  const rate = _rateCache.rates?.[cur] || FALLBACK_RATES[cur] || 1.0;
  return (fiatAmount / rate).toFixed(6);
}

// Keep backward compat
async function getEurToUsdcRate() { return getFiatToUsdcRate("eur"); }

// Helper: send branded email via Resend
async function sendBrandedEmail({ to, subject, html, text, from = "AuthOnce <notifications@authonce.io>" }) {
  if (!resend) return;
  try {
    await resend.emails.send({ from, to, subject, html, text });
  } catch (err) {
    console.error("[EMAIL] Send error:", err.message);
  }
}

app.get("/api/connect/authorize", requireMerchantAuth, async (req, res) => {
  try {
    const merchant = await db.getMerchant(req.merchantAddress);
    if (!merchant) return res.status(404).json({ error: "merchant_not_found", message: "Register as a merchant first." });
    if (!merchant.approved_at) return res.status(403).json({ error: "not_approved", message: "Your merchant application is pending approval." });
    if (merchant.stripe_account_id) return res.status(400).json({ error: "already_connected", message: "Stripe account already connected.", stripe_account_id: merchant.stripe_account_id });

    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: "config_error", message: "Stripe Connect not configured." });

    const state = Buffer.from(JSON.stringify({ wallet: req.merchantAddress, ts: Date.now() })).toString("base64");
    const redirectUri = `${process.env.FRONTEND_URL || "https://authonce.io"}/api/connect/callback`;

    const url = `https://connect.stripe.com/oauth/authorize?` +
      `response_type=code&client_id=${clientId}&scope=read_write` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&stripe_user[email]=${encodeURIComponent(merchant.email || "")}` +
      `&stripe_user[business_name]=${encodeURIComponent(merchant.business_name || "")}` +
      `&stripe_user[country]=PT`;

    console.log(`[CONNECT] OAuth URL generated for ${req.merchantAddress}`);
    res.json({ url });
  } catch (err) {
    console.error("[CONNECT] Authorize error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

app.get("/api/connect/callback", async (req, res) => {
  const FRONTEND = process.env.FRONTEND_URL || "https://authonce.io";
  try {
    const { code, state, error } = req.query;
    if (error) {
      console.warn(`[CONNECT] Merchant declined: ${error}`);
      return res.redirect(`${FRONTEND}/merchant?connect=declined`);
    }
    if (!code || !state) return res.status(400).json({ error: "missing_params" });

    let walletAddress;
    try {
      const decoded = JSON.parse(Buffer.from(decodeURIComponent(state), "base64").toString());
      walletAddress = decoded.wallet;
      if (Date.now() - decoded.ts > 15 * 60 * 1000) return res.redirect(`${FRONTEND}/merchant?connect=expired`);
    } catch (e) {
      return res.status(400).json({ error: "invalid_state" });
    }

    const response = await stripe.oauth.token({ grant_type: "authorization_code", code });
    const stripeAccountId = response.stripe_user_id;
    if (!stripeAccountId) return res.redirect(`${FRONTEND}/merchant?connect=error`);

    await db.query(
      "UPDATE merchants SET stripe_account_id = $1, stripe_connected_at = NOW(), updated_at = NOW() WHERE wallet_address = $2",
      [stripeAccountId, walletAddress]
    );

    console.log(`[CONNECT] ${walletAddress} connected Stripe account ${stripeAccountId}`);
    res.redirect(`${FRONTEND}/merchant?connect=success`);
  } catch (err) {
    console.error("[CONNECT] Callback error:", err.message);
    res.redirect(`${FRONTEND}/merchant?connect=error`);
  }
});

app.get("/api/connect/status", requireMerchantAuth, async (req, res) => {
  try {
    const merchant = await db.getMerchant(req.merchantAddress);
    if (!merchant) return res.status(404).json({ error: "merchant_not_found" });
    if (!merchant.stripe_account_id) return res.json({ connected: false });

    const account = await stripe.accounts.retrieve(merchant.stripe_account_id);
    res.json({
      connected: true,
      stripe_account_id: merchant.stripe_account_id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      connected_at: merchant.stripe_connected_at,
    });
  } catch (err) {
    console.error("[CONNECT] Status error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

app.delete("/api/connect/disconnect", requireMerchantAuth, async (req, res) => {
  try {
    const merchant = await db.getMerchant(req.merchantAddress);
    if (!merchant?.stripe_account_id) return res.status(400).json({ error: "not_connected" });

    await stripe.oauth.deauthorize({
      client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
      stripe_user_id: merchant.stripe_account_id,
    });
    await db.query(
      "UPDATE merchants SET stripe_account_id = NULL, stripe_connected_at = NULL, updated_at = NOW() WHERE wallet_address = $1",
      [req.merchantAddress]
    );

    console.log(`[CONNECT] ${req.merchantAddress} disconnected Stripe`);
    res.json({ success: true, message: "Stripe account disconnected." });
  } catch (err) {
    console.error("[CONNECT] Disconnect error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[WEBHOOK] Signature failed:", err.message);
    return res.status(400).json({ error: "invalid_signature" });
  }

  console.log(`[WEBHOOK] ${event.type}`);
  try {
    switch (event.type) {

      // ── Checkout completed — fiat subscriber paid ────────────────────────────
      // Phase A (manual USDC bridge):
      //   1. Mark session complete in DB
      //   2. Calculate USDC amount from EUR paid using live rate
      //   3. Create/upsert subscriber record
      //   4. Send subscriber a "payment received" confirmation email
      //   5. Send admin (Vasco) a "fund this vault" email with exact USDC amount
      //   6. Send merchant a "new subscriber" notification
      //
      // Phase B (post-audit): replace step 5 with automated treasury transfer
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log(`[WEBHOOK] Checkout completed: ${session.id}`);

        if (!session.payment_intent) break;

        await db.completeCheckoutSession(session.id, session.payment_intent);
        console.log(`[WEBHOOK] Session ${session.id} marked complete`);

        const cs = await db.getCheckoutSession(session.id);
        if (!cs) { console.log(`[WEBHOOK] No checkout session found for ${session.id}`); break; }

        console.log(`[WEBHOOK] Subscriber: ${cs.subscriber_email}`);
        console.log(`[WEBHOOK] Merchant:   ${cs.merchant_address}`);
        console.log(`[WEBHOOK] Product:    ${cs.product_slug}`);
        console.log(`[WEBHOOK] Amount EUR: €${cs.amount_eur}`);

        // Calculate exact USDC to send to vault
        // cs.amount_eur stores the USDC-equivalent amount set at checkout creation
        // For fiat-priced products: convert fiat back to USDC using live rate
        // For crypto-priced products: cs.amount_eur already IS the USDC amount
        const sessionCurrency = cs.currency || "eur";
        const amountUsdc = cs.amount_eur; // already stored as USDC equivalent
        const eurRate = await getFiatToUsdcRate(sessionCurrency);
        const product      = await db.getProduct(cs.merchant_address, cs.product_slug);
        const merchant     = await db.getMerchant(cs.merchant_address);
        const merchantName = merchant?.business_name || cs.merchant_address.slice(0, 8);

        // Upsert subscriber record (email from Stripe session)
        const subscriberEmail = session.customer_details?.email || cs.subscriber_email;
        const subscriberName  = session.customer_details?.name  || "";
        let subscriberVault   = cs.subscriber_wallet;

        if (subscriberEmail && subscriberEmail !== "pending") {
          try {
            // Create subscriber if not exists (Google OAuth may have already created them)
            const existing = await db.query(
              "SELECT wallet_address FROM subscribers WHERE email = $1",
              [subscriberEmail.toLowerCase()]
            );
            if (existing.rows[0]) {
              subscriberVault = existing.rows[0].wallet_address;
            } else {
              // Generate deterministic wallet for fiat subscriber
              const { ethers } = require("ethers");
              const seed       = `authonce:${subscriberEmail.toLowerCase()}`;
              const privateKey = ethers.keccak256(ethers.toUtf8Bytes(seed));
              const wallet     = new ethers.Wallet(privateKey);
              subscriberVault  = wallet.address;

              // Encrypt private key for DB storage
              const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-key-32-chars-minimum-length!";
              const iv             = crypto.randomBytes(16);
              const cipher         = crypto.createCipheriv("aes-256-gcm", Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
              const encrypted      = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
              const authTag        = cipher.getAuthTag();
              const encryptedKey   = iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted.toString("hex");

              await db.query(
                `INSERT INTO subscribers (email, name, wallet_address, wallet_private_key, created_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (email) DO NOTHING`,
                [subscriberEmail.toLowerCase(), subscriberName, wallet.address, encryptedKey]
              );
              console.log(`[WEBHOOK] Created subscriber wallet: ${wallet.address} for ${subscriberEmail}`);
            }

            // Update checkout session with real subscriber data
            await db.query(
              "UPDATE stripe_checkout_sessions SET subscriber_email = $1, subscriber_wallet = $2 WHERE session_id = $3",
              [subscriberEmail.toLowerCase(), subscriberVault, session.id]
            );
          } catch (err) {
            console.error("[WEBHOOK] Subscriber creation error:", err.message);
          }
        }

        // ── Email subscriber: payment received ────────────────────────────────
        if (subscriberEmail && subscriberEmail !== "pending") {
          const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
          const tpl = templates.paymentReceipt({
            name:        subscriberName || undefined,
            merchantName,
            amountUsdc:  parseFloat(amountUsdc).toFixed(2),
            date:        dateStr,
            txHash:      null,
            basescanUrl: null,
          });
          await sendBrandedEmail({
            to:      subscriberEmail,
            subject: templates.subjects.paymentReceipt(parseFloat(amountUsdc).toFixed(2), merchantName),
            ...tpl,
          });
          console.log(`[WEBHOOK] Subscriber receipt sent to ${subscriberEmail}`);
        }

        // ── Email admin (Vasco): fund this vault ──────────────────────────────
        // Phase A: manual USDC transfer. Vasco sends USDC from treasury to vault.
        // Phase B (post-audit): automate this via treasury wallet.
        const adminEmail = process.env.ADMIN_EMAIL || "vasco@authonce.io";
        const vaultAddress = subscriberVault && subscriberVault !== "pending" ? subscriberVault : "PENDING — subscriber wallet not yet created";
        const treasuryAddress = process.env.PROTOCOL_TREASURY_ADDRESS || "0x737D4EeAEF67f776724482a29367615703A2DEB1";

        await sendBrandedEmail({
          to:      adminEmail,
          subject: `⚡ Fund vault — ${amountUsdc} USDC → ${vaultAddress?.slice(0, 10)}...`,
          html: `
            <!DOCTYPE html><html><body style="font-family:monospace;background:#0f172a;color:#f1f5f9;padding:24px;">
            <h2 style="color:#34d399;">⚡ New Fiat Subscriber — Fund Vault Now</h2>
            <table style="border-collapse:collapse;width:100%;margin:16px 0;">
              <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">Subscriber</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${subscriberEmail}</td></tr>
              <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">Merchant</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${merchantName}</td></tr>
              <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">Product</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${cs.product_slug}</td></tr>
              <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">EUR paid</td><td style="padding:8px;border-bottom:1px solid #1e293b;">€${parseFloat(cs.amount_eur).toFixed(2)}</td></tr>
              <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">EUR/USDC rate</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${eurRate}</td></tr>
              <tr><td style="padding:8px;color:#34d399;font-weight:bold;border-bottom:1px solid #1e293b;">USDC to send</td><td style="padding:8px;color:#34d399;font-weight:bold;font-size:18px;border-bottom:1px solid #1e293b;">${amountUsdc} USDC</td></tr>
              <tr><td style="padding:8px;color:#34d399;font-weight:bold;border-bottom:1px solid #1e293b;">Send TO (vault)</td><td style="padding:8px;color:#34d399;font-weight:bold;font-family:monospace;border-bottom:1px solid #1e293b;">${vaultAddress}</td></tr>
              <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">Send FROM (treasury)</td><td style="padding:8px;font-family:monospace;border-bottom:1px solid #1e293b;">${treasuryAddress}</td></tr>
              <tr><td style="padding:8px;color:#94a3b8;">Stripe session</td><td style="padding:8px;font-family:monospace;font-size:11px;">${session.id}</td></tr>
            </table>
            <p style="color:#f59e0b;font-weight:bold;">Send exactly ${amountUsdc} USDC from the Protocol Treasury to the vault address above. The keeper will execute the first pull automatically once the vault is funded.</p>
            <p style="color:#475569;font-size:12px;margin-top:24px;">AuthOnce Protocol · Phase A manual bridge · phase-b-todo: automate this</p>
            </body></html>
          `,
          text: `NEW FIAT SUBSCRIBER\n\nSend ${amountUsdc} USDC to vault: ${vaultAddress}\nFrom treasury: ${treasuryAddress}\n\nSubscriber: ${subscriberEmail}\nMerchant: ${merchantName}\nProduct: ${cs.product_slug}\nEUR paid: €${cs.amount_eur}\nRate: ${eurRate}`,
        });
        console.log(`[WEBHOOK] Admin vault funding email sent to ${adminEmail}`);

        // ── Email merchant: new subscriber ────────────────────────────────────
        if (merchant?.email) {
          const tpl = templates.merchantNewSubscriber({
            amountUsdc:     parseFloat(amountUsdc).toFixed(2),
            interval:       product?.interval || cs.metadata?.interval || "monthly",
            subscriptionId: "pending",
            vaultAddress:   subscriberVault,
            txHash:         null,
            basescanUrl:    null,
          });
          await sendBrandedEmail({
            to:      merchant.email,
            subject: templates.subjects.merchantNewSubscriber(parseFloat(amountUsdc).toFixed(2), product?.interval || "monthly"),
            ...tpl,
          });
          console.log(`[WEBHOOK] Merchant new subscriber email sent to ${merchant.email}`);
        }

        break;
      }

      // ── Payment succeeded ────────────────────────────────────────────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        console.log(`[WEBHOOK] Payment succeeded: ${pi.id} — ${pi.amount / 100} ${pi.currency.toUpperCase()}`);
        // On-chain payment tracking is handled by notifier.js via PaymentExecuted event
        // No action needed here for crypto-native subscriptions
        break;
      }

      // ── Payment failed — trigger grace period ────────────────────────────────
      // Look up the subscription linked to this payment intent via checkout session
      // and pause it in the DB so the keeper knows it's in grace period
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.log(`[WEBHOOK] Payment failed: ${pi.id} — ${pi.last_payment_error?.message}`);

        // Find checkout session linked to this payment intent
        const result = await db.query(
          "SELECT * FROM stripe_checkout_sessions WHERE stripe_payment_intent = $1",
          [pi.id]
        );
        const session = result.rows[0];
        if (!session) { console.log(`[WEBHOOK] No session found for payment_intent ${pi.id}`); break; }

        // Find the subscription in DB
        const subResult = await db.query(
          "SELECT * FROM subscriptions WHERE owner_address = $1 AND merchant_address = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
          [session.subscriber_wallet, session.merchant_address]
        );
        const sub = subResult.rows[0];

        if (sub) {
          // Pause subscription — triggers grace period
          await db.updateSubscriptionStatus(sub.id, "paused", { pausedAt: new Date() });
          console.log(`[WEBHOOK] Subscription #${sub.id} paused due to payment failure`);

          // Notify subscriber using branded template
          const subscriber = await db.getSubscriberByEmail(session.subscriber_email);
          if (subscriber?.email) {
            const failedMerchant = await db.getMerchant(session.merchant_address);
            const failedMerchantName = failedMerchant?.business_name || session.merchant_address.slice(0, 8);
            const graceDays = 7;
            const graceDate = new Date(Date.now() + graceDays * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
            const tpl = templates.paymentFailedAllowance({
              name: subscriber.name,
              merchantName: failedMerchantName,
            });
            await sendBrandedEmail({
              to:      subscriber.email,
              subject: `Payment failed — ${failedMerchantName}`,
              ...tpl,
            }).catch(e => console.error("[WEBHOOK] Email error:", e.message));
          }

          // Notify merchant
          const { dispatchWebhook } = require("./webhook");
          await dispatchWebhook(session.merchant_address, "payment.failed", {
            subscription_id: sub.id,
            subscriber_email: session.subscriber_email,
            subscriber_wallet: session.subscriber_wallet,
            reason: pi.last_payment_error?.message || "card_declined",
            stripe_payment_intent: pi.id,
            status: "paused",
          }).catch(e => console.error("[WEBHOOK] Webhook dispatch error:", e.message));
        }
        break;
      }

      // ── Invoice paid ─────────────────────────────────────────────────────────
      case "invoice.paid": {
        const inv = event.data.object;
        console.log(`[WEBHOOK] Invoice paid: ${inv.id} — ${inv.amount_paid / 100} ${inv.currency.toUpperCase()}`);
        // Recurring Stripe invoice payment — log for now
        // On-chain subscription renewal is handled by keeper.js
        break;
      }

      // ── Invoice payment failed — grace period ────────────────────────────────
      case "invoice.payment_failed": {
        const inv = event.data.object;
        console.log(`[WEBHOOK] Invoice payment failed: ${inv.id} — customer: ${inv.customer}`);

        // Find subscription by Stripe customer ID
        const result = await db.query(
          "SELECT s.* FROM subscriptions s JOIN stripe_checkout_sessions cs ON cs.subscriber_wallet = s.owner_address WHERE cs.status = 'completed' AND s.status = 'active' AND s.merchant_address IN (SELECT wallet_address FROM merchants WHERE stripe_account_id IS NOT NULL) LIMIT 1"
        );

        if (result.rows[0]) {
          const sub = result.rows[0];
          await db.updateSubscriptionStatus(sub.id, "paused", { pausedAt: new Date() });
          console.log(`[WEBHOOK] Subscription #${sub.id} paused due to invoice payment failure`);
        }
        break;
      }

      // ── Stripe subscription cancelled ────────────────────────────────────────
      // When a Stripe subscription is cancelled, cancel the on-chain subscription too
      case "customer.subscription.deleted": {
        const stripeSub = event.data.object;
        console.log(`[WEBHOOK] Stripe subscription cancelled: ${stripeSub.id}`);

        // Find matching on-chain subscription via customer metadata
        // Stripe subscription metadata should contain merchant_address and subscriber_wallet
        const merchantAddress = stripeSub.metadata?.merchant_address;
        const subscriberWallet = stripeSub.metadata?.subscriber_wallet;

        if (merchantAddress && subscriberWallet) {
          const result = await db.query(
            "SELECT * FROM subscriptions WHERE merchant_address = $1 AND owner_address = $2 AND status = 'active'",
            [merchantAddress.toLowerCase(), subscriberWallet.toLowerCase()]
          );
          if (result.rows[0]) {
            await db.updateSubscriptionStatus(result.rows[0].id, "cancelled");
            console.log(`[WEBHOOK] Subscription #${result.rows[0].id} cancelled via Stripe webhook`);
            // NOTE: On-chain cancelSubscription() should also be called via custodied wallet
            // TODO: Call vault.cancelSubscription(id) using subscriber's custodied key
          }
        }
        break;
      }

      case "customer.subscription.created":
        console.log(`[WEBHOOK] Stripe subscription created: ${event.data.object.id}`); break;
      case "customer.subscription.updated":
        console.log(`[WEBHOOK] Stripe subscription updated: ${event.data.object.id} — ${event.data.object.status}`); break;
      case "customer.subscription.paused":
        console.log(`[WEBHOOK] Stripe subscription paused: ${event.data.object.id}`); break;
      case "customer.subscription.resumed":
        console.log(`[WEBHOOK] Stripe subscription resumed: ${event.data.object.id}`); break;
      case "charge.refunded":
        console.log(`[WEBHOOK] Charge refunded: ${event.data.object.id}`); break;
      default:
        console.log(`[WEBHOOK] Unhandled: ${event.type}`);
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[WEBHOOK] Processing error:", err.message);
    res.status(500).json({ error: "processing_error" });
  }
});

// =============================================================================
// Subscriber Authentication — Google OAuth + JWT
// =============================================================================

const passport       = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session        = require("express-session");
const { ethers }     = require("ethers");

app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === "production", maxAge: 10 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const res = await db.query("SELECT * FROM subscribers WHERE id = $1", [id]);
    done(null, res.rows[0] || null);
  } catch (err) { done(err); }
});

function generateSubscriberWallet(email) {
  const seed = process.env.WALLET_SEED_SECRET || process.env.ENCRYPTION_KEY || "authonce-subscriber-wallet-seed";
  const privateKey = ethers.keccak256(ethers.toUtf8Bytes(`${seed}:${email}`));
  const wallet = new ethers.Wallet(privateKey);
  return { address: wallet.address, privateKey };
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || "https://the-opportunity-production.up.railway.app/auth/google/callback",
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email     = profile.emails?.[0]?.value;
      const googleId  = profile.id;
      const name      = profile.displayName;
      const avatarUrl = profile.photos?.[0]?.value;

      if (!email) return done(new Error("No email from Google"));

      const { address: walletAddress, privateKey: walletPrivateKey } = generateSubscriberWallet(email);
      const encryptedKey = db.encrypt(walletPrivateKey);

      const subscriber = await db.upsertSubscriber({
        email, googleId, name, avatarUrl,
        walletAddress,
        walletPrivateKey: encryptedKey,
      });

      return done(null, subscriber);
    } catch (err) {
      return done(err);
    }
  }));
}

app.get("/auth/google", geofenceMiddleware, (req, res, next) => {
  const returnTo = req.query.returnTo || "/";
  const origin = req.query.origin || process.env.FRONTEND_URL || "https://authonce.io";
  const state = Buffer.from(JSON.stringify({ returnTo, origin })).toString("base64");
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
    state,
  })(req, res, next);
});

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: `${process.env.FRONTEND_URL || "https://authonce.io"}/pay?error=auth_failed` }),
  async (req, res) => {
    try {
      const subscriber = req.user;
      const token = jwt.sign(
        { sub: subscriber.id, email: subscriber.email, wallet: subscriber.wallet_address, type: "subscriber" },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );
      let returnTo = "/";
      let origin = process.env.FRONTEND_URL || "https://authonce.io";
      try {
        const state = JSON.parse(Buffer.from(req.query.state || "", "base64").toString());
        returnTo = state.returnTo || "/";
        origin = state.origin || origin;
      } catch (e) { /* use defaults */ }
      res.redirect(`${origin}${returnTo}?subscriber_token=${token}`);
    } catch (err) {
      console.error("[AUTH] Google callback error:", err.message);
      res.redirect(`${process.env.FRONTEND_URL || "https://authonce.io"}/pay?error=auth_failed`);
    }
  }
);

// POST /api/subscriber/cancel/:subscriptionId
// Type B (custodied wallet) cancel — backend signs the transaction
app.post("/api/subscriber/cancel/:subscriptionId", geofenceMiddleware, async (req, res) => {
  try {
    // Verify subscriber JWT
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "unauthorized" });
    const token = auth.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.type !== "subscriber") return res.status(401).json({ error: "invalid_token_type" });
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }

    const subscriptionId = parseInt(req.params.subscriptionId);
    if (isNaN(subscriptionId)) return res.status(400).json({ error: "invalid_subscription_id" });

    // Get subscriber record
    const subscriber = await db.getSubscriberByEmail(decoded.email);
    if (!subscriber) return res.status(404).json({ error: "subscriber_not_found" });

    // Must have a custodied wallet key to use this endpoint
    if (!subscriber.wallet_private_key) {
      return res.status(400).json({
        error: "not_custodied",
        message: "This subscription was created with your own wallet. Please connect your wallet to cancel.",
      });
    }

    // Decrypt private key
    const privateKey = db.decrypt(subscriber.wallet_private_key);

    // Sign and send cancelSubscription transaction
    const { ethers } = require("ethers");
    const provider   = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || "https://sepolia.base.org");
    const signer     = new ethers.Wallet(privateKey, provider);

    const VAULT_ABI_CANCEL = [
      {
        name: "cancelSubscription",
        type: "function",
        inputs: [{ name: "id", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
      {
        name: "subscriptions",
        type: "function",
        inputs: [{ name: "id", type: "uint256" }],
        outputs: [
          { name: "owner",    type: "address" },
          { name: "guardian", type: "address" },
          { name: "merchant", type: "address" },
          { name: "safeVault",type: "address" },
          { name: "amount",   type: "uint256" },
          { name: "introAmount", type: "uint256" },
          { name: "introPulls",  type: "uint256" },
          { name: "pullCount",   type: "uint256" },
          { name: "interval",    type: "uint8"   },
          { name: "lastPulledAt",type: "uint256" },
          { name: "pausedAt",    type: "uint256" },
          { name: "expiresAt",   type: "uint256" },
          { name: "trialEndsAt", type: "uint256" },
          { name: "gracePeriodDays", type: "uint256" },
          { name: "status",      type: "uint8"   },
        ],
        stateMutability: "view",
      },
    ];

    const VAULT_ADDRESS = process.env.VAULT_ADDRESS;
    if (!VAULT_ADDRESS) return res.status(500).json({ error: "vault_not_configured" });

    const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI_CANCEL, signer);

    // Verify this subscriber owns the subscription
    const sub = await vault.subscriptions(BigInt(subscriptionId));
    const subOwner    = sub[0].toLowerCase();
    const subVault    = sub[3].toLowerCase();
    const subscriberWallet = subscriber.wallet_address.toLowerCase();

    if (subOwner !== subscriberWallet && subVault !== subscriberWallet) {
      return res.status(403).json({ error: "not_your_subscription" });
    }

    // Check it's cancellable (Active=0 or Paused=1)
    const status = Number(sub[14]);
    if (status !== 0 && status !== 1) {
      return res.status(400).json({ error: "not_cancellable", message: "Subscription is already cancelled or expired." });
    }

    console.log(`[CANCEL] Subscriber ${decoded.email} cancelling subscription #${subscriptionId}`);
    const tx      = await vault.cancelSubscription(BigInt(subscriptionId));
    const receipt = await tx.wait();
    console.log(`[CANCEL] ✅ Cancelled subscription #${subscriptionId} — tx: ${tx.hash}`);

    res.json({
      success:         true,
      subscription_id: subscriptionId,
      tx_hash:         tx.hash,
      block_number:    receipt.blockNumber,
    });
  } catch (err) {
    console.error("[CANCEL] Error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});
app.get("/api/subscriber/me", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "unauthorized" });
    const token = auth.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== "subscriber") return res.status(401).json({ error: "invalid_token_type" });
    const subscriber = await db.getSubscriberByEmail(decoded.email);
    if (!subscriber) return res.status(404).json({ error: "subscriber_not_found" });
    res.json({
      id: subscriber.id,
      email: subscriber.email,
      name: subscriber.name,
      avatar_url: subscriber.avatar_url,
      wallet_address: subscriber.wallet_address,
    });
  } catch (err) {
    res.status(401).json({ error: "invalid_token" });
  }
});

// GET /api/subscriber/subscriptions/:walletAddress
app.get("/api/subscriber/subscriptions/:walletAddress", async (req, res) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();
    const result = await db.query(`
      SELECT
        s.id             AS subscription_id,
        s.merchant_address,
        s.amount,
        s.interval,
        s.status,
        s.last_pulled_at,
        s.created_at,
        m.business_name  AS merchant_name,
        p.name           AS product_name,
        p.slug           AS product_slug
      FROM subscriptions s
      LEFT JOIN merchants m ON LOWER(m.wallet_address) = LOWER(s.merchant_address)
      LEFT JOIN products p ON LOWER(p.merchant_address) = LOWER(s.merchant_address)
                            AND p.amount::numeric = (s.amount::numeric / 1000000)
                            AND p.active = TRUE
      WHERE LOWER(s.owner_address) = $1
         OR LOWER(s.safe_vault)    = $1
      ORDER BY s.created_at DESC
    `, [wallet]);

    res.json({
      wallet_address: wallet,
      subscriptions: result.rows.map(s => ({
        subscription_id: s.subscription_id,
        merchant_address: s.merchant_address,
        merchant_name:   s.merchant_name,
        product_name:    s.product_name,
        product_slug:    s.product_slug,
        amount_usdc:     (parseFloat(s.amount) / 1e6).toFixed(2),
        interval:        s.interval,
        status:          s.status,
        last_pulled_at:  s.last_pulled_at,
        created_at:      s.created_at,
      })),
    });
  } catch (err) {
    console.error("[API] Subscriber subscriptions error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});
// GET /api/subscriber/payments/:subscriptionId — payment history for a subscription
app.get("/api/subscriber/payments/:subscriptionId", async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.subscriptionId);
    if (isNaN(subscriptionId)) return res.status(400).json({ error: "invalid_id" });

    const result = await db.query(`
      SELECT id, amount, merchant_received, fee, tx_hash, executed_at
      FROM payments
      WHERE subscription_id = $1
      ORDER BY executed_at DESC
      LIMIT 50
    `, [subscriptionId]);

    res.json({
      payments: result.rows.map(p => ({
        payment_id:             p.id,
        amount_usdc:            (parseFloat(p.amount) / 1e6).toFixed(2),
        merchant_received_usdc: (parseFloat(p.merchant_received) / 1e6).toFixed(2),
        protocol_fee_usdc:      (parseFloat(p.fee) / 1e6).toFixed(4),
        tx_hash:                p.tx_hash,
        executed_at:            p.executed_at,
      })),
    });
  } catch (err) {
    console.error("[API] Subscriber payments error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// =============================================================================
// Merchant Vanity Handles
// =============================================================================

// POST /api/merchant/handle — claim or update a handle (merchant auth required)
app.post("/api/merchant/handle", requireMerchantAuth, async (req, res) => {
  try {
    const { handle } = req.body;
    if (!handle) return res.status(400).json({ error: "missing_handle" });

    const clean = handle.toLowerCase().trim();
    const valid = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(clean);
    if (!valid) return res.status(400).json({ error: "invalid_handle", message: "3–30 chars, lowercase letters, numbers, hyphens only. Cannot start or end with a hyphen." });

    const RESERVED = new Set(["admin","pay","api","app","auth","pricing","login","register","dashboard","my-subscriptions","health","data","connect","stripe","webhook","handle"]);
    if (RESERVED.has(clean)) return res.status(400).json({ error: "reserved_handle", message: "That handle is reserved." });

    // Check if taken by another wallet
    const existing = await db.query(
      "SELECT wallet_address FROM merchant_handles WHERE handle = $1",
      [clean]
    );
    if (existing.rows.length > 0 && existing.rows[0].wallet_address !== req.merchantAddress) {
      return res.status(409).json({ error: "handle_taken", message: "That handle is already taken." });
    }

    // Upsert: one handle per wallet (remove old one if switching)
    await db.query("DELETE FROM merchant_handles WHERE wallet_address = $1", [req.merchantAddress]);
    await db.query(
      "INSERT INTO merchant_handles (handle, wallet_address) VALUES ($1, $2)",
      [clean, req.merchantAddress]
    );

    res.json({ success: true, handle: clean, wallet_address: req.merchantAddress });
  } catch (err) {
    console.error("[HANDLE] Error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /api/handle/:handle — public, resolve handle → wallet address
app.get("/api/handle/:handle", async (req, res) => {
  try {
    const handle = req.params.handle.toLowerCase();
    const result = await db.query(
      "SELECT wallet_address FROM merchant_handles WHERE handle = $1",
      [handle]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "not_found" });
    res.json({ handle, wallet_address: result.rows[0].wallet_address });
  } catch (err) {
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/merchant/handle — get current handle for authenticated merchant
app.get("/api/merchant/handle", requireMerchantAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT handle FROM merchant_handles WHERE wallet_address = $1",
      [req.merchantAddress]
    );
    res.json({ handle: result.rows[0]?.handle || null });
  } catch (err) {
    res.status(500).json({ error: "server_error" });
  }
});

// =============================================================================
// DataOnce — reserved routes
// =============================================================================

app.get("/api/data/categories", (req, res) => {
  res.json({ categories: [], status: "coming_soon", message: "DataOnce data marketplace — launching after AuthOnce mainnet." });
});

app.get("/api/data/consents/:address", (req, res) => {
  res.json({ consents: [], status: "coming_soon", message: "DataOnce data marketplace — launching after AuthOnce mainnet." });
});

// =============================================================================
// Admin — Subscriptions, Subscribers, Payments, Webhooks, Audit, Tax
// =============================================================================

// GET /api/admin/subscriptions
app.get("/api/admin/subscriptions", requireAdminAuth, async (req, res) => {
  try {
    const { merchant, status, limit = 200, offset = 0 } = req.query;
    let query = "SELECT s.*, sub.email as subscriber_email FROM subscriptions s LEFT JOIN subscribers sub ON LOWER(sub.wallet_address) = LOWER(s.owner_address) WHERE 1=1";
    const params = [];
    if (merchant) { params.push(merchant.toLowerCase()); query += ` AND LOWER(s.merchant_address) = $${params.length}`; }
    if (status)   { params.push(status);                  query += ` AND s.status = $${params.length}`; }
    params.push(parseInt(limit), parseInt(offset));
    query += ` ORDER BY s.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await db.query(query, params);
    res.json({ subscriptions: result.rows, total: result.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/subscribers
app.get("/api/admin/subscribers", requireAdminAuth, async (req, res) => {
  try {
    const { limit = 200, offset = 0 } = req.query;
    const result = await db.query(
      "SELECT id, email, name, google_id, wallet_address, avatar_url, created_at FROM subscribers ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [parseInt(limit), parseInt(offset)]
    );
    res.json({ subscribers: result.rows, total: result.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/payments
app.get("/api/admin/payments", requireAdminAuth, async (req, res) => {
  try {
    const { merchant, limit = 200, offset = 0 } = req.query;
    let query = "SELECT * FROM payments WHERE 1=1";
    const params = [];
    if (merchant) { params.push(merchant.toLowerCase()); query += ` AND LOWER(merchant_address) = $${params.length}`; }
    params.push(parseInt(limit), parseInt(offset));
    query += ` ORDER BY executed_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await db.query(query, params);
    res.json({ payments: result.rows, total: result.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/webhooks
app.get("/api/admin/webhooks", requireAdminAuth, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await db.query(
      "SELECT * FROM webhook_deliveries ORDER BY created_at DESC LIMIT $1",
      [parseInt(limit)]
    );
    res.json({ deliveries: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/audit-log
app.get("/api/admin/audit-log", requireAdminAuth, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await db.query(
      "SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT $1",
      [parseInt(limit)]
    );
    res.json({ entries: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/subscriptions/:id/cancel — force cancel a subscription
app.post("/api/admin/subscriptions/:id/cancel", requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("UPDATE subscriptions SET status = 'cancelled' WHERE id = $1", [id]);
    // Log admin action
    await db.query(
      "INSERT INTO admin_audit_log (admin_email, action, target_type, target_id, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [req.adminEmail || "admin", "force_cancel_subscription", "subscription", id]
    );
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/tax/protocol-fees — AuthOnce protocol fee export (CSV)
app.get("/api/admin/tax/protocol-fees", requireAdminAuth, async (req, res) => {
  try {
    const { year, currency = "eur" } = req.query;
    let query = `
      SELECT
        executed_at, merchant_address, subscription_id,
        token_symbol,
        ROUND((fee::numeric / 1000000), 6)           AS fee_token,
        protocol_fee_usdc,
        protocol_fee_eur,
        protocol_fee_chf,
        eur_rate, chf_rate, tx_hash
      FROM payments
      WHERE fee::numeric > 0
      ${year ? "AND EXTRACT(YEAR FROM executed_at) = $1" : ""}
      ORDER BY executed_at DESC
      LIMIT 100000
    `;
    const result = await db.query(query, year ? [parseInt(year)] : []);

    const header = "Date,Merchant,Subscription ID,Token,Fee (token),Fee (USDC),Fee (EUR),Fee (CHF),EUR rate,CHF rate,TX Hash\n";
    const rows = result.rows.map(r => [
      r.executed_at ? new Date(r.executed_at).toISOString().split("T")[0] : "",
      r.merchant_address || "",
      r.subscription_id || "",
      r.token_symbol || "USDC",
      r.fee_token || "",
      r.protocol_fee_usdc || "",
      r.protocol_fee_eur || "",
      r.protocol_fee_chf || "",
      r.eur_rate || "",
      r.chf_rate || "",
      r.tx_hash || "",
    ].join(",")).join("
");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="authonce-protocol-fees-${year || "all"}-${currency}.csv"`);
    res.send(header + rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/tax/merchant — merchant payment export (CSV)
app.get("/api/admin/tax/merchant", requireAdminAuth, async (req, res) => {
  try {
    const { year, currency = "eur", merchant } = req.query;
    let query = `
      SELECT
        p.executed_at, p.merchant_address, p.subscription_id,
        p.token_symbol,
        ROUND((p.merchant_received::numeric / 1000000), 6) AS merchant_received_token,
        ROUND((p.fee::numeric / 1000000), 6)               AS fee_token,
        p.fiat_currency, p.fiat_amount, p.fiat_rate,
        p.merchant_received_eur, p.eur_rate,
        p.chf_amount, p.chf_rate,
        p.tx_hash, s.interval
      FROM payments p
      LEFT JOIN subscriptions s ON s.id::text = p.subscription_id
      WHERE 1=1
      ${merchant ? "AND LOWER(p.merchant_address) = $1" : ""}
      ${year ? `AND EXTRACT(YEAR FROM p.executed_at) = $${merchant ? 2 : 1}` : ""}
      ORDER BY p.executed_at DESC
      LIMIT 100000
    `;
    const params = [];
    if (merchant) params.push(merchant.toLowerCase());
    if (year) params.push(parseInt(year));

    const result = await db.query(query, params);

    const header = `Date,Merchant,Subscription ID,Token,Amount (token),Fee (token),${currency.toUpperCase()} equivalent,${currency.toUpperCase()} rate,EUR equivalent,EUR rate,TX Hash,Interval\n`;
    const rows = result.rows.map(r => {
      const fiatAmt  = currency === "eur" ? r.merchant_received_eur  : r.fiat_amount;
      const fiatRate = currency === "eur" ? r.eur_rate               : r.fiat_rate;
      return [
        r.executed_at ? new Date(r.executed_at).toISOString().split("T")[0] : "",
        r.merchant_address || "",
        r.subscription_id || "",
        r.token_symbol || "USDC",
        r.merchant_received_token || "",
        r.fee_token || "",
        fiatAmt || "",
        fiatRate || "",
        r.merchant_received_eur || "",
        r.eur_rate || "",
        r.tx_hash || "",
        r.interval || "",
      ].join(",");
    }).join("
");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="payments-${year || "all"}-${currency}.csv"`);
    res.send(header + rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// =============================================================================
// Merchant Custom Sender Domains (Business+ tier)
// =============================================================================

// POST /api/merchant/email-domain — register a custom sender domain
app.post("/api/merchant/email-domain", requireMerchantAuth, async (req, res) => {
  try {
    const { domain, sender_local_part } = req.body;
    if (!domain) return res.status(400).json({ error: "missing_domain" });

    // Check merchant tier — Business+ only
    const merchant = await db.getMerchant(req.merchantAddress);
    const tier = merchant?.tier || "starter";
    const allowedTiers = ["business", "enterprise"];
    if (!allowedTiers.includes(tier.toLowerCase())) {
      return res.status(403).json({
        error: "tier_required",
        message: "Custom sender domains require Business tier or above.",
        current_tier: tier,
        required_tier: "business",
      });
    }

    const result = await resendDomains.registerMerchantDomain(
      db, req.merchantAddress, domain, sender_local_part || "noreply"
    );
    res.json(result);
  } catch (err) {
    console.error("[API] Domain registration error:", err.message);
    res.status(400).json({ error: "domain_error", message: err.message });
  }
});

// POST /api/merchant/email-domain/verify — verify DNS records
app.post("/api/merchant/email-domain/verify", requireMerchantAuth, async (req, res) => {
  try {
    const result = await resendDomains.verifyMerchantDomain(db, req.merchantAddress);
    res.json(result);
  } catch (err) {
    console.error("[API] Domain verification error:", err.message);
    res.status(400).json({ error: "verification_error", message: err.message });
  }
});

// GET /api/merchant/email-domain — get domain status + DNS records
app.get("/api/merchant/email-domain", requireMerchantAuth, async (req, res) => {
  try {
    const result = await resendDomains.getMerchantDomainStatus(db, req.merchantAddress);
    if (!result) return res.json({ status: "none", message: "No custom domain registered." });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// DELETE /api/merchant/email-domain — remove custom domain
app.delete("/api/merchant/email-domain", requireMerchantAuth, async (req, res) => {
  try {
    const result = await resendDomains.deleteMerchantDomain(db, req.merchantAddress);
    res.json(result);
  } catch (err) {
    console.error("[API] Domain deletion error:", err.message);
    res.status(400).json({ error: "deletion_error", message: err.message });
  }
});

// =============================================================================
// Merchant Branding (Growth+ tier)
// =============================================================================

// POST /api/merchant/branding — set brand name and color for whitelabel emails
app.post("/api/merchant/branding", requireMerchantAuth, async (req, res) => {
  try {
    const { brand_name, brand_color } = req.body;

    // Check tier
    const merchant = await db.getMerchant(req.merchantAddress);
    const tier = merchant?.tier || "starter";
    const allowedTiers = ["growth", "business", "enterprise"];
    if (!allowedTiers.includes(tier.toLowerCase())) {
      return res.status(403).json({
        error: "tier_required",
        message: "Branded emails require Growth tier or above.",
        current_tier: tier,
        required_tier: "growth",
      });
    }

    // Validate color format
    if (brand_color && !/^#[0-9a-fA-F]{6}$/.test(brand_color)) {
      return res.status(400).json({ error: "invalid_color", message: "Color must be a valid hex code e.g. #34d399" });
    }

    await db.query(`
      UPDATE merchants
      SET brand_name  = $1,
          brand_color = $2,
          updated_at  = NOW()
      WHERE LOWER(wallet_address) = $3
    `, [brand_name || null, brand_color || null, req.merchantAddress]);

    res.json({ success: true, brand_name, brand_color });
  } catch (err) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /api/merchant/branding — get current branding settings
app.get("/api/merchant/branding", requireMerchantAuth, async (req, res) => {
  try {
    const merchant = await db.getMerchant(req.merchantAddress);
    res.json({
      brand_name:  merchant?.brand_name  || null,
      brand_color: merchant?.brand_color || null,
      tier:        merchant?.tier        || "starter",
    });
  } catch (err) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "not_found", message: `Route ${req.method} ${req.path} not found` });
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
async function main() {
  await db.initSchema();
  app.listen(PORT, () => {
    console.log("=".repeat(60));
    console.log("  AuthOnce — Merchant & Admin API");
    console.log("=".repeat(60));
    console.log(`  Listening on port ${PORT}`);
    console.log(`  Health:      http://localhost:${PORT}/api/health`);
    console.log(`  Admin login: http://localhost:${PORT}/api/admin/login`);
    console.log("=".repeat(60));
  });
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

module.exports = app;
