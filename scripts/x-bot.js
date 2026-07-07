// x-bot.js — AuthOnce X Bot
// Posts Mon / Wed / Fri at 12:00 UTC
// Rotates 6 banners + matching post copy
// Requires: twitter-api-v2, sharp
// Railway env vars: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET

const { TwitterApi } = require('twitter-api-v2');
const sharp = require('sharp');

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new TwitterApi({
  appKey:            process.env.TWITTER_API_KEY,
  appSecret:         process.env.TWITTER_API_SECRET,
  accessToken:       process.env.TWITTER_ACCESS_TOKEN,
  accessSecret:      process.env.TWITTER_ACCESS_TOKEN_SECRET,
}).readWrite;

// ─── Post rotation ────────────────────────────────────────────────────────────
// 15 posts — repeats every 5 weeks (Mon/Wed/Fri = 3 posts/week)
// 6 with banners, 6 text-only (text-only often gets better reach on X)
// banner: null = text-only post, no image uploaded
const POSTS = [
  // 1 — Hot take, text-only
  {
    text: `Hot take: crypto subscriptions failed because everyone tried to stream payments.

Streaming is great for yield. Terrible for subscriptions.

A subscription is a promise: pull exactly this amount, on this date, every cycle.

That needs a keeper, not a stream.

@base got this right. We built on it.

#DeFi #Base #Web3`,
    banner: null,
  },
  // 2 — Question, drives replies
  {
    text: `Question for crypto users:

If you paid for a Web3 subscription and the merchant disappeared — what happens to your funds?

With most protocols: locked in escrow nobody controls.

With @AuthOnce: vault is yours. Cancel anytime. Merchant cannot touch it.

How should Web3 subscriptions handle this? 👇

#DeFi #Base #USDC @base`,
    banner: null,
  },
  // 3 — How it works, with banner
  {
    text: `Web3 subscriptions are broken.

Merchants chase failed payments. Subscribers can\'t verify pulls. Nobody ships reliable recurring crypto payments.

We did — on @base.

Authorize once. Pay forever. Stay in control.

authonce.io

#DeFi #USDC #Base #Web3`,
    banner: 'banner_1_vault_flow',
  },
  // 4 — Build in public, text-only
  {
    text: `Building @AuthOnce in public. Here\'s where we are:

✅ Smart contracts live on @base Sepolia
✅ Keeper bot running 24/7
✅ Stripe fiat onramp live
✅ USDC · USDT · EURC supported
✅ Google OAuth subscriber portal
⏳ Smart contract audit — in progress
⏳ Mainnet — Q3 2026

Solo founder. Moving fast.

What would you ship first? 👇

#BuildInPublic #Base #DeFi`,
    banner: null,
  },
  // 5 — Fee comparison, with banner
  {
    text: `0.5% flat fee. Hardcoded on-chain.

We cannot raise it. Ever.

The contract enforces a one-way ratchet — fees can only go down, never up.

Most Web3 payment protocols: variable or tiered fees.
AuthOnce: 0.5% flat. Same for every merchant, every token, every tier.

Only charged on success. Failed pull = zero fee.

authonce.io

#DeFi #USDC #Base @base`,
    banner: 'banner_2_fee',
  },
  // 6 — AI agents, question, text-only
  {
    text: `AI agents will need to pay for subscriptions autonomously.

An agent that pays for its own API access, renews its own tools, manages its own recurring costs — no human in the loop.

This needs ERC-1271. @AuthOnce supports it natively on @base.

Which AI agent frameworks are you most excited about? 👇

#AI #DeFi #Base @coinbase`,
    banner: null,
  },
  // 7 — Pain points vs Web2, with banner
  {
    text: `Web2 subscription billing gives you 5 problems.

AuthOnce removes all five.

No card storage. No chargeback disputes. No manual dunning. On-chain price change notice enforced. Subscribers can verify every pull.

This is what recurring payments look like rebuilt from scratch.

authonce.io

#Web3 #DeFi #Base @base`,
    banner: 'banner_3_pain',
  },
  // 8 — Educational thread-style, text-only
  {
    text: `Why non-custodial matters for subscription payments:

1/ Most crypto payment protocols hold your funds in escrow. That makes them a custodian. Custodians need licences.

2/ AuthOnce never holds funds. Tokens move directly: subscriber → merchant in one atomic on-chain transaction.

3/ This eliminates: custodian licence requirements, counterparty risk, and an entire class of UX complexity.

Non-custodial is not a marketing word. It\'s a legal and architectural decision.

#DeFi #Base #USDC @base`,
    banner: null,
  },
  // 13 — Takes, text-only
  {
    text: `Web3 payments don\'t need a better token.

They need better plumbing.

A keeper bot that retries. A grace period that recovers. A vault the subscriber owns. Webhooks the merchant can trust.

Infrastructure is unsexy. Infrastructure is what ships.

#DeFi #Base @base`,
    banner: null,
  },
  // 14 — Technical, text-only
  {
    text: `Price changes in Web2: update a field in Stripe. Done.

Price changes in @AuthOnce: merchant calls setProductExpiry(). 30-day countdown starts on-chain. Subscriber gets notified. Can cancel before it kicks in.

More friction for the merchant. More protection for the subscriber.

That trade-off is intentional.

#DeFi #Base #USDC`,
    banner: null,
  },
  // 15 — Question, text-only
  {
    text: `What would make you switch your SaaS from Stripe to crypto subscriptions?

a) Lower fees
b) No chargebacks
c) Global subscribers, no card required
d) On-chain revenue verification for investors

Building @AuthOnce for all four. Curious which one actually matters to founders.

#SaaS #DeFi #Base @base`,
    banner: null,
  },
  // 9 — Non-custodial, with banner
  {
    text: `The protocol never holds funds.

Not for a second. Not in escrow. Not in a buffer.

Funds move directly: subscriber → merchant.

This is why we need no custodian licence. Non-custodial by design — locked into the architecture forever.

authonce.io

#DeFi #USDC #Base #Web3 @base @jessepollak`,
    banner: 'banner_4_noncustodial',
  },
  // 10 — Unpopular opinion, drives engagement, text-only
  {
    text: `Unpopular opinion:

Most Web3 payment projects are not solving payments. They\'re solving token distribution with a payments UI.

Real recurring payments need:
— Exact amounts (not streams)
— Grace periods (not instant cuts)
— Subscriber control (not merchant control)
— On-chain dunning (not Zapier)

Very few have all four.

What am I missing? 👇

#DeFi #Web3 #Base @base`,
    banner: null,
  },
  // 11 — Grace period / dunning, with banner
  {
    text: `Failed payment ≠ lost subscriber.

Most protocols cancel instantly on failure.

AuthOnce gives merchants a programmable 1–30 day grace period. Keeper retries daily. Subscriber gets notified. Most recover.

Dunning logic. On-chain. No Zapier. No manual intervention.

authonce.io

#DeFi #Base #USDC @base`,
    banner: 'banner_5_grace',
  },
  // 12 — Poll / multi-token, with banner
  {
    text: `Quick question for the crypto community:

If you paid for a recurring subscription in crypto, which stablecoin would you use?

🔵 USDC
🟢 USDT
🔴 EURC

AuthOnce supports all three. Subscriber picks at signup.

Drop your answer below 👇

authonce.io

#DeFi #Base #USDC @base @coinbase`,
    banner: 'banner_6_multitoken',
  },
];

