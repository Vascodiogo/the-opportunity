// src/components/Dashboard.jsx — Visual redesign May 2026
// Logic: unchanged. Visual: consistent with MerchantDashboard design system.
import { useState, useEffect, useCallback } from "react";
import { useWriteContract } from "wagmi";
import { createPublicClient, http, fallback } from "viem";
import { baseSepolia } from "wagmi/chains";
import {
  VAULT_ADDRESS, USDC_ADDRESS, VAULT_ABI, USDC_ABI, REGISTRY_ADDRESS, REGISTRY_ABI, RPC_URLS,
  INTERVAL_NAMES, STATUS_NAMES, STATUS_COLORS,
  shortAddress, formatUSDC,
} from "../config.js";

const client = createPublicClient({
  chain: baseSepolia,
  transport: fallback(RPC_URLS.map(url => http(url))),
});

// ─── Design tokens ────────────────────────────────────────────────────────────
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
    },
    danger: {
      background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)",
      borderRadius: 8, color: "var(--red)", fontSize: 11,
      padding: "4px 10px", cursor: "pointer", fontFamily: "inherit",
    },
  },
  card: {
    background: "var(--bg-card)", border: "0.5px solid var(--border)",
    borderRadius: 14, boxShadow: "var(--shadow)",
  },
  label: {
    fontSize: 11, color: "var(--text-secondary)",
    letterSpacing: "0.08em", textTransform: "uppercase",
    marginBottom: 6, display: "block",
  },
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon }) {
  return (
    <div style={{
      ...S.card, padding: "20px 22px",
      borderLeft: "2px solid var(--green)",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</span>
        {icon && <span style={{ fontSize: 16, opacity: 0.4 }}>{icon}</span>}
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

// ─── Create Subscription Modal ────────────────────────────────────────────────
function CreateSubModal({ address, onClose, onCreated }) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount]     = useState("");
  const [interval, setInterval] = useState("1");
  const [guardian, setGuardian] = useState("");
  const [status, setStatus]     = useState("");
  const { writeContractAsync }  = useWriteContract();

  const handleCreate = async () => {
    if (!merchant || !amount) return;
    setStatus("Sending transaction...");
    try {
      const amountRaw    = BigInt(Math.round(parseFloat(amount) * 1_000_000));
      const guardianAddr = guardian || "0x0000000000000000000000000000000000000000";
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS, abi: VAULT_ABI,
        functionName: "createSubscription",
        args: [merchant, address, amountRaw, Number(interval), guardianAddr],
      });
      setStatus(`✅ Transaction sent! Hash: ${hash.slice(0, 10)}...`);
      setTimeout(() => { onCreated(); onClose(); }, 2000);
    } catch (err) {
      setStatus(`❌ ${err.shortMessage || err.message}`);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>New Subscription</h2>
          <button onClick={onClose} style={S.btn.ghost}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Merchant address</label>
            <input placeholder="0x..." value={merchant} onChange={e => setMerchant(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Amount (USDC)</label>
            <input type="number" placeholder="15.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Billing interval</label>
            <select value={interval} onChange={e => setInterval(e.target.value)}>
              <option value="0">Weekly</option>
              <option value="1">Monthly</option>
              <option value="2">Yearly</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Guardian address (optional)</label>
            <input placeholder="0x... or leave blank" value={guardian} onChange={e => setGuardian(e.target.value)} />
          </div>
          {status && (
            <div style={{
              fontSize: 12, padding: "8px 12px", borderRadius: 8,
              background: "var(--bg-tag)",
              color: status.startsWith("✅") ? "var(--green)" : status.startsWith("❌") ? "var(--red)" : "var(--text-secondary)",
            }}>
              {status}
            </div>
          )}
          <button onClick={handleCreate} style={{ ...S.btn.primary, padding: "11px", fontSize: 14, marginTop: 4 }}>
            Create Subscription
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ address, isAdmin }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [vaultUSDC, setVaultUSDC]         = useState(0n);
  const [loading, setLoading]             = useState(false);
  const [showCreate, setShowCreate]       = useState(false);
  const [cancellingId, setCancellingId]   = useState(null);
  const { writeContractAsync }            = useWriteContract();

  const fetchData = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const subs = [];
      let id = 0;
      while (true) {
        try {
          const sub = await client.readContract({
            address: VAULT_ADDRESS, abi: VAULT_ABI,
            functionName: "subscriptions", args: [BigInt(id)],
          });
          if (sub[0] === "0x0000000000000000000000000000000000000000") break;
          if (sub[0].toLowerCase() === address.toLowerCase()) {
            subs.push({
              id, owner: sub[0], guardian: sub[1], merchant: sub[2],
              safeVault: sub[3], amount: sub[4], interval: Number(sub[8]),
              lastPulledAt: sub[9], pausedAt: sub[10], status: Number(sub[14]),
            });
          }
          id++;
        } catch { break; }
      }
      setSubscriptions(subs);
      const bal = await client.readContract({
        address: USDC_ADDRESS, abi: USDC_ABI,
        functionName: "balanceOf", args: [address],
      });
      setVaultUSDC(bal);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCancel = async (id) => {
    setCancellingId(id);
    try {
      await writeContractAsync({
        address: VAULT_ADDRESS, abi: VAULT_ABI,
        functionName: "cancelSubscription", args: [BigInt(id)],
      });
      setTimeout(fetchData, 3000);
    } catch (err) {
      console.error("Cancel error:", err);
    } finally {
      setCancellingId(null);
    }
  };

  const activeSubs    = subscriptions.filter(s => s.status === 0);
  const totalMonthly  = activeSubs.reduce((acc, s) => {
    const amt = Number(s.amount) / 1e6;
    if (s.interval === 0) return acc + amt * 4.33;
    if (s.interval === 1) return acc + amt;
    return acc + amt / 12;
  }, 0);
  const monthsCovered = totalMonthly > 0
    ? (Number(vaultUSDC) / 1e6 / totalMonthly).toFixed(1)
    : "∞";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard label="Active Subscriptions" value={activeSubs.length}              sub="on Base Network"          icon="⊙" />
        <StatCard label="Wallet Balance"        value={formatUSDC(vaultUSDC)}         sub="USDC in your wallet"      icon="◎" />
        <StatCard label="Monthly Committed"     value={`$${totalMonthly.toFixed(2)}`} sub="across all active subs"   icon="⊟" />
        <StatCard label="Months Covered"        value={monthsCovered}                 sub="at current balance"       icon="⊞" />
      </div>

      {/* Subscriptions table */}
      <div style={{ ...S.card, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "0.5px solid var(--border)" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            My Subscriptions · {subscriptions.length}
          </span>
          <button onClick={() => setShowCreate(true)} style={{ ...S.btn.primary, padding: "7px 16px" }}>
            + New
          </button>
        </div>

        {loading ? (
          <EmptyState message="Loading subscriptions..." />
        ) : subscriptions.length === 0 ? (
          <EmptyState message="No subscriptions found" sub='Click "+ New" to create your first one.' />
        ) : (
          <>
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 100px",
              padding: "10px 20px", fontSize: 10,
              color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase",
              borderBottom: "0.5px solid var(--border)", background: "var(--bg-tag)",
            }}>
              <span>Merchant</span><span>Amount</span><span>Interval</span><span>Status</span><span>Last Pull</span><span />
            </div>
            {subscriptions.map((sub, i) => (
              <div key={sub.id} style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 100px",
                padding: "14px 20px", alignItems: "center", fontSize: 13,
                borderBottom: i < subscriptions.length - 1 ? "0.5px solid var(--border)" : "none",
              }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-primary)" }}>
                    {shortAddress(sub.merchant)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Sub #{sub.id}</div>
                </div>
                <span style={{ color: "var(--green)", fontWeight: 600, fontFamily: "monospace" }}>
                  {formatUSDC(sub.amount)}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{INTERVAL_NAMES[sub.interval]}</span>
                <StatusBadge status={sub.status} />
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {sub.lastPulledAt > 0n
                    ? new Date(Number(sub.lastPulledAt) * 1000).toLocaleDateString()
                    : "Never"}
                </span>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {sub.status === 0 && (
                    <button
                      onClick={() => handleCancel(sub.id)}
                      disabled={cancellingId === sub.id}
                      style={{ ...S.btn.danger, opacity: cancellingId === sub.id ? 0.5 : 1 }}
                    >
                      {cancellingId === sub.id ? "..." : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Admin panel */}
      {isAdmin && <AdminPanel />}

      {/* Modal */}
      {showCreate && (
        <CreateSubModal
          address={address}
          onClose={() => setShowCreate(false)}
          onCreated={fetchData}
        />
      )}
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel() {
  const [merchantInput, setMerchantInput] = useState("");
  const [status, setStatus]               = useState("");
  const { writeContractAsync }            = useWriteContract();

  const handleApprove = async () => {
    if (!merchantInput) return;
    setStatus("Sending...");
    try {
      await writeContractAsync({
        address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
        functionName: "approveMerchant", args: [merchantInput],
      });
      setStatus(`✅ Approved ${shortAddress(merchantInput)}`);
      setMerchantInput("");
    } catch (err) {
      setStatus(`❌ ${err.shortMessage || err.message}`);
    }
  };

  return (
    <div style={{ ...S.card, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "0.5px solid var(--border)" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Admin — Merchant Registry
        </span>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(251,191,36,0.12)", color: "var(--amber)", fontWeight: 600 }}>
          God Mode
        </span>
      </div>
      <div style={{ padding: "16px 20px", display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Approve a merchant address</label>
          <input
            placeholder="0x merchant wallet address"
            value={merchantInput}
            onChange={e => setMerchantInput(e.target.value)}
          />
        </div>
        <button onClick={handleApprove} style={{ ...S.btn.primary, whiteSpace: "nowrap" }}>
          Approve Merchant
        </button>
      </div>
      {status && (
        <div style={{ padding: "0 20px 16px", fontSize: 12, color: status.startsWith("✅") ? "var(--green)" : "var(--red)" }}>
          {status}
        </div>
      )}
    </div>
  );
}
