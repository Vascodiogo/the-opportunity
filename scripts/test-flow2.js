// scripts/test-flow2.js
// AuthOnce — Flow 2: SubscriptionVault v6 createSubscription
// Run: npx hardhat run scripts/test-flow2.js --network base-sepolia
//
// Uses deployer as both merchant AND subscriber (same wallet for testnet simplicity).
// safeVault must equal msg.sender — so deployer subscribes to itself.
// USDC allowance is set in this script before createSubscription.

require("dotenv").config();
const { ethers } = require("hardhat");

const VAULT_ADDRESS = "0x55180314174B30e778f35357035d49cAEF55C835";
const USDC_ADDRESS  = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const VAULT_ABI = [
  "function createSubscription(address,address,address,uint256,uint256,uint256,uint8,address,uint256,uint256,bytes32) returns (uint256)",
  "function subscriptions(uint256) view returns (address,address,address,address,address,uint256,uint256,uint256,uint256,uint8,uint256,uint256,uint256,uint256,uint256,uint256,bytes32,uint8,bool)",
  "function isDue(uint256) view returns (bool)",
  "function nextPullAmount(uint256) view returns (uint256)",
  "function nextPullDue(uint256) view returns (uint256)",
  "function vaultBalance(uint256) view returns (uint256)",
  "function vaultAllowance(uint256) view returns (uint256)",
  "function inTrial(uint256) view returns (bool)",
  "function inIntroPricing(uint256) view returns (bool)",
  "function introPullsRemaining(uint256) view returns (uint256)",
  "function cancelSubscription(uint256)",
  "function pauseSubscription(uint256)",
  "function resumeSubscription(uint256)",
  "function updateSafeVault(uint256,address)",
];

const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
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

