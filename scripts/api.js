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
const PORT = process.env.PORT || process.env.API_PORT || 3001;

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
  const health = await db.getSystemHealth().catch(() => []);
  const keeper = health.find(h => h.service === "keeper");
  const keeperAge = keeper?.last_run_at
    ? Math.floor((Date.now() - new Date(keeper.last_run_at).getTime()) / 1000)
    : null;
  const keeperOk = keeperAge !== null && keeperAge < 180; // stale if >3 min

  res.json({
    status:   dbOk && keeperOk ? "ok" : "degraded",
    service:  "AuthOnce API",
    version:  "1.0.0",
    timestamp: new Date().toISOString(),
    database: dbOk ? "connected" : "disconnected",
    keeper: {
      status:            keeperOk ? "ok" : keeper ? "stale" : "unknown",
      last_run_at:       keeper?.last_run_at || null,
      last_cycle_ms:     keeper?.last_cycle_ms || null,
      age_seconds:       keeperAge,
      total_cycles:      keeper?.total_cycles || 0,
      last_error:        keeper?.last_error || null,
      eth_balance:       keeper?.eth_balance       ? parseFloat(keeper.eth_balance)       : null,
      eth_balance_warn:  keeper?.eth_balance_warn  || false,
      deployer_eth:      keeper?.deployer_eth      ? parseFloat(keeper.deployer_eth)      : null,
      deployer_eth_warn: keeper?.deployer_eth_warn || false,
      safe_eth:          keeper?.safe_eth          ? parseFloat(keeper.safe_eth)          : null,
      safe_eth_warn:     keeper?.safe_eth_warn     || false,
      treasury_usdc:     keeper?.treasury_usdc     ? parseFloat(keeper.treasury_usdc)     : null,
    },
  });
});

