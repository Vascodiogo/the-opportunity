// scripts/test-flow1.js
// AuthOnce — Flow 1: MerchantRegistry v3 End-to-End Test
// Run: npx hardhat run scripts/test-flow1.js --network base-sepolia

require("dotenv").config();
const { ethers } = require("hardhat");

const REGISTRY_ADDRESS = "0x989376ff6195be2e76871535Db21CB8BdC9175D4";
const DEPLOYER_ADDRESS = "0xbb6d960b8671713bb92be92d03BE8d8165EE7782";

// Test merchant addresses — fresh wallets, no funds needed
const TEST_MERCHANT_1 = "0x1111111111111111111111111111111111111111";
const TEST_MERCHANT_2 = "0x2222222222222222222222222222222222222222";
const TEST_MERCHANT_3 = "0x3333333333333333333333333333333333333333";

const REGISTRY_ABI = [
  "function isApproved(address) view returns (bool)",
  "function approvedMerchantCount() view returns (uint256)",
  "function merchantCount() view returns (uint256)",
  "function getMerchantAt(uint256) view returns (address)",
  "function admin() view returns (address)",
  "function selfServeEnabled() view returns (bool)",
  "function blacklistedMerchants(address) view returns (bool)",
  "function approveMerchant(address)",
  "function revokeMerchant(address)",
  "function blacklistMerchant(address)",
  "function batchApproveMerchants(address[], bool)",
  "function setSelfServe(bool)",
  "function selfRegister()",
  "function proposeAdminTransfer(address)",
  "function acceptAdminTransfer()",
  "function pendingAdmin() view returns (address)",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;

function result(id, description, ok, actual, expected) {
  if (ok) {
    console.log(`  ✅ ${id} — ${description}`);
    passed++;
  } else {
    console.log(`  ❌ ${id} — ${description}`);
    console.log(`       Expected: ${expected}`);
    console.log(`       Got:      ${actual}`);
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

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const [deployer] = await ethers.getSigners();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, deployer);

  console.log("=".repeat(55));
  console.log("  AuthOnce — Flow 1: MerchantRegistry v3");
  console.log("=".repeat(55));
  console.log(`  Registry:  ${REGISTRY_ADDRESS}`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Network:   Base Sepolia`);
  console.log("=".repeat(55));

  // ── 1A: Read state ──────────────────────────────────────────────────────────
  section("1A — Initial state");

  const admin = await registry.admin();
  result("1A.1", "admin = deployer", 
    admin.toLowerCase() === deployer.address.toLowerCase(),
    admin, deployer.address
  );

  const selfServe = await registry.selfServeEnabled();
  result("1A.2", "selfServeEnabled = false", selfServe === false, selfServe, false);

  const isApprovedBefore = await registry.isApproved(TEST_MERCHANT_1);
  result("1A.3", "TEST_MERCHANT_1 not approved yet", isApprovedBefore === false, isApprovedBefore, false);

  const countBefore = await registry.approvedMerchantCount();
  console.log(`  ℹ️  approvedMerchantCount before: ${countBefore}`);

  // ── 1B: Approve merchant ────────────────────────────────────────────────────
  section("1B — Admin approve merchant");

  try {
    const tx1 = await registry.approveMerchant(TEST_MERCHANT_1);
    await tx1.wait();
    const isApprovedAfter = await registry.isApproved(TEST_MERCHANT_1);
    result("1B.1", "approveMerchant succeeds", true, "", "");
    result("1B.2", "isApproved = true after approval", isApprovedAfter === true, isApprovedAfter, true);

    const countAfter = await registry.approvedMerchantCount();
    result("1B.3", "approvedMerchantCount incremented", 
      countAfter === countBefore + 1n, countAfter, countBefore + 1n
    );

    const merchantAt0 = await registry.getMerchantAt(Number(await registry.merchantCount()) - 1);
    result("1B.4", "getMerchantAt returns TEST_MERCHANT_1",
      merchantAt0.toLowerCase() === TEST_MERCHANT_1.toLowerCase(),
      merchantAt0, TEST_MERCHANT_1
    );
  } catch (err) {
    result("1B.1", "approveMerchant succeeds", false, err.message, "no error");
  }

  // Idempotent approve
  try {
    const tx2 = await registry.approveMerchant(TEST_MERCHANT_1);
    await tx2.wait();
    const countSame = await registry.approvedMerchantCount();
    result("1B.5", "double-approve is idempotent (count unchanged)",
      countSame === countBefore + 1n, countSame, countBefore + 1n
    );
  } catch (err) {
    result("1B.5", "double-approve is idempotent", false, err.message, "no error");
  }

  // ── 1C: Revoke merchant ─────────────────────────────────────────────────────
  section("1C — Revoke merchant");

  try {
    const tx3 = await registry.revokeMerchant(TEST_MERCHANT_1);
    await tx3.wait();
    const isApprovedRevoked = await registry.isApproved(TEST_MERCHANT_1);
    result("1C.1", "revokeMerchant succeeds", true, "", "");
    result("1C.2", "isApproved = false after revoke", isApprovedRevoked === false, isApprovedRevoked, false);

    const countRevoked = await registry.approvedMerchantCount();
    result("1C.3", "approvedMerchantCount decremented",
      countRevoked === countBefore, countRevoked, countBefore
    );
  } catch (err) {
    result("1C.1", "revokeMerchant succeeds", false, err.message, "no error");
  }

  // ── 1D: Blacklist ───────────────────────────────────────────────────────────
  section("1D — Blacklist");

  try {
    // First approve TEST_MERCHANT_2
    const txApprove = await registry.approveMerchant(TEST_MERCHANT_2);
    await txApprove.wait();

    // Blacklist it
    const txBlacklist = await registry.blacklistMerchant(TEST_MERCHANT_2);
    await txBlacklist.wait();

    const isBlacklisted = await registry.blacklistedMerchants(TEST_MERCHANT_2);
    result("1D.1", "blacklistMerchant succeeds", true, "", "");
    result("1D.2", "blacklistedMerchants = true", isBlacklisted === true, isBlacklisted, true);

    const isApprovedAfterBlacklist = await registry.isApproved(TEST_MERCHANT_2);
    result("1D.3", "isApproved = false after blacklist", 
      isApprovedAfterBlacklist === false, isApprovedAfterBlacklist, false
    );

    // Try to approve blacklisted merchant
    try {
      const txReapprove = await registry.approveMerchant(TEST_MERCHANT_2);
      await txReapprove.wait();
      result("1D.4", "cannot approve blacklisted merchant (should revert)", false, "no revert", "revert");
    } catch (err) {
      result("1D.4", "cannot approve blacklisted merchant — reverts correctly", 
        err.message.includes("blacklisted"), err.message, "blacklisted"
      );
    }
  } catch (err) {
    result("1D.1", "blacklist flow", false, err.message, "no error");
  }

  // ── 1E: Batch approve ───────────────────────────────────────────────────────
  section("1E — Batch operations");

  const BATCH = [
    "0x4444444444444444444444444444444444444444",
    "0x5555555555555555555555555555555555555555",
    "0x6666666666666666666666666666666666666666",
  ];

  try {
    const countBeforeBatch = await registry.approvedMerchantCount();
    const txBatch = await registry.batchApproveMerchants(BATCH, false);
    await txBatch.wait();

    const countAfterBatch = await registry.approvedMerchantCount();
    result("1E.1", "batchApproveMerchants(3) succeeds",
      countAfterBatch === countBeforeBatch + 3n, countAfterBatch, countBeforeBatch + 3n
    );

    const allApproved = await Promise.all(BATCH.map(a => registry.isApproved(a)));
    result("1E.2", "all 3 batch merchants approved",
      allApproved.every(v => v === true), allApproved, [true, true, true]
    );

    // Batch with blacklisted address — skipBlacklisted=true should skip silently
    const batchWithBlacklisted = [
      "0x7777777777777777777777777777777777777777",
      TEST_MERCHANT_2, // blacklisted
    ];
    const countBeforeSkip = await registry.approvedMerchantCount();
    const txSkip = await registry.batchApproveMerchants(batchWithBlacklisted, true);
    await txSkip.wait();
    const countAfterSkip = await registry.approvedMerchantCount();
    result("1E.3", "batchApprove with skipBlacklisted=true skips blacklisted address",
      countAfterSkip === countBeforeSkip + 1n, countAfterSkip, countBeforeSkip + 1n
    );
  } catch (err) {
    result("1E.1", "batch approve flow", false, err.message, "no error");
  }

  // ── 1F: Self-serve toggle ───────────────────────────────────────────────────
  section("1F — Self-serve toggle");

  // selfRegister should revert when disabled
  try {
    const txSelfReg = await registry.selfRegister();
    await txSelfReg.wait();
    result("1F.1", "selfRegister reverts when disabled", false, "no revert", "revert");
  } catch (err) {
    result("1F.1", "selfRegister reverts when selfServeEnabled=false",
      err.message.includes("invite only"), err.message, "invite only"
    );
  }

  // Enable self-serve
  try {
    const txEnable = await registry.setSelfServe(true);
    await txEnable.wait();
    const enabled = await registry.selfServeEnabled();
    result("1F.2", "setSelfServe(true) works", enabled === true, enabled, true);
  } catch (err) {
    result("1F.2", "setSelfServe(true)", false, err.message, "no error");
  }

  // No-op guard
  try {
    const txNoop = await registry.setSelfServe(true);
    await txNoop.wait();
    result("1F.3", "setSelfServe(true) again reverts (no-op guard)", false, "no revert", "revert");
  } catch (err) {
    result("1F.3", "setSelfServe no-op guard reverts correctly",
      err.message.includes("no state change"), err.message, "no state change"
    );
  }

  // Disable self-serve
  try {
    const txDisable = await registry.setSelfServe(false);
    await txDisable.wait();
    const disabled = await registry.selfServeEnabled();
    result("1F.4", "setSelfServe(false) restores invite-only", disabled === false, disabled, false);
  } catch (err) {
    result("1F.4", "setSelfServe(false)", false, err.message, "no error");
  }

  // ── 1G: Pagination ──────────────────────────────────────────────────────────
  section("1G — Pagination helper");

  try {
    const total = await registry.merchantCount();
    const [page, pageTotal] = await registry.getMerchantsPage(0, 10);
    result("1G.1", "getMerchantsPage returns results",
      page.length > 0, page.length, "> 0"
    );
    result("1G.2", "getMerchantsPage total matches merchantCount()",
      pageTotal === total, pageTotal, total
    );
    console.log(`  ℹ️  Total historical merchants: ${total}, page size: ${page.length}`);
  } catch (err) {
    result("1G.1", "getMerchantsPage", false, err.message, "no error");
  }

  // ── 1H: Two-step admin transfer ─────────────────────────────────────────────
  section("1H — Two-step admin transfer (propose only — not completing)");

  try {
    const txPropose = await registry.proposeAdminTransfer(TEST_MERCHANT_3);
    await txPropose.wait();
    const pending = await registry.pendingAdmin();
    result("1H.1", "proposeAdminTransfer sets pendingAdmin",
      pending.toLowerCase() === TEST_MERCHANT_3.toLowerCase(), pending, TEST_MERCHANT_3
    );

    // Propose again (overwrite) — should emit cancellation
    const txPropose2 = await registry.proposeAdminTransfer(TEST_MERCHANT_1);
    await txPropose2.wait();
    const pending2 = await registry.pendingAdmin();
    result("1H.2", "second propose overwrites pendingAdmin",
      pending2.toLowerCase() === TEST_MERCHANT_1.toLowerCase(), pending2, TEST_MERCHANT_1
    );

    // Cancel by proposing zero — actually just re-propose deployer to restore
    // We won't complete the transfer — just verify state and restore
    skip("1H.3", "acceptAdminTransfer", "would transfer admin away from deployer — skipped intentionally");
  } catch (err) {
    result("1H.1", "proposeAdminTransfer", false, err.message, "no error");
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(55)}`);
  console.log(`  FLOW 1 COMPLETE`);
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log("=".repeat(55));

  if (failed > 0) {
    console.log("\n  ⚠️  Fix failures before proceeding to Flow 2.");
    process.exit(1);
  } else {
    console.log("\n  🟢 Flow 1 passed. Ready for Flow 2 — createSubscription.");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
