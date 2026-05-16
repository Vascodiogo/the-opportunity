// src/components/AdminDashboard.jsx — AuthOnce Admin Dashboard
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

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, border }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: `0.5px solid ${border || "rgba(255,255,255,0.07)"}`,
      borderRadius: 12, padding: "20px 24px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.6 }} />
      <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "monospace", letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

// ─── Merchant Row ─────────────────────────────────────────────────────────────
function MerchantRow({ merchant, token, onRefresh }) {
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
      borderBottom: "0.5px solid rgba(255,255,255,0.04)",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
          {merchant.business_name || <span style={{ color: "#334155", fontStyle: "italic" }}>No name</span>}
        </div>
        <div style={{ fontSize: 11, fontFamily: "monospace", color: "#475569", marginTop: 2 }}>
          {shortAddr(merchant.wallet_address)}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>{merchant.email || "—"}</div>
      <div style={{ fontSize: 12, color: "#475569" }}>{formatDate(merchant.created_at)}</div>
      <div>
        {isPending ? (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600 }}>
            Pending
          </span>
        ) : (
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "rgba(52,211,153,0.12)", color: "#34d399", fontWeight: 600 }}>
            ✓ Approved
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {isPending && (
          <button
            onClick={handleApprove}
            disabled={loading}
            style={{
              background: "rgba(52,211,153,0.12)", border: "0.5px solid rgba(52,211,153,0.3)",
              borderRadius: 6, color: "#34d399", fontSize: 11, fontWeight: 600,
              padding: "5px 12px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "..." : "Approve"}
          </button>
        )}
        {isApproved && (
          <button
            onClick={handleReject}
            disabled={loading}
            style={{
              background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)",
              borderRadius: 6, color: "#f87171", fontSize: 11, fontWeight: 600,
              padding: "5px 12px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "..." : "Revoke"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Manual Approve Input ─────────────────────────────────────────────────────
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
      // Register merchant first if not exists
      await fetch(`${API_BASE}/api/merchants/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: address.toLowerCase() }),
      });
      const res = await fetch(`${API_BASE}/api/admin/merchants/${address}/approve`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMsg({ ok: true, text: `✓ ${shortAddr(address)} approved.` });
        setAddress("");
        onRefresh();
      } else {
        setMsg({ ok: false, text: "Could not approve." });
      }
    } catch { setMsg({ ok: false, text: "Could not reach server." }); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Approve by address</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={address}
          onChange={e => setAddress(e.target.value.trim())}
          placeholder="0x merchant wallet address"
          style={{
            flex: 1, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "8px 12px", color: "#f1f5f9", fontSize: 13, fontFamily: "monospace",
          }}
        />
        <button
          onClick={handleApprove}
          disabled={loading || !address}
          style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none",
            borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13,
            padding: "8px 18px", cursor: loading || !address ? "not-allowed" : "pointer",
            opacity: loading || !address ? 0.6 : 1,
          }}
        >
          {loading ? "Approving..." : "Approve Merchant"}
        </button>
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? "#34d399" : "#f87171" }}>{msg.text}</div>}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard({ token, email, onLogout, isDark }) {
  const [stats, setStats]       = useState(null);
  const [merchants, setMerchants] = useState([]);
  const [tab, setTab]           = useState("overview");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [filter, setFilter]     = useState("all"); // "all" | "pending" | "approved"
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
      if (res.ok) {
        const data = await res.json();
        setMerchants(data.merchants || []);
      }
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

  const REGISTRY_ADDRESS = isMainnet
    ? "[MAINNET_REGISTRY_ADDRESS]"
    : "0xaB9a719AD824CF81Ade886E7987702d62cb3df40";

  const VAULT_ADDRESS = isMainnet
    ? "[MAINNET_VAULT_ADDRESS]"
    : "0x12ded877546bdaF500A1FeAd66798d5877c42f1d";

  const basescanBase = isMainnet ? "https://basescan.org" : "https://sepolia.basescan.org";

  return (
    <div style={{ minHeight: "100vh", background: "#080c14", fontFamily: "'DM Sans', sans-serif", color: "#f1f5f9" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 58,
        borderBottom: "0.5px solid rgba(255,255,255,0.07)",
        background: "rgba(8,12,20,0.95)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg, #34d399, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#080c14" }}>A</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Auth<span style={{ color: "#34d399" }}>Once</span></span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(251,191,36,0.15)", color: "#d97706", fontWeight: 600 }}>Admin</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: isMainnet ? "rgba(52,211,153,0.15)" : "rgba(59,130,246,0.15)", color: isMainnet ? "#34d399" : "#3b82f6", fontWeight: 600 }}>
            {isMainnet ? "Base Mainnet" : "Base Sepolia"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#475569" }}>{email}</span>
          <button onClick={onLogout} style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", color: "#475569", fontSize: 12 }}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "36px 32px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Protocol Admin</h2>
          <p style={{ color: "#334155", fontSize: 13, margin: 0 }}>
            {isMainnet ? "Base Mainnet — production" : "Base Sepolia — testnet"}
          </p>
        </div>

        {loading && <p style={{ color: "#334155", fontSize: 14 }}>Loading…</p>}
        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: 16, color: "#f87171", fontSize: 13, marginBottom: 24 }}>{error}</div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "0.5px solid rgba(255,255,255,0.07)", marginBottom: 24 }}>
          {[
            ["overview",  "Overview"],
            ["merchants", `Merchants ${pendingCount > 0 ? `· ${pendingCount} pending` : ""}`],
            ["contracts", "Contracts"],
          ].map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)} style={{
              background: "none", border: "none", padding: "10px 18px", cursor: "pointer",
              fontSize: 13, fontWeight: tab === val ? 600 : 400,
              color: tab === val ? "#f1f5f9" : "#475569",
              borderBottom: tab === val ? "2px solid #34d399" : "2px solid transparent",
            }}>{label}</button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
              <StatCard label="Active subscriptions" value={stats.subscriptions.active}                   color="#34d399" />
              <StatCard label="Paused"                value={stats.subscriptions.paused}                  color="#fbbf24" />
              <StatCard label="Total payments"        value={stats.payments.total}                        color="#3b82f6" />
              <StatCard label="Volume (USDC)"         value={`$${stats.payments.volume_usdc?.toFixed(2) || "0.00"}`} color="#34d399" />
              <StatCard label="Approved merchants"    value={approvedCount}                               color="#a78bfa" />
              <StatCard label="Pending approval"      value={pendingCount}                                color="#fbbf24" />
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Subscription breakdown</div>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                {[
                  { label: "Active",    value: stats.subscriptions.active,    color: "#34d399" },
                  { label: "Paused",    value: stats.subscriptions.paused,    color: "#fbbf24" },
                  { label: "Cancelled", value: stats.subscriptions.cancelled, color: "#f87171" },
                  { label: "Expired",   value: stats.subscriptions.expired,   color: "#475569" },
                  { label: "Total",     value: stats.subscriptions.total,     color: "#f1f5f9" },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, color: "#334155", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {pendingCount > 0 && (
              <div style={{ background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600 }}>
                  {pendingCount} merchant{pendingCount !== 1 ? "s" : ""} pending approval
                </div>
                <button onClick={() => setTab("merchants")} style={{ background: "none", border: "none", color: "#fbbf24", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                  Review now →
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Merchants ── */}
        {tab === "merchants" && (
          <div>
            {/* Filter + manual approve */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 3 }}>
                {[["all", "All"], ["pending", "Pending"], ["approved", "Approved"]].map(([val, label]) => (
                  <button key={val} onClick={() => setFilter(val)} style={{
                    background: filter === val ? "rgba(255,255,255,0.07)" : "none", border: "none",
                    borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: filter === val ? 600 : 400,
                    color: filter === val ? "#f1f5f9" : "#334155", cursor: "pointer",
                  }}>{label}</button>
                ))}
              </div>
              <button onClick={fetchMerchants} style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#475569", fontSize: 12, padding: "5px 12px", cursor: "pointer" }}>
                ↻ Refresh
              </button>
            </div>

            <ManualApprove token={token} onRefresh={fetchMerchants} />

            <div style={{ marginTop: 16, background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr", padding: "10px 20px", fontSize: 11, color: "#334155", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}>
                <span>Merchant</span><span>Email</span><span>Registered</span><span>Status</span><span></span>
              </div>

              {filteredMerchants.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 20px", color: "#334155", fontSize: 13 }}>
                  No merchants found.
                </div>
              ) : (
                filteredMerchants.map(m => (
                  <MerchantRow key={m.wallet_address} merchant={m} token={token} onRefresh={fetchMerchants} />
                ))
              )}
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: "#1e293b", lineHeight: 1.6 }}>
              Note: Approval here sets the <code style={{ fontFamily: "monospace", color: "#334155" }}>approved_at</code> flag in the database. On-chain registry approval via Basescan is separate and required for crypto-native flows.
            </div>
          </div>
        )}

        {/* ── Contracts ── */}
        {tab === "contracts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "MerchantRegistry", address: REGISTRY_ADDRESS, note: "Approve merchants, set fees" },
              { label: "SubscriptionVault", address: VAULT_ADDRESS, note: "Subscription lifecycle, executePull" },
              { label: "USDC",             address: isMainnet ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : "0x036CbD53842c5426634e7929541eC2318f3dCF7e", note: "Payment token — hardcoded" },
            ].map(c => (
              <div key={c.label} style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{c.label}</div>
                  <a
                    href={`${basescanBase}/address/${c.address}#writeContract`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "#34d399", textDecoration: "none" }}
                  >
                    View on Basescan ↗
                  </a>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", marginBottom: 4, wordBreak: "break-all" }}>{c.address}</div>
                <div style={{ fontSize: 11, color: "#334155" }}>{c.note}</div>
              </div>
            ))}

            <div style={{ background: "rgba(59,130,246,0.05)", border: "0.5px solid rgba(59,130,246,0.15)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#3b82f6", marginBottom: 6 }}>Mainnet deployment checklist</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["Deploy SubscriptionVault to Base Mainnet", false],
                  ["Deploy MerchantRegistry to Base Mainnet", false],
                  ["Update VITE_NETWORK=mainnet in Netlify env", false],
                  ["Update VAULT_ADDRESS + REGISTRY_ADDRESS in config.js", false],
                  ["Update keeper/notifier Railway env vars to mainnet", false],
                  ["Set up Safe multisig + Ledger for treasury", false],
                  ["Rotate Basescan API key (exposed May 3)", false],
                  ["Smart contract audit complete", false],
                  ["Legal opinion from Fio Legal received", false],
                  ["VASP registration Portugal — IAPMEI", false],
                ].map(([item, done]) => (
                  <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12, color: done ? "#34d399" : "#475569" }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}>{done ? "✓" : "○"}</span>
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