// ─── GET /api/status — public status page endpoint ───────────────────────────
app.get("/api/status", async (req, res) => {
  try {
    const dbOk   = await db.healthCheck();
    const health = await db.getSystemHealth().catch(() => []);
    const keeper = health.find(h => h.service === "keeper");
    const keeperAge = keeper?.last_run_at
      ? Math.floor((Date.now() - new Date(keeper.last_run_at).getTime()) / 1000)
      : null;
    const keeperOk = keeperAge !== null && keeperAge < 180;

    // Failed pulls in last 24h
    const failedResult = await db.pool.query(`
      SELECT COUNT(*)::int AS count
      FROM webhook_deliveries
      WHERE status = 'failed'
        AND created_at > NOW() - INTERVAL '24 hours'
    `).catch(() => ({ rows: [{ count: 0 }] }));

    // Webhook success rate last 24h
    const webhookResult = await db.pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered
      FROM webhook_deliveries
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `).catch(() => ({ rows: [{ total: 0, delivered: 0 }] }));

    const wh = webhookResult.rows[0];
    const webhookRate = wh.total > 0
      ? Math.round((wh.delivered / wh.total) * 100)
      : 100;

    res.json({
      status:    dbOk && keeperOk ? "operational" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        api: {
          status:  "operational",
          latency: null,
        },
        database: {
          status: dbOk ? "operational" : "outage",
        },
        keeper: {
          status:            keeperOk ? "operational" : keeper ? "degraded" : "unknown",
          last_run_at:       keeper?.last_run_at  || null,
          last_cycle_ms:     keeper?.last_cycle_ms || null,
          age_seconds:       keeperAge,
          eth_balance:       keeper?.eth_balance       ? parseFloat(keeper.eth_balance)       : null,
          eth_balance_warn:  keeper?.eth_balance_warn  || false,
          safe_eth:          keeper?.safe_eth          ? parseFloat(keeper.safe_eth)          : null,
          safe_eth_warn:     keeper?.safe_eth_warn     || false,
          treasury_usdc:     keeper?.treasury_usdc     ? parseFloat(keeper.treasury_usdc)     : null,
        },
        contracts: {
          status:  "operational",
          network: process.env.NETWORK || "base-sepolia",
          vault:   process.env.VAULT_ADDRESS || null,
        },
      },
      metrics: {
        webhook_success_rate_24h: webhookRate,
        failed_webhooks_24h:      failedResult.rows[0].count,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/admin/login
// -----------------------------------------------------------------------------
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  // Rate limit — 5 attempts per IP per 15 minutes
  const ip = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.ip || "unknown";
  const rateCheck = checkLoginRateLimit(ip);
  if (!rateCheck.allowed) {
    console.warn(`[ADMIN] Rate limited login attempt from ${ip}`);
    return res.status(429).json({
      error: "too_many_attempts",
      message: `Too many login attempts. Try again in ${rateCheck.retryAfter} minute(s).`,
      retry_after_minutes: rateCheck.retryAfter,
    });
  }

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

  // Clear rate limit on successful login
  _loginAttempts.delete(ip);
  console.log(`[ADMIN] Login: ${email} from ${ip}`);
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
      country_code, vat_number, billing_address,
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

    // Validate VAT number format if provided
    // EU VAT numbers: 2-letter country code + alphanumeric (e.g. PT123456789, DE123456789)
    if (vat_number && !/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(vat_number.replace(/\s/g, "").toUpperCase())) {
      return res.status(400).json({ error: "invalid_vat", message: "VAT number must start with 2-letter country code (e.g. PT123456789)" });
    }

    const webhookSecret = webhook_url ? generateWebhookSecret() : null;

    await db.upsertMerchant(wallet_address.toLowerCase(), {
      businessName: business_name, email, webhookUrl: webhook_url,
      webhookSecret, settlementPreference: settlement_preference || "usdc",
      ibanPlaintext: iban || null, bic: bic || null, accountHolder: account_holder || null,
      countryCode: country_code || "PT",
      vatNumber: vat_number ? vat_number.replace(/\s/g, "").toUpperCase() : null,
      billingAddress: billing_address || null,
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
      country_code: merchant.country_code || "PT",
      vat_number: merchant.vat_number || null,
      billing_address: merchant.billing_address || null,
      approved_at: merchant.approved_at,
      created_at: merchant.created_at,
    });
  } catch (err) {
    console.error("[API] Get merchant error:", err.message);
    res.status(500).json({ error: "server_error", message: "Failed to fetch merchant" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/merchants/:address/analytics
// Returns monthly MRR, GTV, active subscriber counts, and churn events for
// the merchant's dashboard charts. Supports ?range=30d|6m|12m (default 12m).
//
// MRR definition: annualised monthly-equivalent of active subscription amounts.
//   weekly  → amount × 4.33
//   monthly → amount
//   yearly  → amount / 12
//
// GTV: gross transaction volume (sum of payment amounts before protocol fee).
// Net revenue: GTV × 0.995 (after 0.5% protocol fee).
// Churn: subscriptions whose status changed to cancelled/expired in the period.
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address/analytics", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Determine bucketing window
    const range = req.query.range || "12m";
    let months = 12;
    if (range === "6m")  months = 6;
    if (range === "30d") months = 1;
    if (range === "24m") months = 24;

    // ── Monthly GTV + payment count ────────────────────────────────────────
    const gtvResult = await db.pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', executed_at), 'YYYY-MM') AS month,
        COUNT(*)::int                                          AS payment_count,
        COALESCE(SUM(amount::numeric)      / 1e6, 0)          AS gtv_usdc,
        COALESCE(SUM(merchant_received::numeric) / 1e6, 0)    AS net_usdc,
        COALESCE(SUM(fee::numeric)         / 1e6, 0)          AS fee_usdc
      FROM payments
      WHERE LOWER(merchant_address) = $1
        AND executed_at >= NOW() - ($2 || ' months')::interval
      GROUP BY month
      ORDER BY month ASC
    `, [address, months]);

    // ── Snapshot of active subscriptions at end of each month ─────────────
    // We approximate MRR by looking at subscriptions that were active during
    // each month bucket (created before month end, not cancelled before month start).
    const mrrResult = await db.pool.query(`
      WITH months AS (
        SELECT generate_series(
          DATE_TRUNC('month', NOW() - ($2 || ' months')::interval),
          DATE_TRUNC('month', NOW()),
          '1 month'::interval
        ) AS month_start
      )
      SELECT
        TO_CHAR(m.month_start, 'YYYY-MM') AS month,
        COUNT(s.id)::int                  AS active_count,
        COALESCE(SUM(
          CASE s.interval
            WHEN 'weekly'  THEN (s.amount::numeric / 1e6) * 4.33
            WHEN 'yearly'  THEN (s.amount::numeric / 1e6) / 12
            ELSE                (s.amount::numeric / 1e6)
          END
        ), 0)                             AS mrr_usdc
      FROM months m
      LEFT JOIN subscriptions s
        ON LOWER(s.merchant_address) = $1
       AND s.created_at < m.month_start + INTERVAL '1 month'
       AND (s.status = 'active' OR (
             s.status IN ('cancelled','expired')
             AND s.updated_at > m.month_start + INTERVAL '1 month'
           ))
      GROUP BY m.month_start
      ORDER BY m.month_start ASC
    `, [address, months]);

    // ── Churn events per month ─────────────────────────────────────────────
    const churnResult = await db.pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', updated_at), 'YYYY-MM') AS month,
        COUNT(*)::int AS churned
      FROM subscriptions
      WHERE LOWER(merchant_address) = $1
        AND status IN ('cancelled', 'expired')
        AND updated_at >= NOW() - ($2 || ' months')::interval
      GROUP BY month
      ORDER BY month ASC
    `, [address, months]);

    // ── All-time summary stats ─────────────────────────────────────────────
    const summaryResult = await db.pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN status = 'active'  THEN id END)::int AS active_subs,
        COUNT(DISTINCT CASE WHEN status = 'paused'  THEN id END)::int AS paused_subs,
        COUNT(DISTINCT id)::int                                        AS total_subs,
        COUNT(DISTINCT CASE WHEN status IN ('cancelled','expired') THEN id END)::int AS churned_total
      FROM subscriptions
      WHERE LOWER(merchant_address) = $1
    `, [address]);

    const paymentSummaryResult = await db.pool.query(`
      SELECT
        COUNT(*)::int                                      AS total_payments,
        COALESCE(SUM(amount::numeric)      / 1e6, 0)      AS total_gtv,
        COALESCE(SUM(merchant_received::numeric) / 1e6, 0) AS total_net,
        COALESCE(SUM(fee::numeric)         / 1e6, 0)      AS total_fees
      FROM payments
      WHERE LOWER(merchant_address) = $1
    `, [address]);

    // ── Merge MRR + GTV buckets by month ──────────────────────────────────
    const mrrByMonth   = Object.fromEntries(mrrResult.rows.map(r => [r.month, r]));
    const gtvByMonth   = Object.fromEntries(gtvResult.rows.map(r => [r.month, r]));
    const churnByMonth = Object.fromEntries(churnResult.rows.map(r => [r.month, r.churned]));

    // Build complete month list for the range (fill gaps with zeros)
    const allMonths = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      allMonths.push({
        month:         key,
        mrr_usdc:      parseFloat(mrrByMonth[key]?.mrr_usdc || 0),
        active_count:  parseInt(mrrByMonth[key]?.active_count || 0),
        gtv_usdc:      parseFloat(gtvByMonth[key]?.gtv_usdc || 0),
        net_usdc:      parseFloat(gtvByMonth[key]?.net_usdc || 0),
        fee_usdc:      parseFloat(gtvByMonth[key]?.fee_usdc || 0),
        payment_count: parseInt(gtvByMonth[key]?.payment_count || 0),
        churned:       parseInt(churnByMonth[key] || 0),
      });
    }

    const summary   = summaryResult.rows[0];
    const paySum    = paymentSummaryResult.rows[0];
    const totalMRR  = allMonths.length ? allMonths[allMonths.length - 1].mrr_usdc : 0;
    const churnRate = summary.active_subs + summary.churned_total > 0
      ? (summary.churned_total / (summary.active_subs + summary.churned_total) * 100).toFixed(1)
      : "0.0";

    res.json({
      range,
      months: allMonths,
      summary: {
        active_subs:    summary.active_subs,
        paused_subs:    summary.paused_subs,
        total_subs:     summary.total_subs,
        churned_total:  summary.churned_total,
        churn_rate_pct: parseFloat(churnRate),
        current_mrr:    parseFloat(totalMRR).toFixed(2),
        total_gtv:      parseFloat(paySum.total_gtv).toFixed(2),
        total_net:      parseFloat(paySum.total_net).toFixed(2),
        total_fees:     parseFloat(paySum.total_fees).toFixed(4),
        total_payments: paySum.total_payments,
      },
    });
  } catch (err) {
    console.error("[API] Analytics error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
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

    const { business_name, email, webhook_url, settlement_preference, iban, bic, account_holder,
            country_code, vat_number, billing_address } = req.body;
    const webhookSecret = webhook_url ? generateWebhookSecret() : undefined;

    await db.upsertMerchant(address, {
      businessName: business_name, email, webhookUrl: webhook_url,
      webhookSecret, settlementPreference: settlement_preference,
      ibanPlaintext: iban, bic, accountHolder: account_holder,
      countryCode: country_code,
      vatNumber: vat_number ? vat_number.replace(/\s/g, "").toUpperCase() : undefined,
      billingAddress: billing_address,
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
// POST /api/subscriptions/link
// Links product_slug and subscriber notification prefs to a subscription by tx_hash
// Called from PayPage after on-chain subscription creation
// -----------------------------------------------------------------------------
app.post("/api/subscriptions/link", async (req, res) => {
  try {
    const {
      tx_hash, product_slug, merchant_address,
      subscriber_email, subscriber_webhook_url, is_contract_vault,
    } = req.body;

    if (!tx_hash) return res.status(400).json({ error: "tx_hash required" });

    // Find subscription by tx_hash
    const result = await db.query(
      "SELECT id FROM subscriptions WHERE tx_hash = $1 LIMIT 1",
      [tx_hash.toLowerCase()]
    );

    if (!result.rows.length) {
      // Subscription may not be indexed yet — return 202 and let notifier index it
      return res.status(202).json({ message: "subscription not yet indexed" });
    }

    const subId = result.rows[0].id;

    // Update product_slug and notification prefs
    await db.query(`
      UPDATE subscriptions SET
        product_slug           = COALESCE($2, product_slug),
        subscriber_email       = COALESCE($3, subscriber_email),
        subscriber_webhook_url = COALESCE($4, subscriber_webhook_url),
        is_contract_vault      = COALESCE($5, is_contract_vault),
        updated_at             = NOW()
      WHERE id = $1
    `, [
      subId,
      product_slug || null,
      subscriber_email || null,
      subscriber_webhook_url || null,
      is_contract_vault != null ? is_contract_vault : null,
    ]);

    console.log(`[API] Linked subscription ${subId}: product_slug=${product_slug}, email=${subscriber_email ? "set" : "none"}, webhook=${subscriber_webhook_url ? "set" : "none"}, contract=${is_contract_vault}`);
    res.json({ success: true, subscription_id: subId });
  } catch (err) {
    console.error("[API] subscriptions/link error:", err.message);
    res.status(500).json({ error: "server_error" });
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
// POST /api/merchants/:address/webhook — update merchant webhook URL
// Used by merchant dashboard to set/update their webhook endpoint
// -----------------------------------------------------------------------------
app.post("/api/merchants/:address/webhook", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { webhook_url } = req.body;
    if (!webhook_url || !webhook_url.startsWith("https://")) {
      return res.status(400).json({ error: "invalid_url", message: "Webhook URL must start with https://" });
    }

    const webhookSecret = generateWebhookSecret();
    await db.upsertMerchant(address, { webhookUrl: webhook_url, webhookSecret });

    res.json({
      success: true,
      webhook_configured: true,
      webhook_secret: webhookSecret,
      message: "Webhook URL updated. Save your webhook secret — it will not be shown again.",
    });
  } catch (err) {
    console.error("[API] Update webhook error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /api/merchants/:address/webhook — get current webhook config
app.get("/api/merchants/:address/webhook", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }
    const merchant = await db.getMerchant(address);
    if (!merchant) return res.status(404).json({ error: "not_found" });
    res.json({
      webhook_configured: !!merchant.webhook_url,
      webhook_url: merchant.webhook_url || null,
    });
  } catch (err) {
    console.error("[API] Get webhook error:", err.message);
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
      payment_methods:  product.payment_methods || ["crypto"],
      fiat_currency:    product.fiat_currency || "eur",
      crypto_discount_pct: product.crypto_discount_pct ? parseFloat(product.crypto_discount_pct) : 0,
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
        amount:              parseFloat(p.amount),
        interval:            p.interval,
        trial_days:          p.trial_days   || 0,
        intro_amount:        parseFloat(p.intro_amount || 0),
        intro_pulls:         parseInt(p.intro_pulls    || 0),
        yearly_amount:       p.yearly_amount ? parseFloat(p.yearly_amount) : null,
        payment_methods:     p.payment_methods    || ['crypto'],
        fiat_currency:       p.fiat_currency      || 'eur',
        crypto_discount_pct: p.crypto_discount_pct ? parseFloat(p.crypto_discount_pct) : 0,
        created_at:          p.created_at,
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
      fiat_currency = "eur", crypto_discount_pct = 0,
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
    if (!name || !interval) {
      return res.status(400).json({ error: "missing_fields", message: "name, interval required." });
    }
    if (!["weekly", "monthly", "yearly"].includes(interval)) {
      return res.status(400).json({ error: "invalid_interval", message: "interval must be weekly, monthly, or yearly." });
    }
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "invalid_amount", message: "amount must be a positive number." });
    }
    const finalAmount = parseFloat(amount);
    const discountPct = Math.min(Math.max(parseFloat(crypto_discount_pct) || 0, 0), 50);

    const trialDays      = Math.min(Math.max(parseInt(trial_days)    || 0, 0), 90);
    const introAmount    = Math.min(Math.max(parseFloat(intro_amount) || 0, 0), finalAmount);
    const introPulls     = Math.min(Math.max(parseInt(intro_pulls)    || 0, 0), 12);
    const yearlyAmount   = yearly_amount && parseFloat(yearly_amount) > 0 ? parseFloat(yearly_amount) : null;
    const paymentMethods = Array.isArray(payment_methods) && payment_methods.length > 0
      ? payment_methods.filter(m => ["crypto","card","sepa","ideal","bancontact","eps","klarna","blik","mbway","multibanco","usdc","usdt","dai","eurc"].includes(m))
      : ["crypto"];
    // Ensure crypto is always in payment methods for crypto-wallet subscriptions
    const finalPaymentMethods = paymentMethods.includes("crypto") ? paymentMethods : ["crypto", ...paymentMethods];
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const product = await db.upsertProduct(address, {
      slug, name, amount: finalAmount, interval, trialDays, introAmount, introPulls, yearlyAmount,
      payment_methods: finalPaymentMethods, fiat_currency, crypto_discount_pct: discountPct,
    });

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
      fiat_currency:    product.fiat_currency    || "eur",
      crypto_discount_pct: product.crypto_discount_pct ? parseFloat(product.crypto_discount_pct) : 0,
    });
  } catch (err) {
    console.error("[API] Create product error:", err.message);
    res.status(500).json({ error: "server_error" });
  }
});

// PUT /api/products/:merchantAddress/:productSlug — update a product (merchant auth)
app.put("/api/products/:merchantAddress/:productSlug", requireMerchantAuth, async (req, res) => {
  const address = req.params.merchantAddress.toLowerCase();
  if (address !== req.merchantAddress) return res.status(403).json({ error: "forbidden" });

  const {
    name, amount, interval, trial_days = 0,
    intro_amount = 0, intro_pulls = 0,
    yearly_amount = null, payment_methods = ["crypto"],
    fiat_currency = "eur", crypto_discount_pct = 0,
  } = req.body;

  if (!name || !amount || !interval) {
    return res.status(400).json({ error: "missing_fields", required: ["name", "amount", "interval"] });
  }

  if (Array.isArray(payment_methods)) {
    const invalid = payment_methods.filter(m => VOLATILE_TOKENS.has(m.toLowerCase()));
    if (invalid.length > 0) return res.status(400).json({ error: "volatile_token", invalid_tokens: invalid });
  }

  const discountPct = Math.min(Math.max(parseFloat(crypto_discount_pct) || 0, 0), 50);
  // Apply same whitelist filter and crypto guarantee as POST route
  const ALLOWED_METHODS = ['crypto','card','sepa','ideal','bancontact','eps','klarna','blik','mbway','multibanco','usdc','usdt','dai','eurc'];
  const filteredMethods = Array.isArray(payment_methods) && payment_methods.length > 0
    ? payment_methods.filter(m => ALLOWED_METHODS.includes(m))
    : ['crypto'];
  const finalPaymentMethods = filteredMethods.includes('crypto') ? filteredMethods : ['crypto', ...filteredMethods];

  try {
    const product = await db.upsertProduct(address, {
      slug:              req.params.productSlug,
      name, amount: parseFloat(amount), interval,
      trialDays:         parseInt(trial_days)    || 0,
      introAmount:       parseFloat(intro_amount) || 0,
      introPulls:        parseInt(intro_pulls)    || 0,
      yearlyAmount:      yearly_amount ? parseFloat(yearly_amount) : null,
      payment_methods:   finalPaymentMethods,
      fiat_currency,
      crypto_discount_pct: discountPct,
    });
    res.json({
      success: true,
      product: {
        ...product,
        amount:              parseFloat(product.amount),
        intro_amount:        parseFloat(product.intro_amount || 0),
        intro_pulls:         parseInt(product.intro_pulls    || 0),
        yearly_amount:       product.yearly_amount ? parseFloat(product.yearly_amount) : null,
        payment_methods:     product.payment_methods    || ['crypto'],
        fiat_currency:       product.fiat_currency      || 'eur',
        crypto_discount_pct: product.crypto_discount_pct ? parseFloat(product.crypto_discount_pct) : 0,
      },
    });
  } catch (err) {
    console.error('[API] PUT product error:', err.message);
    res.status(500).json({ error: 'server_error', message: err.message });
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
    const merchant = await db.getMerchant(address);
    let merchantMethods = product.payment_methods || ["crypto"];

    // If Stripe isn't connected, strip all fiat methods — only crypto/tokens remain
    const FIAT_METHODS = ["card","sepa","ideal","bancontact","eps","klarna","blik","mbway","multibanco"];
    if (!merchant?.stripe_account_id) {
      merchantMethods = merchantMethods.filter(m => !FIAT_METHODS.includes(m));
    }

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
      amount: parseFloat(product.amount),
      crypto_discount_pct: product.crypto_discount_pct ? parseFloat(product.crypto_discount_pct) : 0,
      fiat_currency: product.fiat_currency || "eur",
    });
  } catch (err) {
    console.error("[API] Payment methods error:", err.message);
    res.json({ methods: ["crypto"], country: "unknown" });
  }
});

