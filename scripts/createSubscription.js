const hre = require("hardhat");

async function main() {
  const VAULT_ADDRESS = "0xA3358266106fd5b610C24AB4E01e5Bf25C36dA7c";
  const MERCHANT = "0x44444D60136Cf62804963fA14d62a55c34a96f8F";
  const SAFE_VAULT = "0xB3d493F6bFF750719c10Cef10214B9d619891fCd";
  const AMOUNT = 1000000;
  const INTERVAL = 1;
  const GUARDIAN = "0x0000000000000000000000000000000000000000";
  const TRIAL_DAYS = 0;

  const vault = await hre.ethers.getContractAt("SubscriptionVault", VAULT_ADDRESS);
  console.log("Creating subscription...");
  const tx = await vault.createSubscription(MERCHANT, SAFE_VAULT, AMOUNT, INTERVAL, GUARDIAN, TRIAL_DAYS);
  await tx.wait();
  console.log("Subscription created! Tx:", tx.hash);
}

main().catch(console.error);
