// src/components/MerchantDashboard.jsx
import { useState, useEffect, useCallback } from "react";
import { useWriteContract } from "wagmi";
import { QRCodeSVG } from "qrcode.react";
import { createPublicClient, http, fallback } from "viem";
import { baseSepolia } from "wagmi/chains";
import {
  VAULT_ADDRESS, VAULT_ABI, REGISTRY_ADDRESS, REGISTRY_ABI, RPC_URLS,
  INTERVAL_NAMES, STATUS_NAMES, STATUS_COLORS,
  shortAddress, formatUSDC,
} from "../config.js";

const client = createPublicClient({
  chain: baseSepolia,
  transport: fallback(RPC_URLS.map(url => http(url))),
});

const BASE_URL = "https://authonce.io/pay";
const API_BASE = "https://the-opportunity-production.up.railway.app";

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "0.5px solid var(--border)",
      borderRadius: 14, padding: "20px 22px", position: "relative", overflow: "hidden",
      boxShadow: "var(--shadow)",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accent }} />
      <div style={{ fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const name = STATUS_NAMES[status] || "Unknown";
  const cfg  = STATUS_COLORS[name] || { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
      {name}
    </span>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", padding: "10px 18px", cursor: "pointer",
      fontSize: 13, fontWeight: active ? 600 : 400,
      color: active ? "var(--text-primary)" : "var(--text-muted)",
      borderBottom: active ? "2px solid var(--green)" : "2px solid transparent",
      transition: "all 0.15s",
    }}>
      {label}
    </button>
  );
}

