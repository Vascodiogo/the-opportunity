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
const db      = require("./db");

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
      WHERE merchant_address = $1
      ORDER BY created_at DESC
    `, [address]);

    // For each subscription, try to match vault address to a subscriber record
    const subscribers = await Promise.all(subsResult.rows.map(async (sub) => {
      const vaultAddress = sub.safe_vault || sub.owner_address;

      // Look up subscriber by wallet address
      const subscriberResult = await db.query(
        "SELECT email, name, avatar_url, created_at FROM subscribers WHERE wallet_address = $1",
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

// -----------------------------------------------------------------------------
// POST /api/webhooks/test
// -----------------------------------------------------------------------------
app.post("/api/webhooks/test", requireMerchantAuth, async (req, res) => {
  try {
    const merchant = await db.getMerchant(req.merchantAddress);
    if (!merchant?.webhook_url) {
      return res.status(400).json({ error: "no_webhook", message: "No webhook URL configured" });
    }

    const { dispatchWebhook } = require("./webhook");
    await dispatchWebhook(req.merchantAddress, "webhook.test", {
      message: "This is a test webhook from AuthOnce",
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: "Test webhook dispatched" });
  } catch (err) {
    console.error("[API] Webhook test error:", err.message);
    res.status(500).json({ error: "server_error" });
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

// POST /api/products/:merchantAddress — create or update a product (merchant auth)
app.post("/api/products/:merchantAddress", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.merchantAddress.toLowerCase();
    if (address !== req.merchantAddress) return res.status(403).json({ error: "forbidden" });

    const { name, amount, interval, trial_days = 0, intro_amount = 0, intro_pulls = 0, yearly_amount = null, payment_methods = ["crypto"] } = req.body;
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
    const amountUsdc  = isYearly ? parseFloat(product.yearly_amount) : parseFloat(product.amount);
    // Convert USDC to EUR (approximate — use live rate in production)
    // For now use 1:1 (USDC ≈ EUR for simplicity, merchant can adjust)
    const amountEur   = Math.round(amountUsdc * 100); // in cents

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
          currency: "eur",
          unit_amount: amountEur,
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
        authonce_protocol: "v4",
      },
    }, {
      stripeAccount: merchant.stripe_account_id,
    });

    // Save checkout session to DB
    await db.createCheckoutSession({
      sessionId:        session.id,
      merchantAddress:  address,
      productSlug:      product_slug,
      subscriberEmail:  "pending", // Will be filled when subscriber completes checkout
      subscriberWallet: "pending",
      amountEur:        amountUsdc,
      currency:         "eur",
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

      // ── Checkout completed — fiat subscriber paid via card ──────────────────
      // Marks the checkout session complete in DB.
      // TODO: Once Circle/Transak fiat onramp is wired, this is where we:
      //   1. Convert EUR payment to USDC
      //   2. Fund subscriber custodied wallet
      //   3. Call createSubscription on-chain using subscriber's custodied key
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log(`[WEBHOOK] Checkout completed: ${session.id}`);

        if (session.payment_intent) {
          await db.completeCheckoutSession(session.id, session.payment_intent);
          console.log(`[WEBHOOK] Session ${session.id} marked complete`);

          // Look up the checkout session to get subscriber + merchant details
          const checkoutSession = await db.getCheckoutSession(session.id);
          if (checkoutSession) {
            console.log(`[WEBHOOK] Subscriber: ${checkoutSession.subscriber_email}`);
            console.log(`[WEBHOOK] Merchant:   ${checkoutSession.merchant_address}`);
            console.log(`[WEBHOOK] Product:    ${checkoutSession.product_slug}`);
            console.log(`[WEBHOOK] Amount:     €${checkoutSession.amount_eur}`);

            // Notify merchant of new fiat subscriber
            const merchant = await db.getMerchant(checkoutSession.merchant_address);
            if (merchant?.email) {
              const { Resend } = require("resend");
              const resend = new Resend(process.env.RESEND_API_KEY);
              await resend.emails.send({
                from: "AuthOnce <notifications@authonce.io>",
                to: merchant.email,
                subject: `New subscriber — ${checkoutSession.subscriber_email}`,
                text: `A new subscriber (${checkoutSession.subscriber_email}) has paid €${checkoutSession.amount_eur} for ${checkoutSession.product_slug}.\n\nSubscription will be activated once their wallet is funded with USDC.\n\nAuthOnce`,
              }).catch(e => console.error("[WEBHOOK] Email error:", e.message));
            }

            // TODO: Trigger fiat → USDC → vault funding here
            // await fundSubscriberVault(checkoutSession);
            // await createOnChainSubscription(checkoutSession);
          }
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

          // Notify subscriber
          const subscriber = await db.getSubscriberByEmail(session.subscriber_email);
          if (subscriber?.email) {
            const { Resend } = require("resend");
            const resend = new Resend(process.env.RESEND_API_KEY);
            const merchant = await db.getMerchant(session.merchant_address);
            const merchantName = merchant?.business_name || session.merchant_address.slice(0, 8);
            await resend.emails.send({
              from: "AuthOnce <notifications@authonce.io>",
              to: subscriber.email,
              subject: `Payment failed — ${merchantName}`,
              html: `
                <p>Hi ${subscriber.name || "there"},</p>
                <p>Your payment for <strong>${merchantName}</strong> failed: <em>${pi.last_payment_error?.message || "card declined"}</em>.</p>
                <p>Your subscription is in a grace period. Please update your payment method to avoid cancellation.</p>
                <p><a href="https://authonce.io/my-subscriptions">Manage your subscription</a></p>
                <hr/>
                <p style="font-size:12px;color:#94a3b8;">AuthOnce · Non-custodial subscription protocol</p>
              `,
              text: `Your payment for ${merchantName} failed. Please update your payment method at authonce.io/my-subscriptions.`,
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
// DataOnce — reserved routes
// =============================================================================

app.get("/api/data/categories", (req, res) => {
  res.json({ categories: [], status: "coming_soon", message: "DataOnce data marketplace — launching after AuthOnce mainnet." });
});

app.get("/api/data/consents/:address", (req, res) => {
  res.json({ consents: [], status: "coming_soon", message: "DataOnce data marketplace — launching after AuthOnce mainnet." });
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
