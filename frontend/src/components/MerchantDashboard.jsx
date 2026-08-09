// src/components/MerchantDashboard.jsx — Visual redesign May 2026
// Logic: unchanged. Visual: full overhaul — sidebar nav, consistent tokens, both themes.
import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useWriteContract, useSignMessage } from "wagmi";
import { QRCodeSVG } from "qrcode.react";
import { createPublicClient, http, fallback } from "viem";
import { baseSepolia } from "wagmi/chains";
import {
  VAULT_ADDRESS, VAULT_ABI, REGISTRY_ADDRESS, REGISTRY_ABI, RPC_URLS,
  INTERVAL_NAMES, STATUS_NAMES, STATUS_COLORS, TOKEN_ADDRESSES,
  shortAddress, formatUSDC,
} from "../config.js";
import {
  merchantLogin, merchantFetch, getMerchantWalletFromToken, clearMerchantToken,
} from "../lib/merchantAuth.js";

// ─── Token-aware amount formatting ───────────────────────────────────────────
const _NETWORK        = import.meta.env.VITE_NETWORK || "base-sepolia";
const _NETWORK_TOKENS = TOKEN_ADDRESSES[_NETWORK] || TOKEN_ADDRESSES["base-sepolia"];
const _TOKEN_DECIMALS = Object.fromEntries(
  Object.entries(_NETWORK_TOKENS).map(([id, addr]) => [
    addr.toLowerCase(), 6, // all supported tokens (USDC, USDT, EURC) use 6 decimals
  ])
);
const _TOKEN_LABELS = Object.fromEntries(
  Object.entries(_NETWORK_TOKENS).map(([id, addr]) => [
    addr.toLowerCase(), id.toUpperCase(),
  ])
);
function formatTokenAmount(amountRaw, tokenAddr) {
  const decimals = _TOKEN_DECIMALS[(tokenAddr || "").toLowerCase()] ?? 6;
  const divisor  = BigInt(10 ** decimals);
  const raw      = BigInt(amountRaw || 0);
  return Number(raw / divisor) + Number(raw % divisor) / Number(divisor);
}
function tokenLabel(tokenAddr) {
  return _TOKEN_LABELS[(tokenAddr || "").toLowerCase()] || "USDC";
}

const client = createPublicClient({
  chain: baseSepolia,
  transport: fallback(RPC_URLS.map(url => http(url))),
});

const BASE_URL = "https://authonce.io/pay";

// Supported fiat currencies for product pricing
const FIAT_CURRENCIES = [
  { code: "eur", symbol: "€",  label: "EUR — Euro" },
  { code: "usd", symbol: "$",  label: "USD — US Dollar" },
  { code: "gbp", symbol: "£",  label: "GBP — British Pound" },
  { code: "chf", symbol: "Fr", label: "CHF — Swiss Franc" },
  { code: "brl", symbol: "R$", label: "BRL — Brazilian Real" },
  { code: "cad", symbol: "C$", label: "CAD — Canadian Dollar" },
  { code: "aud", symbol: "A$", label: "AUD — Australian Dollar" },
  { code: "sek", symbol: "kr", label: "SEK — Swedish Krona" },
  { code: "nok", symbol: "kr", label: "NOK — Norwegian Krone" },
  { code: "dkk", symbol: "kr", label: "DKK — Danish Krone" },
  { code: "sgd", symbol: "S$", label: "SGD — Singapore Dollar" },
  { code: "hkd", symbol: "HK$", label: "HKD — Hong Kong Dollar" },
  { code: "inr", symbol: "₹",  label: "INR — Indian Rupee" },
  { code: "jpy", symbol: "¥",  label: "JPY — Japanese Yen" },
  { code: "krw", symbol: "₩",  label: "KRW — South Korean Won" },
];

function getCurrencySymbol(code) {
  return FIAT_CURRENCIES.find(c => c.code === code)?.symbol || code.toUpperCase();
}

// Tokens allowed for subscriptions — stablecoins only until Chainlink oracle (v6)
// WETH and cbBTC excluded: volatile pricing requires USD-denominated oracle conversion
const SUBSCRIPTION_TOKENS = [
  { id: "usdc",  label: "⬡ USDC",  note: "" },
  { id: "usdt",  label: "₮ USDT",  note: "" },
  { id: "eurc",  label: "€ EURC",  note: "" },
];
const VOLATILE_TOKENS = ["weth", "cbbtc", "wbtc"];
const API_BASE = "https://the-opportunity-production.up.railway.app";

// ─── Design tokens (supplement CSS vars) ─────────────────────────────────────
const S = {
  btn: {
    primary: {
      background: "var(--green)", border: "none", borderRadius: 8,
      color: "var(--bg-primary)", fontWeight: 700, fontSize: 13,
      padding: "9px 18px", cursor: "pointer", fontFamily: "inherit",
      transition: "opacity 0.15s",
    },
    ghost: {
      background: "transparent", border: "0.5px solid var(--border)",
      borderRadius: 8, color: "var(--text-secondary)", fontSize: 13,
      padding: "9px 18px", cursor: "pointer", fontFamily: "inherit",
      transition: "border-color 0.15s",
    },
    danger: {
      background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)",
      borderRadius: 8, color: "var(--red)", fontSize: 12,
      padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
    },
    amber: {
      background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.2)",
      borderRadius: 6, color: "var(--amber)", fontSize: 11, fontWeight: 600,
      padding: "4px 10px", cursor: "pointer", fontFamily: "inherit",
    },
  },
  card: {
    background: "var(--bg-card)", border: "0.5px solid var(--border)",
    borderRadius: 14, padding: "20px 22px", boxShadow: "var(--shadow)",
  },
  label: {
    fontSize: 11, color: "var(--text-secondary)",
    letterSpacing: "0.08em", textTransform: "uppercase",
    marginBottom: 14, display: "block",
  },
  row: {
    display: "flex", justifyContent: "space-between",
    padding: "10px 0", borderBottom: "0.5px solid var(--border)",
    alignItems: "center",
  },
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "0.5px solid var(--border)",
      borderRadius: 14, padding: "20px 22px", boxShadow: "var(--shadow)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</span>
        {icon && <span style={{ fontSize: 16, opacity: 0.5 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const name = STATUS_NAMES[status] || "Unknown";
  const cfg  = STATUS_COLORS[name] || { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 99,
      fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
      {name}
    </span>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "overview",    label: "Overview",    icon: "◎" },
  { id: "analytics",  label: "Analytics",   icon: "⊿" },
  { id: "products",    label: "Products",    icon: "⊞" },
  { id: "subscribers", label: "Subscribers", icon: "⊙" },
  { id: "payments",    label: "Payments",    icon: "⊟" },
  { id: "webhooks",    label: "Webhooks",    icon: "⌁" },
  { id: "settings",    label: "Settings",    icon: "⊕" },
];

function Sidebar({ tab, setTab, onPaymentsClick, activeSubs, totalMRR, products, isApproved, address, approvalBadge }) {
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: "var(--bg-card)", border: "0.5px solid var(--border)",
      borderRadius: 16, padding: "20px 0",
      display: "flex", flexDirection: "column",
      boxShadow: "var(--shadow)", alignSelf: "flex-start",
      position: "sticky", top: 80,
    }}>
      {/* Merchant identity */}
      <div style={{ padding: "0 18px 18px", borderBottom: "0.5px solid var(--border)" }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Merchant Portal</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-primary)", fontWeight: 600, marginBottom: 8 }}>{shortAddress(address)}</div>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 600,
          background: approvalBadge.bg, color: approvalBadge.color,
        }}>
          {approvalBadge.label}
        </span>
      </div>

      {/* Nav items */}
      <nav style={{ padding: "10px 10px", flex: 1 }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => item.id === "payments" ? onPaymentsClick() : setTab(item.id)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: 8, border: "none",
              background: tab === item.id ? "rgba(var(--green-rgb, 29,158,117), 0.1)" : "transparent",
              color: tab === item.id ? "var(--green)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: tab === item.id ? 600 : 400,
              cursor: "pointer", textAlign: "left", fontFamily: "inherit",
              transition: "all 0.12s",
              borderLeft: tab === item.id ? "2px solid var(--green)" : "2px solid transparent",
              marginBottom: 2,
            }}
          >
            <span style={{ fontSize: 14, opacity: 0.7 }}>{item.icon}</span>
            {item.label}
            {item.id === "subscribers" && activeSubs > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: "var(--green)", color: "var(--bg-primary)", borderRadius: 99, padding: "1px 6px" }}>{activeSubs}</span>
            )}
            {item.id === "products" && products > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{products}</span>
            )}
          </button>
        ))}
      </nav>

      {/* MRR footer */}
      <div style={{ padding: "14px 18px 0", borderTop: "0.5px solid var(--border)" }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>MRR</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: "var(--green)" }}>${totalMRR.toFixed(2)}</div>
      </div>
    </aside>
  );
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────
// Full MRR + GTV analytics with Recharts. Fetches from /api/merchants/:address/analytics.
// Replaces the old hand-rolled MRRChart.

const RANGE_OPTIONS = [
  { id: "30d", label: "30d" },
  { id: "6m",  label: "6M"  },
  { id: "12m", label: "12M" },
  { id: "24m", label: "All" },
];

