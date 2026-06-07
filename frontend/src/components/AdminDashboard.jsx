// src/components/AdminDashboard.jsx
// AuthOnce Admin Dashboard — v2
// Tabs: Overview · Merchants · Subscriptions · Subscribers · Payments · Webhooks · Analytics · Tax · Audit · Contracts
import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ─── Analytics helpers ────────────────────────────────────────────────────────
function buildMonthlyGTV(payments) {
  const map = {};
  payments.forEach(p => {
    if (!p.created_at || !p.amount_usdc) return;
    const d     = new Date(p.created_at);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!map[key]) map[key] = { month: label, gtv: 0, fees: 0 };
    map[key].gtv  += parseFloat(p.amount_usdc || 0);
    map[key].fees += parseFloat(p.fee_usdc || 0);
  });
  return Object.keys(map).sort().map(k => ({
    ...map[k],
    gtv:  parseFloat(map[k].gtv.toFixed(2)),
    fees: parseFloat(map[k].fees.toFixed(2)),
  }));
}

function calcMRR(payments) {
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  return payments
    .filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((sum, p) => sum + parseFloat(p.amount_usdc || 0), 0);
}

function calcFeeMRR(payments) {
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  return payments
    .filter(p => {
      const d = new Date(p.created_at);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((sum, p) => sum + parseFloat(p.fee_usdc || 0), 0);
}

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function shortAddr(a) {
  if (!a) return "—";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}
function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const S = {
  btn: {
    primary: {
      background: "var(--green)", border: "none", borderRadius: 8,
      color: "var(--bg-primary)", fontWeight: 700, fontSize: 13,
      padding: "9px 18px", cursor: "pointer", fontFamily: "inherit",
    },
    ghost: {
      background: "transparent", border: "0.5px solid var(--border)",
      borderRadius: 8, color: "var(--text-secondary)", fontSize: 12,
      padding: "5px 12px", cursor: "pointer", fontFamily: "inherit",
    },
    approve: {
      background: "rgba(29,158,117,0.12)", border: "0.5px solid rgba(29,158,117,0.3)",
      borderRadius: 6, color: "var(--green)", fontSize: 11, fontWeight: 600,
      padding: "5px 12px", cursor: "pointer", fontFamily: "inherit",
    },
    revoke: {
      background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)",
      borderRadius: 6, color: "var(--red)", fontSize: 11, fontWeight: 600,
      padding: "5px 12px", cursor: "pointer", fontFamily: "inherit",
    },
    danger: {
      background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)",
      borderRadius: 6, color: "var(--red)", fontSize: 11, fontWeight: 600,
      padding: "5px 12px", cursor: "pointer", fontFamily: "inherit",
    },
  },
  card: {
    background: "var(--bg-card)", border: "0.5px solid var(--border)",
    borderRadius: 12, boxShadow: "var(--shadow)",
  },
  label: {
    fontSize: 11, color: "var(--text-muted)",
    letterSpacing: "0.08em", textTransform: "uppercase",
    marginBottom: 8, display: "block", fontWeight: 500,
  },
  tableHeader: {
    fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em",
    textTransform: "uppercase", borderBottom: "0.5px solid var(--border)",
    background: "var(--bg-tag)", padding: "10px 20px",
  },
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function Badge({ status }) {
  const map = {
    active:    { bg: "rgba(29,158,117,0.12)",  color: "var(--green)", label: "Active" },
    paused:    { bg: "rgba(251,191,36,0.12)",  color: "var(--amber)", label: "Paused" },
    cancelled: { bg: "rgba(248,113,113,0.12)", color: "var(--red)",   label: "Cancelled" },
    expired:   { bg: "rgba(148,163,184,0.12)", color: "var(--text-muted)", label: "Expired" },
    pending:   { bg: "rgba(251,191,36,0.12)",  color: "var(--amber)", label: "Pending" },
    approved:  { bg: "rgba(29,158,117,0.12)",  color: "var(--green)", label: "Approved" },
    success:   { bg: "rgba(29,158,117,0.12)",  color: "var(--green)", label: "Success" },
    failed:    { bg: "rgba(248,113,113,0.12)", color: "var(--red)",   label: "Failed" },
    delivered: { bg: "rgba(29,158,117,0.12)",  color: "var(--green)", label: "Delivered" },
  };
  const s = map[status?.toLowerCase()] || { bg: "rgba(148,163,184,0.12)", color: "var(--text-muted)", label: status || "Unknown" };
  return (
    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: s.bg, color: s.color, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ ...S.card, padding: "20px 24px", borderLeft: `2px solid ${color || "var(--green)"}` }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "var(--green)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Search Bar ───────────────────────────────────────────────────────────────
function SearchBar({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || "Search..."}
      style={{
        background: "var(--bg-tag)", border: "0.5px solid var(--border)",
        borderRadius: 8, padding: "8px 12px", fontSize: 13,
        color: "var(--text-primary)", fontFamily: "inherit", width: "100%",
        outline: "none",
      }}
    />
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>
      {message}
    </div>
  );
}

// ─── Manual Approve ───────────────────────────────────────────────────────────
function ManualApprove({ token, onRefresh }) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);

  const handleApprove = async () => {
    if (!address.startsWith("0x") || address.length !== 42) {
      setMsg({ ok: false, text: "Invalid address." }); return;
    }
    setLoading(true); setMsg(null);
    try {
      await fetch(`${API_BASE}/api/merchants/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: address.toLowerCase() }),
      });
      const res = await fetch(`${API_BASE}/api/admin/merchants/${address}/approve`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMsg({ ok: true, text: `✓ ${shortAddr(address)} approved.` });
        setAddress(""); onRefresh();
      } else {
        setMsg({ ok: false, text: "Could not approve." });
      }
    } catch { setMsg({ ok: false, text: "Could not reach server." }); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ ...S.card, padding: "16px 20px", marginBottom: 16 }}>
      <span style={S.label}>Approve by address</span>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={address} onChange={e => setAddress(e.target.value.trim())}
          placeholder="0x merchant wallet address"
          style={{ flex: 1, fontFamily: "monospace" }}
        />
        <button onClick={handleApprove} disabled={loading || !address}
          style={{ ...S.btn.primary, opacity: loading || !address ? 0.5 : 1 }}>
          {loading ? "Approving..." : "Approve Merchant"}
        </button>
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</div>}
    </div>
  );
}

// ─── Merchant Row ─────────────────────────────────────────────────────────────
function MerchantRow({ merchant, token, onRefresh, isLast, onViewMerchant }) {
  const [loading, setLoading] = useState(false);
  const isPending  = !merchant.approved_at;
  const isApproved = !!merchant.approved_at;

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/merchants/${merchant.wallet_address}/approve`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) onRefresh();
      else alert("Could not approve merchant.");
    } catch { alert("Could not reach server."); }
    finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!window.confirm(`Remove approval for ${merchant.business_name || merchant.wallet_address}?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/merchants/${merchant.wallet_address}/reject`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) onRefresh();
      else alert("Could not reject merchant.");
    } catch { alert("Could not reach server."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr auto",
      alignItems: "center", padding: "12px 20px",
      borderBottom: isLast ? "none" : "0.5px solid var(--border)",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {merchant.business_name || <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>No name</span>}
        </div>
        <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", marginTop: 2, cursor: "pointer" }}
          onClick={() => copyToClipboard(merchant.wallet_address)}>
          {shortAddr(merchant.wallet_address)} ⧉
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{merchant.email || "—"}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(merchant.created_at)}</div>
      <div><Badge status={isPending ? "pending" : "approved"} /></div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {isPending && (
          <button onClick={handleApprove} disabled={loading} style={{ ...S.btn.approve, opacity: loading ? 0.6 : 1 }}>
            {loading ? "..." : "Approve"}
          </button>
        )}
        {isApproved && (
          <button onClick={handleReject} disabled={loading} style={{ ...S.btn.revoke, opacity: loading ? 0.6 : 1 }}>
            {loading ? "..." : "Revoke"}
          </button>
        )}
      </div>
      <button onClick={() => onViewMerchant(merchant)} style={{ ...S.btn.ghost, fontSize: 11, padding: "4px 10px", marginLeft: 4 }}>
        View →
      </button>
    </div>
  );
}

