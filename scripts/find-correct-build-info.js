// scripts/find-correct-build-info.js
//
// Multiple artifacts/build-info/*.json files can exist (Hardhat keeps one
// per compile run). Guessing by filename/timestamp is unreliable — this
// script instead compares each build-info's compiled SubscriptionVault
// deployedBytecode against the REAL on-chain runtime bytecode (fetched
// live via eth_getCode), same method used to disambiguate MerchantRegistry
// on July 22. Only the file that actually matches on-chain reality wins.
//
// Usage:
//   node scripts/find-correct-build-info.js 0xd6377Fa4809C4b745F5F1801193e5a90cD4AAE26

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const CONTRACT_NAME = "SubscriptionVault";
const SOURCE_PATH_HINT = "SubscriptionVault.sol";
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

async function main() {
  const targetAddress = process.argv[2];
  if (!targetAddress) {
    console.log("Usage: node scripts/find-correct-build-info.js <deployed-address>");
    process.exit(1);
  }

  console.log("============================================================");
  console.log("  Finding the correct build-info for", targetAddress);
  console.log("============================================================");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const onChainCode = await provider.getCode(targetAddress);

  if (onChainCode === "0x") {
    console.log("❌ No contract code found at that address on", RPC_URL);
    console.log("   Double check the address and network.");
    process.exit(1);
  }

  console.log("On-chain bytecode length:", onChainCode.length, "chars\n");

  const buildInfoDir = path.join("artifacts", "build-info");
  const files = fs.readdirSync(buildInfoDir).filter(f => f.endsWith(".json"));

  console.log(`Checking ${files.length} build-info file(s)...\n`);

  let matchFound = false;

  for (const file of files) {
    const fullPath = path.join(buildInfoDir, file);
    const stats = fs.statSync(fullPath);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (e) {
      console.log(`  ${file} (${stats.mtime.toISOString()}) — could not parse, skipping`);
      continue;
    }

    const contracts = data.output && data.output.contracts;
    if (!contracts) {
      console.log(`  ${file} (${stats.mtime.toISOString()}) — no compiled output, skipping`);
      continue;
    }

    // Find the SubscriptionVault entry regardless of exact source path key.
    let deployedBytecode = null;
    for (const sourcePath of Object.keys(contracts)) {
      if (sourcePath.includes(SOURCE_PATH_HINT) && contracts[sourcePath][CONTRACT_NAME]) {
        const entry = contracts[sourcePath][CONTRACT_NAME];
        deployedBytecode = entry.evm && entry.evm.deployedBytecode && entry.evm.deployedBytecode.object;
        break;
      }
    }

    if (!deployedBytecode) {
      console.log(`  ${file} (${stats.mtime.toISOString()}) — no ${CONTRACT_NAME} in this build, skipping`);
      continue;
    }

    // Compare ignoring the trailing CBOR metadata hash (varies run to run
    // even for identical source, per your established verification method).
    const trimmedOnChain = onChainCode.slice(0, 200);
    const trimmedCompiled = ("0x" + deployedBytecode).slice(0, 200);

    const isMatch = trimmedOnChain.toLowerCase() === trimmedCompiled.toLowerCase();

    console.log(`  ${file} (${stats.mtime.toISOString()}, ${stats.size} bytes) — ${CONTRACT_NAME} found, prefix match: ${isMatch ? "YES ✅" : "no"}`);

    if (isMatch) {
      matchFound = true;
      console.log("\n============================================================");
      console.log("  MATCH FOUND:", file);
      console.log("============================================================");

      // Write the Standard-JSON-Input Basescan needs — just {language,
      // sources, settings}, not Hardhat's full {id, input, output, ...}.
      fs.writeFileSync("verify-input.json", JSON.stringify(data.input));
      console.log("  Wrote verify-input.json — paste this into Basescan's");
      console.log("  Standard-JSON-Input verification form.\n");

      const settings = data.input.settings || {};
      console.log("  Compiler settings for the Basescan form:");
      console.log("    Compiler version:", data.solcLongVersion || "(check input.language/settings manually)");
      console.log("    Optimizer enabled:", settings.optimizer ? settings.optimizer.enabled : "unknown");
      console.log("    Optimizer runs:   ", settings.optimizer ? settings.optimizer.runs : "unknown");
      console.log("    EVM version:      ", settings.evmVersion || "unknown");
    }
  }

  if (!matchFound) {
    console.log("\n❌ No build-info file's bytecode matched the on-chain contract.");
    console.log("   This means none of your local artifacts reflect what's actually");
    console.log("   deployed at this address. Do not verify with any of these files");
    console.log("   until this is resolved — recompiling first may fix it.");
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