async function main() {
  const [deployer] = await ethers.getSigners();
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, deployer);
  const usdc  = new ethers.Contract(USDC_ADDRESS,  ERC20_ABI,  deployer);

  console.log("=".repeat(55));
  console.log("  AuthOnce — Flow 2: createSubscription v6");
  console.log("=".repeat(55));
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Vault:     ${VAULT_ADDRESS}`);
  console.log(`  USDC:      ${USDC_ADDRESS}`);
  console.log("=".repeat(55));

  // ── Setup: approve USDC allowance ───────────────────────────────────────────
  section("Setup — USDC allowance");

  const APPROVE_AMOUNT = ethers.parseUnits("100", 6); // 100 USDC allowance
  const txApprove = await usdc.approve(VAULT_ADDRESS, APPROVE_AMOUNT);
  await txApprove.wait();
  await sleep(3000);

  const allowance = await usdc.allowance(deployer.address, VAULT_ADDRESS);
  result("S.1", "USDC allowance set to 100 USDC",
    allowance >= ethers.parseUnits("10", 6),
    ethers.formatUnits(allowance, 6), ">= 10"
  );

  // ── 2A: Happy path — basic monthly subscription ──────────────────────────────
  section("2A — Happy path: monthly subscription, no trial, no intro");

  const AMOUNT   = ethers.parseUnits("10", 6); // 10 USDC
  const MERCHANT = deployer.address;
  const VAULT    = deployer.address; // safeVault must = msg.sender

  let subId;
  try {
    const tx = await vault.createSubscription(
      MERCHANT,       // merchant
      VAULT,          // safeVault (must = msg.sender)
      USDC_ADDRESS,   // token
      AMOUNT,         // amount: 10 USDC
      0,              // introAmount: none
      0,              // introPulls: none
      INTERVAL.Monthly,
      ethers.ZeroAddress, // guardian: none
      0,              // trialDays: none
      7,              // gracePeriodDays
      ethers.ZeroHash // dataVaultId
    );
    const receipt = await tx.wait();
    await sleep(3000);

    // Get subscription ID from event
    const event = receipt.logs
      .map(log => { try { return vault.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "SubscriptionCreated");

    subId = event ? Number(event.args.id) : 0;
    console.log(`  ℹ️  Subscription ID: ${subId}`);

    result("2A.1", "createSubscription tx succeeds", true, "", "");
  } catch (err) {
    result("2A.1", "createSubscription tx succeeds", false, err.message, "no error");
    console.log("\n  ⚠️  Cannot continue without a subscription. Exiting.");
    process.exit(1);
  }

  // Read subscription struct
  const sub = await vault.subscriptions(subId);
  const owner           = sub[0];
  const guardian        = sub[1];
  const merchant        = sub[2];
  const safeVault       = sub[3];
  const token           = sub[4];
  const amount          = sub[5];
  const lastPulledAt    = sub[10];
  const gracePeriodDays = sub[15];
  const status          = Number(sub[17]);
  const isContractVault = sub[18];

  result("2A.2", "owner = deployer",
    owner.toLowerCase() === deployer.address.toLowerCase(), owner, deployer.address
  );
  result("2A.3", "merchant = deployer",
    merchant.toLowerCase() === deployer.address.toLowerCase(), merchant, deployer.address
  );
  result("2A.4", "safeVault = deployer",
    safeVault.toLowerCase() === deployer.address.toLowerCase(), safeVault, deployer.address
  );
  result("2A.5", "token = USDC",
    token.toLowerCase() === USDC_ADDRESS.toLowerCase(), token, USDC_ADDRESS
  );
  result("2A.6", "amount = 10 USDC",
    amount === AMOUNT, amount.toString(), AMOUNT.toString()
  );
  result("2A.7", "status = Active (0)",
    status === STATUS.Active, status, STATUS.Active
  );
  result("2A.8", "gracePeriodDays = 7",
    Number(gracePeriodDays) === 7, gracePeriodDays.toString(), "7"
  );
  result("2A.9", "isContractVault = false (EOA deployer)",
    isContractVault === false, isContractVault, false
  );
  result("2A.10", "guardian = zero address",
    guardian === ethers.ZeroAddress, guardian, ethers.ZeroAddress
  );

  // ── 2B: isDue and nextPullAmount ────────────────────────────────────────────
  section("2B — isDue and pull amount");

  const due = await vault.isDue(subId);
  result("2B.1", "isDue = true (lastPulledAt=0 means first pull due immediately)",
    due === true, due, true
  );

  const pullAmount = await vault.nextPullAmount(subId);
  result("2B.2", "nextPullAmount = 10 USDC",
    pullAmount === AMOUNT, ethers.formatUnits(pullAmount, 6), "10.0"
  );

  const vaultBal = await vault.vaultBalance(subId);
  const vaultAlw = await vault.vaultAllowance(subId);
  result("2B.3", "vaultBalance >= 10 USDC",
    vaultBal >= AMOUNT, ethers.formatUnits(vaultBal, 6), ">= 10.0"
  );
  result("2B.4", "vaultAllowance >= 10 USDC",
    vaultAlw >= AMOUNT, ethers.formatUnits(vaultAlw, 6), ">= 10.0"
  );

  // ── 2C: Trial period ────────────────────────────────────────────────────────
  section("2C — Trial period subscription");

  let trialSubId;
  try {
    const txTrial = await vault.createSubscription(
      MERCHANT, VAULT, USDC_ADDRESS,
      AMOUNT, 0, 0, INTERVAL.Monthly,
      ethers.ZeroAddress,
      30,             // trialDays = 30
      7, ethers.ZeroHash
    );
    const receiptTrial = await txTrial.wait();
    await sleep(3000);

    const eventTrial = receiptTrial.logs
      .map(log => { try { return vault.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "SubscriptionCreated");
    trialSubId = eventTrial ? Number(eventTrial.args.id) : subId + 1;

    const trialSub     = await vault.subscriptions(trialSubId);
    const trialEndsAt  = Number(trialSub[14]);
    const inTrial      = await vault.inTrial(trialSubId);
    const isDueTrial   = await vault.isDue(trialSubId);

    result("2C.1", "trial subscription created", true, "", "");
    result("2C.2", "trialEndsAt set (~30 days from now)",
      trialEndsAt > Math.floor(Date.now() / 1000) + 29 * 86400,
      new Date(trialEndsAt * 1000).toISOString(), "~30 days from now"
    );
    result("2C.3", "inTrial = true", inTrial === true, inTrial, true);
    result("2C.4", "isDue = false during trial", isDueTrial === false, isDueTrial, false);
  } catch (err) {
    result("2C.1", "trial subscription", false, err.message, "no error");
  }

  // ── 2D: Intro pricing ───────────────────────────────────────────────────────
  section("2D — Intro pricing subscription");

  let introSubId;
  try {
    const INTRO_AMOUNT = ethers.parseUnits("5", 6); // 5 USDC intro
    const txIntro = await vault.createSubscription(
      MERCHANT, VAULT, USDC_ADDRESS,
      AMOUNT,         // full amount: 10 USDC
      INTRO_AMOUNT,   // introAmount: 5 USDC
      3,              // introPulls: 3
      INTERVAL.Monthly,
      ethers.ZeroAddress, 0, 7, ethers.ZeroHash
    );
    const receiptIntro = await txIntro.wait();
    await sleep(3000);

    const eventIntro = receiptIntro.logs
      .map(log => { try { return vault.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "SubscriptionCreated");
    introSubId = eventIntro ? Number(eventIntro.args.id) : subId + 2;

    const inIntro      = await vault.inIntroPricing(introSubId);
    const introPullsLeft = await vault.introPullsRemaining(introSubId);
    const introNextPull  = await vault.nextPullAmount(introSubId);

    result("2D.1", "intro subscription created", true, "", "");
    result("2D.2", "inIntroPricing = true", inIntro === true, inIntro, true);
    result("2D.3", "introPullsRemaining = 3", Number(introPullsLeft) === 3, introPullsLeft.toString(), "3");
    result("2D.4", "nextPullAmount = 5 USDC (intro price)",
      introNextPull === INTRO_AMOUNT,
      ethers.formatUnits(introNextPull, 6), "5.0"
    );
  } catch (err) {
    result("2D.1", "intro subscription", false, err.message, "no error");
  }

  // ── 2E: Security — safeVault must equal msg.sender ──────────────────────────
  section("2E — Security: safeVault must equal msg.sender [H2]");

  try {
    const txBad = await vault.createSubscription(
      MERCHANT,
      "0x1111111111111111111111111111111111111111", // safeVault != msg.sender
      USDC_ADDRESS, AMOUNT, 0, 0, INTERVAL.Monthly,
      ethers.ZeroAddress, 0, 7, ethers.ZeroHash
    );
    await txBad.wait();
    result("2E.1", "VaultMustBeCaller revert fires", false, "no revert", "revert VaultMustBeCaller");
  } catch (err) {
    result("2E.1", "VaultMustBeCaller revert fires",
      err.message.includes("VaultMustBeCaller"),
      err.message, "VaultMustBeCaller"
    );
  }

  // ── 2F: Amount too high ─────────────────────────────────────────────────────
  section("2F — Security: MAX_SUBSCRIPTION_AMOUNT [SV-11]");

  try {
    const TOO_HIGH = ethers.parseUnits("1000001", 6); // > 1M USDC
    const txHigh = await vault.createSubscription(
      MERCHANT, VAULT, USDC_ADDRESS,
      TOO_HIGH, 0, 0, INTERVAL.Monthly,
      ethers.ZeroAddress, 0, 7, ethers.ZeroHash
    );
    await txHigh.wait();
    result("2F.1", "AmountTooHigh revert fires", false, "no revert", "revert AmountTooHigh");
  } catch (err) {
    result("2F.1", "AmountTooHigh revert fires",
      err.message.includes("AmountTooHigh"),
      err.message, "AmountTooHigh"
    );
  }

  // ── 2G: Cancel subscription ─────────────────────────────────────────────────
  section("2G — Cancel subscription");

  try {
    const txCancel = await vault.cancelSubscription(subId);
    await txCancel.wait();
    await sleep(3000);

    const subAfter = await vault.subscriptions(subId);
    const statusAfter = Number(subAfter[17]);
    result("2G.1", "cancelSubscription succeeds", true, "", "");
    result("2G.2", "status = Cancelled (2)",
      statusAfter === STATUS.Cancelled, statusAfter, STATUS.Cancelled
    );
  } catch (err) {
    result("2G.1", "cancelSubscription", false, err.message, "no error");
  }

  // ── 2H: updateSafeVault ─────────────────────────────────────────────────────
  section("2H — updateSafeVault [SV-06]");

  // Use trial subscription (still active)
  if (trialSubId !== undefined) {
    try {
      const NEW_VAULT = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";
      const txUpdate = await vault.updateSafeVault(trialSubId, NEW_VAULT);
      await txUpdate.wait();
      await sleep(3000);

      const subUpdated = await vault.subscriptions(trialSubId);
      const newVault   = subUpdated[3];
      const newIsContract = subUpdated[18];
      result("2H.1", "updateSafeVault succeeds", true, "", "");
      result("2H.2", "safeVault updated",
        newVault.toLowerCase() === NEW_VAULT.toLowerCase(), newVault, NEW_VAULT
      );
      result("2H.3", "isContractVault updated (0xDeadBeef has no code = false)",
        newIsContract === false, newIsContract, false
      );
    } catch (err) {
      result("2H.1", "updateSafeVault", false, err.message, "no error");
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(55)}`);
  console.log(`  FLOW 2 COMPLETE`);
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log("=".repeat(55));

  if (failed > 0) {
    console.log("\n  ⚠️  Fix failures before proceeding to Flow 3.");
    process.exit(1);
  } else {
    console.log("\n  🟢 Flow 2 passed. Ready for Flow 3 — keeper executePull.");
    console.log(`\n  ℹ️  Note subscription ID for Flow 3: create a fresh one`);
    console.log(`     with allowance set — keeper will pull it next cycle.`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
