// src/components/MySubscriptions.jsx
// authonce.io/my-subscriptions — Subscriber portal
//
// Auth:    Google OAuth (same flow as PayPage)
//          Token stored in sessionStorage as "subscriber_token"
// Shows:   Active/paused/cancelled subscriptions
//          Payment history per subscription
//          Cancel action (calls vault contract)
// Stack:   React, wagmi (for cancel tx), API_BASE for data

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { VAULT_ADDRESS, VAULT_ABI } from "../config.js";

const API_BASE = "https://the-opportunity-production.up.railway.app";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatAmount(usdc) {
  return `$${parseFloat(usdc || 0).toFixed(2)}`;
}

function intervalLabel(interval) {
  const map = { weekly: "week", monthly: "month", yearly: "year" };
  return map[interval] || interval;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = {
    active:    { bg: "rgba(52,211,153,0.12)", color: "#34d399", label: "Active" },
    paused:    { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24", label: "Grace period" },
    cancelled: { bg: "rgba(239,68,68,0.12)",   color: "#f87171", label: "Cancelled" },
    expired:   { bg: "rgba(100,116,139,0.12)", color: "#64748b", label: "Expired" },
  }[status] || { bg: "rgba(100,116,139,0.12)", color: "#64748b", label: status };

  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600,
      padding: "3px 10px", borderRadius: 99,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Payment history drawer ───────────────────────────────────────────────────

function PaymentHistory({ subscriptionId, token, onClose }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/subscriber/payments/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setPayments(d.payments || []))
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, [subscriptionId]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 200, padding: "0 0 0 0",
    }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560, background: "#0f172a",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: "16px 16px 0 0", padding: "24px 24px 40px",
          maxHeight: "70vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Payment history</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {loading && <p style={{ color: "#475569", fontSize: 13, textAlign: "center" }}>Loading...</p>}

        {!loading && payments.length === 0 && (
          <p style={{ color: "#475569", fontSize: 13, textAlign: "center" }}>No payments yet.</p>
        )}

        {!loading && payments.map(p => (
          <div key={p.payment_id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 0", borderBottom: "0.5px solid rgba(255,255,255,0.05)",
            fontSize: 13,
          }}>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: 500 }}>{formatAmount(p.amount_usdc)} USDC</div>
              <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>{formatDate(p.executed_at)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {p.tx_hash && (
                <a
                  href={`https://basescan.org/tx/${p.tx_hash}`}
                  target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none" }}
                >
                  View on Basescan ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Subscription card ────────────────────────────────────────────────────────

function SubscriptionCard({ sub, token, onCancelled }) {
  const [showHistory, setShowHistory]   = useState(false);
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState("");
  const [cancelTxHash, setCancelTxHash] = useState(null);
  const { writeContractAsync }          = useWriteContract();
  const { address }                     = useAccount();

  const { isSuccess: cancelConfirmed } = useWaitForTransactionReceipt({
    hash: cancelTxHash, query: { enabled: !!cancelTxHash },
  });

  useEffect(() => {
    if (cancelConfirmed) {
      setCancelling(false);
      onCancelled(sub.subscription_id);
    }
  }, [cancelConfirmed]);

  const handleCancel = async () => {
    if (!window.confirm(`Cancel subscription to ${sub.merchant_name || shortAddr(sub.merchant_address)}? This cannot be undone.`)) return;
    setCancelling(true);
    setCancelError("");

    // Try backend cancel first (works for fiat/custodied subscribers without wallet)
    try {
      const res = await fetch(`${API_BASE}/api/subscriber/cancel/${sub.subscription_id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        onCancelled(sub.subscription_id);
        setCancelling(false);
        return;
      }
      // If not_custodied, fall through to wallet cancel
      if (data.error !== "not_custodied") {
        setCancelError(data.message || "Cancel failed.");
        setCancelling(false);
        return;
      }
    } catch {
      // Network error — fall through to wallet cancel if connected
    }

    // Wallet cancel — for crypto-native subscribers
    if (!address) {
      setCancelError("Connect your wallet to cancel this subscription.");
      setCancelling(false);
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "cancelSubscription",
        args: [BigInt(sub.subscription_id)],
      });
      setCancelTxHash(hash);
    } catch (err) {
      setCancelError(err.shortMessage || err.message || "Transaction failed.");
      setCancelling(false);
    }
  };

  const canCancel = sub.status === "active" || sub.status === "paused";

  return (
    <>
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 14, padding: "20px 20px 16px",
        marginBottom: 12,
      }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
              {sub.product_name || sub.merchant_name || shortAddr(sub.merchant_address)}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {sub.merchant_name && sub.product_name ? sub.merchant_name : shortAddr(sub.merchant_address)}
            </div>
          </div>
          <StatusBadge status={sub.status} />
        </div>

        {/* Amount + interval */}
        <div style={{
          display: "flex", gap: 20, marginBottom: 14,
          padding: "12px 14px", background: "rgba(255,255,255,0.02)",
          borderRadius: 10, border: "0.5px solid rgba(255,255,255,0.05)",
        }}>
          <div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 3 }}>Amount</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>{formatAmount(sub.amount_usdc)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 3 }}>Billing</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#f1f5f9" }}>Per {intervalLabel(sub.interval)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 3 }}>Last paid</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#f1f5f9" }}>{formatDate(sub.last_pulled_at)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 3 }}>Since</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#f1f5f9" }}>{formatDate(sub.created_at)}</div>
          </div>
        </div>

        {/* Grace period warning */}
        {sub.status === "paused" && (
          <div style={{
            background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.2)",
            borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#fbbf24", marginBottom: 14,
          }}>
            Payment failed — your subscription is in a grace period. The keeper will retry daily. Top up your vault to restore it.
          </div>
        )}

        {/* Cancel error */}
        {cancelError && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "0.5px solid rgba(239,68,68,0.2)",
            borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f87171", marginBottom: 14,
          }}>
            {cancelError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setShowHistory(true)}
            style={{
              flex: 1, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: "9px 0", fontSize: 12, color: "#94a3b8",
              cursor: "pointer", fontWeight: 500,
            }}
          >
            Payment history
          </button>

          {canCancel && address && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{
                flex: 1, background: cancelling ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.08)",
                border: "0.5px solid rgba(239,68,68,0.2)",
                borderRadius: 8, padding: "9px 0", fontSize: 12,
                color: cancelling ? "#475569" : "#f87171",
                cursor: cancelling ? "not-allowed" : "pointer", fontWeight: 500,
              }}
            >
              {cancelling ? "Cancelling..." : "Cancel subscription"}
            </button>
          )}

          {canCancel && !address && (
            <div style={{ flex: 1, fontSize: 11, color: "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>
              Connect wallet to cancel
            </div>
          )}
        </div>
      </div>

      {showHistory && (
        <PaymentHistory
          subscriptionId={sub.subscription_id}
          token={token}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MySubscriptions() {
  const [token, setToken]               = useState(() => sessionStorage.getItem("subscriber_token") || "");
  const [subscriber, setSubscriber]     = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [filter, setFilter]             = useState("active");

  const { address } = useAccount();

  // ── Auth: Google OAuth redirect ────────────────────────────────────────────

  useEffect(() => {
    // Handle OAuth callback — token passed as ?token= in URL
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("subscriber_token");
    if (urlToken) {
      sessionStorage.setItem("subscriber_token", urlToken);
      setToken(urlToken);
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // ── Fetch subscriber profile ───────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/subscriber/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (r.status === 401) { handleLogout(); return null; }
        return r.json();
      })
      .then(data => { if (data) setSubscriber(data); })
      .catch(() => setError("Could not load your profile."));
  }, [token]);

  // ── Fetch subscriptions ────────────────────────────────────────────────────

  useEffect(() => {
    if (!subscriber?.wallet_address) return;
    setLoading(true);
    fetch(`${API_BASE}/api/subscriber/subscriptions/${subscriber.wallet_address}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setSubscriptions(data.subscriptions || []))
      .catch(() => setError("Could not load subscriptions."))
      .finally(() => setLoading(false));
  }, [subscriber]);

  const handleLogout = () => {
    sessionStorage.removeItem("subscriber_token");
    setToken("");
    setSubscriber(null);
    setSubscriptions([]);
  };

  const handleCancelled = (id) => {
    setSubscriptions(prev =>
      prev.map(s => s.subscription_id === id ? { ...s, status: "cancelled" } : s)
    );
  };

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE}/auth/google?returnTo=/my-subscriptions`;
  };

  // ── Filtered subscriptions ─────────────────────────────────────────────────

  const filtered = subscriptions.filter(s => {
    if (filter === "active")   return s.status === "active" || s.status === "paused";
    if (filter === "inactive") return s.status === "cancelled" || s.status === "expired";
    return true;
  });

  const activeCount   = subscriptions.filter(s => s.status === "active" || s.status === "paused").length;
  const totalMonthly  = subscriptions
    .filter(s => s.status === "active" && s.interval === "monthly")
    .reduce((sum, s) => sum + parseFloat(s.amount_usdc || 0), 0);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: not logged in
  // ─────────────────────────────────────────────────────────────────────────────

  if (!token) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#080c14", fontFamily: "'DM Sans', sans-serif",
        padding: 24,
      }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em", marginBottom: 8 }}>
            Auth<span style={{ color: "#34d399" }}>Once</span>
          </div>
          <div style={{ fontSize: 14, color: "#475569" }}>Manage your subscriptions</div>
        </div>

        <div style={{
          width: "100%", maxWidth: 380,
          background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.07)",
          borderRadius: 16, padding: 32,
        }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>Sign in to continue</div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
              Use the same Google account you used when subscribing.
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, padding: "12px 20px", borderRadius: 10,
              background: "#ffffff", border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600, color: "#0f172a",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ marginTop: 20, fontSize: 11, color: "#334155", textAlign: "center", lineHeight: 1.6 }}>
            No password. No wallet required.<br/>
            Your data stays private — we only store your email and subscription status.
          </div>
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: "#1e293b" }}>
          Powered by <span style={{ color: "#34d399" }}>AuthOnce</span> · Non-custodial · Base Network
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: logged in
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: "100vh", background: "#080c14",
      fontFamily: "'DM Sans', sans-serif", color: "#f1f5f9",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 56,
        borderBottom: "0.5px solid rgba(255,255,255,0.07)",
        background: "rgba(8,12,20,0.95)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: "#34d399" }}>Once</span>
          </span>
          <span style={{ fontSize: 11, color: "#334155" }}>/ My subscriptions</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Wallet connect — for cancel functionality */}
          <ConnectButton />

          {/* Subscriber identity */}
          {subscriber && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {subscriber.avatar_url && (
                <img src={subscriber.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
              )}
              <span style={{ fontSize: 12, color: "#64748b" }}>{subscriber.email}</span>
              <button
                onClick={handleLogout}
                style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 11 }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>

        {/* Summary cards */}
        {subscriptions.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
            <div style={{
              background: "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.15)",
              borderRadius: 12, padding: "16px 20px",
            }}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>Active subscriptions</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#34d399" }}>{activeCount}</div>
            </div>
            <div style={{
              background: "rgba(59,130,246,0.06)", border: "0.5px solid rgba(59,130,246,0.15)",
              borderRadius: 12, padding: "16px 20px",
            }}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>Monthly spend</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#3b82f6" }}>${totalMonthly.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Cancel wallet prompt */}
        {!address && subscriptions.some(s => s.status === "active" || s.status === "paused") && (
          <div style={{
            background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.15)",
            borderRadius: 10, padding: "12px 16px", marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Connect your wallet to cancel subscriptions on-chain.
            </div>
            <ConnectButton />
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["active", "inactive", "all"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                border: `0.5px solid ${filter === f ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 8, padding: "6px 14px", cursor: "pointer",
                fontSize: 12, fontWeight: filter === f ? 600 : 400,
                color: filter === f ? "#f1f5f9" : "#475569",
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "0.5px solid rgba(239,68,68,0.2)",
            borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#f87171", marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", color: "#334155", fontSize: 13, padding: 40 }}>
            Loading your subscriptions...
          </div>
        )}

        {/* Empty state */}
        {!loading && subscriptions.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 24px",
            background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)",
            borderRadius: 14,
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>No subscriptions yet</div>
            <div style={{ fontSize: 13, color: "#475569" }}>
              Subscriptions you create via AuthOnce pay links will appear here.
            </div>
          </div>
        )}

        {/* Subscription list */}
        {!loading && filtered.map(sub => (
          <SubscriptionCard
            key={sub.subscription_id}
            sub={sub}
            token={token}
            onCancelled={handleCancelled}
          />
        ))}

        {!loading && subscriptions.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#334155", fontSize: 13, padding: 40 }}>
            No {filter} subscriptions.
          </div>
        )}
      </div>
    </div>
  );
}
