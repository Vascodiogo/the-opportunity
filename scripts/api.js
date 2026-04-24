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
// GET /api/merchants/:address/payments/export
// Export payment history as CSV for accountant/tax purposes
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address/payments/export", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) return res.status(403).json({ error: "forbidden" });

    const limit = Math.min(parseInt(req.query.limit) || 1000, 5000);
    const year = req.query.year ? parseInt(req.query.year) : null;
    const month = req.query.month || null;

    let payments;
    if (year && month) {
      const [y, m] = month.split("-");
      const result = await db.query(
        `SELECT p.*, s.owner_address as subscriber_vault FROM payments p
         JOIN subscriptions s ON p.subscription_id = s.id
         WHERE p.merchant_address = $1
           AND EXTRACT(YEAR FROM p.executed_at) = $2
           AND EXTRACT(MONTH FROM p.executed_at) = $3
         ORDER BY p.executed_at DESC LIMIT $4`,
        [address, parseInt(y), parseInt(m), limit]
      );
      payments = result.rows;
    } else if (year) {
      const result = await db.query(
        `SELECT p.*, s.owner_address as subscriber_vault FROM payments p
         JOIN subscriptions s ON p.subscription_id = s.id
         WHERE p.merchant_address = $1
           AND EXTRACT(YEAR FROM p.executed_at) = $2
         ORDER BY p.executed_at DESC LIMIT $3`,
        [address, year, limit]
      );
      payments = result.rows;
    } else {
      payments = await db.getPaymentsByMerchant(address, limit);
    }

    // Build CSV
    const rows = [
      ["Payment ID", "Subscription ID", "Subscriber Vault", "Amount USDC",
       "Merchant Received USDC", "Merchant Received EUR", "EUR Rate",
       "Protocol Fee USDC", "Transaction Hash", "Date"].join(",")
    ];

    for (const p of payments) {
      rows.push([
        p.id,
        p.subscription_id,
        p.subscriber_vault || p.owner_address,
        (BigInt(p.amount) / BigInt(10 ** 6)).toString(),
        (BigInt(p.merchant_received) / BigInt(10 ** 6)).toString(),
        p.merchant_received_eur || "",
        p.eur_rate || "",
        (BigInt(p.fee) / BigInt(10 ** 6)).toString(),
        p.tx_hash,
        new Date(p.executed_at).toISOString(),
      ].join(","));
    }

    const csv = rows.join("\n");
    const filename = `authonce-payments-${address.substring(0,8)}-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("[API] CSV export error:", err.message);
    res.status(500).json({ error: "server_error", message: "Failed to export payments" });
  }
});

// -----------------------------------------------------------------------------
// GET /api/merchants/:address/summary
// Monthly revenue summary for accounting
// Query param: ?month=2026-04 (defaults to current month)
// -----------------------------------------------------------------------------
app.get("/api/merchants/:address/summary", requireMerchantAuth, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (address !== req.merchantAddress) return res.status(403).json({ error: "forbidden" });

    const month = req.query.month || new Date().toISOString().substring(0, 7);
    const [year, mon] = month.split("-");

    const result = await db.query(`
      SELECT
        COUNT(*)::int                                    AS payment_count,
        SUM(merchant_received::numeric)                  AS total_received_raw,
        SUM(fee::numeric)                                AS total_fees_raw,
        AVG(eur_rate::numeric)                           AS avg_eur_rate,
        SUM(merchant_received_eur::numeric)              AS total_received_eur,
        MIN(executed_at)                                 AS first_payment,
        MAX(executed_at)                                 AS last_payment
      FROM payments
      WHERE merchant_address = $1
        AND EXTRACT(YEAR  FROM executed_at) = $2
        AND EXTRACT(MONTH FROM executed_at) = $3
    `, [address, parseInt(year), parseInt(mon)]);

    const row = result.rows[0];
    const USDC_DECIMALS = BigInt(10 ** 6);

    const totalReceivedUsdc = row.total_received_raw
      ? (BigInt(Math.round(parseFloat(row.total_received_raw))) / USDC_DECIMALS).toString()
      : "0";
    const totalFeesUsdc = row.total_fees_raw
      ? (BigInt(Math.round(parseFloat(row.total_fees_raw))) / USDC_DECIMALS).toString()
      : "0";

    // Active subscriptions count
    const activeSubs = await db.query(
      "SELECT COUNT(*)::int AS count FROM subscriptions WHERE merchant_address = $1 AND status = $2",
      [address, "active"]
    );

    res.json({
      merchant_address: address,
      month,
      summary: {
        payment_count: row.payment_count || 0,
        total_received_usdc: totalReceivedUsdc,
        total_received_eur: row.total_received_eur ? parseFloat(row.total_received_eur).toFixed(2) : null,
        avg_eur_rate: row.avg_eur_rate ? parseFloat(row.avg_eur_rate).toFixed(4) : null,
        total_protocol_fees_usdc: totalFeesUsdc,
        active_subscribers: activeSubs.rows[0].count,
        first_payment: row.first_payment,
        last_payment: row.last_payment,
      }
    });
  } catch (err) {
    console.error("[API] Summary error:", err.message);
    res.status(500).json({ error: "server_error", message: "Failed to fetch summary" });
  }
});


// =============================================================================
// ADMIN ENDPOINTS — AuthOnce internal use only
// Protected by ADMIN_SECRET environment variable
// =============================================================================

function requireAdminAuth(req, res, next) {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "unauthorized", message: "Admin access required" });
  }
  next();
}

// -----------------------------------------------------------------------------
// GET /api/admin/fees/summary
// AuthOnce protocol fee summary for tax reporting
// Query: ?year=2026 or ?month=2026-04
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
        SUM(
          CASE WHEN eur_rate IS NOT NULL
          THEN (fee::numeric / 1000000) * eur_rate::numeric
          ELSE NULL END
        )                                 AS total_fees_eur,
        MIN(executed_at)                  AS first_payment,
        MAX(executed_at)                  AS last_payment
      FROM payments
      ${whereClause}
    `, params);

    const row = result.rows[0];

    // Per merchant breakdown
    const breakdown = await db.query(`
      SELECT
        merchant_address,
        COUNT(*)::int           AS payment_count,
        SUM(fee::numeric)       AS fees_raw
      FROM payments
      ${whereClause}
      GROUP BY merchant_address
      ORDER BY fees_raw DESC
    `, params);

    res.json({
      period: month || (year ? year.toString() : "all time"),
      protocol_fees: {
        payment_count: row.payment_count || 0,
        total_fees_usdc: row.total_fees_raw
          ? (parseFloat(row.total_fees_raw) / 1000000).toFixed(6)
          : "0",
        total_fees_eur: row.total_fees_eur
          ? parseFloat(row.total_fees_eur).toFixed(2)
          : null,
        avg_eur_rate: row.avg_eur_rate
          ? parseFloat(row.avg_eur_rate).toFixed(4)
          : null,
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
// Download annual fee CSV for Portuguese tax authority (AT)
// Query: ?year=2026
// -----------------------------------------------------------------------------
app.get("/api/admin/fees/export", requireAdminAuth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

    const result = await db.query(`
      SELECT
        p.id,
        p.subscription_id,
        p.merchant_address,
        p.amount,
        p.merchant_received,
        p.fee,
        p.eur_rate,
        p.merchant_received_eur,
        p.tx_hash,
        p.executed_at
      FROM payments p
      WHERE EXTRACT(YEAR FROM p.executed_at) = $1
      ORDER BY p.executed_at ASC
    `, [year]);

    const rows = [
      ["Payment ID", "Subscription ID", "Merchant Address",
       "Total Amount USDC", "Merchant Received USDC", "Protocol Fee USDC",
       "EUR Rate", "Protocol Fee EUR", "Transaction Hash", "Date"].join(",")
    ];

    for (const p of result.rows) {
      const feeUsdc = (parseFloat(p.fee) / 1000000).toFixed(6);
      const feeEur  = p.eur_rate
        ? (parseFloat(feeUsdc) * parseFloat(p.eur_rate)).toFixed(2)
        : "";

      rows.push([
        p.id,
        p.subscription_id,
        p.merchant_address,
        (parseFloat(p.amount) / 1000000).toFixed(6),
        (parseFloat(p.merchant_received) / 1000000).toFixed(6),
        feeUsdc,
        p.eur_rate || "",
        feeEur,
        p.tx_hash,
        new Date(p.executed_at).toISOString(),
      ].join(","));
    }

    const csv = rows.join("\n");
    const filename = `authonce-fees-${year}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("[API] Admin fees export error:", err.message);
    res.status(500).json({ error: "server_error" });
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
