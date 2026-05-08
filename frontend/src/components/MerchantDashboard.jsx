// src/components/MerchantDashboard.jsx
import { useState, useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "wagmi/chains";
import {
  VAULT_ADDRESS, VAULT_ABI,
  INTERVAL_NAMES, STATUS_NAMES, STATUS_COLORS,
  shortAddress, formatUSDC,
} from "../config.js";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http("https://base-sepolia.g.alchemy.com/v2/_uXoDLhLHyfV7jqbsvucT"),
});

const BASE_URL = "https://app.authonce.io/pay";
const API_BASE = "https://the-opportunity-production.up.railway.app";

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

function StatusBadge({ status }) {
  const name = STATUS_NAMES[status] || "Unknown";
  const cfg = STATUS_COLORS[name] || { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
      {name}
    </span>
  );
}

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

function AddProductModal({ merchantAddress, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("1");

  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name || !amount) return;
    setSaving(true);
    try {
      const intervalMap = { "0": "weekly", "1": "monthly", "2": "yearly" };
      const res = await fetch(`${API_BASE}/api/products/${merchantAddress}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Merchant-Address": merchantAddress },
        body: JSON.stringify({ name, amount: parseFloat(amount), interval: intervalMap[interval] }),
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
      <div style={{ background: "var(--bg-modal)", border: "0.5px solid var(--border-input)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>New Product / Plan</h2>
          <button onClick={onClose} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "4px 10px", color: "var(--text-secondary)", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Plan name</label>
            <input placeholder="e.g. Standard, Premium, Ultra" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Price (USDC)</label>
            <input type="number" placeholder="15.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Billing interval</label>
            <select value={interval} onChange={e => setInterval(e.target.value)}>
              <option value="0">Weekly</option>
              <option value="1">Monthly</option>
              <option value="2">Yearly</option>
            </select>
          </div>
          {name && amount && (
            <div style={{ background: "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.2)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 4 }}>Pay link preview</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all" }}>
                {BASE_URL}/{shortAddress(merchantAddress)}/{name.toLowerCase().replace(/\s+/g, "-")}
              </div>
            </div>
          )}
<button onClick={handleAdd} disabled={saving} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 14, padding: "11px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, marginTop: 8 }}>
  {saving ? "Saving..." : "Create Product"}
</button>            Create Product
          </button>
        </div>
      </div>
    </div>
  );
}

function WebhookModal({ merchantAddress, onClose }) {
  const [url, setUrl] = useState("");
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
            <input placeholder="https://yoursite.com/webhooks/opportunity" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div style={{ background: "var(--bg-tag)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>Events included</div>
            {["payment.success", "payment.failed", "subscription.cancelled", "subscription.expired"].map(e => (
              <div key={e} style={{ fontSize: 12, color: "var(--text-muted)", padding: "2px 0" }}>✓ {e}</div>
            ))}
          </div>
          <div style={{ background: "var(--bg-tag)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Security</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>All requests signed with HMAC-SHA256. Verify the X-Opportunity-Signature header before processing.</div>
          </div>
          {saved ? (
            <div style={{ textAlign: "center", color: "var(--green)", fontSize: 14 }}>✅ Webhook saved!</div>
          ) : (
            <button onClick={handleSave} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 14, padding: "11px", cursor: "pointer" }}>
              Save Webhook
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MerchantDashboard({ address }) {
  const [tab, setTab] = useState("overview");
  const [subscribers, setSubscribers] = useState([]);
  const [products, setProducts] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(() => JSON.parse(localStorage.getItem("merchant_settings_" + address) || JSON.stringify({ businessName: "", email: "", notifications: "email" })));
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [copied, setCopied] = useState(null);
  const [qrProduct, setQrProduct] = useState(null);
  const loadProducts = useCallback(async () => {
  if (!address) return;
  try {
    const res = await fetch(`${API_BASE}/api/products/${address}`, {
      headers: { "X-Merchant-Address": address },
    });
    if (res.ok) {
      const data = await res.json();
      // Normalize interval: API returns 'weekly'/'monthly'/'yearly', map to numeric for existing UI
      const INTERVAL_MAP = { weekly: 0, monthly: 1, yearly: 2 };
      setProducts(data.products.map(p => ({ ...p, interval: INTERVAL_MAP[p.interval] ?? p.interval })));
    }
  } catch (err) {
    console.error("[Dashboard] loadProducts error:", err);
  }
}, [address]);  const loadWebhooks = useCallback(() => setWebhooks(JSON.parse(localStorage.getItem(`webhooks_${address}`) || "[]")), [address]);

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
            subs.push({ id, owner: sub[0], merchant: sub[2], safeVault: sub[3], amount: sub[4], interval: Number(sub[5]), lastPulledAt: sub[6], status: Number(sub[8]) });
          }
          id++;
        } catch { break; }
      }
      setSubscribers(subs);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [address]);

  useEffect(() => { fetchSubscribers(); loadProducts(); loadWebhooks(); }, [fetchSubscribers, loadProducts, loadWebhooks]);

  const copyLink = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };

  const activeSubs = subscribers.filter(s => s.status === 0);
  const totalMRR = activeSubs.reduce((acc, s) => { const amt = Number(s.amount) / 1e6; return acc + (s.interval === 0 ? amt * 4.33 : s.interval === 1 ? amt : amt / 12); }, 0);
  const totalRevenue = subscribers.reduce((acc, s) => acc + Number(s.amount) / 1e6, 0);
  const protocolFee = totalRevenue * 0.005;
  const netRevenue = totalRevenue - protocolFee;

  const sectionLabel = { fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 };
  const card = { background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow)" };
  const row = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--border)" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Merchant Portal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{shortAddress(address)}</h1>
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "rgba(52,211,153,0.12)", color: "var(--green)", fontWeight: 600 }}>Approved Merchant</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Active Subscribers" value={activeSubs.length} sub="paying subscribers" accent="linear-gradient(90deg,#34d399,#3b82f6)" />
        <StatCard label="Monthly Revenue" value={`$${totalMRR.toFixed(2)}`} sub="MRR — USDC" accent="linear-gradient(90deg,#a78bfa,#ec4899)" />
        <StatCard label="Net Revenue" value={`$${netRevenue.toFixed(2)}`} sub="after 0.5% protocol fee" accent="linear-gradient(90deg,#60a5fa,#34d399)" />
        <StatCard label="Products" value={products.length} sub="active plans" accent="linear-gradient(90deg,#fbbf24,#f87171)" />
      </div>

      <div style={{ borderBottom: "0.5px solid var(--border)", marginBottom: 20, display: "flex", gap: 4 }}>
        <Tab label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
        <Tab label="Products & Pay Links" active={tab === "products"} onClick={() => setTab("products")} />
        <Tab label="Subscribers" active={tab === "subscribers"} onClick={() => setTab("subscribers")} />
        <Tab label="Webhooks" active={tab === "webhooks"} onClick={() => setTab("webhooks")} />
        <Tab label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <div style={sectionLabel}>Revenue breakdown</div>
            {[
              { label: "Gross revenue", value: `$${totalRevenue.toFixed(2)}`, color: "var(--text-primary)" },
              { label: "Protocol fee (0.5%)", value: `-$${protocolFee.toFixed(2)}`, color: "var(--red)" },
              { label: "Net to you", value: `$${netRevenue.toFixed(2)}`, color: "var(--green)" },
            ].map(r => (
              <div key={r.label} style={row}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: r.color, fontFamily: "monospace" }}>{r.value}</span>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={sectionLabel}>Subscriber status</div>
            {[
              { label: "Active", count: subscribers.filter(s => s.status === 0).length, color: "var(--green)" },
              { label: "Paused (grace period)", count: subscribers.filter(s => s.status === 1).length, color: "var(--amber)" },
              { label: "Cancelled", count: subscribers.filter(s => s.status === 2).length, color: "var(--red)" },
              { label: "Expired", count: subscribers.filter(s => s.status === 3).length, color: "var(--text-secondary)" },
            ].map(r => (
              <div key={r.label} style={row}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: r.color }}>{r.count}</span>
              </div>
            ))}
          </div>

          <div style={{ ...card, gridColumn: "1 / -1" }}>
            <div style={sectionLabel}>Quick actions</div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => { setTab("products"); setShowAddProduct(true); }} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "10px 20px", cursor: "pointer" }}>+ Add Product</button>
              <button onClick={() => setTab("products")} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, padding: "10px 20px", cursor: "pointer" }}>View Pay Links</button>
              <button onClick={() => setTab("webhooks")} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 13, padding: "10px 20px", cursor: "pointer" }}>Manage Webhooks</button>
            </div>
          </div>
        </div>
      )}

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
                <div key={p.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "var(--shadow)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>${p.amount.toFixed(2)} USDC · {INTERVAL_NAMES[p.interval]}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", background: "var(--bg-tag)", padding: "6px 12px", borderRadius: 6, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {BASE_URL}/{shortAddress(address)}/{p.name.toLowerCase().replace(/\s+/g, "-")}
                    </div>
                    <button onClick={() => copyLink(`${BASE_URL}/${address}/${p.name.toLowerCase().replace(/\s+/g, "-")}`, p.id)}
                      style={{ background: copied === p.id ? "rgba(52,211,153,0.12)" : "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: copied === p.id ? "var(--green)" : "var(--text-secondary)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>
                      {copied === p.id ? "Copied!" : "Copy Link"}
                    </button>
                    <button onClick={() => setQrProduct(p)}
                      style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>
                      QR Code
                    </button>
                    <button onClick={() => { if (window.confirm("Delete " + p.name + "?")) { const updated = products.filter(x => x.id !== p.id); localStorage.setItem("products_" + address, JSON.stringify(updated)); loadProducts(); } }} style={{ background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)", borderRadius: 8, color: "#f87171", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "subscribers" && (
        <div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>{subscribers.length} total subscriber{subscribers.length !== 1 ? "s" : ""}</div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
          ) : subscribers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>No subscribers yet. Share your pay links to get started.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "10px 20px", fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: "0.5px solid var(--border)" }}>
                <span>Vault Address</span><span>Amount</span><span>Interval</span><span>Status</span><span>Last Pull</span>
              </div>
              {subscribers.map(sub => (
                <div key={sub.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "14px 20px", fontSize: 13, alignItems: "center", borderBottom: "0.5px solid var(--border)" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-primary)" }}>{shortAddress(sub.safeVault || sub.owner)}</span>
                  <span style={{ color: "var(--green)", fontWeight: 600, fontFamily: "monospace" }}>{formatUSDC(sub.amount)}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{INTERVAL_NAMES[sub.interval]}</span>
                  <StatusBadge status={sub.status} />
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{sub.lastPulledAt > 0n ? new Date(Number(sub.lastPulledAt) * 1000).toLocaleDateString() : "Never"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "webhooks" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{webhooks.length} webhook{webhooks.length !== 1 ? "s" : ""} configured</div>
            <button onClick={() => setShowAddWebhook(true)} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "8px 18px", cursor: "pointer" }}>+ Add Webhook</button>
          </div>
          {webhooks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>No webhooks yet. Add an endpoint to receive payment notifications.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {webhooks.map(wh => (
                <div key={wh.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "16px 20px", boxShadow: "var(--shadow)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontFamily: "monospace", color: "var(--text-primary)" }}>{wh.url}</div>
                    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: "rgba(52,211,153,0.12)", color: "var(--green)", fontWeight: 600 }}>Active</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {wh.events.map(e => (
                      <span key={e} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--bg-tag)", color: "var(--text-muted)", fontFamily: "monospace" }}>{e}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 20, ...card }}>
            <div style={sectionLabel}>Webhook security</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
              Every request includes a <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>X-Opportunity-Signature</span> header signed with HMAC-SHA256.
              Failed deliveries are retried: 10s → 1min → 5min → 30min → 2hr.
            </div>
          </div>
        </div>
      )}

      {showAddProduct && <AddProductModal merchantAddress={address} onClose={() => setShowAddProduct(false)} onAdded={loadProducts} />}
      {tab === "settings" && (
        <div style={{ maxWidth: 520, padding: "0 4px" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>Manage your business profile and notification preferences.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Business Name</label>
              <input value={settings.businessName} onChange={e => setSettings(s => ({ ...s, businessName: e.target.value }))} placeholder="Your business name" style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Business Email (public contact)</label>
              <input value={settings.email} onChange={e => setSettings(s => ({ ...s, email: e.target.value }))} placeholder="info@yourbusiness.com" type="email" style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Shown to subscribers on the payment page.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Notification Email</label>
              <input value={settings.notifyEmail || ""} onChange={e => setSettings(s => ({ ...s, notifyEmail: e.target.value }))} placeholder="alerts@yourbusiness.com" type="email" style={{ width: "100%", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Where AuthOnce sends payment alerts. Can be different from your business email.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 8 }}>Notification Preference</label>
              {[["email", "Email only", "Recommended. AuthOnce sends you an email for every payment event."], ["webhook", "Webhook only", "For developers. Your server receives instant POST notifications."], ["both", "Both email and webhook", "Receive email notifications and fire your webhook endpoint."]].map(([val, label, desc]) => (
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
            <button onClick={async () => {
                      localStorage.setItem("merchant_settings_" + address, JSON.stringify(settings));
                      try {
                        const res = await fetch("https://the-opportunity-production.up.railway.app/api/merchants/register", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ wallet_address: address, business_name: settings.businessName, email: settings.notifyEmail || settings.email, settlement_preference: "usdc" })
                        });
                        if (res.ok) { alert("Settings saved!"); }
                        else { alert("Saved locally. Could not sync to server."); }
                      } catch { alert("Saved locally. Could not reach server."); }
                    }} style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 8, color: "#080c14", fontWeight: 700, fontSize: 13, padding: "10px 24px", cursor: "pointer", alignSelf: "flex-start" }}>Save Settings</button>
          </div>
        </div>
      )}
      {showAddWebhook && <WebhookModal merchantAddress={address} onClose={() => setShowAddWebhook(false)} />}
      {qrProduct && (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
    onClick={() => setQrProduct(null)}>
    <div id="qr-modal" style={{ background: "var(--bg-card)", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      onClick={e => e.stopPropagation()}>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{qrProduct.name}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>${qrProduct.amount.toFixed(2)} USDC · {INTERVAL_NAMES[qrProduct.interval]}</div>
      <QRCodeSVG value={`${BASE_URL}/${address}/${qrProduct.name.toLowerCase().replace(/\s+/g, "-")}`} size={200} />
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16, fontFamily: "monospace", wordBreak: "break-all", maxWidth: 240 }}>
        {BASE_URL}/{shortAddress(address)}/{qrProduct.name.toLowerCase().replace(/\s+/g, "-")}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={() => {
          const svg = document.querySelector("#qr-modal svg");
          const svgData = new XMLSerializer().serializeToString(svg);
          const canvas = document.createElement("canvas");
          canvas.width = 200; canvas.height = 200;
          const ctx = canvas.getContext("2d");
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, 0, 0); const a = document.createElement("a"); a.download = `${qrProduct.name}-qr.png`; a.href = canvas.toDataURL(); a.click(); };
          img.src = "data:image/svg+xml;base64," + btoa(svgData);
        }} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>
          ⬇ Download
        </button>
        <button onClick={() => window.print()} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>
          🖨 Print
        </button>
        <button onClick={() => {
          const url = `${BASE_URL}/${address}/${qrProduct.name.toLowerCase().replace(/\s+/g, "-")}`;
          const msg = encodeURIComponent(`Subscribe to ${qrProduct.name} — $${qrProduct.amount.toFixed(2)} USDC/${INTERVAL_NAMES[qrProduct.interval]}: ${url}`);
          window.open(`https://wa.me/?text=${msg}`, "_blank");
        }} style={{ background: "rgba(37,211,102,0.12)", border: "0.5px solid rgba(37,211,102,0.3)", borderRadius: 8, color: "#25d366", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>
          WhatsApp
        </button>
        <button onClick={() => setQrProduct(null)} style={{ background: "var(--bg-tag)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--text-secondary)", fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>
          Close
        </button>
        <button onClick={() => {
                      if (window.confirm(`Delete "${p.name}"?`)) {
                        const updated = products.filter(x => x.id !== p.id);
                        localStorage.setItem(`products_${address}`, JSON.stringify(updated));
                        loadProducts();
                      }
                    }}
                      style={{ background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)", borderRadius: 8, color: "#f87171", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>
                      Delete
                    </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
