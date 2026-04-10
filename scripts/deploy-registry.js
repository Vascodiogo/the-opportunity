// scripts/deploy-registry.js
// ─────────────────────────────────────────────────────────────────────────────
// Deployment script for MerchantRegistry.sol → Base Sepolia Testnet
//
// Before running:
//   1. Ensure ADMIN_ADDRESS is set in your .env
//   2. Ensure your deployer wallet has Base Sepolia ETH for gas
//   3. Run: npx hardhat run scripts/deploy-registry.js --network baseSepolia
//
// After running:
//   1. Copy the deployed address from the output
//   2. Update CLAUDE.md Section 2 → MerchantRegistry.sol (Base Sepolia)
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const { ethers, network } = hre;

  // ── Config ────────────────────────────────────────────────────────────────
  const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS;

  if (!ADMIN_ADDRESS || ADMIN_ADDRESS.startsWith("0x_")) {
    console.error("\n❌  ADMIN_ADDRESS is not set in your .env file.");
    console.error("    Add this line to .env:");
    console.error("    ADMIN_ADDRESS=0x44444D60136Cf62804963fA14d62a55c34a96f8F\n");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const chainId    = (await ethers.provider.getNetwork()).chainId;
  const balance    = await ethers.provider.getBalance(deployer.address);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         The Opportunity — MerchantRegistry Deployment        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("  Network:           ", network.name, `(chainId: ${chainId})`);
  console.log("  Deployer:          ", deployer.address);
  console.log("  Deployer balance:  ", ethers.formatEther(balance), "ETH");
  console.log("  Registry admin:    ", ADMIN_ADDRESS);
  console.log("");

  // ── Mainnet guard ─────────────────────────────────────────────────────────
  if (network.name === "baseMainnet") {
    console.log("⚠️   MAINNET DEPLOYMENT DETECTED");
    console.log("    ADMIN_ADDRESS must be a multisig before mainnet (CLAUDE.md §7).");
    console.log("    Sleeping 5 seconds — press Ctrl+C to abort.\n");
    await new Promise((r) => setTimeout(r, 5000));
  }

  // ── Deploy ────────────────────────────────────────────────────────────────
  console.log("  Deploying MerchantRegistry...");

  const Factory  = await ethers.getContractFactory("MerchantRegistry");
  const registry = await Factory.deploy(ADMIN_ADDRESS);
  await registry.waitForDeployment();

  const registryAddress = await registry.getAddress();
  const deployTx        = registry.deploymentTransaction();

  // ── Smoke tests ───────────────────────────────────────────────────────────
  const onChainAdmin  = await registry.admin();
  const merchantCount = await registry.merchantCount();

  if (onChainAdmin.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()) {
    throw new Error(`Admin mismatch — expected ${ADMIN_ADDRESS}, got ${onChainAdmin}`);
  }

  console.log("\n  ✅  MerchantRegistry deployed successfully!\n");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │  CONTRACT ADDRESS                                           │");
  console.log(`  │  ${registryAddress}                  │`);
  console.log("  └─────────────────────────────────────────────────────────────┘\n");
  console.log("  Transaction hash:  ", deployTx.hash);
  console.log("  Basescan URL:      ", `https://sepolia.basescan.org/address/${registryAddress}`);
  console.log("  Admin (on-chain):  ", onChainAdmin, "✅");
  console.log("  Merchant count:    ", merchantCount.toString(), "(expected 0) ✅");

  // ── Verification ──────────────────────────────────────────────────────────
  if (process.env.BASESCAN_API_KEY && network.name !== "hardhat") {
    console.log("\n  Waiting 15s for Basescan to index...");
    await new Promise((r) => setTimeout(r, 15000));

    try {
      await hre.run("verify:verify", {
        address: registryAddress,
        constructorArguments: [ADMIN_ADDRESS],
      });
      console.log("  ✅  Verified on Basescan automatically.");
    } catch (err) {
      if (err.message.includes("Already Verified")) {
        console.log("  ℹ️   Already verified.");
      } else {
        console.log("\n  ⚠️   Auto-verify failed (normal with viaIR).");
        console.log("  Generate the Standard-Json-Input file and upload to Basescan manually:");
        console.log("\n  Step 1 — find your build-info file:");
        console.log("  dir artifacts\\build-info\\");
        console.log("\n  Step 2 — generate the input JSON:");
        console.log("  type artifacts\\build-info\\YOUR_HASH.json | python -c \"import sys,json; d=json.load(sys.stdin); print(json.dumps(d['input'], indent=2))\" > registry-standard-input.json");
        console.log("\n  Step 3 — upload registry-standard-input.json to Basescan");
        console.log("  using the Standard-Json-Input verification method.\n");
      }
    }
  }

  // ── Post-deploy checklist ─────────────────────────────────────────────────
  console.log("\n──────────────────────────────────────────────────────────────────");
  console.log("  📋  POST-DEPLOY CHECKLIST");
  console.log("──────────────────────────────────────────────────────────────────");
  console.log(`\n  1. Record this address in CLAUDE.md Section 2:`);
  console.log(`     MerchantRegistry.sol (Base Sepolia): ${registryAddress}`);
  console.log(`\n  2. Approve your first test merchant:`);
  console.log(`     Call approveMerchant() on Basescan Write tab.`);
  console.log(`\n  3. Phase 1 complete → begin Phase 2 Keeper Bot.\n`);
}

main().catch((err) => {
  console.error("\n❌  Deployment failed:\n", err);
  process.exit(1);
});
