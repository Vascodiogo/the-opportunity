// scripts/test-flow1-check.js
// Checks deployed contract version and function availability
require("dotenv").config();
const { ethers } = require("hardhat");

const REGISTRY_ADDRESS = "0x989376ff6195be2e76871535Db21CB8BdC9175D4";

const ABI = [
  "function VERSION() view returns (string)",
  "function admin() view returns (address)",
  "function approvedMerchantCount() view returns (uint256)",
  "function getMerchantsPage(uint256, uint256) view returns (address[], uint256)",
  "function selfServeEnabled() view returns (bool)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const registry = new ethers.Contract(REGISTRY_ADDRESS, ABI, deployer);

  console.log("Checking deployed MerchantRegistry...");
  
  try {
    const version = await registry.VERSION();
    console.log(`VERSION: ${version}`);
  } catch (e) {
    console.log(`VERSION: ERROR — ${e.message}`);
  }

  try {
    const admin = await registry.admin();
    console.log(`admin: ${admin}`);
  } catch (e) {
    console.log(`admin: ERROR — ${e.message}`);
  }

  try {
    const count = await registry.approvedMerchantCount();
    console.log(`approvedMerchantCount: ${count}`);
  } catch (e) {
    console.log(`approvedMerchantCount: ERROR — ${e.message}`);
  }

  try {
    const [page, total] = await registry.getMerchantsPage(0, 5);
    console.log(`getMerchantsPage: total=${total}, page=${page}`);
  } catch (e) {
    console.log(`getMerchantsPage: ERROR — ${e.message}`);
  }
}

main().catch(console.error);
