const hre = require("hardhat");

async function main() {
  const MERCHANT_REGISTRY = "0xA3358266106fd5b610C24AB4E01e5Bf25C36dA7c"; // your deployed address
  const MERCHANT_TO_APPROVE = "0x44444D60136Cf62804963fA14d62a55c34a96f8F"; // deployer as test merchant

  const registry = await hre.ethers.getContractAt("MerchantRegistry", MERCHANT_REGISTRY);
  
  console.log("Approving merchant:", MERCHANT_TO_APPROVE);
  const tx = await registry.approveMerchant(MERCHANT_TO_APPROVE);
  await tx.wait();
  console.log("✅ Merchant approved! Tx:", tx.hash);
}

main().catch(console.error);
