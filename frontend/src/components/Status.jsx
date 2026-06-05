// src/components/Status.jsx
// AuthOnce — Public Status Page
// Polls /api/status every 30 seconds. No auth required.

import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

function ago(isoStr) {
  if (!isoStr) return "never";
  const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function StatusDot({ status }) {
  const color = status === "operational" ? "#10b981"
    : status === "degraded"    ? "#f59e0b"
    : status === "outage"      ? "#ef4444"
    : "#94a3b8";
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: color, marginRight: 8, flexShrink: 0,
      boxShadow: status === "operational" ? `0 0 0 3px ${color}22` : "none",
    }} />
  );
}

function ServiceRow({ name, service, detail }) {
  const status = service?.status || "unknown";
  const label  = status === "operational" ? "Operational"
    : status === "degraded" ? "Degraded"
    : status === "outage"   ? "Outage"
    : "Unknown";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 0", borderBottom: "0.5px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot status={status} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#0f172a" }}>{name}</div>
          {detail && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{detail}</div>}
        </div>
      </div>
      <span style={{
        fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
        background: status === "operational" ? "#ecfdf5"
          : status === "degraded" ? "#fffbeb"
          : status === "outage"   ? "#fef2f2"
          : "#f8fafc",
        color: status === "operational" ? "#059669"
          : status === "degraded" ? "#d97706"
          : status === "outage"   ? "#dc2626"
          : "#94a3b8",
      }}>
        {label}
      </span>
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)",
      borderRadius: 12, padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || "#0f172a", letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function Status() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  const overall = data?.status || "unknown";
  const overallLabel = overall === "operational" ? "All Systems Operational"
    : overall === "degraded" ? "Partial Service Disruption"
    : "Service Status Unknown";
  const overallColor = overall === "operational" ? "#059669"
    : overall === "degraded" ? "#d97706"
    : "#94a3b8";
  const overallBg = overall === "operational" ? "#ecfdf5"
    : overall === "degraded" ? "#fffbeb"
    : "#f8fafc";

  const keeper  = data?.services?.keeper;
  const cycleMs = keeper?.last_cycle_ms;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif" }}>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 56,
        background: "rgba(248,250,252,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "0.5px solid rgba(0,0,0,0.06)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 24, height: 24 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: "#059669" }}>Once</span>
          </span>
        </a>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          {lastRefresh ? `Updated ${ago(lastRefresh.toISOString())}` : "Loading…"}
          <button
            onClick={fetchStatus}
            style={{
              marginLeft: 12, background: "none", border: "0.5px solid rgba(0,0,0,0.1)",
              borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#64748b",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Refresh
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px" }}>

        {/* Overall status banner */}
        <div style={{
          background: overallBg, border: `0.5px solid ${overallColor}33`,
          borderRadius: 16, padding: "24px 28px", marginBottom: 32,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: "50%", background: overallColor, flexShrink: 0,
            boxShadow: `0 0 0 4px ${overallColor}22`,
          }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {loading ? "Checking status…" : overallLabel}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
              {data?.timestamp ? `Last checked ${ago(data.timestamp)}` : "Connecting to API…"}
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            background: "#fef2f2", border: "0.5px solid #fca5a5", borderRadius: 10,
            padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#dc2626",
          }}>
            Could not reach API: {error}
          </div>
        )}

        {/* Services */}
        <div style={{
          background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)",
          borderRadius: 16, padding: "8px 24px", marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", padding: "16px 0 8px" }}>
            Services
          </div>
          <ServiceRow
            name="API"
            service={data?.services?.api}
            detail="REST API · authonce.io"
          />
          <ServiceRow
            name="Database"
            service={data?.services?.database}
            detail="PostgreSQL · subscription data"
          />
          <ServiceRow
            name="Keeper Bot"
            service={data?.services?.keeper}
            detail={keeper?.last_run_at
              ? `Last run ${ago(keeper.last_run_at)}${cycleMs ? ` · ${cycleMs}ms` : ""}`
              : "Monitors and executes subscription pulls"}
          />
          <ServiceRow
            name="Smart Contracts"
            service={data?.services?.contracts}
            detail={`Base Network · ${data?.services?.contracts?.network || "base-sepolia"}`}
          />
        </div>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
          <MetricCard
            label="Webhook success rate (24h)"
            value={data ? `${data.metrics?.webhook_success_rate_24h ?? 100}%` : "—"}
            color={data?.metrics?.webhook_success_rate_24h < 90 ? "#d97706" : "#059669"}
          />
          <MetricCard
            label="Keeper cycle time"
            value={cycleMs ? `${cycleMs}ms` : "—"}
            sub={cycleMs > 5000 ? "⚠ slower than usual" : cycleMs ? "nominal" : "no data yet"}
            color={cycleMs > 5000 ? "#d97706" : "#0f172a"}
          />
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: 12, color: "#cbd5e1" }}>
          <a href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>authonce.io</a>
          {" · "}
          <a href="/privacy" style={{ color: "#94a3b8", textDecoration: "none" }}>Privacy</a>
          {" · "}
          <a href="mailto:security@authonce.io" style={{ color: "#94a3b8", textDecoration: "none" }}>security@authonce.io</a>
          <div style={{ marginTop: 8 }}>Auto-refreshes every 30 seconds</div>
        </div>

      </div>
    </div>
  );
}
