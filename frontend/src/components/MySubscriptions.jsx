// src/components/MySubscriptions.jsx
// Standalone subscriber portal — authonce.io/my-subscriptions
//
// Two login paths:
//   Type A — Crypto-native: connect wallet → read subscriptions for that address
//   Type B — Fiat/custodied: sign in with Google → lookup custodied wallet
//
// Features:
//   - Merchant business name (fetched from API)
//   - Next payment date (fixed for new subscriptions)
//   - Payment history per subscription
//   - Cancel (Type A: wallet sign / Type B: backend)

import { useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "wagmi/chains";
import {
  VAULT_ADDRESS, VAULT_ABI,
  INTERVAL_NAMES, STATUS_NAMES, STATUS_COLORS,
  shortAddress, formatUSDC,
} from "../config.js";

const API_BASE = "https://the-opportunity-production.up.railway.app";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNextPullDate(lastPulledAt, interval) {
  const intervals = { 0: 7, 1: 30, 2: 365 };
  const days = intervals[interval] || 30;
  // If never pulled, use now + interval as estimate
  const base = (!lastPulledAt || lastPulledAt === 0n)
    ? Date.now()
    : Number(lastPulledAt) * 1000;
  return new Date(base + days * 86400 * 1000);
}

function formatDate(date) {
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(date) {
  if (!date) return null;
  const diff = Math.ceil((date - Date.now()) / 86400000);
  if (diff < 0)  return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const c = {
  page: {
    minHeight: "100vh",
    background: "#080c14",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    padding: "40px 24px",
  },
  container: { maxWidth: 680, margin: "0 auto" },
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "0.5px solid rgba(255,255,255,0.08)",
    borderRadius: 16, padding: 28, marginBottom: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  btn: {
    border: "none", borderRadius: 10, fontWeight: 700,
    fontSize: 14, padding: "11px 24px", cursor: "pointer",
    transition: "opacity 0.15s",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  error: {
    background: "rgba(248,113,113,0.08)",
    border: "0.5px solid rgba(248,113,113,0.2)",
    borderRadius: 8, padding: "10px 14px",
    fontSize: 13, color: "#f87171", marginBottom: 16,
  },
  divider: {
    display: "flex", alignItems: "center", gap: 12, margin: "20px 0",
  },
  dividerLine: {
    flex: 1, height: 1, background: "rgba(255,255,255,0.06)",
  },
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const name = STATUS_NAMES[status] || "Unknown";
  const cfg  = STATUS_COLORS[name] || { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
      {name}
    </span>
  );
}

// ─── Payment History ──────────────────────────────────────────────────────────
function PaymentHistory({ subscriptionId, merchantAddress }) {
  const [payments, setPayments]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [expanded, setExpanded]   = useState(false);

  const load = async () => {
    if (payments.length > 0) { setExpanded(true); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/subscriber/payments/${subscriptionId}`,
        { headers: { "X-Subscription-Id": String(subscriptionId) } }
      );
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } catch (err) {
      console.error("Payment history error:", err);
    } finally {
      setLoading(false);
      setExpanded(true);
    }
  };

  return (
    <div style={{ marginTop: 16, borderTop: "0.5px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
      <button
        onClick={expanded ? () => setExpanded(false) : load}
        style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
      >
        {expanded ? "▲" : "▼"} Payment history
        {payments.length > 0 && <span style={{ color: "#475569" }}>({payments.length})</span>}
      </button>

      {loading && (
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Loading...</div>
      )}

      {expanded && !loading && payments.length === 0 && (
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>No payments yet.</div>
      )}

      {expanded && payments.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.5fr", padding: "6px 0", fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "0.5px solid rgba(255,255,255,0.04)" }}>
            <span>Date</span><span>Amount</span><span>Transaction</span>
          </div>
          {payments.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.5fr", padding: "8px 0", fontSize: 12, alignItems: "center", borderBottom: "0.5px solid rgba(255,255,255,0.03)" }}>
              <span style={{ color: "#94a3b8" }}>
                {new Date(p.executed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span style={{ color: "#34d399", fontFamily: "monospace", fontWeight: 600 }}>
                ${p.amount_usdc}
              </span>
              <a
                href={`https://sepolia.basescan.org/tx/${p.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "monospace", fontSize: 11, color: "#3b82f6", textDecoration: "none" }}
              >
                {p.tx_hash?.slice(0, 8)}...{p.tx_hash?.slice(-6)} ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subscription Card ────────────────────────────────────────────────────────
function SubscriptionCard({ sub, isCustodied, merchantName, onCancelled }) {
  const [cancelling, setCancelling]     = useState(false);
  const [cancelTxHash, setCancelTxHash] = useState(null);
  const [errorMsg, setErrorMsg]         = useState("");
  const [showConfirm, setShowConfirm]   = useState(false);

  const { address: connectedAddress } = useAccount();
  const { writeContractAsync }        = useWriteContract();

  const { isSuccess: cancelConfirmed } = useWaitForTransactionReceipt({
    hash: cancelTxHash,
    query: { enabled: !!cancelTxHash },
  });

  useEffect(() => {
    if (cancelConfirmed) { setCancelling(false); onCancelled(); }
  }, [cancelConfirmed]);

  const isActive  = sub.status === 0;
  const isPaused  = sub.status === 1;
  const canCancel = isActive || isPaused;

  const nextPull     = getNextPullDate(sub.lastPulledAt, sub.interval);
  const nextPullWhen = isActive ? daysUntil(nextPull) : null;

  // Type B — custodied: backend cancels
  const handleCustodiedCancel = async () => {
    setCancelling(true);
    setErrorMsg("");
    try {
      const token = localStorage.getItem("subscriber_token");
      const res = await fetch(`${API_BASE}/api/subscriber/cancel/${sub.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Cancel failed.");
      }
      onCancelled();
    } catch (err) {
      setErrorMsg(err.message || "Could not cancel. Please try again.");
      setCancelling(false);
    }
  };

  // Type A — own wallet signs
  const handleWalletCancel = async () => {
    setCancelling(true);
    setErrorMsg("");
    try {
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "cancelSubscription",
        args: [BigInt(sub.id)],
      });
      setCancelTxHash(hash);
    } catch (err) {
      setErrorMsg(err.shortMessage || err.message || "Transaction rejected.");
      setCancelling(false);
    }
  };

  const handleCancel = isCustodied ? handleCustodiedCancel : handleWalletCancel;

  const subOwner    = sub.safeVault?.toLowerCase() || sub.owner?.toLowerCase();
  const wrongWallet = !isCustodied && connectedAddress && connectedAddress.toLowerCase() !== subOwner;

  return (
    <div style={c.card}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
            Subscription #{sub.id}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>
            {merchantName || shortAddress(sub.merchant)}
          </div>
          <StatusBadge status={sub.status} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>
            {formatUSDC(sub.amount)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>/ {INTERVAL_NAMES[sub.interval]}</div>
          {sub.introAmount > 0n && sub.pullCount < sub.introPulls && (
            <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 2 }}>
              🎁 Intro price — {Number(sub.introPulls) - Number(sub.pullCount)} {INTERVAL_NAMES[sub.interval]?.toLowerCase()}s left
            </div>
          )}
        </div>
      </div>

     {/* Details grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {(isActive || isPaused) && (
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Next payment</div>
          <div style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>{formatDate(nextPull)}</div>
          {nextPullWhen && (
            {(isActive || isPaused) && (
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Next payment</div>
          <div style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>{formatDate(nextPull)}</div>
          {nextPullWhen && (
            <div style={{ fontSize: 11, color: nextPullWhen === "overdue" ? "#f87171" : "#34d399", marginTop: 2 }}>
              {nextPullWhen}
            </div>
          )}
        </div>
        )}
            <div style={{ fontSize: 11, color: nextPullWhen === "overdue" ? "#f87171" : "#34d399", marginTop: 2 }}>
              {nextPullWhen}
            </div>
          )}
        </div>
        )}
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Interval</div>
          <div style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>
            {INTERVAL_NAMES[sub.interval]}
          </div>
          {sub.trialEndsAt > 0n && Date.now() < Number(sub.trialEndsAt) * 1000 && (
            <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 2 }}>
              Trial ends {formatDate(new Date(Number(sub.trialEndsAt) * 1000))}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {errorMsg && <div style={c.error}>{errorMsg}</div>}

      {/* Cancel */}
      {canCancel && (
        wrongWallet ? (
          <div style={{ fontSize: 12, color: "#f87171" }}>
            Wrong wallet connected. Please connect {shortAddress(subOwner)} to cancel.
          </div>
        ) : !showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            style={{ ...c.btn, background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)", color: "#f87171", fontSize: 13 }}
          >
            Cancel subscription
          </button>
        ) : (
          <div style={{ background: "rgba(248,113,113,0.06)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, color: "#f1f5f9", marginBottom: 12 }}>
              Are you sure? This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ ...c.btn, background: "#f87171", color: "#fff", opacity: cancelling ? 0.6 : 1 }}
              >
                {cancelling ? (cancelTxHash ? "Confirming..." : "Cancelling...") : "Yes, cancel"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ ...c.btn, background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
              >
                Keep it
              </button>
            </div>
          </div>
        )
      )}

      {!canCancel && (
        <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>
          This subscription is {STATUS_NAMES[sub.status]?.toLowerCase()}.
        </div>
      )}

      {/* Payment history */}
      <PaymentHistory subscriptionId={sub.id} merchantAddress={sub.merchant} />
    </div>
  );
}

// ─── Load subscriptions from chain ───────────────────────────────────────────
async function fetchSubscriptionsForWallet(walletAddress) {
  const subs = [];
  let id = 0;
  while (true) {
    try {
      const sub = await client.readContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "subscriptions",
        args: [BigInt(id)],
      });
      if (sub[0] === "0x0000000000000000000000000000000000000000") break;
      if (
        sub[0].toLowerCase() === walletAddress.toLowerCase() ||
        sub[3].toLowerCase() === walletAddress.toLowerCase()
      ) {
        subs.push({
          id,
          owner:           sub[0],
          guardian:        sub[1],
          merchant:        sub[2],
          safeVault:       sub[3],
          amount:          sub[4],
          introAmount:     sub[5],
          introPulls:      sub[6],
          pullCount:       sub[7],
          interval:        Number(sub[8]),
          lastPulledAt:    sub[9],
          pausedAt:        sub[10],
          expiresAt:       sub[11],
          trialEndsAt:     sub[12],
          gracePeriodDays: sub[13],
          status:          Number(sub[14]),
        });
      }
      id++;
    } catch { break; }
  }
  return subs;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MySubscriptions() {
  const [subscriber, setSubscriber]       = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [merchantNames, setMerchantNames] = useState({}); // address → name
  const [loading, setLoading]             = useState(false);
  const [errorMsg, setErrorMsg]           = useState("");
  const [authMode, setAuthMode]           = useState(null);
  const [authStatus, setAuthStatus]       = useState("checking");

  const { address: walletAddress, isConnected } = useAccount();

  // Handle Google OAuth return + existing token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("subscriber_token");
    if (token) {
      localStorage.setItem("subscriber_token", token);
      const url = new URL(window.location.href);
      url.searchParams.delete("subscriber_token");
      window.history.replaceState({}, "", url.toString());
    }

    const existingToken = localStorage.getItem("subscriber_token");
    if (existingToken) {
      fetch(`${API_BASE}/api/subscriber/me`, {
        headers: { Authorization: `Bearer ${existingToken}` },
      })
        .then(r => { if (!r.ok) throw new Error("expired"); return r.json(); })
        .then(data => {
          setSubscriber(data);
          setAuthMode("google");
          setAuthStatus("ready");
        })
        .catch(() => {
          localStorage.removeItem("subscriber_token");
          setAuthStatus("ready");
        });
    } else {
      setAuthStatus("ready");
    }
  }, []);

  // Auto-detect connected wallet
  useEffect(() => {
    if (isConnected && walletAddress && authMode === null && authStatus === "ready") {
      setAuthMode("wallet");
    }
  }, [isConnected, walletAddress, authStatus]);

  const walletToQuery = authMode === "wallet"
    ? walletAddress
    : authMode === "google"
    ? subscriber?.wallet_address
    : null;

  // Load subscriptions
  const loadSubscriptions = useCallback(async () => {
    if (!walletToQuery) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const subs = await fetchSubscriptionsForWallet(walletToQuery);
      setSubscriptions(subs);

      // Fetch merchant names for all unique merchants
      const uniqueMerchants = [...new Set(subs.map(s => s.merchant.toLowerCase()))];
      const names = {};
      await Promise.all(uniqueMerchants.map(async addr => {
        try {
          const res = await fetch(`${API_BASE}/api/merchants/${addr}`, {
            headers: { "X-Merchant-Address": addr },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.business_name) names[addr] = data.business_name;
          }
        } catch { /* use address fallback */ }
      }));
      setMerchantNames(names);
    } catch (err) {
      setErrorMsg("Could not load subscriptions. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [walletToQuery]);

  useEffect(() => {
    if (walletToQuery) loadSubscriptions();
  }, [walletToQuery]);

  const handleGoogleLogin = () => {
    const origin   = window.location.origin;
    const returnTo = "/my-subscriptions";
    window.location.href = `${API_BASE}/auth/google?returnTo=${encodeURIComponent(returnTo)}&origin=${encodeURIComponent(origin)}`;
  };

  const handleLogout = () => {
    localStorage.removeItem("subscriber_token");
    setSubscriber(null);
    setSubscriptions([]);
    setMerchantNames({});
    setAuthMode(null);
  };

  const activeSubs   = subscriptions.filter(s => s.status === 0);
  const inactiveSubs = subscriptions.filter(s => s.status !== 0);
  const isCustodied  = authMode === "google";

  const displayName = authMode === "google"
    ? subscriber?.name || subscriber?.email
    : null; // wallet address shown by ConnectButton

  return (
    <div style={c.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(52,211,153,0.06) 0%, transparent 70%)",
      }} />

      <div style={c.container}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #34d399, #3b82f6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: "#080c14",
            }}>A</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>AuthOnce</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>My Subscriptions</div>
            </div>
          </div>

          {/* Header right — show name + sign out for Google, nothing extra for wallet */}
          {authMode === "google" && displayName && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {subscriber?.avatar_url && (
                <img src={subscriber.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
              )}
              <span style={{ fontSize: 13, color: "#94a3b8" }}>{displayName}</span>
              <button
                onClick={handleLogout}
                style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", color: "#64748b", fontSize: 12, cursor: "pointer" }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Checking */}
        {authStatus === "checking" && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b", fontSize: 13 }}>
            Loading...
          </div>
        )}

        {/* Login screen */}
        {authStatus === "ready" && !authMode && (
          <div style={{ ...c.card, maxWidth: 420, margin: "60px auto" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
                Manage your subscriptions
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                Sign in with the same account you used when subscribing.
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, textAlign: "center" }}>
                Subscribed with MetaMask or another wallet?
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <ConnectButton label="Connect Wallet" />
              </div>
            </div>

            <div style={c.divider}>
              <div style={c.dividerLine} />
              <span style={{ fontSize: 11, color: "#475569" }}>or</span>
              <div style={c.dividerLine} />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, textAlign: "center" }}>
                Subscribed via card or fiat payment?
              </div>
              <button
                onClick={handleGoogleLogin}
                style={{ ...c.btn, background: "linear-gradient(135deg, #34d399, #3b82f6)", color: "#080c14", width: "100%", fontSize: 15 }}
              >
                Sign in with Google →
              </button>
            </div>

            <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 14 }}>
              No password required · Secure · Private
            </div>
          </div>
        )}

        {/* Subscriptions */}
        {authStatus === "ready" && authMode && (
          <>
            {errorMsg && <div style={c.error}>{errorMsg}</div>}

            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b", fontSize: 13 }}>
                Loading your subscriptions...
              </div>
            )}

            {!loading && subscriptions.length === 0 && (
              <div style={{ ...c.card, textAlign: "center", padding: "48px 28px" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>
                  No subscriptions found
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                  No subscriptions found for this {authMode === "wallet" ? "wallet" : "account"}.
                </div>
                {authMode === "wallet" && (
                  <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
                    Subscribed via Google/card?{" "}
                    <button
                      onClick={handleGoogleLogin}
                      style={{ background: "none", border: "none", color: "#34d399", cursor: "pointer", fontSize: 12, padding: 0, textDecoration: "underline" }}
                    >
                      Sign in with Google instead
                    </button>
                  </div>
                )}
              </div>
            )}

            {!loading && activeSubs.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                  Active — {activeSubs.length}
                </div>
                {activeSubs.map(sub => (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    isCustodied={isCustodied}
                    merchantName={merchantNames[sub.merchant?.toLowerCase()]}
                    onCancelled={loadSubscriptions}
                  />
                ))}
              </>
            )}

            {!loading && inactiveSubs.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, marginTop: activeSubs.length > 0 ? 24 : 0 }}>
                  Past — {inactiveSubs.length}
                </div>
                {inactiveSubs.map(sub => (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    isCustodied={isCustodied}
                    merchantName={merchantNames[sub.merchant?.toLowerCase()]}
                    onCancelled={loadSubscriptions}
                  />
                ))}
              </>
            )}

            {!loading && subscriptions.length > 0 && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button
                  onClick={loadSubscriptions}
                  style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer" }}
                >
                  ↻ Refresh
                </button>
              </div>
            )}
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 48, fontSize: 11, color: "#64748b" }}>
          Powered by <span style={{ color: "#34d399" }}>AuthOnce</span> · Non-custodial · Base Network
        </div>

      </div>
    </div>
  );
}