// ─── SVG banners (inline — each is the full SVG string) ──────────────────────
const BANNERS = {
  banner_1_vault_flow: `<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="675" fill="#f4f6fb"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="225" x2="1200" y2="225"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="450" x2="1200" y2="450"/><line stroke="#e8edf6" stroke-width="1" x1="400" y1="0" x2="400" y2="675"/><line stroke="#e8edf6" stroke-width="1" x1="800" y1="0" x2="800" y2="675"/><rect fill="#fff" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="none" stroke="#e2e8f4" stroke-width="1.5" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="#2563ff" x="60" y="52" width="6" height="570" rx="3"/><text font-family="Arial,sans-serif" font-size="17" fill="#2563ff" letter-spacing="3" x="102" y="118">// PROTOCOL MECHANIC</text><text font-family="Arial Black,sans-serif" font-size="72" fill="#0f1624" font-weight="900" x="98" y="210">How it works.</text><text font-family="Arial,sans-serif" font-size="18" fill="#8896b3" x="102" y="252">One authorization. Exact amount. Every cycle.</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="278" x2="1118" y2="278"/><rect fill="#f0f4ff" x="102" y="305" width="180" height="100" rx="12"/><rect fill="none" stroke="#2563ff" stroke-width="1.5" x="102" y="305" width="180" height="100" rx="12"/><text font-family="Arial Black,sans-serif" font-size="20" fill="#0f1624" font-weight="900" x="192" y="350" text-anchor="middle">Subscriber</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="192" y="372" text-anchor="middle">authorizes once</text><line stroke="#2563ff" stroke-width="2" x1="290" y1="355" x2="348" y2="355" marker-end="url(#a1)"/><rect fill="#f0f4ff" x="356" y="305" width="180" height="100" rx="12"/><rect fill="none" stroke="#2563ff" stroke-width="2.5" x="356" y="305" width="180" height="100" rx="12"/><text font-family="Arial Black,sans-serif" font-size="20" fill="#0f1624" font-weight="900" x="446" y="345" text-anchor="middle">Vault</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="446" y="365" text-anchor="middle">funded 1x per cycle</text><text font-family="Arial,sans-serif" font-size="13" fill="#059669" x="446" y="384" text-anchor="middle">exact amount only</text><line stroke="#2563ff" stroke-width="2" x1="544" y1="355" x2="602" y2="355" marker-end="url(#a1)"/><rect fill="#f0f4ff" x="610" y="305" width="180" height="100" rx="12"/><rect fill="none" stroke="#2563ff" stroke-width="1.5" x="610" y="305" width="180" height="100" rx="12"/><text font-family="Arial Black,sans-serif" font-size="20" fill="#0f1624" font-weight="900" x="700" y="350" text-anchor="middle">Keeper</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="700" y="372" text-anchor="middle">executes pull</text><line stroke="#2563ff" stroke-width="2" x1="798" y1="355" x2="856" y2="355" marker-end="url(#a1)"/><rect fill="#f0f4ff" x="864" y="305" width="180" height="100" rx="12"/><rect fill="none" stroke="#2563ff" stroke-width="1.5" x="864" y="305" width="180" height="100" rx="12"/><text font-family="Arial Black,sans-serif" font-size="20" fill="#0f1624" font-weight="900" x="954" y="350" text-anchor="middle">Merchant</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="954" y="372" text-anchor="middle">receives USDC</text><path d="M954 405 Q954 460 700 460 Q446 460 192 460 Q130 460 130 420 L130 405" fill="none" stroke="#c7d4f5" stroke-width="1.5" stroke-dasharray="6 4"/><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="600" y="452" text-anchor="middle">repeats every billing cycle</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="490" x2="1118" y2="490"/><text font-family="Arial,sans-serif" font-size="14" fill="#059669" x="102" y="520">✓ Protocol never holds funds</text><text font-family="Arial,sans-serif" font-size="14" fill="#059669" x="102" y="542">✓ No over-funding, no refund UX</text><text font-family="Arial,sans-serif" font-size="14" fill="#2563ff" x="700" y="520">✓ Subscriber cancels anytime</text><text font-family="Arial,sans-serif" font-size="14" fill="#2563ff" x="700" y="542">✓ 0.5% fee — only on success</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="560" x2="1118" y2="560"/><text font-family="Arial Black,sans-serif" font-size="18" fill="#2563ff" font-weight="900" x="1118" y="594" text-anchor="end">authonce.io</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="102" y="594">Base Network · USDC · USDT · EURC</text><defs><marker id="a1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#2563ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs></svg>`,

  banner_2_fee: `<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="675" fill="#f4f6fb"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="225" x2="1200" y2="225"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="450" x2="1200" y2="450"/><line stroke="#e8edf6" stroke-width="1" x1="400" y1="0" x2="400" y2="675"/><line stroke="#e8edf6" stroke-width="1" x1="800" y1="0" x2="800" y2="675"/><rect fill="#fff" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="none" stroke="#e2e8f4" stroke-width="1.5" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="#2563ff" x="60" y="52" width="6" height="570" rx="3"/><text font-family="Arial,sans-serif" font-size="17" fill="#2563ff" letter-spacing="3" x="102" y="118">// PRICING</text><text font-family="Arial Black,sans-serif" font-size="180" fill="#2563ff" font-weight="900" opacity=".08" x="500" y="420" text-anchor="middle">0.5%</text><text font-family="Arial Black,sans-serif" font-size="120" fill="#2563ff" font-weight="900" x="102" y="310">0.5%</text><text font-family="Arial,sans-serif" font-size="22" fill="#8896b3" x="102" y="348">protocol fee — forever.</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="374" x2="600" y2="374"/><text font-family="Arial,sans-serif" font-size="16" fill="#0f1624" x="102" y="408">Same fee for every merchant</text><text font-family="Arial Black,sans-serif" font-size="16" fill="#059669" font-weight="900" x="102" y="430">✓ Starter · Growth · Business · Enterprise</text><text font-family="Arial,sans-serif" font-size="16" fill="#0f1624" x="102" y="460">Same fee for every token</text><text font-family="Arial Black,sans-serif" font-size="16" fill="#059669" font-weight="900" x="102" y="482">✓ USDC · USDT · EURC</text><text font-family="Arial,sans-serif" font-size="16" fill="#0f1624" x="102" y="512">Only charged on success</text><text font-family="Arial Black,sans-serif" font-size="16" fill="#059669" font-weight="900" x="102" y="534">✓ Failed pull = zero fee</text><rect fill="#f8faff" x="650" y="290" width="468" height="270" rx="14"/><rect fill="none" stroke="#e2e8f4" stroke-width="1.5" x="650" y="290" width="468" height="270" rx="14"/><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" letter-spacing="2" x="884" y="322" text-anchor="middle">HOW WE COMPARE</text><line stroke="#e2e8f4" stroke-width="1" x1="670" y1="334" x2="1098" y2="334"/><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="670" y="356">Platform</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="980" y="356" text-anchor="end">Fee</text><text font-family="Arial,sans-serif" font-size="15" fill="#0f1624" x="670" y="386">Stripe Billing</text><text font-family="Arial Black,sans-serif" font-size="15" fill="#dc2626" font-weight="900" x="980" y="386" text-anchor="end">0.5% + 0.7%</text><line stroke="#e2e8f4" stroke-width="1" x1="670" y1="398" x2="1098" y2="398"/><text font-family="Arial,sans-serif" font-size="15" fill="#0f1624" x="670" y="422">Superfluid</text><text font-family="Arial Black,sans-serif" font-size="15" fill="#dc2626" font-weight="900" x="980" y="422" text-anchor="end">variable</text><line stroke="#e2e8f4" stroke-width="1" x1="670" y1="434" x2="1098" y2="434"/><text font-family="Arial,sans-serif" font-size="15" fill="#0f1624" x="670" y="458">Unlock Protocol</text><text font-family="Arial Black,sans-serif" font-size="15" fill="#dc2626" font-weight="900" x="980" y="458" text-anchor="end">1-2%</text><line stroke="#e2e8f4" stroke-width="1" x1="670" y1="470" x2="1098" y2="470"/><rect fill="#f0f4ff" x="660" y="480" width="448" height="62" rx="8"/><text font-family="Arial Black,sans-serif" font-size="15" fill="#0f1624" font-weight="900" x="670" y="508">AuthOnce</text><text font-family="Arial Black,sans-serif" font-size="22" fill="#2563ff" font-weight="900" x="980" y="512" text-anchor="end">0.5% flat</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="980" y="530" text-anchor="end">hardcoded on-chain</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="560" x2="1118" y2="560"/><text font-family="Arial Black,sans-serif" font-size="18" fill="#2563ff" font-weight="900" x="1118" y="594" text-anchor="end">authonce.io</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="102" y="594">Base Network · Non-custodial</text></svg>`,

  banner_3_pain: `<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="675" fill="#f4f6fb"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="225" x2="1200" y2="225"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="450" x2="1200" y2="450"/><line stroke="#e8edf6" stroke-width="1" x1="400" y1="0" x2="400" y2="675"/><line stroke="#e8edf6" stroke-width="1" x1="800" y1="0" x2="800" y2="675"/><rect fill="#fff" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="none" stroke="#e2e8f4" stroke-width="1.5" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="#2563ff" x="60" y="52" width="6" height="570" rx="3"/><text font-family="Arial,sans-serif" font-size="17" fill="#2563ff" letter-spacing="3" x="102" y="118">// MERCHANT BENEFITS</text><text font-family="Arial Black,sans-serif" font-size="64" fill="#0f1624" font-weight="900" x="98" y="200">Web2 billing is broken.</text><text font-family="Arial,sans-serif" font-size="19" fill="#8896b3" x="102" y="238">Here is what you stop dealing with.</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="260" x2="1118" y2="260"/><rect fill="#fff5f5" x="102" y="275" width="468" height="44" rx="10"/><rect fill="none" stroke="#fecaca" stroke-width="1.5" x="102" y="275" width="468" height="44" rx="10"/><text font-family="Arial Black,sans-serif" font-size="18" fill="#dc2626" font-weight="900" x="336" y="303" text-anchor="middle">Traditional billing</text><rect fill="#f0fdf4" x="630" y="275" width="488" height="44" rx="10"/><rect fill="none" stroke="#86efac" stroke-width="1.5" x="630" y="275" width="488" height="44" rx="10"/><text font-family="Arial Black,sans-serif" font-size="18" fill="#059669" font-weight="900" x="874" y="303" text-anchor="middle">AuthOnce</text><text font-family="Arial Black,sans-serif" font-size="28" fill="#8896b3" font-weight="900" x="596" y="305" text-anchor="middle">vs</text><text font-family="Arial,sans-serif" font-size="15" fill="#dc2626" x="118" y="352">✗  Store card numbers (PCI scope)</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="646" y="352">✓  No card data. Ever.</text><text font-family="Arial,sans-serif" font-size="15" fill="#dc2626" x="118" y="392">✗  Chase failed payments manually</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="646" y="392">✓  7-day grace + auto retry</text><text font-family="Arial,sans-serif" font-size="15" fill="#dc2626" x="118" y="432">✗  Refund disputes + chargebacks</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="646" y="432">✓  No balance, no refund UX</text><text font-family="Arial,sans-serif" font-size="15" fill="#dc2626" x="118" y="472">✗  Subscriber cannot verify pull</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="646" y="472">✓  On-chain — fully auditable</text><text font-family="Arial,sans-serif" font-size="15" fill="#dc2626" x="118" y="512">✗  Price change = legal notice + churn</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="646" y="512">✓  30-day on-chain notice enforced</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="536" x2="1118" y2="536"/><text font-family="Arial Black,sans-serif" font-size="18" fill="#2563ff" font-weight="900" x="1118" y="594" text-anchor="end">authonce.io</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="102" y="570">Recurring payments · Base Network · USDC</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="102" y="594">0.5% flat fee · Non-custodial</text></svg>`,

  banner_4_noncustodial: `<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="675" fill="#f4f6fb"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="225" x2="1200" y2="225"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="450" x2="1200" y2="450"/><line stroke="#e8edf6" stroke-width="1" x1="400" y1="0" x2="400" y2="675"/><line stroke="#e8edf6" stroke-width="1" x1="800" y1="0" x2="800" y2="675"/><rect fill="#fff" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="none" stroke="#e2e8f4" stroke-width="1.5" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="#2563ff" x="60" y="52" width="6" height="570" rx="3"/><text font-family="Arial,sans-serif" font-size="17" fill="#2563ff" letter-spacing="3" x="102" y="118">// NON-CUSTODIAL DESIGN</text><text font-family="Arial Black,sans-serif" font-size="72" fill="#0f1624" font-weight="900" x="98" y="210">Protocol never</text><text font-family="Arial Black,sans-serif" font-size="72" fill="#0f1624" font-weight="900" x="98" y="298">holds <tspan fill="#059669">funds.</tspan></text><text font-family="Arial,sans-serif" font-size="18" fill="#8896b3" x="102" y="338">This is the foundational rule. It cannot be changed.</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="362" x2="1118" y2="362"/><rect fill="#f0f4ff" x="102" y="382" width="310" height="140" rx="12"/><rect fill="none" stroke="#c7d4f5" stroke-width="1.5" x="102" y="382" width="310" height="140" rx="12"/><text font-family="Arial Black,sans-serif" font-size="22" fill="#0f1624" font-weight="900" x="257" y="420" text-anchor="middle">No custody</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="257" y="444" text-anchor="middle">Funds move directly</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="257" y="462" text-anchor="middle">subscriber to merchant</text><text font-family="Arial,sans-serif" font-size="13" fill="#2563ff" x="257" y="490" text-anchor="middle">FINMA licence not required</text><rect fill="#f0f4ff" x="445" y="382" width="310" height="140" rx="12"/><rect fill="none" stroke="#c7d4f5" stroke-width="1.5" x="445" y="382" width="310" height="140" rx="12"/><text font-family="Arial Black,sans-serif" font-size="22" fill="#0f1624" font-weight="900" x="600" y="420" text-anchor="middle">No balance</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="600" y="444" text-anchor="middle">Vault funded exactly 1x</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="600" y="462" text-anchor="middle">per billing cycle</text><text font-family="Arial,sans-serif" font-size="13" fill="#2563ff" x="600" y="490" text-anchor="middle">Zero refund complexity</text><rect fill="#f0f4ff" x="788" y="382" width="310" height="140" rx="12"/><rect fill="none" stroke="#c7d4f5" stroke-width="1.5" x="788" y="382" width="310" height="140" rx="12"/><text font-family="Arial Black,sans-serif" font-size="22" fill="#0f1624" font-weight="900" x="943" y="420" text-anchor="middle">Full control</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="943" y="444" text-anchor="middle">Subscriber cancels</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="943" y="462" text-anchor="middle">anytime, on-chain</text><text font-family="Arial,sans-serif" font-size="13" fill="#2563ff" x="943" y="490" text-anchor="middle">Merchant cannot block</text><rect fill="#f0fdf4" x="102" y="542" width="200" height="30" rx="8"/><rect fill="none" stroke="#86efac" stroke-width="1.5" x="102" y="542" width="200" height="30" rx="8"/><text font-family="Arial,sans-serif" font-size="13" fill="#065f46" x="202" y="562" text-anchor="middle">Open source · BSL 1.1</text><rect fill="#f0fdf4" x="316" y="542" width="200" height="30" rx="8"/><rect fill="none" stroke="#86efac" stroke-width="1.5" x="316" y="542" width="200" height="30" rx="8"/><text font-family="Arial,sans-serif" font-size="13" fill="#065f46" x="416" y="562" text-anchor="middle">Audit in progress — Q3 2026</text><rect fill="#f0fdf4" x="530" y="542" width="200" height="30" rx="8"/><rect fill="none" stroke="#86efac" stroke-width="1.5" x="530" y="542" width="200" height="30" rx="8"/><text font-family="Arial,sans-serif" font-size="13" fill="#065f46" x="630" y="562" text-anchor="middle">Base Network · EIP-712</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="586" x2="1118" y2="586"/><text font-family="Arial Black,sans-serif" font-size="18" fill="#2563ff" font-weight="900" x="1118" y="616" text-anchor="end">authonce.io</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="102" y="616">Authorize once. Pay forever. Stay in control.</text></svg>`,

  banner_5_grace: `<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ag5" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#2563ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs><rect width="1200" height="675" fill="#f4f6fb"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="225" x2="1200" y2="225"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="450" x2="1200" y2="450"/><line stroke="#e8edf6" stroke-width="1" x1="400" y1="0" x2="400" y2="675"/><line stroke="#e8edf6" stroke-width="1" x1="800" y1="0" x2="800" y2="675"/><rect fill="#fff" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="none" stroke="#e2e8f4" stroke-width="1.5" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="#2563ff" x="60" y="52" width="6" height="570" rx="3"/><text font-family="Arial,sans-serif" font-size="17" fill="#2563ff" letter-spacing="3" x="102" y="118">// DUNNING LAYER</text><text font-family="Arial Black,sans-serif" font-size="68" fill="#0f1624" font-weight="900" x="98" y="205">Failed payment?</text><text font-family="Arial Black,sans-serif" font-size="68" fill="#0f1624" font-weight="900" x="98" y="285">We <tspan fill="#2563ff">recover</tspan> it.</text><text font-family="Arial,sans-serif" font-size="18" fill="#8896b3" x="102" y="322">Programmable 1-30 day grace period. Keeper retries daily.</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="346" x2="1118" y2="346"/><line stroke="#e2e8f4" stroke-width="3" x1="140" y1="420" x2="1080" y2="420"/><circle fill="#2563ff" cx="140" cy="420" r="14"/><text font-family="Arial Black,sans-serif" font-size="14" fill="#2563ff" font-weight="900" x="140" y="395" text-anchor="middle">Day 0</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="140" y="450" text-anchor="middle">Due date</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="140" y="465" text-anchor="middle">pull attempted</text><circle fill="#f59e0b" cx="340" cy="420" r="14"/><text font-family="Arial Black,sans-serif" font-size="14" fill="#f59e0b" font-weight="900" x="340" y="395" text-anchor="middle">Day 1</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="340" y="450" text-anchor="middle">Retry + notify</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="340" y="465" text-anchor="middle">subscriber</text><circle fill="#f59e0b" cx="540" cy="420" r="14"/><text font-family="Arial Black,sans-serif" font-size="14" fill="#f59e0b" font-weight="900" x="540" y="395" text-anchor="middle">Day 3</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="540" y="450" text-anchor="middle">Warning email</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="540" y="465" text-anchor="middle">grace expiring</text><circle fill="#f59e0b" cx="740" cy="420" r="14"/><text font-family="Arial Black,sans-serif" font-size="14" fill="#f59e0b" font-weight="900" x="740" y="395" text-anchor="middle">Day 5</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="740" y="450" text-anchor="middle">Final retry</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="740" y="465" text-anchor="middle">attempt</text><circle fill="#f0fdf4" stroke="#86efac" stroke-width="2" cx="940" cy="420" r="14"/><text font-family="Arial Black,sans-serif" font-size="14" fill="#059669" font-weight="900" x="940" y="395" text-anchor="middle">Resolved</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="940" y="450" text-anchor="middle">payment recovered</text><text font-family="Arial,sans-serif" font-size="12" fill="#059669" x="940" y="465" text-anchor="middle">subscription continues</text><circle fill="#fff5f5" stroke="#fecaca" stroke-width="2" cx="1080" cy="420" r="14"/><text font-family="Arial Black,sans-serif" font-size="14" fill="#dc2626" font-weight="900" x="1080" y="395" text-anchor="middle">Day 7+</text><text font-family="Arial,sans-serif" font-size="12" fill="#8896b3" x="1080" y="450" text-anchor="middle">Grace expired</text><text font-family="Arial,sans-serif" font-size="12" fill="#dc2626" x="1080" y="465" text-anchor="middle">sub cancelled</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="495" x2="1118" y2="495"/><text font-family="Arial,sans-serif" font-size="15" fill="#2563ff" x="102" y="528">✓ Grace period configurable per subscription (1-30 days)</text><text font-family="Arial,sans-serif" font-size="15" fill="#2563ff" x="102" y="554">✓ Subscriber notified 3 days before every scheduled payment</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="102" y="580">✓ Merchant receives webhook on every state change</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="598" x2="1118" y2="598"/><text font-family="Arial Black,sans-serif" font-size="18" fill="#2563ff" font-weight="900" x="1118" y="626" text-anchor="end">authonce.io</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="102" y="626">Base Network · Non-custodial</text></svg>`,

  banner_6_multitoken: `<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="675" fill="#f4f6fb"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="225" x2="1200" y2="225"/><line stroke="#e8edf6" stroke-width="1" x1="0" y1="450" x2="1200" y2="450"/><line stroke="#e8edf6" stroke-width="1" x1="400" y1="0" x2="400" y2="675"/><line stroke="#e8edf6" stroke-width="1" x1="800" y1="0" x2="800" y2="675"/><rect fill="#fff" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="none" stroke="#e2e8f4" stroke-width="1.5" x="60" y="52" width="1080" height="570" rx="20"/><rect fill="#2563ff" x="60" y="52" width="6" height="570" rx="3"/><text font-family="Arial,sans-serif" font-size="17" fill="#2563ff" letter-spacing="3" x="102" y="118">// MULTI-TOKEN</text><text font-family="Arial Black,sans-serif" font-size="72" fill="#0f1624" font-weight="900" x="98" y="205">Three stablecoins.</text><text font-family="Arial Black,sans-serif" font-size="72" fill="#0f1624" font-weight="900" x="98" y="285">One <tspan fill="#2563ff">protocol.</tspan></text><text font-family="Arial,sans-serif" font-size="17" fill="#8896b3" x="102" y="320">Subscriber picks their token at signup. Locked for the life of the subscription.</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="344" x2="1118" y2="344"/><rect fill="#f8faff" x="102" y="364" width="236" height="130" rx="14"/><rect fill="none" stroke="#2775ca" stroke-width="2" x="102" y="364" width="236" height="130" rx="14"/><text font-family="Arial Black,sans-serif" font-size="28" fill="#2775ca" font-weight="900" x="220" y="415" text-anchor="middle">USDC</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="220" y="438" text-anchor="middle">USD Coin</text><text font-family="Arial,sans-serif" font-size="13" fill="#2775ca" x="220" y="462" text-anchor="middle">Circle · Base native</text><text font-family="Arial,sans-serif" font-size="12" fill="#2775ca" x="220" y="482" text-anchor="middle">Most liquid</text><rect fill="#f8faff" x="356" y="364" width="236" height="130" rx="14"/><rect fill="none" stroke="#26a17b" stroke-width="2" x="356" y="364" width="236" height="130" rx="14"/><text font-family="Arial Black,sans-serif" font-size="28" fill="#26a17b" font-weight="900" x="474" y="415" text-anchor="middle">USDT</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="474" y="438" text-anchor="middle">Tether USD</text><text font-family="Arial,sans-serif" font-size="13" fill="#26a17b" x="474" y="462" text-anchor="middle">Tether · Base</text><text font-family="Arial,sans-serif" font-size="12" fill="#26a17b" x="474" y="482" text-anchor="middle">Highest volume</text><rect fill="#f8faff" x="610" y="364" width="236" height="130" rx="14"/><rect fill="none" stroke="#2563ff" stroke-width="2" x="610" y="364" width="236" height="130" rx="14"/><text font-family="Arial Black,sans-serif" font-size="28" fill="#2563ff" font-weight="900" x="728" y="415" text-anchor="middle">EURC</text><text font-family="Arial,sans-serif" font-size="14" fill="#8896b3" x="728" y="438" text-anchor="middle">Euro Coin</text><text font-family="Arial,sans-serif" font-size="13" fill="#2563ff" x="728" y="462" text-anchor="middle">Circle · EUR-pegged</text><text font-family="Arial,sans-serif" font-size="12" fill="#2563ff" x="728" y="482" text-anchor="middle">European merchants</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="512" x2="1118" y2="512"/><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="102" y="542">✓ Token set at signup — immutable per subscription</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="102" y="566">✓ All tokens available on all merchant tiers</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="600" y="542">✓ WETH / cbBTC coming in v6 (Chainlink oracle)</text><text font-family="Arial,sans-serif" font-size="15" fill="#059669" x="600" y="566">✓ Merchant receives exact token subscriber chose</text><line stroke="#e2e8f4" stroke-width="1.5" x1="102" y1="582" x2="1118" y2="582"/><text font-family="Arial Black,sans-serif" font-size="18" fill="#2563ff" font-weight="900" x="1118" y="614" text-anchor="end">authonce.io</text><text font-family="Arial,sans-serif" font-size="13" fill="#8896b3" x="102" y="614">Base Network · Non-custodial · 0.5% flat fee</text></svg>`,
};

