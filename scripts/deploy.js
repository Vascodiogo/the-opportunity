// scripts/deploy.js
// =============================================================================
//  AuthOnce Protocol v5 — Deployment Script
//
//  Deploys:
//    1. MerchantRegistry v2
//    2. SubscriptionVault v5
//
//  Then:
//    3. Approves initial token whitelist (USDC + optional extras)
//    4. Approves deployer wallet as first test merchant
//    5. Prints deployment summary
//
//  Usage:
//    Base Sepolia:  npx hardhat run scripts/deploy.js --network base-sepolia
//    Base Mainnet:  npx hardhat run scripts/deploy.js --network base-mainnet
//
//  Required env vars (in .env):
//    DEPLOYER_PRIVATE_KEY     — deployer + initial admin wallet
//    KEEPER_WALLET            — keeper bot wallet address (from Railway)
//    PROTOCOL_TREASURY        — Safe multisig address (receives 0.5% fees)
//    BASE_SEPOLIA_RPC_URL     — RPC endpoint
//
//  Optional env vars:
//    APPROVE_TEST_MERCHANT    — set to "true" to approve deployer as merchant
//    BASESCAN_API_KEY         — for contract verification
//
//  After deployment:
//    1. Copy contract addresses into CLAUDE-CORE.md §2
//    2. Update VAULT_ADDRESS in Railway env for keeper and notifier
//    3. Run verification commands printed at end of script
//    4. Transfer admin to Safe multisig via proposeAdminTransfer()
// =============================================================================

require("dotenv").config();
const hre = require("hardhat");
const { ethers } = require("hardhat");

// ─── Token addresses ──────────────────────────────────────────────────────────

