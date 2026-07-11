// src/components/MySubscriptions.jsx — Visual redesign May 2026
// Logic: unchanged. Visual: CSS variables, consistent tokens, no hardcoded colors.
import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSignMessage } from "wagmi";
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

// Token address → symbol resolver (Base Sepolia + Mainnet)
const TOKEN_SYMBOLS = {
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": "USDC",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0xdbde852fd6d600bf2c3301f6b2e8e9e38afafde9": "USDT",
  "0x808456652fdb597867f38412077a9182bf77359":  "EURC",
  "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": "EURC",
};

function tokenSymbol(address) {
  if (!address) return "stablecoin";
  return TOKEN_SYMBOLS[address.toLowerCase()] || "stablecoin";
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const S = {
  btn: {
    ghost: {
      background: "var(--bg-tag)", border: "0.5px solid var(--border)",
      borderRadius: 8, padding: "9px 0", fontSize: 12,
      color: "var(--text-secondary)", cursor: "pointer",
      fontWeight: 500, fontFamily: "inherit", flex: 1,
    },
    danger: {
      background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)",
      borderRadius: 8, padding: "9px 0", fontSize: 12,
      color: "var(--red)", cursor: "pointer",
      fontWeight: 500, fontFamily: "inherit", flex: 1,
    },
  },
  card: {
    background: "var(--bg-card)", border: "0.5px solid var(--border)",
    borderRadius: 14, boxShadow: "var(--shadow)",
  },
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    active:    { bg: "rgba(29,158,117,0.12)",  color: "var(--green)", label: "Active" },
    paused:    { bg: "rgba(251,191,36,0.12)",  color: "var(--amber)", label: "Grace period" },
    cancelled: { bg: "rgba(248,113,113,0.12)", color: "var(--red)",   label: "Cancelled" },
    expired:   { bg: "rgba(100,116,139,0.12)", color: "var(--text-muted)", label: "Expired" },
  }[status] || { bg: "rgba(100,116,139,0.12)", color: "var(--text-muted)", label: status };

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

