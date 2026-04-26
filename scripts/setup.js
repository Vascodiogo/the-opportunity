const hre = require("hardhat");

async function main() {
  const VAULT_ADDRESS = "0xA3358266106fd5b610C24AB4E01e5Bf25C36dA7c";
  const MERCHANT = "0x44444D60136Cf62804963fA14d62a55c34a96f8F";
  const SAFE_VAULT = "0xB3d493F6bFF750719c10Cef10214B9d619891fCd";

  const vault = await hre.ethers.getContractAt("SubscriptionVault", VAULT_ADDRESS);

  console.log("1. Approving merchant...");
  const tx1 = await vault.approveMerchant(MERCHANT);
  await tx1.wait();
  console.log("   ? Merchant approved");

  console.log("2. Creating subscription...");
  const tx2 = await vault.createSubscription(MERCHANT, SAFE_VAULT, 1000000, 1, "0x0000000000000000000000000000000000000000", 0);
  await tx2.wait();
  console.log("   ? Subscription created");
}

main().catch(console.error);
