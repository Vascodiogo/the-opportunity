// src/components/AdminDashboard.jsx — Visual redesign May 2026
// Logic: unchanged. Visual: CSS variables, consistent design tokens, no gradient buttons.
import { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function shortAddr(a) {
  if (!a) return "—";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
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
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{
      ...S.card, padding: "20px 24px",
      borderLeft: `2px solid ${color || "var(--green)"}`,
    }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "var(--green)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

// ─── Merchant Row ─────────────────────────────────────────────────────────────
function MerchantRow({ merchant, token, onRefresh, isLast }) {
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
      display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr",
      alignItems: "center", padding: "14px 20px",
      borderBottom: isLast ? "none" : "0.5px solid var(--border)",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {merchant.business_name || <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>No name</span>}
        </div>
        <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", marginTop: 2 }}>
          {shortAddr(merchant.wallet_address)}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{merchant.email || "—"}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(merchant.created_at)}</div>
      <div>
        {isPending ? (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "rgba(251,191,36,0.12)", color: "var(--amber)", fontWeight: 600 }}>
            Pending
          </span>
        ) : (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "rgba(29,158,117,0.12)", color: "var(--green)", fontWeight: 600 }}>
            ✓ Approved
          </span>
        )}
      </div>
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
        <input
          value={address}
          onChange={e => setAddress(e.target.value.trim())}
          placeholder="0x merchant wallet address"
          style={{ flex: 1, fontFamily: "monospace" }}
        />
        <button
          onClick={handleApprove}
          disabled={loading || !address}
          style={{ ...S.btn.primary, opacity: loading || !address ? 0.5 : 1 }}
        >
          {loading ? "Approving..." : "Approve Merchant"}
        </button>
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</div>}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 20px", color: "var(--text-muted)", fontSize: 13 }}>
      {message}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard({ token, email, onLogout, isDark }) {
  const [stats, setStats]         = useState(null);
  const [merchants, setMerchants] = useState([]);
  const [tab, setTab]             = useState("overview");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [filter, setFilter]       = useState("all");
  const isMainnet = import.meta.env.VITE_NETWORK === "mainnet";

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { onLogout(); return; }
      const data = await res.json();
      setStats(data);
    } catch { setError("Could not load stats."); }
    finally { setLoading(false); }
  }, [token]);

  const fetchMerchants = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/merchants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { const data = await res.json(); setMerchants(data.merchants || []); }
    } catch { console.error("Could not load merchants."); }
  }, [token]);

  useEffect(() => { fetchStats(); fetchMerchants(); }, [fetchStats, fetchMerchants]);

  const pendingCount  = merchants.filter(m => !m.approved_at).length;
  const approvedCount = merchants.filter(m => !!m.approved_at).length;

  const filteredMerchants = merchants.filter(m => {
    if (filter === "pending")  return !m.approved_at;
    if (filter === "approved") return !!m.approved_at;
    return true;
  });

  const REGISTRY_ADDRESS = isMainnet ? "[MAINNET_REGISTRY_ADDRESS]" : "0xaB9a719AD824CF81Ade886E7987702d62cb3df40";
  const VAULT_ADDRESS    = isMainnet ? "[MAINNET_VAULT_ADDRESS]"    : "0x12ded877546bdaF500A1FeAd66798d5877c42f1d";
  const basescanBase     = isMainnet ? "https://basescan.org"       : "https://sepolia.basescan.org";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", fontFamily: "'DM Sans', sans-serif", color: "var(--text-primary)" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

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
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
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

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "36px 32px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Protocol Admin</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            {isMainnet ? "Base Mainnet — production" : "Base Sepolia — testnet"}
          </p>
        </div>

        {loading && <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>}
        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: 16, color: "var(--red)", fontSize: 13, marginBottom: 24 }}>
            {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "0.5px solid var(--border)", marginBottom: 24 }}>
          {[
            ["overview",  "Overview"],
            ["merchants", `Merchants${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}`],
            ["contracts", "Contracts"],
          ].map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)} style={{
              background: "none", border: "none", padding: "10px 18px", cursor: "pointer",
              fontSize: 13, fontWeight: tab === val ? 600 : 400, fontFamily: "inherit",
              color: tab === val ? "var(--text-primary)" : "var(--text-muted)",
              borderBottom: tab === val ? "2px solid var(--green)" : "2px solid transparent",
              transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Active subscriptions" value={stats.subscriptions.active}                                    color="var(--green)" />
              <StatCard label="Paused"                value={stats.subscriptions.paused}                                   color="var(--amber)" />
              <StatCard label="Total payments"        value={stats.payments.total}                                         color="var(--blue)" />
              <StatCard label="Volume (USDC)"         value={`$${stats.payments.volume_usdc?.toFixed(2) || "0.00"}`}       color="var(--green)" />
              <StatCard label="Approved merchants"    value={approvedCount}                                                color="var(--text-secondary)" />
              <StatCard label="Pending approval"      value={pendingCount}                                                 color="var(--amber)" />
            </div>

            <div style={{ ...S.card, padding: 24, marginBottom: 16 }}>
              <span style={S.label}>Subscription breakdown</span>
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                {[
                  { label: "Active",    value: stats.subscriptions.active,    color: "var(--green)" },
                  { label: "Paused",    value: stats.subscriptions.paused,    color: "var(--amber)" },
                  { label: "Cancelled", value: stats.subscriptions.cancelled, color: "var(--red)" },
                  { label: "Expired",   value: stats.subscriptions.expired,   color: "var(--text-muted)" },
                  { label: "Total",     value: stats.subscriptions.total,     color: "var(--text-primary)" },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr", padding: "10px 20px", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "0.5px solid var(--border)", background: "var(--bg-tag)" }}>
                <span>Merchant</span><span>Email</span><span>Registered</span><span>Status</span><span />
              </div>
              {filteredMerchants.length === 0 ? (
                <EmptyState message="No merchants found." />
              ) : (
                filteredMerchants.map((m, i) => (
                  <MerchantRow
                    key={m.wallet_address}
                    merchant={m}
                    token={token}
                    onRefresh={fetchMerchants}
                    isLast={i === filteredMerchants.length - 1}
                  />
                ))
              )}
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)", lineHeight: 1.6 }}>
              Note: Approval here sets the <code style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>approved_at</code> flag in the database. On-chain registry approval via Basescan is separate and required for crypto-native flows.
            </div>
          </div>
        )}

        {/* ── Contracts ── */}
        {tab === "contracts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "MerchantRegistry",  address: REGISTRY_ADDRESS, note: "Approve merchants, set fees" },
              { label: "SubscriptionVault", address: VAULT_ADDRESS,    note: "Subscription lifecycle, executePull" },
              { label: "USDC",              address: isMainnet ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : "0x036CbD53842c5426634e7929541eC2318f3dCF7e", note: "Payment token — hardcoded" },
            ].map(c => (
              <div key={c.label} style={{ ...S.card, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{c.label}</div>
                  <a href={`${basescanBase}/address/${c.address}#writeContract`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--green)", textDecoration: "none" }}>
                    View on Basescan ↗
                  </a>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", marginBottom: 4, wordBreak: "break-all" }}>{c.address}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{c.note}</div>
              </div>
            ))}

            {/* Mainnet checklist */}
            <div style={{ background: "rgba(29,158,117,0.05)", border: "0.5px solid rgba(29,158,117,0.15)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--green)", marginBottom: 12 }}>Mainnet deployment checklist</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["Deploy SubscriptionVault to Base Mainnet",             false],
                  ["Deploy MerchantRegistry to Base Mainnet",              false],
                  ["Update VITE_NETWORK=mainnet in Cloudflare env",        false],
                  ["Update VAULT_ADDRESS + REGISTRY_ADDRESS in config.js", false],
                  ["Update keeper/notifier Railway env vars to mainnet",   false],
                  ["Set up Safe multisig + Ledger for treasury",           false],
                  ["Rotate Basescan API key (exposed May 3)",              false],
                  ["Smart contract audit complete",                        false],
                  ["Legal opinion from Fio Legal received",                false],
                  ["VASP registration Portugal — IAPMEI",                  false],
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
      </div>
    </div>
  );
}
