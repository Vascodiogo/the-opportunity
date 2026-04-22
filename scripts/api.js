// scripts/api.js
// =============================================================================
//  AuthOnce — Merchant Registration API
//
//  Express.js REST API for merchant onboarding and management.
//
//  Endpoints:
//    POST   /api/merchants/register     — Register a new merchant
//    GET    /api/merchants/:address     — Get merchant profile
//    PUT    /api/merchants/:address     — Update merchant profile
//    GET    /api/merchants/:address/subscriptions — Get all subscriptions
//    GET    /api/merchants/:address/payments      — Get payment history
//    POST   /api/webhooks/test          — Test webhook delivery
//    GET    /api/health                 — Health check
// =============================================================================

require("dotenv").config();
const express = require("express");
const crypto  = require("crypto");
const db      = require("./db");

const app  = express();
const PORT = process.env.API_PORT || 3001;

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------

app.use(express.json());

// CORS — allow all origins for now (restrict in production)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Merchant-Address");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Simple request logger
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// -----------------------------------------------------------------------------
// Auth middleware — verify merchant wallet address header
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
// Utility — generate webhook secret
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
// POST /api/merchants/register
// Register a new merchant or update existing
// -----------------------------------------------------------------------------
app.post("/api/merchants/register", async (req, res) => {
  try {
    const {
      wallet_address,
      business_name,
      email,
      webhook_url,
      settlement_preference, // "usdc" or "fiat"
      iban,
      bic,
      account_holder,
    } = req.body;

    // Validate wallet address
    if (!wallet_address || !wallet_address.startsWith("0x") || wallet_address.length !== 42) {
      return res.status(400).json({ error: "invalid_wallet", message: "Valid Ethereum wallet address required" });
    }

    // Validate settlement preference
    if (settlement_preference && !["usdc", "fiat"].includes(settlement_preference)) {
      return res.status(400).json({ error: "invalid_settlement", message: "settlement_preference must be 'usdc' or 'fiat'" });
    }

    // If fiat settlement, IBAN and BIC required
    if (settlement_preference === "fiat" && (!iban || !bic)) {
      return res.status(400).json({ error: "missing_bank_details", message: "IBAN and BIC required for fiat settlement" });
    }

    // Generate webhook secret if webhook URL provided
    const webhookSecret = webhook_url ? generateWebhookSecret() : null;

    // Save to database (IBAN encrypted automatically in db.js)
    await db.upsertMerchant(wallet_address.toLowerCase(), {
      businessName: business_name,
      email,
      webhookUrl: webhook_url,
      webhookSecret,
      settlementPreference: settlement_preference || "usdc",
      ibanPlaintext: iban || null,
      bic: bic || null,
      accountHolder: account_holder || null,
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

    // Return webhook secret only once at registration
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
// Get merchant profile
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    // Only allow merchant to view their own profile
    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden", message: "You can only view your own merchant profile" });
    }

    const merchant = await db.getMerchant(address);
    if (!merchant) {
      return res.status(404).json({ error: "not_found", message: "Merchant not found" });
    }

    // Never expose encrypted IBAN or webhook secret in response
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
// Update merchant profile
// -----------------------------------------------------------------------------
app.put("/api/merchants/:address", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { business_name, email, webhook_url, settlement_preference, iban, bic, account_holder } = req.body;

    const webhookSecret = webhook_url ? generateWebhookSecret() : undefined;

    await db.upsertMerchant(address, {
      businessName: business_name,
      email,
      webhookUrl: webhook_url,
      webhookSecret,
      settlementPreference: settlement_preference,
      ibanPlaintext: iban,
      bic,
      accountHolder: account_holder,
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
// Get all subscriptions for a merchant
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address/subscriptions", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    const subscriptions = await db.getSubscriptionsByMerchant(address);

    res.json({
      merchant_address: address,
      total: subscriptions.length,
      subscriptions: subscriptions.map(s => ({
        subscription_id: s.id,
        vault_address: s.safe_vault,
        amount_usdc: (BigInt(s.amount) / BigInt(10 ** 6)).toString(),
        interval: s.interval,
        status: s.status,
        last_pulled_at: s.last_pulled_at,
        created_at: s.created_at,
      }))
    });
  } catch (err) {
    console.error("[API] Get subscriptions error:", err.message);
    res.status(500).json({ error: "server_error", message: "Failed to fetch subscriptions" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/merchants/:address/payments
// Get payment history for a merchant
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address/payments", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    if (address !== req.merchantAddress) {
      return res.status(403).json({ error: "forbidden" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const payments = await db.getPaymentsByMerchant(address, limit);

    res.json({
      merchant_address: address,
      total: payments.length,
      payments: payments.map(p => ({
        payment_id: p.id,
        subscription_id: p.subscription_id,
        vault_address: p.subscriber_vault || p.owner_address,
        amount_usdc: (BigInt(p.amount) / BigInt(10 ** 6)).toString(),
        merchant_received_usdc: (BigInt(p.merchant_received) / BigInt(10 ** 6)).toString(),
        protocol_fee_usdc: (BigInt(p.fee) / BigInt(10 ** 6)).toString(),
        tx_hash: p.tx_hash,
        executed_at: p.executed_at,
      }))
    });
  } catch (err) {
    console.error("[API] Get payments error:", err.message);
    res.status(500).json({ error: "server_error", message: "Failed to fetch payments" });
  }
});

// -----------------------------------------------------------------------------
// POST /api/webhooks/test
// Send a test webhook to verify merchant endpoint is working
// -----------------------------------------------------------------------------
app.post("/api/webhooks/test", requireMerchantAuth, async (req, res) => {
  try {
    const { dispatchWebhook } = require("./webhook");

    await dispatchWebhook(req.merchantAddress, "webhook.test", {
      message: "This is a test webhook from AuthOnce",
      merchant_address: req.merchantAddress,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: "Test webhook dispatched" });
  } catch (err) {
    console.error("[API] Test webhook error:", err.message);
    res.status(500).json({ error: "server_error", message: "Failed to send test webhook" });
  }
});

// -----------------------------------------------------------------------------
// 404 handler
// -----------------------------------------------------------------------------
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
    console.log("  AuthOnce — Merchant API");
    console.log("=".repeat(60));
    console.log(`  Listening on port ${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/api/health`);
    console.log("=".repeat(60));
  });
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

module.exports = app;