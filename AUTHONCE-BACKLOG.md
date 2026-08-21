# AuthOnce — Working Backlog

**How this file works, and why it exists:** CLAUDE-CORE.md is the historical record — it explains *why* things happened, session by session. This file is different on purpose: it's a flat, numbered list of *open* items only, nothing narrative. Work only comes from this list. An item doesn't leave this list until it's been verified closed with real evidence (on-chain read, live deploy check, actual test run) — not just "looks done."

**Session start ritual, going forward:**
1. Upload this file + `CLAUDE-CORE.md` at the start of every session.
2. Pick ONE item. Work it to done or to a clearly logged blocker.
3. If a new problem surfaces mid-task that isn't already on this list, STOP, add it here with a status, and explicitly decide: fix now, or log and return to the original item. Don't silently tunnel deeper.
4. Update this file's status column before ending the session. If a fix was made but not deployed/tested, it is NOT done — mark it "built, unverified."

**Status legend:** `OPEN` (not started) · `IN PROGRESS` · `BUILT, UNVERIFIED` (code written, not deployed/tested live) · `BLOCKED` (external dependency) · `DONE` (verified with evidence)

---

## PART 1 — Business / CEO (most important first)

| # | Item | Status | Next concrete action |
|---|------|--------|----------------------|
| B1 | Solo founder, full-time job, no team absorbing detours | OPEN, structural | Not "fixable" directly — this backlog + pre-flight discipline exists specifically to reduce the cost of this constraint |
| B2 | No co-founder | OPEN | Continue search; explicitly half the funding-ask use-of-funds |
| B3 | AuthOnce Lda. incorporation not done | OPEN | Empresa Online (~€180) — blocks most grant eligibility, do before chasing more grants |
| B4 | Audit vendor not decided — six competing offers on the table via Areta Market (June 30): Softstack $4,600, Hashlock $5,000, Beosin $8,000, Nethermind $9,000, Composable $11,000, Statemind $15,000. No firm engaged or accepted | OPEN — longest-idle item across many sessions | Decide and formally engage a vendor. Was pending an Areta EF subsidy reply — confirm status of that reply first. Primary mainnet cost blocker. |
| B5 | Safe multisig is only 2-of-2, no third signer | OPEN | Tonight (Aug 18) proved directly how fragile this is — one signer unreachable stalls everything. Recruit/designate a third signer. |
| B6 | No funding secured yet | BLOCKED (external) | Base Ecosystem Fund resubmitted, no reply. Circle Alliance needs mainnet traction. IAPMEI/Startup Portugal pending. Follow up on Base Fund if no reply by early Sept. |
| B7 | Public content overclaiming vs. actual architecture, repeated pattern | OPEN | `/docs` describes Stripe-shaped fiat flow + universal gasless permits (false — USDT has no permit support) + live-sounding paid tiers (tier→access not built). Needs a full content-accuracy pass, not a patch. |
| B8 | Zero organic discovery — authonce.io not indexed by Google at all | OPEN | `site:authonce.io` returns nothing. Check Search Console verification + crawl status + robots.txt/sitemap (needs manual check, not verifiable by Claude's tools) |

---

## PART 2 — Technical (most important first)

| # | Item | Status | Next concrete action |
|---|------|--------|----------------------|
| T1 | `keeper.js` polls every active subscription every 20s regardless of due date | BUILT, UNVERIFIED — DB pre-filter added (4h due window on `last_pulled_at`, Active only; NULL always included; Paused unfiltered). Also folded in a duplicate-fetch fix: `expireGracePeriodSubscriptions`'s separate, sequential `subscriptions()` call per id (same root cause) is now merged into `processOneSubscription`'s existing Paused branch, batched like pulls already are. | Deploy, then verify via Railway logs + Alchemy usage dashboard that `eth_call` volume actually drops. Not deployed or tested live yet. |
| T2 | `keeper.js` scheduler doesn't wait for previous cycle to finish (`setInterval`, not self-rescheduling) | BUILT, UNVERIFIED — switched to self-rescheduling `setTimeout`, matching `notifier.js`'s `poll()` pattern. | Deploy, then confirm in logs that cycles no longer overlap under load. Not deployed or tested live yet. |
| T3 | `notifier.js` proactive-notification loop is fully sequential, no batching | OPEN | Lower urgency than T1/T2. Revisit after T1 lands and real load-test numbers exist. |
| T4 | 100-transaction volume/load test still never completed | OPEN — blocked by a chain of smaller issues across multiple sessions | Do NOT resume until T1/T2 are fixed — testing on top of an unfixed cost/reliability bug wastes the test. Sequence: T1/T2 → RPC decision (see T5) → resume test. |
| T5 | No stable, decided RPC provider strategy | OPEN — re-litigated every session | Decide once: Alchemy paid tier (~$13.50/mo at current usage, will drop once T1 fixed) vs. another provider. Public endpoint has real outages, not a reliable fallback. |
| T6 | Recurring pattern: duplicate/conflicting "sources of truth" in the codebase | OPEN — found 3 instances without even looking systematically (dead `wagmiConfig`, DB-only merchant status vs. on-chain, MerchantRegistry vs. SubscriptionVault having different admins) | Worth one dedicated session doing a systematic hunt across the whole codebase, not just fixing them as they're tripped over |
| T7 | CDP faucet API broken — confirmed via Coinbase's own CLI, not a local bug | BLOCKED (external) | Needs an actual Coinbase CDP support ticket with the reproducible error + trace ID. Manual portal faucet works as a workaround meanwhile. |
| T8 | SaaS tier billing success doesn't grant dashboard tier access | OPEN — confirmed gap, not built | Real problem the moment anyone actually pays for Growth/Business. Needs design + build. |
| T9 | Misleading RPC error messages mask real reverts (recurring pattern, not one bug) | OPEN | Happened repeatedly: Safe permission checks, wrong Basescan field. Also open as a `PayPage.jsx` pre-flight-check item specifically. Worth a consistent pattern/fix across the app, not per-instance patches. |
| T10 | Merchant-list live on-chain status badge fix | BUILT, UNVERIFIED | Sitting as local unpushed diff in `AdminDashboard.jsx`. Next: `npm run build`, deploy, verify against a real merchant's `isApproved()` read on Basescan. |
| T11 | WooCommerce plugin cart/checkout annotation bug | OPEN — status unconfirmed recently | Check Console for JS error + inspect Store API response for `extensions.authonce` presence |
| T12 | `keeper_pull_attempts` — merchant-revocation no-auto-remediation decision | OPEN, undecided | When a merchant is revoked, `executePull()` hard-reverts silently forever. Decide: accept as-is, or build off-chain remediation. Flag to Hashlock as an audit design question either way. |
| T13 | Postgres autovacuum tuning | OPEN, not investigated | Carried across multiple sessions, no action taken yet |
| T14 | MerchantRegistry admin transfer to Safe (deferred to mainnet) | OPEN, deliberately deferred | **Do not confuse with SubscriptionVault's admin — that one is already the Safe, confirmed Aug 18.** This is a *different*, still-pending transfer, for a *different* contract. |
| T15 | `config.js` had a second, unused `wagmiConfig` export | ~~OPEN~~ **DONE** | Removed, deployed, commit `c79e32b` — kept here briefly as a closed example of the T6 pattern, remove from this list next session |
| T16 | `keeper.js`'s fixed per-cycle overhead (keeper/wallet/treasury balance checks) runs every 20s regardless of subscription count — ~17,280 calls/day at today's volume | OPEN, not started | Worth revisiting balance-check frequency separately from the due-date fix. |

---

*File created: 2026-08-20, from a full retrospective across this project's chat history. Update in place — don't let this drift back into narrative form.*
