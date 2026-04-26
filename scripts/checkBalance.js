const hre = require("hardhat");

async function main() {
  const SAFE = "0xB3d493F6bFF750719c10Cef10214B9d619891fCd";
  const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  
  const usdc = await hre.ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)"],
    USDC_SEPOLIA
  );
  const balance = await usdc.balanceOf(SAFE);
  console.log("USDC balance on Sepolia USDC contract:", balance.toString());
}

main().catch(console.error);
