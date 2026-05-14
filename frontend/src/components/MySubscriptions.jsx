// src/components/MySubscriptions.jsx
// Subscriber portal — authonce.io/my-subscriptions
// Google OAuth login (no wallet required)
// Shows active subscriptions, payment history, cancel button

import { useState, useEffect } from "react";

const API_BASE = "https://the-opportunity-production.up.railway.app";

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: "100vh",
    background: "#080c14",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: "#f1f5f9",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    height: 58,
    borderBottom: "0.5px solid rgba(255,255,255,0.07)",
    background: "rgba(8,12,20,0.95)",
    backdropFilter: "blur(12px)",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "linear-gradient(135deg, #34d399, #3b82f6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 800,
    color: "#080c14",
  },
  logoText: {
    fontSize: 14,
    fontWeight: 700,
    color: "#f1f5f9",
    letterSpacing: "-0.02em",
  },
  container: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "40px 24px",
  },
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "0.5px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 32,
    marginBottom: 16,
  },
  loginCard: {
    maxWidth: 420,
    margin: "80px auto",
    background: "rgba(255,255,255,0.03)",
    border: "0.5px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 40,
    textAlign: "center",
    boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
  },
  btn: {
    border: "none",
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    padding: "11px 20px",
    cursor: "pointer",
    transition: "opacity 0.15s",
    fontFamily: "'DM Sans', system-ui, sans-serif",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #34d399, #3b82f6)",
    color: "#080c14",
  },
  btnDanger: {
    background: "rgba(248,113,113,0.1)",
    border: "0.5px solid rgba(248,113,113,0.3)",
    color: "#f87171",
  },
  btnSecondary: {
    background: "rgba(255,255,255,0.05)",
    border: "0.5px solid rgba(255,255,255,0.1)",
    color: "#94a3b8",
  },
  badge: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 9px",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
    background: color.bg,
    color: color.text,
  }),
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: 11,
    color: "#475569",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: "0.5px solid rgba(255,255,255,0.06)",
  },
  td: {
    padding: "12px 12px",
    borderBottom: "0.5px solid rgba(255,255,255,0.04)",
    color: "#94a3b8",
    verticalAlign: "middle",
  },
};

const STATUS_CONFIG = {
  active:    { bg: "rgba(52,211,153,0.12)",  text: "#34d399" },
  paused:    { bg: "rgba(251,191,36,0.12)",  text: "#fbbf24" },
  cancelled: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8" },
  expired:   { bg: "rgba(148,163,184,0.12)", text: "#94a3b8" },
};

const INTERVAL_LABELS = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.cancelled;
  return (
    <span style={s.badge(cfg)}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.text, display: "inline-block" }} />
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

