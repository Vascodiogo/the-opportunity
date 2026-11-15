// scripts/keeper.js
// AuthOnce Keeper Bot — v7
//
// Changes from v6 (v7 — Aug 21 2026):
//   - [T1] getSubscriptionIds: Active subscriptions are now pre-filtered in
//       the DB query itself to a rolling due-date window (DUE_WINDOW_HOURS),
//       instead of every active subscription hitting subscriptions()+isDue()
//       on-chain every cycle regardless of how far from due it is. This is
//       what exhausted the Alchemy free tier (confirmed via usage dashboard,
//       eth_call dominating). Paused subscriptions are NOT filtered — same
//       reasoning as before, small set, needs frequent grace-period checks.
//       A subscription with last_pulled_at IS NULL (never pulled, OR in
//       trial — DB can't tell the two apart, see contract's SV-17 anchor)
//       is always included, never filtered out — the safe default.
//   - [T2] run(): setInterval(tick, RUN_INTERVAL_MS) replaced with a
//       self-rescheduling setTimeout, matching notifier.js's own poll()
//       pattern. A cycle that overran RUN_INTERVAL_MS could previously
//       stack with the next one; now each cycle starts RUN_INTERVAL_MS
//       after the previous one finished, never overlapping.
//   - expireGracePeriodSubscriptions removed as a separate pass. It made
//       its own subscriptions() call per id every cycle, duplicating the
//       read processOneSubscription already made for the same id — for
//       every id in the list, not just Paused ones, before filtering
//       internally. Expiry now runs inline inside processOneSubscription's
//       existing Paused branch, reusing the struct already fetched there,
//       and gets the same CONCURRENCY batching pulls already use instead
//       of running sequentially.
//
// Changes from v5:
//   - ABI updated for SubscriptionVault v6:
//       subscriptions() now returns billingPausedUntil and isContractVault fields
//   - isDue() on-chain already accounts for billingPausedUntil (v6 contract).
//       Keeper reads it from struct for logging purposes only.
//   - processDueSubscriptions: logs billingPausedUntil state when subscription
//       is active but not due, to distinguish "interval not elapsed" from
//       "merchant billing pause active".
//   - expireGracePeriodSubscriptions: no change — still uses pausedAt field.
//   - ERC-1271 note: isContractVault is now stored in the struct. Keeper logs
//       vault type. Full ERC-1271 signature generation for contract wallets is
//       planned for v6.1 — EOA-only path is still used for all current subscribers.

require("dotenv").config();
const { ethers } = require("ethers");
const { Pool }   = require("pg");
const { upsertKeeperHeartbeat, logKeeperPullAttempt: _logPullAttempt } = process.env.DATABASE_URL
  ? require("./db.js")
  : { upsertKeeperHeartbeat: async () => {}, logKeeperPullAttempt: async () => {} }; // no-op if DB not configured

// Safe wrapper — never throws
const logPullAttempt = async (data) => { try { await _logPullAttempt(data); } catch {} };

if (!process.env.VAULT_ADDRESS) throw new Error("VAULT_ADDRESS not set in env");
const VAULT_ADDRESS   = ethers.getAddress(process.env.VAULT_ADDRESS.trim());
const RPC_URL         = (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org").trim();
const KEEPER_PRIVKEY  = (process.env.KEEPER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "").trim();
const RUN_INTERVAL_MS = 20_000; // reduced from 60s for faster detection of due subscriptions
const DUE_WINDOW_HOURS = 4; // [T1] Active subscriptions are DB-pre-filtered to this rolling window

// [T18] Mask API keys embedded in RPC URLs before logging. Provider URLs
// (Alchemy, Infura, etc.) carry the API key as the last path segment —
// logging RPC_URL verbatim exposes it in plaintext to anyone with log
// access (Railway dashboard, support, connected tools). This masks any
// path segment that looks like a key (long alphanumeric token) down to
// its last 4 characters; URLs with no such segment (e.g. the public
// https://sepolia.base.org fallback, which carries no key) pass through
// unchanged. This is a display-only transform — RPC_URL itself is never
// mutated, so the real key is still used for the actual provider connection.
function maskRpcUrl(url) {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.length >= 12 && /^[A-Za-z0-9_-]+$/.test(last)) {
      segments[segments.length - 1] = "*".repeat(last.length - 4) + last.slice(-4);
      u.pathname = "/" + segments.join("/");
    }
    return u.toString();
  } catch {
    return "<unparseable RPC URL — value withheld from log>";
  }
}

// ─── DB pool (optional — falls back to on-chain scan if DATABASE_URL not set) ─
const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
  : null;

if (db) {
  db.on("error", err => console.error("[KEEPER-DB] Pool error:", err.message));
  console.log("  DB: connected — using DB-driven subscription scan");
} else {
  console.log("  DB: DATABASE_URL not set — falling back to on-chain sequential scan");
}

// ─── ABI — v6 ───────────────────────────────────────────────────────────────
// Key changes from v5:
//   - subscriptions() returns billingPausedUntil (new field, SV-02 fix)
//   - subscriptions() returns isContractVault (new field, SV-01 fix)
//   - isDue() updated in contract: also gates on billingPausedUntil
//   - nextPullDue() updated: returns later of interval due and billingPausedUntil
//   - SubscriptionCreated event has isContractVault field
//   - SafeVaultUpdated event has newIsContractVault field
//   - MerchantRegistry constructor takes (address, bool) — deploy.js updated

