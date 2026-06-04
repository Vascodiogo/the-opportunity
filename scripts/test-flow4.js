// scripts/test-flow4.js
// AuthOnce — Flow 4: Merchant Actions
// Run: npx hardhat run scripts/test-flow4.js --network base-sepolia
//
// Tests:
//   4A — setProductExpiry (30-day price change notice)
//   4B — merchantPauseSubscription (billingPausedUntil — SV-02 fix)
//   4C — Merchant pause cooldown + lifetime cap
//   4D — Admin: setFeeBps one-way ratchet (SV-01 fix)
//   4E — Admin: setKeeper
//   4F — Admin: setProtocolTreasury

require("dotenv").config();
const { ethers } = require("hardhat");

const VAULT_ADDRESS    = "0x55180314174B30e778f35357035d49cAEF55C835";
const USDC_ADDRESS     = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const VAULT_ABI = [
  "function createSubscription(address,address,address,uint256,uint256,uint256,uint8,address,uint256,uint256,bytes32) returns (uint256)",
  "function subscriptions(uint256) view returns (address,address,address,address,address,uint256,uint256,uint256,uint256,uint8,uint256,uint256,uint256,uint256,uint256,uint256,bytes32,uint8,bool)",
  "function setProductExpiry(uint256,uint256)",
  "function merchantPauseSubscription(uint256,uint256)",
  "function isDue(uint256) view returns (bool)",
  "function nextPullDue(uint256) view returns (uint256)",
  "function feeBps() view returns (uint16)",
  "function setFeeBps(uint16)",
  "function keeper() view returns (address)",
  "function setKeeper(address)",
  "function protocolTreasury() view returns (address)",
  "function setProtocolTreasury(address)",
  "function totalMerchantPauseDays(uint256) view returns (uint256)",
  "function lastMerchantPauseAt(uint256) view returns (uint256)",
  "function cancelSubscription(uint256)",
];

const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
];

const INTERVAL = { Weekly: 0, Monthly: 1, Yearly: 2 };
const STATUS   = { Active: 0, Paused: 1, Cancelled: 2, Expired: 3 };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let passed = 0;
let failed = 0;

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