// ─── State — PostgreSQL backed (survives Railway restarts) ───────────────────
// Falls back to index 0 if DB not available.
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
    const res = await pool.query("SELECT value FROM bot_state WHERE key = 'x-bot-index'");
    if (res.rows.length > 0) return { index: parseInt(res.rows[0].value, 10) };
  } catch (e) {
    console.error('[x-bot] DB state read failed:', e.message);
  }
  return { index: 0 };
}

async function saveState(state) {
  try {
    await pool.query(
      "INSERT INTO bot_state (key, value) VALUES ('x-bot-index', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [String(state.index)]
    );
  } catch (e) {
    console.error('[x-bot] DB state save failed:', e.message);
  }
}

// ─── SVG → PNG buffer via sharp ───────────────────────────────────────────────
async function svgToPng(svgString) {
  return sharp(Buffer.from(svgString)).png().toBuffer();
}

// ─── Post ─────────────────────────────────────────────────────────────────────
async function post() {
  const state = await getState();
  const item = POSTS[state.index % POSTS.length];

  console.log(`[x-bot] Posting item ${state.index % POSTS.length}: ${item.banner || 'text-only'}`);

  // Advance index BEFORE posting — prevents stuck rotation if tweet fails
  await saveState({ index: (state.index + 1) % POSTS.length });

  try {
    let tweet;

    if (item.banner && BANNERS[item.banner]) {
      // Image post
      const pngBuffer = await svgToPng(BANNERS[item.banner]);
      const mediaId   = await client.v1.uploadMedia(pngBuffer, { mimeType: 'image/png' });
      tweet = await client.v2.tweet({
        text: item.text,
        media: { media_ids: [mediaId] },
      });
    } else {
      // Text-only post
      tweet = await client.v2.tweet({ text: item.text });
    }

    console.log(`[x-bot] Posted: https://x.com/AuthOnce/status/${tweet.data.id}`);

  } catch (err) {
    console.error('[x-bot] Error:', err?.data || err.message);
    // Index already advanced — next scheduled post will use the next item
  }
}

