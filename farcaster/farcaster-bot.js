// scripts/farcaster-bot.js
// AuthOnce Farcaster Bot
// Posts daily at 12:00 UTC via Neynar API
// 28-post bank — 4-week rotation, never repetitive
// Mix: builder updates, hot takes, funny, technical, questions, polls
//
// Railway env vars:
//   NEYNAR_API_KEY       — Neynar API key
//   NEYNAR_SIGNER_UUID   — Signer UUID for @authonce (FID: 3324301)
//   FARCASTER_FID        — AuthOnce FID (3324301)
//   DATABASE_URL         — Postgres connection string (rotation index persistence)

const path = require('path');
const { Pool } = require('pg');

const NEYNAR_API_KEY     = process.env.NEYNAR_API_KEY;
const NEYNAR_SIGNER_UUID = process.env.NEYNAR_SIGNER_UUID;

if (!NEYNAR_API_KEY)     throw new Error('NEYNAR_API_KEY not set');
if (!NEYNAR_SIGNER_UUID) throw new Error('NEYNAR_SIGNER_UUID not set');

// ─── State — PostgreSQL backed (survives Railway restarts) ───────────────────
// This service runs as its own isolated Railway deployment (Root Directory =
// "farcaster"), so it can't reach scripts/db.js on disk — connection/query
// pattern below matches db.js exactly (same pool config, same logged query
// wrapper) rather than importing it or hand-rolling a bare `new Pool()`.
//
// Table is named farcaster_bot_state (not a generic "bot_state") so x-bot.js
// can adopt the same checkpoint pattern later without a name collision.
if (!process.env.DATABASE_URL) {
  console.error(
    '[farcaster-bot] ⚠️  DATABASE_URL not set — rotation index cannot persist. ' +
    'Every restart will silently reset to post #1 instead of resuming the rotation.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => {
  console.error("[farcaster-bot] Unexpected pool error:", err.message);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[farcaster-bot] Slow query (${duration}ms):`, text.substring(0, 80));
    }
    return res;
  } catch (err) {
    console.error("[farcaster-bot] Query error:", err.message, "\nQuery:", text.substring(0, 120));
    throw err;
  }
}

async function ensureStateTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS farcaster_bot_state (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getState() {
  try {
    const result = await query(`SELECT value FROM farcaster_bot_state WHERE key = 'index'`);
    if (result.rows.length > 0) {
      const saved = parseInt(result.rows[0].value, 10);
      if (Number.isFinite(saved)) return { index: saved };
    }
  } catch (err) {
    console.error("[farcaster-bot] Failed to load state, defaulting to 0:", err.message);
  }
  return { index: 0 };
}

async function saveState(state) {
  try {
    await query(
      `INSERT INTO farcaster_bot_state (key, value, updated_at) VALUES ('index', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [String(state.index)]
    );
  } catch (err) {
    console.error("[farcaster-bot] Failed to save state:", err.message);
  }
}

