// frontend/src/lib/contractErrors.js
//
// [T9] Shared helper for a recurring problem across this app: a contract
// write that will genuinely revert (wrong wallet, access control, a business
// logic check failing) often gets reported by the RPC provider as a generic,
// misleading "exceeds max transaction gas limit" error from gas estimation,
// instead of the real revert reason. This has bitten real testing sessions
// more than once (Safe permission checks, a misconnected admin wallet,
// T36's unapproved-merchant case) and was logged as its own backlog item
// (T9) specifically because it's a pattern, not a one-off bug.
//
// Fix: simulate the call first via eth_call (publicClient.simulateContract),
// which reliably returns the actual decoded revert reason — viem parses this
// into a clean shortMessage, e.g. naming the real custom error. Only if
// simulation succeeds do we send the real transaction. If simulation itself
// throws, that thrown message is what the user sees, instead of whatever the
// subsequent send attempt's gas estimation would have said.
//
// This does not change what reverts or does not revert on-chain — it only
// changes what the UI tells the user about why.
//
// Rolling out one call site at a time (starting with PayPage.jsx's
// createSubscription call), each verified behaviorally against a real
// revert, not applied as a blanket find-and-replace across the app.

export async function simulateAndWrite(publicClient, writeContractAsync, config) {
  try {
    await publicClient.simulateContract(config);
  } catch (simErr) {
    throw new Error(simErr.shortMessage || simErr.message || "This transaction would fail.");
  }
  return writeContractAsync(config);
}
