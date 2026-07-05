// scripts/set-keeper.js
// Sets the keeper address on the new SubscriptionVault
require("dotenv").config();
const hre = require("hardhat");

const VAULT_ADDRESS = "0xAd7B4b66F5C0145cbC52c56918F7D6C2871d8c5d";
const NEW_KEEPER    = "0xdCEa737ec293DFF0B18C315CA90f494F8CB2C151";

const ABI = [
  "function setKeeper(address _keeper) external",
  "function keeper() view returns (address)",
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Vault:    ${VAULT_ADDRESS}`);

  const vault = new hre.ethers.Contract(VAULT_ADDRESS, ABI, deployer);

  const current = await vault.keeper();
  console.log(`Current keeper: ${current}`);

  if (current.toLowerCase() === NEW_KEEPER.toLowerCase()) {
    console.log("Keeper already correct — nothing to do.");
    return;
  }

  console.log(`Setting keeper to ${NEW_KEEPER}...`);
  const tx = await vault.setKeeper(NEW_KEEPER);
  await tx.wait();
  console.log("Keeper updated ✓");
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
