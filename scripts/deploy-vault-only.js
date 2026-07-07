// scripts/deploy-vault-only.js
// AuthOnce Protocol — SubscriptionVault-only redeploy
//
// Unlike deploy.js, this does NOT deploy a new MerchantRegistry. It reuses the
// existing, already-approved registry — so merchants approved on it stay
// approved, with zero re-approval steps needed. Use this whenever only
// SubscriptionVault.sol changed (e.g. the agent pull cap), not the registry.
//
// Usage:
//   npx hardhat run scripts/deploy-vault-only.js --network base-sepolia
//
// Requires in .env (same as deploy.js, plus KEEPER_ADDRESS specifically —
// NOT KEEPER_WALLET, deploy scripts read KEEPER_ADDRESS only):
//   DEPLOYER_PRIVATE_KEY
//   KEEPER_ADDRESS
//   PROTOCOL_TREASURY_ADDRESS

require("dotenv").config();
const hre = require("hardhat");

// ─── Existing registry — NOT redeployed ───────────────────────────────────────
const EXISTING_REGISTRY = {
  "base-sepolia": "0x393BA721aB45f4d4DaAC1B914e7F6377508C0299",
  // "base-mainnet": "[fill in once mainnet registry exists]",
};

const TOKENS = {
  "base-sepolia": {
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
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
  console.log(`  AuthOnce — SubscriptionVault-only redeploy`);
  console.log(`  Network: ${network}`);
  console.log("=".repeat(60));

  const registryAddress = EXISTING_REGISTRY[network];
  if (!registryAddress) {
    throw new Error(`No existing registry address configured for ${network} — check EXISTING_REGISTRY above.`);
  }

  const isMainnet = network === "base-mainnet";
  if (isMainnet && !process.env.SAFE_ADDRESS) {
    throw new Error("SAFE_ADDRESS env var required for mainnet deploy");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`  Deployer:          ${deployer.address}`);

  // Deliberately strict — no fallback to deployer.address. That fallback is
  // exactly what caused the June 30 NotKeeper incident: KEEPER_ADDRESS was
  // never set, so the vault's keeper silently became the deployer instead.
  const keeperAddress = process.env.KEEPER_ADDRESS;
  if (!keeperAddress) {
    throw new Error(
      "KEEPER_ADDRESS not set in .env. Refusing to fall back to deployer.address — " +
      "that silent fallback is what caused the original NotKeeper bug. Set KEEPER_ADDRESS explicitly."
    );
  }

  const treasuryAddress = process.env.PROTOCOL_TREASURY_ADDRESS;
  if (!treasuryAddress) throw new Error("PROTOCOL_TREASURY_ADDRESS not set");

  const adminAddress = isMainnet ? process.env.SAFE_ADDRESS : deployer.address;

  console.log(`  Admin:             ${adminAddress} (${isMainnet ? "Safe multisig" : "EOA deployer"})`);
  console.log(`  Keeper:            ${keeperAddress}`);
  console.log(`  Treasury:          ${treasuryAddress}`);
  console.log(`  Existing registry: ${registryAddress}  (reused, not redeployed)`);
  console.log("");

  // Sanity check: confirm the keeper address looks right before spending gas.
  // Known-correct keeper per this session's on-chain verification — flag,
  // don't block, in case it's been legitimately rotated since.
  const KNOWN_KEEPER = "0xdCEa737ec293DFF0B18C315CA90f494F8CB2C151";
  if (keeperAddress.toLowerCase() !== KNOWN_KEEPER.toLowerCase()) {
    console.warn(`  ⚠️  WARNING: KEEPER_ADDRESS (${keeperAddress}) does not match the`);
    console.warn(`      known-correct keeper (${KNOWN_KEEPER}) confirmed earlier this session.`);
    console.warn(`      Proceeding in 10s — Ctrl+C now if this is wrong.`);
    await new Promise(r => setTimeout(r, 10000));
  }

  // ── Deploy SubscriptionVault only ─────────────────────────────────────────
  console.log("Deploying SubscriptionVault...");
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

  // ── Approve tokens on the NEW vault ───────────────────────────────────────
  // Token whitelist lives on the vault itself, not the registry — this is the
  // one piece of state that genuinely must be redone, unlike merchant approval.
  const tokens = TOKENS[network] || {};
  console.log("\nWaiting 15s before token approvals to avoid rate limiting...");
  await new Promise(r => setTimeout(r, 15000));
  console.log("Approving tokens on new vault...");
  for (const [symbol, address] of Object.entries(tokens)) {
    const tx = await vault.approveToken(address);
    await tx.wait();
    console.log(`  Approved: ${symbol} (${address})`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // No merchant re-approval step — the registry is unchanged, existing
  // approvals (including the deployer as first merchant) remain valid.

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Network:           ${network}`);
  console.log(`  SubscriptionVault: ${vaultAddress}  (NEW)`);
  console.log(`  MerchantRegistry:  ${registryAddress}  (unchanged, reused)`);
  console.log(`  Admin:             ${adminAddress}`);
  console.log(`  Keeper:            ${keeperAddress}`);
  console.log(`  Treasury:          ${treasuryAddress}`);
  console.log("");
  console.log("  Post-deploy checklist:");
  console.log(`  [ ] Update VAULT_ADDRESS in Railway env vars (all 4 services: AuthOnce, authonce-keeper, authonce-notifier, authonce-x-bot)`);
  console.log(`  [ ] Update VAULT_ADDRESS in frontend config.js`);
  console.log(`  [ ] Update AdminDashboard.jsx contract card address + Basescan link`);
  console.log(`  [ ] Verify on Basescan:`);
  console.log(`      npx hardhat verify --network ${network} ${vaultAddress} "${adminAddress}" "${keeperAddress}" "${treasuryAddress}" "${registryAddress}"`);
  console.log(`  [ ] Run check-keeper.js against the NEW address to confirm keeper is set correctly`);
  console.log(`  [ ] Test: create an ERC-1271 subscription above 199 USDC, confirm it reverts with AgentPullExceedsCap`);
  console.log(`  [ ] Old vault (0x483f59367b2e5BEbbF33a6A110B1F1C42C706564) is now superseded — do not send new subscriptions to it`);
  console.log("=".repeat(60));
}

main().catch(err => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
