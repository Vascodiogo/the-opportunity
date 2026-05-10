// src/components/MySubscriptions.jsx
// Standalone subscriber portal — authonce.io/my-subscriptions
//
// Two login paths:
//   Type A — Crypto-native: connect wallet (MetaMask/WalletConnect) → read subscriptions for that address
//   Type B — Fiat/custodied: sign in with Google → lookup custodied wallet → read subscriptions
//
// Cancel flow:
//   Type A: sign cancelSubscription(id) with connected wallet
//   Type B: POST /api/subscriber/cancel/:id → backend signs with custodied key

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
  if (!lastPulledAt || lastPulledAt === 0n) return null;
  const last = Number(lastPulledAt) * 1000;
  const intervals = { 0: 7, 1: 30, 2: 365 };
  const days = intervals[interval] || 30;
  return new Date(last + days * 86400 * 1000);
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

// ─── Subscription Card ────────────────────────────────────────────────────────
function SubscriptionCard({ sub, isCustodied, walletAddress, onCancelled }) {
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

  const nextPull    = getNextPullDate(sub.lastPulledAt, sub.interval);
  const nextPullWhen = daysUntil(nextPull);

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

  // Type A — own wallet: MetaMask/WalletConnect signs
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

  // For Type A: check correct wallet is connected
  const subOwner   = sub.safeVault?.toLowerCase() || sub.owner?.toLowerCase();
  const wrongWallet = !isCustodied && connectedAddress && connectedAddress.toLowerCase() !== subOwner;

  return (
    <div style={c.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
            Subscription #{sub.id}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", marginBottom: 6 }}>
            {shortAddress(sub.merchant)}
          </div>
          <StatusBadge status={sub.status} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>
            {formatUSDC(sub.amount)}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>/ {INTERVAL_NAMES[sub.interval]}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Next payment</div>
          <div style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>{formatDate(nextPull)}</div>
          {nextPullWhen && isActive && (
            <div style={{ fontSize: 11, color: nextPullWhen === "overdue" ? "#f87171" : "#34d399", marginTop: 2 }}>
              {nextPullWhen}
            </div>
          )}
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Vault</div>
          <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
            {shortAddress(sub.safeVault || sub.owner)}
          </div>
        </div>
      </div>

      {errorMsg && <div style={c.error}>{errorMsg}</div>}

      {canCancel && (
        wrongWallet ? (
          <div style={{ fontSize: 12, color: "#f87171" }}>
            Wrong wallet. Connect {shortAddress(subOwner)} to cancel.
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
  const [subscriber, setSubscriber]       = useState(null); // Google auth subscriber
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [errorMsg, setErrorMsg]           = useState("");
  const [authMode, setAuthMode]           = useState(null); // null | "wallet" | "google"
  const [authStatus, setAuthStatus]       = useState("checking"); // checking | ready

  const { address: walletAddress, isConnected } = useAccount();

  // Handle Google OAuth return token
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

  // When wallet connects — switch to wallet mode
  useEffect(() => {
    if (isConnected && walletAddress && authMode === null) {
      setAuthMode("wallet");
    }
  }, [isConnected, walletAddress]);

  // Load subscriptions when mode and address are known
  const walletToQuery = authMode === "wallet"
    ? walletAddress
    : authMode === "google"
    ? subscriber?.wallet_address
    : null;

  const loadSubscriptions = useCallback(async () => {
    if (!walletToQuery) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const subs = await fetchSubscriptionsForWallet(walletToQuery);
      setSubscriptions(subs);
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
    setAuthMode(null);
  };

  const activeSubs   = subscriptions.filter(s => s.status === 0);
  const inactiveSubs = subscriptions.filter(s => s.status !== 0);
  const isCustodied  = authMode === "google";

  const displayName = authMode === "google"
    ? subscriber?.name || subscriber?.email
    : walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

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

          {authMode && displayName && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {authMode === "google" && subscriber?.avatar_url && (
                <img src={subscriber.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
              )}
              <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: authMode === "wallet" ? "monospace" : "inherit" }}>
                {displayName}
              </span>
              {authMode === "google" && (
                <button
                  onClick={handleLogout}
                  style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 10px", color: "#64748b", fontSize: 12, cursor: "pointer" }}
                >
                  Sign out
                </button>
              )}
              {authMode === "wallet" && (
                <ConnectButton showBalance={false} />
              )}
            </div>
          )}
        </div>

        {/* Checking */}
        {authStatus === "checking" && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b", fontSize: 13 }}>
            Loading...
          </div>
        )}

        {/* Login screen — no auth yet */}
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

            {/* Wallet connect */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, textAlign: "center" }}>
                Subscribed with MetaMask or another wallet?
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <ConnectButton label="Connect Wallet" />
              </div>
            </div>

            {/* Divider */}
            <div style={c.divider}>
              <div style={c.dividerLine} />
              <span style={{ fontSize: 11, color: "#475569" }}>or</span>
              <div style={c.dividerLine} />
            </div>

            {/* Google login */}
            <div style={{ marginBottom: 4 }}>
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

        {/* Logged in — show subscriptions */}
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
                  {authMode === "wallet" && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
                      If you subscribed via Google/card,{" "}
                      <button
                        onClick={handleGoogleLogin}
                        style={{ background: "none", border: "none", color: "#34d399", cursor: "pointer", fontSize: 12, padding: 0, textDecoration: "underline" }}
                      >
                        sign in with Google instead
                      </button>.
                    </div>
                  )}
                </div>
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
                    walletAddress={walletToQuery}
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
                    walletAddress={walletToQuery}
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
