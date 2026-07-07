// scripts/deploy.js
// AuthOnce Protocol v6 — Deployment Script
//
// Deploys:
//   1. MerchantRegistry v3  (address _admin, bool _isMainnet)
//   2. SubscriptionVault v6 (address _admin, address _keeper,
//                            address _protocolTreasury, address _merchantRegistry)
//   3. Approves USDC, USDT, EURC on the vault whitelist
//
// [MR-01] _isMainnet flag:
//   - base-sepolia network → false  (EOA admin permitted, testnet convenience)
//   - base-mainnet network → true   (admin MUST be Safe multisig contract)
//
// Usage:
//   Testnet:  npx hardhat run scripts/deploy.js --network base-sepolia
//   Mainnet:  npx hardhat run scripts/deploy.js --network base-mainnet
//
// Hardhat network config (hardhat.config.js):
//   base-sepolia: chainId 84532
//   base-mainnet: chainId 8453
//
// Environment variables required:
//   DEPLOYER_PRIVATE_KEY      — new deployer 0xbb6d...
//   KEEPER_PRIVATE_KEY        — keeper 0x08d3...
//   PROTOCOL_TREASURY_ADDRESS — Safe multisig 0x737D...
//
// Mainnet only (admin = Safe multisig):
//   SAFE_ADDRESS              — 0x737D4EeAEF67f776724482a29367615703A2DEB1

require("dotenv").config();
const hre = require("hardhat");

// ─── Token addresses ──────────────────────────────────────────────────────────
const TOKENS = {
  "base-sepolia": {
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    // Add Sepolia USDT/EURC addresses when available for testing
  },
  "base-mainnet": {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
  },
};

async function main() {
  const network = hre.network.name;
  console.log("=".repeat(60));
  console.log(`  AuthOnce Protocol v6 — Deploy`);
  console.log(`  Network: ${network}`);
  console.log("=".repeat(60));

  // ── Determine mainnet flag ─────────────────────────────────────────────────
  const isMainnet = network === "base-mainnet";
  console.log(`  isMainnet: ${isMainnet}`);

  if (isMainnet && !process.env.SAFE_ADDRESS) {
    throw new Error("SAFE_ADDRESS env var required for mainnet deploy");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`  Deployer: ${deployer.address}`);

  const keeperAddress   = process.env.KEEPER_ADDRESS || deployer.address;
  const treasuryAddress = process.env.PROTOCOL_TREASURY_ADDRESS;
  if (!treasuryAddress) throw new Error("PROTOCOL_TREASURY_ADDRESS not set");

  // [MR-01] On mainnet: admin is the Safe multisig.
  //         On testnet:  admin is the deployer EOA.
  const adminAddress = isMainnet
    ? process.env.SAFE_ADDRESS
    : deployer.address;

  console.log(`  Admin:    ${adminAddress} (${isMainnet ? "Safe multisig" : "EOA deployer"})`);
  console.log(`  Keeper:   ${keeperAddress}`);
  console.log(`  Treasury: ${treasuryAddress}`);
  console.log("");

  // ── 1. Deploy MerchantRegistry v3 ─────────────────────────────────────────
  console.log("Deploying MerchantRegistry v3...");
  const MerchantRegistry = await hre.ethers.getContractFactory("MerchantRegistry");
  const registry = await MerchantRegistry.deploy(adminAddress, isMainnet);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`  MerchantRegistry: ${registryAddress}`);

  // ── 2. Deploy SubscriptionVault v6 ────────────────────────────────────────
  console.log("Waiting 20s before deploying SubscriptionVault...");
  await new Promise(r => setTimeout(r, 20000));
  console.log("Deploying SubscriptionVault v6...");
  const SubscriptionVault = await hre.ethers.getContractFactory("SubscriptionVault");
  const vault = await SubscriptionVault.deploy(
    adminAddress,
    keeperAddress,
    treasuryAddress,
    registryAddress
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`  SubscriptionVault: ${vaultAddress}`);

  // ── 3. Approve tokens ─────────────────────────────────────────────────────
  const tokens = TOKENS[network] || {};
  console.log("\nWaiting 15s before token approvals to avoid rate limiting...");
  await new Promise(r => setTimeout(r, 15000));
  console.log("Approving tokens...");
  for (const [symbol, address] of Object.entries(tokens)) {
    const tx = await vault.approveToken(address);
    await tx.wait();
    console.log(`  Approved: ${symbol} (${address})`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // ── 4. Auto-approve deployer as first merchant (testnet convenience) ───────
  if (!isMainnet) {
    console.log("\nWaiting 10s before merchant approval...");
    await new Promise(r => setTimeout(r, 10000));
    console.log("Approving deployer as first merchant...");
    const REGISTRY_ABI = ["function approveMerchant(address merchant) external"];
    const registryContract = new hre.ethers.Contract(registryAddress, REGISTRY_ABI, deployer);
    const tx = await registryContract.approveMerchant(deployer.address);
    await tx.wait();
    console.log(`  Approved: ${deployer.address} ✓`);
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Network:           ${network}`);
  console.log(`  MerchantRegistry:  ${registryAddress}`);
  console.log(`  SubscriptionVault: ${vaultAddress}`);
  console.log(`  Admin:             ${adminAddress}`);
  console.log(`  Keeper:            ${keeperAddress}`);
  console.log(`  Treasury:          ${treasuryAddress}`);
  console.log("");
  console.log("  Post-deploy checklist:");
  console.log(`  [ ] Update VAULT_ADDRESS in Railway env vars`);
  console.log(`  [ ] Update MERCHANT_REGISTRY_ADDRESS in Railway env vars`);
  console.log(`  [ ] Update config.js v6 ABI + contract addresses in frontend`);
  console.log(`  [ ] Verify contracts on Basescan:`);
  console.log(`      npx hardhat verify --network ${network} ${registryAddress} "${adminAddress}" ${isMainnet}`);
  console.log(`      npx hardhat verify --network ${network} ${vaultAddress} "${adminAddress}" "${keeperAddress}" "${treasuryAddress}" "${registryAddress}"`);
  if (isMainnet) {
    console.log(`  [ ] Approve first merchant via Safe multisig transaction`);
    console.log(`  [ ] Confirm Safe 2/2 threshold — Ledger + MetaMask`);
  }
  console.log("=".repeat(60));
}

main().catch(err => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