const TOKENS = {
  "base-sepolia": {
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    // Add more Sepolia test tokens here when available
  },
  "base-mainnet": {
    USDC:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT:  "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    DAI:   "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    EURC:  "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
    WETH:  "0x4200000000000000000000000000000000000006",
    cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function separator(title) {
  const line = "─".repeat(58);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${title.padEnd(56)}│`);
  console.log(`└${line}┘`);
}

async function waitBlocks(provider, n) {
  const start = await provider.getBlockNumber();
  process.stdout.write(`  Waiting ${n} block confirmations...`);
  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const current = await provider.getBlockNumber();
    if (current >= start + n) break;
    process.stdout.write(".");
  }
  console.log(" done");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const network      = hre.network.name;
  const [deployer]   = await ethers.getSigners();
  const provider     = deployer.provider;
  const balance      = await provider.getBalance(deployer.address);

  const KEEPER_WALLET      = required("KEEPER_WALLET");
  const PROTOCOL_TREASURY  = required("PROTOCOL_TREASURY");
  const APPROVE_TEST       = process.env.APPROVE_TEST_MERCHANT === "true";

  const tokenMap = TOKENS[network];
  if (!tokenMap) throw new Error(`No token config for network: ${network}`);

  // ── Pre-flight checks ──────────────────────────────────────────────────────
  separator("AuthOnce Protocol v5 — Deployment");
  console.log(`  Network:   ${network}`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log(`  Keeper:    ${KEEPER_WALLET}`);
  console.log(`  Treasury:  ${PROTOCOL_TREASURY}`);
  console.log(`  Tokens:    ${Object.keys(tokenMap).join(", ")}`);
  console.log(`  Test merchant approval: ${APPROVE_TEST}`);

  if (balance < ethers.parseEther("0.007")) {
    throw new Error("Deployer balance too low — need at least 0.007 ETH");
  }

  // ── 1. Deploy MerchantRegistry ─────────────────────────────────────────────
  separator("Step 1 — Deploy MerchantRegistry v2");

  const Registry = await ethers.getContractFactory("MerchantRegistry");
  console.log("  Deploying...");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`  ✅ MerchantRegistry: ${registryAddress}`);
  console.log(`  TX: ${registry.deploymentTransaction().hash}`);

  await waitBlocks(provider, 3);

  // ── 2. Deploy SubscriptionVault ────────────────────────────────────────────
  separator("Step 2 — Deploy SubscriptionVault v5");

  const Vault = await ethers.getContractFactory("SubscriptionVault");
  console.log("  Deploying...");
  const vault = await Vault.deploy(
    deployer.address,   // admin
    KEEPER_WALLET,      // keeper
    PROTOCOL_TREASURY,  // protocolTreasury
    registryAddress     // merchantRegistry
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`  ✅ SubscriptionVault: ${vaultAddress}`);
  console.log(`  TX: ${vault.deploymentTransaction().hash}`);

  await waitBlocks(provider, 3);

  // ── 3. Approve token whitelist ─────────────────────────────────────────────
  separator("Step 3 — Approve token whitelist");

  for (const [symbol, address] of Object.entries(tokenMap)) {
    process.stdout.write(`  Approving ${symbol} (${address})...`);
    const tx = await vault.approveToken(address);
    await tx.wait();
    console.log(` ✅`);
  }

  // ── 4. Approve test merchant (optional) ───────────────────────────────────
  if (APPROVE_TEST) {
    separator("Step 4 — Approve test merchant");
    console.log(`  Approving deployer wallet as test merchant...`);
    const tx = await registry.approveMerchant(deployer.address);
    await tx.wait();
    console.log(`  ✅ ${deployer.address} approved as merchant`);
  }

  // ── 5. Verify deployment state ────────────────────────────────────────────
  separator("Step 5 — Verify deployment state");

  const vaultAdmin     = await vault.admin();
  const vaultKeeper    = await vault.keeper();
  const vaultTreasury  = await vault.protocolTreasury();
  const vaultRegistry  = await vault.merchantRegistry();
  const vaultFeeBps    = await vault.feeBps();
  const vaultVersion   = await vault.VERSION();
  const registryAdmin  = await registry.admin();
  const registryVersion = await registry.VERSION();
  const selfServe      = await registry.selfServeEnabled();
  const tokenList      = await vault.approvedTokenList();

  console.log(`  Vault version:       ${vaultVersion}`);
  console.log(`  Vault admin:         ${vaultAdmin}`);
  console.log(`  Vault keeper:        ${vaultKeeper}`);
  console.log(`  Vault treasury:      ${vaultTreasury}`);
  console.log(`  Vault registry:      ${vaultRegistry}`);
  console.log(`  Vault fee:           ${vaultFeeBps} bps (${Number(vaultFeeBps) / 100}%)`);
  console.log(`  Vault tokens:        ${tokenList.length} approved`);
  console.log(`  Registry version:    ${registryVersion}`);
  console.log(`  Registry admin:      ${registryAdmin}`);
  console.log(`  Registry self-serve: ${selfServe}`);

  // Sanity checks
  if (vaultAdmin.toLowerCase()    !== deployer.address.toLowerCase()) throw new Error("Admin mismatch");
  if (vaultKeeper.toLowerCase()   !== KEEPER_WALLET.toLowerCase())    throw new Error("Keeper mismatch");
  if (vaultRegistry.toLowerCase() !== registryAddress.toLowerCase())  throw new Error("Registry mismatch");
  if (Number(vaultFeeBps)         !== 50)                             throw new Error("Fee mismatch — expected 50 bps");
  if (selfServe                   !== false)                          throw new Error("selfServeEnabled should be false at deploy");

  console.log(`\n  ✅ All sanity checks passed`);

  // ── 6. Deployment summary ─────────────────────────────────────────────────
  separator("Deployment Summary");

  console.log(`\n  PASTE INTO CLAUDE-CORE.md §2:\n`);
  console.log(`  **Contract addresses — ${network}:**`);
  console.log(`  - SubscriptionVault v5: \`${vaultAddress}\``);
  console.log(`  - MerchantRegistry v2:  \`${registryAddress}\``);
  if (tokenMap.USDC) {
    console.log(`  - USDC:                 \`${tokenMap.USDC}\``);
  }
  console.log(``);
  console.log(`  UPDATE RAILWAY ENV VARS:`);
  console.log(`    VAULT_ADDRESS=${vaultAddress}`);
  console.log(``);

  // ── 7. Verification commands ──────────────────────────────────────────────
  separator("Basescan Verification Commands");

  console.log(`\n  npx hardhat verify --network ${network} \\`);
  console.log(`    ${registryAddress} \\`);
  console.log(`    "${deployer.address}"`);
  console.log(``);
  console.log(`  npx hardhat verify --network ${network} \\`);
  console.log(`    ${vaultAddress} \\`);
  console.log(`    "${deployer.address}" \\`);
  console.log(`    "${KEEPER_WALLET}" \\`);
  console.log(`    "${PROTOCOL_TREASURY}" \\`);
  console.log(`    "${registryAddress}"`);

  // ── 8. Post-deploy reminders ──────────────────────────────────────────────
  separator("Post-Deploy Checklist");

  console.log(`\n  [ ] Copy contract addresses into CLAUDE-CORE.md §2`);
  console.log(`  [ ] Update VAULT_ADDRESS in Railway env (keeper + notifier)`);
  console.log(`  [ ] Run Basescan verification commands above`);
  console.log(`  [ ] Transfer admin to Safe multisig:`);
  console.log(`        vault.proposeAdminTransfer(SAFE_ADDRESS)`);
  console.log(`        registry.proposeAdminTransfer(SAFE_ADDRESS)`);
  console.log(`        → then accept from Safe`);
  console.log(`  [ ] Generate new deployer wallet (key exposed May 3)`);
  console.log(`  [ ] Generate new keeper wallet`);
  console.log(`  [ ] Test createSubscription() on Sepolia before mainnet`);
  console.log(``);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\n  ❌ Deployment failed:", err.message);
    process.exit(1);
  });