// ── Login rate limiter — in-memory, resets on restart ─────────────────────────
// Max 5 attempts per IP per 15 minutes. Cloudflare Access is the primary guard
// but this adds a second layer in case someone bypasses it.
const _loginAttempts = new Map();
function checkLoginRateLimit(ip) {
  const now      = Date.now();
  const window   = 15 * 60 * 1000; // 15 minutes
  const maxTries = 5;
  const entry    = _loginAttempts.get(ip) || { count: 0, first: now };
  if (now - entry.first > window) {
    _loginAttempts.set(ip, { count: 1, first: now });
    return { allowed: true };
  }
  if (entry.count >= maxTries) {
    const retryAfter = Math.ceil((entry.first + window - now) / 1000 / 60);
    return { allowed: false, retryAfter };
  }
  entry.count++;
  _loginAttempts.set(ip, entry);
  return { allowed: true };
}

// =============================================================================
// Subscriber Authentication — Google OAuth + JWT
// =============================================================================

const passport       = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session        = require("express-session");
const { ethers }     = require("ethers");

// Use PostgreSQL session store to eliminate MemoryStore warning
// and persist sessions across Railway restarts.
const pgSession = require("connect-pg-simple")(session);
app.use(session({
  store: new pgSession({
    conString: process.env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: true,
    ssl: { rejectUnauthorized: false },
  }),
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
        // Complete v6 struct — all 19 fields in declaration order.
        // Always use named access (sub.owner, sub.status) — never numeric indexes.
        name: "subscriptions",
        type: "function",
        inputs: [{ name: "id", type: "uint256" }],
        outputs: [
          { name: "owner",              type: "address" },
          { name: "guardian",           type: "address" },
          { name: "merchant",           type: "address" },
          { name: "safeVault",          type: "address" },
          { name: "token",              type: "address" },
          { name: "amount",             type: "uint256" },
          { name: "introAmount",        type: "uint256" },
          { name: "introPulls",         type: "uint256" },
          { name: "pullCount",          type: "uint256" },
          { name: "interval",           type: "uint8"   },
          { name: "lastPulledAt",       type: "uint256" },
          { name: "billingPausedUntil", type: "uint256" },
          { name: "pausedAt",           type: "uint256" },
          { name: "expiresAt",          type: "uint256" },
          { name: "trialEndsAt",        type: "uint256" },
          { name: "gracePeriodDays",    type: "uint256" },
          { name: "dataVaultId",        type: "bytes32" },
          { name: "status",             type: "uint8"   },
          { name: "isContractVault",    type: "bool"    },
        ],
        stateMutability: "view",
      },
    ];

    const VAULT_ADDRESS = process.env.VAULT_ADDRESS;
    if (!VAULT_ADDRESS) return res.status(500).json({ error: "vault_not_configured" });

    const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI_CANCEL, signer);

    // Verify this subscriber owns the subscription.
    // Named field access — never numeric indexes.
    const sub = await vault.subscriptions(BigInt(subscriptionId));
    const subOwner         = sub.owner.toLowerCase();
    const subVault         = sub.safeVault.toLowerCase();
    const subscriberWallet = subscriber.wallet_address.toLowerCase();

    if (subOwner !== subscriberWallet && subVault !== subscriberWallet) {
      return res.status(403).json({ error: "not_your_subscription" });
    }

    // Check it's cancellable (Active=0 or Paused=1).
    // Named access: sub.status — correct regardless of struct field count.
    const status = Number(sub.status);
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

