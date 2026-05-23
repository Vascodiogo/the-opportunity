require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "paris",
    },
  },
  networks: {
    // Base Sepolia — testnet
    // Usage: npx hardhat run scripts/deploy.js --network base-sepolia
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      chainId: 84532,
    },
    // Base Mainnet
    // Usage: npx hardhat run scripts/deploy.js --network base-mainnet
    "base-mainnet": {
      url: process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org",
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY,
      base:        process.env.BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL:     "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL:     "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
};
