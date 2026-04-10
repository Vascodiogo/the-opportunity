// scripts/deploy.js
// ─────────────────────────────────────────────────────────────────────────────
// Deployment script for SubscriptionVault.sol → Base Sepolia Testnet
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

  // 2. Get the deployer wallet (first account from hardhat.config.js → accounts[])
  const [deployer] = await hre.ethers.getSigners();

  // 3. Print pre-deployment summary
  const network    = hre.network.name;
  const chainId    = (await hre.ethers.provider.getNetwork()).chainId;
  const balance    = await hre.ethers.provider.getBalance(deployer.address);
  const balanceEth = hre.ethers.formatEther(balance);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         The Opportunity — SubscriptionVault Deployment       ║");
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

  // 5. Deploy SubscriptionVault
  //    Constructor args (CLAUDE.md §3):
  //      _admin            → deployer (transfer to multisig post-deploy on mainnet)
  //      _keeper           → Gelato task wallet
  //      _protocolTreasury → from .env
  //      _feeBps           → 50 (0.5%)
  console.log("  Deploying SubscriptionVault...");

  const SubscriptionVault = await hre.ethers.getContractFactory("SubscriptionVault");

  const vault = await SubscriptionVault.deploy(
    deployer.address,           // admin — YOU. Transfer to multisig after deploy.
    GELATO_KEEPER_ADDRESS,      // keeper — Gelato task wallet
    PROTOCOL_TREASURY_ADDRESS,  // protocolTreasury — from .env
    INITIAL_FEE_BPS             // feeBps — 50 = 0.5%
  );

  // 6. Wait for the deployment transaction to be mined
  await vault.waitForDeployment();
  const contractAddress = await vault.getAddress();
  const deployTx        = vault.deploymentTransaction();

  // 7. Print results
  console.log("\n  ✅  SubscriptionVault deployed successfully!\n");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │  CONTRACT ADDRESS                                           │");
  console.log(`  │  ${contractAddress}                  │`);
  console.log("  └─────────────────────────────────────────────────────────────┘\n");
  console.log("  Transaction hash: ", deployTx.hash);
  console.log("  Basescan URL:     ", `https://sepolia.basescan.org/address/${contractAddress}`);

  // 8. Post-deploy checklist
  console.log("\n──────────────────────────────────────────────────────────────────");
  console.log("  📋  POST-DEPLOY CHECKLIST");
  console.log("──────────────────────────────────────────────────────────────────");
  console.log("\n  1. Record the contract address in CLAUDE.md §2:");
  console.log(`     SubscriptionVault.sol: ${contractAddress}`);
  console.log("\n  2. Verify the contract on Basescan:");
  console.log(`     npx hardhat verify --network baseSepolia ${contractAddress} \\`);
  console.log(`       "${deployer.address}" \\`);
  console.log(`       "${GELATO_KEEPER_ADDRESS}" \\`);
  console.log(`       "${PROTOCOL_TREASURY_ADDRESS}" \\`);
  console.log(`       ${INITIAL_FEE_BPS}`);
  console.log("\n  3. Approve at least one test merchant:");
  console.log("     Call approveMerchant(address) on the deployed contract.");
  console.log("\n  4. Transfer admin to a multisig before mainnet.\n");
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch((error) => {
  console.error("\n❌  Deployment failed:\n", error);
  process.exit(1);
});