// Verifies that whoever is asking for wallet X's subscriptions actually
// controls wallet X — either via a Google-session JWT whose derived wallet
// matches, or via a fresh signed message from the wallet itself.
//
// Message format: "AuthOnce: view my subscriptions (<unix_ms_timestamp>)"
// The timestamp is checked against a 5-minute window so a captured signature
// can't be replayed indefinitely — it's not a nonce-backed session, but it
// closes the "any address in a URL returns that address's data" hole with no
// new schema or session storage required.
const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

async function verifySubscriptionsAccess(req, wallet) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
      if (decoded.type === "subscriber" && decoded.wallet?.toLowerCase() === wallet) {
        return true;
      }
    } catch { /* fall through to signature check */ }
  }

  const { signature, timestamp } = req.query;
  if (!signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_WINDOW_MS) return false;

  try {
    const message = `AuthOnce: view my subscriptions (${ts})`;
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === wallet;
  } catch {
    return false;
  }
}

// GET /api/subscriber/subscriptions/:walletAddress
// Requires either a matching Google-session JWT, or a fresh signature from
// the wallet itself (?signature=...&timestamp=...) proving ownership.
app.get("/api/subscriber/subscriptions/:walletAddress", async (req, res) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();

    const authorized = await verifySubscriptionsAccess(req, wallet);
    if (!authorized) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Sign a message with this wallet, or log in with the Google account linked to it.",
      });
    }

    const result = await db.query(`
      SELECT
        s.id             AS subscription_id,
        s.merchant_address,
        s.safe_vault,
        s.token,
        s.is_contract_vault,
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

    // Check which subscriptions came from Stripe (fiat)
    const fiatWallets = new Set();
    try {
      const fiatResult = await db.query(
        `SELECT LOWER(subscriber_wallet) AS w FROM stripe_checkout_sessions WHERE status = 'completed'`
      );
      fiatResult.rows.forEach(r => fiatWallets.add(r.w));
    } catch (e) { /* ignore */ }

    res.json({
      wallet_address: wallet,
      subscriptions: result.rows.map(s => ({
        subscription_id:   s.subscription_id,
        merchant_address:  s.merchant_address,
        safe_vault:        s.safe_vault,
        token:             s.token,
        is_contract_vault: s.is_contract_vault || false,
        is_fiat_subscriber: fiatWallets.has(s.owner_address?.toLowerCase()),
        merchant_name:     s.merchant_name,
        product_name:      s.product_name,
        product_slug:      s.product_slug,
        amount_usdc:       (parseFloat(s.amount) / 1e6).toFixed(2),
        interval:          s.interval,
        status:            s.status,
        last_pulled_at:    s.last_pulled_at,
        created_at:        s.created_at,
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

// DELETE /api/admin/subscribers/:email — GDPR right to erasure
// Deletes all PII for a subscriber. Retains anonymised payment records for tax/audit.
// Logs the deletion to audit_log for compliance evidence.
// Requires admin JWT. Rate-limited to prevent bulk scraping.
app.delete("/api/admin/subscribers/:email", requireAdminAuth, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "invalid_email" });
    }

    // Find subscriber
    const existing = await db.query(
      "SELECT id, email, wallet_address FROM subscribers WHERE email = $1",
      [email]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "subscriber_not_found" });
    }

    const subscriber = existing.rows[0];
    const walletAddress = subscriber.wallet_address;

    // 1. Cancel any active subscriptions in DB
    // (On-chain subscriptions must be cancelled separately via Safe multisig)
    const subResult = await db.query(
      "UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE owner_address = $1 AND status IN ('active', 'paused') RETURNING id",
      [walletAddress]
    );
    const cancelledSubs = subResult.rows.length;

    // 2. Auto cancel on-chain subscriptions for fiat subscribers (custodied wallet)
    // Crypto-native subscribers manage their own wallets — skipped if no private key stored
    let onChainCancelled = 0;
    let onChainSkipped   = 0;
    const onChainErrors  = [];

    if (subscriber.wallet_private_key && cancelledSubs > 0) {
      try {
        const { ethers } = require("ethers");
        const RPC_URL     = process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || "https://sepolia.base.org";
        const VAULT_ADDR  = process.env.VAULT_ADDRESS;

        if (VAULT_ADDR) {
          const privateKey = db.decrypt(subscriber.wallet_private_key);
          const provider   = new ethers.JsonRpcProvider(RPC_URL);
          const signer     = new ethers.Wallet(privateKey, provider);

          const VAULT_ABI_CANCEL = [
            { name: "cancelSubscription", type: "function", inputs: [{ name: "id", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
            { name: "subscriptions", type: "function", inputs: [{ name: "id", type: "uint256" }], outputs: [
              { name: "owner",              type: "address" },
              { name: "guardian",           type: "address" },
              { name: "merchant",           type: "address" },
              { name: "safeVault",          type: "address" },
              { name: "token",              type: "address" },
              { name: "amount",             type: "uint256" },
              { name: "introAmount",        type: "uint256" },
              { name: "introPulls",         type: "uint256" },
              { name: "pullCount",          type: "uint256" },
              { name: "interval",           type: "uint8"   },
              { name: "lastPulledAt",       type: "uint256" },
              { name: "billingPausedUntil", type: "uint256" },
              { name: "pausedAt",           type: "uint256" },
              { name: "expiresAt",          type: "uint256" },
              { name: "trialEndsAt",        type: "uint256" },
              { name: "gracePeriodDays",    type: "uint256" },
              { name: "dataVaultId",        type: "bytes32" },
              { name: "status",             type: "uint8"   },
              { name: "isContractVault",    type: "bool"    },
            ], stateMutability: "view" },
          ];

          const vault = new ethers.Contract(VAULT_ADDR, VAULT_ABI_CANCEL, signer);

          // Attempt to cancel each subscription on-chain
          for (const sub of subResult.rows) {
            try {
              const onChainSub = await vault.subscriptions(BigInt(sub.id));
              const status     = Number(onChainSub.status);

              // Only cancel if Active(0) or Paused(1)
              if (status === 0 || status === 1) {
                const tx = await vault.cancelSubscription(BigInt(sub.id));
                await tx.wait();
                onChainCancelled++;
                console.log(`[GDPR] ✅ On-chain cancelled subscription #${sub.id} — tx: ${tx.hash}`);
              } else {
                onChainSkipped++;
              }
            } catch (subErr) {
              onChainErrors.push({ id: sub.id, error: subErr.message });
              console.error(`[GDPR] ⚠️ Could not cancel subscription #${sub.id} on-chain: ${subErr.message}`);
            }
          }
        }
      } catch (err) {
        console.error(`[GDPR] On-chain cancellation error: ${err.message}`);
        onChainErrors.push({ error: err.message });
      }
    } else if (cancelledSubs > 0 && !subscriber.wallet_private_key) {
      // Crypto-native subscriber — no private key stored, cannot auto-cancel on-chain
      onChainSkipped = cancelledSubs;
      console.log(`[GDPR] Crypto-native subscriber — ${cancelledSubs} on-chain subscription(s) require manual cancellation via Safe multisig`);

      // Log pending on-chain cancellations to DB for dashboard visibility
      const subscriberHash = require("crypto").createHash("sha256").update(email).digest("hex").slice(0, 16);
      await db.createGdprPendingOnchain({
        subscriberHash,
        subscriptionIds: subResult.rows.map(s => s.id),
      }).catch(e => console.error("[GDPR] Could not log pending onchain:", e.message));
    }

    // 2. Anonymise payment records — retain for tax/audit, remove PII linkage
    // Replace subscriber wallet with anonymised placeholder in payment history
    await db.query(
      "UPDATE payments SET owner_address = 'gdpr_deleted_' || LEFT(MD5($1), 8) WHERE owner_address = $2",
      [email, walletAddress]
    );

    // 3. Delete checkout sessions (contains email + wallet)
    await db.query(
      "DELETE FROM stripe_checkout_sessions WHERE subscriber_email = $1",
      [email]
    );

    // 4. Delete subscriber record (PII: email, name, google_id, wallet_private_key, avatar_url)
    await db.query("DELETE FROM subscribers WHERE email = $1", [email]);

    // 5. Delete session data
    await db.query(
      "DELETE FROM session WHERE sess::text LIKE $1",
      [`%${email}%`]
    ).catch(() => {}); // Non-fatal if session table format differs

    // 6. Log deletion to audit_log for GDPR compliance evidence
    await db.query(
      `INSERT INTO admin_audit_log (admin_email, action, target, details, created_at)
       VALUES ($1, 'gdpr_delete', $2, $3, NOW())`,
      [
        req.admin?.email || "admin",
        email,
        JSON.stringify({
          wallet_address:             walletAddress,
          subscriptions_cancelled_db: cancelledSubs,
          on_chain_cancelled:         onChainCancelled,
          on_chain_skipped:           onChainSkipped,
          on_chain_errors:            onChainErrors,
          deleted_at:                 new Date().toISOString(),
          requested_by:               req.admin?.email || "admin",
        }),
      ]
    );

    console.log(`[GDPR] Deleted subscriber ${email} — wallet: ${walletAddress} — ${cancelledSubs} subscriptions cancelled`);

    res.json({
      success: true,
      message: `Subscriber ${email} deleted. All PII removed. Payment records anonymised for tax compliance.`,
      deleted: {
        email,
        wallet_address:             walletAddress,
        subscriptions_cancelled_db: cancelledSubs,
        on_chain_cancelled:         onChainCancelled,
        on_chain_skipped:           onChainSkipped,
        on_chain_errors:            onChainErrors.length > 0 ? onChainErrors : undefined,
      },
      note: onChainSkipped > 0 && !subscriber.wallet_private_key
        ? `${onChainSkipped} on-chain subscription(s) require manual cancellation via Safe multisig — crypto-native subscriber.`
        : undefined,
    });
  } catch (err) {
    console.error("[GDPR] Delete error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /api/admin/gdpr/pending — list pending on-chain cancellations
app.get("/api/admin/gdpr/pending", requireAdminAuth, async (req, res) => {
  try {
    const pending = await db.getGdprPendingOnchain();
    res.json({ pending, total: pending.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/gdpr/pending/:id/resolve — mark on-chain cancellation as resolved
app.post("/api/admin/gdpr/pending/:id/resolve", requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    await db.resolveGdprPendingOnchain({ id: parseInt(id), resolvedBy: req.admin?.email || "admin", notes });
    await db.query(
      `INSERT INTO admin_audit_log (admin_email, action, target, details, created_at) VALUES ($1, $2, $3, $4, NOW())`,
      [req.admin?.email || "admin", "gdpr_onchain_resolved", `pending_id:${id}`, JSON.stringify({ notes })]
    ).catch(() => {});
    res.json({ success: true, message: `GDPR pending item #${id} marked as resolved.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    ].join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="authonce-protocol-fees-${year || "all"}-${currency}.csv"`);
    res.send(header + rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/tax/merchant — merchant payment export (XLSX with guide tab)
app.get("/api/admin/tax/merchant", requireAdminAuth, async (req, res) => {
  try {
    const { year, currency = "eur", merchant } = req.query;
    const cur = currency.toLowerCase();

    let query = `
      SELECT
        p.executed_at, p.merchant_address, p.subscription_id,
        p.token_symbol,
        ROUND((p.merchant_received::numeric / 1000000), 6) AS merchant_received_token,
        ROUND((p.fee::numeric / 1000000), 6)               AS fee_token,
        p.fiat_currency, p.fiat_amount, p.fiat_rate,
        p.merchant_received_eur, p.eur_rate,
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

    // Build XLSX with two tabs
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();

    // ── Tab 1: Payments ──────────────────────────────────────────────────────
    const ws = workbook.addWorksheet("Payments");
    const GREEN = "1D9E75";
    const LIGHT = "F0FAF6";

    ws.columns = [
      { header: "Date",                         key: "date",       width: 14 },
      { header: "Merchant",                     key: "merchant",   width: 20 },
      { header: "Subscription ID",              key: "sub_id",     width: 18 },
      { header: "Token",                        key: "token",      width: 10 },
      { header: "Amount (token)",               key: "amount",     width: 16 },
      { header: "Fee (token)",                  key: "fee",        width: 12 },
      { header: `${cur.toUpperCase()} equivalent`, key: "fiat",   width: 22 },
      { header: "Rate",                         key: "rate",       width: 12 },
      { header: "EUR equivalent",               key: "eur",        width: 18 },
      { header: "EUR rate",                     key: "eur_rate",   width: 12 },
      { header: "TX Hash",                      key: "tx",         width: 48 },
      { header: "Interval",                     key: "interval",   width: 12 },
    ];

    // Style header row
    ws.getRow(1).eachCell(cell => {
      cell.font      = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREEN}` } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border    = { top: {style:"thin"}, bottom: {style:"thin"}, left: {style:"thin"}, right: {style:"thin"} };
    });
    ws.getRow(1).height = 28;
    ws.views = [{ state: "frozen", ySplit: 1 }];

    // Add data rows
    result.rows.forEach((r, i) => {
      const fiatAmt  = cur === "eur" ? r.merchant_received_eur : r.fiat_amount;
      const fiatRate = cur === "eur" ? r.eur_rate              : r.fiat_rate;
      const row = ws.addRow({
        date:     r.executed_at ? new Date(r.executed_at).toISOString().split("T")[0] : "",
        merchant: r.merchant_address || "",
        sub_id:   r.subscription_id  || "",
        token:    r.token_symbol     || "USDC",
        amount:   parseFloat(r.merchant_received_token) || "",
        fee:      parseFloat(r.fee_token)               || "",
        fiat:     fiatAmt  ? parseFloat(fiatAmt)  : "",
        rate:     fiatRate ? parseFloat(fiatRate) : "",
        eur:      r.merchant_received_eur ? parseFloat(r.merchant_received_eur) : "",
        eur_rate: r.eur_rate ? parseFloat(r.eur_rate) : "",
        tx:       r.tx_hash   || "",
        interval: r.interval  || "",
      });
      if (i % 2 === 1) {
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FFF0FAF6` } };
        });
      }
      row.getCell("amount").numFmt = "#,##0.000000";
      row.getCell("fee").numFmt    = "#,##0.000000";
      row.getCell("fiat").numFmt   = "#,##0.00";
      row.getCell("eur").numFmt    = "#,##0.00";
      row.getCell("rate").numFmt   = "#,##0.0000";
    });

    // ── Tab 2: Guide ─────────────────────────────────────────────────────────
    const wg = workbook.addWorksheet("Guide — How to use");
    wg.getColumn(1).width = 28;
    wg.getColumn(2).width = 22;
    wg.getColumn(3).width = 60;

    const addGuideRow = (col1, col2, col3, opts = {}) => {
      const row = wg.addRow([col1, col2, col3]);
      row.getCell(1).font = { name: "Arial", bold: opts.bold1, size: opts.size || 9, color: { argb: `FF${opts.color1 || "0F172A"}` } };
      row.getCell(2).font = { name: "Arial", size: opts.size || 9, color: { argb: "FF475569" } };
      row.getCell(3).font = { name: "Arial", size: opts.size || 9, color: { argb: "FF475569" } };
      row.getCell(3).alignment = { wrapText: true, vertical: "top" };
      if (opts.height) row.height = opts.height;
      if (opts.sectionFill) {
        [1,2,3].forEach(c => {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREEN}` } };
          row.getCell(c).font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        });
        wg.mergeCells(row.number, 1, row.number, 3);
        row.getCell(1).alignment = { indent: 1, vertical: "middle" };
        row.height = 22;
      }
      return row;
    };

    addGuideRow("AuthOnce — Merchant Tax Export Guide", "", "", { size: 15, bold1: true, color1: GREEN, height: 28 });
    addGuideRow("This file contains your subscription payment history with fiat equivalents for tax and accounting purposes.", "", "", { size: 9, color1: "475569", height: 20 });
    wg.addRow([]);

    addGuideRow("  1.  Payments Tab — Column Reference", "", "", { sectionFill: true });
    addGuideRow("Column name", "Example value", "Description", { bold1: true, size: 9 });
    [
      ["Date",                    "2026-05-23",    "Date of the payment in UTC. Use to sort by quarter or year for VAT returns."],
      ["Merchant",                "0x1234...abcd", "Your wallet address. Confirms this payment belongs to your account."],
      ["Subscription ID",         "42",            "Internal reference number. Use for cross-referencing with subscribers."],
      ["Token",                   "USDC",          "Payment token. USDC, USDT, DAI and EURC are all stablecoins worth ~$1."],
      ["Amount (token)",          "9.950000",      "Amount you received after the 0.5% AuthOnce protocol fee."],
      ["Fee (token)",             "0.050000",      "Protocol fee deducted by AuthOnce (0.5%). Deductible platform cost."],
      [`${cur.toUpperCase()} equivalent`, "9.15", "Your received amount in your chosen currency at the payment date exchange rate. Use this column for your tax return."],
      ["Rate",                    "0.9200",        "Exchange rate used: 1 USDC = X [your currency] on the payment date. From CoinGecko live data."],
      ["EUR equivalent",          "9.15",          "Your received amount in EUR — always included. Required for EU VAT filings."],
      ["EUR rate",                "0.9200",        "EUR exchange rate on the payment date."],
      ["TX Hash",                 "0xabc123...",   "Blockchain transaction hash. Paste into basescan.org to verify independently. This is your receipt."],
      ["Interval",                "monthly",       "Billing frequency: weekly, monthly, or yearly."],
    ].forEach((r, i) => {
      const row = wg.addRow(r);
      row.height = 28;
      if (i % 2 === 1) {
        [1,2,3].forEach(c => row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FAF6" } });
      }
      row.getCell(1).font = { name: "Arial", bold: true, size: 9 };
      row.getCell(2).font = { name: "Arial", size: 9, color: { argb: "FF475569" } };
      row.getCell(3).font = { name: "Arial", size: 9, color: { argb: "FF475569" } };
      row.getCell(3).alignment = { wrapText: true, vertical: "top" };
      [1,2,3].forEach(c => row.getCell(c).border = {
        top:{style:"thin",color:{argb:"FFE2E8F0"}}, bottom:{style:"thin",color:{argb:"FFE2E8F0"}},
        left:{style:"thin",color:{argb:"FFE2E8F0"}}, right:{style:"thin",color:{argb:"FFE2E8F0"}},
      });
    });

    wg.addRow([]);
    addGuideRow("  2.  VAT Returns", "", "", { sectionFill: true });
    const vatRow = wg.addRow(["Sum the '" + cur.toUpperCase() + " equivalent' column for each VAT quarter. This is your taxable turnover for that period. The fee column (AuthOnce 0.5%) is a deductible input cost."]);
    vatRow.height = 36;
    vatRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    vatRow.getCell(1).font = { name: "Arial", size: 9, color: { argb: "FF475569" } };
    wg.mergeCells(vatRow.number, 1, vatRow.number, 3);

    wg.addRow([]);
    addGuideRow("  3.  Income Tax", "", "", { sectionFill: true });
    const itRow = wg.addRow(["For annual income tax: sum the '" + cur.toUpperCase() + " equivalent' column for the full year. Gross income = Amount (token) column. Net = Amount minus Fee. Exchange rates are recorded at payment time — no year-end conversion needed."]);
    itRow.height = 48;
    itRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    itRow.getCell(1).font = { name: "Arial", size: 9, color: { argb: "FF475569" } };
    wg.mergeCells(itRow.number, 1, itRow.number, 3);

    wg.addRow([]);
    addGuideRow("  4.  Note on Stablecoins", "", "", { sectionFill: true });
    const scRow = wg.addRow(["USDC, USDT and DAI are stablecoins pegged to the US Dollar (1 token ≈ $1.00 USD). EURC is pegged to the Euro. For tax purposes treat each token as equivalent to its USD/EUR peg value at time of receipt, then converted using the Rate column. The fiat equivalent columns do this automatically."]);
    scRow.height = 56;
    scRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    scRow.getCell(1).font = { name: "Arial", size: 9, color: { argb: "FF475569" } };
    wg.mergeCells(scRow.number, 1, scRow.number, 3);

    wg.addRow([]);
    addGuideRow("  5.  Verifying Transactions", "", "", { sectionFill: true });
    const vRow = wg.addRow(["Each row has a TX Hash. Go to https://basescan.org and paste it to independently verify the payment. The blockchain record is immutable and publicly auditable — your complete tamper-proof audit trail."]);
    vRow.height = 40;
    vRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    vRow.getCell(1).font = { name: "Arial", size: 9, color: { argb: "FF475569" } };
    wg.mergeCells(vRow.number, 1, vRow.number, 3);

    wg.addRow([]);
    const ctRow = wg.addRow(["Questions: support@authonce.io  |  https://authonce.io  |  AuthOnce Protocol · BUSL-1.1 · Base Network"]);
    ctRow.getCell(1).font = { name: "Arial", size: 8, color: { argb: "FF94A3B8" } };
    wg.mergeCells(ctRow.number, 1, ctRow.number, 3);

    // Stream XLSX to response
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="payments-${year || "all"}-${cur}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[API] Tax merchant export error:", err.message);
    res.status(500).json({ error: err.message });
  }
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

app.use((err, req, res, next) => {
  console.error("[API] Unhandled error:", err.message);
  res.header("Access-Control-Allow-Origin", "*");
  res.status(500).json({ error: "server_error", message: err.message });
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