// ─── Payment History Drawer ───────────────────────────────────────────────────
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
      zIndex: 200,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560,
        background: "var(--bg-modal)", border: "0.5px solid var(--border)",
        borderRadius: "16px 16px 0 0", padding: "24px 24px 40px",
        maxHeight: "70vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Payment history</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, fontFamily: "inherit" }}>×</button>
        </div>

        {loading && <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>Loading...</p>}
        {!loading && payments.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>No payments yet.</p>
        )}
        {!loading && payments.map(p => (
          <div key={p.payment_id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 0", borderBottom: "0.5px solid var(--border)", fontSize: 13,
          }}>
            <div>
              <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{formatAmount(p.amount_usdc)} USDC</div>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>{formatDate(p.executed_at)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {p.tx_hash && (
                <a href={`https://basescan.org/tx/${p.tx_hash}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: "var(--green)", textDecoration: "none" }}>
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

// ─── Subscription Card ────────────────────────────────────────────────────────
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

    try {
      const res = await fetch(`${API_BASE}/api/subscriber/cancel/${sub.subscription_id}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) { onCancelled(sub.subscription_id); setCancelling(false); return; }
      if (data.error !== "not_custodied") {
        setCancelError(data.message || "Cancel failed."); setCancelling(false); return;
      }
    } catch {}

    if (!address) {
      setCancelError("Connect your wallet to cancel this subscription.");
      setCancelling(false); return;
    }
    try {
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS, abi: VAULT_ABI,
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
      <div style={{ ...S.card, padding: "20px 20px 16px", marginBottom: 12 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
              {sub.product_name || sub.merchant_name || shortAddr(sub.merchant_address)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {sub.merchant_name && sub.product_name ? sub.merchant_name : shortAddr(sub.merchant_address)}
            </div>
          </div>
          <StatusBadge status={sub.status} />
        </div>

        {/* Amount details */}
        <div style={{
          display: "flex", gap: 20, marginBottom: 14,
          padding: "12px 14px", background: "var(--bg-tag)",
          borderRadius: 10, border: "0.5px solid var(--border)",
        }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Amount</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--green)" }}>{formatAmount(sub.amount_usdc)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Billing</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Per {intervalLabel(sub.interval)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Last paid</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{formatDate(sub.last_pulled_at)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>Since</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{formatDate(sub.created_at)}</div>
          </div>
        </div>

        {/* Grace period warning */}
        {sub.status === "paused" && (
          <div style={{ background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--amber)" }}>Payment failed — grace period active</span>
            </div>

            {/* Fiat subscriber */}
            {sub.is_fiat_subscriber && (
              <>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
                  Your card payment could not be collected. Please ensure your card has sufficient funds — the payment will be retried automatically. If it continues to fail, your subscription will expire.
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                  🔄 Retries automatically every 24h
                </div>
              </>
            )}

            {/* Crypto human subscriber */}
            {!sub.is_fiat_subscriber && !sub.is_contract_vault && (
              <>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
                  Your wallet needs <strong style={{ color: "var(--text-primary)" }}>${sub.amount_usdc} {tokenSymbol(sub.token)}</strong> to cover the next payment. Top up your wallet and the payment will be retried automatically.
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
                  🔄 Retries automatically every 24h · Subscription expires if wallet stays empty
                </div>
              </>
            )}

            {/* AI agent / contract wallet */}
            {sub.is_contract_vault && (
              <>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
                  The contract vault has insufficient <strong style={{ color: "var(--text-primary)" }}>{tokenSymbol(sub.token)}</strong>. Fund the vault with <strong style={{ color: "var(--text-primary)" }}>${sub.amount_usdc} {tokenSymbol(sub.token)}</strong> to resume.
                </div>
                {sub.safe_vault && (
                  <div style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Vault address</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <code style={{ fontSize: 11, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sub.safe_vault}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(sub.safe_vault)}
                        style={{ background: "none", border: "0.5px solid var(--border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: "var(--text-muted)", fontSize: 11 }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                {sub.safe_vault && (
                  <a
                    href={`https://sepolia.basescan.org/address/${sub.safe_vault}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block", background: "var(--amber)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none", textAlign: "center" }}
                  >
                    Fund vault on Basescan →
                  </a>
                )}
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, textAlign: "center" }}>
                  🔄 Keeper retries every 24h · Subscription expires if vault stays empty
                </div>
              </>
            )}
          </div>
        )}

        {/* Cancel error */}
        {cancelError && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--red)", marginBottom: 14 }}>
            {cancelError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowHistory(true)} style={S.btn.ghost}>
            Payment history
          </button>
          {canCancel && address && (
            <button onClick={handleCancel} disabled={cancelling} style={{ ...S.btn.danger, opacity: cancelling ? 0.5 : 1 }}>
              {cancelling ? "Cancelling..." : "Cancel subscription"}
            </button>
          )}
          {canCancel && !address && (
            <div style={{ flex: 1, fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              Connect wallet to cancel
            </div>
          )}
        </div>
      </div>

      {showHistory && (
        <PaymentHistory subscriptionId={sub.subscription_id} token={token} onClose={() => setShowHistory(false)} />
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MySubscriptions() {
  const [token, setToken]               = useState(() => sessionStorage.getItem("subscriber_token") || "");
  const [subscriber, setSubscriber]     = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [filter, setFilter]             = useState("active");
  const [walletAuthError, setWalletAuthError] = useState("");

  const { address }            = useAccount();
  const { signMessageAsync }   = useSignMessage();

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const urlToken = params.get("subscriber_token");
    if (urlToken) {
      sessionStorage.setItem("subscriber_token", urlToken);
      setToken(urlToken);
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/subscriber/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (r.status === 401) { handleLogout(); return null; } return r.json(); })
      .then(data => { if (data) setSubscriber(data); })
      .catch(() => setError("Could not load your profile."));
  }, [token]);

  // Merges subscriptions from whichever source(s) are active — Google-derived
  // wallet, connected wallet, or both — instead of one overwriting the other.
  // A subscriber who both logged in with Google and connects their own wallet
  // sees everything, deduped by subscription_id.
  const mergeSubscriptions = (incoming) => {
    setSubscriptions(prev => {
      const byId = new Map(prev.map(s => [s.subscription_id, s]));
      incoming.forEach(s => byId.set(s.subscription_id, s));
      return Array.from(byId.values()).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
    });
  };

  // Google/custodial path — unchanged except it now merges instead of overwrites.
  useEffect(() => {
    if (!subscriber?.wallet_address) return;
    setLoading(true);
    fetch(`${API_BASE}/api/subscriber/subscriptions/${subscriber.wallet_address}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => mergeSubscriptions(data.subscriptions || []))
      .catch(() => setError("Could not load subscriptions."))
      .finally(() => setLoading(false));
  }, [subscriber]);

  // Self-custody path — no Google account needed. Subscriber signs a short,
  // free message proving they control the connected wallet; the backend
  // verifies that signature before returning anything (see api.js).
  // This is a signature only — no transaction, no gas, no key ever touches
  // AuthOnce. It runs as soon as a wallet connects, whether or not the
  // subscriber is also logged in with Google.
  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setWalletAuthError("");
    (async () => {
      try {
        const timestamp = Date.now();
        const message = `AuthOnce: view my subscriptions (${timestamp})`;
        const signature = await signMessageAsync({ message });
        const res = await fetch(
          `${API_BASE}/api/subscriber/subscriptions/${address}?signature=${encodeURIComponent(signature)}&timestamp=${timestamp}`
        );
        if (!res.ok) throw new Error("verification_failed");
        const data = await res.json();
        mergeSubscriptions(data.subscriptions || []);
      } catch (err) {
        setWalletAuthError("Could not verify this wallet. Try reconnecting and signing again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [address]);

  const handleLogout = () => {
    sessionStorage.removeItem("subscriber_token");
    setToken(""); setSubscriber(null); setSubscriptions([]);
  };

  const handleCancelled = (id) => {
    setSubscriptions(prev => prev.map(s => s.subscription_id === id ? { ...s, status: "cancelled" } : s));
  };

  const filtered = subscriptions.filter(s => {
    if (filter === "active")   return s.status === "active" || s.status === "paused";
    if (filter === "inactive") return s.status === "cancelled" || s.status === "expired";
    return true;
  });

  const activeCount  = subscriptions.filter(s => s.status === "active" || s.status === "paused").length;
  const totalMonthly = subscriptions
    .filter(s => s.status === "active" && s.interval === "monthly")
    .reduce((sum, s) => sum + parseFloat(s.amount_usdc || 0), 0);

  // ── Not logged in ────────────────────────────────────────────────────────────
  // Wallet-connect + signature is the sole login entry point (§24: Google
  // OAuth signup disabled, no new custodial wallets). An existing subscriber
  // with a stored session token can still be logged in via `token` below —
  // this only gates the entry point for someone with neither.
  if (!token && !address) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "var(--bg-primary)", fontFamily: "'DM Sans', sans-serif",
        padding: 24,
      }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}>
            Auth<span style={{ color: "var(--green)" }}>Once</span>
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Manage your subscriptions</div>
        </div>

        <div style={{ width: "100%", maxWidth: 380, ...S.card, padding: 32 }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Sign in to continue</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Connect the wallet you subscribed with.
            </div>
          </div>

          {/* Wallet path — subscribed with MetaMask, Rabby, etc. No Google needed. */}
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
            <ConnectButton />
          </div>
          {walletAuthError && (
            <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 16 }}>
              {walletAuthError}
            </div>
          )}

          <div style={{ marginTop: 20, fontSize: 11, color: "var(--text-faint)", textAlign: "center", lineHeight: 1.6 }}>
            Connecting a wallet only asks for a free signature to prove it's yours — no transaction, no gas.<br/>
            Your data stays private — we only store your email or wallet address and subscription status.
          </div>
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: "var(--text-faint)" }}>
          Powered by <span style={{ color: "var(--green)" }}>AuthOnce</span> · Non-custodial · Base Network
        </div>
      </div>
    );
  }

  // ── Logged in ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", fontFamily: "'DM Sans', sans-serif", color: "var(--text-primary)" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 56,
        borderBottom: "0.5px solid var(--border)",
        background: "var(--bg-nav)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
            Auth<span style={{ color: "var(--green)" }}>Once</span>
          </span>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>/ My subscriptions</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ConnectButton />
          {subscriber && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {subscriber.avatar_url && (
                <img src={subscriber.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
              )}
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{subscriber.email}</span>
              <button onClick={handleLogout} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>

        {/* Summary cards */}
        {subscriptions.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
            <div style={{ ...S.card, padding: "16px 20px", borderLeft: "2px solid var(--green)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Active subscriptions</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--green)", fontFamily: "monospace" }}>{activeCount}</div>
            </div>
            <div style={{ ...S.card, padding: "16px 20px", borderLeft: "2px solid var(--blue)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Monthly spend</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--blue)", fontFamily: "monospace" }}>${totalMonthly.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Wallet connect prompt */}
        {!address && subscriptions.some(s => s.status === "active" || s.status === "paused") && (
          <div style={{ background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.15)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Connect your wallet to cancel subscriptions on-chain.
            </div>
            <ConnectButton />
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["active", "inactive", "all"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? "var(--bg-card)" : "var(--bg-tag)",
              border: `0.5px solid ${filter === f ? "var(--border-hover)" : "var(--border)"}`,
              borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              fontSize: 12, fontWeight: filter === f ? 600 : 400, fontFamily: "inherit",
              color: filter === f ? "var(--text-primary)" : "var(--text-muted)",
            }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "var(--red)", marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 40 }}>
            Loading your subscriptions...
          </div>
        )}

        {/* Empty state */}
        {!loading && subscriptions.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 24px", ...S.card }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>No subscriptions yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Subscriptions you create via AuthOnce pay links will appear here.
            </div>
          </div>
        )}

        {/* Subscription list */}
        {!loading && filtered.map(sub => (
          <SubscriptionCard key={sub.subscription_id} sub={sub} token={token} onCancelled={handleCancelled} />
        ))}

        {!loading && subscriptions.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 40 }}>
            No {filter} subscriptions.
          </div>
        )}
      </div>
    </div>
  );
}
