// scripts/farcaster-bot.js
// AuthOnce Farcaster Bot
// Posts daily at 12:00 UTC via Neynar API
// 21-post bank — 3-week rotation, never repetitive
// Mix: builder updates, hot takes, funny, technical, questions, polls
//
// Railway env vars:
//   NEYNAR_API_KEY       — Neynar API key
//   NEYNAR_SIGNER_UUID   — Signer UUID for @authonce (FID: 3324301)
//   FARCASTER_FID        — AuthOnce FID (3324301)

const path = require('path');

const NEYNAR_API_KEY     = process.env.NEYNAR_API_KEY;
const NEYNAR_SIGNER_UUID = process.env.NEYNAR_SIGNER_UUID;

if (!NEYNAR_API_KEY)     throw new Error('NEYNAR_API_KEY not set');
if (!NEYNAR_SIGNER_UUID) throw new Error('NEYNAR_SIGNER_UUID not set');

// ─── State — PostgreSQL backed (survives Railway restarts) ───────────────────
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initStateTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

async function getState() {
  try {
    const res = await pool.query("SELECT value FROM bot_state WHERE key = 'farcaster-bot-index'");
    if (res.rows.length > 0) return { index: parseInt(res.rows[0].value, 10) };
  } catch (e) {
    console.error('[farcaster-bot] DB state read failed:', e.message);
  }
  return { index: 0 };
}

async function saveState(state) {
  try {
    await pool.query(
      "INSERT INTO bot_state (key, value) VALUES ('farcaster-bot-index', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [String(state.index)]
    );
  } catch (e) {
    console.error('[farcaster-bot] DB state save failed:', e.message);
  }
}

// ─── Post bank — 21 posts, 3-week rotation ────────────────────────────────────
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
Me: questionable 🤔

Building @authonce solo. Evenings and weekends.

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
15% — legal (MiCA, Portugal FinLab)
10% — operations

Solo founder. Swiss resident. Portugal incorporated.

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

initStateTable().catch(e => console.error('[farcaster-bot] DB init failed:', e.message));
console.log('[farcaster-bot] Running — posts daily at 12:00 UTC');
console.log(`[farcaster-bot] Post bank: ${POSTS.length} posts (${Math.ceil(POSTS.length / 7)}-week rotation)`);
