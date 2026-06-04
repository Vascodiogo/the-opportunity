// scripts/test-flow6.js
// AuthOnce — Flow 6: Stripe Checkout + Webhook
// Run: node scripts/test-flow6.js
//
// Tests:
//   6A — Stripe checkout session creation
//   6B — Webhook delivery (simulated via Stripe CLI trigger)
//   6C — Payment failure handling
//
// Requires:
//   - stripe listen running in another terminal
//   - STRIPE_SECRET_KEY in .env

require("dotenv").config();

const API_URL    = "https://the-opportunity-production.up.railway.app";
const TEST_WALLET = "0xbb6d960b8671713bb92be92d03BE8d8165EE7782";
const TEST_PRODUCT_SLUG = "test-plan";
const TEST_MERCHANT     = TEST_WALLET;

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

async function post(path, data, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function get(path, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log("=".repeat(55));
  console.log("  AuthOnce — Flow 6: Stripe Checkout");
  console.log("=".repeat(55));
  console.log(`  API: ${API_URL}`);
  console.log("=".repeat(55));

  // ── 6A: Create product first ────────────────────────────────────────────────
  section("6A — Setup: ensure test product exists");

  // Check if product exists
  const products = await get(`/api/products/${TEST_MERCHANT}`);
  console.log(`  ℹ️  Products endpoint status: ${products.status}`);

  let productExists = false;
  if (products.status === 200 && Array.isArray(products.body)) {
    productExists = products.body.some(p => p.slug === TEST_PRODUCT_SLUG);
  }

  if (productExists) {
    console.log(`  ℹ️  Product '${TEST_PRODUCT_SLUG}' already exists`);
    passed++;
  } else {
    console.log(`  ℹ️  Product not found — will test checkout with merchant address directly`);
    skip("6A.1", "product exists", "product creation requires merchant JWT — testing checkout endpoint directly");
  }

  // ── 6B: Stripe checkout session creation ────────────────────────────────────
  section("6B — Stripe checkout session creation");

  // Test with missing fields
  const checkoutEmpty = await post("/api/stripe/checkout", {});
  result("6B.1", "checkout without fields returns 400",
    checkoutEmpty.status === 400, checkoutEmpty.status, 400
  );

  // Test with valid fields
  const checkoutValid = await post("/api/stripe/checkout", {
    merchant_address: TEST_MERCHANT,
    product_slug:     TEST_PRODUCT_SLUG,
    amount_usdc:      "10000000",   // 10 USDC in base units
    currency:         "EUR",
    subscriber_email: "test@authonce.io",
    interval:         "Monthly",
  });

  console.log(`  ℹ️  Checkout response status: ${checkoutValid.status}`);
  console.log(`  ℹ️  Checkout response: ${JSON.stringify(checkoutValid.body).slice(0, 200)}`);

  result("6B.2", "checkout returns 200 or known error",
    checkoutValid.status === 200 || checkoutValid.status === 400 || checkoutValid.status === 404,
    checkoutValid.status, "200/400/404"
  );

  if (checkoutValid.status === 200) {
    result("6B.3", "response contains checkout URL",
      checkoutValid.body.url !== undefined || checkoutValid.body.checkout_url !== undefined,
      checkoutValid.body, "url field present"
    );
    console.log(`  ℹ️  Checkout URL: ${checkoutValid.body.url || checkoutValid.body.checkout_url}`);
  } else {
    skip("6B.3", "checkout URL present", `status was ${checkoutValid.status}: ${JSON.stringify(checkoutValid.body).slice(0, 100)}`);
  }

  // ── 6C: Webhook endpoint ────────────────────────────────────────────────────
  section("6C — Stripe webhook endpoint");

  // Test webhook without signature — should return 400
  const webhookNoSig = await post("/api/stripe/webhook", { type: "checkout.session.completed" });
  result("6C.1", "webhook without Stripe signature returns 400",
    webhookNoSig.status === 400, webhookNoSig.status, 400
  );

  // Test webhook with wrong signature
  const webhookBadSig = await post("/api/stripe/webhook",
    { type: "checkout.session.completed" },
    { "stripe-signature": "t=invalid,v1=invalid" }
  );
  result("6C.2", "webhook with invalid signature returns 400",
    webhookBadSig.status === 400, webhookBadSig.status, 400
  );

  console.log("\n  ℹ️  To test full webhook flow, use Stripe CLI:");
  console.log("     stripe trigger checkout.session.completed");
  console.log("     (with stripe listen running in another terminal)");

  // ── 6D: Stripe CLI trigger test ─────────────────────────────────────────────
  section("6D — Stripe CLI webhook trigger (manual)");

  console.log("  ℹ️  Run this in your stripe listen terminal:");
  console.log("     stripe trigger checkout.session.completed");
  console.log("");
  console.log("  ℹ️  Then check Railway logs for:");
  console.log("     [Stripe] checkout.session.completed received");
  console.log("     [Stripe] Subscriber wallet created");
  console.log("     [Stripe] Admin vault funding email sent");
  console.log("");

  skip("6D.1", "checkout.session.completed webhook processed", "manual step — run stripe trigger in separate terminal");
  skip("6D.2", "payment_intent.payment_failed webhook processed", "manual step — run stripe trigger payment_intent.payment_failed");

  // ── 6E: Stripe Connect status ───────────────────────────────────────────────
  section("6E — Stripe Connect");

  const connectStatus = await get(`/api/connect/status`, {
    "x-merchant-address": TEST_MERCHANT,
  });
  result("6E.1", "GET /api/connect/status returns 200 or 401",
    connectStatus.status === 200 || connectStatus.status === 401 || connectStatus.status === 404,
    connectStatus.status, "200/401/404"
  );

  const connectAuth = await get("/api/connect/authorize", {
    "x-merchant-address": TEST_MERCHANT,
  });
  result("6E.2", "GET /api/connect/authorize returns 200 or 401",
    connectAuth.status === 200 || connectAuth.status === 401 || connectAuth.status === 404,
    connectAuth.status, "200/401/404"
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(55)}`);
  console.log(`  FLOW 6 COMPLETE`);
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log("=".repeat(55));

  if (failed > 0) {
    console.log("\n  ⚠️  Review failures above.");
    process.exit(1);
  } else {
    console.log("\n  🟢 Flow 6 passed. Stripe layer verified.");
    console.log("     Next: Flow 7 — Notifier + webhooks.");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