// ─── Payment History Modal ────────────────────────────────────────────────────
function PaymentModal({ subscriptionId, token, onClose }) {
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
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, padding: 24,
    }} onClick={onClose}>
      <div style={{ ...s.card, maxWidth: 560, width: "100%", margin: 0, maxHeight: "80vh", overflowY: "auto" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>Payment History</div>
          <button onClick={onClose} style={{ ...s.btn, ...s.btnSecondary, padding: "6px 12px", fontSize: 12 }}>Close</button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 32, color: "#475569" }}>Loading...</div>
        ) : payments.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "#475569", fontSize: 13 }}>No payments yet.</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Amount</th>
                <th style={s.th}>Tx</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.payment_id}>
                  <td style={s.td}>{new Date(p.executed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td style={{ ...s.td, color: "#34d399", fontFamily: "monospace", fontWeight: 600 }}>${p.amount_usdc}</td>
                  <td style={s.td}>
                    <a href={`https://sepolia.basescan.org/tx/${p.tx_hash}`} target="_blank" rel="noopener noreferrer"
                       style={{ color: "#3b82f6", fontSize: 11, fontFamily: "monospace", textDecoration: "none" }}>
                      {p.tx_hash?.slice(0, 10)}...
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Cancel Confirm Modal ─────────────────────────────────────────────────────
function CancelModal({ subscription, token, onClose, onCancelled }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleCancel = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/subscriber/cancel/${subscription.subscription_id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Cancel failed");
      onCancelled(subscription.subscription_id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, padding: 24,
    }} onClick={onClose}>
      <div style={{ ...s.card, maxWidth: 380, width: "100%", margin: 0, textAlign: "center" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>Cancel Subscription</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24, lineHeight: 1.6 }}>
          Are you sure you want to cancel your <strong style={{ color: "#f1f5f9" }}>{subscription.product_name || "subscription"}</strong>?
          This cannot be undone.
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f87171", marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...s.btn, ...s.btnSecondary, flex: 1 }} onClick={onClose} disabled={loading}>Keep it</button>
          <button style={{ ...s.btn, ...s.btnDanger, flex: 1, opacity: loading ? 0.6 : 1 }} onClick={handleCancel} disabled={loading}>
            {loading ? "Cancelling..." : "Yes, cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subscription Card ────────────────────────────────────────────────────────
function SubscriptionCard({ sub, token, onCancelled }) {
  const [showPayments, setShowPayments] = useState(false);
  const [showCancel, setShowCancel]     = useState(false);
  const canCancel = sub.status === "active" || sub.status === "paused";

  return (
    <>
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
              {sub.product_name || `Subscription #${sub.subscription_id}`}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {sub.merchant_name || `${sub.merchant_address?.slice(0, 6)}...${sub.merchant_address?.slice(-4)}`}
            </div>
          </div>
          <StatusBadge status={sub.status} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[
            ["Amount", `$${parseFloat(sub.amount_usdc || 0).toFixed(2)} USDC`],
            ["Billing", INTERVAL_LABELS[sub.interval] || sub.interval],
            ["Since", sub.created_at ? new Date(sub.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"],
          ].map(([label, value]) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        {sub.last_pulled_at && (
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 16 }}>
            Last payment: {new Date(sub.last_pulled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={{ ...s.btn, ...s.btnSecondary, fontSize: 12, padding: "8px 16px" }}
                  onClick={() => setShowPayments(true)}>
            Payment History
          </button>
          {canCancel && (
            <button style={{ ...s.btn, ...s.btnDanger, fontSize: 12, padding: "8px 16px" }}
                    onClick={() => setShowCancel(true)}>
              Cancel
            </button>
          )}
          {sub.status === "cancelled" && sub.merchant_address && sub.product_slug && (
            <a
              href={`https://authonce.io/pay/${sub.merchant_address}/${sub.product_slug}`}
              style={{ ...s.btn, ...s.btnPrimary, fontSize: 12, padding: "8px 16px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            >
              Re-subscribe →
            </a>
          )}
        </div>
      </div>

      {showPayments && (
        <PaymentModal
          subscriptionId={sub.subscription_id}
          token={token}
          onClose={() => setShowPayments(false)}
        />
      )}

      {showCancel && (
        <CancelModal
          subscription={sub}
          token={token}
          onClose={() => setShowCancel(false)}
          onCancelled={onCancelled}
        />
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MySubscriptions() {
  const [token, setToken]                 = useState(() => sessionStorage.getItem("subscriber_token") || "");
  const [subscriber, setSubscriber]       = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [filter, setFilter]               = useState("active");

  // Handle Google OAuth return — token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("subscriber_token");
    if (urlToken) {
      sessionStorage.setItem("subscriber_token", urlToken);
      setToken(urlToken);
      // Clean URL
      const clean = new URL(window.location.href);
      clean.searchParams.delete("subscriber_token");
      window.history.replaceState({}, "", clean.toString());
    }
  }, []);

  // Load subscriber profile
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/subscriber/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error("Invalid session");
        return r.json();
      })
      .then(setSubscriber)
      .catch(() => {
        sessionStorage.removeItem("subscriber_token");
        setToken("");
      });
  }, [token]);

  // Load subscriptions
  useEffect(() => {
    if (!subscriber?.wallet_address) return;
    setLoading(true);
    fetch(`${API_BASE}/api/subscriber/subscriptions/${subscriber.wallet_address}`)
      .then(r => r.json())
      .then(d => setSubscriptions(d.subscriptions || []))
      .catch(() => setError("Could not load subscriptions."))
      .finally(() => setLoading(false));
  }, [subscriber]);

  const handleLogin = () => {
    const returnTo = encodeURIComponent("/my-subscriptions");
    window.location.href = `${API_BASE}/auth/google?returnTo=${returnTo}`;
  };

  const handleLogout = () => {
    sessionStorage.removeItem("subscriber_token");
    setToken("");
    setSubscriber(null);
    setSubscriptions([]);
  };

  const handleCancelled = (id) => {
    setSubscriptions(prev => prev.map(s =>
      s.subscription_id === id ? { ...s, status: "cancelled" } : s
    ));
  };

  const filtered = subscriptions.filter(s => {
    if (filter === "active") return s.status === "active" || s.status === "paused";
    if (filter === "cancelled") return s.status === "cancelled" || s.status === "expired";
    return true;
  });

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Ambient glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(52,211,153,0.06) 0%, transparent 70%)",
      }} />

      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.logo}>
          <div style={s.logoIcon}>A</div>
          <span style={s.logoText}>Auth<span style={{ color: "#34d399" }}>Once</span></span>
        </div>
        {subscriber && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {subscriber.avatar_url && (
              <img src={subscriber.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: "0.5px solid rgba(255,255,255,0.1)" }} />
            )}
            <span style={{ fontSize: 13, color: "#94a3b8" }}>{subscriber.name || subscriber.email}</span>
            <button style={{ ...s.btn, ...s.btnSecondary, fontSize: 12, padding: "6px 12px" }} onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
      </nav>

      {/* Not logged in */}
      {!token && (
        <div style={{ padding: 24 }}>
          <div style={s.loginCard}>
            <div style={{ ...s.logoIcon, width: 48, height: 48, borderRadius: 14, fontSize: 22, margin: "0 auto 16px" }}>A</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 8, letterSpacing: "-0.02em" }}>
              My Subscriptions
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 32, lineHeight: 1.6 }}>
              Sign in with Google to view and manage your AuthOnce subscriptions.
            </div>
            <button style={{ ...s.btn, ...s.btnPrimary, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
                    onClick={handleLogin}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 16 }}>
              No password required · Secure OAuth login
            </div>
          </div>
        </div>
      )}

      {/* Logged in */}
      {token && subscriber && (
        <div style={s.container}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em", margin: "0 0 4px" }}>
              My Subscriptions
            </h1>
            <div style={{ fontSize: 13, color: "#475569" }}>
              Wallet: <span style={{ fontFamily: "monospace", color: "#64748b" }}>
                {subscriber.wallet_address?.slice(0, 6)}...{subscriber.wallet_address?.slice(-4)}
              </span>
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 4, width: "fit-content" }}>
            {[["active", "Active"], ["cancelled", "Cancelled"], ["all", "All"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)} style={{
                ...s.btn,
                padding: "6px 16px",
                fontSize: 12,
                background: filter === val ? "rgba(255,255,255,0.08)" : "none",
                color: filter === val ? "#f1f5f9" : "#475569",
                border: "none",
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: "center", padding: 48, color: "#475569", fontSize: 13 }}>
              Loading subscriptions...
            </div>
          )}

          {/* Empty */}
          {!loading && filtered.length === 0 && (
            <div style={{ ...s.card, textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>
                {filter === "active" ? "No active subscriptions" : "No subscriptions found"}
              </div>
              <div style={{ fontSize: 13, color: "#475569" }}>
                Subscriptions you create via AuthOnce pay links will appear here.
              </div>
            </div>
          )}

          {/* Subscription cards */}
          {!loading && filtered.map(sub => (
            <SubscriptionCard
              key={sub.subscription_id}
              sub={sub}
              token={token}
              onCancelled={handleCancelled}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "24px", fontSize: 11, color: "#1e293b", marginTop: 40 }}>
        Powered by <span style={{ color: "#34d399" }}>AuthOnce</span> · Non-custodial · Base Network
      </div>
    </div>
  );
}