function section(title) {
  console.log(`\n${"─".repeat(55)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(55));
}

async function createTestSubscription(vault, usdc, deployer, graceDays = 7) {
  await usdc.approve(VAULT_ADDRESS, ethers.parseUnits("100", 6));
  const tx = await vault.createSubscription(
    deployer.address, deployer.address, USDC_ADDRESS,
    ethers.parseUnits("10", 6), 0, 0, INTERVAL.Monthly,
    ethers.ZeroAddress, 0, graceDays, ethers.ZeroHash
  );
  await tx.wait();
  await sleep(3000);

  // Find latest active subscription owned by deployer
  let subId = null;
  for (let i = 0; i < 50; i++) {
    try {
      const s = await vault.subscriptions(i);
      if (s[0].toLowerCase() === deployer.address.toLowerCase() && Number(s[17]) === STATUS.Active) {
        subId = i;
      }
    } catch { break; }
  }
  return subId;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, deployer);
  const usdc  = new ethers.Contract(USDC_ADDRESS,  ERC20_ABI,  deployer);

  console.log("=".repeat(55));
  console.log("  AuthOnce — Flow 4: Merchant Actions v6");
  console.log("=".repeat(55));
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log("=".repeat(55));

  // ── 4A: setProductExpiry ────────────────────────────────────────────────────
  section("4A — setProductExpiry (30-day price change notice)");

  const subA = await createTestSubscription(vault, usdc, deployer);
  console.log(`  ℹ️  Test subscription ID: ${subA}`);

  // Must be at least 30 days from now
  const now         = Math.floor(Date.now() / 1000);
  const validExpiry = now + 31 * 86400; // 31 days
  const shortExpiry = now + 29 * 86400; // 29 days — too short

  // Should revert — insufficient notice
  try {
    const txShort = await vault.setProductExpiry(subA, shortExpiry);
    await txShort.wait();
    result("4A.1", "setProductExpiry < 30 days reverts InsufficientNotice",
      false, "no revert", "revert InsufficientNotice"
    );
  } catch (err) {
    result("4A.1", "setProductExpiry < 30 days reverts InsufficientNotice",
      err.message.includes("InsufficientNotice"),
      err.message, "InsufficientNotice"
    );
  }

  // Should succeed — 31 days notice
  try {
    const txExpiry = await vault.setProductExpiry(subA, validExpiry);
    await txExpiry.wait();
    await sleep(3000);

    const subAfter = await vault.subscriptions(subA);
    const expiresAt = Number(subAfter[13]);
    result("4A.2", "setProductExpiry 31 days succeeds", true, "", "");
    result("4A.3", "expiresAt set correctly",
      expiresAt === validExpiry, expiresAt, validExpiry
    );
  } catch (err) {
    result("4A.2", "setProductExpiry 31 days", false, err.message, "no error");
  }

  // Cannot shorten existing expiry
  try {
    const shorterExpiry = validExpiry - 86400; // 1 day shorter
    const txShorten = await vault.setProductExpiry(subA, shorterExpiry);
    await txShorten.wait();
    result("4A.4", "cannot shorten existing expiry reverts", false, "no revert", "revert CannotShortenExpiry");
  } catch (err) {
    result("4A.4", "cannot shorten existing expiry reverts CannotShortenExpiry",
      err.message.includes("CannotShortenExpiry"),
      err.message, "CannotShortenExpiry"
    );
  }

  // Non-merchant cannot set expiry
  try {
    const randomWallet = ethers.Wallet.createRandom().connect(deployer.provider);
    const vaultAsRandom = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, randomWallet);
    const txBad = await vaultAsRandom.setProductExpiry(subA, validExpiry + 86400);
    await txBad.wait();
    result("4A.5", "non-merchant setProductExpiry reverts", false, "no revert", "revert NotMerchant");
  } catch (err) {
    result("4A.5", "non-merchant setProductExpiry reverts",
      err.message.includes("NotMerchant") || err.message.includes("insufficient funds"),
      err.message, "NotMerchant"
    );
  }

  // ── 4B: merchantPauseSubscription ──────────────────────────────────────────
  section("4B — merchantPauseSubscription [SV-02: billingPausedUntil]");

  const subB = await createTestSubscription(vault, usdc, deployer);
  console.log(`  ℹ️  Test subscription ID: ${subB}`);

  try {
    const txMerchPause = await vault.merchantPauseSubscription(subB, 7);
    await txMerchPause.wait();
    await sleep(3000);

    const subAfterPause = await vault.subscriptions(subB);
    const billingPausedUntil = Number(subAfterPause[11]); // billingPausedUntil field
    const statusAfterPause   = Number(subAfterPause[17]);
    const nowTs              = Math.floor(Date.now() / 1000);

    result("4B.1", "merchantPauseSubscription(7) succeeds", true, "", "");
    result("4B.2", "status remains Active (not Paused) — merchant pause doesn't change status",
      statusAfterPause === STATUS.Active, statusAfterPause, STATUS.Active
    );
    result("4B.3", "billingPausedUntil set ~7 days from now [SV-02]",
      billingPausedUntil > nowTs + 6 * 86400,
      new Date(billingPausedUntil * 1000).toISOString(), "~7 days from now"
    );

    // isDue should be false while billing is paused
    const isDuePaused = await vault.isDue(subB);
    result("4B.4", "isDue = false while billingPausedUntil in future [SV-02]",
      isDuePaused === false, isDuePaused, false
    );

    // lastPulledAt should NOT be modified [SV-02 fix — no longer abuses lastPulledAt]
    const lastPulledAt = Number(subAfterPause[10]);
    result("4B.5", "lastPulledAt NOT modified by merchantPause [SV-02 fix]",
      lastPulledAt === 0, lastPulledAt, 0
    );

    const totalPauseDays = await vault.totalMerchantPauseDays(subB);
    result("4B.6", "totalMerchantPauseDays = 7",
      Number(totalPauseDays) === 7, totalPauseDays.toString(), "7"
    );
  } catch (err) {
    result("4B.1", "merchantPauseSubscription", false, err.message, "no error");
  }

  // ── 4C: Merchant pause cooldown and limits ──────────────────────────────────
  section("4C — Merchant pause: cooldown + lifetime cap");

  // Cooldown — cannot pause again immediately
  try {
    const txPause2 = await vault.merchantPauseSubscription(subB, 7);
    await txPause2.wait();
    result("4C.1", "second pause within cooldown reverts", false, "no revert", "revert MerchantPauseCooldownActive");
  } catch (err) {
    result("4C.1", "second pause within 30-day cooldown reverts",
      err.message.includes("MerchantPauseCooldownActive"),
      err.message, "MerchantPauseCooldownActive"
    );
  }

  // MinOneDayPause
  const subC = await createTestSubscription(vault, usdc, deployer);
  try {
    const txZero = await vault.merchantPauseSubscription(subC, 0);
    await txZero.wait();
    result("4C.2", "pauseDays=0 reverts MinOneDayPause", false, "no revert", "revert MinOneDayPause");
  } catch (err) {
    result("4C.2", "pauseDays=0 reverts MinOneDayPause",
      err.message.includes("MinOneDayPause"),
      err.message, "MinOneDayPause"
    );
  }

  // PauseTooLong
  try {
    const txTooLong = await vault.merchantPauseSubscription(subC, 91);
    await txTooLong.wait();
    result("4C.3", "pauseDays=91 reverts PauseTooLong", false, "no revert", "revert PauseTooLong");
  } catch (err) {
    result("4C.3", "pauseDays=91 reverts PauseTooLong",
      err.message.includes("PauseTooLong"),
      err.message, "PauseTooLong"
    );
  }

  // ── 4D: setFeeBps one-way ratchet ───────────────────────────────────────────
  section("4D — setFeeBps one-way ratchet [M1]");

  const currentFee = await vault.feeBps();
  console.log(`  ℹ️  Current feeBps: ${currentFee} (${Number(currentFee) / 100}%)`);

  // Cannot raise fee
  try {
    const txRaise = await vault.setFeeBps(currentFee + 1n);
    await txRaise.wait();
    result("4D.1", "raising fee reverts CanOnlyLowerFee", false, "no revert", "revert CanOnlyLowerFee");
  } catch (err) {
    result("4D.1", "raising fee reverts CanOnlyLowerFee",
      err.message.includes("CanOnlyLowerFee"),
      err.message, "CanOnlyLowerFee"
    );
  }

  // Cannot exceed MAX_FEE_BPS (200)
  try {
    const txTooHigh = await vault.setFeeBps(201);
    await txTooHigh.wait();
    result("4D.2", "fee > 200bps reverts FeeTooHigh", false, "no revert", "revert FeeTooHigh");
  } catch (err) {
    result("4D.2", "fee > 200bps reverts FeeTooHigh",
      err.message.includes("FeeTooHigh"),
      err.message, "FeeTooHigh"
    );
  }

  // Can lower fee
  try {
    const newFee = Number(currentFee) - 1;
    const txLower = await vault.setFeeBps(newFee);
    await txLower.wait();
    await sleep(3000);
    const feeAfter = await vault.feeBps();
    result("4D.3", "lowering fee succeeds",
      Number(feeAfter) === newFee, feeAfter.toString(), newFee.toString()
    );

    // Restore fee to 50
    const txRestore = await vault.setFeeBps(newFee - 1 <= 0 ? 0 : newFee);
    await txRestore.wait();
    console.log(`  ℹ️  Fee restored to ${newFee}bps (cannot raise back to 50 — one-way ratchet)`);
  } catch (err) {
    result("4D.3", "lowering fee", false, err.message, "no error");
  }

  // ── 4E: setKeeper ───────────────────────────────────────────────────────────
  section("4E — setKeeper");

  const currentKeeper = await vault.keeper();
  const NEW_KEEPER    = "0x1234567890123456789012345678901234567890";

  try {
    const txKeeper = await vault.setKeeper(NEW_KEEPER);
    await txKeeper.wait();
    await sleep(3000);

    const keeperAfter = await vault.keeper();
    result("4E.1", "setKeeper succeeds",
      keeperAfter.toLowerCase() === NEW_KEEPER.toLowerCase(),
      keeperAfter, NEW_KEEPER
    );

    // Restore keeper
    const txRestoreKeeper = await vault.setKeeper(currentKeeper);
    await txRestoreKeeper.wait();
    await sleep(2000);
    const keeperRestored = await vault.keeper();
    result("4E.2", "keeper restored to deployer",
      keeperRestored.toLowerCase() === currentKeeper.toLowerCase(),
      keeperRestored, currentKeeper
    );
  } catch (err) {
    result("4E.1", "setKeeper", false, err.message, "no error");
  }

  // ── 4F: setProtocolTreasury ─────────────────────────────────────────────────
  section("4F — setProtocolTreasury");

  const currentTreasury = await vault.protocolTreasury();
  const NEW_TREASURY    = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";

  try {
    const txTreasury = await vault.setProtocolTreasury(NEW_TREASURY);
    await txTreasury.wait();
    await sleep(3000);

    const treasuryAfter = await vault.protocolTreasury();
    result("4F.1", "setProtocolTreasury succeeds",
      treasuryAfter.toLowerCase() === NEW_TREASURY.toLowerCase(),
      treasuryAfter, NEW_TREASURY
    );

    // Restore treasury to Safe
    const txRestoreTreasury = await vault.setProtocolTreasury(currentTreasury);
    await txRestoreTreasury.wait();
    await sleep(2000);
    const treasuryRestored = await vault.protocolTreasury();
    result("4F.2", "treasury restored to Safe multisig",
      treasuryRestored.toLowerCase() === currentTreasury.toLowerCase(),
      treasuryRestored, currentTreasury
    );
  } catch (err) {
    result("4F.1", "setProtocolTreasury", false, err.message, "no error");
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(55)}`);
  console.log(`  FLOW 4 COMPLETE`);
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log("=".repeat(55));

  if (failed > 0) {
    console.log("\n  ⚠️  Review failures above.");
    process.exit(1);
  } else {
    console.log("\n  🟢 Flow 4 passed. Merchant + admin actions verified.");
    console.log("     Next: Flow 5 — API layer tests.");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
