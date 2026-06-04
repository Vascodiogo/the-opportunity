// scripts/test-flow5.js
// AuthOnce — Flow 5: API Layer Tests
// Run: node scripts/test-flow5.js
// (Not a Hardhat script — uses fetch directly against Railway API)

const API_URL = "https://the-opportunity-production.up.railway.app";

let passed  = 0;
let failed  = 0;
let skipped = 0;

function result(id, description, ok, actual, expected) {
  if (ok) {
    console.log(`  ✅ ${id} — ${description}`);
    passed++;
  } else {
    console.log(`  ❌ ${id} — ${description}`);
    console.log(`       Expected: ${expected}`);
    console.log(`       Got:      ${JSON.stringify(actual).slice(0, 120)}`);
    failed++;
  }
}

function skip(id, description, reason) {
  console.log(`  ⏭️  ${id} — ${description} [SKIPPED: ${reason}]`);
  skipped++;
}

function section(title) {
  console.log(`\n${"─".repeat(55)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(55));
}

async function get(path, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function post(path, data, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(55));
  console.log("  AuthOnce — Flow 5: API Layer Tests");
  console.log("=".repeat(55));
  console.log(`  API: ${API_URL}`);
  console.log("=".repeat(55));

  // ── 5A: Health check ────────────────────────────────────────────────────────
  section("5A — Health check");

  const health = await get("/api/health");
  result("5A.1", "GET /api/health returns 200",
    health.status === 200, health.status, 200
  );
  result("5A.2", "status = ok",
    health.body.status === "ok", health.body.status, "ok"
  );
  result("5A.3", "database = connected",
    health.body.database === "connected", health.body.database, "connected"
  );

  // ── 5B: Merchant registration ───────────────────────────────────────────────
  section("5B — Merchant registration");

  const TEST_WALLET = "0xbb6d960b8671713bb92be92d03BE8d8165EE7782";
  const TEST_EMAIL  = `test-${Date.now()}@authonce.io`;

  const reg = await post("/api/merchants/register", {
    wallet_address: TEST_WALLET,
    email:          TEST_EMAIL,
    business_name:  "AuthOnce Test Merchant",
  });

  result("5B.1", "POST /api/merchants/register returns 200 or 409",
    reg.status === 200 || reg.status === 201 || reg.status === 409,
    reg.status, "200/201/409"
  );

  if (reg.status === 200 || reg.status === 201) {
    result("5B.2", "response contains merchant data",
      reg.body.wallet_address !== undefined || reg.body.merchant !== undefined,
      reg.body, "merchant object"
    );
  } else if (reg.status === 409) {
    console.log("  ℹ️  Merchant already registered (409) — expected on repeat runs");
    passed++;
  }

  // Invalid wallet
  const regBad = await post("/api/merchants/register", {
    wallet_address: "not-a-wallet",
    email: "bad@test.com",
  });
  result("5B.3", "invalid wallet returns 400",
    regBad.status === 400, regBad.status, 400
  );

  // ── 5C: Merchant lookup ─────────────────────────────────────────────────────
  section("5C — Merchant lookup");

  const merchant = await get(`/api/merchants/${TEST_WALLET}`);
  result("5C.1", "GET /api/merchants/:address returns 200 or 404",
    merchant.status === 200 || merchant.status === 404,
    merchant.status, "200 or 404"
  );

  const merchantUnknown = await get("/api/merchants/0x0000000000000000000000000000000000000001");
  result("5C.2", "unknown merchant returns 404",
    merchantUnknown.status === 404, merchantUnknown.status, 404
  );

  // ── 5D: Admin auth ──────────────────────────────────────────────────────────
  section("5D — Admin auth");

  // Wrong password
  const loginBad = await post("/api/admin/login", {
    email:    "vasco@authonce.io",
    password: "wrongpassword123",
  });
  result("5D.1", "wrong password returns 401",
    loginBad.status === 401, loginBad.status, 401
  );

  // Missing credentials
  const loginEmpty = await post("/api/admin/login", {});
  result("5D.2", "empty credentials returns 400 or 401",
    loginEmpty.status === 400 || loginEmpty.status === 401,
    loginEmpty.status, "400 or 401"
  );

  // Admin routes without JWT
  const adminNoAuth = await get("/api/admin/subscriptions");
  result("5D.3", "admin route without JWT returns 401",
    adminNoAuth.status === 401, adminNoAuth.status, 401
  );

  const statsNoAuth = await get("/api/admin/stats");
  result("5D.4", "admin stats without JWT returns 401",
    statsNoAuth.status === 401, statsNoAuth.status, 401
  );

  // ── 5E: Products ────────────────────────────────────────────────────────────
  section("5E — Products");

  const products = await get(`/api/products/${TEST_WALLET}`);
  result("5E.1", "GET /api/products/:merchant returns 200 or 404",
    products.status === 200 || products.status === 404,
    products.status, "200 or 404"
  );

  // Product creation without auth
  const createProduct = await post(`/api/products/${TEST_WALLET}`, {
    name:     "Test Plan",
    slug:     "test-plan",
    amount:   "10000000",
    interval: "Monthly",
    token:    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  });
  result("5E.2", "product creation without auth returns 401",
    createProduct.status === 401, createProduct.status, 401
  );

  // ── 5F: Geofencing ──────────────────────────────────────────────────────────
  section("5F — Geofencing");

  // Simulate blocked country via header (if supported)
  const geoBlocked = await get("/api/health", { "CF-IPCountry": "RU" });
  result("5F.1", "health check passes regardless of CF-IPCountry header",
    geoBlocked.status === 200 || geoBlocked.status === 451,
    geoBlocked.status, "200 or 451"
  );

  // ── 5G: Stripe checkout ─────────────────────────────────────────────────────
  section("5G — Stripe checkout endpoint");

  // Missing required fields
  const stripeBad = await post("/api/stripe/checkout", {});
  result("5G.1", "Stripe checkout without required fields returns 400",
    stripeBad.status === 400 || stripeBad.status === 401 || stripeBad.status === 422,
    stripeBad.status, "400/401/422"
  );

  // ── 5H: Subscriber endpoints ────────────────────────────────────────────────
  section("5H — Subscriber endpoints (no auth)");

  const subMe = await get("/api/subscriber/me");
  result("5H.1", "GET /api/subscriber/me without JWT returns 401",
    subMe.status === 401, subMe.status, 401
  );

  const subCancel = await post("/api/subscriber/cancel/0", {});
  result("5H.2", "POST /api/subscriber/cancel without JWT returns 401",
    subCancel.status === 401, subCancel.status, 401
  );

  // ── 5I: CORS headers ────────────────────────────────────────────────────────
  section("5I — CORS headers");

  const corsRes = await fetch(`${API_URL}/api/health`, { method: "OPTIONS" });
  const allowOrigin = corsRes.headers.get("access-control-allow-origin");
  result("5I.1", "CORS Access-Control-Allow-Origin header present",
    allowOrigin !== null, allowOrigin, "* or specific origin"
  );

  // ── 5J: 404 for unknown routes ──────────────────────────────────────────────
  section("5J — Unknown routes");

  const notFound = await get("/api/does-not-exist");
  result("5J.1", "unknown route returns 404",
    notFound.status === 404, notFound.status, 404
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(55)}`);
  console.log(`  FLOW 5 COMPLETE`);
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log("=".repeat(55));

  if (failed > 0) {
    console.log("\n  ⚠️  Review failures above.");
    process.exit(1);
  } else {
    console.log("\n  🟢 Flow 5 passed. API layer verified.");
    console.log("     Next: Flow 6 — Stripe Checkout + webhook.");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