// ─── Post bank — 28 posts, 4-week rotation ────────────────────────────────────
// Types:
//   [builder]   — honest build-in-public updates
//   [funny]     — humour that lands with crypto-native audience
//   [take]      — hot takes that invite replies
//   [question]  — drives direct engagement
//   [technical] — interesting engineering detail
//   [feature]   — protocol feature, non-salesy
const POSTS = [
  // WEEK 1

  // 1 [funny]
  `My smart contract has better uptime than my sleep schedule.

Keeper bot: running 24/7 ✅
Me: shipping anyway 🤔

Building @authonce — solo founder, moving fast.

/authonce /base /buildinpublic`,

  // 2 [take]
  `Hot take: the reason crypto subscriptions haven't worked yet isn't technical.

It's that everyone built for the merchant and forgot the subscriber.

Subscriber experience in Web3 payments is still basically: "trust us, we won't drain your wallet."

That's not good enough.

/defi /base /web3`,

  // 3 [question]
  `Quick question for the /base community:

If you could pay for any existing Web2 subscription in USDC — which one would you switch first?

Netflix? Spotify? GitHub? Something else?

Drop it below 👇`,

  // 4 [technical]
  `Interesting engineering detail from building AuthOnce:

We store a boolean called isContractVault in every subscription struct.

Why? Because extcodesize returns 0 during a contract's constructor — so if we checked it live at payment time, a contract wallet could subscribe from inside its own constructor and permanently skip signature verification.

We check once at signup. Store the result. Never check again.

Small thing. Big security difference.

/defi /solidity /base`,

  // 5 [builder]
  `AuthOnce update:

✅ Smart contracts audited and redeployed
✅ 4 stablecoins: USDC · USDT · DAI · EURC
✅ Stripe fiat onramp live
✅ Keeper bot running 24/7 on Base Sepolia
⏳ Mainnet: Q3 2026

What should I prioritise next?

/authonce /buildinpublic /base`,

  // 6 [funny]
  `Web3 payment protocol feature checklist:

❌ Streams tokens continuously (nobody asked for this)
❌ Requires subscriber to top up a pool (nightmare UX)
❌ Holds funds in escrow (needs a licence)
❌ Instant cancel = instant access loss (hostile)
✅ Pulls exact amount, on schedule, with a grace period

We did the last one.

/defi /base`,

  // 7 [take]
  `The best crypto UX is the one where the user forgets they're using crypto.

Subscribe. Authorize once. Never think about it again.

That's the goal with AuthOnce. The blockchain should be invisible to the subscriber.

/base /ux /defi`,

  // WEEK 2

  // 8 [question]
  `Real question:

Should a merchant be able to pause a subscriber's billing?

Example: your SaaS goes down for a week — you pause billing out of goodwill.

AuthOnce supports this with a 90-day lifetime cap and 30-day cooldown between pauses.

Is that the right design? 👇

/defi /base /saas`,

  // 9 [technical]
  `AuthOnce uses a one-way fee ratchet.

The protocol fee (currently 0.5%) can only go down. Never up. It's enforced in the smart contract — not a policy, not a promise.

setFeeBps() reverts if you try to raise it above the current value.

Subscribers can verify this on-chain. No trust required.

/defi /solidity /base`,

  // 10 [funny]
  `Stages of building a Web3 payment protocol:

1. "This will take 2 weeks"
2. "Okay 2 months"
3. "The EIP-712 domain separator has a subtle fork recompute issue"
4. "What year is it"
5. Ships anyway ✅

Currently somewhere between 4 and 5.

/buildinpublic /base /solidity`,

  // 11 [builder]
  `Something I didn't expect when building AuthOnce:

The hardest part wasn't the smart contracts. It was the dunning layer.

What happens when a payment fails? How long do you retry? Who do you notify? When do you give up?

Grace periods, keeper retries, webhook fallbacks, email notifications — all the boring stuff that actually makes subscriptions work.

/buildinpublic /defi /base`,

  // 12 [take]
  `Unpopular opinion:

Most "Web3 payments" projects are token distribution mechanisms with a payments UI.

A real payment protocol is boring infrastructure. No token. No governance. No yield.

Just: pull the right amount, on the right date, reliably, forever.

Boring is underrated.

/defi /base /web3`,

  // 13 [question]
  `For the builders on /base:

What's the biggest friction point when accepting crypto payments today?

a) Subscribers don't have wallets
b) Fiat onramp is too complicated
c) No recurring payment primitive
d) Regulatory uncertainty

I'm building for (c) but curious what you hit most.`,

  // 14 [funny]
  `My keeper bot processes payments every 60 seconds.

My Telegram channel notification: "New subscriber!"
Me at 2am: opens laptop

This is fine. Everything is fine.

/authonce /buildinpublic /base`,

  // WEEK 3

  // 15 [technical]
  `AuthOnce vault funding rule: exactly 1× the subscription amount per billing cycle.

No over-funding. No remaining balance. No withdrawal UX.

This eliminates an entire category of UX complexity — refunds, partial balances, withdrawal requests.

If the vault has exactly the right amount: it gets pulled. If not: grace period starts.

Simple rules make better protocols.

/defi /base /solidity`,

  // 16 [take]
  `AI agents are going to need payment infrastructure before most people realise it.

An agent that manages its own API subscriptions, renews its own tools, pays for its own compute — autonomously — needs ERC-1271 native recurring payments.

AuthOnce supports this today. Most payment protocols don't.

/ai /defi /base`,

  // 17 [question]
  `Farcaster poll 🗳️

Which stablecoin do you actually hold and use day-to-day?

🔵 USDC
🟢 USDT  
🟡 DAI
🔴 EURC
🟠 Other

AuthOnce supports all four for subscriptions. Curious what people actually use.`,

  // 18 [funny]
  `Things that are easier than explaining to my family what I'm building:

• Quantum physics
• Tax law
• Why the printer never works
• The entire plot of Inception

"It's like Stripe but on the blockchain and non-custodial and—"

"So like PayPal?"

Sure. Like PayPal.

/buildinpublic /base /web3`,

  // 19 [builder]
  `AuthOnce is raising €150K pre-seed.

Use of funds:
40% — smart contract audit (Cyfrin)
35% — business co-founder
15% — legal (MiCA, regulatory)
10% — operations

Solo founder. Swiss resident. Building for Europe.

If you know someone who backs early Web3 infrastructure — I'd appreciate the intro.

/fundraising /base /defi`,

  // 20 [technical]
  `Why AuthOnce doesn't need a custodian licence:

The protocol never holds funds. Not in escrow. Not in a buffer. Not for a millisecond.

One atomic transaction: subscriber wallet → merchant wallet.

FINMA (Swiss regulator) custodian rules only apply if you hold client assets. We don't.

Non-custodial isn't a marketing word here — it's the legal foundation.

/defi /regulatory /base`,

  // 21 [take]
  `The Web3 subscription problem in one sentence:

Subscribers don't want to think about payments. Merchants don't want to chase them.

Everything else — non-custodial, grace periods, webhooks, multi-token — is just engineering to deliver that one sentence.

authonce.io

/defi /base /web3`,

  // WEEK 4

  // 22 [take]
  `Unpopular opinion: grace periods are more important than gas fees.

A 7-day retry window recovers more failed payments than any gas optimisation.

People obsess over transaction costs. Nobody talks about dunning.

Dunning is the boring word for "how do you get paid when the vault runs dry."

We built a whole layer for it.

/defi /base /buildinpublic`,

  // 23 [question]
  `What's the Web3 equivalent of a SaaS trial?

With AuthOnce: merchant generates a trial link. Subscriber gets N days free. After that — vault gets funded, keeper pulls on schedule.

No card required. No credit check. Just a wallet and a grace period.

Would you use this for your project?

/base /defi /saas`,

  // 24 [technical]
  `AuthOnce contracts enforce a 30-day minimum notice on price changes.

Merchant calls setProductExpiry(). The new price only takes effect after 30 days on-chain.

Subscribers get notified automatically. They can cancel before the change kicks in.

This isn't a policy. It's not in the terms of service. It's in the bytecode.

/solidity /defi /base`,

  // 25 [funny]
  `Things I've explained to non-crypto people this week:

• "The vault is yours, not ours" — "So like a bank?"
• "The keeper bot pulls USDC on-chain" — "Pulls what from where?"
• "It's non-custodial by design" — "Is that legal?"
• "0.5% flat fee, enforced in bytecode" — "So… like a bank?"

We've come full circle.

/buildinpublic /base /web3`,

  // 26 [builder]
  `Hardest product decision so far:

Should the vault hold exactly 1× the subscription amount, or let subscribers over-fund?

We chose exactly 1×.

No refund UX. No partial balance confusion. No "why is there €3.47 stuck in my vault."

Vault has the right amount: pull succeeds. It doesn't: grace period starts.

Simple rules compound into good UX.

/buildinpublic /defi /base`,

  // 27 [take]
  `Web3 payments are not competing with Stripe.

They're competing with nothing — because nothing reliable exists for crypto-native merchants.

Stripe doesn't accept USDC subscriptions. PayPal doesn't know what a vault is.

The competition isn't a better product. It's "just use a spreadsheet and chase payments manually."

We can do better than that.

/defi /base /web3`,

  // 28 [question]
  `If you ran a DAO and wanted to charge membership fees on-chain —

How would you do it today?

Manual transfers? Snapshot off-chain? Guild.xyz gates?

AuthOnce handles this natively — USDC subscription, subscriber keeps custody, merchant gets pulled on schedule.

Is DAO membership billing a real pain point or am I imagining demand?

/dao /base /defi`,
];