// ─── Subscription Detail Modal ─────────────────────────────────────────────────
function SubscriptionDetail({ sub, token, onClose, basescanBase }) {
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    if (!window.confirm("Force-cancel this subscription? This cannot be undone.")) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/admin/subscriptions/${sub.id}/cancel`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      onClose();
    } catch { alert("Could not cancel."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...S.card, width: "100%", maxWidth: 520, maxHeight: "80vh", overflowY: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Subscription #{sub.id}</h3>
          <button onClick={onClose} style={{ ...S.btn.ghost, padding: "4px 10px" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
          {[
            ["Status",       <Badge status={sub.status} />],
            ["Owner",        <span style={{ fontFamily: "monospace", cursor: "pointer" }} onClick={() => copyToClipboard(sub.owner_address)}>{shortAddr(sub.owner_address)} ⧉</span>],
            ["Merchant",     <span style={{ fontFamily: "monospace", cursor: "pointer" }} onClick={() => copyToClipboard(sub.merchant_address)}>{shortAddr(sub.merchant_address)} ⧉</span>],
            ["Amount",       `${(sub.amount / 1e6).toFixed(2)} ${sub.token_symbol || "USDC"}`],
            ["Interval",     sub.interval],
            ["Pull count",   sub.pull_count],
            ["Grace period", `${sub.grace_period_days} days`],
            ["Created",      formatDateTime(sub.created_at)],
            ["Last pull",    formatDateTime(sub.last_pulled_at)],
            ["Paused at",    sub.paused_at ? formatDateTime(sub.paused_at) : "—"],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--border)" }}>
              <span style={{ color: "var(--text-muted)" }}>{label}</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          {sub.tx_hash && (
            <a href={`${basescanBase}/tx/${sub.tx_hash}`} target="_blank" rel="noopener noreferrer"
              style={{ ...S.btn.ghost, fontSize: 11, textDecoration: "none", display: "inline-block" }}>
              View on Basescan ↗
            </a>
          )}
          {(sub.status === "active" || sub.status === "paused") && (
            <button onClick={handleCancel} disabled={loading} style={{ ...S.btn.danger, opacity: loading ? 0.5 : 1 }}>
              {loading ? "..." : "Force Cancel"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Merchant Detail Modal ────────────────────────────────────────────────────
function MerchantDetail({ merchant, token, onClose }) {
  const [products, setProducts]       = useState([]);
  const [subscriptions, setSubs]      = useState([]);
  const [payments, setPayments]       = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, s, pay] = await Promise.all([
          fetch(`${API_BASE}/api/products/${merchant.wallet_address}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
          fetch(`${API_BASE}/api/admin/subscriptions?merchant=${merchant.wallet_address}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
          fetch(`${API_BASE}/api/admin/payments?merchant=${merchant.wallet_address}&limit=10`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        ]);
        setProducts(p.products || []);
        setSubs(s.subscriptions || []);
        setPayments(pay.payments || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
  }, [merchant.wallet_address, token]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...S.card, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>{merchant.business_name || "Unnamed Merchant"}</h3>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)" }}>{merchant.wallet_address}</div>
          </div>
          <button onClick={onClose} style={{ ...S.btn.ghost, padding: "4px 10px" }}>✕</button>
        </div>

        {loading ? <EmptyState message="Loading..." /> : <>
          {/* Merchant info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20, fontSize: 12 }}>
            {[
              ["Email",     merchant.email || "—"],
              ["Tier",      merchant.tier || "starter"],
              ["Stripe",    merchant.stripe_account_id ? "Connected" : "Not connected"],
              ["Registered", formatDate(merchant.created_at)],
              ["Approved",  formatDate(merchant.approved_at)],
              ["Brand",     merchant.brand_name || "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "var(--bg-tag)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Products */}
          <div style={{ marginBottom: 20 }}>
            <span style={S.label}>Products ({products.length})</span>
            {products.length === 0 ? <EmptyState message="No products." /> : products.map(p => (
              <div key={p.slug} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--border)", fontSize: 12 }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{p.name}</span>
                <span style={{ color: "var(--text-muted)" }}>{(p.amount / 1e6).toFixed(2)} USDC / {p.interval}</span>
              </div>
            ))}
          </div>

          {/* Recent subscriptions */}
          <div style={{ marginBottom: 20 }}>
            <span style={S.label}>Recent subscriptions ({subscriptions.length})</span>
            {subscriptions.length === 0 ? <EmptyState message="No subscriptions." /> : subscriptions.slice(0, 5).map(s => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--border)", fontSize: 12 }}>
                <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>#{s.id} {shortAddr(s.owner_address)}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{(s.amount / 1e6).toFixed(2)} USDC</span>
                  <Badge status={s.status} />
                </div>
              </div>
            ))}
          </div>

          {/* Recent payments */}
          <div>
            <span style={S.label}>Recent payments ({payments.length})</span>
            {payments.length === 0 ? <EmptyState message="No payments." /> : payments.slice(0, 5).map(p => (
              <div key={p.tx_hash} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--border)", fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>{formatDate(p.executed_at)}</span>
                <span style={{ color: "var(--green)", fontWeight: 600 }}>${(p.merchant_received / 1e6).toFixed(2)} {p.token_symbol || "USDC"}</span>
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}

// ─── Tax Export Panel ─────────────────────────────────────────────────────────
function TaxExportPanel({ token, isAuthOnce = false }) {
  const [year, setYear]         = useState(new Date().getFullYear());
  const [currency, setCurrency] = useState("eur");
  const [loading, setLoading]   = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const currencies = [
    { code: "eur", label: "EUR" }, { code: "chf", label: "CHF" },
    { code: "usd", label: "USD" }, { code: "gbp", label: "GBP" },
  ];

  const handleDownload = async () => {
    setLoading(true);
    try {
      const endpoint = isAuthOnce
        ? `${API_BASE}/api/admin/tax/protocol-fees?year=${year}&currency=${currency}`
        : `${API_BASE}/api/admin/tax/merchant?year=${year}&currency=${currency}`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = isAuthOnce
        ? `authonce-protocol-fees-${year}-${currency}.csv`
        : `payments-${year}-${currency}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ ...S.card, padding: "20px 24px" }}>
      <span style={S.label}>{isAuthOnce ? "AuthOnce protocol fees (your taxes)" : "Merchant payment history"}</span>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.6 }}>
        {isAuthOnce
          ? "All 0.5% protocol fees collected, with EUR and CHF equivalents at time of collection. For Swiss and Portuguese tax filings."
          : "All payments received with fiat equivalents in your chosen currency. For VAT returns and income tax."}
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ padding: "7px 10px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--bg-tag)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit" }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={currency} onChange={e => setCurrency(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--bg-tag)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit" }}>
          {currencies.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        <button onClick={handleDownload} disabled={loading} style={{ ...S.btn.primary, opacity: loading ? 0.6 : 1 }}>
          {loading ? "Generating..." : "↓ Download CSV"}
        </button>
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>
        Columns: Date · Subscription ID · Token · Amount · {currency.toUpperCase()} equivalent · Protocol fee · TX hash
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard({ token, email, onLogout, isDark }) {
  const [stats, setStats]               = useState(null);
  const [merchants, setMerchants]       = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscribers, setSubscribers]   = useState([]);
  const [payments, setPayments]         = useState([]);
  const [webhooks, setWebhooks]         = useState([]);
  const [auditLog, setAuditLog]         = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [tab, setTab]                   = useState("overview");
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [filter, setFilter]             = useState("all");
  const [search, setSearch]             = useState("");
  const [selectedSub, setSelectedSub]   = useState(null);
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";

  const REGISTRY_ADDRESS = isMainnet ? "[MAINNET]" : "0xBa8071912Ce59cD9D3D153120C59516fBae10A5C";
  const VAULT_ADDRESS    = isMainnet ? "[MAINNET]" : "0x9ce26F5d8C4cc7942022FFCa9D4D574D8c497662";
  const basescanBase     = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";

  const apiFetch = useCallback(async (path) => {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { onLogout(); throw new Error("Unauthorized"); }
    return res.json();
  }, [token, onLogout]);

  const fetchStats        = useCallback(async () => {
    try { setStats(await apiFetch("/api/admin/stats")); }
    catch { setError("Could not load stats."); }
    finally { setLoading(false); }
  }, [apiFetch]);

  const fetchMerchants    = useCallback(async () => {
    try { const d = await apiFetch("/api/admin/merchants"); setMerchants(d.merchants || []); }
    catch { console.error("Could not load merchants."); }
  }, [apiFetch]);

  const fetchSubscriptions = useCallback(async () => {
    try { const d = await apiFetch("/api/admin/subscriptions?limit=200"); setSubscriptions(d.subscriptions || []); }
    catch { console.error("Could not load subscriptions."); }
  }, [apiFetch]);

  const fetchSubscribers  = useCallback(async () => {
    try { const d = await apiFetch("/api/admin/subscribers?limit=200"); setSubscribers(d.subscribers || []); }
    catch { console.error("Could not load subscribers."); }
  }, [apiFetch]);

  const fetchPayments     = useCallback(async () => {
    try { const d = await apiFetch("/api/admin/payments?limit=200"); setPayments(d.payments || []); }
    catch { console.error("Could not load payments."); }
  }, [apiFetch]);

  const fetchWebhooks     = useCallback(async () => {
    try { const d = await apiFetch("/api/admin/webhooks?limit=100"); setWebhooks(d.deliveries || []); }
    catch { console.error("Could not load webhooks."); }
  }, [apiFetch]);

  const fetchAuditLog     = useCallback(async () => {
    try { const d = await apiFetch("/api/admin/audit-log?limit=100"); setAuditLog(d.entries || []); }
    catch { console.error("Could not load audit log."); }
  }, [apiFetch]);

  const fetchSystemHealth = useCallback(async () => {
    setSystemLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const d   = await res.json();
      setSystemHealth(d);
    } catch { console.error("Could not load system health."); }
    finally { setSystemLoading(false); }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchMerchants();
  }, [fetchStats, fetchMerchants]);

  // Lazy load tabs
  useEffect(() => {
    if (tab === "subscriptions" && subscriptions.length === 0) fetchSubscriptions();
    if (tab === "subscribers"   && subscribers.length === 0)   fetchSubscribers();
    if (tab === "payments"      && payments.length === 0)       fetchPayments();
    if (tab === "analytics"     && payments.length === 0)       fetchPayments();
    if (tab === "webhooks"      && webhooks.length === 0)       fetchWebhooks();
    if (tab === "audit"         && auditLog.length === 0)       fetchAuditLog();
    if (tab === "system")                                        fetchSystemHealth();
  }, [tab]);

  const pendingCount  = merchants.filter(m => !m.approved_at).length;
  const approvedCount = merchants.filter(m => !!m.approved_at).length;

  const filteredMerchants = merchants.filter(m => {
    if (filter === "pending")  return !m.approved_at;
    if (filter === "approved") return !!m.approved_at;
    if (search) return (
      m.business_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.wallet_address?.toLowerCase().includes(search.toLowerCase())
    );
    return true;
  });

  const filteredSubs = subscriptions.filter(s =>
    !search || (
      s.owner_address?.toLowerCase().includes(search.toLowerCase()) ||
      s.merchant_address?.toLowerCase().includes(search.toLowerCase()) ||
      s.id?.toString().includes(search) ||
      s.status?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const filteredSubscribers = subscribers.filter(s =>
    !search || (
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.wallet_address?.toLowerCase().includes(search.toLowerCase()) ||
      s.name?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const filteredPayments = payments.filter(p =>
    !search || (
      p.merchant_address?.toLowerCase().includes(search.toLowerCase()) ||
      p.tx_hash?.toLowerCase().includes(search.toLowerCase()) ||
      p.subscription_id?.toString().includes(search)
    )
  );

  const TABS = [
    ["overview",       "Overview"],
    ["merchants",      `Merchants${pendingCount > 0 ? ` · ${pendingCount} ⚠` : ""}`],
    ["subscriptions",  "Subscriptions"],
    ["subscribers",    "Subscribers"],
    ["payments",       "Payments"],
    ["webhooks",       "Webhooks"],
    ["analytics",      "Analytics"],
    ["tax",            "Tax"],
    ["audit",          "Audit log"],
    ["contracts",      "Contracts"],
    ["system",         "System ⚙"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", fontFamily: "'DM Sans', sans-serif", color: "var(--text-primary)" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Modals */}
      {selectedSub && <SubscriptionDetail sub={selectedSub} token={token} basescanBase={basescanBase} onClose={() => setSelectedSub(null)} />}
      {selectedMerchant && <MerchantDetail merchant={selectedMerchant} token={token} onClose={() => setSelectedMerchant(null)} />}

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 58,
        borderBottom: "0.5px solid var(--border)",
        background: "var(--bg-nav)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--bg-primary)" }}>A</div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: "var(--green)" }}>Once</span>
          </span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(251,191,36,0.15)", color: "var(--amber)", fontWeight: 600 }}>Admin</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: isMainnet ? "rgba(29,158,117,0.15)" : "rgba(59,130,246,0.15)", color: isMainnet ? "var(--green)" : "var(--blue)", fontWeight: 600 }}>
            {isMainnet ? "Base Mainnet" : "Base Sepolia"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{email}</span>
          <button onClick={onLogout} style={S.btn.ghost}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 32px" }}>

        {/* Header + global search */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.02em" }}>Protocol Admin</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
              {isMainnet ? "Base Mainnet — production" : "Base Sepolia — testnet"}
            </p>
          </div>
          <div style={{ width: 280 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search address, email, tx..." />
          </div>
        </div>

        {loading && <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>}
        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: 16, color: "var(--red)", fontSize: 13, marginBottom: 24 }}>
            {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: "0.5px solid var(--border)", marginBottom: 24, overflowX: "auto", flexWrap: "nowrap" }}>
          {TABS.map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)} style={{
              background: "none", border: "none", padding: "10px 14px", cursor: "pointer",
              fontSize: 12, fontWeight: tab === val ? 600 : 400, fontFamily: "inherit",
              color: tab === val ? "var(--text-primary)" : "var(--text-muted)",
              borderBottom: tab === val ? "2px solid var(--green)" : "2px solid transparent",
              transition: "all 0.15s", whiteSpace: "nowrap",
            }}>{label}</button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Active subscriptions" value={stats.subscriptions?.active || 0}              color="var(--green)" />
              <StatCard label="Paused"                value={stats.subscriptions?.paused || 0}              color="var(--amber)" />
              <StatCard label="Total payments"        value={stats.payments?.total || 0}                    color="var(--blue)" />
              <StatCard label="Volume (USDC)"         value={`$${(stats.payments?.volume_usdc || 0).toFixed(2)}`} color="var(--green)" />
              <StatCard label="Approved merchants"    value={approvedCount}                                 color="var(--text-secondary)" />
              <StatCard label="Pending approval"      value={pendingCount}                                  color="var(--amber)" />
            </div>

            <div style={{ ...S.card, padding: 24, marginBottom: 16 }}>
              <span style={S.label}>Subscription breakdown</span>
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                {[
                  { label: "Active",    value: stats.subscriptions?.active,    color: "var(--green)" },
                  { label: "Paused",    value: stats.subscriptions?.paused,    color: "var(--amber)" },
                  { label: "Cancelled", value: stats.subscriptions?.cancelled, color: "var(--red)" },
                  { label: "Expired",   value: stats.subscriptions?.expired,   color: "var(--text-muted)" },
                  { label: "Total",     value: stats.subscriptions?.total,     color: "var(--text-primary)" },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value || 0}</div>
                  </div>
                ))}
              </div>
            </div>

            {pendingCount > 0 && (
              <div style={{ background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: "var(--amber)", fontWeight: 600 }}>
                  {pendingCount} merchant{pendingCount !== 1 ? "s" : ""} pending approval
                </div>
                <button onClick={() => setTab("merchants")} style={{ background: "none", border: "none", color: "var(--amber)", fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
                  Review now →
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Merchants ── */}
        {tab === "merchants" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4, background: "var(--bg-tag)", borderRadius: 8, padding: 3 }}>
                {[["all", "All"], ["pending", "Pending"], ["approved", "Approved"]].map(([val, label]) => (
                  <button key={val} onClick={() => setFilter(val)} style={{
                    background: filter === val ? "var(--bg-card)" : "none",
                    border: filter === val ? "0.5px solid var(--border)" : "none",
                    borderRadius: 6, padding: "5px 14px", fontSize: 12,
                    fontWeight: filter === val ? 600 : 400, fontFamily: "inherit",
                    color: filter === val ? "var(--text-primary)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}>{label}</button>
                ))}
              </div>
              <button onClick={fetchMerchants} style={S.btn.ghost}>↻ Refresh</button>
            </div>
            <ManualApprove token={token} onRefresh={fetchMerchants} />
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ ...S.tableHeader, display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr auto" }}>
                <span>Merchant</span><span>Email</span><span>Registered</span><span>Status</span><span /><span />
              </div>
              {filteredMerchants.length === 0 ? <EmptyState message="No merchants found." /> :
                filteredMerchants.map((m, i) => (
                  <MerchantRow key={m.wallet_address} merchant={m} token={token}
                    onRefresh={fetchMerchants} isLast={i === filteredMerchants.length - 1}
                    onViewMerchant={setSelectedMerchant}
                  />
                ))
              }
            </div>
          </div>
        )}

        {/* ── Subscriptions ── */}
        {tab === "subscriptions" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{filteredSubs.length} subscriptions</span>
              <button onClick={fetchSubscriptions} style={S.btn.ghost}>↻ Refresh</button>
            </div>
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ ...S.tableHeader, display: "grid", gridTemplateColumns: "60px 2fr 2fr 1fr 1fr 1fr auto" }}>
                <span>ID</span><span>Owner</span><span>Merchant</span><span>Amount</span><span>Interval</span><span>Status</span><span />
              </div>
              {filteredSubs.length === 0 ? <EmptyState message="No subscriptions found." /> :
                filteredSubs.map((s, i) => (
                  <div key={s.id} style={{
                    display: "grid", gridTemplateColumns: "60px 2fr 2fr 1fr 1fr 1fr auto",
                    alignItems: "center", padding: "10px 20px",
                    borderBottom: i === filteredSubs.length - 1 ? "none" : "0.5px solid var(--border)",
                    fontSize: 12,
                  }}>
                    <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>#{s.id}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", cursor: "pointer" }}
                      onClick={() => copyToClipboard(s.owner_address)}>{shortAddr(s.owner_address)} ⧉</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)", cursor: "pointer" }}
                      onClick={() => copyToClipboard(s.merchant_address)}>{shortAddr(s.merchant_address)} ⧉</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{(s.amount / 1e6).toFixed(2)} {s.token_symbol || "USDC"}</span>
                    <span style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>{s.interval}</span>
                    <Badge status={s.status} />
                    <button onClick={() => setSelectedSub(s)} style={{ ...S.btn.ghost, fontSize: 11, padding: "3px 8px" }}>View</button>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── Subscribers ── */}
        {tab === "subscribers" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{filteredSubscribers.length} subscribers</span>
              <button onClick={fetchSubscribers} style={S.btn.ghost}>↻ Refresh</button>
            </div>
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ ...S.tableHeader, display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr" }}>
                <span>Email</span><span>Wallet</span><span>Auth</span><span>Joined</span>
              </div>
              {filteredSubscribers.length === 0 ? <EmptyState message="No subscribers found." /> :
                filteredSubscribers.map((s, i) => (
                  <div key={s.email} style={{
                    display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr",
                    alignItems: "center", padding: "10px 20px",
                    borderBottom: i === filteredSubscribers.length - 1 ? "none" : "0.5px solid var(--border)",
                    fontSize: 12,
                  }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{s.email}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-muted)", cursor: "pointer" }}
                      onClick={() => copyToClipboard(s.wallet_address)}>{shortAddr(s.wallet_address)} ⧉</span>
                    <span style={{ color: "var(--text-muted)" }}>{s.google_id ? "Google" : "Wallet"}</span>
                    <span style={{ color: "var(--text-muted)" }}>{formatDate(s.created_at)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── Payments ── */}
        {tab === "payments" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{filteredPayments.length} payments</span>
              <button onClick={fetchPayments} style={S.btn.ghost}>↻ Refresh</button>
            </div>
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ ...S.tableHeader, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr" }}>
                <span>Date</span><span>Merchant</span><span>Amount</span><span>Token</span><span>EUR equiv</span><span>TX</span>
              </div>
              {filteredPayments.length === 0 ? <EmptyState message="No payments found." /> :
                filteredPayments.map((p, i) => (
                  <div key={p.tx_hash || i} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                    alignItems: "center", padding: "10px 20px",
                    borderBottom: i === filteredPayments.length - 1 ? "none" : "0.5px solid var(--border)",
                    fontSize: 12,
                  }}>
                    <span style={{ color: "var(--text-muted)" }}>{formatDate(p.executed_at)}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{shortAddr(p.merchant_address)}</span>
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>${(p.merchant_received / 1e6).toFixed(2)}</span>
                    <span style={{ color: "var(--text-muted)" }}>{p.token_symbol || "USDC"}</span>
                    <span style={{ color: "var(--text-muted)" }}>{p.merchant_received_eur ? `€${p.merchant_received_eur}` : "—"}</span>
                    <a href={`${basescanBase}/tx/${p.tx_hash}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "monospace", fontSize: 10, color: "var(--green)", textDecoration: "none" }}>
                      {p.tx_hash ? `${p.tx_hash.slice(0, 8)}...` : "—"} ↗
                    </a>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── Webhooks ── */}
        {tab === "webhooks" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{webhooks.length} recent deliveries</span>
              <button onClick={fetchWebhooks} style={S.btn.ghost}>↻ Refresh</button>
            </div>
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ ...S.tableHeader, display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr" }}>
                <span>Time</span><span>Merchant</span><span>Event</span><span>Status</span><span>Attempts</span>
              </div>
              {webhooks.length === 0 ? <EmptyState message="No webhook deliveries." /> :
                webhooks.map((w, i) => (
                  <div key={w.id || i} style={{
                    display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr",
                    alignItems: "center", padding: "10px 20px",
                    borderBottom: i === webhooks.length - 1 ? "none" : "0.5px solid var(--border)",
                    fontSize: 12,
                  }}>
                    <span style={{ color: "var(--text-muted)" }}>{formatDateTime(w.created_at)}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{shortAddr(w.merchant_address)}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-primary)" }}>{w.event_type}</span>
                    <Badge status={w.delivered ? "delivered" : "failed"} />
                    <span style={{ color: "var(--text-muted)" }}>{w.attempt || 1}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── Analytics ── */}
        {tab === "analytics" && stats && (() => {
          const monthlyData = buildMonthlyGTV(payments);
          const mrr         = calcMRR(payments);
          const feeMRR      = calcFeeMRR(payments);
          const arr         = mrr * 12;
          const gtv         = payments.reduce((s, p) => s + parseFloat(p.amount_usdc || 0), 0);
          const totalFees   = payments.reduce((s, p) => s + parseFloat(p.fee_usdc || 0), 0);
          const tooltipStyle = {
            background: "var(--bg-card)", border: "0.5px solid var(--border)",
            borderRadius: 8, fontSize: 12, color: "var(--text-primary)",
          };
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* ── KPI row ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                <StatCard label="MRR (this month)" value={`$${mrr.toFixed(2)}`} color="var(--green)"
                  sub={`ARR $${arr.toFixed(0)}`} />
                <StatCard label="Protocol fee MRR" value={`$${feeMRR.toFixed(2)}`} color="var(--green)"
                  sub={`ARR $${(feeMRR * 12).toFixed(0)}`} />
                <StatCard label="GTV all-time" value={`$${gtv.toFixed(2)}`} color="var(--blue)" />
                <StatCard label="Fees all-time" value={`$${totalFees.toFixed(2)}`} color="var(--blue)" />
                <StatCard label="Active merchants" value={approvedCount} color="var(--text-secondary)" />
                <StatCard label="Active subscriptions" value={stats.subscriptions?.active || 0} color="var(--text-secondary)" />
              </div>

              {/* ── GTV bar chart ── */}
              <div style={{ ...S.card, padding: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                  Monthly GTV (USDC)
                </div>
                {monthlyData.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "32px 0" }}>
                    No payment data yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                      <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toFixed(2)}`, "GTV"]} />
                      <Bar dataKey="gtv" fill="rgba(52,211,153,0.7)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── Protocol fee area chart ── */}
              <div style={{ ...S.card, padding: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                  Monthly Protocol Fees (USDC)
                </div>
                {monthlyData.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "32px 0" }}>
                    No payment data yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="feeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                      <Tooltip contentStyle={tooltipStyle} formatter={v => [`$${v.toFixed(4)}`, "Fees"]} />
                      <Area type="monotone" dataKey="fees" stroke="#3b82f6" fill="url(#feeGradient)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── Subscription health ── */}
              <div style={{ ...S.card, padding: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                  Subscription health
                </div>
                <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                  {(() => {
                    const total     = stats.subscriptions?.total || 1;
                    const active    = stats.subscriptions?.active || 0;
                    const paused    = stats.subscriptions?.paused || 0;
                    const expired   = stats.subscriptions?.expired || 0;
                    const cancelled = stats.subscriptions?.cancelled || 0;
                    const churn     = total > 0 ? (((expired + cancelled) / total) * 100).toFixed(1) : "0.0";
                    const health    = total > 0 ? ((active / total) * 100).toFixed(1) : "0.0";
                    return [
                      { label: "Active rate",            value: `${health}%`,        color: "var(--green)" },
                      { label: "Churn rate",             value: `${churn}%`,         color: parseFloat(churn) > 10 ? "var(--red)" : "var(--text-muted)" },
                      { label: "In grace",               value: paused,              color: "var(--amber)" },
                      { label: "Lost (expired+cancelled)", value: expired + cancelled, color: "var(--red)" },
                    ];
                  })().map(({ label, value, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          );
        })()}

        {/* ── Tax ── */}
        {tab === "tax" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...S.card, padding: "16px 20px", background: "rgba(29,158,117,0.04)", border: "0.5px solid rgba(29,158,117,0.15)" }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                All exports include fiat equivalents at the exchange rate recorded at the time of each payment.
                AuthOnce records EUR, CHF, and your merchant's preferred currency for every transaction.
              </p>
            </div>
            <TaxExportPanel token={token} isAuthOnce={true} />
            <div style={{ ...S.card, padding: "16px 20px" }}>
              <span style={S.label}>Merchant tax exports</span>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.6 }}>
                Merchants download their own tax exports from their dashboard. You can also generate a report for any merchant from here for support purposes.
              </p>
              <TaxExportPanel token={token} isAuthOnce={false} />
            </div>
          </div>
        )}

        {/* ── Audit Log ── */}
        {tab === "audit" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Admin action history</span>
              <button onClick={fetchAuditLog} style={S.btn.ghost}>↻ Refresh</button>
            </div>
            <div style={{ ...S.card, overflow: "hidden" }}>
              <div style={{ ...S.tableHeader, display: "grid", gridTemplateColumns: "1fr 1fr 2fr 1fr" }}>
                <span>Time</span><span>Admin</span><span>Action</span><span>Target</span>
              </div>
              {auditLog.length === 0 ? <EmptyState message="No audit log entries yet." /> :
                auditLog.map((entry, i) => (
                  <div key={entry.id || i} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 2fr 1fr",
                    alignItems: "center", padding: "10px 20px",
                    borderBottom: i === auditLog.length - 1 ? "none" : "0.5px solid var(--border)",
                    fontSize: 12,
                  }}>
                    <span style={{ color: "var(--text-muted)" }}>{formatDateTime(entry.created_at)}</span>
                    <span style={{ color: "var(--text-secondary)" }}>{entry.admin_email}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-primary)", fontWeight: 500 }}>{entry.action}</span>
                    <span style={{ fontFamily: "monospace", color: "var(--text-muted)", fontSize: 11 }}>{shortAddr(entry.target_id) || "—"}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── Contracts ── */}
        {tab === "contracts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "SubscriptionVault v5", address: VAULT_ADDRESS,    note: "Subscription lifecycle, executePull, EIP-712, multi-token" },
              { label: "MerchantRegistry v2",  address: REGISTRY_ADDRESS, note: "Merchant whitelist, self-serve toggle, two-step admin transfer" },
              { label: "USDC",                 address: isMainnet ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : "0x036CbD53842c5426634e7929541eC2318f3dCF7e", note: "Primary payment token" },
            ].map(c => (
              <div key={c.label} style={{ ...S.card, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                  <a href={`${basescanBase}/address/${c.address}#writeContract`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "var(--green)", textDecoration: "none" }}>
                    View on Basescan ↗
                  </a>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", marginBottom: 4, wordBreak: "break-all", cursor: "pointer" }}
                  onClick={() => copyToClipboard(c.address)}>
                  {c.address} ⧉
                </div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{c.note}</div>
              </div>
            ))}

            <div style={{ background: "rgba(29,158,117,0.05)", border: "0.5px solid rgba(29,158,117,0.15)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--green)", marginBottom: 12 }}>Mainnet deployment checklist</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["Deploy SubscriptionVault v5 to Base Mainnet",          false],
                  ["Deploy MerchantRegistry v2 to Base Mainnet",           false],
                  ["Update VITE_NETWORK=mainnet in Cloudflare env",        false],
                  ["Update VAULT_ADDRESS + REGISTRY_ADDRESS in config.js", false],
                  ["Update keeper/notifier Railway env vars to mainnet",   false],
                  ["Set up Safe multisig + Ledger for treasury",           false],
                  ["Smart contract audit complete — Cyfrin or Hashlock",   false],
                  ["Legal opinion from Fio Legal received",                false],
                  ["VASP/CASP registration — IAPMEI Portugal",             false],
                  ["Transfer admin to Safe multisig on both contracts",    false],
                  ["Fund Protocol Treasury with USDC float",               false],
                ].map(([item, done]) => (
                  <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12, color: done ? "var(--green)" : "var(--text-muted)" }}>
                    <span style={{ flexShrink: 0, marginTop: 1, fontFamily: "monospace" }}>{done ? "✓" : "○"}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── System ── */}
        {tab === "system" && (() => {
          const s   = systemHealth;
          const k   = s?.services?.keeper;
          const dbS = s?.services?.database;
          const apiS = s?.services?.api;

          function SysRow({ label, status, detail }) {
            const color = status === "operational" ? "var(--green)"
              : status === "degraded" ? "var(--amber)"
              : status === "outage"   ? "var(--red)"
              : "var(--text-muted)";
            const dot = status === "operational" ? "●" : status === "degraded" ? "◐" : "○";
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "0.5px solid var(--border)" }}>
                <div>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{label}</span>
                  {detail && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{detail}</div>}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color }}>{dot} {status || "unknown"}</span>
              </div>
            );
          }

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{
                ...S.card, padding: "16px 20px",
                background: s?.status === "operational" ? "rgba(29,158,117,0.06)" : "rgba(251,191,36,0.06)",
                border: `0.5px solid ${s?.status === "operational" ? "rgba(29,158,117,0.2)" : "rgba(251,191,36,0.2)"}`,
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: s?.status === "operational" ? "var(--green)" : "var(--amber)", letterSpacing: "-0.01em" }}>
                  {systemLoading ? "Loading…" : s?.status === "operational" ? "● All Systems Operational" : s ? "◐ Partial Disruption" : "System status unavailable"}
                </div>
                {s?.timestamp && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Last checked {new Date(s.timestamp).toLocaleTimeString()}</div>}
              </div>
              <div style={{ ...S.card, padding: "4px 20px" }}>
                <SysRow label="API"             status={apiS?.status} detail="REST API · Railway" />
                <SysRow label="Database"        status={dbS?.status}  detail="PostgreSQL · Railway" />
                <SysRow label="Keeper Bot"      status={k?.status}
                  detail={k?.last_run_at
                    ? `Last run ${Math.floor((Date.now() - new Date(k.last_run_at).getTime()) / 1000)}s ago · ${k.last_cycle_ms}ms cycle`
                    : "No heartbeat yet"} />
                <SysRow label="Smart Contracts" status="operational"  detail={`Base Network · ${VAULT_ADDRESS}`} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12 }}>
                <StatCard label="Keeper cycle"       value={k?.last_cycle_ms ? `${k.last_cycle_ms}ms` : "—"} color="var(--text-secondary)" />
                <StatCard label="Keeper age"         value={k?.age_seconds != null ? `${k.age_seconds}s` : "—"} color={k?.age_seconds > 120 ? "var(--amber)" : "var(--green)"} />
                <StatCard label="Keeper ETH balance" value={k?.eth_balance != null ? `${parseFloat(k.eth_balance).toFixed(5)} ETH` : "—"} color={k?.eth_balance_warn ? "var(--red)" : k?.eth_balance != null ? "var(--green)" : "var(--text-secondary)"} />
                <StatCard label="Webhook rate (24h)" value={s ? `${s.metrics?.webhook_success_rate_24h ?? 100}%` : "—"} color="var(--green)" />
                <StatCard label="Failed webhooks"    value={s?.metrics?.failed_webhooks_24h ?? "—"} color={s?.metrics?.failed_webhooks_24h > 0 ? "var(--red)" : "var(--text-secondary)"} />
              </div>
              {k?.eth_balance_warn && (
                <div style={{ background: "rgba(220,38,38,0.08)", border: "0.5px solid rgba(220,38,38,0.3)", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>Keeper wallet low on ETH</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      Balance: {k.eth_balance != null ? parseFloat(k.eth_balance).toFixed(5) : "—"} ETH · Threshold: 0.005 ETH · Top up <code style={{ fontSize: 10 }}>0xdCEa737ec293DFF0B18C315CA90f494F8CB2C151</code> on Base Network
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={fetchSystemHealth} style={S.btn.ghost}>↻ Refresh</button>
                <a href="/status" target="_blank" rel="noopener noreferrer"
                  style={{ ...S.btn.ghost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                  Public status page ↗
                </a>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
