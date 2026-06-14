/**
 * stress-test-setup.js
 * AuthOnce — Real on-chain stress test prep (Base Sepolia)
 *
 * Purpose: create N test subscriptions on SubscriptionVault v6, each funded
 * with exactly 1x subscription amount in test USDC, so the keeper picks them
 * up on its next cycle and executes real executePull() calls.
 *
 * PRE-RUN CHECKS (resolved — do not re-investigate):
 *
 *   executePull: keeper-only, signature executePull(id, deadline, bytes signature).
 *     EOA subscribers use deadline=0, signature="0x". Keeper discovers new
 *     subscriptions via the notifier, which indexes SubscriptionCreated events
 *     into the subscriptions DB table. No extra setup needed from this script.
 *
 *   Interval enum: contracts/SubscriptionVault.sol enum Interval { Weekly, Monthly, Yearly }
 *     Weekly=0, Monthly=1, Yearly=2. WEEKLY_INTERVAL_VALUE confirmed below.
 *
 * Ready to run — set env vars and go.
 *
 * USAGE:
 *   node stress-test-setup.js
 *
 * REQUIREMENTS (set in .env or environment):
 *   BASE_SEPOLIA_RPC_URL   - Alchemy RPC URL for Base Sepolia
 *   FUNDER_PRIVATE_KEY     - private key of a wallet holding test USDC,
 *                            used to (a) gas-fund each test EOA with a
 *                            small amount of Sepolia ETH, and
 *                            (b) send 1x subscription amount in test USDC
 *                            to each test EOA's safeVault after creation
 *   MERCHANT_ADDRESS       - a registered test merchant address (must exist
 *                            in MerchantRegistry v3 already)
 *
 * OUTPUT:
 *   stress-test-keys.json   - generated EOA private keys + addresses
 *                              (gitignored — DO NOT COMMIT)
 *   stress-test-results.json - subscription IDs, tx hashes, nextPullDue
 *                              readings for each test subscription
 *
 * SAFETY NOTES:
 *   - This script only touches Base SEPOLIA (testnet). Confirm
 *     BASE_SEPOLIA_RPC_URL points to sepolia, not mainnet, before running.
 *   - Amounts are tiny (suggest 1.00 USDC per subscription = 1000000
 *     with 6 decimals) — keep it small, this is a functional test only.
 *   - safeVault == msg.sender is enforced on-chain (H2 fix), so each test
 *     EOA must call createSubscription itself — this script sends the tx
 *     from each generated EOA's own key, not from FUNDER.
 */

require("dotenv").config({ path: ".env.stress-test" });
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CONFIG — fill these in
// ---------------------------------------------------------------------------

const NUM_TEST_SUBSCRIPTIONS = 10; // start with 10, scale to 30-100 once clean

const VAULT_ADDRESS = "0xeb068B47731261F7B4A5ae8535686D67D7f72321"; // v7, Base Sepolia
const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Verified: contracts/SubscriptionVault.sol:285 enum Interval { Weekly, Monthly, Yearly }
const WEEKLY_INTERVAL_VALUE = 0; // Weekly=0, Monthly=1, Yearly=2

// Subscription params — keep small for a functional test
const SUBSCRIPTION_AMOUNT = ethers.parseUnits("1.0", 6); // 1.00 USDC (6 decimals)
const INTRO_AMOUNT = 0n;
const INTRO_PULLS = 0n;
const GUARDIAN = ethers.ZeroAddress;
const TRIAL_DAYS = 0n;
const GRACE_PERIOD_DAYS = 7n; // matches locked default
const DATA_VAULT_ID = ethers.ZeroHash; // bytes32(0) — DataOnce placeholder

// Gas funding per test EOA (Sepolia ETH) — enough for createSubscription tx
const GAS_FUNDING_PER_EOA = ethers.parseEther("0.002");

// ---------------------------------------------------------------------------
// Minimal ABIs — only what we need for this script
// ---------------------------------------------------------------------------

