// ============================================================
//  monitor.js — AuthOnce Protocol Copy Detector
//  
//  Watches for ProtocolDeployed events on multiple EVM chains.
//  Alerts via email (Resend) when a deployment is detected
//  from any address that is NOT the authorised deployer.
//
//  Deploy this on Railway alongside your keeper/notifier.
//  No extra cost — runs within your existing $5/month plan.
//
//  Setup:
//    Add to Railway environment variables:
//      ALCHEMY_API_KEY      — your Alchemy key
//      RESEND_API_KEY       — your Resend key
//      ALERT_EMAIL          — vasco@authonce.io
//      AUTHORIZED_DEPLOYER  — 0x44444D60136Cf62804963fA14d62a55c34a96f8F
// ============================================================

const { ethers } = require("ethers");
const { Resend }  = require("resend");

// -----------------------------------------------------------
// Config
// -----------------------------------------------------------
const AUTHORIZED_DEPLOYER = (
    process.env.AUTHORIZED_DEPLOYER ||
    "0x44444D60136Cf62804963fA14d62a55c34a96f8F"
).toLowerCase();

const ALERT_EMAIL    = process.env.ALERT_EMAIL    || "vasco@authonce.io";
const ALCHEMY_KEY    = process.env.ALCHEMY_API_KEY;
const RESEND_KEY     = process.env.RESEND_API_KEY;

const resend = new Resend(RESEND_KEY);

// -----------------------------------------------------------
// Chains to monitor
// Add more RPC URLs here as AuthOnce expands to new chains.
// -----------------------------------------------------------
const CHAINS = [
    {
        name:    "Base Sepolia (testnet)",
        chainId: 84532,
        rpc:     `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    },
    {
        name:    "Base Mainnet",
        chainId: 8453,
        rpc:     `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    },
    // Uncomment to watch Ethereum mainnet too:
    // {
    //     name:    "Ethereum Mainnet",
    //     chainId: 1,
    //     rpc:     `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    // },
];

// -----------------------------------------------------------
// ABI — only the event we care about
// -----------------------------------------------------------
const ABI = [
    "event ProtocolDeployed(string protocol, string version, address indexed deployer, uint256 chainId, uint256 timestamp)"
];

// -----------------------------------------------------------
// Alert sender
// -----------------------------------------------------------
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
4. Document this event for any future BUSL-1.1 enforcement

Basescan link:
https://sepolia.basescan.org/tx/${txHash}
` : `
This is your own deployment — no action needed.
Recording for audit trail.
`}

-- AuthOnce Monitor
   authonce.io
    `.trim();

    try {
        await resend.emails.send({
            from:    "AuthOnce Monitor <monitor@authonce.io>",
            to:      ALERT_EMAIL,
            subject,
            text:    body,
        });
        console.log(`[MONITOR] Alert sent to ${ALERT_EMAIL}`);
    } catch (err) {
        console.error("[MONITOR] Failed to send alert email:", err.message);
    }
}

// -----------------------------------------------------------
// Watcher — one per chain
// -----------------------------------------------------------
async function watchChain({ name, chainId, rpc }) {
    console.log(`[MONITOR] Watching ${name} (chainId: ${chainId})`);

    let provider;
    try {
        provider = new ethers.JsonRpcProvider(rpc);
        await provider.getBlockNumber(); // connectivity check
    } catch (err) {
        console.error(`[MONITOR] Cannot connect to ${name}: ${err.message}`);
        return;
    }

    // Listen for any ProtocolDeployed event on the entire chain
    // (not scoped to a specific contract address — catches copies too)
    const iface     = new ethers.Interface(ABI);
    const eventTopic = iface.getEvent("ProtocolDeployed").topicHash;

    provider.on({ topics: [eventTopic] }, async (log) => {
        try {
            const parsed = iface.parseLog(log);
            const { protocol, version, deployer } = parsed.args;

            // Only alert on AuthOnce protocol events (ignore unrelated contracts
            // that happen to have the same event signature)
            if (!protocol.toLowerCase().includes("authonce")) return;

            const isUnauthorized = deployer.toLowerCase() !== AUTHORIZED_DEPLOYER;

            console.log(`[MONITOR] ProtocolDeployed detected on ${name}`);
            console.log(`          Deployer: ${deployer}`);
            console.log(`          Status:   ${isUnauthorized ? "⚠️  UNAUTHORIZED" : "✅ Authorized"}`);
            console.log(`          TX:       ${log.transactionHash}`);

            await sendAlert({
                chain:       name,
                deployer,
                txHash:      log.transactionHash,
                blockNumber: log.blockNumber,
                version,
            });

        } catch (err) {
            console.error(`[MONITOR] Error parsing log on ${name}:`, err.message);
        }
    });

    // Reconnect on provider error
    provider.on("error", (err) => {
        console.error(`[MONITOR] Provider error on ${name}: ${err.message}`);
        console.log(`[MONITOR] Reconnecting to ${name} in 30s...`);
        setTimeout(() => watchChain({ name, chainId, rpc }), 30_000);
    });
}

// -----------------------------------------------------------
// Entry point
// -----------------------------------------------------------
async function main() {
    console.log("==============================================");
    console.log("  AuthOnce Protocol — Deployment Monitor");
    console.log("==============================================");
    console.log(`  Authorized deployer: ${AUTHORIZED_DEPLOYER}`);
    console.log(`  Alert email:         ${ALERT_EMAIL}`);
    console.log(`  Chains watched:      ${CHAINS.length}`);
    console.log("==============================================\n");

    if (!ALCHEMY_KEY) {
        console.error("[MONITOR] ALCHEMY_API_KEY not set — exiting.");
        process.exit(1);
    }
    if (!RESEND_KEY) {
        console.error("[MONITOR] RESEND_API_KEY not set — exiting.");
        process.exit(1);
    }

    // Start watching all chains in parallel
    await Promise.all(CHAINS.map(watchChain));

    console.log("[MONITOR] All watchers active. Listening for deployments...\n");
}

main().catch((err) => {
    console.error("[MONITOR] Fatal error:", err);
    process.exit(1);
});