// Custom tooltip shared by both charts
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-card)", border: "0.5px solid var(--border)",
      borderRadius: 8, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      fontSize: 12,
    }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 6, fontSize: 11 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ color: "var(--text-secondary)" }}>{p.name}</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 700, fontFamily: "monospace", marginLeft: "auto", paddingLeft: 16 }}>
            ${parseFloat(p.value || 0).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Stat pill inside the analytics panel
function AnalyticsStat({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: color || "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{sub}</span>}
    </div>
  );
}

function AnalyticsPanel({ address, merchantAuthReady }) {
  const [range, setRange]         = useState("12m");
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeChart, setActiveChart] = useState("mrr"); // "mrr" | "gtv"

  // [BUG FIX — Aug 2026] This effect used to fire on mount keyed only on
  // [address, range], racing the async wallet-signature login and landing a
  // permanent "Could not load analytics: HTTP 401" with no retry once the
  // session token actually arrived. Now waits for merchantAuthReady and
  // re-fires the moment it flips true, instead of erroring once and never
  // trying again.
  useEffect(() => {
    if (!address) return;
    if (!merchantAuthReady) {
      setLoading(true);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    merchantFetch(`${API_BASE}/api/merchants/${address}/analytics?range=${range}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [address, range, merchantAuthReady]);

  // Format month key "2026-05" → "May" or "May '26"
  const fmtMonth = (key, short = false) => {
    if (!key) return "";
    const [y, m] = key.split("-");
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    if (short) return d.toLocaleDateString("en-GB", { month: "short" });
    return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  };

  // Build chart data — label every month for short ranges, every other for long
  const chartData = (data?.months || []).map((m, i, arr) => ({
    ...m,
    label:        arr.length <= 6 ? fmtMonth(m.month, true) : (i % 2 === 0 ? fmtMonth(m.month) : ""),
    mrr_display:  parseFloat(m.mrr_usdc   || 0),
    gtv_display:  parseFloat(m.gtv_usdc   || 0),
    net_display:  parseFloat(m.net_usdc   || 0),
    fee_display:  parseFloat(m.fee_usdc   || 0),
    new_subs:     parseInt(m.new_subs     || 0),
    churned:      parseInt(m.churned      || 0),
  }));

  const s = data?.summary;

  const GREEN       = "#1D9E75";
  const GREEN_FADE  = "rgba(29,158,117,0.08)";
  const BLUE        = "#3b82f6";
  const BLUE_FADE   = "rgba(59,130,246,0.08)";
  const RED         = "#f87171";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Header row: stat pills + range toggle */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <AnalyticsStat
            label="MRR"
            value={s ? `$${parseFloat(s.current_mrr).toFixed(2)}` : "—"}
            sub="monthly recurring"
            color={GREEN}
          />
          <AnalyticsStat
            label="GTV"
            value={s ? `$${parseFloat(s.total_gtv).toFixed(2)}` : "—"}
            sub="all-time gross volume"
          />
          <AnalyticsStat
            label="Net Revenue"
            value={s ? `$${parseFloat(s.total_net).toFixed(2)}` : "—"}
            sub="after 0.5% fee"
            color={GREEN}
          />
          <AnalyticsStat
            label="Active Subs"
            value={s?.active_subs ?? "—"}
            sub={s?.churn_rate_pct != null ? `${s.churn_rate_pct}% churn rate` : ""}
          />
          <AnalyticsStat
            label="ARPU"
            value={s?.arpu != null ? `$${parseFloat(s.arpu).toFixed(2)}` : "—"}
            sub="avg revenue per user"
          />
          <AnalyticsStat
            label="LTV"
            value={s?.ltv != null ? `$${parseFloat(s.ltv).toFixed(2)}` : s?.ltv === null ? "∞" : "—"}
            sub="lifetime value est."
            color={GREEN}
          />
          <AnalyticsStat
            label="Churn rate"
            value={s?.churn_rate_pct != null ? `${s.churn_rate_pct}%` : "—"}
            sub="cancelled + expired"
            color={s?.churn_rate_pct > 10 ? RED : undefined}
          />
        </div>

        {/* Range toggle */}
        <div style={{ display: "flex", gap: 4, background: "var(--bg-tag)", padding: 3, borderRadius: 8, border: "0.5px solid var(--border)", alignSelf: "flex-start" }}>
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setRange(opt.id)}
              style={{
                padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                background: range === opt.id ? "var(--bg-card)" : "transparent",
                color: range === opt.id ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: range === opt.id ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                transition: "all 0.15s",
              }}
            >{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Chart type tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--border)", marginBottom: 20 }}>
        {[
          { id: "mrr",     label: "MRR over time" },
          { id: "gtv",     label: "GTV & revenue" },
          { id: "cohort",  label: "New vs churned" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveChart(t.id)}
            style={{
              padding: "8px 16px", border: "none", background: "transparent",
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              color: activeChart === t.id ? GREEN : "var(--text-muted)",
              borderBottom: `2px solid ${activeChart === t.id ? GREEN : "transparent"}`,
              marginBottom: -1, transition: "all 0.15s",
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Chart area */}
      {loading ? (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
          Loading analytics…
        </div>
      ) : error ? (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: RED, fontSize: 12 }}>
          Could not load analytics: {error}
        </div>
      ) : chartData.length === 0 || chartData.every(d => d.mrr_display === 0 && d.gtv_display === 0) ? (
        <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", gap: 8 }}>
          <div style={{ fontSize: 28, opacity: 0.2 }}>◎</div>
          <div style={{ fontSize: 13 }}>No payment data yet</div>
          <div style={{ fontSize: 11 }}>Charts will appear after the first keeper pull.</div>
        </div>
      ) : activeChart === "mrr" ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity={0.25} />
                <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="mrr_display" name="MRR" stroke={GREEN} strokeWidth={2} fill="url(#mrrGrad)" dot={false} activeDot={{ r: 4, fill: GREEN, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : activeChart === "gtv" ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{value}</span>}
            />
            <Bar dataKey="gtv_display" name="GTV"         fill={BLUE}  fillOpacity={0.7} radius={[3,3,0,0]} maxBarSize={28} />
            <Bar dataKey="net_display" name="Net revenue" fill={GREEN} fillOpacity={0.85} radius={[3,3,0,0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      ) : activeChart === "cohort" ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{value}</span>}
            />
            <Bar dataKey="new_subs" name="New"     fill={GREEN} fillOpacity={0.85} radius={[3,3,0,0]} maxBarSize={28} />
            <Bar dataKey="churned"  name="Churned" fill={RED}   fillOpacity={0.7}  radius={[3,3,0,0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      ) : (<></>)}

      {/* Active subscriber trend below charts */}
      {!loading && !error && chartData.some(d => d.active_count > 0) && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "0.5px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Active subscribers by month
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 48 }}>
            {chartData.map((d, i) => {
              const max = Math.max(...chartData.map(m => m.active_count), 1);
              const h   = Math.max((d.active_count / max) * 44, d.active_count > 0 ? 3 : 0);
              const isLast = i === chartData.length - 1;
              return (
                <div key={d.month} title={`${d.label || d.month}: ${d.active_count} active`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{
                    width: "100%", height: h,
                    background: isLast ? GREEN : `rgba(29,158,117,${0.15 + (i / chartData.length) * 0.5})`,
                    borderRadius: "2px 2px 0 0", transition: "height 0.4s ease",
                  }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{chartData[0]?.label || ""}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{chartData[chartData.length - 1]?.label || "Now"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trial Link Popover ───────────────────────────────────────────────────────
function TrialPopover({ product, address, onClose }) {
  const [days, setDays]     = useState("30");
  const [copied, setCopied] = useState(false);
  const clampedDays = Math.min(Math.max(parseInt(days) || 1, 1), 60);
  const url = `${BASE_URL}/${address.toLowerCase()}/${product.slug}?trial=${clampedDays}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 1500);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }} onClick={onClose}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Trial link — {product.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Subscribers who use this link get a free trial before their first payment.</div>
        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>Trial duration (days · 1–60)</label>
          <input type="number" min="1" max="60" value={days} onChange={e => setDays(e.target.value)} />
        </div>
        <div style={{ background: "rgba(29,158,117,0.06)", border: "0.5px solid rgba(29,158,117,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
          {url}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleCopy} style={{ ...S.btn.primary, flex: 1, opacity: copied ? 0.7 : 1 }}>
            {copied ? "✓ Copied!" : "Copy Trial Link"}
          </button>
          <button onClick={onClose} style={S.btn.ghost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Price Change Modal ───────────────────────────────────────────────────────
function PriceChangeModal({ product, address, onClose }) {
  const [noticeDays, setNoticeDays]       = useState("30");
  const [subscriptions, setSubscriptions] = useState([]);
  const [loadingSubs, setLoadingSubs]     = useState(true);
  const [progress, setProgress]           = useState(null);
  const [saving, setSaving]               = useState(false);
  const [done, setDone]                   = useState(false);
  const [errorMsg, setErrorMsg]           = useState("");
  const { writeContractAsync }            = useWriteContract();

  const expiresAt  = Math.floor(Date.now() / 1000) + Math.max(parseInt(noticeDays) || 30, 30) * 86400;
  const expiryDate = new Date(expiresAt * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    const INTERVAL_MAP     = { weekly: 0, monthly: 1, yearly: 2 };
    const productInterval  = typeof product.interval === "number" ? product.interval : (INTERVAL_MAP[product.interval] ?? 1);
    const productAmountRaw = Math.round(product.amount * 1e6);
    const subs = [];
    let id = 0;
    const scan = async () => {
      setLoadingSubs(true);
      while (true) {
        try {
          const sub = await client.readContract({
            address: VAULT_ADDRESS, abi: VAULT_ABI,
            functionName: "subscriptions", args: [BigInt(id)],
          });
          if (sub[0] === "0x0000000000000000000000000000000000000000") break;
          if (
            sub[2].toLowerCase() === address.toLowerCase() &&
            Number(sub[5]) === productAmountRaw &&
            Number(sub[9]) === productInterval &&
            Number(sub[17]) === 0
          ) { subs.push(id); }
          id++;
        } catch { break; }
      }
      setSubscriptions(subs);
      setLoadingSubs(false);
    };
    scan();
  }, [product, address]);

  const handleSchedule = async () => {
    if (subscriptions.length === 0) return;
    setSaving(true);
    setErrorMsg("");
    setProgress({ done: 0, total: subscriptions.length });
    for (let i = 0; i < subscriptions.length; i++) {
      try {
        await writeContractAsync({
          address: VAULT_ADDRESS, abi: VAULT_ABI,
          functionName: "setProductExpiry",
          args: [BigInt(subscriptions[i]), BigInt(expiresAt)],
        });
        setProgress({ done: i + 1, total: subscriptions.length });
      } catch (err) {
        setErrorMsg(`Failed on subscription #${subscriptions[i]}: ${err.shortMessage || err.message}`);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setDone(true);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }} onClick={onClose}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Price Change Notice — {product.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Schedule a price change for all active subscribers. Each will be notified by email and can cancel before the expiry date. Minimum 30 days enforced on-chain.
        </div>
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--text-muted)" }}>
          {loadingSubs ? "Scanning active subscriptions..." : (
            <span>Found <strong style={{ color: "var(--text-primary)" }}>{subscriptions.length}</strong> active subscription{subscriptions.length !== 1 ? "s" : ""}{subscriptions.length === 0 ? " — nothing to notify." : "."}</span>
          )}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Notice period (days · min 30)</label>
          <input type="number" min="30" max="365" value={noticeDays} onChange={e => setNoticeDays(e.target.value)} disabled={saving || done} />
        </div>
        <div style={{ background: "rgba(248,113,113,0.06)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--text-muted)" }}>
          Subscriptions expire on <strong style={{ color: "var(--red)" }}>{expiryDate}</strong>. Subscribers receive email notice and can cancel before that date.
        </div>
        {progress && !done && (
          <div style={{ background: "rgba(29,158,117,0.06)", border: "0.5px solid rgba(29,158,117,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--green)" }}>
            Scheduling... {progress.done} / {progress.total}
            <div style={{ marginTop: 6, background: "rgba(29,158,117,0.2)", borderRadius: 4, height: 4 }}>
              <div style={{ background: "var(--green)", height: 4, borderRadius: 4, width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        )}
        {errorMsg && <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--red)" }}>{errorMsg}</div>}
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
            <div style={{ color: "var(--green)", fontSize: 13, fontWeight: 600 }}>Scheduled for {subscriptions.length} subscription{subscriptions.length !== 1 ? "s" : ""}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Subscribers can cancel before {expiryDate}.</div>
            <button onClick={onClose} style={{ ...S.btn.ghost, marginTop: 16 }}>Close</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={saving || loadingSubs || subscriptions.length === 0} onClick={handleSchedule}
              style={{ ...S.btn.danger, flex: 1, padding: "10px", fontSize: 13, fontWeight: 700, opacity: saving || loadingSubs || subscriptions.length === 0 ? 0.5 : 1 }}>
              {saving ? `Scheduling ${progress?.done || 0}/${progress?.total || subscriptions.length}...` : `Schedule for ${subscriptions.length} subscriber${subscriptions.length !== 1 ? "s" : ""}`}
            </button>
            <button onClick={onClose} disabled={saving} style={S.btn.ghost}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Product Modal ────────────────────────────────────────────────────────
function AddProductModal({ merchantAddress, onClose, onAdded }) {
  const [name, setName]               = useState("");
  const [amount, setAmount]           = useState("");
  const [interval, setInterval]       = useState("1");
  const [hasIntro, setHasIntro]       = useState(false);
  const [introAmount, setIntroAmount] = useState("");
  const [introPulls, setIntroPulls]   = useState("1");
  const [hasYearly, setHasYearly]     = useState(false);
  const [yearlyAmount, setYearlyAmount] = useState("");
  const CRYPTO_TOKEN_IDS = ["usdc", "usdt", "eurc"];
  const [cryptoTokens, setCryptoTokens]     = useState(["usdc"]);
  const [fiatCurrency, setFiatCurrency]     = useState("eur");
  const [gracePeriod, setGracePeriod]   = useState("7");
  const [saving, setSaving]             = useState(false);
  const [errors, setErrors]             = useState({});

  const intervalLabel  = { "0": "week", "1": "month", "2": "year" };
  const currencySymbol = getCurrencySymbol(fiatCurrency);
  const yearlySuggestion = amount ? (parseFloat(amount) * 12 * 0.8).toFixed(2) : "";
  const yearlyDiscount   = amount && yearlyAmount
    ? Math.round((1 - parseFloat(yearlyAmount) / (parseFloat(amount) * 12)) * 100)
    : 0;

  const toggleCryptoToken = (id) => {
    setCryptoTokens(prev => {
      if (prev.includes(id) && prev.length === 1) return prev; // keep at least one
      return prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id];
    });
  };

  // Validate all fields before submitting — no API call if form is invalid
  const validate = () => {
    const e = {};
    if (!name.trim())                                              e.name        = "Product name is required";
    if (name.trim().length > 100)                                  e.name        = "Name must be under 100 characters";
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0)       e.amount      = "Enter a valid price";
    if (parseFloat(amount) > 1000000)                              e.amount      = "Price too high (max 1,000,000)";
    if (hasIntro) {
      if (!introAmount || parseFloat(introAmount) <= 0)            e.introAmount = "Enter a valid intro price";
      if (parseFloat(introAmount) >= parseFloat(amount))           e.introAmount = "Intro price must be less than full price";
    }
    if (hasYearly) {
      if (!yearlyAmount || parseFloat(yearlyAmount) <= 0)          e.yearlyAmount = "Enter a valid yearly price";
    }
    const gp = parseInt(gracePeriod);
    if (!gracePeriod || isNaN(gp) || gp < 1 || gp > 30) e.gracePeriod = "Enter a value between 1 and 30";
    return e;
  };

  const handleAdd = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    try {
      const intervalMap = { "0": "weekly", "1": "monthly", "2": "yearly" };
      const res = await merchantFetch(`${API_BASE}/api/products/${merchantAddress}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          amount:            parseFloat(amount),
          interval:          intervalMap[interval],
          intro_amount:      hasIntro  ? parseFloat(introAmount)  : 0,
          intro_pulls:       hasIntro  ? parseInt(introPulls)     : 0,
          yearly_amount:     hasYearly ? parseFloat(yearlyAmount) : null,
          payment_methods:   ["crypto", ...cryptoTokens],
          fiat_currency:     fiatCurrency,
          grace_period_days: parseInt(gracePeriod),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === "missing_fields") {
          setErrors({ name: "Please fill in all required fields" });
        } else if (errData.error === "volatile_token") {
          setErrors({ tokens: "Selected token not supported yet" });
        } else {
          setErrors({ general: "Could not save product. Please try again." });
        }
        return;
      }
      onAdded();
      onClose();
    } catch (err) {
      setErrors({ general: "Connection error. Please check your network and try again." });
    }
    finally { setSaving(false); }
  };

  // ─── Shared sub-component styles ────────────────────────────────────────────
  const SECTION_LABEL = {
    fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
    letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 8,
  };
  const TOKEN_ROW = (isEnabled, isLast) => ({
    display: "flex", alignItems: "center", gap: 8,
    padding: "9px 11px", borderRadius: 8, cursor: isLast ? "default" : "pointer",
    border: `0.5px solid ${isEnabled ? "rgba(29,158,117,0.3)" : "var(--border)"}`,
    background: isEnabled ? "rgba(29,158,117,0.06)" : "var(--bg-tag)",
    opacity: isLast ? 0.7 : 1,
  });
  const CHECKBOX = (isEnabled) => ({
    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
    border: `1.5px solid ${isEnabled ? "var(--green)" : "var(--border)"}`,
    background: isEnabled ? "var(--green)" : "none",
    display: "flex", alignItems: "center", justifyContent: "center",
  });
  const TOGGLE_TRACK = (on) => ({
    width: 32, height: 18, borderRadius: 99,
    background: on ? "var(--green)" : "var(--border)",
    position: "relative", transition: "background 0.2s", flexShrink: 0,
  });
  const TOGGLE_THUMB = (on) => ({
    position: "absolute", top: 2, left: on ? 16 : 2,
    width: 14, height: 14, borderRadius: "50%",
    background: "#fff", transition: "left 0.2s",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 16, padding: "28px 32px", width: "100%", maxWidth: 720, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "92vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>New product</h2>
          <button onClick={onClose} style={S.btn.ghost}>✕</button>
        </div>

        {/* Two-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Product name */}
            <div>
              <label style={SECTION_LABEL}>Product name</label>
              <input
                placeholder="Pro Plan"
                value={name}
                onChange={e => { setName(e.target.value.replace(/[^a-zA-Z0-9 \-\.]/g, "")); setErrors(prev => ({ ...prev, name: undefined })); }}
                style={{ borderColor: errors.name ? "var(--red)" : undefined }}
              />
              {errors.name && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{errors.name}</div>}
            </div>

            {/* Price + Interval */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={SECTION_LABEL}>Price ($)</label>
                <input
                  type="number" placeholder="29.00" min="0.01" step="0.01"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setErrors(prev => ({ ...prev, amount: undefined })); }}
                  style={{ borderColor: errors.amount ? "var(--red)" : undefined }}
                />
                {errors.amount && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{errors.amount}</div>}
              </div>
              <div>
                <label style={SECTION_LABEL}>Interval</label>
                <select value={interval} onChange={e => setInterval(e.target.value)}>
                  <option value="0">Weekly</option>
                  <option value="1">Monthly</option>
                  <option value="2">Yearly</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: -8 }}>
              $1 = 1 USDC = 1 USDT = 1 EURC. Same price across crypto and card.
            </div>

            {/* Grace period */}
            <div>
              <label style={SECTION_LABEL}>
                Grace period{" "}
                <span style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0 }}>(days, 1–30)</span>
              </label>
              <input
                type="number" min="1" max="30" placeholder="7"
                value={gracePeriod}
                onChange={e => { setGracePeriod(e.target.value); setErrors(prev => ({ ...prev, gracePeriod: undefined })); }}
                style={{ borderColor: errors.gracePeriod ? "var(--red)" : undefined }}
              />
              {errors.gracePeriod
                ? <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{errors.gracePeriod}</div>
                : <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 5 }}>Keeper retries daily. Subscription expires if unpaid after this window.</div>
              }
            </div>

            {/* Toggles */}
            <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Intro pricing */}
              <div>
                <div onClick={() => setHasIntro(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)" }}>Introductory pricing</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Lower price for first N cycles</div>
                  </div>
                  <div style={TOGGLE_TRACK(hasIntro)}><div style={TOGGLE_THUMB(hasIntro)} /></div>
                </div>
                {hasIntro && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <label style={SECTION_LABEL}>Intro price ($)</label>
                      <input type="number" placeholder="5.00" value={introAmount} onChange={e => setIntroAmount(e.target.value)} />
                      {errors.introAmount && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{errors.introAmount}</div>}
                    </div>
                    <div>
                      <label style={SECTION_LABEL}>For how many {intervalLabel[interval]}s</label>
                      <input type="number" min="1" placeholder="1" value={introPulls} onChange={e => setIntroPulls(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Yearly option */}
              <div>
                <div onClick={() => setHasYearly(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)" }}>Yearly billing option</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Annual plan alongside monthly</div>
                  </div>
                  <div style={TOGGLE_TRACK(hasYearly)}><div style={TOGGLE_THUMB(hasYearly)} /></div>
                </div>
                {hasYearly && (
                  <div style={{ marginTop: 10 }}>
                    <label style={SECTION_LABEL}>Yearly price ($)</label>
                    {yearlySuggestion && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Suggested: ${yearlySuggestion} (20% off)</div>}
                    <input type="number" placeholder={yearlySuggestion || "290.00"} value={yearlyAmount} onChange={e => setYearlyAmount(e.target.value)} />
                    {yearlyDiscount > 0 && <div style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>{yearlyDiscount}% discount vs monthly</div>}
                    {errors.yearlyAmount && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{errors.yearlyAmount}</div>}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Crypto tokens */}
            <div>
              <label style={SECTION_LABEL}>Crypto tokens</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { id: "usdc", label: "USDC" },
                  { id: "usdt", label: "USDT" },
                  { id: "eurc", label: "EURC" },
                ].map(({ id, label }) => {
                  const isEnabled = cryptoTokens.includes(id);
                  const isLast    = cryptoTokens.length === 1 && isEnabled;
                  return (
                    <div key={id} onClick={() => !isLast && toggleCryptoToken(id)} style={TOKEN_ROW(isEnabled, isLast)}>
                      <div style={CHECKBOX(isEnabled)}>
                        {isEnabled && <span style={{ color: "var(--bg-primary)", fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: isEnabled ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
                    </div>
                  );
                })}
              </div>
              {errors.tokens && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{errors.tokens}</div>}
            </div>

            {/* Price display currency */}
            <div>
              <label style={SECTION_LABEL}>Price display currency</label>
              <select value={fiatCurrency} onChange={e => setFiatCurrency(e.target.value)}>
                {FIAT_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Live product preview — mirrors what the actual pay page will show,
                not just the URL. Reflects intro pricing, yearly toggle,
                currency, and token selection as the merchant edits the form. */}
            {name && amount && (
              <div style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Live preview</div>

                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>{name}</div>

                {hasYearly && (
                  <div style={{ display: "inline-flex", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(29,158,117,0.15)", color: "var(--green)", fontWeight: 600 }}>Monthly</span>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, color: "var(--text-muted)" }}>
                      Yearly{yearlyDiscount > 0 ? ` — save ${yearlyDiscount}%` : ""}
                    </span>
                  </div>
                )}

                {hasIntro && introAmount && (
                  <div style={{ display: "inline-block", fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "rgba(251,191,36,0.15)", color: "var(--amber)", fontWeight: 600, marginBottom: 8 }}>
                    🎁 Intro: {currencySymbol}{parseFloat(introAmount).toFixed(2)} × {introPulls}
                  </div>
                )}

                <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>
                  {currencySymbol}{parseFloat(amount).toFixed(2)}
                  <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-muted)" }}> / {intervalLabel[interval]}ly</span>
                </div>

                {hasIntro && introAmount && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {currencySymbol}{parseFloat(introAmount).toFixed(2)}/{intervalLabel[interval]} for {introPulls} cycle{introPulls !== "1" ? "s" : ""}, then {currencySymbol}{parseFloat(amount).toFixed(2)}
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {cryptoTokens.map(t => (
                    <span key={t} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "rgba(148,163,184,0.12)", color: "var(--text-secondary)", fontWeight: 600 }}>
                      {t.toUpperCase()}
                    </span>
                  ))}
                </div>

                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, fontFamily: "monospace", wordBreak: "break-all" }}>
                  {BASE_URL}/{shortAddress(merchantAddress)}/{name.toLowerCase().replace(/\s+/g, "-")}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                  Add a free trial after creating — use the "Trial Link" button.
                </div>
              </div>
            )}

            {/* Errors + submit */}
            <div style={{ marginTop: "auto" }}>
              {errors.general && (
                <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "var(--red)" }}>
                  {errors.general}
                </div>
              )}
              <button onClick={handleAdd} disabled={saving} style={{ ...S.btn.primary, width: "100%", padding: "11px", fontSize: 14, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving..." : "Create product"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Product Modal ───────────────────────────────────────────────────────
function EditProductModal({ merchantAddress, product, onClose, onSaved }) {
  const intervalRevMap = { 0: "0", 1: "1", 2: "2" };
  const intervalMap    = { "0": "weekly", "1": "monthly", "2": "yearly" };
  const intervalLabel  = { "0": "week", "1": "month", "2": "year" };

  const [name, setName]               = useState(product.name);
  const [amount, setAmount]           = useState(product.amount.toFixed(2));
  const [interval, setInterval]       = useState(intervalRevMap[product.interval] ?? "1");
  const [hasIntro, setHasIntro]       = useState(product.intro_amount > 0);
  const [introAmount, setIntroAmount] = useState(product.intro_amount > 0 ? product.intro_amount.toFixed(2) : "");
  const [introPulls, setIntroPulls]   = useState(product.intro_pulls > 0 ? String(product.intro_pulls) : "1");
  const [hasYearly, setHasYearly]     = useState(!!product.yearly_amount);
  const [yearlyAmount, setYearlyAmount] = useState(product.yearly_amount ? product.yearly_amount.toFixed(2) : "");
  // Separate crypto tokens from fiat payment methods
  const CRYPTO_TOKENS = ["usdc", "usdt", "eurc"];
  const initialMethods = product.payment_methods || ["crypto"];
  const [cryptoTokens, setCryptoTokens]   = useState(
    initialMethods.filter(m => CRYPTO_TOKENS.includes(m)).length > 0
      ? initialMethods.filter(m => CRYPTO_TOKENS.includes(m))
      : ["usdc"]
  );
  const [fiatCurrency, setFiatCurrency] = useState(product.fiat_currency || "eur");
  const [gracePeriod, setGracePeriod] = useState(product.grace_period_days ? String(product.grace_period_days) : "7");
  const [saving, setSaving]           = useState(false);

  const yearlySuggestion = amount ? (parseFloat(amount) * 12 * 0.8).toFixed(2) : "";
  const yearlyDiscount   = amount && yearlyAmount
    ? Math.round((1 - parseFloat(yearlyAmount) / (parseFloat(amount) * 12)) * 100) : 0;

  const CRYPTO_TOKEN_IDS = ["usdc", "usdt", "eurc"];

  const toggleMethod = (method) => {
    if (!CRYPTO_TOKEN_IDS.includes(method)) return;
    // Toggle crypto token — at least one must remain selected
    setCryptoTokens(prev => {
      if (prev.includes(method) && prev.length === 1) return prev; // keep at least one
      return prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method];
    });
  };

  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    if (!name || !amount) return;
    if (hasIntro && (!introAmount || parseFloat(introAmount) <= 0)) { alert("Please enter a valid intro price."); return; }
    if (hasIntro && parseFloat(introAmount) > parseFloat(amount)) { alert("Intro price cannot be higher than the full price."); return; }
    if (hasYearly && (!yearlyAmount || parseFloat(yearlyAmount) <= 0)) { alert("Please enter a valid yearly price."); return; }
    setSaving(true);
    try {
      const res = await merchantFetch(`${API_BASE}/api/products/${merchantAddress}/${product.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, amount: parseFloat(amount), interval: intervalMap[interval],
          intro_amount:  hasIntro  ? parseFloat(introAmount) : 0,
          intro_pulls:   hasIntro  ? parseInt(introPulls)    : 0,
          yearly_amount: hasYearly ? parseFloat(yearlyAmount): null,
          payment_methods: ["crypto", ...cryptoTokens],
          fiat_currency: fiatCurrency,
          grace_period_days: parseInt(gracePeriod) || 7,
        }),
      });
      if (!res.ok) throw new Error("Failed to update product");
      setSaveSuccess(true);
      onSaved();
      setTimeout(() => { setSaveSuccess(false); onClose(); }, 1200);
    } catch { alert("Could not update product. Please try again."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Edit Product</h2>
          <button onClick={onClose} style={S.btn.ghost}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={S.label}>Product name</label>
            <input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>Price (USDC)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Billing interval</label>
              <select value={interval} onChange={e => setInterval(e.target.value)}>
                <option value="0">Weekly</option>
                <option value="1">Monthly</option>
                <option value="2">Yearly</option>
              </select>
            </div>
          </div>

          <div>
            <div onClick={() => setHasIntro(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: hasIntro ? 10 : 0 }}>
              <div style={{ width: 32, height: 18, borderRadius: 99, background: hasIntro ? "var(--green)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: hasIntro ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </div>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Introductory pricing</span>
            </div>
            {hasIntro && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={S.label}>Intro price (USDC)</label>
                  <input type="number" value={introAmount} onChange={e => setIntroAmount(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>For how many {intervalLabel[interval]}s</label>
                  <input type="number" min="1" value={introPulls} onChange={e => setIntroPulls(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div>
            <div onClick={() => setHasYearly(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: hasYearly ? 10 : 0 }}>
              <div style={{ width: 32, height: 18, borderRadius: 99, background: hasYearly ? "var(--green)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: hasYearly ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </div>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Offer yearly billing option</span>
            </div>
            {hasYearly && (
              <div>
                <label style={S.label}>Yearly price (USDC)</label>
                {yearlySuggestion && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Suggested: ${yearlySuggestion} (20% off)</div>}
                <input type="number" placeholder={yearlySuggestion} value={yearlyAmount} onChange={e => setYearlyAmount(e.target.value)} />
                {yearlyDiscount > 0 && <div style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>{yearlyDiscount}% discount vs monthly</div>}
              </div>
            )}
          </div>

          {/* Crypto tokens */}
          <div>
            <label style={S.label}>Accepted crypto tokens</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { id: "usdc", label: "⬡ USDC" },
                { id: "usdt", label: "₮ USDT" },
                { id: "eurc", label: "€ EURC" },
              ].map(({ id, label }) => {
                const isEnabled = cryptoTokens.includes(id);
                const isLast = cryptoTokens.length === 1 && isEnabled;
                return (
                  <div key={id} onClick={() => !isLast && toggleMethod(id)} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
                    cursor: isLast ? "default" : "pointer",
                    border: `0.5px solid ${isEnabled ? "rgba(29,158,117,0.3)" : "var(--border)"}`,
                    background: isEnabled ? "rgba(29,158,117,0.06)" : "var(--bg-tag)",
                    opacity: isLast ? 0.7 : 1,
                  }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${isEnabled ? "var(--green)" : "var(--border)"}`, background: isEnabled ? "var(--green)" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isEnabled && <span style={{ color: "var(--bg-primary)", fontSize: 9, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 11, color: isEnabled ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>Only affects new subscribers — existing subscribers keep their original token.</div>
          </div>

          {/* Price display currency */}
          <div>
            <label style={S.label}>Price display currency</label>
            <select value={fiatCurrency} onChange={e => setFiatCurrency(e.target.value)}>
              {FIAT_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>

          <button onClick={handleSave} disabled={saving || saveSuccess} style={{ ...S.btn.primary, padding: "11px", fontSize: 14, opacity: saving ? 0.7 : 1, background: saveSuccess ? "var(--green)" : undefined }}>
            {saveSuccess ? "✓ Saved!" : saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Webhook Modal ────────────────────────────────────────────────────────────
function WebhookModal({ merchantAddress, merchantAuthReady, onClose, onSaved }) {
  const [url, setUrl]       = useState("");
  const [events, setEvents] = useState(["payment.success"]);
  const [saving, setSaving] = useState(false);

  const ALL_EVENTS = ["payment.success", "payment.failed", "subscription.cancelled", "subscription.paused", "grace_period.started", "grace_period.expired"];

  const toggleEvent = (e) => setEvents(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);

  // [BUG FIX — Aug 2026] Previously swallowed the real failure reason behind
  // a generic "Could not save webhook. Please try again." — indistinguishable
  // whether the cause was a 401 (session not ready/expired, the actual bug
  // reported), a validation error, or a real server error. Now surfaces the
  // real status/message and — for the specific 401 case — tells the merchant
  // to sign in again rather than blindly retry, since retrying without a
  // fresh sign-in fails identically every time.
  const handleSave = async () => {
    if (!url || events.length === 0) return;
    if (!merchantAuthReady) {
      alert("Still signing you in — wait a moment and try again.");
      return;
    }
    setSaving(true);
    try {
      const res = await merchantFetch(`${API_BASE}/api/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, events }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const body = await res.json(); if (body?.message || body?.error) detail = body.message || body.error; } catch {}
        if (res.status === 401) {
          alert("Your session expired. Please sign in again (banner at the top of the dashboard), then retry.");
        } else {
          alert(`Could not save webhook: ${detail}`);
        }
        return;
      }
      onSaved(); onClose();
    } catch (err) {
      alert(`Could not save webhook: ${err.message || "network error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Add Webhook</h2>
          <button onClick={onClose} style={S.btn.ghost}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={S.label}>Endpoint URL</label>
            <input placeholder="https://yourdomain.com/webhooks/authonce" value={url} onChange={e => setUrl(e.target.value)} />
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Must be a full URL starting with https:// — the gray text above is just an example, not a filled-in value.</div>
          </div>
          <div>
            <label style={S.label}>Events to subscribe</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ALL_EVENTS.map(e => (
                <div key={e} onClick={() => toggleEvent(e)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: 8, cursor: "pointer",
                  border: `0.5px solid ${events.includes(e) ? "rgba(29,158,117,0.3)" : "var(--border)"}`,
                  background: events.includes(e) ? "rgba(29,158,117,0.06)" : "var(--bg-tag)",
                }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${events.includes(e) ? "var(--green)" : "var(--border)"}`, background: events.includes(e) ? "var(--green)" : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {events.includes(e) && <span style={{ color: "var(--bg-primary)", fontSize: 9, fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: events.includes(e) ? "var(--text-primary)" : "var(--text-muted)" }}>{e}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={handleSave} disabled={saving || !url || events.length === 0} style={{ ...S.btn.primary, padding: "11px", fontSize: 14, opacity: saving || !url || events.length === 0 ? 0.5 : 1 }}>
            {saving ? "Saving..." : "Add Webhook"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Change Payout Wallet Modal [NEW — v9 SV-21] ──────────────────────────────
// Step 1 of the two-step rotation — proposes a new payout wallet for one
// subscription. Does NOT move anything yet; the new address must
// independently accept (see the "Incoming requests" banner) before payouts
// actually redirect. Requires a real on-chain transaction + wallet
// signature — writeContractAsync is passed down from the main dashboard
// component rather than calling useWriteContract() again here, since a
// single wagmi connection is shared across the whole page.
// [UPDATED — batch support] Takes subscriptionIds as an ARRAY (a single
// selection is just an array of one) — a merchant proposing a wallet
// change for several subscriptions at once still needs one signature per
// subscription (the contract has no batch function), but the UI loops
// through them with the same progress-tracking pattern already used by
// PriceChangeModal above, rather than making the merchant open this modal
// N separate times.
function ChangePayoutWalletModal({ subscriptionIds, onClose, onSaved, writeContractAsync }) {
  const [newMerchant, setNewMerchant] = useState("");
  const [saving, setSaving]           = useState(false);
  const [progress, setProgress]       = useState(null);
  const [done, setDone]               = useState(false);
  const [errorMsg, setErrorMsg]       = useState("");
  // [FIX — Aug 2026] Snapshot the ids ONCE on mount, into local state — do
  // not read subscriptionIds directly from props for the rest of this
  // component's life. Real bug found via live testing: onSaved() (called
  // right after a successful bulk propose) clears the parent's selection
  // state, which re-renders this still-open modal with a NEW, now-empty
  // subscriptionIds array — even though the actual on-chain transactions
  // had already succeeded correctly. The success screen showed "Proposed
  // for 0 subscriptions" instead of the real count, purely because it was
  // reading a live prop that changed out from under it mid-flow, not
  // because anything about the propose calls themselves was wrong.
  const [idsSnapshot] = useState(() => subscriptionIds);

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(newMerchant.trim());
  const count = idsSnapshot.length;

  const handlePropose = async () => {
    if (!isValidAddress) { setErrorMsg("Enter a valid wallet address (0x... 42 characters)."); return; }
    setSaving(true);
    setErrorMsg("");
    setProgress({ done: 0, total: count });
    for (let i = 0; i < count; i++) {
      try {
        await writeContractAsync({
          address: VAULT_ADDRESS, abi: VAULT_ABI,
          functionName: "proposeMerchantChange",
          args: [BigInt(idsSnapshot[i]), newMerchant.trim()],
        });
        setProgress({ done: i + 1, total: count });
      } catch (err) {
        const msg = err.shortMessage || err.message || "Transaction failed";
        setErrorMsg(`Failed on subscription #${idsSnapshot[i]} (${i + 1}/${count}): ` + (msg.includes("NewMerchantNotApproved")
          ? "that address isn't an approved AuthOnce merchant yet."
          : msg));
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setDone(true);
    // notifier.js needs a few seconds to pick up and index these events —
    // caller's onSaved schedules the reload with its own delay.
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 24 }} onClick={onClose}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
          Change Payout Wallet — {count === 1 ? `Subscription #${idsSnapshot[0]}` : `${count} subscriptions`}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          This is a two-step change{count > 1 ? ", done once per subscription" : ""}. The new wallet must already be an approved AuthOnce merchant, and must separately accept before anything actually moves. Payments keep going to your current wallet until then.
        </div>
        <div>
          <label style={S.label}>New payout wallet address</label>
          <input placeholder="0x..." value={newMerchant} onChange={e => setNewMerchant(e.target.value)} disabled={saving || done} />
        </div>
        {progress && !done && (
          <div style={{ background: "rgba(29,158,117,0.06)", border: "0.5px solid rgba(29,158,117,0.2)", borderRadius: 8, padding: "10px 14px", marginTop: 14, fontSize: 12, color: "var(--green)" }}>
            Proposing... {progress.done} / {progress.total}
            <div style={{ marginTop: 6, background: "rgba(29,158,117,0.2)", borderRadius: 4, height: 4 }}>
              <div style={{ background: "var(--green)", height: 4, borderRadius: 4, width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        )}
        {errorMsg && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>{errorMsg}</div>}
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0 0" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
            <div style={{ color: "var(--green)", fontSize: 13, fontWeight: 600 }}>Proposed for {count} subscription{count !== 1 ? "s" : ""}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Waiting on the new wallet to accept.</div>
            <button onClick={onClose} style={{ ...S.btn.ghost, marginTop: 16 }}>Close</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={onClose} disabled={saving} style={S.btn.ghost}>Cancel</button>
            <button onClick={handlePropose} disabled={saving || !isValidAddress} style={{ ...S.btn.primary, opacity: (saving || !isValidAddress) ? 0.6 : 1, flex: 1 }}>
              {saving ? `Confirming ${progress?.done || 0}/${count}...` : count === 1 ? "Propose Change" : `Propose for ${count} subscriptions`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CSV Import ───────────────────────────────────────────────────────────────
function CsvImport({ address, products = [] }) {
  const [open, setOpen]               = useState(false);
  const [file, setFile]               = useState(null);
  const [preview, setPreview]         = useState([]);
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [copied, setCopied]           = useState(false);
  // [FIX] Previously read a token from localStorage.getItem("merchant_token")
  // — a key nothing ever wrote to, so this was always broken — and used its
  // own separate API_BASE guess instead of the module-level constant. Now
  // uses the same merchantFetch/API_BASE as the rest of the dashboard.

  function parseCSV(text) {
    const lines = text.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
    return lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
    });
  }

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!file) return;
    if (!selectedProduct) {
      setError("Select which product these invites are for first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const res = await merchantFetch(`${API_BASE}/api/merchants/${address}/subscribers/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, product_slug: selectedProduct }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Sending invites failed");
      setResult(data);
      setFile(null);
      setPreview([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const cardStyle = {
    background: "var(--bg-card)", border: "0.5px solid var(--border)",
    borderRadius: 12, padding: "16px 20px", marginBottom: 20,
  };
  const btnStyle = {
    background: "var(--green)", color: "#fff", border: "none",
    borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500,
    cursor: "pointer", transition: "opacity 0.2s",
  };
  const ghostBtn = {
    background: "transparent", border: "0.5px solid var(--border)",
    borderRadius: 8, padding: "8px 16px", fontSize: 13,
    color: "var(--text-secondary)", cursor: "pointer",
  };

  if (!open) return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={() => setOpen(true)} style={ghostBtn}>
          ✉ Invite past customers to subscribe
        </button>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          email, wallet (optional), amount, interval · max 500 rows ·{" "}
          <button
            onClick={() => {
              const sample = "email,name,wallet_address,amount_usdc,interval\nalice@example.com,Alice Smith,0xAbCd1234567890AbCd1234567890AbCd12345678,9.99,monthly\nbob@example.com,Bob Jones,0x1234567890AbCd1234567890AbCd1234567890Ab,49.99,yearly";
              const blob = new Blob([sample], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "authonce-invite-template.csv"; a.click();
            }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--green)", fontSize: 12, textDecoration: "underline" }}
          >
            download template
          </button>
        </span>
      </div>
    </div>
  );

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Invite past customers</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            Send a real AuthOnce pay-link to people who used to pay you elsewhere — they connect
            their own wallet and subscribe themselves, same as any new customer. AuthOnce can't
            create a subscription on someone's behalf; only their own wallet can authorize that.
          </div>
        </div>
        <button onClick={() => { setOpen(false); setFile(null); setPreview([]); setResult(null); setError(null); }} style={ghostBtn}>✕</button>
      </div>

      {/* Product selector */}
      {products.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Which product are these subscribers for?</label>
          <select
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--bg-tag)", color: "var(--text-primary)", fontSize: 13 }}
          >
            <option value="">Select a product...</option>
            {products.map(p => (
              <option key={p.slug} value={p.slug}>{p.name} — ${p.amount}/{p.interval}</option>
            ))}
          </select>
        </div>
      )}

      {/* CSV format guide */}
      <div style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>Required CSV format:</div>
        email, name, wallet_address, amount_usdc, interval<br />
        subscriber@email.com, Alice, 0x123...abc, 9.99, monthly
        <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
          <strong>wallet_address</strong> is optional/informational — the subscriber uses whatever
          wallet they connect, not necessarily this one. <strong>amount_usdc</strong> (e.g. an old
          Stripe price) is only used to flag a mismatch if it differs from this product's real
          price — every invite goes out at the live price, since AuthOnce has no per-subscriber
          price override. Max 500 rows.
        </div>
      </div>

      {/* File input */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}
        />
        {file && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{file.name}</span>
        )}
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Preview — first {preview.length} rows
          </div>
          <div style={{ background: "var(--bg-tag)", borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--border)" }}>
            {preview.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr 1fr", padding: "8px 12px", fontSize: 11, fontFamily: "monospace", borderBottom: i < preview.length - 1 ? "0.5px solid var(--border)" : "none", color: "var(--text-secondary)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.email || "—"}</span>
                <span>{row.name || "—"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.wallet_address ? row.wallet_address.slice(0, 10) + "..." : "—"}</span>
                <span>{row.amount_usdc || "—"}</span>
                <span>{row.interval || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {file && !result && (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleImport} disabled={loading || !selectedProduct} style={{ ...btnStyle, opacity: (loading || !selectedProduct) ? 0.6 : 1 }}>
            {loading ? "Sending invites..." : "Send invites"}
          </button>
          <button onClick={() => { setFile(null); setPreview([]); }} style={ghostBtn}>Clear</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "0.5px solid rgba(239,68,68,0.3)", borderRadius: 8, fontSize: 13, color: "var(--red)" }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: 12 }}>
          <div style={{ padding: "10px 14px", background: "rgba(29,158,117,0.08)", border: "0.5px solid rgba(29,158,117,0.3)", borderRadius: 8, fontSize: 13, color: "var(--green)" }}>
            ✓ {result.sent} invite{result.sent !== 1 ? "s" : ""} sent out of {result.total} row{result.total !== 1 ? "s" : ""}.
          </div>

          {/* Pay link to share */}
          {selectedProduct && (
            <div style={{ marginTop: 10, padding: "12px 14px", background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                This is the exact pay link each invited customer received:
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <code style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {`${BASE_URL}/${shortAddress(address)}/${selectedProduct}`}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${BASE_URL}/${address.toLowerCase()}/${selectedProduct}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{ ...ghostBtn, fontSize: 12, whiteSpace: "nowrap" }}
                >
                  {copied ? "✓ Copied" : "Copy link"}
                </button>
              </div>
            </div>
          )}

          {/* Price mismatches — informational, invite still sent at the real live price */}
          {result.results?.some(r => r.price_mismatch) && (
            <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.2)", borderRadius: 8, fontSize: 12, color: "var(--amber)", marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠ Price differs from your CSV for these rows (sent at the real live price anyway — no per-subscriber override exists):</div>
              {result.results.filter(r => r.price_mismatch).map((r, i) => (
                <div key={i}>{r.email}</div>
              ))}
            </div>
          )}

          {/* Skipped/failed rows */}
          {result.results?.some(r => r.status !== "sent") && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "0.5px solid rgba(239,68,68,0.2)", borderRadius: 8, fontSize: 12, color: "var(--red)", marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Not sent:</div>
              {result.results.filter(r => r.status !== "sent").map((r, i) => (
                <div key={i}>
                  {r.email} — {{
                    duplicate: "already invited for this product before",
                    invalid_email: "invalid email address",
                    invalid_wallet: "wallet_address isn't a valid address",
                    send_failed: "email failed to send — try again",
                    server_error: "server error — try again",
                  }[r.status] || r.status}
                </div>
              ))}
            </div>
          )}

          <button onClick={() => { setResult(null); setOpen(false); setCopied(false); }} style={{ ...ghostBtn, marginTop: 10 }}>Done</button>
        </div>
      )}

      {/* Download sample CSV */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "0.5px solid var(--border)" }}>
        <button
          onClick={() => {
            const sample = "email,name,wallet_address,amount_usdc,interval\nalice@example.com,Alice Smith,0xAbCd1234567890AbCd1234567890AbCd12345678,9.99,monthly\nbob@example.com,Bob Jones,0x1234567890AbCd1234567890AbCd1234567890Ab,49.99,yearly";
            const blob = new Blob([sample], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "authonce-import-template.csv"; a.click();
          }}
          style={{ ...ghostBtn, fontSize: 12 }}
        >
          ⬇ Download CSV template
        </button>
      </div>
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportPaymentsCSV(payments, address) {
  const headers = ["Date", "Subscriber", "Amount (USDC)", "You Received", "Protocol Fee", "Tx Hash"];
  const rows = [
    headers.join(","),
    ...payments.map(p => [
      new Date(p.executed_at).toISOString().slice(0, 10),
      p.subscriber_address || "",
      p.amount_usdc, p.merchant_received_usdc, p.protocol_fee_usdc, p.tx_hash || "",
    ].join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `authonce-payments-${address.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Allowance Cell ───────────────────────────────────────────────────────────
function AllowanceCell({ subscriptionId, amount }) {
  const [allowance, setAllowance] = useState(null);

  useEffect(() => {
    if (subscriptionId == null) return;
    client.readContract({
      address: VAULT_ADDRESS, abi: VAULT_ABI,
      functionName: "vaultAllowance", args: [BigInt(subscriptionId)],
    })
      .then(val => setAllowance(Number(val) / 1e6))
      .catch(() => setAllowance(null));
  }, [subscriptionId]);

  if (allowance === null) return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>;
  const required = parseFloat(amount || 0);
  const ok       = allowance >= required;
  return (
    <span style={{ fontSize: 11, fontFamily: "monospace", color: ok ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
      {ok ? "✓" : "⚠"} ${allowance.toFixed(2)}
    </span>
  );
}

// ─── Table Header ─────────────────────────────────────────────────────────────
function TableHead({ columns }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: columns,
      padding: "10px 20px", fontSize: 10,
      color: "var(--text-muted)", letterSpacing: "0.1em",
      textTransform: "uppercase", borderBottom: "0.5px solid var(--border)",
      background: "var(--bg-tag)",
    }}>
      {columns.split(" ").map((_, i) => <span key={i} />)}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ message, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px" }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◎</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>{message}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function MerchantDashboard({ address }) {
  const { writeContractAsync } = useWriteContract();
  const [tab, setTab]                               = useState("overview");
  const [subscribers, setSubscribers]               = useState([]);
  const [products, setProducts]                     = useState([]);
  const [webhooks, setWebhooks]                     = useState([]);
  const [payments, setPayments]                     = useState([]);
  const [loading, setLoading]                       = useState(false);
  const [paymentsLoading, setPaymentsLoading]       = useState(false);
  const [isApproved, setIsApproved]                 = useState(null);
  const [settings, setSettings]                     = useState(() =>
    JSON.parse(localStorage.getItem("merchant_settings_" + address) ||
    JSON.stringify({ businessName: "", email: "", notifications: "email",
                     countryCode: "PT", vatNumber: "", billingAddress: "" }))
  );
  const [showAddProduct, setShowAddProduct]         = useState(false);
  const [showAddWebhook, setShowAddWebhook]         = useState(false);
  const [copied, setCopied]                         = useState(null);
  const [qrProduct, setQrProduct]                   = useState(null);
  const [trialProduct, setTrialProduct]             = useState(null);
  const [priceChangeProduct, setPriceChangeProduct] = useState(null);
  const [pendingOutgoing, setPendingOutgoing]        = useState([]);
  const [pendingIncoming, setPendingIncoming]        = useState([]);
  const [changePayoutSub, setChangePayoutSub]        = useState(null); // single subscription id, from per-row button
  const [selectedSubs, setSelectedSubs]              = useState({});  // { [id]: true } — bulk selection checkboxes
  const [bulkChangeOpen, setBulkChangeOpen]           = useState(false);
  const [acceptingChange, setAcceptingChange]        = useState({});  // { [requestId]: true } while accept tx pending
  const [acceptingAll, setAcceptingAll]               = useState(false);
  const [editProduct, setEditProduct]               = useState(null);
  const [testFiring, setTestFiring]                 = useState({});
  const [testResults, setTestResults]               = useState({});
  const [deletingWebhook, setDeletingWebhook]        = useState({});
  const [handle, setHandle]                         = useState(null);
  const [handleInput, setHandleInput]               = useState("");
  const [handleSaving, setHandleSaving]             = useState(false);
  const [handleMsg, setHandleMsg]                   = useState(null);

  // [SECURITY FIX] Merchant session — replaces the old X-Merchant-Address
  // header trust with a signed-message login, matching the backend fix in
  // scripts/api.js (requireMerchantAuth now requires a JWT, not a
  // self-reported header). See frontend/src/lib/merchantAuth.js.
  const { signMessageAsync } = useSignMessage();
  const [merchantAuthReady, setMerchantAuthReady]   = useState(false); // true once login succeeded for the CURRENT address
  const [merchantAuthError, setMerchantAuthError]   = useState(null);
  const [merchantAuthLoading, setMerchantAuthLoading] = useState(false);

  const attemptMerchantLogin = useCallback(async () => {
    if (!address) return;
    setMerchantAuthLoading(true);
    setMerchantAuthError(null);
    const result = await merchantLogin(`${API_BASE}/api/merchant/login`, address, signMessageAsync);
    setMerchantAuthLoading(false);
    if (result.ok) {
      setMerchantAuthReady(true);
    } else {
      setMerchantAuthReady(false);
      setMerchantAuthError(result.error);
    }
  }, [address, signMessageAsync]);

  useEffect(() => {
    if (!address) return;
    const tokenWallet = getMerchantWalletFromToken();
    if (tokenWallet && tokenWallet.toLowerCase() === address.toLowerCase()) {
      // Existing session in this tab already matches the connected wallet —
      // no need to re-sign. (Backend still rejects it independently if it's
      // actually expired; a stale-but-present token just means the first
      // API call will 401 and merchantFetch will clear it automatically.)
      setMerchantAuthReady(true);
      return;
    }
    // Different wallet than whatever session (if any) is stored, or no
    // session at all — clear anything stale and prompt a fresh sign-in.
    clearMerchantToken();
    setMerchantAuthReady(false);
    attemptMerchantLogin();
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  // On-chain approval
  useEffect(() => {
    if (!address) return;
    client.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "isApproved", args: [address] })
      .then(result => setIsApproved(result)).catch(() => setIsApproved(false));
  }, [address]);

  const loadProducts = useCallback(async () => {
    if (!address) return;
    try {
      const res = await merchantFetch(`${API_BASE}/api/products/${address}`);
      if (res.ok) {
        const data = await res.json();
        const INTERVAL_MAP = { weekly: 0, monthly: 1, yearly: 2 };
        setProducts(data.products.map(p => ({
          ...p,
          interval:      INTERVAL_MAP[p.interval] ?? p.interval,
          intro_amount:  parseFloat(p.intro_amount || 0),
          intro_pulls:   parseInt(p.intro_pulls || 0),
          yearly_amount: p.yearly_amount ? parseFloat(p.yearly_amount) : null,
        })));
      }
    } catch (err) { console.error("[Dashboard] loadProducts error:", err); }
  }, [address]);

  const loadPayments = useCallback(async () => {
    if (!address) return;
    setPaymentsLoading(true);
    try {
      const res = await merchantFetch(`${API_BASE}/api/merchants/${address}/payments`);
      if (res.ok) { const data = await res.json(); setPayments(data.payments); }
    } catch (err) { console.error("[Dashboard] loadPayments error:", err); }
    finally { setPaymentsLoading(false); }
  }, [address]);

  const loadWebhooks = useCallback(async () => {
    if (!address) return;
    try {
      const res = await merchantFetch(`${API_BASE}/api/merchants/${address}/webhooks`);
      if (res.ok) { const data = await res.json(); setWebhooks(data.webhooks || []); }
    } catch (err) { console.error("[Dashboard] loadWebhooks error:", err); }
  }, [address]);

  // [v9 — SV-21] Pending merchant-rotation requests, both directions.
  // Same auth-gating pattern as loadWebhooks/loadPayments above — needs a
  // session token from attemptMerchantLogin(), not just fires on mount.
  const loadPendingChanges = useCallback(async () => {
    if (!address) return;
    try {
      const [outRes, inRes] = await Promise.all([
        merchantFetch(`${API_BASE}/api/merchants/${address}/pending-changes/outgoing`),
        merchantFetch(`${API_BASE}/api/merchants/${address}/pending-changes/incoming`),
      ]);
      if (outRes.ok) { const d = await outRes.json(); setPendingOutgoing(d.requests || []); }
      if (inRes.ok)  { const d = await inRes.json();  setPendingIncoming(d.requests || []); }
    } catch (err) { console.error("[Dashboard] loadPendingChanges error:", err); }
  }, [address]);

  // [FIX — Aug 2026] Real bug found via live testing: every call site below
  // used to do a single setTimeout(loadPendingChanges, 3000) — but
  // authonce-notifier only polls for new events every 30 SECONDS (confirmed
  // in its own boot log). A 3-second reload can only ever catch an event
  // notifier happened to already be mid-processing; it will reliably miss
  // anything that landed just after the last poll cycle — exactly what
  // happened with the second of two bulk-propose transactions in testing:
  // the first showed "Pending" correctly, the second still said "Change
  // wallet" because notifier simply hadn't looked yet. Reloading at both a
  // quick 5s (fast feedback for the lucky/already-caught case) and a safe
  // 35s (guaranteed to be past a full poll cycle) covers both without
  // making every action feel sluggish by defaulting to the slow interval.
  const reloadPendingChangesSoon = useCallback(() => {
    setTimeout(loadPendingChanges, 5000);
    setTimeout(loadPendingChanges, 35000);
  }, [loadPendingChanges]);

  const fetchSubscribers = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const subs = [];
      let id = 0;
      while (true) {
        try {
          const sub = await client.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "subscriptions", args: [BigInt(id)] });
          if (sub[0] === "0x0000000000000000000000000000000000000000") break;
          if (sub[2].toLowerCase() === address.toLowerCase()) {
            subs.push({ id, owner: sub[0], merchant: sub[2], safeVault: sub[3], token: sub[4], amount: sub[5], interval: Number(sub[9]), lastPulledAt: Number(sub[10]), status: Number(sub[17]) });
          }
          id++;
        } catch { break; }
      }
      setSubscribers(subs);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [address]);

  // [BUG FIX — Aug 2026] loadWebhooks/loadPayments/handle all call merchantFetch,
  // which needs a session token from attemptMerchantLogin(). That login requires
  // an async wallet signature (attemptMerchantLogin runs in a SEPARATE effect,
  // see above) — a real user interaction that can take several seconds. This
  // effect used to fire all four calls unconditionally on mount, racing the
  // still-pending signature and landing 401 with no retry once the token
  // actually arrived (this is what caused "Could not load analytics: HTTP 401"
  // and webhook saves silently failing even well after page load, since a
  // failed load here was never retried — only a full page refresh, which
  // reused an already-stored token from a prior session, ever "fixed" it).
  //
  // fetchSubscribers (on-chain read) and loadProducts (GET /api/products/:address
  // is intentionally a PUBLIC route, so PayPage can show it to non-merchants)
  // don't need a session and still fire immediately. loadWebhooks/loadPayments/
  // handle DO need one and now wait for merchantAuthReady, re-firing the moment
  // it flips true rather than only at mount.
  useEffect(() => {
    fetchSubscribers();
    loadProducts();
  }, [fetchSubscribers, loadProducts]);

  useEffect(() => {
    if (!merchantAuthReady) return;
    loadWebhooks();
    loadPayments();
    loadPendingChanges();
    merchantFetch(`${API_BASE}/api/merchant/handle`)
      .then(r => r.json()).then(d => { if (d.handle) { setHandle(d.handle); setHandleInput(d.handle); } })
      .catch(() => {});
  }, [merchantAuthReady, loadWebhooks, loadPayments, loadPendingChanges]);

  const copyLink = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const activeSubs   = subscribers.filter(s => s.status === 0);
  const totalMRR     = activeSubs.reduce((acc, s) => {
    const amt = formatTokenAmount(s.amount, s.token);
    return acc + (s.interval === 0 ? amt * 4.33 : s.interval === 1 ? amt : amt / 12);
  }, 0);
  const totalRevenue = subscribers.reduce((acc, s) => acc + formatTokenAmount(s.amount, s.token), 0);
  const protocolFee  = totalRevenue * 0.005;
  const netRevenue   = totalRevenue - protocolFee;

  const approvalBadge = isApproved === null
    ? { label: "Checking...", bg: "rgba(148,163,184,0.12)", color: "#94a3b8" }
    : isApproved
    ? { label: "✓ Approved",       bg: "rgba(29,158,117,0.12)",  color: "var(--green)" }
    : { label: "⚠ Pending",        bg: "rgba(251,191,36,0.12)",  color: "var(--amber)" };

  return (
    <>
      {/* Merchant sign-in banner — only shown when the signed session isn't
          ready yet. Doesn't block rendering the dashboard shell below: the
          on-chain reads (subscribers, isApproved) work without it; only the
          API-backed calls (products, payments, webhooks, handle) need it,
          and those already fail gracefully with console.error + empty state
          if merchantFetch gets a 401. */}
      {!merchantAuthReady && (
        <div style={{
          maxWidth: 1160, margin: "16px auto 0", padding: "12px 16px",
          borderRadius: 10, display: "flex", alignItems: "center", gap: 12,
          background: merchantAuthError ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.08)",
          border: `0.5px solid ${merchantAuthError ? "rgba(248,113,113,0.25)" : "rgba(251,191,36,0.25)"}`,
        }}>
          <span style={{ fontSize: 13, color: merchantAuthError ? "var(--red)" : "var(--amber)", flex: 1 }}>
            {merchantAuthLoading
              ? "Waiting for signature — check your wallet..."
              : merchantAuthError
              ? `Sign-in required: ${merchantAuthError}`
              : "Sign in with your wallet to load dashboard data."}
          </span>
          <button
            onClick={attemptMerchantLogin}
            disabled={merchantAuthLoading}
            style={{ ...S.btn.ghost, opacity: merchantAuthLoading ? 0.5 : 1 }}
          >
            {merchantAuthLoading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      )}

    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 24px", display: "flex", gap: 24, alignItems: "flex-start" }}>

      {/* Sidebar */}
      <Sidebar
        tab={tab}
        setTab={setTab}
        onPaymentsClick={() => { setTab("payments"); loadPayments(); }}
        activeSubs={activeSubs.length}
        totalMRR={totalMRR}
        products={products.length}
        isApproved={isApproved}
        address={address}
        approvalBadge={approvalBadge}
      />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* [NEW — v9 SV-21] Incoming payout-wallet requests. Shown above
            everything else, regardless of which tab is active — this is
            actionable, time-relevant information (someone is proposing to
            make THIS wallet the new payout destination for a subscription),
            not routine dashboard content a merchant might not check. */}
        {pendingIncoming.length > 0 && (
          <div style={{ ...S.card, marginBottom: 20, border: "0.5px solid var(--amber)", background: "rgba(251,191,36,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ ...S.label, color: "var(--amber)" }}>
                {pendingIncoming.length === 1 ? "Payout wallet request" : `${pendingIncoming.length} payout wallet requests`}
              </span>
              {/* [NEW — batch rotation] Only worth showing once there's
                  more than one — for a single request the per-row Accept
                  button below is already the fastest path. */}
              {pendingIncoming.length > 1 && (
                <button
                  disabled={acceptingAll}
                  onClick={async () => {
                    setAcceptingAll(true);
                    for (const req of pendingIncoming) {
                      setAcceptingChange(prev => ({ ...prev, [req.id]: true }));
                      try {
                        await writeContractAsync({
                          address: VAULT_ADDRESS, abi: VAULT_ABI,
                          functionName: "acceptMerchantChange",
                          args: [BigInt(req.subscription_id)],
                        });
                      } catch (err) {
                        alert(`Failed on subscription #${req.subscription_id}: ${err.shortMessage || err.message}`);
                        // [FIX — Aug 2026] Real bug found via live testing:
                        // both transactions in a 2-item bulk accept actually
                        // succeeded on-chain, but the row buttons stayed
                        // stuck on "Confirming..." forever afterward. Root
                        // cause: acceptingAll was reset here, but
                        // acceptingChange was only ever cleared for the ONE
                        // request that failed — never for any that had
                        // already succeeded earlier in the same loop, and
                        // never at all on the full-success path below. Since
                        // individual Accept buttons are already disabled
                        // whenever acceptingAll is true, nothing else could
                        // be genuinely in-flight — safe to just clear the
                        // whole map here rather than track exactly which
                        // ids need resetting.
                        setAcceptingChange({});
                        setAcceptingAll(false);
                        reloadPendingChangesSoon();
                        return;
                      }
                    }
                    setAcceptingChange({});
                    setAcceptingAll(false);
                    reloadPendingChangesSoon();
                  }}
                  style={{ ...S.btn.ghost, opacity: acceptingAll ? 0.6 : 1, fontSize: 12 }}
                >
                  {acceptingAll ? "Accepting..." : `Accept all ${pendingIncoming.length}`}
                </button>
              )}
            </div>
            {pendingIncoming.map(req => (
              <div key={req.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: "0.5px solid var(--border)", gap: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--text-primary)" }}>{shortAddress(req.old_merchant)}</strong> wants this wallet to receive payouts for subscription <strong>#{req.subscription_id}</strong> going forward.
                </div>
                <button
                  disabled={acceptingChange[req.id] || acceptingAll}
                  onClick={async () => {
                    setAcceptingChange(prev => ({ ...prev, [req.id]: true }));
                    try {
                      await writeContractAsync({
                        address: VAULT_ADDRESS, abi: VAULT_ABI,
                        functionName: "acceptMerchantChange",
                        args: [BigInt(req.subscription_id)],
                      });
                      // [FIX — Aug 2026] Same bug class as the Accept All
                      // button above — success path called
                      // reloadPendingChangesSoon() but never reset this
                      // request's acceptingChange flag, so the button stayed
                      // on "Confirming..." until the row eventually
                      // disappeared from a later reload, rather than
                      // reflecting the real state immediately.
                      setAcceptingChange(prev => ({ ...prev, [req.id]: false }));
                      reloadPendingChangesSoon();
                    } catch (err) {
                      alert(`Could not accept: ${err.shortMessage || err.message}`);
                      setAcceptingChange(prev => ({ ...prev, [req.id]: false }));
                    }
                  }}
                  style={{ ...S.btn.primary, opacity: acceptingChange[req.id] ? 0.6 : 1, flexShrink: 0 }}
                >
                  {acceptingChange[req.id] ? "Confirming..." : "Accept"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard label="Active Subscribers" value={activeSubs.length}           sub="on Base Network"           icon="⊙" />
          <StatCard label="MRR"                 value={`$${totalMRR.toFixed(2)}`}  sub="monthly recurring USDC"    icon="◎" />
          <StatCard label="Net Revenue"         value={`$${netRevenue.toFixed(2)}`} sub="after 0.5% protocol fee"  icon="⊟" />
          <StatCard label="Products"            value={products.length}             sub="active plans"              icon="⊞" />
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

            {/* [FIX — Aug 2026] Was a duplicate embed of the exact same
                AnalyticsPanel chart shown on the dedicated Analytics tab —
                Overview showed strictly nothing the Analytics tab didn't
                already show, making that tab redundant. Replaced with a
                quick-glance widget instead: next payment due, computed
                from data already loaded (lastPulledAt + interval per
                subscriber), no new backend call needed. */}
            <div style={S.card}>
              <span style={S.label}>Next payment due</span>
              {(() => {
                const INTERVAL_SECONDS = [7 * 86400, 30 * 86400, 365 * 86400]; // Weekly, Monthly, Yearly
                const now = Math.floor(Date.now() / 1000);
                const upcoming = subscribers
                  .filter(s => s.status === 0 && s.lastPulledAt > 0)
                  .map(s => ({ ...s, nextDue: s.lastPulledAt + INTERVAL_SECONDS[s.interval] }))
                  .filter(s => s.nextDue >= now)
                  .sort((a, b) => a.nextDue - b.nextDue);

                if (upcoming.length === 0) {
                  return <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No upcoming payments</div>;
                }

                const next = upcoming[0];
                const daysUntil = Math.max(0, Math.ceil((next.nextDue - now) / 86400));
                return (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace", marginTop: 8 }}>
                      {daysUntil === 0 ? "Today" : `${daysUntil}d`}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {new Date(next.nextDue * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
                      {" · "}{shortAddress(next.owner)}
                    </div>
                    {upcoming.length > 1 && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>+{upcoming.length - 1} more due after</div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Subscriber breakdown */}
            <div style={S.card}>
              <span style={S.label}>Subscriber breakdown</span>
              {[
                { label: "Active",                count: subscribers.filter(s => s.status === 0).length, color: "var(--green)" },
                { label: "Paused (grace period)", count: subscribers.filter(s => s.status === 1).length, color: "var(--amber)" },
                { label: "Cancelled",             count: subscribers.filter(s => s.status === 2).length, color: "var(--red)" },
                { label: "Expired",               count: subscribers.filter(s => s.status === 3).length, color: "var(--text-secondary)" },
              ].map(r => (
                <div key={r.label} style={{ ...S.row }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.label}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: r.color, fontFamily: "monospace" }}>{r.count}</span>
                </div>
              ))}
            </div>

            {/* Recent activity */}
            <div style={S.card}>
              <span style={S.label}>Recent activity</span>
              {payments.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No payments yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {payments.slice(0, 6).map(p => (
                    <div key={p.payment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "0.5px solid var(--border)" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.executed_at ? new Date(p.executed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", fontFamily: "monospace", flexShrink: 0 }}>+${p.merchant_received_usdc}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => { setTab("payments"); loadPayments(); }} style={{ marginTop: 12, background: "none", border: "none", color: "var(--green)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                View all payments →
              </button>
            </div>

            {/* Quick actions */}
            <div style={{ ...S.card, gridColumn: "1 / -1" }}>
              <span style={S.label}>Quick actions</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => { setTab("products"); setShowAddProduct(true); }} style={S.btn.primary}>+ Add Product</button>
                <button onClick={() => setTab("products")} style={S.btn.ghost}>View Pay Links</button>
                <button onClick={() => setTab("webhooks")} style={S.btn.ghost}>Manage Webhooks</button>
                <button onClick={() => setTab("settings")} style={S.btn.ghost}>Settings</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Analytics ── */}
        {tab === "analytics" && (
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20, letterSpacing: "-0.01em" }}>
              Analytics
            </div>
            <AnalyticsPanel address={address} merchantAuthReady={merchantAuthReady} />
          </div>
        )}

        {/* ── Products ── */}
        {tab === "products" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{products.length} product{products.length !== 1 ? "s" : ""}</span>
              <button onClick={() => setShowAddProduct(true)} style={S.btn.primary}>+ New Product</button>
            </div>

            {products.length === 0 ? (
              <EmptyState message="No products yet" sub="Create your first plan to generate a pay link." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {products.map(p => {
                  const payLink = handle ? `${BASE_URL}/${handle}/${p.slug}` : `${BASE_URL}/${address.toLowerCase()}/${p.slug}`;
                  return (
                    <div key={p.id} style={{ ...S.card, padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{p.name}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>${p.amount.toFixed(2)} USDC · {INTERVAL_NAMES[p.interval]}</span>
                            {p.intro_amount > 0 && p.intro_pulls > 0 && (
                              <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99, background: "rgba(251,191,36,0.1)", color: "var(--amber)", fontWeight: 600 }}>
                                🎁 ${p.intro_amount.toFixed(2)} intro × {p.intro_pulls}
                              </span>
                            )}
                            {p.yearly_amount && (
                              <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 99, background: "rgba(29,158,117,0.1)", color: "var(--green)", fontWeight: 600 }}>
                                📅 ${p.yearly_amount.toFixed(2)}/yr
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setEditProduct(p)} style={S.btn.ghost}>Edit</button>
                          <button onClick={async () => {
                            if (!window.confirm("Delete " + p.name + "?")) return;
                            try {
                              const res = await merchantFetch(`${API_BASE}/api/products/${address}/${p.slug}`, { method: "DELETE" });
                              if (res.ok) loadProducts(); else alert("Could not delete product.");
                            } catch { alert("Could not reach server."); }
                          }} style={S.btn.danger}>Delete</button>
                        </div>
                      </div>

                      {/* Pay link row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", background: "var(--bg-tag)", padding: "6px 12px", borderRadius: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, border: "0.5px solid var(--border)" }}>
                          {payLink}
                        </div>
                        <button onClick={() => copyLink(payLink, p.id)} style={{ ...S.btn.ghost, padding: "6px 12px", fontSize: 11 }}>
                          {copied === p.id ? "✓ Copied" : "Copy"}
                        </button>
                        <button onClick={() => setQrProduct(p)} style={{ ...S.btn.ghost, padding: "6px 12px", fontSize: 11 }}>QR</button>
                        <button
                          onClick={() => setTrialProduct(p)}
                          title="Generate a special link that gives new subscribers 1–60 free days before their first payment. Share it for promotions or campaigns — your regular pay link is unaffected."
                          style={{ ...S.btn.ghost, padding: "6px 12px", fontSize: 11 }}
                        >Trial Link</button>
                        <button onClick={() => setPriceChangeProduct(p)} style={{ ...S.btn.amber, fontSize: 11 }}>📢 Price Change</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Info box */}
            <div style={{ ...S.card, marginTop: 20, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
              <span style={S.label}>How pricing works</span>
              <strong style={{ color: "var(--text-secondary)" }}>Introductory pricing</strong> is set per product — e.g. $5 for first month, then $20/month.<br />
              <strong style={{ color: "var(--text-secondary)" }}>Free trial links</strong> are campaign-based — click "Trial Link" to generate a link with 1–60 free days.
            </div>
          </div>
        )}

        {/* ── Subscribers ── */}
        {tab === "subscribers" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{subscribers.length} total</span>
              {/* [NEW — batch rotation] Only appears once 1+ rows are
                  selected — the rest of the time this bar doesn't exist,
                  so nothing changes for merchants who never use it. */}
              {Object.values(selectedSubs).filter(Boolean).length > 0 && (
                <button onClick={() => setBulkChangeOpen(true)} style={S.btn.primary}>
                  Change wallet for {Object.values(selectedSubs).filter(Boolean).length} selected
                </button>
              )}
            </div>

            {/* ── CSV Import ── */}
            <CsvImport address={address} products={products} />

            {loading ? (
              <EmptyState message="Loading subscribers..." />
            ) : subscribers.length === 0 ? (
              <EmptyState message="No subscribers yet" sub="Share your pay link to get your first subscriber." />
            ) : (
              <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 2fr 1fr 1fr 1fr 1fr 1.2fr", padding: "10px 20px", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "0.5px solid var(--border)", background: "var(--bg-tag)", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={subscribers.length > 0 && subscribers.filter(s => (s.status === 0 || s.status === 1) && !pendingOutgoing.some(r => String(r.subscription_id) === String(s.id))).every(s => selectedSubs[s.id])}
                    onChange={e => {
                      const eligible = subscribers.filter(s => (s.status === 0 || s.status === 1) && !pendingOutgoing.some(r => String(r.subscription_id) === String(s.id)));
                      const next = {};
                      if (e.target.checked) eligible.forEach(s => { next[s.id] = true; });
                      setSelectedSubs(next);
                    }}
                  />
                  <span>Subscriber</span><span>Amount</span><span>Interval</span><span>Status</span><span>Last Pull</span><span>Payout Wallet</span>
                </div>
                {subscribers.map((sub, i) => {
                  const pendingReq = pendingOutgoing.find(r => String(r.subscription_id) === String(sub.id));
                  return (
                  <div key={sub.id} style={{ display: "grid", gridTemplateColumns: "auto 2fr 1fr 1fr 1fr 1fr 1.2fr", padding: "14px 20px", fontSize: 13, alignItems: "center", borderBottom: i < subscribers.length - 1 ? "0.5px solid var(--border)" : "none", gap: 10 }}>
                    <input
                      type="checkbox"
                      disabled={!(sub.status === 0 || sub.status === 1) || !!pendingReq}
                      checked={!!selectedSubs[sub.id]}
                      onChange={e => setSelectedSubs(prev => ({ ...prev, [sub.id]: e.target.checked }))}
                    />
                    <div>
                      {sub.name && <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{sub.name}</div>}
                      {sub.email && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{sub.email}</div>}
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: sub.name || sub.email ? "var(--text-muted)" : "var(--text-primary)" }}>
                        {/* [FIX — Aug 2026] Was sub.vault_address, a field that
                            doesn't exist on this on-chain-sourced object —
                            always rendered blank. Real field is safeVault. */}
                        {shortAddress(sub.safeVault)}
                        {sub.type === "fiat"   && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(59,130,246,0.1)", color: "var(--blue)" }}>fiat</span>}
                        {sub.type === "crypto" && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(29,158,117,0.1)", color: "var(--green)" }}>crypto</span>}
                      </div>
                    </div>
                    {/* [FIX] Was ${sub.amount_usdc} — that field doesn't
                        exist either, rendered literal "$undefined". Real
                        field is sub.amount, raw USDC (6 decimals). */}
                    <span style={{ color: "var(--green)", fontWeight: 600, fontFamily: "monospace" }}>{formatUSDC(sub.amount)}</span>
                    {/* [FIX] sub.interval is already the numeric index (0/1/2)
                        matching INTERVAL_NAMES' own order — the old code
                        wrapped it in a string-keyed lookup object expecting
                        'weekly'/'monthly'/'yearly' strings that were never
                        actually there, so this always fell through to the
                        raw number as a fallback ("0" instead of "Weekly"). */}
                    <span style={{ color: "var(--text-secondary)" }}>{INTERVAL_NAMES[sub.interval] || "—"}</span>
                    {/* [FIX] Same issue — sub.status is already the numeric
                        enum StatusBadge expects directly; the string-keyed
                        lookup here always missed and fell back to passing
                        the raw number through anyway, so this one likely
                        happened to still work by coincidence, but simplified
                        for correctness and to match the pattern above. */}
                    <StatusBadge status={sub.status} />
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {sub.lastPulledAt && sub.lastPulledAt > 0
                        ? new Date(sub.lastPulledAt * 1000).toLocaleDateString()
                        : "Never"}
                    </span>
                    {/* [NEW — v9 SV-21] Payout wallet rotation. Only shown
                        for active/paused subs — a cancelled/expired sub has
                        nothing left to redirect. */}
                    <div>
                      {pendingReq ? (
                        <div style={{ fontSize: 11 }}>
                          <span style={{ color: "var(--amber)" }}>Pending → {shortAddress(pendingReq.new_merchant)}</span>
                          <button
                            onClick={async () => {
                              try {
                                await writeContractAsync({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "cancelMerchantChange", args: [BigInt(sub.id)] });
                                reloadPendingChangesSoon(); // give notifier.js time to index the event
                              } catch (err) { alert(`Could not cancel: ${err.shortMessage || err.message}`); }
                            }}
                            style={{ display: "block", marginTop: 4, background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (sub.status === 0 || sub.status === 1) ? (
                        <button onClick={() => setChangePayoutSub(sub.id)} style={{ background: "none", border: "0.5px solid var(--border)", borderRadius: 6, color: "var(--text-secondary)", fontSize: 11, cursor: "pointer", padding: "4px 8px" }}>
                          Change wallet
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Payments ── */}
        {tab === "payments" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{payments.length} payment{payments.length !== 1 ? "s" : ""} recorded</span>
              {payments.length > 0 && (
                <button onClick={() => exportPaymentsCSV(payments, address)} style={S.btn.ghost}>⬇ Export CSV</button>
              )}
            </div>
            {paymentsLoading ? (
              <EmptyState message="Loading payments..." />
            ) : payments.length === 0 ? (
              <EmptyState message="No payments yet" sub="Payments will appear here after the first keeper pull." />
            ) : (
              <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1.5fr", padding: "10px 20px", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "0.5px solid var(--border)", background: "var(--bg-tag)" }}>
                  <span>Date</span><span>Amount</span><span>You Received</span><span>Fee</span><span>Transaction</span>
                </div>
                {payments.map((p, i) => (
                  <div key={p.payment_id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1.5fr", padding: "14px 20px", fontSize: 13, alignItems: "center", borderBottom: i < payments.length - 1 ? "0.5px solid var(--border)" : "none" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{new Date(p.executed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span style={{ color: "var(--text-primary)", fontFamily: "monospace", fontWeight: 600 }}>${p.amount_usdc}</span>
                    <span style={{ color: "var(--green)", fontFamily: "monospace", fontWeight: 600 }}>${p.merchant_received_usdc}</span>
                    <span style={{ color: "var(--red)", fontFamily: "monospace", fontSize: 12 }}>-${p.protocol_fee_usdc}</span>
                    <a href={`https://sepolia.basescan.org/tx/${p.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "monospace", fontSize: 11, color: "var(--green)", textDecoration: "none" }}>
                      {p.tx_hash?.slice(0, 10)}...{p.tx_hash?.slice(-6)} ↗
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Webhooks ── */}
        {tab === "webhooks" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{webhooks.length} webhook{webhooks.length !== 1 ? "s" : ""}</span>
              <button onClick={() => setShowAddWebhook(true)} style={S.btn.primary}>+ Add Webhook</button>
            </div>

            {webhooks.length === 0 ? (
              <EmptyState message="No webhooks configured" sub="Add a webhook to receive real-time payment events." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {webhooks.map(wh => (
                  <div key={wh.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                    <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wh.url}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: "rgba(29,158,117,0.12)", color: "var(--green)", fontWeight: 600 }}>Active</span>
                        <button
                          disabled={testFiring[wh.id]}
                          onClick={async () => {
                            setTestFiring(prev => ({ ...prev, [wh.id]: true }));
                            setTestResults(prev => ({ ...prev, [wh.id]: null }));
                            try {
                              const res  = await merchantFetch(`${API_BASE}/api/webhooks/test`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ webhook_id: wh.id, event: "test.ping" }),
                              });
                              const data = await res.json();
                              // [FIX — Aug 2026] Was checking res.ok — the HTTP
                              // status of the /api/webhooks/test call itself,
                              // which is always 200 whether or not the actual
                              // webhook delivery succeeded. Must check
                              // data.success (the real delivery outcome) instead,
                              // or this always shows "Delivered" even on failure.
                              setTestResults(prev => ({ ...prev, [wh.id]: data.success ? { ok: true, text: `✓ Delivered — ${data.status || 200}` } : { ok: false, text: data.body || data.message || `Failed${data.status ? ` — ${data.status}` : ""}` } }));
                            } catch {
                              setTestResults(prev => ({ ...prev, [wh.id]: { ok: false, text: "Could not reach server" } }));
                            } finally {
                              setTestFiring(prev => ({ ...prev, [wh.id]: false }));
                            }
                          }}
                          style={{ ...S.btn.amber, opacity: testFiring[wh.id] ? 0.6 : 1 }}
                        >
                          {testFiring[wh.id] ? "Sending..." : "Test"}
                        </button>
                        {/* [FIX — Aug 2026] Delete was entirely missing —
                            a merchant with a typo'd or dead URL had no way
                            to remove or fix it through the product. */}
                        <button
                          disabled={deletingWebhook[wh.id]}
                          onClick={async () => {
                            if (!window.confirm(`Remove webhook ${wh.url}? This can't be undone.`)) return;
                            setDeletingWebhook(prev => ({ ...prev, [wh.id]: true }));
                            try {
                              const res = await merchantFetch(`${API_BASE}/api/webhooks/${wh.id}`, { method: "DELETE" });
                              if (res.ok) {
                                loadWebhooks();
                              } else {
                                alert("Could not remove webhook. Please try again.");
                              }
                            } catch {
                              alert("Could not reach server.");
                            } finally {
                              setDeletingWebhook(prev => ({ ...prev, [wh.id]: false }));
                            }
                          }}
                          style={{ ...S.btn.danger, opacity: deletingWebhook[wh.id] ? 0.6 : 1 }}
                        >
                          {deletingWebhook[wh.id] ? "Removing..." : "Delete"}
                        </button>
                      </div>
                    </div>
                    {testResults[wh.id] && (
                      <div style={{ padding: "8px 20px", background: testResults[wh.id].ok ? "rgba(29,158,117,0.06)" : "rgba(248,113,113,0.06)", fontSize: 12, color: testResults[wh.id].ok ? "var(--green)" : "var(--red)", fontFamily: "monospace" }}>
                        {testResults[wh.id].text}
                      </div>
                    )}
                    <div style={{ padding: "10px 20px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "0.5px solid var(--border)" }}>
                      {wh.events.map(e => (
                        <span key={e} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(59,130,246,0.08)", color: "var(--blue)", fontFamily: "monospace", border: "0.5px solid rgba(59,130,246,0.2)" }}>{e}</span>
                      ))}
                    </div>
                    <div style={{ background: "#060a12", padding: "14px 20px", fontFamily: "monospace", fontSize: 12 }}>
                      <div style={{ color: "#334155", fontSize: 10, marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Recent deliveries</div>
                      {(wh.recentDeliveries || []).length === 0 ? (
                        <div style={{ color: "#475569", fontSize: 12 }}>No deliveries yet — waiting for first event.</div>
                      ) : (
                        wh.recentDeliveries.map((d, i) => (
                          <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "4px 0", borderBottom: i < wh.recentDeliveries.length - 1 ? "0.5px solid rgba(255,255,255,0.03)" : "none" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: d.status < 300 ? "var(--green)" : d.status >= 500 ? "var(--red)" : "var(--amber)", minWidth: 30 }}>{d.status}</span>
                            <span style={{ color: d.status < 300 ? "var(--green)" : "var(--red)", flex: 1 }}>{d.event}</span>
                            <span style={{ color: "#1e293b", fontSize: 11 }}>{d.time}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ ...S.card, marginTop: 20 }}>
              <span style={S.label}>Webhook security</span>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                Every request includes a <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>X-AuthOnce-Signature</span> header signed with HMAC-SHA256.
                Failed deliveries retry: 10s → 1min → 5min → 30min → 2hr.
              </div>
            </div>
          </div>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>Manage your business profile and notification preferences.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={S.label}>Business Name</label>
                <input value={settings.businessName} onChange={e => setSettings(s => ({ ...s, businessName: e.target.value }))} placeholder="Your business name" />
              </div>
              <div>
                <label style={S.label}>Business Email</label>
                <input value={settings.email} onChange={e => setSettings(s => ({ ...s, email: e.target.value }))} placeholder="info@yourbusiness.com" type="email" />
              </div>
              <div>
                <label style={S.label}>Notification Email</label>
                <input value={settings.notifyEmail || ""} onChange={e => setSettings(s => ({ ...s, notifyEmail: e.target.value }))} placeholder="alerts@yourbusiness.com" type="email" />
              </div>

              <div>
                <label style={S.label}>Notification Preference</label>
                {[
                  ["email",   "Email only",            "Recommended."],
                  ["webhook", "Webhook only",           "For developers."],
                  ["both",    "Both email and webhook", "Email + webhook."],
                ].map(([val, label, desc]) => (
                  <div key={val} onClick={() => setSettings(s => ({ ...s, notifications: val }))} style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "12px 14px", borderRadius: 8, cursor: "pointer", marginBottom: 8,
                    border: `0.5px solid ${settings.notifications === val ? "var(--green)" : "var(--border)"}`,
                    background: settings.notifications === val ? "rgba(29,158,117,0.06)" : "var(--bg-card)",
                  }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${settings.notifications === val ? "var(--green)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 }}>
                      {settings.notifications === val && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* VAT & Billing — required for EU invoicing compliance */}
              <div style={{ ...S.card }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>🧾 VAT & Billing Details</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                  Required for EU invoicing. If you have a VAT number, SaaS tier fees are invoiced without IVA (reverse charge applies).
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={S.label}>Country</label>
                    <select
                      value={settings.countryCode || "PT"}
                      onChange={e => setSettings(s => ({ ...s, countryCode: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13 }}
                    >
                      {[
                        ["PT","Portugal"],["DE","Germany"],["FR","France"],["ES","Spain"],
                        ["IT","Italy"],["NL","Netherlands"],["BE","Belgium"],["AT","Austria"],
                        ["SE","Sweden"],["DK","Denmark"],["FI","Finland"],["PL","Poland"],
                        ["GB","United Kingdom"],["CH","Switzerland"],["US","United States"],
                        ["BR","Brazil"],["SG","Singapore"],["OTHER","Other"],
                      ].map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>VAT Number <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
                    <input
                      value={settings.vatNumber || ""}
                      onChange={e => setSettings(s => ({ ...s, vatNumber: e.target.value.toUpperCase() }))}
                      placeholder="e.g. PT123456789 or DE123456789"
                      style={{ fontFamily: "monospace" }}
                    />
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      EU format: 2-letter country code + number. Enables reverse charge on invoices.
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>Billing Address <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
                    <textarea
                      value={settings.billingAddress || ""}
                      onChange={e => setSettings(s => ({ ...s, billingAddress: e.target.value }))}
                      placeholder={"Company Name\nStreet Address\nCity, Postcode\nCountry"}
                      rows={4}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit", resize: "vertical" }}
                    />
                  </div>
                </div>
              </div>

              {/* Vanity handle */}
              <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>🔗 Vanity Pay Link</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                  Replace your wallet address in pay links with a memorable handle.<br />
                  <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>authonce.io/pay/<strong>{handle || "yourhandle"}</strong>/product-slug</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={handleInput}
                    onChange={e => setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="e.g. gymportugal"
                    maxLength={30}
                    style={{ flex: 1 }}
                  />
                  <button
                    disabled={handleSaving || handleInput.length < 3}
                    onClick={async () => {
                      setHandleSaving(true); setHandleMsg(null);
                      try {
                        const res  = await merchantFetch(`${API_BASE}/api/merchant/handle`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ handle: handleInput }),
                        });
                        const data = await res.json();
                        if (res.ok) { setHandle(data.handle); setHandleMsg({ ok: true, text: `✓ Handle "${data.handle}" saved.` }); }
                        else setHandleMsg({ ok: false, text: data.message || "Could not save handle." });
                      } catch { setHandleMsg({ ok: false, text: "Could not reach server." }); }
                      finally { setHandleSaving(false); }
                    }}
                    style={{ ...S.btn.primary, opacity: handleSaving || handleInput.length < 3 ? 0.5 : 1 }}
                  >
                    {handleSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                {handleMsg && <div style={{ fontSize: 12, marginTop: 8, color: handleMsg.ok ? "var(--green)" : "var(--red)" }}>{handleMsg.text}</div>}
              </div>

              <button
                onClick={async () => {
                  localStorage.setItem("merchant_settings_" + address, JSON.stringify(settings));
                  try {
                    const res = await fetch(`${API_BASE}/api/merchants/register`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        wallet_address: address,
                        business_name: settings.businessName,
                        email: settings.notifyEmail || settings.email,
                        settlement_preference: "usdc",
                        country_code: settings.countryCode || "PT",
                        vat_number: settings.vatNumber || null,
                        billing_address: settings.billingAddress || null,
                      }),
                    });
                    if (res.ok) alert("Settings saved!"); else alert("Saved locally. Could not sync to server.");
                  } catch { alert("Saved locally. Could not reach server."); }
                }}
                style={S.btn.primary}
              >
                Save Settings
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddProduct && <AddProductModal merchantAddress={address} onClose={() => setShowAddProduct(false)} onAdded={loadProducts} />}
      {editProduct    && <EditProductModal merchantAddress={address} product={editProduct} onClose={() => setEditProduct(null)} onSaved={loadProducts} />}
      {showAddWebhook && <WebhookModal merchantAddress={address} merchantAuthReady={merchantAuthReady} onClose={() => setShowAddWebhook(false)} onSaved={loadWebhooks} />}
      {trialProduct   && <TrialPopover product={trialProduct} address={address} onClose={() => setTrialProduct(null)} />}
      {priceChangeProduct && <PriceChangeModal product={priceChangeProduct} address={address} onClose={() => setPriceChangeProduct(null)} />}
      {(changePayoutSub !== null || bulkChangeOpen) && (
        <ChangePayoutWalletModal
          subscriptionIds={bulkChangeOpen ? Object.keys(selectedSubs).filter(id => selectedSubs[id]) : [changePayoutSub]}
          writeContractAsync={writeContractAsync}
          onClose={() => { setChangePayoutSub(null); setBulkChangeOpen(false); }}
          onSaved={() => { setSelectedSubs({}); reloadPendingChangesSoon(); }}
        />
      )}

      {/* QR Modal */}
      {qrProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setQrProduct(null)}>
          <div id="qr-modal" style={{ background: "var(--bg-card)", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", border: "0.5px solid var(--border)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{qrProduct.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>${qrProduct.amount.toFixed(2)} USDC · {INTERVAL_NAMES[qrProduct.interval]}</div>
            <QRCodeSVG value={handle ? `${BASE_URL}/${handle}/${qrProduct.slug}` : `${BASE_URL}/${address.toLowerCase()}/${qrProduct.slug}`} size={200} />
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16, fontFamily: "monospace", wordBreak: "break-all", maxWidth: 240 }}>
              {handle ? `${BASE_URL}/${handle}/${qrProduct.slug}` : `${BASE_URL}/${address.toLowerCase()}/${qrProduct.slug}`}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => {
                const svg     = document.querySelector("#qr-modal svg");
                const svgData = new XMLSerializer().serializeToString(svg);
                const canvas  = document.createElement("canvas");
                canvas.width  = 200; canvas.height = 200;
                const ctx     = canvas.getContext("2d");
                const img     = new Image();
                img.onload    = () => { ctx.drawImage(img, 0, 0); const a = document.createElement("a"); a.download = `${qrProduct.name}-qr.png`; a.href = canvas.toDataURL(); a.click(); };
                img.src       = "data:image/svg+xml;base64," + btoa(svgData);
              }} style={S.btn.ghost}>⬇ Download</button>
              <button onClick={() => window.print()} style={S.btn.ghost}>🖨 Print</button>
              <button onClick={() => {
                const url = handle ? `${BASE_URL}/${handle}/${qrProduct.slug}` : `${BASE_URL}/${address.toLowerCase()}/${qrProduct.slug}`;
                const msg = encodeURIComponent(`Subscribe to ${qrProduct.name} — $${qrProduct.amount.toFixed(2)} USDC/${INTERVAL_NAMES[qrProduct.interval]}: ${url}`);
                window.open(`https://wa.me/?text=${msg}`, "_blank");
              }} style={{ background: "rgba(37,211,102,0.12)", border: "0.5px solid rgba(37,211,102,0.3)", borderRadius: 8, color: "#25d366", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>WhatsApp</button>
              <button onClick={() => setQrProduct(null)} style={S.btn.ghost}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
