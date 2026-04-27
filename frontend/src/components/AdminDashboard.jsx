// src/components/AdminDashboard.jsx — AuthOnce Admin Dashboard
import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

export default function AdminDashboard({ token, email, onLogout, isDark }) {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  const bg      = isDark ? "#080c14" : "#f8fafc";
  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9" : "#0f172a";
  const muted   = isDark ? "#64748b" : "#94a3b8";
  const accent  = "#34d399";

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError("Could not load stats.");
    }
    setLoading(false);
  }

  const statCards = stats ? [
    { label: "Active subscriptions", value: stats.subscriptions.active, color: accent },
    { label: "Paused", value: stats.subscriptions.paused, color: "#fbbf24" },
    { label: "Total payments", value: stats.payments.total, color: "#3b82f6" },
    { label: "Volume (USDC)", value: `$${stats.payments.volume_usdc.toFixed(2)}`, color: accent },
  ] : [];

  return (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 58,
        borderBottom: `0.5px solid ${border}`,
        background: isDark ? "rgba(8,12,20,0.95)" : "rgba(248,250,252,0.95)",
        backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: text, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: accent }}>Once</span>
          </span>
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 99,
            background: "rgba(251,191,36,0.15)", color: "#d97706", fontWeight: 600,
          }}>Admin</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: muted }}>{email}</span>
          <button onClick={onLogout} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 6, padding: "5px 12px", cursor: "pointer",
            color: muted, fontSize: 12,
          }}>Sign out</button>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 32px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: text, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Dashboard
        </h2>
        <p style={{ color: muted, fontSize: 14, margin: "0 0 32px", fontWeight: 300 }}>
          Protocol overview — Base Sepolia testnet
        </p>

        {loading && (
          <p style={{ color: muted, fontSize: 14 }}>Loading stats…</p>
        )}

        {error && (
          <div style={{
            background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)",
            borderRadius: 8, padding: 16, color: "#f87171", fontSize: 13,
          }}>{error}</div>
        )}

        {/* Stat cards */}
        {stats && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16,
            marginBottom: 32,
          }}>
            {statCards.map((s, i) => (
              <div key={i} style={{
                background: cardBg, border: `0.5px solid ${border}`,
                borderRadius: 12, padding: "20px 24px",
              }}>
                <div style={{ fontSize: 11, color: muted, marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {s.label}
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 700, color: s.color,
                  fontFamily: "'DM Mono', monospace", letterSpacing: "-0.02em",
                }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Subscription breakdown */}
        {stats && (
          <div style={{
            background: cardBg, border: `0.5px solid ${border}`,
            borderRadius: 12, padding: 24, marginBottom: 24,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: text, margin: "0 0 16px", letterSpacing: "-0.01em" }}>
              Subscription breakdown
            </h3>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {[
                { label: "Active",    value: stats.subscriptions.active,    color: "#34d399" },
                { label: "Paused",    value: stats.subscriptions.paused,    color: "#fbbf24" },
                { label: "Cancelled", value: stats.subscriptions.cancelled, color: "#f87171" },
                { label: "Expired",   value: stats.subscriptions.expired,   color: "#94a3b8" },
                { label: "Total",     value: stats.subscriptions.total,     color: text },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "'DM Mono', monospace" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* On-chain actions note */}
        <div style={{
          background: isDark ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.04)",
          border: "0.5px solid rgba(59,130,246,0.2)",
          borderRadius: 12, padding: 20,
        }}>
          <p style={{ fontSize: 13, color: "#3b82f6", margin: 0, fontWeight: 400 }}>
            <strong>On-chain actions</strong> (approve merchants, change fees) require connecting your Ledger hardware wallet. 
            These are available on the contract directly via Basescan until the admin UI is complete.
          </p>
          <a
            href="https://sepolia.basescan.org/address/0x1fA825065260a4e775AbD8D2596B1869904e446A#writeContract"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#3b82f6", display: "inline-block", marginTop: 8 }}
          >
            MerchantRegistry on Basescan →
          </a>
        </div>
      </div>
    </div>
  );
}