const VAULT_ABI = [
  {
    name: "subscriptions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "owner",              type: "address" },
      { name: "guardian",           type: "address" },
      { name: "merchant",           type: "address" },
      { name: "safeVault",          type: "address" },
      { name: "token",              type: "address" },
      { name: "amount",             type: "uint256" },
      { name: "introAmount",        type: "uint256" },
      { name: "introPulls",         type: "uint256" },
      { name: "pullCount",          type: "uint256" },
      { name: "interval",           type: "uint8"   },
      { name: "lastPulledAt",       type: "uint256" },
      { name: "billingPausedUntil", type: "uint256" }, // [SV-02] new field
      { name: "pausedAt",           type: "uint256" },
      { name: "expiresAt",          type: "uint256" },
      { name: "trialEndsAt",        type: "uint256" },
      { name: "gracePeriodDays",    type: "uint256" },
      { name: "dataVaultId",        type: "bytes32" },
      { name: "status",             type: "uint8"   },
      { name: "isContractVault",    type: "bool"    }, // [SV-01] new field
    ],
  },
  {
    name: "isDue",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "nextPullAmount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "vaultBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "vaultAllowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    // v6: EOA subscribers pass deadline=0 and signature="0x" (isContractVault=false)
    // Contract wallet subscribers pass EIP-712 deadline + signature bytes (isContractVault=true)
    name: "executePull",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id",        type: "uint256" },
      { name: "deadline",  type: "uint256" },
      { name: "signature", type: "bytes"   },
    ],
    outputs: [],
  },
  {
    name: "expireSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "resumeSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "inIntroPricing",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "introPullsRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "pullAuthorisationDigest",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "id",       type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "PaymentExecuted", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "merchantReceived", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "pullCount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    name: "MerchantNotApproved", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "merchant", type: "address", indexed: true },
    ],
  },
  {
    name: "MerchantTransferFailed", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "merchant", type: "address", indexed: true },
    ],
  },
  {
    name: "SubscriptionPaused", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "pausedBy", type: "address" },
      { name: "reason", type: "string" },
    ],
  },
  {
    name: "SubscriptionExpired", type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "timestamp", type: "uint256" },
    ],
  },
];

const STATUS        = { Active: 0, Paused: 1, Cancelled: 2, Expired: 3 };
const INTERVAL_NAME = ["Weekly", "Monthly", "Yearly"];

// ─── Setup ───────────────────────────────────────────────────────────────────
function setup() {
  if (!KEEPER_PRIVKEY) throw new Error("KEEPER_PRIVATE_KEY not set in env");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(KEEPER_PRIVKEY, provider);
  console.log(`[keeper] Signing as address: ${wallet.address}`);
  const vault    = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
  return { provider, vault, wallet };
}
// ─── Get subscription IDs ─────────────────────────────────────────────────────
// DB-driven: queries subscriptions table for active/paused IDs.
// Falls back to sequential on-chain scan if DB unavailable.
// DB is the source of truth — notifier writes to it on SubscriptionCreated events.
async function getSubscriptionIds(vault) {
  // ── DB path (preferred) ──────────────────────────────────────────────────
  if (db) {
    try {
      // Scoped by vault_address — subscription ids are not unique across
      // vault deployments (same numeric id can exist on an old, superseded
      // vault too). An unscoped scan could hand the keeper a stale id left
      // over from a prior deployment. See CLAUDE-CORE.md, Aug 11 2026.
      //
      // [T1] Active subscriptions are pre-filtered to a rolling due-date
      // window computed from last_pulled_at — previously every active
      // subscription got a full subscriptions()+isDue() on-chain check
      // every cycle regardless of how far from due it was. Interval-to-
      // seconds matches the contract's own WEEKLY/MONTHLY/YEARLY constants
      // exactly (contracts/SubscriptionVault.sol). last_pulled_at IS NULL
      // is always included (never filtered) — DB can't distinguish
      // "genuinely never pulled" from "in trial, real due date is
      // trialEndsAt" (DB doesn't store trialEndsAt), so the safe default
      // is to keep checking these every cycle. Paused subscriptions are
      // never filtered — same reasoning as before.
      const result = await db.query(
        `SELECT id FROM subscriptions
         WHERE vault_address = $1
           AND (
             status = 'paused'
             OR (
               status = 'active' AND (
                 last_pulled_at IS NULL
                 OR last_pulled_at + (
                   CASE interval
                     WHEN 'weekly'  THEN INTERVAL '7 days'
                     WHEN 'monthly' THEN INTERVAL '30 days'
                     WHEN 'yearly'  THEN INTERVAL '365 days'
                   END
                 ) <= NOW() + $2::interval
               )
             )
           )
         ORDER BY id ASC`,
        [VAULT_ADDRESS, `${DUE_WINDOW_HOURS} hours`]
      );
      const ids = result.rows.map(r => Number(r.id));
      console.log(`  DB scan: ${ids.length} active/paused subscription(s) (active pre-filtered to next ${DUE_WINDOW_HOURS}h due window).`);
      return ids;
    } catch (err) {
      console.error(`  DB scan failed (${err.message}) — falling back to on-chain scan.`);
      // Fall through to on-chain scan
    }
  }

  // ── On-chain fallback ────────────────────────────────────────────────────
  console.log("  On-chain scan (sequential)...");
  const ids = [];
  let id = 0;
  while (true) {
    try {
      const sub = await vault.subscriptions(id);
      if (sub.owner === ethers.ZeroAddress) break;
      ids.push(id);
      id++;
    } catch {
      break;
    }
  }
  return ids;
}

