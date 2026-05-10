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
    const subs = await db.getMerchantSubscriptions(address, { status, limit: parseInt(limit), offset: parseInt(offset) });

    res.json({
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
    const payments = await db.getMerchantPayments(address, { limit: parseInt(limit), offset: parseInt(offset) });

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

// GET /api/products/:merchantAddress/:productSlug — PUBLIC
app.get("/api/products/:merchantAddress/:productSlug", async (req, res) => {
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
        amount:       parseFloat(p.amount),
        interval:     p.interval,
        trial_days:   p.trial_days   || 0,
        intro_amount: parseFloat(p.intro_amount || 0),
        intro_pulls:  parseInt(p.intro_pulls    || 0),
        created_at:   p.created_at,
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

    const { name, amount, interval, trial_days = 0, intro_amount = 0, intro_pulls = 0 } = req.body;
    if (!name || !amount || !interval) {
      return res.status(400).json({ error: "missing_fields", message: "name, amount, interval required." });
    }
    if (!["weekly", "monthly", "yearly"].includes(interval)) {
      return res.status(400).json({ error: "invalid_interval", message: "interval must be weekly, monthly, or yearly." });
    }
    if (isNaN(amount) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "invalid_amount", message: "amount must be a positive number." });
    }

    const trialDays   = Math.min(Math.max(parseInt(trial_days)   || 0, 0), 90);
    const introAmount = Math.min(Math.max(parseFloat(intro_amount) || 0, 0), parseFloat(amount));
    const introPulls  = Math.min(Math.max(parseInt(intro_pulls)   || 0, 0), 12);
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const product = await db.upsertProduct(address, { slug, name, amount: parseFloat(amount), interval, trialDays, introAmount, introPulls });

    console.log(`[PRODUCTS] Upserted: ${address} / ${slug} (intro: $${introAmount} × ${introPulls})`);
    res.status(201).json({
      id: product.id, slug: product.slug, name: product.name,
      amount:       parseFloat(product.amount),
      interval:     product.interval,
      trial_days:   product.trial_days   || 0,
      intro_amount: parseFloat(product.intro_amount || 0),
      intro_pulls:  parseInt(product.intro_pulls    || 0),
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
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log(`[WEBHOOK] Checkout completed: ${session.id}`);
        if (session.payment_intent) {
          await db.completeCheckoutSession(session.id, session.payment_intent);
          console.log(`[WEBHOOK] Session ${session.id} marked complete — payment_intent: ${session.payment_intent}`);
        }
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        console.log(`[WEBHOOK] Payment succeeded: ${pi.id} — ${pi.amount / 100} ${pi.currency.toUpperCase()}`);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.log(`[WEBHOOK] Payment failed: ${pi.id} — ${pi.last_payment_error?.message}`);
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object;
        console.log(`[WEBHOOK] Invoice paid: ${inv.id} — ${inv.amount_paid / 100} ${inv.currency.toUpperCase()}`);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object;
        console.log(`[WEBHOOK] Invoice payment failed: ${inv.id}`);
        break;
      }
      case "customer.subscription.created":
        console.log(`[WEBHOOK] Subscription created: ${event.data.object.id}`); break;
      case "customer.subscription.deleted":
        console.log(`[WEBHOOK] Subscription cancelled: ${event.data.object.id}`); break;
      case "customer.subscription.updated":
        console.log(`[WEBHOOK] Subscription updated: ${event.data.object.id} — ${event.data.object.status}`); break;
      case "customer.subscription.paused":
        console.log(`[WEBHOOK] Subscription paused: ${event.data.object.id}`); break;
      case "customer.subscription.resumed":
        console.log(`[WEBHOOK] Subscription resumed: ${event.data.object.id}`); break;
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

app.get("/auth/google", (req, res, next) => {
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
app.post("/api/subscriber/cancel/:subscriptionId", async (req, res) => {
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
