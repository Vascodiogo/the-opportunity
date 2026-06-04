// scripts/approve-metamask.js
require("dotenv").config();
const { ethers } = require("hardhat");

const REGISTRY_ADDRESS = "0x989376ff6195be2e76871535Db21CB8BdC9175D4";
const METAMASK_WALLET  = "0x00df2Dbb2455C372204EdD901894E27281fA02C0";

const ABI = [
  "function isApproved(address) view returns (bool)",
  "function approveMerchant(address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, ABI, deployer);

  const already = await registry.isApproved(METAMASK_WALLET);
  if (already) { console.log("✅ Already approved"); return; }

  const tx = await registry.approveMerchant(METAMASK_WALLET);
  await tx.wait();
  await new Promise(r => setTimeout(r, 3000));

  const now = await registry.isApproved(METAMASK_WALLET);
  console.log(now ? "✅ Approved" : "❌ Failed");
}

main().catch(console.error);