// ─── Post via Neynar API ──────────────────────────────────────────────────────
async function castToFarcaster(text) {
  const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_key': NEYNAR_API_KEY,
    },
    body: JSON.stringify({
      signer_uuid: NEYNAR_SIGNER_UUID,
      text:        text,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Neynar API error ${response.status}: ${err}`);
  }

  return response.json();
}

// ─── Post ─────────────────────────────────────────────────────────────────────
async function post() {
  const state = await getState();
  const index = state.index % POSTS.length;
  const text  = POSTS[index];

  console.log(`[farcaster-bot] Posting item ${index + 1}/${POSTS.length}`);
  console.log(`[farcaster-bot] Preview: ${text.slice(0, 80).replace(/\n/g, ' ')}...`);

  try {
    const result = await castToFarcaster(text);
    const hash   = result?.cast?.hash || 'unknown';
    console.log(`[farcaster-bot] ✅ Cast posted: ${hash}`);
    await saveState({ index: index + 1 });
  } catch (err) {
    console.error(`[farcaster-bot] ❌ Error: ${err.message}`);
  }
}

// ─── Scheduler — daily at 12:00 UTC ──────────────────────────────────────────
function shouldPostNow() {
  const now  = new Date();
  const hour = now.getUTCHours();
  const min  = now.getUTCMinutes();
  return hour === 12 && min === 0;
}

setInterval(async () => {
  if (shouldPostNow()) {
    await post();
  }
}, 60 * 1000);

ensureStateTable().catch(e => console.error('[farcaster-bot] DB init failed:', e.message));
console.log('[farcaster-bot] Running — posts daily at 12:00 UTC');
console.log(`[farcaster-bot] Post bank: ${POSTS.length} posts (${Math.ceil(POSTS.length / 7)}-week rotation)`);
