const hre = require("hardhat");

async function main() {
  const VAULT_ADDRESS = "0x772c7ef7847f375FB239087fd011a61e3429ba9d";
  const vault = await hre.ethers.getContractAt("SubscriptionVault", VAULT_ADDRESS);
  
  // Check keeper
  const keeper = await vault.keeper();
  console.log("Keeper on contract:", keeper);
  
  // Check subscription 1
  const sub = await vault.subscriptions(1);
  console.log("\nSubscription #1:");
  console.log("  owner:", sub.owner);
  console.log("  safeVault:", sub.safeVault);
  console.log("  merchant:", sub.merchant);
  console.log("  amount:", sub.amount.toString());
  console.log("  status:", sub.status.toString());
  console.log("  lastPulledAt:", sub.lastPulledAt.toString());

  // Check isDue
  const due = await vault.isDue(1);
  console.log("  isDue:", due);

  // Check vault balance
  const balance = await vault.vaultBalance(1);
  console.log("  vaultBalance:", balance.toString());
}

main().catch(console.error);