// ─── Process active subscriptions ────────────────────────────────────────────
// Processes subscriptions in parallel batches (CONCURRENCY at a time) instead
// of one-by-one. Same keeper wallet, same executePull() call, same checks —
// just concurrent RPC calls instead of sequential waits. This is the
// throughput fix: most time per pull is RPC round-trip latency, not CPU,
// so batching directly multiplies effective pulls/minute.
const CONCURRENCY = 5;

// [Keeper backoff] Tracks consecutive MerchantNotApproved outcomes per
// subscription id. In-memory only — resets to empty on keeper restart,
// which is harmless (worst case: one extra cycle of retries before the
// pattern re-establishes). Not persisted to DB; this is purely an
// RPC/gas-efficiency optimization, not a correctness requirement, since
// the contract itself (SV-16) already guarantees auto-resume regardless
// of what the keeper does.
const notApprovedBackoff = new Map(); // id -> { count: number, skipUntil: number }
const NOT_APPROVED_BACKOFF_THRESHOLD = 3;
const NOT_APPROVED_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes

// [T46] The free public RPC (https://sepolia.base.org, in use since Alchemy's
// quota ran out -- see T5) rate-limits at 25 req/s and, under load, drops
// some reads outright instead of a clean error: ethers surfaces this as a
// "missing revert data" CALL_EXCEPTION even for a plain view-function read
// that cannot legitimately revert for a valid, existing subscription id.
// Confirmed via direct log comparison 2026-11-15 that this was already
// happening before T45's change -- pre-existing, not caused by it.
//
// This retries ONLY plain read calls, a few times with a short backoff, so
// a dropped read becomes a short delay instead of this subscription being
// skipped for the whole cycle. It deliberately does NOT wrap executePull()
// itself below -- a revert there can be a real business-logic outcome
// (e.g. AgentPullExceedsCap, T45) that must never be silently retried.
function isTransientRpcError(err) {
  if (!err) return false;
  const rawCode = err.info?.error?.code ?? err.error?.code;
  if (rawCode === -32007 || rawCode === -32005) return true; // rate limit / request limit
  const msg = String(err.shortMessage || err.message || "");
  if (/request limit reached/i.test(msg)) return true;
  if (err.code === "CALL_EXCEPTION" && /missing revert data/i.test(msg)) return true;
  return false;
}
async function readWithRetry(fn, id, label, { retries = 3, baseDelayMs = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientRpcError(err) || attempt === retries) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
      console.warn(`     WARNING: transient RPC error reading ${label}(${id}), retry ${attempt + 1}/${retries} in ${delay}ms — ${err.shortMessage || err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}


// ─── Multicall3 ───
// [T47] Multicall3 is deployed at the same address on virtually every EVM
// chain, including Base Sepolia (https://www.multicall3.com). T46 stopped a
// single dropped RPC read from silently costing a whole subscription's cycle
// by retrying it — but T46 itself flagged that the underlying call VOLUME
// still scales linearly with subscription count (~5 reads per subscription
// per cycle), so at real growth volume the free RPC's 25 req/s cap gets hit
// more often, not less, and retries compete for the same scarce capacity.
// This batches those per-subscription reads into a small, fixed number of
// RPC round trips per cycle instead of ~5 per subscription.
//
// Design: prefetchCycleData() runs up to 3 aggregate3() calls total per
// cycle covering every subscription id, and caches the results by id.
// processOneSubscription() below reads from that cache first and only falls
// back to the original, individually-retried per-call path (readWithRetry
// against the vault directly) for any field the cache doesn't have — e.g. a
// single id's result failed to decode, or Multicall3 itself was unreachable.
// That fallback means a bad/edge-case id degrades only itself, and the
// worst case (Multicall3 unreachable) behaves exactly as it did before this
// change — never worse, only better in the common case.
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  {
    name: "aggregate3",
    type: "function",
    stateMutability: "payable",
    inputs: [{
      name: "calls", type: "tuple[]",
      components: [
        { name: "target",       type: "address" },
        { name: "allowFailure", type: "bool"    },
        { name: "callData",     type: "bytes"   },
      ],
    }],
    outputs: [{
      name: "returnData", type: "tuple[]",
      components: [
        { name: "success",    type: "bool"  },
        { name: "returnData", type: "bytes" },
      ],
    }],
  },
];
const MULTICALL_CHUNK_SIZE = 300; // conservative cap on sub-calls per aggregate3 call

// Runs pre-encoded `calls` (each { id, field, target, callData }) through
// Multicall3 in chunks of MULTICALL_CHUNK_SIZE, with the same transient-RPC
// retry every other read in this file uses. allowFailure is always true, so
// one id reverting (e.g. a stale/removed id) never fails the whole batch.
// Returns an array of { success, returnData } aligned 1:1 with `calls`; a
// chunk whose multicall call itself fails outright (even after retries)
// contributes `null` entries for every call in that chunk — callers must
// treat null the same as success:false and fall back per-id.
async function multicallBatch(provider, calls) {
  if (calls.length === 0) return [];
  const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
  const results = [];
  for (let i = 0; i < calls.length; i += MULTICALL_CHUNK_SIZE) {
    const chunk = calls.slice(i, i + MULTICALL_CHUNK_SIZE);
    try {
      const chunkCalls = chunk.map(c => ({ target: c.target, allowFailure: true, callData: c.callData }));
      const raw = await readWithRetry(
        () => multicall.aggregate3.staticCall(chunkCalls),
        "multicall",
        `aggregate3[${chunk.length}]`
      );
      for (const r of raw) results.push({ success: r.success, returnData: r.returnData });
    } catch (err) {
      console.warn(`     WARNING: Multicall3 batch of ${chunk.length} call(s) failed outright (${err.message}) — falling back to per-id reads for this chunk. [T47]`);
      for (let j = 0; j < chunk.length; j++) results.push(null);
    }
  }
  return results;
}

// Fetches subscriptions()+isDue() for every id in one batch, then
// nextPullAmount()/inIntroPricing() for Active-and-due ids and
// vaultBalance()/vaultAllowance()/nextPullAmount() for still-in-grace Paused
// ids in a second batch, then introPullsRemaining() for Active-and-due ids
// in intro pricing in a third. Returns a Map id -> partial data; any field
// Multicall3 couldn't decode for a given id is simply left unset, and
// processOneSubscription() re-fetches that one field itself. [T47]
async function prefetchCycleData(vault, provider, ids) {
  const cache = new Map(ids.map(id => [id, {}]));
  if (ids.length === 0) return cache;

  // ── Phase 1: subscriptions() + isDue() for every id ──
  const phase1Calls = [];
  for (const id of ids) {
    phase1Calls.push({ id, field: "sub", target: VAULT_ADDRESS, callData: vault.interface.encodeFunctionData("subscriptions", [id]) });
    phase1Calls.push({ id, field: "due", target: VAULT_ADDRESS, callData: vault.interface.encodeFunctionData("isDue", [id]) });
  }
  const phase1Results = await multicallBatch(provider, phase1Calls);
  phase1Results.forEach((r, i) => {
    const { id, field } = phase1Calls[i];
    if (!r || !r.success) return; // leave unset -> per-id fallback
    try {
      if (field === "sub") cache.get(id).sub = vault.interface.decodeFunctionResult("subscriptions", r.returnData);
      else cache.get(id).due = vault.interface.decodeFunctionResult("isDue", r.returnData)[0];
    } catch { /* leave unset -> per-id fallback */ }
  });

  // ── Phase 2: per-status follow-up reads, using Phase 1's results ──
  const phase2Calls = [];
  const nowSecs = Math.floor(Date.now() / 1000);
  for (const id of ids) {
    const entry = cache.get(id);
    if (!entry.sub) continue; // Phase 1 failed for this id -> full per-id fallback
    const status = Number(entry.sub.status);
    if (status === STATUS.Active && entry.due === true) {
      phase2Calls.push({ id, field: "pullAmount", target: VAULT_ADDRESS, callData: vault.interface.encodeFunctionData("nextPullAmount", [id]) });
      phase2Calls.push({ id, field: "isIntro",    target: VAULT_ADDRESS, callData: vault.interface.encodeFunctionData("inIntroPricing", [id]) });
    } else if (status === STATUS.Paused) {
      const pausedAt       = Number(entry.sub.pausedAt);
      const gracePeriodEnd = pausedAt + Number(entry.sub.gracePeriodDays) * 86_400;
      if (pausedAt > 0 && nowSecs <= gracePeriodEnd) {
        phase2Calls.push({ id, field: "balance",   target: VAULT_ADDRESS, callData: vault.interface.encodeFunctionData("vaultBalance", [id]) });
        phase2Calls.push({ id, field: "allowance", target: VAULT_ADDRESS, callData: vault.interface.encodeFunctionData("vaultAllowance", [id]) });
        phase2Calls.push({ id, field: "required",  target: VAULT_ADDRESS, callData: vault.interface.encodeFunctionData("nextPullAmount", [id]) });
      }
    }
  }
  const phase2Results = await multicallBatch(provider, phase2Calls);
  const PHASE2_FN_NAME = { pullAmount: "nextPullAmount", isIntro: "inIntroPricing", balance: "vaultBalance", allowance: "vaultAllowance", required: "nextPullAmount" };
  phase2Results.forEach((r, i) => {
    const { id, field } = phase2Calls[i];
    if (!r || !r.success) return;
    try {
      cache.get(id)[field] = vault.interface.decodeFunctionResult(PHASE2_FN_NAME[field], r.returnData)[0];
    } catch { /* leave unset -> per-id fallback */ }
  });

  // ── Phase 3: introPullsRemaining() for Active-and-due ids in intro pricing ─
  const phase3Calls = [];
  for (const id of ids) {
    if (cache.get(id).isIntro === true) {
      phase3Calls.push({ id, field: "introPullsLeft", target: VAULT_ADDRESS, callData: vault.interface.encodeFunctionData("introPullsRemaining", [id]) });
    }
  }
  const phase3Results = await multicallBatch(provider, phase3Calls);
  phase3Results.forEach((r, i) => {
    const { id } = phase3Calls[i];
    if (!r || !r.success) return;
    try {
      cache.get(id).introPullsLeft = vault.interface.decodeFunctionResult("introPullsRemaining", r.returnData)[0];
    } catch { /* leave unset -> per-id fallback */ }
  });

  return cache;
}

async function processOneSubscription(vault, wallet, id, prefetched = {}) {
  const sub    = prefetched.sub ?? await readWithRetry(() => vault.subscriptions(id), id, "subscriptions");
  const status = Number(sub.status);

  // ── Active: check if due and pull ──────────────────────────────────────
  if (status === STATUS.Active) {
    const due = prefetched.due ?? await readWithRetry(() => vault.isDue(id), id, "isDue");

    if (!due) {
      const now = Math.floor(Date.now() / 1000);
      const billingPausedUntil = Number(sub.billingPausedUntil);
      if (billingPausedUntil > 0 && now < billingPausedUntil) {
        const hoursLeft = Math.ceil((billingPausedUntil - now) / 3600);
        console.log(`  Subscription #${id} billing paused by merchant for ${hoursLeft}h more.`);
      }
      return { pulled: 0, skipped: 1, expired: 0 };
    }

    const pullAmount     = prefetched.pullAmount ?? await readWithRetry(() => vault.nextPullAmount(id), id, "nextPullAmount");
    const isIntro        = prefetched.isIntro ?? await readWithRetry(() => vault.inIntroPricing(id), id, "inIntroPricing");
    const introPullsLeft = isIntro ? (prefetched.introPullsLeft ?? await readWithRetry(() => vault.introPullsRemaining(id), id, "introPullsRemaining")) : 0n;
    const vaultType = sub.isContractVault ? "contract-wallet (ERC-1271)" : "EOA";

    console.log(`  -> Pulling subscription #${id}`);
    console.log(`     Owner:      ${sub.owner}`);
    console.log(`     Merchant:   ${sub.merchant}`);
    console.log(`     Vault type: ${vaultType}`);
    console.log(`     Amount:     ${ethers.formatUnits(pullAmount, 6)} USDC${isIntro ? ` (intro — ${introPullsLeft} pulls remaining at intro price)` : ""}`);
    console.log(`     Interval:   ${INTERVAL_NAME[Number(sub.interval)]}`);

    if (sub.isContractVault) {
      console.warn(`     WARNING: Subscription #${id} is a contract vault. ERC-1271 signing not yet implemented in keeper. Skipping.`);
      console.warn(`     ACTION:  Upgrade keeper to v6.1 before onboarding contract wallet subscribers.`);
      await logPullAttempt({
        subscriptionId: id,
        wallet:   sub.owner,
        merchant: sub.merchant,
        amountUsdc: ethers.formatUnits(pullAmount, 6),
        status:   "skipped",
        error:    "contract-vault: ERC-1271 not yet implemented",
      });
      return { pulled: 0, skipped: 1, expired: 0 };
    }

    // [T45] isContractVault is set once, at creation, and never re-synced.
    // The vault's own executePull() re-checks _isContract(safeVault) LIVE on
    // every pull (SV-19) — if this EOA has since taken on contract code (e.g.
    // an EIP-7702 delegation), the vault will now require the ERC-1271 /
    // EIP-712 signature path. The keeper cannot produce that signature (see
    // the isContractVault branch above — not yet built), so blindly sending
    // executePull(id, 0, "0x") in that state is a guaranteed revert. Left
    // unchecked, that revert falls into the generic catch block below and
    // repeats silently, forever, indistinguishable from a transient RPC
    // error — confirmed via direct source read against SubscriptionVault.sol,
    // logged 2026-11-08/15. Check live, once, right before attempting the
    // pull, and fail loud instead of generic-failed if the stored flag is
    // now stale. eth_getCode is a single-address state read with no range
    // limit — unlike eth_getLogs (T5/T44), this is not expected to be a
    // concern on the free public RPC.
    let liveCode = "0x";
    try {
      liveCode = await wallet.provider.getCode(sub.safeVault);
    } catch (err) {
      console.warn(`     WARNING: live code check failed for subscription #${id} (${err.message}) — proceeding with stored isContractVault flag only.`);
    }
    if (liveCode !== "0x") {
      console.warn(`     WARNING: Subscription #${id}'s wallet (${sub.safeVault}) now has contract code but was recorded as EOA at creation — likely an EIP-7702 upgrade since subscribing. ERC-1271 signing not implemented in keeper (same gap as the contract-vault branch above). Skipping — this subscription needs manual review, not a routine retry. [T45]`);
      await logPullAttempt({
        subscriptionId: id,
        wallet:   sub.owner,
        merchant: sub.merchant,
        amountUsdc: ethers.formatUnits(pullAmount, 6),
        status:   "skipped_eoa_upgraded",
        error:    "safeVault now contract-coded (stored isContractVault=false is stale) — ERC-1271 not implemented, needs manual review [T45]",
      });
      return { pulled: 0, skipped: 1, expired: 0 };
    }

    const backoffState = notApprovedBackoff.get(id);
    if (backoffState && Date.now() < backoffState.skipUntil) {
      const minsLeft = Math.ceil((backoffState.skipUntil - Date.now()) / 60000);
      console.log(`  Subscription #${id} in MerchantNotApproved backoff — ${minsLeft}min remaining, skipping.`);
      return { pulled: 0, skipped: 1, expired: 0 };
    }

    try {
      const BUILDER_CODE = "0x62635f6361336b376235320b0080218021802180218021802180218021";
      const encodedCall  = vault.interface.encodeFunctionData("executePull", [id, 0, "0x"]);
      const calldataWithCode = encodedCall + BUILDER_CODE.slice(2);
      const tx = await wallet.sendTransaction({
        to: VAULT_ADDRESS,
        data: calldataWithCode,
      });
      console.log(`     TX sent:  ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`     Confirmed in block ${receipt.blockNumber}`);

      let outcome = "unknown";
      for (const log of receipt.logs) {
        try {
          const parsed = vault.interface.parseLog(log);
          if (parsed) { outcome = parsed.name; break; }
        } catch { /* not a vault event, ignore */ }
      }

      if (outcome === "PaymentExecuted") {
        notApprovedBackoff.delete(id);
        await logPullAttempt({
          subscriptionId: id, wallet: sub.owner, merchant: sub.merchant,
          amountUsdc: ethers.formatUnits(pullAmount, 6),
          status: "success", txHash: tx.hash, blockNumber: receipt.blockNumber,
        });
        console.log("");
        return { pulled: 1, skipped: 0, expired: 0 };
      }

      if (outcome === "MerchantNotApproved") {
        const prev = notApprovedBackoff.get(id) || { count: 0, skipUntil: 0 };
        const count = prev.count + 1;
        const skipUntil = count >= NOT_APPROVED_BACKOFF_THRESHOLD
          ? Date.now() + NOT_APPROVED_BACKOFF_MS
          : 0;
        notApprovedBackoff.set(id, { count, skipUntil });
        if (skipUntil > 0) {
          console.log(`  Subscription #${id}: ${count} consecutive MerchantNotApproved — backing off 10min.`);
        }
        await logPullAttempt({
          subscriptionId: id, wallet: sub.owner, merchant: sub.merchant,
          amountUsdc: ethers.formatUnits(pullAmount, 6),
          status: "skipped", error: "merchant_not_approved",
        });
        console.log("");
        return { pulled: 0, skipped: 1, expired: 0 };
      }

      // MerchantTransferFailed, SubscriptionPaused, SubscriptionExpired,
      // or anything else that confirmed without reverting: not a payment,
      // not the specific backoff case — just log accurately and reset.
      notApprovedBackoff.delete(id);
      await logPullAttempt({
        subscriptionId: id, wallet: sub.owner, merchant: sub.merchant,
        amountUsdc: ethers.formatUnits(pullAmount, 6),
        status: "skipped", error: outcome,
      });
      console.log("");
      return { pulled: 0, skipped: 1, expired: 0 };
    } catch (err) {
      console.error(`     executePull failed: ${err.message}`);
      await logPullAttempt({
        subscriptionId: id,
        wallet:   sub.owner,
        merchant: sub.merchant,
        amountUsdc: ethers.formatUnits(pullAmount, 6),
        status:   "failed",
        error:    err.message?.slice(0, 500),
      });
      console.log("");
      return { pulled: 0, skipped: 0, expired: 0 };
    }
  }

  // ── Paused: retry if vault topped up within grace period, else expire ───
  // [T1/expiry-merge] Previously grace-period expiry was a separate pass
  // (expireGracePeriodSubscriptions) that re-fetched subscriptions(id) for
  // every id, every cycle — duplicating the read already done above for
  // this same id. Folded in here to reuse `sub`, and gets the same
  // CONCURRENCY batching pulls already use instead of running sequentially.
  if (status === STATUS.Paused) {
    const pausedAt       = Number(sub.pausedAt);
    const graceSecs      = Number(sub.gracePeriodDays) * 86_400;
    const now            = Math.floor(Date.now() / 1000);
    const gracePeriodEnd = pausedAt + graceSecs;

    // Defensive guard carried over from the old expire loop: pausedAt === 0
    // should not happen for a genuinely Paused subscription, but treating
    // it as "grace ended at graceSecs" would be wrong — skip, don't guess.
    if (pausedAt === 0) return { pulled: 0, skipped: 0, expired: 0 };

    if (now > gracePeriodEnd) {
      const hoursOver = Math.floor((now - gracePeriodEnd) / 3600);
      console.log(`  -> Expiring subscription #${id} (grace ended ${hoursOver}h ago)`);
      try {
        const tx      = await vault.expireSubscription(id);
        console.log(`     TX sent:  ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`     Expired in block ${receipt.blockNumber}`);
        console.log("");
        return { pulled: 0, skipped: 0, expired: 1 };
      } catch (err) {
        console.error(`     expireSubscription failed: ${err.message}`);
        console.log("");
        return { pulled: 0, skipped: 0, expired: 0 };
      }
    }

    const balance   = prefetched.balance ?? await readWithRetry(() => vault.vaultBalance(id), id, "vaultBalance");
    const allowance = prefetched.allowance ?? await readWithRetry(() => vault.vaultAllowance(id), id, "vaultAllowance");
    const required  = prefetched.required ?? await readWithRetry(() => vault.nextPullAmount(id), id, "nextPullAmount");

    if (balance >= required && allowance >= required) {
      console.log(`  -> Subscription #${id} vault funded during grace — awaiting subscriber resume.`);
      console.log(`     Balance: ${ethers.formatUnits(balance, 6)} USDC, Required: ${ethers.formatUnits(required, 6)} USDC`);
      console.log(`     Subscriber must call resumeSubscription to reactivate.`);
      return { pulled: 0, skipped: 1, expired: 0 };
    } else {
      const balFmt         = ethers.formatUnits(balance, 6);
      const reqFmt         = ethers.formatUnits(required, 6);
      const alwFmt         = ethers.formatUnits(allowance, 6);
      const graceRemaining = Math.floor((gracePeriodEnd - now) / 3600);
      console.log(`  Subscription #${id} in grace (${graceRemaining}h left) — balance: ${balFmt} USDC, allowance: ${alwFmt} USDC, required: ${reqFmt} USDC`);
      return { pulled: 0, skipped: 1, expired: 0 };
    }
  }

  return { pulled: 0, skipped: 0, expired: 0 };
}

async function processDueSubscriptions(vault, wallet, provider, ids) {
  let pulled  = 0;
  let skipped = 0;
  let expired = 0;

  // [T47] One prefetch pass per cycle, covering every id, instead of each
  // id making its own ~5 individual RPC reads. See prefetchCycleData's own
  // comment above for the batching design and fallback behavior.
  const cache = await prefetchCycleData(vault, provider, ids);

  // Process in batches of CONCURRENCY, parallel within each batch.
  // Sequential pulls were the bottleneck — each await blocked on RPC
  // round-trip even when nothing depends on the previous result.
  // [T1/expiry-merge] Also now handles grace-period expiry inline (see
  // processOneSubscription's Paused branch) — previously a separate
  // sequential expireGracePeriodSubscriptions pass duplicated the
  // subscriptions() read this loop already makes for every id.
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(id => processOneSubscription(vault, wallet, id, cache.get(id) || {}).catch(err => {
        console.error(`  Subscription #${id} processing error: ${err.message}`);
        return { pulled: 0, skipped: 0, expired: 0 };
      }))
    );
    for (const r of results) {
      pulled  += r.pulled;
      skipped += r.skipped;
      expired += r.expired;
    }
  }

  return { pulled, skipped, expired };
}