// ─── MRR Chart ───────────────────────────────────────────────────────────────
function MRRChart({ payments }) {
  if (!payments || payments.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 12 }}>
        No payment data yet. Chart will appear after the first pull.
      </div>
    );
  }
  const now    = new Date();
  const months = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (23 - i), 1);
    return {
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: i % 4 === 0 ? d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : "",
      total: 0,
    };
  });
  payments.forEach(p => {
    const key    = p.executed_at?.slice(0, 7);
    const bucket = months.find(m => m.key === key);
    if (bucket) bucket.total += parseFloat(p.merchant_received_usdc || 0);
  });
  const max    = Math.max(...months.map(m => m.total), 1);
  const chartH = 120;
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: chartH + 28, paddingBottom: 24, position: "relative", minWidth: 480 }}>
        {months.map((m, i) => {
          const isLast = i === 23;
          const barH   = Math.max((m.total / max) * chartH, m.total > 0 ? 4 : 0);
          return (
            <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
              {m.total > 0 && <div style={{ fontSize: 9, color: "var(--green)", fontFamily: "monospace", marginBottom: 2 }}>${m.total.toFixed(0)}</div>}
              <div style={{
                width: "100%", height: barH,
                background: isLast ? "linear-gradient(180deg, #34d399, #22c55e)" : `rgba(52,211,153,${0.12 + (i / 23) * 0.25})`,
                borderRadius: "3px 3px 0 0", transition: "height 0.3s ease",
              }} />
              {m.label && <div style={{ fontSize: 8, color: "var(--text-muted)", position: "absolute", bottom: 0 }}>{m.label}</div>}
            </div>
          );
        })}
      </div>
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
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Trial duration (days · 1–60)</label>
          <input type="number" min="1" max="60" value={days} onChange={e => setDays(e.target.value)}
            style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <div style={{ background: "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
          {url}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleCopy} style={{ flex: 1, background: copied ? "rgba(52,211,153,0.12)" : "linear-gradient(135deg, #34d399, #3b82f6)", border: copied ? "0.5px solid rgba(52,211,153,0.3)" : "none", borderRadius: 8, color: copied ? "var(--green)" : "#080c14", fontWeight: 700, fontSize: 13, padding: "10px", cursor: "pointer" }}>
            {copied ? "✓ Copied!" : "Copy Trial Link"}
          </button>
          <button onClick={onClose} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, padding: "10px 16px", cursor: "pointer" }}>Cancel</button>
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
            Number(sub[4]) === productAmountRaw &&
            Number(sub[8]) === productInterval &&
            Number(sub[14]) === 0
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
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>📢 Price Change Notice — {product.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Schedule a price change for all active subscribers. Each will be notified by email and can cancel before the expiry date. Minimum 30 days enforced on-chain.
        </div>
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--text-muted)" }}>
          {loadingSubs ? "Scanning active subscriptions..." : (
            <span>Found <strong style={{ color: "var(--text-primary)" }}>{subscriptions.length}</strong> active subscription{subscriptions.length !== 1 ? "s" : ""}{subscriptions.length === 0 ? " — nothing to notify." : "."}</span>
          )}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Notice period (days · min 30)</label>
          <input type="number" min="30" max="365" value={noticeDays} onChange={e => setNoticeDays(e.target.value)} disabled={saving || done}
            style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <div style={{ background: "rgba(248,113,113,0.06)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--text-muted)" }}>
          Subscriptions expire on <strong style={{ color: "var(--red)" }}>{expiryDate}</strong>. Subscribers receive email notice and can cancel before that date.
        </div>
        {progress && !done && (
          <div style={{ background: "rgba(59,130,246,0.06)", border: "0.5px solid rgba(59,130,246,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#93c5fd" }}>
            Scheduling... {progress.done} / {progress.total}
            <div style={{ marginTop: 6, background: "rgba(59,130,246,0.2)", borderRadius: 4, height: 4 }}>
              <div style={{ background: "#3b82f6", height: 4, borderRadius: 4, width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        )}
        {errorMsg && <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#f87171" }}>{errorMsg}</div>}
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
            <div style={{ color: "var(--green)", fontSize: 13, fontWeight: 600 }}>Scheduled for {subscriptions.length} subscription{subscriptions.length !== 1 ? "s" : ""}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Subscribers can cancel before {expiryDate}.</div>
            <button onClick={onClose} style={{ marginTop: 16, background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, padding: "8px 20px", cursor: "pointer" }}>Close</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={saving || loadingSubs || subscriptions.length === 0} onClick={handleSchedule}
              style={{ flex: 1, background: "linear-gradient(135deg, #f87171, #ef4444)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px", cursor: saving || loadingSubs || subscriptions.length === 0 ? "not-allowed" : "pointer", opacity: saving || loadingSubs || subscriptions.length === 0 ? 0.6 : 1 }}>
              {saving ? `Scheduling ${progress?.done || 0}/${progress?.total || subscriptions.length}...` : `Schedule for ${subscriptions.length} subscriber${subscriptions.length !== 1 ? "s" : ""}`}
            </button>
            <button onClick={onClose} disabled={saving} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, padding: "10px 16px", cursor: "pointer" }}>Cancel</button>
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
  const [paymentMethods, setPaymentMethods] = useState(["crypto"]);
  const [saving, setSaving]           = useState(false);

  const intervalMap   = { "0": "weekly", "1": "monthly", "2": "yearly" };
  const intervalLabel = { "0": "week", "1": "month", "2": "year" };

  const yearlySuggestion = amount ? (parseFloat(amount) * 12 * 0.8).toFixed(2) : "";
  const yearlyDiscount   = amount && yearlyAmount
    ? Math.round((1 - parseFloat(yearlyAmount) / (parseFloat(amount) * 12)) * 100)
    : 0;

  const toggleMethod = (method) => {
    if (method === "crypto") return; // crypto always on
    setPaymentMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  };

  const handleAdd = async () => {
    if (!name || !amount) return;
    if (hasIntro && (!introAmount || parseFloat(introAmount) <= 0)) {
      alert("Please enter a valid intro price.");
      return;
    }
    if (hasIntro && parseFloat(introAmount) > parseFloat(amount)) {
      alert("Intro price cannot be higher than the full price.");
      return;
    }
    if (hasYearly && (!yearlyAmount || parseFloat(yearlyAmount) <= 0)) {
      alert("Please enter a valid yearly price.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/products/${merchantAddress}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Merchant-Address": merchantAddress },
        body: JSON.stringify({
          name,
          amount:          parseFloat(amount),
          interval:        intervalMap[interval],
          intro_amount:    hasIntro  ? parseFloat(introAmount)  : 0,
          intro_pulls:     hasIntro  ? parseInt(introPulls)     : 0,
          yearly_amount:   hasYearly ? parseFloat(yearlyAmount) : null,
          payment_methods: paymentMethods,
        }),
      });
      if (!res.ok) throw new Error("Failed to save product");
      onAdded();
      onClose();
    } catch (err) {
      alert("Could not save product. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>New Product / Plan</h2>
          <button onClick={onClose} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "4px 10px", color: "var(--text-secondary)", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Name */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Plan name</label>
            <input placeholder="e.g. Standard, Premium, Ultra" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Full price */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Full price (USDC)</label>
            <input type="number" placeholder="20.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          {/* Interval */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Billing interval</label>
            <select value={interval} onChange={e => setInterval(e.target.value)}>
              <option value="0">Weekly</option>
              <option value="1">Monthly</option>
              <option value="2">Yearly</option>
            </select>
          </div>

          {/* Introductory pricing toggle */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setHasIntro(v => !v)}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>🎁 Introductory pricing</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  e.g. $5 for first month, then $20/month
                </div>
              </div>
              <div style={{
                width: 36, height: 20, borderRadius: 99, background: hasIntro ? "var(--green)" : "var(--border)",
                position: "relative", transition: "background 0.2s", flexShrink: 0,
              }}>
                <div style={{
                  position: "absolute", top: 2, left: hasIntro ? 18 : 2, width: 16, height: 16,
                  borderRadius: "50%", background: "white", transition: "left 0.2s",
                }} />
              </div>
            </div>

            {hasIntro && (
              <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Intro price (USDC)</label>
                  <input
                    type="number"
                    placeholder="5.00"
                    value={introAmount}
                    onChange={e => setIntroAmount(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Number of {intervalLabel[interval]}s at intro price
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    placeholder="1"
                    value={introPulls}
                    onChange={e => setIntroPulls(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            )}

            {hasIntro && introAmount && amount && (
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--amber)", background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.2)", borderRadius: 6, padding: "6px 10px" }}>
                Subscriber pays ${parseFloat(introAmount || 0).toFixed(2)} for the first {introPulls} {intervalLabel[interval]}{parseInt(introPulls) > 1 ? "s" : ""}, then ${parseFloat(amount || 0).toFixed(2)}/{intervalLabel[interval]}
              </div>
            )}
          </div>

          {/* Yearly pricing toggle — only show for monthly products */}
          {interval === "1" && (
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => { setHasYearly(v => !v); if (!yearlyAmount && yearlySuggestion) setYearlyAmount(yearlySuggestion); }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>📅 Yearly pricing option</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    Offer a discounted yearly plan — subscriber pays once a year
                  </div>
                </div>
                <div style={{ width: 36, height: 20, borderRadius: 99, background: hasYearly ? "var(--green)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: hasYearly ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
                </div>
              </div>

              {hasYearly && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Yearly price (USDC) — suggested: ${yearlySuggestion} (20% off)
                  </label>
                  <input
                    type="number"
                    placeholder={yearlySuggestion || "192.00"}
                    value={yearlyAmount}
                    onChange={e => setYearlyAmount(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                  {yearlyAmount && amount && yearlyDiscount > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--green)", background: "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.2)", borderRadius: 6, padding: "6px 10px" }}>
                      Subscriber saves {yearlyDiscount}% vs monthly · ${(parseFloat(yearlyAmount) / 12).toFixed(2)}/month equivalent
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payment methods */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>💳 Payment methods</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
              Choose which payment methods subscribers can use. Crypto is always available.
              Card/banking options require your Stripe account to be connected in Settings.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { id: "crypto",     label: "⛓ Crypto (USDC)",      always: true },
                { id: "card",       label: "💳 Card (Visa/MC)" },
                { id: "sepa",       label: "🏦 SEPA Transfer" },
                { id: "mbway",      label: "📱 MB Way (PT)" },
                { id: "multibanco", label: "🏧 Multibanco (PT)" },
                { id: "ideal",      label: "🇳🇱 iDEAL (NL)" },
                { id: "bancontact", label: "🇧🇪 Bancontact (BE)" },
                { id: "eps",        label: "🇦🇹 EPS (AT)" },
                { id: "klarna",     label: "🛍 Klarna" },
                { id: "blik",       label: "🇵🇱 BLIK (PL)" },
              ].map(({ id, label, always }) => {
                const isEnabled = paymentMethods.includes(id);
                return (
                  <div
                    key={id}
                    onClick={() => toggleMethod(id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", borderRadius: 8, cursor: always ? "default" : "pointer",
                      border: `0.5px solid ${isEnabled ? "rgba(52,211,153,0.3)" : "var(--border)"}`,
                      background: isEnabled ? "rgba(52,211,153,0.06)" : "var(--bg-tag)",
                      opacity: always ? 0.7 : 1,
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `1.5px solid ${isEnabled ? "var(--green)" : "var(--border)"}`,
                      background: isEnabled ? "var(--green)" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isEnabled && <span style={{ color: "#080c14", fontSize: 9, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 11, color: isEnabled ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          {name && amount && (
            <div style={{ background: "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.2)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 4 }}>Pay link preview</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
                {BASE_URL}/{shortAddress(merchantAddress)}/{name.toLowerCase().replace(/\s+/g, "-")}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                💡 Add a free trial after creating — use the "Trial Link" button.
              </div>
            </div>
          )}

          <button onClick={handleAdd} disabled={saving} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 14, padding: "11px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, marginTop: 4 }}>
            {saving ? "Saving..." : "Create Product"}
          </button>
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
  const [paymentMethods, setPaymentMethods] = useState(product.payment_methods || ["crypto"]);
  const [saving, setSaving]           = useState(false);

  const yearlySuggestion = amount ? (parseFloat(amount) * 12 * 0.8).toFixed(2) : "";
  const yearlyDiscount   = amount && yearlyAmount
    ? Math.round((1 - parseFloat(yearlyAmount) / (parseFloat(amount) * 12)) * 100)
    : 0;

  const toggleMethod = (method) => {
    if (method === "crypto") return;
    setPaymentMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  };

  const handleSave = async () => {
    if (!name || !amount) return;
    if (hasIntro && (!introAmount || parseFloat(introAmount) <= 0)) {
      alert("Please enter a valid intro price."); return;
    }
    if (hasIntro && parseFloat(introAmount) > parseFloat(amount)) {
      alert("Intro price cannot be higher than the full price."); return;
    }
    if (hasYearly && (!yearlyAmount || parseFloat(yearlyAmount) <= 0)) {
      alert("Please enter a valid yearly price."); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/products/${merchantAddress}/${product.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Merchant-Address": merchantAddress },
        body: JSON.stringify({
          name,
          amount:          parseFloat(amount),
          interval:        intervalMap[interval],
          intro_amount:    hasIntro  ? parseFloat(introAmount) : 0,
          intro_pulls:     hasIntro  ? parseInt(introPulls)    : 0,
          yearly_amount:   hasYearly ? parseFloat(yearlyAmount): null,
          payment_methods: paymentMethods,
        }),
      });
      if (!res.ok) throw new Error("Failed to update product");
      onSaved();
      onClose();
    } catch {
      alert("Could not update product. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Edit Product</h2>
          <button onClick={onClose} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "4px 10px", color: "var(--text-secondary)", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Plan name</label>
            <input placeholder="e.g. Standard, Premium, Ultra" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Full price (USDC)</label>
            <input type="number" placeholder="20.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Billing interval</label>
            <select value={interval} onChange={e => setInterval(e.target.value)}>
              <option value="0">Weekly</option>
              <option value="1">Monthly</option>
              <option value="2">Yearly</option>
            </select>
          </div>

          {/* Intro pricing */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setHasIntro(v => !v)}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>🎁 Introductory pricing</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>e.g. $5 for first month, then $20/month</div>
              </div>
              <div style={{ width: 36, height: 20, borderRadius: 99, background: hasIntro ? "var(--green)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: hasIntro ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
              </div>
            </div>
            {hasIntro && (
              <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Intro price (USDC)</label>
                  <input type="number" placeholder="5.00" value={introAmount} onChange={e => setIntroAmount(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Number of {intervalLabel[interval]}s at intro price</label>
                  <input type="number" min="1" max="12" placeholder="1" value={introPulls} onChange={e => setIntroPulls(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
                </div>
              </div>
            )}
            {hasIntro && introAmount && amount && (
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--amber)", background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.2)", borderRadius: 6, padding: "6px 10px" }}>
                Subscriber pays ${parseFloat(introAmount || 0).toFixed(2)} for the first {introPulls} {intervalLabel[interval]}{parseInt(introPulls) > 1 ? "s" : ""}, then ${parseFloat(amount || 0).toFixed(2)}/{intervalLabel[interval]}
              </div>
            )}
          </div>

          {/* Yearly pricing */}
          {interval === "1" && (
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => { setHasYearly(v => !v); if (!yearlyAmount && yearlySuggestion) setYearlyAmount(yearlySuggestion); }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>📅 Yearly pricing option</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Offer a discounted yearly plan</div>
                </div>
                <div style={{ width: 36, height: 20, borderRadius: 99, background: hasYearly ? "var(--green)" : "var(--border)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: hasYearly ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
                </div>
              </div>
              {hasYearly && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Yearly price (USDC) — suggested: ${yearlySuggestion} (20% off)</label>
                  <input type="number" placeholder={yearlySuggestion || "192.00"} value={yearlyAmount} onChange={e => setYearlyAmount(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
                  {yearlyAmount && amount && yearlyDiscount > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--green)", background: "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.2)", borderRadius: 6, padding: "6px 10px" }}>
                      Subscriber saves {yearlyDiscount}% vs monthly · ${(parseFloat(yearlyAmount) / 12).toFixed(2)}/month equivalent
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payment methods */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>💳 Payment methods</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { id: "crypto",     label: "⛓ Crypto (USDC)",    always: true },
                { id: "card",       label: "💳 Card (Visa/MC)" },
                { id: "sepa",       label: "🏦 SEPA Transfer" },
                { id: "mbway",      label: "📱 MB Way (PT)" },
                { id: "multibanco", label: "🏧 Multibanco (PT)" },
                { id: "ideal",      label: "🇳🇱 iDEAL (NL)" },
                { id: "bancontact", label: "🇧🇪 Bancontact (BE)" },
                { id: "eps",        label: "🇦🇹 EPS (AT)" },
                { id: "klarna",     label: "🛍 Klarna" },
                { id: "blik",       label: "🇵🇱 BLIK (PL)" },
              ].map(({ id, label, always }) => {
                const isEnabled = paymentMethods.includes(id);
                return (
                  <div key={id} onClick={() => toggleMethod(id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: always ? "default" : "pointer", border: `0.5px solid ${isEnabled ? "rgba(52,211,153,0.3)" : "var(--border)"}`, background: isEnabled ? "rgba(52,211,153,0.06)" : "var(--bg-tag)", opacity: always ? 0.7 : 1 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${isEnabled ? "var(--green)" : "var(--border)"}`, background: isEnabled ? "var(--green)" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isEnabled && <span style={{ color: "#080c14", fontSize: 9, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 11, color: isEnabled ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 14, padding: "11px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, marginTop: 4 }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Webhook Modal ────────────────────────────────────────────────────────────
function WebhookModal({ merchantAddress, onClose }) {
  const [url, setUrl]     = useState("");
  const [saved, setSaved] = useState(false);
  const handleSave = () => {
    if (!url) return;
    const webhooks = JSON.parse(localStorage.getItem(`webhooks_${merchantAddress}`) || "[]");
    webhooks.push({ url, events: ["payment.success", "payment.failed", "subscription.cancelled", "subscription.expired"], id: `wh_${Date.now()}` });
    localStorage.setItem(`webhooks_${merchantAddress}`, JSON.stringify(webhooks));
    setSaved(true);
    setTimeout(onClose, 1500);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Add Webhook</h2>
          <button onClick={onClose} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "4px 10px", color: "var(--text-secondary)", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Endpoint URL</label>
            <input placeholder="https://yoursite.com/webhooks/authonce" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div style={{ background: "var(--bg-tag)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>Events included</div>
            {["payment.success", "payment.failed", "subscription.cancelled", "subscription.expired"].map(e => (
              <div key={e} style={{ fontSize: 12, color: "var(--text-muted)", padding: "2px 0" }}>✓ {e}</div>
            ))}
          </div>
          {saved
            ? <div style={{ textAlign: "center", color: "var(--green)", fontSize: 14 }}>✅ Webhook saved!</div>
            : <button onClick={handleSave} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 14, padding: "11px", cursor: "pointer" }}>Save Webhook</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportPaymentsCSV(payments, address) {
  const rows = [
    ["Date", "Amount USDC", "You Received USDC", "Protocol Fee USDC", "Transaction Hash"].join(","),
    ...payments.map(p => [
      new Date(p.executed_at).toISOString().slice(0, 10),
      p.amount_usdc, p.merchant_received_usdc, p.protocol_fee_usdc, p.tx_hash,
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
    <span style={{
      fontSize: 11, fontFamily: "monospace",
      color: ok ? "var(--green)" : "var(--red)",
      fontWeight: 600,
    }}>
      {ok ? "✓" : "⚠"} ${allowance.toFixed(2)}
    </span>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function MerchantDashboard({ address }) {
  const [tab, setTab]                         = useState("overview");
  const [subscribers, setSubscribers]         = useState([]);
  const [products, setProducts]               = useState([]);
  const [webhooks, setWebhooks]               = useState([]);
  const [payments, setPayments]               = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [isApproved, setIsApproved]           = useState(null);
  const [settings, setSettings]               = useState(() =>
    JSON.parse(localStorage.getItem("merchant_settings_" + address) ||
    JSON.stringify({ businessName: "", email: "", notifications: "email" }))
  );
  const [showAddProduct, setShowAddProduct]   = useState(false);
  const [showAddWebhook, setShowAddWebhook]   = useState(false);
  const [copied, setCopied]                   = useState(null);
  const [qrProduct, setQrProduct]             = useState(null);
  const [trialProduct, setTrialProduct]       = useState(null);
  const [priceChangeProduct, setPriceChangeProduct] = useState(null);
  const [editProduct, setEditProduct]               = useState(null);
  const [testFiring, setTestFiring]                 = useState({});
  const [testResults, setTestResults]               = useState({});
  const [stripeStatus, setStripeStatus]       = useState(null); // null=loading, object=status
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [handle, setHandle]           = useState(null);   // current saved handle
  const [handleInput, setHandleInput] = useState("");
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleMsg, setHandleMsg]     = useState(null);   // { ok, text }

  // Check Stripe Connect status on mount + handle ?connect= return param
  useEffect(() => {
    if (!address) return;

    // Handle redirect back from Stripe OAuth
    const params = new URLSearchParams(window.location.search);
    const connectResult = params.get("connect");
    if (connectResult) {
      const url = new URL(window.location.href);
      url.searchParams.delete("connect");
      window.history.replaceState({}, "", url.toString());
      if (connectResult === "success") {
        alert("✅ Stripe connected successfully! Card payments are now available for your products.");
      } else if (connectResult === "declined") {
        alert("Stripe connection was cancelled.");
      } else if (connectResult === "error" || connectResult === "expired") {
        alert("Stripe connection failed. Please try again.");
      }
    }

    // Fetch Stripe connection status
    fetch(`${API_BASE}/api/connect/status`, { headers: { "X-Merchant-Address": address } })
      .then(r => r.json())
      .then(data => setStripeStatus(data))
      .catch(() => setStripeStatus({ connected: false }));
  }, [address]);

  const handleStripeConnect = async () => {
    setStripeConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/api/connect/authorize`, {
        headers: { "X-Merchant-Address": address },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.message || "Could not start Stripe connection.");
        setStripeConnecting(false);
      }
    } catch {
      alert("Could not reach server.");
      setStripeConnecting(false);
    }
  };

  const handleStripeDisconnect = async () => {
    if (!window.confirm("Disconnect Stripe? Card payments will be disabled for your subscribers.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/connect/disconnect`, {
        method: "DELETE",
        headers: { "X-Merchant-Address": address },
      });
      if (res.ok) {
        setStripeStatus({ connected: false });
        alert("Stripe disconnected.");
      } else {
        alert("Could not disconnect. Please try again.");
      }
    } catch {
      alert("Could not reach server.");
    }
  };

  // On-chain approval check
  useEffect(() => {
    if (!address) return;
    client.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "isApproved", args: [address] })
      .then(result => setIsApproved(result))
      .catch(() => setIsApproved(false));
  }, [address]);

  const loadProducts = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${API_BASE}/api/products/${address}`, { headers: { "X-Merchant-Address": address } });
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
      const res = await fetch(`${API_BASE}/api/merchants/${address}/payments`, { headers: { "X-Merchant-Address": address } });
      if (res.ok) { const data = await res.json(); setPayments(data.payments); }
    } catch (err) { console.error("[Dashboard] loadPayments error:", err); }
    finally { setPaymentsLoading(false); }
  }, [address]);

  const loadWebhooks = useCallback(() => {
    setWebhooks(JSON.parse(localStorage.getItem(`webhooks_${address}`) || "[]"));
  }, [address]);

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
            subs.push({ id, owner: sub[0], merchant: sub[2], safeVault: sub[3], amount: sub[4], interval: Number(sub[8]), lastPulledAt: sub[9], status: Number(sub[14]) });
          }
          id++;
        } catch { break; }
      }
      setSubscribers(subs);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [address]);

  useEffect(() => {
    fetchSubscribers();
    loadProducts();
    loadWebhooks();
    loadPayments();
    fetch(`${API_BASE}/api/merchant/handle`, { headers: { "X-Merchant-Address": address } })
      .then(r => r.json())
      .then(d => { if (d.handle) { setHandle(d.handle); setHandleInput(d.handle); } })
      .catch(() => {});
  }, [fetchSubscribers, loadProducts, loadWebhooks, loadPayments]);

  const copyLink = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const activeSubs   = subscribers.filter(s => s.status === 0);
  const totalMRR     = activeSubs.reduce((acc, s) => {
    const amt = Number(s.amount) / 1e6;
    return acc + (s.interval === 0 ? amt * 4.33 : s.interval === 1 ? amt : amt / 12);
  }, 0);
  const totalRevenue = subscribers.reduce((acc, s) => acc + Number(s.amount) / 1e6, 0);
  const protocolFee  = totalRevenue * 0.005;
  const netRevenue   = totalRevenue - protocolFee;

  const sectionLabel = { fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 };
  const card = { background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow)" };
  const row  = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--border)" };

  const approvalBadge = isApproved === null
    ? { label: "Checking...", bg: "rgba(148,163,184,0.12)", color: "#94a3b8" }
    : isApproved
    ? { label: "✓ Approved Merchant", bg: "rgba(52,211,153,0.12)", color: "var(--green)" }
    : { label: "⚠ Pending Approval",  bg: "rgba(251,191,36,0.12)", color: "var(--amber)" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Merchant Portal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{shortAddress(address)}</h1>
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: approvalBadge.bg, color: approvalBadge.color, fontWeight: 600 }}>
            {approvalBadge.label}
          </span>
        </div>
        {isApproved === false && (
          <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 8 }}>
            Your wallet is not yet approved on-chain. Contact AuthOnce to get approved.
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Active Subscribers" value={activeSubs.length} sub="paying subscribers" accent="linear-gradient(90deg,#34d399,#3b82f6)" />
        <StatCard label="Monthly Revenue"    value={`$${totalMRR.toFixed(2)}`} sub="MRR — USDC" accent="linear-gradient(90deg,#a78bfa,#ec4899)" />
        <StatCard label="Net Revenue"        value={`$${netRevenue.toFixed(2)}`} sub="after 0.5% protocol fee" accent="linear-gradient(90deg,#60a5fa,#34d399)" />
        <StatCard label="Products"           value={products.length} sub="active plans" accent="linear-gradient(90deg,#fbbf24,#f87171)" />
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "0.5px solid var(--border)", marginBottom: 20, display: "flex", gap: 4 }}>
        <Tab label="Overview"             active={tab === "overview"}    onClick={() => setTab("overview")} />
        <Tab label="Products & Pay Links" active={tab === "products"}    onClick={() => setTab("products")} />
        <Tab label="Subscribers"          active={tab === "subscribers"} onClick={() => setTab("subscribers")} />
        <Tab label="Payments"             active={tab === "payments"}    onClick={() => { setTab("payments"); loadPayments(); }} />
        <Tab label="Webhooks"             active={tab === "webhooks"}    onClick={() => setTab("webhooks")} />
        <Tab label="Settings"             active={tab === "settings"}    onClick={() => setTab("settings")} />
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

    {/* MRR chart — full width */}
    <div style={{ ...card, gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={sectionLabel}>Revenue — last 24 months (USDC)</div>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            { label: "Gross", value: `$${totalRevenue.toFixed(2)}`, color: "var(--text-primary)" },
            { label: "Fee",   value: `-$${protocolFee.toFixed(4)}`, color: "var(--red)" },
            { label: "Net",   value: `$${netRevenue.toFixed(2)}`,   color: "var(--green)" },
          ].map(r => (
            <div key={r.label} style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{r.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: r.color, fontFamily: "monospace" }}>{r.value}</div>
            </div>
          ))}
        </div>
      </div>
      <MRRChart payments={payments} />
    </div>

    {/* Subscriber status */}
    <div style={card}>
      <div style={sectionLabel}>Subscriber breakdown</div>
      {[
        { label: "Active",                count: subscribers.filter(s => s.status === 0).length, color: "var(--green)" },
        { label: "Paused (grace period)", count: subscribers.filter(s => s.status === 1).length, color: "var(--amber)" },
        { label: "Cancelled",             count: subscribers.filter(s => s.status === 2).length, color: "var(--red)" },
        { label: "Expired",               count: subscribers.filter(s => s.status === 3).length, color: "var(--text-secondary)" },
      ].map(r => (
        <div key={r.label} style={row}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.label}</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: r.color, fontFamily: "monospace" }}>{r.count}</span>
        </div>
      ))}
    </div>

    {/* Recent activity */}
    <div style={card}>
      <div style={sectionLabel}>Recent activity</div>
      {payments.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No payments yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {payments.slice(0, 6).map(p => (
            <div key={p.payment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "0.5px solid var(--border)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Payment pulled · {p.executed_at ? new Date(p.executed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", fontFamily: "monospace", flexShrink: 0 }}>+${p.merchant_received_usdc}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => { setTab("payments"); loadPayments(); }} style={{ marginTop: 12, background: "none", border: "none", color: "var(--green)", fontSize: 12, cursor: "pointer", padding: 0 }}>
        View all payments →
      </button>
    </div>

    {/* Quick actions */}
    <div style={{ ...card, gridColumn: "1 / -1" }}>
      <div style={sectionLabel}>Quick actions</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => { setTab("products"); setShowAddProduct(true); }} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "10px 20px", cursor: "pointer" }}>+ Add Product</button>
        <button onClick={() => setTab("products")} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, padding: "10px 20px", cursor: "pointer" }}>View Pay Links</button>
        <button onClick={() => setTab("webhooks")} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, padding: "10px 20px", cursor: "pointer" }}>Manage Webhooks</button>
        <button onClick={() => setTab("settings")} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, padding: "10px 20px", cursor: "pointer" }}>Settings</button>
      </div>
    </div>
  </div>
)}

      {/* ── Products ── */}
      {tab === "products" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{products.length} product{products.length !== 1 ? "s" : ""}</div>
            <button onClick={() => setShowAddProduct(true)} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "8px 18px", cursor: "pointer" }}>+ New Product</button>
          </div>
          {products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>No products yet. Create your first plan to generate a pay link.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {products.map(p => (
                <div key={p.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "var(--shadow)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        ${p.amount.toFixed(2)} USDC · {INTERVAL_NAMES[p.interval]}
                        {p.intro_amount > 0 && p.intro_pulls > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 7px", borderRadius: 99, background: "rgba(251,191,36,0.1)", color: "var(--amber)", fontWeight: 600 }}>
                            🎁 ${p.intro_amount.toFixed(2)} intro × {p.intro_pulls}
                          </span>
                        )}
                        {p.yearly_amount && (
                          <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 7px", borderRadius: 99, background: "rgba(52,211,153,0.1)", color: "var(--green)", fontWeight: 600 }}>
                            📅 ${p.yearly_amount.toFixed(2)}/yr
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setEditProduct(p)}
                      style={{ background: "rgba(59,130,246,0.08)", border: "0.5px solid rgba(59,130,246,0.2)", borderRadius: 8, color: "#3b82f6", fontSize: 12, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm("Delete " + p.name + "?")) return;
                        try {
                          const res = await fetch(`${API_BASE}/api/products/${address}/${p.slug}`, { method: "DELETE", headers: { "X-Merchant-Address": address } });
                          if (res.ok) loadProducts(); else alert("Could not delete product.");
                        } catch { alert("Could not reach server."); }
                      }}
                      style={{ background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)", borderRadius: 8, color: "#f87171", fontSize: 12, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
                    >
                      Delete
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", background: "var(--bg-tag)", padding: "6px 12px", borderRadius: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {handle ? `https://authonce.io/pay/${handle}/${p.slug}` : `https://authonce.io/pay/${address.toLowerCase()}/${p.slug}`}
                    </div>
                    <button
                      onClick={() => copyLink(handle ? `${BASE_URL}/${handle}/${p.slug}` : `${BASE_URL}/${address.toLowerCase()}/${p.slug}`, p.id)}
                      style={{ background: copied === p.id ? "rgba(52,211,153,0.12)" : "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: copied === p.id ? "var(--green)" : "var(--text-secondary)", fontSize: 12, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
                    >
                      {copied === p.id ? "Copied!" : "Copy Link"}
                    </button>
                    <button
                      onClick={() => setTrialProduct(p)}
                      style={{ background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.25)", borderRadius: 8, color: "var(--amber)", fontSize: 12, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
                    >
                      🎁 Trial Link
                    </button>
                    <button
                      onClick={() => setPriceChangeProduct(p)}
                      style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, color: "var(--red)", fontSize: 12, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
                    >
                      📢 Price Change
                    </button>
                    <button
                      onClick={() => setQrProduct(p)}
                      style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}
                    >
                      QR Code
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.15)", borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600, marginBottom: 4 }}>🎁 Offers & trials</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              <strong>Introductory pricing</strong> is set per product — e.g. $5 for first month, then $20/month. Set it when creating the product.<br />
              <strong>Free trial links</strong> are campaign-based — click "Trial Link" to generate a pay link with 1–60 free days. Share different links for different campaigns.
            </div>
          </div>
        </div>
      )}

      {/* ── Subscribers ── */}
      {tab === "subscribers" && (
        <div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{subscribers.length} total</div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
          ) : subscribers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>No subscribers yet.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "10px 20px", fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "0.5px solid var(--border)" }}>
                <span>Subscriber</span><span>Amount</span><span>Interval</span><span>Status</span><span>Last Pull</span>
              </div>
              {subscribers.map((sub, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "14px 20px", fontSize: 13, alignItems: "center", borderBottom: "0.5px solid var(--border)" }}>
                  <div>
                    {sub.name && (
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{sub.name}</div>
                    )}
                    {sub.email && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{sub.email}</div>
                    )}
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: sub.name || sub.email ? "var(--text-muted)" : "var(--text-primary)" }}>
                      {shortAddress(sub.vault_address)}
                      {sub.type === "fiat" && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>fiat</span>}
                      {sub.type === "crypto" && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(52,211,153,0.1)", color: "var(--green)" }}>crypto</span>}
                    </div>
                  </div>
                  <span style={{ color: "var(--green)", fontWeight: 600, fontFamily: "monospace" }}>${sub.amount_usdc}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{INTERVAL_NAMES[{ weekly: 0, monthly: 1, yearly: 2 }[sub.interval]] || sub.interval}</span>
                  <StatusBadge status={{ active: 0, paused: 1, cancelled: 2, expired: 3 }[sub.status] ?? sub.status} />
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {sub.last_pulled_at ? new Date(sub.last_pulled_at).toLocaleDateString() : "Never"}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Payments ── */}
      {tab === "payments" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{payments.length} payment{payments.length !== 1 ? "s" : ""} recorded</div>
            {payments.length > 0 && (
              <button onClick={() => exportPaymentsCSV(payments, address)} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "7px 14px", cursor: "pointer" }}>
                ⬇ Export CSV
              </button>
            )}
          </div>
          {paymentsLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>No payments yet.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1.5fr", padding: "10px 20px", fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "0.5px solid var(--border)" }}>
                <span>Date</span><span>Amount</span><span>You Received</span><span>Fee</span><span>Transaction</span>
              </div>
              {payments.map(p => (
                <div key={p.payment_id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1.5fr", padding: "14px 20px", fontSize: 13, alignItems: "center", borderBottom: "0.5px solid var(--border)" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{new Date(p.executed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span style={{ color: "var(--text-primary)", fontFamily: "monospace", fontWeight: 600 }}>${p.amount_usdc}</span>
                  <span style={{ color: "var(--green)", fontFamily: "monospace", fontWeight: 600 }}>${p.merchant_received_usdc}</span>
                  <span style={{ color: "var(--red)", fontFamily: "monospace", fontSize: 12 }}>-${p.protocol_fee_usdc}</span>
                  <a href={`https://sepolia.basescan.org/tx/${p.tx_hash}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "monospace", fontSize: 11, color: "var(--green)", textDecoration: "none" }}>
                    {p.tx_hash?.slice(0, 10)}...{p.tx_hash?.slice(-6)} ↗
                  </a>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Webhooks ── */}
      {tab === "webhooks" && (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{webhooks.length} webhook{webhooks.length !== 1 ? "s" : ""}</div>
      <button onClick={() => setShowAddWebhook(true)} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "8px 18px", cursor: "pointer" }}>+ Add Webhook</button>
    </div>

    {webhooks.length === 0 ? (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>No webhooks configured.</div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {webhooks.map(wh => (
          <div key={wh.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}>
            {/* Endpoint header */}
            <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wh.url}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: "rgba(52,211,153,0.12)", color: "var(--green)", fontWeight: 600 }}>Active</span>
                <button
                  disabled={testFiring[wh.id]}
                  onClick={async () => {
                    setTestFiring(prev => ({ ...prev, [wh.id]: true }));
                    setTestResults(prev => ({ ...prev, [wh.id]: null }));
                    try {
                      const res = await fetch(`${API_BASE}/api/webhooks/test`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-Merchant-Address": address },
                        body: JSON.stringify({ webhook_id: wh.id, event: "test.ping" }),
                      });
                      const data = await res.json();
                      setTestResults(prev => ({ ...prev, [wh.id]: res.ok ? { ok: true, text: `✓ Delivered — ${data.status || 200}` } : { ok: false, text: data.message || "Delivery failed" } }));
                    } catch {
                      setTestResults(prev => ({ ...prev, [wh.id]: { ok: false, text: "Could not reach server" } }));
                    } finally {
                      setTestFiring(prev => ({ ...prev, [wh.id]: false }));
                    }
                  }}
                  style={{
                    background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.2)",
                    borderRadius: 6, color: "#fbbf24", fontSize: 11, fontWeight: 600,
                    padding: "4px 10px", cursor: testFiring[wh.id] ? "not-allowed" : "pointer",
                    opacity: testFiring[wh.id] ? 0.6 : 1,
                  }}
                >
                  {testFiring[wh.id] ? "Sending..." : "Test"}
                </button>
              </div>
            </div>
            {testResults[wh.id] && (
              <div style={{ padding: "8px 20px", background: testResults[wh.id].ok ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)", fontSize: 12, color: testResults[wh.id].ok ? "var(--green)" : "#f87171", fontFamily: "monospace" }}>
                {testResults[wh.id].text}
              </div>
            )}
            {/* Event types */}
            <div style={{ padding: "10px 20px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "0.5px solid var(--border)" }}>
              {wh.events.map(e => (
                <span key={e} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(59,130,246,0.08)", color: "#3b82f6", fontFamily: "monospace", border: "0.5px solid rgba(59,130,246,0.2)" }}>{e}</span>
              ))}
            </div>
            {/* Terminal delivery log */}
            <div style={{ background: "#060a12", padding: "14px 20px", fontFamily: "monospace", fontSize: 12 }}>
              <div style={{ color: "#334155", fontSize: 10, marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Recent deliveries</div>
              {(wh.recentDeliveries || []).length === 0 ? (
                <div style={{ color: "#1e293b", fontSize: 12 }}>No deliveries yet — waiting for first event.</div>
              ) : (
                wh.recentDeliveries.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "4px 0", borderBottom: i < wh.recentDeliveries.length - 1 ? "0.5px solid rgba(255,255,255,0.03)" : "none" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: d.status < 300 ? "#34d399" : d.status >= 500 ? "#f87171" : "#fbbf24", minWidth: 30 }}>{d.status}</span>
                    <span style={{ color: d.status < 300 ? "#34d399" : "#f87171", flex: 1 }}>{d.event}</span>
                    <span style={{ color: "#1e293b", fontSize: 11 }}>{d.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    )}

    <div style={{ marginTop: 20, ...card }}>
      <div style={sectionLabel}>Webhook security</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
        Every request includes a <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>X-AuthOnce-Signature</span> header signed with HMAC-SHA256.
        Failed deliveries retry: 10s → 1min → 5min → 30min → 2hr.
      </div>
    </div>
  </div>
)}

      {/* ── Settings ── */}
      {tab === "settings" && (
        <div style={{ maxWidth: 520, padding: "0 4px" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>Manage your business profile and notification preferences.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Business Name</label>
              <input value={settings.businessName} onChange={e => setSettings(s => ({ ...s, businessName: e.target.value }))} placeholder="Your business name" style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Business Email</label>
              <input value={settings.email} onChange={e => setSettings(s => ({ ...s, email: e.target.value }))} placeholder="info@yourbusiness.com" type="email" style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Notification Email</label>
              <input value={settings.notifyEmail || ""} onChange={e => setSettings(s => ({ ...s, notifyEmail: e.target.value }))} placeholder="alerts@yourbusiness.com" type="email" style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>Notification Preference</label>
              {[
                ["email",   "Email only",            "Recommended."],
                ["webhook", "Webhook only",           "For developers."],
                ["both",    "Both email and webhook", "Email + webhook."],
              ].map(([val, label, desc]) => (
                <div key={val} onClick={() => setSettings(s => ({ ...s, notifications: val }))} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 8, border: `0.5px solid ${settings.notifications === val ? "var(--green)" : "var(--border)"}`, background: settings.notifications === val ? "rgba(52,211,153,0.06)" : "var(--bg-card)", cursor: "pointer", marginBottom: 8 }}>
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
            {/* ── Stripe Connect ── */}
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                    💳 Stripe — Card & Bank Payments
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    Connect Stripe to accept card, MB Way, Multibanco, and SEPA payments from subscribers who don't have crypto wallets.
                  </div>
                </div>
                {stripeStatus?.connected && (
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "rgba(52,211,153,0.12)", color: "var(--green)", fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
                    ✓ Connected
                  </span>
                )}
              </div>

              {stripeStatus === null && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Checking connection...</div>
              )}

              {stripeStatus?.connected ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[
                      ["Charges", stripeStatus.charges_enabled ? "✓ Enabled" : "⚠ Pending"],
                      ["Payouts", stripeStatus.payouts_enabled ? "✓ Enabled" : "⚠ Pending"],
                      ["Account", stripeStatus.stripe_account_id?.slice(0, 14) + "..."],
                      ["Connected", stripeStatus.connected_at ? new Date(stripeStatus.connected_at).toLocaleDateString() : "—"],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: "var(--bg-tag)", borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {!stripeStatus.charges_enabled && (
                    <div style={{ fontSize: 12, color: "var(--amber)", background: "rgba(251,191,36,0.06)", border: "0.5px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                      ⚠ Your Stripe account needs additional verification before charges are enabled. Check your Stripe dashboard.
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <a
                      href="https://dashboard.stripe.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, background: "var(--bg-tag)", border: "0.5px solid var(--border)", color: "var(--text-secondary)", textDecoration: "none", display: "inline-block" }}
                    >
                      Open Stripe Dashboard ↗
                    </a>
                    <button
                      onClick={handleStripeDisconnect}
                      style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)", color: "#f87171", cursor: "pointer" }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : stripeStatus !== null && (
                <div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {["💳 Visa / Mastercard", "🇵🇹 MB Way", "🏧 Multibanco", "🏦 SEPA Transfer"].map(m => (
                      <span key={m} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--bg-tag)", color: "var(--text-muted)" }}>{m}</span>
                    ))}
                  </div>
                  <button
                    onClick={handleStripeConnect}
                    disabled={stripeConnecting}
                    style={{ background: "linear-gradient(135deg, #635bff, #7c6fff)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 20px", cursor: stripeConnecting ? "not-allowed" : "pointer", opacity: stripeConnecting ? 0.7 : 1 }}
                  >
                    {stripeConnecting ? "Redirecting to Stripe..." : "Connect Stripe Account →"}
                  </button>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                    You'll be redirected to Stripe to connect your account. Payments go directly to you — AuthOnce never holds funds.
                  </div>
                </div>
              )}
            </div>

            {/* ── Vanity Pay Link Handle ── */}
<div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
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
      style={{ flex: 1, background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13 }}
    />
    <button
      disabled={handleSaving || handleInput.length < 3}
      onClick={async () => {
        setHandleSaving(true);
        setHandleMsg(null);
        try {
          const res = await fetch(`${API_BASE}/api/merchant/handle`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Merchant-Address": address },
            body: JSON.stringify({ handle: handleInput }),
          });
          const data = await res.json();
          if (res.ok) {
            setHandle(data.handle);
            setHandleMsg({ ok: true, text: `✓ Handle "${data.handle}" saved.` });
          } else {
            setHandleMsg({ ok: false, text: data.message || "Could not save handle." });
          }
        } catch { setHandleMsg({ ok: false, text: "Could not reach server." }); }
        finally { setHandleSaving(false); }
      }}
      style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "8px 16px", cursor: handleSaving || handleInput.length < 3 ? "not-allowed" : "pointer", opacity: handleSaving || handleInput.length < 3 ? 0.6 : 1 }}
    >
      {handleSaving ? "Saving..." : "Save Handle"}
    </button>
  </div>
  {handleMsg && (
    <div style={{ fontSize: 12, marginTop: 8, color: handleMsg.ok ? "var(--green)" : "#f87171" }}>{handleMsg.text}</div>
  )}
</div>

            <button
              onClick={async () => {
                localStorage.setItem("merchant_settings_" + address, JSON.stringify(settings));
                try {
                  const res = await fetch(`${API_BASE}/api/merchants/register`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wallet_address: address, business_name: settings.businessName, email: settings.notifyEmail || settings.email, settlement_preference: "usdc" }),
                  });
                  if (res.ok) alert("Settings saved!"); else alert("Saved locally. Could not sync to server.");
                } catch { alert("Saved locally. Could not reach server."); }
              }}
              style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "10px 24px", cursor: "pointer", alignSelf: "flex-start" }}
            >
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddProduct && <AddProductModal merchantAddress={address} onClose={() => setShowAddProduct(false)} onAdded={loadProducts} />}
      {editProduct    && <EditProductModal merchantAddress={address} product={editProduct} onClose={() => setEditProduct(null)} onSaved={loadProducts} />}
      {showAddWebhook && <WebhookModal merchantAddress={address} onClose={() => setShowAddWebhook(false)} />}
      {trialProduct   && <TrialPopover product={trialProduct} address={address} onClose={() => setTrialProduct(null)} />}
      {priceChangeProduct && <PriceChangeModal product={priceChangeProduct} address={address} onClose={() => setPriceChangeProduct(null)} />}

      {/* QR Modal */}
      {qrProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setQrProduct(null)}>
          <div id="qr-modal" style={{ background: "var(--bg-card)", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
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
              }} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>⬇ Download</button>
              <button onClick={() => window.print()} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>🖨 Print</button>
              <button onClick={() => {
                const url = handle ? `${BASE_URL}/${handle}/${qrProduct.slug}` : `${BASE_URL}/${address.toLowerCase()}/${qrProduct.slug}`;
                const msg = encodeURIComponent(`Subscribe to ${qrProduct.name} — $${qrProduct.amount.toFixed(2)} USDC/${INTERVAL_NAMES[qrProduct.interval]}: ${url}`);
                window.open(`https://wa.me/?text=${msg}`, "_blank");
              }} style={{ background: "rgba(37,211,102,0.12)", border: "0.5px solid rgba(37,211,102,0.3)", borderRadius: 8, color: "#25d366", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>WhatsApp</button>
              <button onClick={() => setQrProduct(null)} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
