// scripts/fix-keeper.js
// Restores keeper address to the Railway keeper wallet
// Run: npx hardhat run scripts/fix-keeper.js --network base-sepolia

require("dotenv").config();
const { ethers } = require("hardhat");

const VAULT_ADDRESS  = "0x55180314174B30e778f35357035d49cAEF55C835";
const KEEPER_ADDRESS = "0xdCEa737ec293DFF0B18C315CA90f494F8CB2C151"; // Railway keeper wallet

const VAULT_ABI = [
  "function keeper() view returns (address)",
  "function setKeeper(address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, deployer);

  const current = await vault.keeper();
  console.log(`Current keeper:  ${current}`);
  console.log(`Target keeper:   ${KEEPER_ADDRESS}`);

  if (current.toLowerCase() === KEEPER_ADDRESS.toLowerCase()) {
    console.log("✅ Keeper is already correct — nothing to do.");
    return;
  }

  console.log("Updating keeper...");
  const tx = await vault.setKeeper(KEEPER_ADDRESS);
  await tx.wait();
  await new Promise(r => setTimeout(r, 3000));

  const updated = await vault.keeper();
  if (updated.toLowerCase() === KEEPER_ADDRESS.toLowerCase()) {
    console.log(`✅ Keeper updated to ${updated}`);
  } else {
    console.log(`❌ Update failed — keeper is still ${updated}`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