// ─── Scheduler — Mon/Wed/Fri 12:00 UTC ───────────────────────────────────────
let posting = false;

async function getLastPostedDate() {
  try {
    const res = await pool.query("SELECT value FROM bot_state WHERE key = 'x-bot-last-date'");
    if (res.rows.length > 0) return res.rows[0].value; // 'YYYY-MM-DD'
  } catch (e) {
    console.error('[x-bot] DB last-date read failed:', e.message);
  }
  return null;
}

async function saveLastPostedDate(dateStr) {
  try {
    await pool.query(
      "INSERT INTO bot_state (key, value) VALUES ('x-bot-last-date', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [dateStr]
    );
  } catch (e) {
    console.error('[x-bot] DB last-date save failed:', e.message);
  }
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function shouldPostNow() {
  const now = new Date();
  const day  = now.getUTCDay();   // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  const hour = now.getUTCHours();
  const min  = now.getUTCMinutes();
  return (day === 1 || day === 3 || day === 5) && hour === 12 && min === 0;
}

// Check every minute
setInterval(async () => {
  if (!shouldPostNow()) return;
  if (posting) return; // in-process concurrent execution guard

  const today    = todayUTC();
  const lastDate = await getLastPostedDate();
  if (lastDate === today) {
    console.log(`[x-bot] Already posted today (${today}), skipping.`);
    return;
  }

  posting = true;
  try {
    await post();
    await saveLastPostedDate(today);
  } finally {
    posting = false;
  }
}, 60 * 1000);

initStateTable().catch(e => console.error('[x-bot] DB init failed:', e.message));
console.log('[x-bot] Running — posts Mon/Wed/Fri 12:00 UTC');
