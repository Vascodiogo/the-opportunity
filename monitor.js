// monitor.js — AuthOnce Protocol Copy Detector
// =============================================================================
//  Watches for ProtocolDeployed events on Base Sepolia and Base Mainnet.
//  Alerts via email (Resend) when a deployment is detected from any address
//  that is NOT the authorised deployer.
//
//  Environment variables required (set in Railway):
//    BASE_SEPOLIA_RPC_URL   — e.g. https://sepolia.base.org
//    BASE_MAINNET_RPC_URL   — e.g. https://mainnet.base.org
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

const resend = new Resend(RESEND_KEY);

const CHAINS = [
    { name: "Base Sepolia (testnet)", chainId: 84532, rpc: RPC_SEPOLIA },
    { name: "Base Mainnet",           chainId: 8453,  rpc: RPC_MAINNET },
];

const ABI = [
    "event ProtocolDeployed(string protocol, string version, address indexed deployer, uint256 chainId, uint256 timestamp)"
];

async function sendAlert({ chain, deployer, txHash, blockNumber, version }) {
    const isUnauthorized = deployer.toLowerCase() !== AUTHORIZED_DEPLOYER;
    const subject = isUnauthorized
        ? `🚨 UNAUTHORIZED AuthOnce deployment detected on ${chain}`
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
${isUnauthorized ? `
ACTION REQUIRED:
This address is NOT your authorized deployer. Someone may have
copied and deployed the AuthOnce contracts without permission.
1. Check the deployer address on Basescan
2. Review the contract source code for your watermark
3. Contact legal counsel if this is a commercial copy
Basescan: https://sepolia.basescan.org/tx/${txHash}
` : `This is your own deployment — no action needed.`}
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
        console.error("[MONITOR] Failed to send alert email:", err.message);
    }
}

async function watchChain({ name, chainId, rpc }) {
    console.log(`[MONITOR] Watching ${name} (chainId: ${chainId})`);

    let provider;
    try {
        provider = new ethers.JsonRpcProvider(rpc);
        await provider.getBlockNumber();
        console.log(`[MONITOR] Connected to ${name} ✅`);
    } catch (err) {
        console.error(`[MONITOR] Cannot connect to ${name}: ${err.message}`);
        setTimeout(() => watchChain({ name, chainId, rpc }), 30_000);
        return;
    }

    const iface      = new ethers.Interface(ABI);
    const eventTopic = iface.getEvent("ProtocolDeployed").topicHash;

    provider.on({ topics: [eventTopic] }, async (log) => {
        try {
            const parsed = iface.parseLog(log);
            const { protocol, version, deployer } = parsed.args;
            if (!protocol.toLowerCase().includes("authonce")) return;

            const isUnauthorized = deployer.toLowerCase() !== AUTHORIZED_DEPLOYER;
            console.log(`[MONITOR] ProtocolDeployed on ${name} — ${isUnauthorized ? "⚠️ UNAUTHORIZED" : "✅ Authorized"}`);
            console.log(`          Deployer: ${deployer}`);
            console.log(`          TX:       ${log.transactionHash}`);

            await sendAlert({ chain: name, deployer, txHash: log.transactionHash, blockNumber: log.blockNumber, version });
        } catch (err) {
            console.error(`[MONITOR] Error parsing log on ${name}:`, err.message);
        }
    });

    provider.on("error", (err) => {
        console.error(`[MONITOR] Provider error on ${name}: ${err.message}`);
        setTimeout(() => watchChain({ name, chainId, rpc }), 30_000);
    });
}

async function main() {
    console.log("==============================================");
    console.log("  AuthOnce Protocol — Deployment Monitor");
    console.log("==============================================");
    console.log(`  Authorized deployer: ${AUTHORIZED_DEPLOYER}`);
    console.log(`  Alert email:         ${ALERT_EMAIL}`);
    console.log(`  Chains watched:      ${CHAINS.length}`);
    console.log(`  Sepolia RPC:         ${RPC_SEPOLIA}`);
    console.log(`  Mainnet RPC:         ${RPC_MAINNET}`);
    console.log("==============================================\n");

    if (!RESEND_KEY) {
        console.error("[MONITOR] RESEND_API_KEY not set — exiting.");
        process.exit(1);
    }

    await Promise.all(CHAINS.map(watchChain));
    console.log("[MONITOR] All watchers active. Listening for deployments...\n");
}

main().catch((err) => {
    console.error("[MONITOR] Fatal error:", err);
    process.exit(1);
});