// ─── Main loop ────────────────────────────────────────────────────────────────
async function run() {
  const { provider, wallet, vault } = setup();

  console.log("=".repeat(60));
  console.log("  AuthOnce — Keeper Bot v7");
  console.log("=".repeat(60));
  console.log(`  Vault:    ${VAULT_ADDRESS}`);
  console.log(`  Keeper:   ${wallet.address}`);
  console.log(`  RPC:      ${maskRpcUrl(RPC_URL)}`);
  console.log(`  Interval: ${RUN_INTERVAL_MS / 1000}s after each cycle completes (self-rescheduling)`);
  console.log(`  Due window: ${DUE_WINDOW_HOURS}h (active subscriptions pre-filtered)`);
  console.log(`  Concurrency: ${CONCURRENCY} parallel pulls per batch`);
  console.log("=".repeat(60));
  console.log("");

  // ─── ETH balance alert ───────────────────────────────────────────────────────
  const KEEPER_ETH_WARN_THRESHOLD    = ethers.parseEther("0.005");
  const DEPLOYER_ETH_WARN_THRESHOLD  = ethers.parseEther("0.005");
  const SAFE_ETH_WARN_THRESHOLD      = ethers.parseEther("0.01");

  // Generic wallet ETH balance checker — returns { ethBalance, warn }
  // Email alert fires at most once every 24 hours per wallet to avoid spam
  const alertCooldowns = {}; // in-memory cooldown tracker per address

  async function checkWalletEthBalance(provider, address, threshold, label) {
    try {
      const balance    = await provider.getBalance(address);
      const ethBalance = parseFloat(ethers.formatEther(balance));
      const warn       = balance < threshold;

      if (warn) {
        // Cooldown — only log/email once per 24 hours per wallet, not every
        // ~20s poll cycle. The balance check itself (warn, returned below)
        // still runs every cycle regardless — only the noisy log line is gated.
        const lastAlerted = alertCooldowns[address] || 0;
        const hoursSince  = (Date.now() - lastAlerted) / (1000 * 60 * 60);

        if (hoursSince >= 24) {
          alertCooldowns[address] = Date.now();
          console.error(`⚠️  ${label} LOW ON ETH — Balance: ${ethBalance.toFixed(6)} ETH`);
          const RESEND_API_KEY = process.env.RESEND_API_KEY;
          const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || "vasco@authonce.io";
          if (RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "AuthOnce <notifications@authonce.io>",
                to:   [ADMIN_EMAIL],
                subject: `⚠️ ${label} low on ETH — ${ethBalance.toFixed(6)} ETH remaining`,
                html: `<!DOCTYPE html><html><body style="font-family:monospace;background:#0f172a;color:#f1f5f9;padding:24px;">
                  <h2 style="color:#f59e0b;">⚠️ ${label} Low on ETH</h2>
                  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                    <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">Wallet</td><td style="padding:8px;font-family:monospace;">${address}</td></tr>
                    <tr><td style="padding:8px;color:#94a3b8;border-bottom:1px solid #1e293b;">Balance</td><td style="padding:8px;color:#f59e0b;font-weight:bold;">${ethBalance.toFixed(6)} ETH</td></tr>
                    <tr><td style="padding:8px;color:#94a3b8;">Action</td><td style="padding:8px;color:#34d399;">Top up with at least 0.05 ETH on Base Network</td></tr>
                  </table>
                  <p style="color:#475569;font-size:12px;">AuthOnce Keeper Bot · Next alert in 24 hours if not resolved</p>
                </body></html>`,
                text: `${label} LOW ON ETH\n\nWallet: ${address}\nBalance: ${ethBalance.toFixed(6)} ETH\n\nTop up on Base Network. Next alert in 24 hours.`,
              }),
            }).catch(e => console.error(`  ETH alert email failed: ${e.message}`));
            console.log(`  ETH low-balance alert sent for ${label} (next alert in 24h)`);
          }
        }
      }
      return { ethBalance, warn };
    } catch (err) {
      console.error(`  Could not fetch ETH balance for ${label}: ${err.message}`);
      return { ethBalance: null, warn: false };
    }
  }

  async function checkKeeperBalance(provider, address) {
    const result = await checkWalletEthBalance(provider, address, KEEPER_ETH_WARN_THRESHOLD, "Keeper wallet");
    return { ethBalance: result.ethBalance, ethBalanceWarn: result.warn };
  }

  // ─── Treasury USDC balance check ─────────────────────────────────────────────
  // Reads accumulated protocol fees — display only, no alert needed
  const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];
  const USDC_ADDRESS = process.env.NETWORK === "base-mainnet"
    ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    : "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia

  async function checkTreasuryUsdc(provider) {
    try {
      const TREASURY = process.env.PROTOCOL_TREASURY_ADDRESS || "0x737D4EeAEF67f776724482a29367615703A2DEB1";
      const usdc     = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const balance  = await usdc.balanceOf(TREASURY);
      return parseFloat(ethers.formatUnits(balance, 6)); // USDC has 6 decimals
    } catch (err) {
      console.error(`  Could not fetch treasury USDC balance: ${err.message}`);
      return null;
    }
  }

  async function tick() {
    const timestamp = new Date().toISOString();
    const cycleStart = Date.now();
    console.log(`[${timestamp}] Keeper cycle...`);

    let pulled = 0, expired = 0, skipped = 0, cycleError = null;
    let ethBalance = null, ethBalanceWarn = false;
    let deployerEthBalance = null, deployerEthWarn = false;
    let safeEthBalance = null, safeEthWarn = false;
    let treasuryUsdc = null;

    try {
      ({ ethBalance, ethBalanceWarn } = await checkKeeperBalance(provider, wallet.address));

      // Deployer ETH — alert only
      const DEPLOYER_ADDRESS = process.env.DEPLOYER_ADDRESS || "0xbb6d960b8671713bb92be92d03BE8d8165EE7782";
      ({ ethBalance: deployerEthBalance, warn: deployerEthWarn } =
        await checkWalletEthBalance(provider, DEPLOYER_ADDRESS, DEPLOYER_ETH_WARN_THRESHOLD, "Deployer wallet"));

      // Safe multisig ETH — alert + dashboard
      const SAFE_ADDRESS = process.env.PROTOCOL_TREASURY_ADDRESS || "0x737D4EeAEF67f776724482a29367615703A2DEB1";
      ({ ethBalance: safeEthBalance, warn: safeEthWarn } =
        await checkWalletEthBalance(provider, SAFE_ADDRESS, SAFE_ETH_WARN_THRESHOLD, "Safe multisig"));

      // Treasury USDC — dashboard only
      treasuryUsdc = await checkTreasuryUsdc(provider);

      const ids = await getSubscriptionIds(vault);
      console.log(`  Found ${ids.length} subscription(s).`);

      if (ids.length === 0) {
        console.log("  Nothing to do.");
        console.log("");
      } else {
        ({ pulled, skipped, expired } = await processDueSubscriptions(vault, wallet, provider, ids));
        console.log(`  Done: ${pulled} pulled, ${expired} expired, ${skipped} not due / skipped.`);
      }
    } catch (err) {
      cycleError = err.message;
      console.error(`  Keeper error: ${err.message}`);
    }

    const cycleMs = Date.now() - cycleStart;
    console.log(`  Cycle time: ${cycleMs}ms`);
    console.log("");

    // Write heartbeat to DB
    try {
      await upsertKeeperHeartbeat({ cycleMs, pulled, expired, skipped, error: cycleError, ethBalance, ethBalanceWarn, deployerEthBalance, deployerEthWarn, safeEthBalance, safeEthWarn, treasuryUsdc });
    } catch (err) {
      console.error(`  Heartbeat write failed: ${err.message}`);
    }
  }

  // [T2] Self-rescheduling setTimeout instead of setInterval — matches
  // notifier.js's own poll() pattern. A cycle that overruns RUN_INTERVAL_MS
  // can no longer stack with the next one; the next cycle starts
  // RUN_INTERVAL_MS after the previous one finished, not on a fixed clock
  // regardless of how long the previous cycle took.
  async function loop() {
    await tick();
    setTimeout(loop, RUN_INTERVAL_MS);
  }
  await loop();
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
