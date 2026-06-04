// scripts/test-flow2-setup.js
// Pre-Flight check before Flow 2 — createSubscription
// Checks: merchant approved, USDC balance, USDC allowance, vault address
// Run: npx hardhat run scripts/test-flow2-setup.js --network base-sepolia

require("dotenv").config();
const { ethers } = require("hardhat");

const REGISTRY_ADDRESS = "0x989376ff6195be2e76871535Db21CB8BdC9175D4";
const VAULT_ADDRESS    = "0x55180314174B30e778f35357035d49cAEF55C835";
const USDC_ADDRESS     = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const REGISTRY_ABI = [
  "function isApproved(address) view returns (bool)",
  "function approveMerchant(address)",
  "function approvedTokens(address) view returns (bool)",
];

const VAULT_ABI = [
  "function approvedTokens(address) view returns (bool)",
  "function approvedTokenList() view returns (address[])",
  "function keeper() view returns (address)",
  "function protocolTreasury() view returns (address)",
  "function feeBps() view returns (uint16)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, deployer);
  const vault    = new ethers.Contract(VAULT_ADDRESS,    VAULT_ABI,    deployer);
  const usdc     = new ethers.Contract(USDC_ADDRESS,     ERC20_ABI,    deployer);

  console.log("=".repeat(55));
  console.log("  AuthOnce — Flow 2 Pre-Flight Check");
  console.log("=".repeat(55));
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Registry:  ${REGISTRY_ADDRESS}`);
  console.log(`  Vault:     ${VAULT_ADDRESS}`);
  console.log(`  USDC:      ${USDC_ADDRESS}`);
  console.log("=".repeat(55));

  // ── 1. Vault config ─────────────────────────────────────────────────────────
  console.log("\n── Vault config ──────────────────────────────────────");
  const keeper   = await vault.keeper();
  const treasury = await vault.protocolTreasury();
  const feeBps   = await vault.feeBps();
  console.log(`  keeper:           ${keeper}`);
  console.log(`  protocolTreasury: ${treasury}`);
  console.log(`  feeBps:           ${feeBps} (${Number(feeBps) / 100}%)`);

  // ── 2. Token whitelist ───────────────────────────────────────────────────────
  console.log("\n── Token whitelist ───────────────────────────────────");
  const usdcApproved = await vault.approvedTokens(USDC_ADDRESS);
  console.log(`  USDC approved in vault: ${usdcApproved ? "✅ YES" : "❌ NO — need to approveToken(USDC)"}`);

  try {
    const tokenList = await vault.approvedTokenList();
    console.log(`  Approved tokens: ${tokenList.length > 0 ? tokenList.join(", ") : "none"}`);
  } catch (e) {
    console.log(`  approvedTokenList: ${e.message}`);
  }

  // ── 3. Merchant approval ─────────────────────────────────────────────────────
  console.log("\n── Merchant approval ─────────────────────────────────");
  const deployerApproved = await registry.isApproved(deployer.address);
  console.log(`  Deployer as merchant: ${deployerApproved ? "✅ Approved" : "❌ NOT approved"}`);

  if (!deployerApproved) {
    console.log("  → Approving deployer as merchant...");
    try {
      const tx = await registry.approveMerchant(deployer.address);
      await tx.wait();
      await new Promise(r => setTimeout(r, 3000));
      const nowApproved = await registry.isApproved(deployer.address);
      console.log(`  → Result: ${nowApproved ? "✅ Approved" : "❌ Still not approved"}`);
    } catch (e) {
      console.log(`  → Error: ${e.message}`);
    }
  }

  // ── 4. USDC balance ──────────────────────────────────────────────────────────
  console.log("\n── USDC balance (deployer = subscriber for test) ─────");
  const balance   = await usdc.balanceOf(deployer.address);
  const allowance = await usdc.allowance(deployer.address, VAULT_ADDRESS);
  const decimals  = await usdc.decimals();
  const balFmt    = ethers.formatUnits(balance, decimals);
  const alwFmt    = ethers.formatUnits(allowance, decimals);

  console.log(`  USDC balance:   ${balFmt} USDC ${Number(balFmt) >= 10 ? "✅" : "❌ need at least 10 USDC"}`);
  console.log(`  USDC allowance: ${alwFmt} USDC ${Number(alwFmt) >= 10 ? "✅" : "⚠️  need to approve vault as spender"}`);

  // ── 5. Summary ───────────────────────────────────────────────────────────────
  console.log("\n── Summary ───────────────────────────────────────────");

  const needsUSDC     = Number(balFmt) < 10;
  const needsAllowance = Number(alwFmt) < 10;
  const needsToken    = !usdcApproved;

  if (needsUSDC) {
    console.log("  ❌ Need Sepolia USDC — get from:");
    console.log("     https://faucet.circle.com (Circle USDC faucet)");
    console.log("     Select: Base Sepolia — request 10 USDC");
  }

  if (needsToken) {
    console.log("  ❌ Need to approveToken(USDC) on vault — run:");
    console.log("     npx hardhat run scripts/approve-token.js --network base-sepolia");
  }

  if (needsAllowance && !needsUSDC) {
    console.log("  ⚠️  Need to set USDC allowance on vault — will be handled in Flow 2 setup");
  }

  if (!needsUSDC && !needsToken) {
    console.log("  🟢 Ready for Flow 2 — createSubscription");
  }

  console.log("=".repeat(55));
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
