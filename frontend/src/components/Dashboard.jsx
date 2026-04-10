// src/components/Dashboard.jsx
import { useState, useEffect, useCallback } from "react";
import { useWriteContract, useReadContract } from "wagmi";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "wagmi/chains";
import {
  VAULT_ADDRESS, REGISTRY_ADDRESS, USDC_ADDRESS,
  VAULT_ABI, REGISTRY_ABI, USDC_ABI,
  INTERVAL_NAMES, STATUS_NAMES, STATUS_COLORS,
  shortAddress, formatUSDC,
} from "../config.js";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http("https://base-sepolia.g.alchemy.com/v2/_uXoDLhLHyfV7jqbsvucT"),
});

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "0.5px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "20px 22px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: accent,
      }} />
      <div style={{ fontSize: 11, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#f1f5f9", fontFamily: "monospace", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#334155", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const name = STATUS_NAMES[status] || "Unknown";
  const cfg  = STATUS_COLORS[name] || { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
  return (
    <span className="badge" style={{ background: cfg.bg, color: cfg.color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
      {name}
    </span>
  );
}

// ── Create Subscription Modal ──────────────────────────────────────────────
function CreateSubModal({ address, onClose, onCreated }) {
  const [merchant,  setMerchant]  = useState("");
  const [amount,    setAmount]    = useState("");
  const [interval,  setInterval]  = useState("1");
  const [guardian,  setGuardian]  = useState("");
  const [status,    setStatus]    = useState("");

  const { writeContractAsync } = useWriteContract();

  const handleCreate = async () => {
    if (!merchant || !amount) return;
    setStatus("Sending transaction...");
    try {
      const amountRaw = BigInt(Math.round(parseFloat(amount) * 1_000_000));
      const guardianAddr = guardian || "0x0000000000000000000000000000000000000000";

      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
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
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, padding: 24,
    }}>
      <div style={{
        background: "#0f172a", border: "0.5px solid rgba(255,255,255,0.1)",
        borderRadius: 16, padding: 28, width: "100%", maxWidth: 440,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>New Subscription</h2>
          <button className="btn-secondary" onClick={onClose} style={{ padding: "4px 10px" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Merchant address</label>
            <input placeholder="0x..." value={merchant} onChange={e => setMerchant(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Amount (USDC)</label>
            <input type="number" placeholder="15.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Billing interval</label>
            <select value={interval} onChange={e => setInterval(e.target.value)}>
              <option value="0">Weekly</option>
              <option value="1">Monthly</option>
              <option value="2">Yearly</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Guardian address (optional)</label>
            <input placeholder="0x... or leave blank" value={guardian} onChange={e => setGuardian(e.target.value)} />
          </div>

          {status && (
            <div style={{ fontSize: 12, color: status.startsWith("✅") ? "#34d399" : status.startsWith("❌") ? "#f87171" : "#94a3b8", padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
              {status}
            </div>
          )}

          <button className="btn-primary" onClick={handleCreate} style={{ marginTop: 8, padding: "11px" }}>
            Create Subscription
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard({ address, isAdmin }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [vaultUSDC,     setVaultUSDC]     = useState(0n);
  const [loading,       setLoading]       = useState(false);
  const [showCreate,    setShowCreate]    = useState(false);
  const [cancellingId,  setCancellingId]  = useState(null);

  const { writeContractAsync } = useWriteContract();

  // Fetch all subscriptions owned by connected wallet
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
            subs.push({ id, owner: sub[0], guardian: sub[1], merchant: sub[2], safeVault: sub[3], amount: sub[4], interval: Number(sub[5]), lastPulledAt: sub[6], pausedAt: sub[7], status: Number(sub[8]) });
          }
          id++;
        } catch { break; }
      }
      setSubscriptions(subs);

      // Fetch USDC balance of connected wallet (acting as vault for testnet)
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

  // Stats
  const activeSubs   = subscriptions.filter(s => s.status === 0);
  const totalMonthly = activeSubs.reduce((acc, s) => {
    const amt = Number(s.amount) / 1e6;
    if (s.interval === 0) return acc + amt * 4.33;
    if (s.interval === 1) return acc + amt;
    return acc + amt / 12;
  }, 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <StatCard label="Active Subscriptions" value={activeSubs.length} sub="on Base Sepolia" accent="linear-gradient(90deg,#34d399,#3b82f6)" />
        <StatCard label="Vault Balance" value={formatUSDC(vaultUSDC)} sub="USDC · your wallet" accent="linear-gradient(90deg,#a78bfa,#ec4899)" />
        <StatCard label="Monthly Committed" value={`$${totalMonthly.toFixed(2)}`} sub="across all active subs" accent="linear-gradient(90deg,#60a5fa,#34d399)" />
        <StatCard label="Months Covered" value={totalMonthly > 0 ? (Number(vaultUSDC) / 1e6 / totalMonthly).toFixed(1) : "∞"} sub="at current balance" accent="linear-gradient(90deg,#fbbf24,#f87171)" />
      </div>

      {/* Subscriptions table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">My Subscriptions · {subscriptions.length}</span>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New</button>
        </div>

        {loading ? (
          <div className="empty-state">Loading subscriptions...</div>
        ) : subscriptions.length === 0 ? (
          <div className="empty-state">
            No subscriptions found for this wallet.<br />
            <span style={{ color: "#334155" }}>Click "+ New" to create your first one.</span>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 100px",
              padding: "10px 20px", borderBottom: "0.5px solid rgba(255,255,255,0.05)",
              fontSize: 11, color: "#334155", letterSpacing: "0.07em", textTransform: "uppercase",
            }}>
              <span>Merchant</span><span>Amount</span><span>Interval</span><span>Status</span><span>Last Pull</span><span></span>
            </div>

            {/* Table rows */}
            {subscriptions.map(sub => (
              <div key={sub.id} style={{
                display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 100px",
                padding: "14px 20px", borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                alignItems: "center", fontSize: 13,
              }}>
                <div>
                  <div className="mono" style={{ color: "#e2e8f0" }}>{shortAddress(sub.merchant)}</div>
                  <div style={{ fontSize: 11, color: "#334155" }}>Sub #{sub.id}</div>
                </div>
                <span style={{ color: "#34d399", fontWeight: 600, fontFamily: "monospace" }}>
                  {formatUSDC(sub.amount)}
                </span>
                <span style={{ color: "#94a3b8" }}>{INTERVAL_NAMES[sub.interval]}</span>
                <StatusBadge status={sub.status} />
                <span style={{ color: "#475569", fontSize: 12 }}>
                  {sub.lastPulledAt > 0n
                    ? new Date(Number(sub.lastPulledAt) * 1000).toLocaleDateString()
                    : "Never"}
                </span>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {sub.status === 0 && (
                    <button
                      className="btn-danger"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      disabled={cancellingId === sub.id}
                      onClick={() => handleCancel(sub.id)}
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
      {isAdmin && <AdminPanel onRefresh={fetchData} />}

      {/* Create modal */}
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

// ── Admin Panel ────────────────────────────────────────────────────────────
function AdminPanel({ onRefresh }) {
  const [merchantInput, setMerchantInput] = useState("");
  const [status,        setStatus]        = useState("");
  const { writeContractAsync } = useWriteContract();

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
    <div className="card">
      <div className="card-header">
        <span className="card-title">Admin — Merchant Registry</span>
        <span style={{ fontSize: 11, color: "#fbbf24" }}>God Mode</span>
      </div>
      <div style={{ padding: "16px 20px", display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>
            Approve a merchant address
          </label>
          <input
            placeholder="0x merchant wallet address"
            value={merchantInput}
            onChange={e => setMerchantInput(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={handleApprove} style={{ whiteSpace: "nowrap" }}>
          Approve Merchant
        </button>
      </div>
      {status && (
        <div style={{ padding: "0 20px 16px", fontSize: 12, color: status.startsWith("✅") ? "#34d399" : "#f87171" }}>
          {status}
        </div>
      )}
    </div>
  );
}
