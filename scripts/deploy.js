// scripts/deploy.js
// ─────────────────────────────────────────────────────────────────────────────
// Deployment script for:
//   - SubscriptionVault.sol
//   - MerchantRegistry.sol
// Target: Base Sepolia Testnet
//
// Before running:
//   1. Copy .env.example → .env and fill in all values
//   2. Ensure your deployer wallet has Base Sepolia ETH for gas
//      Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
//   3. Run: npx hardhat run scripts/deploy.js --network baseSepolia
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const hre = require("hardhat");

// ─── Config from .env ────────────────────────────────────────────────────────

const PROTOCOL_TREASURY_ADDRESS = process.env.PROTOCOL_TREASURY_ADDRESS;
const GELATO_KEEPER_ADDRESS     = process.env.GELATO_KEEPER_ADDRESS;

// Protocol fee: 50 basis points = 0.5% (CLAUDE.md §3.9)
const INITIAL_FEE_BPS = 50;

// ─── Pre-flight checks ───────────────────────────────────────────────────────

function validateEnv() {
  const missing = [];

  if (!PROTOCOL_TREASURY_ADDRESS || PROTOCOL_TREASURY_ADDRESS.startsWith("0x_")) {
    missing.push("PROTOCOL_TREASURY_ADDRESS");
  }
  if (!GELATO_KEEPER_ADDRESS || GELATO_KEEPER_ADDRESS.startsWith("0x_")) {
    missing.push("GELATO_KEEPER_ADDRESS");
  }

  if (missing.length > 0) {
    console.error("\n❌  Missing required .env variables:");
    missing.forEach((v) => console.error(`     - ${v}`));
    console.error("\n   Open your .env file and fill in these values before deploying.\n");
    process.exit(1);
  }
}

// ─── Main deployment ─────────────────────────────────────────────────────────

async function main() {
  // 1. Validate environment
  validateEnv();

  // 2. Get the deployer wallet
  const [deployer] = await hre.ethers.getSigners();

  // 3. Print pre-deployment summary
  const network    = hre.network.name;
  const chainId    = (await hre.ethers.provider.getNetwork()).chainId;
  const balance    = await hre.ethers.provider.getBalance(deployer.address);
  const balanceEth = hre.ethers.formatEther(balance);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║           AuthOnce Protocol — Full Deployment                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("  Network:           ", network, `(chainId: ${chainId})`);
  console.log("  Deployer:          ", deployer.address);
  console.log("  Deployer balance:  ", balanceEth, "ETH");
  console.log("  Protocol treasury: ", PROTOCOL_TREASURY_ADDRESS);
  console.log("  Gelato keeper:     ", GELATO_KEEPER_ADDRESS);
  console.log("  Initial fee:       ", `${INITIAL_FEE_BPS} bps (${INITIAL_FEE_BPS / 100}%)`);
  console.log("");

  // 4. Safety gate — warn loudly if deploying to mainnet
  if (network === "baseMainnet") {
    console.log("⚠️   MAINNET DEPLOYMENT DETECTED");
    console.log("    Only proceed if the contract has been audited (CLAUDE.md §8, Phase 7).");
    console.log("    Sleeping 5 seconds — press Ctrl+C to abort.\n");
    await new Promise((r) => setTimeout(r, 5000));
  }

  // ─── Deploy MerchantRegistry ────────────────────────────────────────────────

  console.log("  [1/2] Deploying MerchantRegistry...");

  const MerchantRegistry = await hre.ethers.getContractFactory("MerchantRegistry");
  const registry = await MerchantRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  const registryTx      = registry.deploymentTransaction();

  console.log("  ✅  MerchantRegistry deployed!\n");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │  MERCHANT REGISTRY ADDRESS                                  │");
  console.log(`  │  ${registryAddress}                  │`);
  console.log("  └─────────────────────────────────────────────────────────────┘");
  console.log("  Transaction hash: ", registryTx.hash);
  console.log("  Basescan URL:     ", `https://sepolia.basescan.org/address/${registryAddress}\n`);

  // ─── Deploy SubscriptionVault ───────────────────────────────────────────────

  console.log("  [2/2] Deploying SubscriptionVault...");

  const SubscriptionVault = await hre.ethers.getContractFactory("SubscriptionVault");
  const vault = await SubscriptionVault.deploy(
    deployer.address,
    GELATO_KEEPER_ADDRESS,
    PROTOCOL_TREASURY_ADDRESS,
    INITIAL_FEE_BPS
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  const vaultTx      = vault.deploymentTransaction();

  console.log("  ✅  SubscriptionVault deployed!\n");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │  SUBSCRIPTION VAULT ADDRESS                                 │");
  console.log(`  │  ${vaultAddress}                  │`);
  console.log("  └─────────────────────────────────────────────────────────────┘");
  console.log("  Transaction hash: ", vaultTx.hash);
  console.log("  Basescan URL:     ", `https://sepolia.basescan.org/address/${vaultAddress}\n`);

  // ─── Post-deploy summary ────────────────────────────────────────────────────

  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  🎉  DEPLOYMENT COMPLETE — AuthOnce Protocol v1.0.0");
  console.log("══════════════════════════════════════════════════════════════════\n");
  console.log("  📋  POST-DEPLOY CHECKLIST");
  console.log("──────────────────────────────────────────────────────────────────");
  console.log("\n  1. Record both addresses in CLAUDE.md §2:");
  console.log(`     MerchantRegistry.sol:  ${registryAddress}`);
  console.log(`     SubscriptionVault.sol: ${vaultAddress}`);

  console.log("\n  2. Verify MerchantRegistry on Basescan:");
  console.log(`     npx hardhat verify --network baseSepolia ${registryAddress} \\`);
  console.log(`       "${deployer.address}"`);

  console.log("\n  3. Verify SubscriptionVault on Basescan:");
  console.log(`     npx hardhat verify --network baseSepolia ${vaultAddress} \\`);
  console.log(`       "${deployer.address}" \\`);
  console.log(`       "${GELATO_KEEPER_ADDRESS}" \\`);
  console.log(`       "${PROTOCOL_TREASURY_ADDRESS}" \\`);
  console.log(`       ${INITIAL_FEE_BPS}`);

  console.log("\n  4. Approve your test merchant on MerchantRegistry:");
  console.log("     Call approveMerchant(address) via Basescan Write tab.");

  console.log("\n  5. Commit new addresses to GitHub:");
  console.log('     git add . && git commit -m "Redeploy v1.0.0 with BUSL-1.1 watermark" && git push\n');
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch((error) => {
  console.error("\n❌  Deployment failed:\n", error);
  process.exit(1);
});
