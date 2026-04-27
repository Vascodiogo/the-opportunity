// scripts/admin-auth.js — AuthOnce Admin Authentication
// =============================================================================
//  Add these routes to your existing scripts/api.js
//
//  Setup — run once to create admin credentials:
//    node scripts/admin-auth.js setup
//
//  Environment variables needed in Railway:
//    ADMIN_EMAIL     = vasco@authonce.io
//    ADMIN_PASSWORD  = (choose a strong password)
//    JWT_SECRET      = (random 64-char string — generate below)
//
//  To generate JWT_SECRET, run in PowerShell:
//    node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
// =============================================================================

const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "vasco@authonce.io";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET     = process.env.JWT_SECRET;
const TOKEN_EXPIRY   = "12h"; // Token valid for 12 hours

// =============================================================================
// MIDDLEWARE — protect admin routes
// =============================================================================

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized", message: "Admin token required." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "forbidden", message: "Admin access only." });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid_token", message: "Token expired or invalid." });
  }
}

// =============================================================================
// ROUTES — add these to api.js
// =============================================================================

// POST /api/admin/login
async function adminLogin(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "missing_fields", message: "Email and password required." });
  }

  // Check email
  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password." });
  }

  // Check password
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: "server_error", message: "Admin password not configured." });
  }

  // Compare — support both plain (for initial setup) and bcrypt hashed
  let passwordValid = false;
  if (ADMIN_PASSWORD.startsWith("$2")) {
    // bcrypt hash
    passwordValid = await bcrypt.compare(password, ADMIN_PASSWORD);
  } else {
    // Plain text (development only — hash it in production)
    passwordValid = password === ADMIN_PASSWORD;
    if (passwordValid) {
      console.warn("[ADMIN] WARNING: Using plain text password. Hash it with bcrypt for production.");
    }
  }

  if (!passwordValid) {
    console.warn(`[ADMIN] Failed login attempt for ${email}`);
    return res.status(401).json({ error: "invalid_credentials", message: "Invalid email or password." });
  }

  // Generate JWT
  const token = jwt.sign(
    { email: ADMIN_EMAIL, role: "admin" },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  console.log(`[ADMIN] Login successful for ${email}`);

  res.json({
    token,
    email: ADMIN_EMAIL,
    expires_in: TOKEN_EXPIRY,
  });
}

// GET /api/admin/me — verify token and return admin info
function adminMe(req, res) {
  res.json({
    email: req.admin.email,
    role: req.admin.role,
  });
}

// GET /api/admin/stats — dashboard overview
async function adminStats(req, res) {
  try {
    const db = require("./db");

    const [subResult, payResult, merchantResult] = await Promise.all([
      db.pool.query("SELECT COUNT(*) as total, status FROM subscriptions GROUP BY status"),
      db.pool.query("SELECT COUNT(*) as total, COALESCE(SUM(merchant_received::numeric), 0) as volume FROM payments"),
      db.pool.query("SELECT COUNT(*) as total FROM subscriptions WHERE status = 'active'"),
    ]);

    const statusCounts = {};
    subResult.rows.forEach(r => { statusCounts[r.status] = parseInt(r.total); });

    res.json({
      subscriptions: {
        active:    statusCounts.active    || 0,
        paused:    statusCounts.paused    || 0,
        cancelled: statusCounts.cancelled || 0,
        expired:   statusCounts.expired   || 0,
        total:     Object.values(statusCounts).reduce((a, b) => a + b, 0),
      },
      payments: {
        total:  parseInt(payResult.rows[0]?.total || 0),
        volume_usdc: parseFloat(payResult.rows[0]?.volume || 0) / 1e6,
      },
    });
  } catch (err) {
    console.error("[ADMIN] Stats error:", err.message);
    res.status(500).json({ error: "server_error", message: err.message });
  }
}

// =============================================================================
// HOW TO ADD TO api.js
// =============================================================================
//
// 1. Install dependencies:
//    npm install bcryptjs jsonwebtoken --save
//
// 2. At the top of api.js, add:
//    const { requireAdminAuth, adminLogin, adminMe, adminStats } = require("./admin-auth");
//
// 3. Add these routes to api.js (before the app.listen call):
//    app.post("/api/admin/login", adminLogin);
//    app.get("/api/admin/me",    requireAdminAuth, adminMe);
//    app.get("/api/admin/stats", requireAdminAuth, adminStats);
//
// 4. Add to Railway environment variables:
//    ADMIN_EMAIL    = vasco@authonce.io
//    ADMIN_PASSWORD = your_chosen_password
//    JWT_SECRET     = (64-char random hex)
//
// =============================================================================

module.exports = { requireAdminAuth, adminLogin, adminMe, adminStats };