// Real ABI entries from frontend/src/config.js (SubscriptionVault v6)
const VAULT_ABI = [
  {
    name: "createSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "merchant",         type: "address" },
      { name: "safeVault",        type: "address" },
      { name: "token",            type: "address" },
      { name: "amount",           type: "uint256" },
      { name: "introAmount",      type: "uint256" },
      { name: "introPulls",       type: "uint256" },
      { name: "interval",         type: "uint8"   },
      { name: "guardian",         type: "address" },
      { name: "trialDays",        type: "uint256" },
      { name: "gracePeriodDays_", type: "uint256" },
      { name: "dataVaultId_",     type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "nextPullDue",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "SubscriptionCreated",
    type: "event",
    inputs: [
      { name: "id",              type: "uint256", indexed: true  },
      { name: "owner",           type: "address", indexed: true  },
      { name: "merchant",        type: "address", indexed: true  },
      { name: "safeVault",       type: "address", indexed: false },
      { name: "token",           type: "address", indexed: false },
      { name: "amount",          type: "uint256", indexed: false },
      { name: "introAmount",     type: "uint256", indexed: false },
      { name: "introPulls",      type: "uint256", indexed: false },
      { name: "interval",        type: "uint8",   indexed: false },
      { name: "guardian",        type: "address", indexed: false },
      { name: "trialEndsAt",     type: "uint256", indexed: false },
      { name: "gracePeriodDays", type: "uint256", indexed: false },
      { name: "isContractVault", type: "bool",    indexed: false },
    ],
  },
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
  const FUNDER_KEY = process.env.FUNDER_PRIVATE_KEY;
  const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS;

  if (!RPC_URL || !FUNDER_KEY || !MERCHANT_ADDRESS) {
    console.error(
      "Missing required env vars: BASE_SEPOLIA_RPC_URL, FUNDER_PRIVATE_KEY, MERCHANT_ADDRESS"
    );
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // sanity check — confirm we're on Base Sepolia (chainId 84532)
  const network = await provider.getNetwork();
  if (network.chainId !== 84532n) {
    console.error(
      `Refusing to run: connected chainId is ${network.chainId}, expected 84532 (Base Sepolia).`
    );
    process.exit(1);
  }

  const funder = new ethers.Wallet(FUNDER_KEY, provider);
  const usdc = new ethers.Contract(USDC_SEPOLIA, ERC20_ABI, funder);

  console.log(`Funder address: ${funder.address}`);
  console.log(`Network: chainId ${network.chainId} (Base Sepolia confirmed)`);
  console.log(`Generating ${NUM_TEST_SUBSCRIPTIONS} test EOAs...\n`);

  const keys = [];
  const results = [];

  for (let i = 0; i < NUM_TEST_SUBSCRIPTIONS; i++) {
    const eoaWallet = ethers.Wallet.createRandom().connect(provider);
    keys.push({ index: i, address: eoaWallet.address, privateKey: eoaWallet.privateKey });

    console.log(`[${i}] Test EOA: ${eoaWallet.address}`);

    // 1. Fund EOA with gas (Sepolia ETH) from funder
    console.log(`    Funding with ${ethers.formatEther(GAS_FUNDING_PER_EOA)} ETH for gas...`);
    const fundTx = await funder.sendTransaction({
      to: eoaWallet.address,
      value: GAS_FUNDING_PER_EOA
    });
    await fundTx.wait(2); // 2 confirmations — avoids RPC state lag on testnet

    // 2. EOA calls createSubscription — safeVault = its own address (H2 rule)
    const vaultAsEoa = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, eoaWallet);
    console.log(`    Calling createSubscription (safeVault=${eoaWallet.address})...`);
    const createTx = await vaultAsEoa.createSubscription(
      MERCHANT_ADDRESS,
      eoaWallet.address, // safeVault == msg.sender
      USDC_SEPOLIA,
      SUBSCRIPTION_AMOUNT,
      INTRO_AMOUNT,
      INTRO_PULLS,
      WEEKLY_INTERVAL_VALUE,
      GUARDIAN,
      TRIAL_DAYS,
      GRACE_PERIOD_DAYS,
      DATA_VAULT_ID
    );
    const createReceipt = await createTx.wait();
    console.log(`    Tx: ${createReceipt.hash}`);

    // Try to extract subscription ID from logs (event-based)
    let subscriptionId = null;
    for (const log of createReceipt.logs) {
      try {
        const parsed = vaultAsEoa.interface.parseLog(log);
        if (parsed && parsed.name === "SubscriptionCreated") {
          subscriptionId = parsed.args.id.toString();
          break;
        }
      } catch {
        // not our event, skip
      }
    }
    if (subscriptionId === null) {
      console.warn(`    WARNING: could not parse SubscriptionCreated event — check ABI event name/signature`);
    } else {
      console.log(`    Subscription ID: ${subscriptionId}`);
    }

    // 3. Fund the safeVault (== EOA address) with exactly 1x subscription amount in USDC
    console.log(`    Sending ${ethers.formatUnits(SUBSCRIPTION_AMOUNT, 6)} USDC to vault...`);
    const usdcTx = await usdc.transfer(eoaWallet.address, SUBSCRIPTION_AMOUNT);
    await usdcTx.wait();

    // 4. EOA approves the SubscriptionVault to pull USDC — CRITICAL, keeper cannot
    //    execute executePull() without this allowance. This was the bug in the
    //    previous stress test run (IDs 10-21 stuck in grace period).
    const usdcAsEoa = new ethers.Contract(USDC_SEPOLIA, ERC20_ABI, eoaWallet);
    console.log(`    Approving vault to spend ${ethers.formatUnits(SUBSCRIPTION_AMOUNT, 6)} USDC...`);
    const approveTx = await usdcAsEoa.approve(VAULT_ADDRESS, SUBSCRIPTION_AMOUNT);
    await approveTx.wait();
    console.log(`    Approved.`);

    // 5. Read nextPullDue to confirm L5 behavior (should be <= now if due immediately)
    let nextPullDue = null;
    if (subscriptionId !== null) {
      const due = await vaultAsEoa.nextPullDue(subscriptionId);
      nextPullDue = due.toString();
      const dueDate = new Date(Number(due) * 1000);
      const now = new Date();
      console.log(`    nextPullDue: ${nextPullDue} (${dueDate.toISOString()}) — now: ${now.toISOString()}`);
      console.log(`    Due now: ${due <= BigInt(Math.floor(now.getTime() / 1000))}`);
    }

    results.push({
      index: i,
      eoaAddress: eoaWallet.address,
      subscriptionId,
      createTxHash: createReceipt.hash,
      nextPullDue
    });

    console.log("");
  }

  // Write outputs
  const keysPath = path.join(__dirname, "stress-test-keys.json");
  const resultsPath = path.join(__dirname, "stress-test-results.json");
  fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  console.log(`\nDone. ${results.length} test subscriptions created.`);
  console.log(`Keys written to: ${keysPath} (DO NOT COMMIT — add to .gitignore)`);
  console.log(`Results written to: ${resultsPath}`);
  console.log(`\nNext: check AdminDashboard System tab + audit log for keeper pickup on next cycle.`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
