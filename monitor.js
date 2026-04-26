// monitor.js — AuthOnce Protocol Copy Detector
// =============================================================================
//  Polls for ProtocolDeployed events on Base Sepolia and Base Mainnet.
//  Uses getLogs() polling — works on public RPCs (no filter support needed).
//  Alerts via email (Resend) when an unauthorized deployment is detected.
//
//  Environment variables (set in Railway monitor service):
//    BASE_SEPOLIA_RPC_URL   — https://sepolia.base.org
//    BASE_MAINNET_RPC_URL   — https://mainnet.base.org
//    RESEND_API_KEY         — your Resend API key
//    ALERT_EMAIL            — vasco@authonce.io
//    AUTHORIZED_DEPLOYER    — 0x44444D60136Cf62804963fA14d62a55c34a96f8F
// =============================================================================

require("dotenv").config();
const { ethers } = require("ethers");
const { Resend }  = require("resend");

const AUTHORIZED_DEPLOYER = (
    process.env.AUTHORIZED_DEPLOYER ||
    "0x44444D60136Cf62804963fA14d62a55c34a96f8F"
).toLowerCase();

const ALERT_EMAIL  = process.env.ALERT_EMAIL  || "vasco@authonce.io";
const RESEND_KEY   = process.env.RESEND_API_KEY;
const RPC_SEPOLIA  = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const RPC_MAINNET  = process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
const POLL_INTERVAL = 60_000; // poll every 60 seconds
const BLOCK_LAG     = 2;      // stay 2 blocks behind head to avoid reorgs

const resend = new Resend(RESEND_KEY);

const CHAINS = [
    { name: "Base Sepolia (testnet)", chainId: 84532, rpc: RPC_SEPOLIA },
    { name: "Base Mainnet",           chainId: 8453,  rpc: RPC_MAINNET },
];

const ABI = [
    "event ProtocolDeployed(string protocol, string version, address indexed deployer, uint256 chainId, uint256 timestamp)"
];

// -----------------------------------------------------------
// Alert sender
// -----------------------------------------------------------
async function sendAlert({ chain, deployer, txHash, blockNumber, version }) {
    const isUnauthorized = deployer.toLowerCase() !== AUTHORIZED_DEPLOYER;
    const subject = isUnauthorized
        ? `🚨 UNAUTHORIZED AuthOnce deployment on ${chain}`
        : `✅ Authorized AuthOnce deployment on ${chain}`;

    const body = `
AuthOnce Protocol Deployment Monitor
=====================================
Chain:        ${chain}
Deployer:     ${deployer}
Authorized:   ${AUTHORIZED_DEPLOYER}
Status:       ${isUnauthorized ? "⚠️  UNAUTHORIZED — possible code copy!" : "✅ Authorized deployment"}
Version:      ${version}
TX Hash:      ${txHash}
Block:        ${blockNumber}
Detected at:  ${new Date().toISOString()}

${isUnauthorized ? `ACTION REQUIRED:
This address is NOT your authorized deployer. Someone may have
copied and deployed the AuthOnce contracts without permission.
1. Check the deployer address on Basescan
2. Review the contract source code for your watermark
3. Contact legal counsel if this is a commercial copy
Basescan: https://sepolia.basescan.org/tx/${txHash}` : `This is your own deployment — no action needed.`}

-- AuthOnce Monitor | authonce.io
    `.trim();

    try {
        await resend.emails.send({
            from: "AuthOnce Monitor <monitor@authonce.io>",
            to:   ALERT_EMAIL,
            subject,
            text: body,
        });
        console.log(`[MONITOR] Alert sent to ${ALERT_EMAIL}`);
    } catch (err) {
        console.error("[MONITOR] Failed to send alert:", err.message);
    }
}

// -----------------------------------------------------------
// Poll one chain for new ProtocolDeployed events
// -----------------------------------------------------------
async function pollChain(chain, iface, eventTopic, lastBlock) {
    let provider;
    try {
        provider = new ethers.JsonRpcProvider(chain.rpc);
        const currentBlock = await provider.getBlockNumber();
        const toBlock = currentBlock - BLOCK_LAG;

        if (toBlock <= lastBlock) return lastBlock;

        const logs = await provider.getLogs({
            topics:    [eventTopic],
            fromBlock: lastBlock + 1,
            toBlock,
        });

        for (const log of logs) {
            try {
                const parsed = iface.parseLog(log);
                const { protocol, version, deployer } = parsed.args;

                if (!protocol.toLowerCase().includes("authonce")) continue;

                const isUnauthorized = deployer.toLowerCase() !== AUTHORIZED_DEPLOYER;
                console.log(`[MONITOR] ProtocolDeployed on ${chain.name}`);
                console.log(`          Deployer: ${deployer}`);
                console.log(`          Status:   ${isUnauthorized ? "⚠️  UNAUTHORIZED" : "✅ Authorized"}`);
                console.log(`          TX:       ${log.transactionHash}`);

                await sendAlert({
                    chain:       chain.name,
                    deployer,
                    txHash:      log.transactionHash,
                    blockNumber: log.blockNumber,
                    version,
                });
            } catch (err) {
                console.error(`[MONITOR] Error parsing log:`, err.message);
            }
        }

        return toBlock;
    } catch (err) {
        console.error(`[MONITOR] Poll error on ${chain.name}:`, err.message);
        return lastBlock;
    }
}

// -----------------------------------------------------------
// Main polling loop
// -----------------------------------------------------------
async function main() {
    console.log("==============================================");
    console.log("  AuthOnce Protocol — Deployment Monitor");
    console.log("==============================================");
    console.log(`  Authorized deployer: ${AUTHORIZED_DEPLOYER}`);
    console.log(`  Alert email:         ${ALERT_EMAIL}`);
    console.log(`  Chains watched:      ${CHAINS.length}`);
    console.log(`  Poll interval:       ${POLL_INTERVAL / 1000}s`);
    console.log(`  Sepolia RPC:         ${RPC_SEPOLIA}`);
    console.log(`  Mainnet RPC:         ${RPC_MAINNET}`);
    console.log("==============================================\n");

    if (!RESEND_KEY) {
        console.error("[MONITOR] RESEND_API_KEY not set — exiting.");
        process.exit(1);
    }

    const iface      = new ethers.Interface(ABI);
    const eventTopic = iface.getEvent("ProtocolDeployed").topicHash;

    // Initialise last block for each chain
    const lastBlocks = {};
    for (const chain of CHAINS) {
        try {
            const provider = new ethers.JsonRpcProvider(chain.rpc);
            const block = await provider.getBlockNumber();
            lastBlocks[chain.name] = block - BLOCK_LAG;
            console.log(`[MONITOR] ${chain.name} — starting from block ${lastBlocks[chain.name]} ✅`);
        } catch (err) {
            console.error(`[MONITOR] Cannot connect to ${chain.name}: ${err.message}`);
            lastBlocks[chain.name] = 0;
        }
    }

    console.log("\n[MONITOR] Listening for deployments...\n");

    // Poll loop
    const poll = async () => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Polling ${CHAINS.length} chain(s)...`);

        for (const chain of CHAINS) {
            lastBlocks[chain.name] = await pollChain(
                chain, iface, eventTopic, lastBlocks[chain.name]
            );
        }

        setTimeout(poll, POLL_INTERVAL);
    };

    await poll();
}

main().catch((err) => {
    console.error("[MONITOR] Fatal error:", err);
    process.exit(1);
});
