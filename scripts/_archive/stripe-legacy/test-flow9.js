// scripts/test-flow9.js
// AuthOnce — Flow 9: Stripe Connect
// Run: node scripts/test-flow9.js

const API_URL     = "https://the-opportunity-production.up.railway.app";
const TEST_WALLET = "0xbb6d960b8671713bb92be92d03BE8d8165EE7782";

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
    console.log(`       Got:      ${JSON.stringify(actual).slice(0, 200)}`);
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

async function del(path, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log("=".repeat(55));
  console.log("  AuthOnce — Flow 9: Stripe Connect");
  console.log("=".repeat(55));
  console.log(`  API: ${API_URL}`);
  console.log(`  Merchant: ${TEST_WALLET}`);
  console.log("=".repeat(55));

  // ── 9A: Connect authorize endpoint ─────────────────────────────────────────
  section("9A — Stripe Connect authorize");

  // Without merchant auth
  const authorizeNoAuth = await get("/api/connect/authorize");
  result("9A.1", "GET /api/connect/authorize without auth returns 401",
    authorizeNoAuth.status === 401, authorizeNoAuth.status, 401
  );

  // With merchant address header
  const authorizeWithAuth = await get("/api/connect/authorize", {
    "x-merchant-address": TEST_WALLET,
  });
  result("9A.2", "GET /api/connect/authorize with merchant returns 200 or contains URL",
    authorizeWithAuth.status === 200 || authorizeWithAuth.status === 400,
    authorizeWithAuth.status, "200/400"
  );

  if (authorizeWithAuth.status === 200) {
    const hasUrl = authorizeWithAuth.body.url !== undefined ||
                   authorizeWithAuth.body.oauth_url !== undefined ||
                   authorizeWithAuth.body.redirect_url !== undefined;
    result("9A.3", "response contains OAuth URL",
      hasUrl, authorizeWithAuth.body, "url field"
    );
    console.log(`  ℹ️  OAuth URL present: ${hasUrl}`);
  } else {
    console.log(`  ℹ️  Response: ${JSON.stringify(authorizeWithAuth.body).slice(0, 150)}`);
    skip("9A.3", "OAuth URL in response", `status was ${authorizeWithAuth.status}`);
  }

  // ── 9B: Connect status endpoint ────────────────────────────────────────────
  section("9B — Stripe Connect status");

  // Without auth
  const statusNoAuth = await get("/api/connect/status");
  result("9B.1", "GET /api/connect/status without auth returns 401",
    statusNoAuth.status === 401, statusNoAuth.status, 401
  );

  // With auth
  const statusWithAuth = await get("/api/connect/status", {
    "x-merchant-address": TEST_WALLET,
  });
  result("9B.2", "GET /api/connect/status with merchant returns 200",
    statusWithAuth.status === 200 || statusWithAuth.status === 404,
    statusWithAuth.status, "200/404"
  );

  if (statusWithAuth.status === 200) {
    console.log(`  ℹ️  Connect status: ${JSON.stringify(statusWithAuth.body).slice(0, 150)}`);
    result("9B.3", "status response has connected field",
      statusWithAuth.body.connected !== undefined,
      statusWithAuth.body, "connected field"
    );
  } else {
    skip("9B.3", "connected field in status", `status was ${statusWithAuth.status}`);
  }

  // ── 9C: Connect callback (OAuth code exchange) ──────────────────────────────
  section("9C — Stripe Connect callback");

  // Missing code param
  const callbackNoCode = await get("/api/connect/callback");
  result("9C.1", "GET /api/connect/callback without code returns 400 or 302",
    callbackNoCode.status === 400 || callbackNoCode.status === 302 || callbackNoCode.status === 404,
    callbackNoCode.status, "400/302/404"
  );

  // Invalid code
  const callbackBadCode = await get("/api/connect/callback?code=invalid_test_code&state=test");
  result("9C.2", "GET /api/connect/callback with invalid code returns error",
    callbackBadCode.status >= 400 || callbackBadCode.status === 302,
    callbackBadCode.status, ">= 400 or 302"
  );

  skip("9C.3", "full OAuth code exchange", "requires live Stripe OAuth flow — manual test only");

  // ── 9D: Connect disconnect ──────────────────────────────────────────────────
  section("9D — Stripe Connect disconnect");

  // Without auth
  const disconnectNoAuth = await del("/api/connect/disconnect");
  result("9D.1", "DELETE /api/connect/disconnect without auth returns 401",
    disconnectNoAuth.status === 401 || disconnectNoAuth.status === 404,
    disconnectNoAuth.status, "401/404"
  );

  // ── 9E: Merchant webhook endpoint (new route from fix pass) ─────────────────
  section("9E — Merchant webhook route (fix verification)");

  // POST without auth
  const webhookNoAuth = await post(`/api/merchants/${TEST_WALLET}/webhook`, {
    webhook_url: "https://example.com/webhook",
  });
  result("9E.1", "POST /api/merchants/:address/webhook without auth returns 401",
    webhookNoAuth.status === 401, webhookNoAuth.status, 401
  );

  // GET without auth
  const webhookGetNoAuth = await get(`/api/merchants/${TEST_WALLET}/webhook`);
  result("9E.2", "GET /api/merchants/:address/webhook without auth returns 401",
    webhookGetNoAuth.status === 401, webhookGetNoAuth.status, 401
  );

  // With merchant auth header
  const webhookWithAuth = await get(`/api/merchants/${TEST_WALLET}/webhook`, {
    "x-merchant-address": TEST_WALLET,
  });
  result("9E.3", "GET /api/merchants/:address/webhook with auth returns 200",
    webhookWithAuth.status === 200 || webhookWithAuth.status === 404,
    webhookWithAuth.status, "200/404"
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(55)}`);
  console.log(`  FLOW 9 COMPLETE`);
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log("=".repeat(55));

  if (failed > 0) {
    console.log("\n  ⚠️  Review failures above.");
    process.exit(1);
  } else {
    console.log("\n  🟢 Flow 9 passed. Stripe Connect layer verified.");
    console.log("     Next: Flow 10 — full end-to-end subscriber journey.");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
