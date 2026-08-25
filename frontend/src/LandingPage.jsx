// src/LandingPage.jsx — AuthOnce Merchant Landing Page v3
// Light mode default · Dark mode toggle · Full screen hero · Web3 native

import { useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { VAULT_ADDRESS } from "./config.js";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

// ─── Animated Gradient Canvas ─────────────────────────────────────────────────
function GradientCanvas({ isDark }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let t = 0;

    function resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const orbs = [
      { ox: 0.15, oy: 0.35, r: 0.55, color: [52,211,153],  speed: 0.35, amp: 0.09 },
      { ox: 0.78, oy: 0.55, r: 0.45, color: [59,130,246],  speed: 0.25, amp: 0.07 },
      { ox: 0.50, oy: 0.18, r: 0.35, color: [167,139,250], speed: 0.45, amp: 0.08 },
      { ox: 0.88, oy: 0.78, r: 0.30, color: [52,211,153],  speed: 0.20, amp: 0.05 },
      { ox: 0.22, oy: 0.80, r: 0.28, color: [59,130,246],  speed: 0.30, amp: 0.06 },
    ];

    function draw() {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      t += 0.005;
      const alpha = isDark ? 0.22 : 0.14;
      orbs.forEach((orb, i) => {
        const x = orb.ox * w + Math.sin(t * orb.speed + i * 1.3) * orb.amp * w;
        const y = orb.oy * h + Math.cos(t * orb.speed * 0.8 + i * 0.9) * orb.amp * h;
        const r = orb.r * Math.min(w, h) * 0.65;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0,   `rgba(${orb.color.join(",")},${alpha})`);
        grad.addColorStop(0.5, `rgba(${orb.color.join(",")},${alpha * 0.4})`);
        grad.addColorStop(1,   `rgba(${orb.color.join(",")},0)`);
        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", top: 0, left: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Apply Form ───────────────────────────────────────────────────────────────
function ApplyForm({ isDark }) {
  const [form, setForm] = useState({
    business_name: "", email: "", wallet_address: "", website: "", use_case: "",
  });
  const [status, setStatus]   = useState("idle");
  const [message, setMessage] = useState("");

  const border  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9"                : "#0f172a";
  const muted   = isDark ? "#94a3b8"                : "#64748b";
  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const accent  = "#34d399";

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/api/merchants/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address:        form.wallet_address || "0x0000000000000000000000000000000000000000",
          business_name:         form.business_name,
          email:                 form.email,
          website:               form.website,
          use_case:              form.use_case,
          settlement_preference: "usdc",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Registration failed");
      }
      await fetch(`${API_BASE}/api/merchants/notify-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      }).catch(() => {});
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setMessage(err.message);
    }
  }

  if (status === "success") {
    return (
      <div style={{
        background: "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.3)",
        borderRadius: 16, padding: 40, textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: accent, margin: "0 0 12px" }}>
          {"Application received!"}
        </h3>
        <p style={{ color: muted, fontSize: 14, margin: 0, fontWeight: 300 }}>
          {"We'll review your application and get back to you within 48 hours."}
        </p>
      </div>
    );
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: inputBg, border: `0.5px solid ${border}`,
    borderRadius: 8, padding: "10px 14px",
    color: text, fontSize: 13, outline: "none",
    fontFamily: "'DM Sans', sans-serif",
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 600, color: muted,
    display: "block", marginBottom: 6,
    textTransform: "uppercase", letterSpacing: "0.05em",
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="ao-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>{"Business name"}</label>
          <input type="text" required value={form.business_name}
            onChange={e => setForm(p => ({ ...p, business_name: e.target.value }))}
            placeholder={"Acme Inc."}
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{"Business email"}</label>
          <input type="email" required value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="you@company.com"
            style={inputStyle} />
        </div>
      </div>

      <div className="ao-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>{"Wallet address (optional)"}</label>
          <input type="text" value={form.wallet_address}
            onChange={e => setForm(p => ({ ...p, wallet_address: e.target.value }))}
            placeholder="0x..."
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{"Website (optional)"}</label>
          <input type="url" value={form.website}
            onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
            placeholder="https://yoursite.com"
            style={inputStyle} />
        </div>
      </div>

      <p style={{ fontSize: 11, color: muted, margin: "0 0 16px", lineHeight: 1.6 }}>
        {<>Use any exchange deposit address — <a href="https://coinbase.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "underline" }}>Coinbase</a>, <a href="https://binance.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "underline" }}>Binance</a>, <a href="https://kraken.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "underline" }}>Kraken</a>, or any other. Stablecoins land directly and you can convert to EUR and withdraw to your bank in two clicks.</>}
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>{"How will you use AuthOnce?"}</label>
        <textarea required rows={3} value={form.use_case}
          onChange={e => setForm(p => ({ ...p, use_case: e.target.value }))}
          placeholder={"Tell us about your business and how you plan to use recurring crypto payments..."}
          style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      {status === "error" && (
        <div style={{
          background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          fontSize: 13, color: "#f87171",
        }}>{message || ("Something went wrong. Please try again.")}</div>
      )}

      <button type="submit" disabled={status === "loading"} style={{
        width: "100%",
        background: status === "loading" ? "rgba(52,211,153,0.4)" : "linear-gradient(135deg, #34d399, #3b82f6)",
        border: "none", borderRadius: 10, padding: "14px",
        color: "#080c14", fontSize: 15, fontWeight: 700,
        cursor: status === "loading" ? "not-allowed" : "pointer",
        letterSpacing: "-0.01em", fontFamily: "'DM Sans', sans-serif",
      }}>
        {status === "loading"
          ? ("Submitting…")
          : ("Apply for founding merchant access →")}
      </button>

      <p style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 12, marginBottom: 0 }}>
        {"We review every application personally. You'll hear from us within 48 hours."}
      </p>
    </form>
  );
}

// ─── Product Creator ─────────────────────────────────────────────────────────
function ProductCreator({ isDark, border, cardBg, text, muted, accent }) {
  const [name, setName] = useState("Pro Plan");
  const [price, setPrice] = useState(29);
  const [interval, setInterval] = useState("Monthly");
  const [grace, setGrace] = useState(7);
  const [tokens, setTokens] = useState({ usdc: true, eurc: false });
  const [introPrice, setIntroPrice] = useState(false);
  const [introCycles, setIntroCycles] = useState(3);
  const [introAmt, setIntroAmt] = useState(9);
  const [yearlyOption, setYearlyOption] = useState(false);

  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const intervalWord = interval === "Monthly" ? "month" : interval === "Weekly" ? "week" : "year";
  const activeTokens = Object.entries(tokens).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  const displayPrice = introPrice ? introAmt : price;

  const toggleStyle = (active, type = "crypto") => ({
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: active ? `0.5px solid ${type === "crypto" ? "rgba(52,211,153,0.5)" : "rgba(59,130,246,0.5)"}` : `0.5px solid ${border}`,
    background: active ? (type === "crypto" ? "rgba(52,211,153,0.08)" : "rgba(59,130,246,0.08)") : "transparent",
    color: active ? (type === "crypto" ? "#34d399" : "#3b82f6") : muted,
  });

  const toggleRowStyle = (active) => ({
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 0", borderBottom: `0.5px solid ${border}`,
  });

  const switchStyle = (active) => ({
    width: 36, height: 20, borderRadius: 99, border: "none", cursor: "pointer",
    background: active ? "#34d399" : isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
    position: "relative", transition: "background 0.2s", flexShrink: 0,
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }} className="ao-form-row">

      {/* Form */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 16, padding: 24 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: text, margin: "0 0 16px" }}>{"New product"}</p>

        <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{"Product name"}</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} aria-label="Product name" style={{ width: "100%", boxSizing: "border-box", marginBottom: 14 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }} className="ao-form-row">
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{"Price ($)"}</label>
            <input type="number" value={price} min={1} onChange={e => setPrice(Number(e.target.value))} aria-label="Price in dollars" style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{"Interval"}</label>
            <select value={interval} onChange={e => setInterval(e.target.value)} aria-label="Billing interval" style={{ width: "100%", boxSizing: "border-box" }}>
              <option>{"Monthly"}</option>
              <option>{"Weekly"}</option>
              <option>{"Yearly"}</option>
            </select>
          </div>
        </div>
        <p style={{ fontSize: 11, color: muted, margin: "0 0 14px" }}>$1 = 1 USDC = 1 EURC</p>

        <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{"Grace period (days, 1–30)"}</label>
        <input type="number" value={grace} min={1} max={30} onChange={e => setGrace(Number(e.target.value))} aria-label="Grace period in days" style={{ width: "100%", boxSizing: "border-box", marginBottom: 4 }} />
        <p style={{ fontSize: 11, color: muted, margin: "0 0 14px" }}>{"Keeper retries daily. Expires if unpaid after this window."}</p>

        <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>{"Crypto tokens"}</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {Object.keys(tokens).map(k => (
            <label key={k} style={toggleStyle(tokens[k], "crypto")}>
              <input type="checkbox" checked={tokens[k]} onChange={e => setTokens(t => ({ ...t, [k]: e.target.checked }))} style={{ width: 14, height: 14, accentColor: "#34d399" }} />
              {k.toUpperCase()}
            </label>
          ))}
        </div>

        {/* Toggle rows */}
        <div style={{ borderTop: `0.5px solid ${border}`, paddingTop: 4 }}>
          <div style={toggleRowStyle(introPrice)}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: text, margin: "0 0 2px" }}>{"Introductory pricing"}</p>
              <p style={{ fontSize: 11, color: muted, margin: 0 }}>{"Lower price for first N cycles"}</p>
            </div>
            <button onClick={() => setIntroPrice(v => !v)} style={switchStyle(introPrice)} aria-label="Toggle introductory pricing">
              <span style={{ position: "absolute", top: 2, left: introPrice ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
          {introPrice && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 0" }}>
              <div>
                <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 4 }}>{"Intro price ($)"}</label>
                <input type="number" value={introAmt} min={1} onChange={e => setIntroAmt(Number(e.target.value))} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 4 }}>{"For N cycles"}</label>
                <input type="number" value={introCycles} min={1} max={12} onChange={e => setIntroCycles(Number(e.target.value))} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>
          )}

          <div style={{ ...toggleRowStyle(yearlyOption), borderBottom: "none" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: text, margin: "0 0 2px" }}>{"Yearly billing option"}</p>
              <p style={{ fontSize: 11, color: muted, margin: 0 }}>{"Annual plan alongside monthly"}</p>
            </div>
            <button onClick={() => setYearlyOption(v => !v)} style={switchStyle(yearlyOption)} aria-label="Toggle yearly billing">
              <span style={{ position: "absolute", top: 2, left: yearlyOption ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
        </div>

        <a href="#apply" style={{
          display: "block", width: "100%", boxSizing: "border-box", padding: "12px", marginTop: 16,
          background: "linear-gradient(135deg, #34d399, #3b82f6)", color: "#080c14",
          border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700,
          textAlign: "center", textDecoration: "none",
        }}>
          {"Apply to create this product →"}
        </a>
      </div>

      {/* Preview */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }}>{"Live pay page preview"}</p>
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 16, padding: 20 }}>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `0.5px solid ${border}` }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "#34d399", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#080c14" }}>A</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: text, margin: 0 }}>AuthOnce</p>
              <p style={{ fontSize: 11, color: muted, margin: 0 }}>authonce.io/pay/yourname/{slug}</p>
            </div>
          </div>

          <p style={{ fontSize: 20, fontWeight: 700, color: text, margin: "0 0 2px" }}>{name || "My Plan"}</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
            {introPrice && <span style={{ fontSize: 26, fontWeight: 700, color: "#34d399", fontFamily: "'DM Mono', monospace" }}>${introAmt}</span>}
            <span style={{ fontSize: introPrice ? 16 : 26, fontWeight: 700, color: introPrice ? muted : "#34d399", fontFamily: "'DM Mono', monospace", textDecoration: introPrice ? "line-through" : "none" }}>${price}</span>
          </div>
          {introPrice && <p style={{ fontSize: 11, color: "#34d399", margin: "0 0 2px", fontWeight: 600 }}>{`Intro price for ${introCycles} cycles`}</p>}
          <p style={{ fontSize: 12, color: muted, margin: "0 0 8px" }}>{"per"} {intervalWord}</p>

          {yearlyOption && (
            <div style={{ background: isDark ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12 }}>
              <span style={{ color: "#34d399", fontWeight: 600 }}>{"Save ~17% with annual"}</span>
              <span style={{ color: muted, marginLeft: 8 }}>${Math.round(price * 10)} / {"year"}</span>
            </div>
          )}

          <div>
            <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: muted, margin: "0 0 6px" }}>{"Select token"}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {activeTokens.length === 0 && <span style={{ fontSize: 12, color: muted }}>—</span>}
                {activeTokens.map((t, i) => (
                  <span key={t} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 99, background: i === 0 ? "#34d399" : "transparent", color: i === 0 ? "#080c14" : muted, border: i === 0 ? "none" : `0.5px solid ${border}`, fontWeight: i === 0 ? 600 : 400, cursor: "pointer" }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: muted }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>{"Grace period"}</span><span style={{ color: text, fontWeight: 600 }}>{grace} {"days"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>{"Protocol fee"}</span><span style={{ color: text, fontWeight: 600 }}>0.5%</span></div>
            </div>
            <button style={{ width: "100%", padding: 11, background: "#34d399", color: "#080c14", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "default" }}>
              {"Connect wallet to subscribe →"}
            </button>
            <p style={{ fontSize: 11, color: muted, textAlign: "center", margin: "6px 0 0" }}>{"Non-custodial · Base Network · No card required"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ROI Calculator ───────────────────────────────────────────────────────────
function ROICalculator({ isDark, accent, border, cardBg, text, muted }) {
  const [mrr, setMrr] = useState(5000);
  const [subs, setSubs] = useState(50);

  const traditional = mrr * 0.029 + subs * 0.30;
  const authonce = mrr * 0.005;
  const saving = traditional - authonce;
  const pct = Math.round((saving / traditional) * 100);
  const fmt = (n) => "$" + Math.round(n).toLocaleString();

  const sliderStyle = { width: "100%", marginBottom: 4 };
  const cardStyle = {
    background: cardBg, border: `0.5px solid ${border}`,
    borderRadius: 14, padding: "24px 20px", textAlign: "center",
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }} className="ao-form-row">
        <div>
          <p style={{ fontSize: 12, color: muted, margin: "0 0 8px" }}>
            {"Monthly recurring revenue"}
          </p>
          <input type="range" min={500} max={50000} step={500} value={mrr}
            onChange={e => setMrr(Number(e.target.value))} aria-label="Monthly recurring revenue" style={sliderStyle} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: muted }}>$500</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: text }}>{fmt(mrr)}</span>
            <span style={{ fontSize: 11, color: muted }}>$50k</span>
          </div>
        </div>
        <div>
          <p style={{ fontSize: 12, color: muted, margin: "0 0 8px" }}>
            {"Number of subscribers"}
          </p>
          <input type="range" min={5} max={500} step={5} value={subs}
            onChange={e => setSubs(Number(e.target.value))} aria-label="Number of subscribers" style={sliderStyle} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: muted }}>5</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: text }}>{subs}</span>
            <span style={{ fontSize: 11, color: muted }}>500</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }} className="ao-grid-3">
        <div style={cardStyle}>
          <p style={{ fontSize: 10, fontWeight: 700, color: muted, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>
            {"Traditional processors"}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: text, margin: "0 0 4px", fontFamily: "'DM Mono', monospace" }}>{fmt(traditional)}</p>
          <p style={{ fontSize: 11, color: muted, margin: "0 0 8px" }}>{"per month"}</p>
          <p style={{ fontSize: 11, color: muted, margin: 0 }}>{fmt(traditional * 12)}/{"yr"}</p>
        </div>
        <div style={{ ...cardStyle, border: `0.5px solid rgba(52,211,153,0.4)` }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>AuthOnce</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: accent, margin: "0 0 4px", fontFamily: "'DM Mono', monospace" }}>{fmt(authonce)}</p>
          <p style={{ fontSize: 11, color: muted, margin: "0 0 8px" }}>{"per month"}</p>
          <p style={{ fontSize: 11, color: muted, margin: 0 }}>{fmt(authonce * 12)}/{"yr"}</p>
        </div>
        <div style={{ ...cardStyle, background: isDark ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.06)", border: `0.5px solid rgba(52,211,153,0.3)` }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>
            {"You save"}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#34d399", margin: "0 0 4px", fontFamily: "'DM Mono', monospace" }}>{fmt(saving)}</p>
          <p style={{ fontSize: 11, color: muted, margin: "0 0 8px" }}>{pct}% {"less in fees"}</p>
          <p style={{ fontSize: 11, color: "#34d399", fontWeight: 600, margin: 0 }}>{fmt(saving * 12)}/{"yr saved"}</p>
        </div>
      </div>
      <p style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 16 }}>
        {"Traditional processors: 2.9% + $0.30/txn industry standard. AuthOnce: 0.5% flat. Testnet only — not financial advice."}
      </p>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage({ onLaunchApp, isDark, onToggleTheme }) {
  const bg      = isDark ? "#0a0f1a"                : "#ffffff";
  const heroBg  = isDark ? "#080c14"                : "#f8fafc";
  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9"                : "#0f172a";
  const muted   = isDark ? "#94a3b8"                : "#374151";
  const accent  = "#34d399";
  const blue    = "#3b82f6";
  const purple  = "#a78bfa";
  const amber   = "#fbbf24";

  const scrollToApply = () => {
    document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
  };

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif" }}>
      <Helmet>
        <link rel="canonical" href={"https://authonce.io"} />
      </Helmet>
      <style>{`
        @media (max-width: 768px) {
          .ao-hero-content { padding: 80px 24px 60px !important; }
          .ao-hero-row { flex-direction: column !important; }
          .ao-dashboard-grid { grid-template-columns: 1fr !important; }
          .ao-hero-h1 { font-size: clamp(36px, 9vw, 60px) !important; }
          .ao-section { padding: 56px 24px !important; }
          .ao-grid-3 { grid-template-columns: 1fr !important; }
          .ao-grid-4 { grid-template-columns: 1fr 1fr !important; }
          .ao-founding-grid { grid-template-columns: 1fr !important; }
          .ao-form-row { grid-template-columns: 1fr !important; }
          .ao-footer-inner { flex-direction: column !important; align-items: flex-start !important; }
          .ao-mgmt-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .ao-grid-4 { grid-template-columns: 1fr !important; }
          .ao-hero-btns { flex-direction: column !important; align-items: stretch !important; }
          .ao-mgmt-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes float-up {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .ao-fade-in   { animation: float-up 0.7s ease forwards; }
        .ao-fade-in-2 { animation: float-up 0.7s 0.15s ease forwards; opacity: 0; }
        .ao-fade-in-3 { animation: float-up 0.7s 0.3s ease forwards; opacity: 0; }
        .ao-fade-in-4 { animation: float-up 0.7s 0.45s ease forwards; opacity: 0; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: 56,
        borderBottom: `0.5px solid ${border}`,
        background: isDark ? "rgba(8,12,20,0.96)" : "rgba(255,255,255,0.96)",
        backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: text, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: accent }}>Once</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

          {/* Menu dropdown — replaces separate Pricing / How it works / Blog links */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 500, color: muted, padding: "6px 4px",
              }}
            >
              {"Menu"}
              <i className="ti ti-chevron-down" style={{ fontSize: 14, transition: "transform 0.15s", transform: menuOpen ? "rotate(180deg)" : "none" }} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0,
                background: isDark ? "#0f1520" : "#ffffff",
                border: `0.5px solid ${border}`, borderRadius: 10,
                boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.4)" : "0 8px 24px rgba(0,0,0,0.12)",
                padding: 6, minWidth: 160, zIndex: 200,
              }}>
                {[
                  { label: "Pricing", href: "/pricing" },
                  { label: "How it works", href: "#how-it-works" },
                  { label: "Blog", href: "https://blog.authonce.io" },
                ].map(item => (
                  <a key={item.label} href={item.href} style={{
                    display: "block", padding: "8px 12px", borderRadius: 6,
                    fontSize: 13, fontWeight: 500, color: text, textDecoration: "none",
                  }}>
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <button onClick={onToggleTheme} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 14,
          }}>{isDark ? "☀️" : "🌙"}</button>
          <button onClick={scrollToApply} style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            border: "none", borderRadius: 8, padding: "9px 20px",
            color: "#080c14", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {"Apply Today →"}
          </button>
          <button onClick={onLaunchApp} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 8, padding: "9px 16px",
            color: text, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {"Launch App →"}
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        background: heroBg, padding: "44px 40px 60px", textAlign: "center",
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          <p className="ao-fade-in" style={{
            fontSize: "clamp(17px, 2.2vw, 21px)", fontWeight: 700, color: text,
            lineHeight: 1.5, margin: "0 0 28px", maxWidth: 640, marginLeft: "auto", marginRight: "auto",
          }}>
            {<>Built for <span style={{ color: accent }}>SaaS companies, DAOs, and Web3 businesses</span> that already get paid in stablecoins.</>}
          </p>

          <h1 className="ao-hero-h1 ao-fade-in-2" style={{
            fontSize: "clamp(36px, 5vw, 62px)", fontWeight: 800,
            color: text, lineHeight: 1.1, letterSpacing: "-0.035em", margin: "0 0 32px",
          }}>
            {<>{"Your subscribers pay on time."}<br/>
              <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {"Every cycle. Automatically."}
              </span><br/>
              <span style={{ color: muted, fontSize: "clamp(24px, 3.5vw, 40px)" }}>
                {"Without you lifting a finger."}
              </span></>}
          </h1>

        </div>

        {/* Billing cycle diagram — the "who it's for" statement now lives above the headline instead of here */}
        <div className="ao-fade-in-2" style={{
          display: "flex", justifyContent: "center", margin: "0 0 32px",
        }}>
          <div style={{ position: "relative", width: 200, height: 200, flexShrink: 0 }}>
            <svg viewBox="-20 -20 240 240" style={{ width: "100%", height: "100%", overflow: "visible" }}>
              <defs>
                <linearGradient id="cycleGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r="78" fill="none" stroke={border} strokeWidth="1.5" />
              <path d="M 100 22 A 78 78 0 0 1 163 128" fill="none" stroke="url(#cycleGrad)" strokeWidth="3" strokeLinecap="round" />
              <circle cx="100" cy="22" r="6" fill="url(#cycleGrad)" />
              <circle cx="163" cy="128" r="6" fill="none" stroke="url(#cycleGrad)" strokeWidth="2" />
              <circle cx="37" cy="128" r="6" fill="none" stroke="url(#cycleGrad)" strokeWidth="2" />
              <text x="100" y="10" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>authorise</text>
              <text x="163" y="150" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>day 30</text>
              <text x="37" y="150" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>day 60</text>
            </svg>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
              <div style={{
                display: "inline-block", background: "rgba(52,211,153,0.12)", color: "#0d9963",
                fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99, marginBottom: 6,
              }}>
                {"0.5% flat fee"}
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, color: text }}>$0.005</div>
              <div style={{ fontSize: 11, color: muted }}>{"per $1 collected"}</div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>

          {/* Subheadline */}
          <p className="ao-fade-in-3" style={{ fontSize: 19, color: text, maxWidth: 620, margin: "0 auto 28px", lineHeight: 1.6, fontWeight: 600 }}>
            {<>Subscribers authorise AuthOnce to pull USDC from their wallet — automatically, every billing cycle, <span style={{ color: accent }}>straight to yours</span>. Full merchant suite included.</>}
          </p>

          {/* Pain point cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28, textAlign: "center" }} className="ao-grid-3">
            {[
              { icon: "ti-building-store", title: "No intermediary", sub: "Funds move wallet to wallet. No platform holds your money." },
              { icon: "ti-lock", title: "No custody risk", sub: "Subscribers keep control of their wallet at all times." },
              { icon: "ti-trending-down", title: "No churn from failed payments", sub: "Grace periods and auto-retry recover payments automatically." },
              { icon: "ti-robot", title: "Built for AI agents too", sub: "ERC-1271 smart wallets can subscribe — no card needed, wallet signs each cycle." },
            ].map(({ icon, title, sub }) => (
              <div key={title} style={{
                padding: 24, borderRadius: 14,
                background: isDark ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.07)",
                border: `0.5px solid rgba(52,211,153,0.3)`,
              }}>
                <i className={`ti ${icon}`} style={{ fontSize: 32, color: accent, display: "block", marginBottom: 14 }} aria-hidden="true" />
                <p style={{ fontSize: 19, fontWeight: 800, color: text, margin: "0 0 10px", lineHeight: 1.2 }}>{title}</p>
                <p style={{ fontSize: 14, color: muted, margin: 0, lineHeight: 1.6 }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Badges */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "9px 22px", borderRadius: 99,
                background: isDark ? "rgba(52,211,153,0.12)" : "rgba(52,211,153,0.1)",
                border: `0.5px solid rgba(52,211,153,0.35)`,
                fontSize: 14, fontWeight: 600, color: isDark ? accent : "#0d9963",
              }}>
                <i className="ti ti-layout-dashboard" style={{ fontSize: 17 }} aria-hidden="true" />
                {"Full merchant suite"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {[
                { icon: "ti-lock", label: "Subscribers keep custody" },
                { icon: "ti-refresh", label: "Auto-retry + grace period" },
                { icon: "ti-coin", label: "0.5% flat, nothing else" },
                { icon: "ti-robot", label: "AI agent ready" },
              ].map(({ icon, label }) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 99,
                  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                  border: `0.5px solid ${border}`, fontSize: 12, color: muted,
                }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 14, color: accent }} aria-hidden="true" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Real dashboard proof — actual Base Sepolia testnet data, clearly labelled */}
          <div className="ao-fade-in-3" style={{ marginBottom: 32 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              border: `0.5px solid ${border}`, borderRadius: 99,
              padding: "5px 16px", marginBottom: 16, fontSize: 12, fontWeight: 600, color: muted,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, display: "inline-block" }} />
              {"Real merchant dashboard — Base Sepolia testnet, live data"}
            </div>

            <div className="ao-dashboard-grid" style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, textAlign: "left",
            }}>
              {[
                { src: "/dashboard-overview.png", label: "Overview — MRR, churn, active subs" },
                { src: "/dashboard-detail.png", label: "Subscriber breakdown + recent activity" },
              ].map(({ src, label }) => (
                <div key={src} style={{
                  borderRadius: 14, overflow: "hidden",
                  border: `0.5px solid ${border}`,
                  boxShadow: isDark ? "0 12px 32px rgba(0,0,0,0.4)" : "0 12px 32px rgba(0,0,0,0.08)",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "9px 12px", background: isDark ? "#12181f" : "#f1f3f5",
                    borderBottom: `0.5px solid ${border}`,
                  }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff5f57" }} />
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#febc2e" }} />
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#28c840" }} />
                    <span style={{ fontSize: 11, color: muted, marginLeft: 8, fontFamily: "'DM Mono', monospace" }}>
                      app.authonce.io/dashboard
                    </span>
                  </div>
                  <img src={src} alt={label} style={{ width: "100%", display: "block" }} />
                  <div style={{ padding: "10px 14px", fontSize: 12, color: muted, background: isDark ? "#0d1117" : "#fafafa" }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className="ao-hero-btns ao-fade-in-4" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
            <button onClick={scrollToApply} style={{
              background: "linear-gradient(135deg, #34d399, #3b82f6)",
              border: "none", borderRadius: 12, padding: "15px 34px",
              color: "#080c14", fontSize: 15, fontWeight: 800, cursor: "pointer", letterSpacing: "-0.01em",
            }}>
              {"Apply as founding merchant →"}
            </button>
            <a href="#how-it-works" style={{
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              border: `0.5px solid ${border}`, borderRadius: 12, padding: "15px 26px",
              color: text, fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center",
            }}>
              {"See how it works"}
            </a>
          </div>

          {/* Status facts — real, verifiable claims only. No traction numbers until real merchants exist. */}
          <div style={{ borderTop: `0.5px solid ${border}`, paddingTop: 24 }}>
            <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
              {[
                { val: "Live", label: "on Base Sepolia testnet" },
                { val: "Sep 2026", label: "targeted mainnet launch" },
                { val: "Verified", label: "contracts on Basescan", href: `https://sepolia.basescan.org/address/${VAULT_ADDRESS}` },
              ].map(({ val, label, href }, i, arr) => {
                const content = (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 26, fontWeight: 700, color: href ? accent : text, margin: 0, fontFamily: "'DM Mono', monospace" }}>{val}</p>
                    <p style={{ fontSize: 11, color: muted, margin: "4px 0 0", textDecoration: href ? "underline" : "none" }}>{label}</p>
                  </div>
                );
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 32 }}>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                        {content}
                      </a>
                    ) : content}
                    {i < arr.length - 1 && <div style={{ width: "0.5px", height: 36, background: border }} />}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </section>

      {/* ── Trust Bar ── */}
      <div style={{
        borderBottom: `0.5px solid ${border}`, padding: "14px 40px",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
        overflowX: "auto",
      }}>
        <div style={{ display: "flex", gap: 32, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          {[
            "🔵 Base Network",
            "💵 USDC · EURC",
            "🔐 " + ("Non-custodial"),
            "⏳ " + ("Audit Q3 2026"),
            "🤖 ERC-1271 · EIP-712",
            "📄 BUSL-1.1",
          ].map((item, i, arr) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: muted, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{item}</span>
              {i < arr.length - 1 && <span style={{ fontSize: 10, color: border, marginLeft: 8 }}>·</span>}
            </span>
          ))}
        </div>
      </div>

      {/* ── What is AuthOnce ── */}
      <section style={{
        borderBottom: `0.5px solid ${border}`, padding: "52px 40px",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.025)",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 16, textTransform: "uppercase" }}>
            {"What is AuthOnce"}
          </p>
          <p style={{ fontSize: 18, color: text, lineHeight: 1.8, margin: 0, fontWeight: 300 }}>
            {"AuthOnce is a non-custodial subscription protocol built on Base Network. Subscribers authorise AuthOnce to pull payment on schedule — their tokens stay in their own wallet until each transfer. Merchants receive funds directly. No intermediary. Everything is on-chain, auditable, and permissionless."}
          </p>
        </div>
      </section>

      {/* ── Built for Web3 ── */}
      <section className="ao-section" style={{ borderBottom: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {"Built for Web3"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em" }}>
              {"The first recurring payment protocol on Base Network."}
            </h2>
            <p style={{ fontSize: 16, color: muted, maxWidth: 540, margin: "0 auto", lineHeight: 1.7, fontWeight: 300 }}>
              {"Not a wrapper. Not a bridge. A native on-chain protocol built for crypto-native merchants — subscribers can be people or AI agents."}
            </p>
          </div>
          <div className="ao-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              {
                icon: "🔵", color: blue, tag: "Base Network",
                title: "On-chain by design",
                desc: "Every subscription lives on Base. Auditable, autonomous, transparent. No database or central server controls your recurring revenue.",
                detail: "SubscriptionVault · MerchantRegistry · Audit Q3 2026",
              },
              {
                icon: "🤖", color: purple, tag: "AI Agent Ready",
                title: "Subscribers can be AI agents too",
                desc: "Smart wallets subscribe via ERC-1271. Each billing cycle needs a wallet-issued signature — session-key wallets can automate this without a human in the loop.",
                detail: "ERC-1271 · EIP-712 · Per-cycle signature",
              },
              {
                icon: "🔐", color: accent, tag: "Non-custodial",
                title: "Your keys. Your funds. Always.",
                desc: "AuthOnce never holds your funds. Subscribers hold their own tokens — pulled on schedule, never over-funded. The protocol is smart contracts, not a bank.",
                detail: "No custody · No FINMA licence · BUSL-1.1",
              },
            ].map((card, i) => (
              <div key={i} style={{
                background: cardBg, border: `0.5px solid ${border}`,
                borderRadius: 20, padding: 32,
                display: "flex", flexDirection: "column", gap: 14,
                position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: `linear-gradient(90deg, transparent, ${card.color}55, transparent)`,
                }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{card.icon}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: card.color,
                    background: `${card.color}18`, border: `0.5px solid ${card.color}44`,
                    borderRadius: 99, padding: "3px 10px",
                    letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>{card.tag}</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{card.title}</h3>
                <p style={{ fontSize: 13, color: muted, lineHeight: 1.7, margin: 0, fontWeight: 300, flexGrow: 1 }}>{card.desc}</p>
                <div style={{
                  background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)",
                  borderRadius: 6, padding: "8px 12px",
                  fontSize: 10, color: card.color, fontFamily: "'DM Mono', monospace",
                }}>{card.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Full Subscription Management ── */}
      <section className="ao-section" style={{ borderBottom: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="ao-founding-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
                {"Subscription Management"}
              </p>
              <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {"Not just payments. A complete subscription layer."}
              </h2>
              <p style={{ fontSize: 16, color: muted, lineHeight: 1.7, margin: "0 0 28px", fontWeight: 300 }}>
                {"AuthOnce gives merchants a full dashboard to manage every aspect of their recurring revenue — from trial periods and grace periods to dunning, webhooks, and tax exports."}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { icon: "📊", title: "Merchant dashboard", desc: "Full visibility on all subscriptions, revenue, and subscriber status in real time." },
                  { icon: "🔔", title: "Automated notifications", desc: "Subscribers notified 3 days before each payment. Payment failed alerts and grace period warnings." },
                  { icon: "🔄", title: "Dunning & grace periods", desc: "Configurable 1–30 day grace periods with automatic daily retry logic. Recover failed payments before they churn." },
                  { icon: "📁", title: "Tax exports & webhooks", desc: "XLSX tax reports ready for your accountant. HMAC-signed webhooks for your backend systems." },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <span style={{
                      fontSize: 18, width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                      background: isDark ? "rgba(52,211,153,0.08)" : "rgba(52,211,153,0.08)",
                      border: `0.5px solid rgba(52,211,153,0.2)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 3 }}>{item.title}</div>
                      <div style={{ fontSize: 13, color: muted, lineHeight: 1.5, fontWeight: 300 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ao-mgmt-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { icon: "⏱", label: "Trial periods",       sub: "Up to 90 days",       color: blue   },
                { icon: "💰", label: "Intro pricing",      sub: "Up to 12 pulls",  color: accent },
                { icon: "⚙️", label: "Grace periods",       sub: "1–30 " + ("days"),             color: purple },
                { icon: "🌍", label: "15 currencies",               sub: "EUR · USD · GBP · CHF…",                                color: amber  },
                { icon: "🔗", label: "Webhooks",                                                      sub: "HMAC signed",    color: blue   },
                { icon: "📧", label: "Branded emails",        sub: "Growth+ tier",     color: accent },
                { icon: "🏷",  label: "Custom sender",       sub: "Business+ tier",   color: purple },
                { icon: "📤", label: "Price changes",     sub: "30-day notice",  color: amber  },
                { icon: "🤖", label: "AI agent ready",          sub: "ERC-1271, per-cycle sig",                               color: purple },
              ].map((item, i) => (
                <div key={i} style={{
                  background: cardBg, border: `0.5px solid ${border}`,
                  borderRadius: 12, padding: "16px 18px",
                }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{item.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: item.color, fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Multi-token strip ── */}
      <section style={{
        borderBottom: `0.5px solid ${border}`, padding: "36px 40px",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap", justifyContent: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: muted, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0, whiteSpace: "nowrap" }}>
            {"Accepted tokens"}
          </p>
          {[
            { symbol: "USDC", color: "#2775CA", desc: "USD Coin" },
            { symbol: "EURC", color: "#2B79D3", desc: "Euro Coin" },
          ].map((token, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: `${token.color}22`, border: `1.5px solid ${token.color}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: token.color,
                fontFamily: "'DM Mono', monospace",
              }}>{token.symbol.slice(0, 1)}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{token.symbol}</div>
                <div style={{ fontSize: 11, color: muted }}>{token.desc}</div>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: muted, fontStyle: "italic", marginLeft: "auto" }}>
            {"All on Base Network · More tokens coming"}
          </p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="ao-section" style={{ maxWidth: 960, margin: "0 auto", padding: "80px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
            {"How it works"}
          </p>
          <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
            {"Four steps to your first payment"}
          </h2>
        </div>
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 20, overflow: "hidden" }}>
          <div className="ao-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[
              { n: "01", title: "Apply",       sub: "Submit your business details",     note: "Wallet optional", c: "#1D9E75" },
              { n: "02", title: "Get approved",   sub: "We review and whitelist you",  note: "Within 48 hours",        c: "#1D9E75" },
              { n: "03", title: "Share your link",      sub: "authonce.io/pay/yourname", note: "No website needed",        c: "#1D9E75" },
              { n: "04", title: "Get paid",        sub: "Settled in stablecoins",   note: "Every billing cycle",      c: "#BA7517" },
            ].map((s, i) => (
              <div key={i} style={{
                padding: "32px 20px", textAlign: "center",
                borderRight: i < 3 ? `0.5px solid ${border}` : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: s.c, letterSpacing: "0.12em", fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>{s.n}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: text, marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: muted, marginBottom: 4 }}>{s.sub}</div>
                <div style={{ fontSize: 11, color: muted, opacity: 0.6 }}>{s.note}</div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ textAlign: "center", color: muted, fontSize: 13, marginTop: 20, fontStyle: "italic", fontWeight: 300 }}>
          {"Founding merchants are approved personally by the AuthOnce team within 48 hours."}
        </p>
      </section>

      {/* ── Founding Offer ── */}
      <section className="ao-section" style={{ maxWidth: 960, margin: "0 auto", padding: "0 40px 80px" }}>
        <div className="ao-founding-grid" style={{
          background: isDark ? "rgba(251,191,36,0.06)" : "rgba(251,191,36,0.04)",
          border: "0.5px solid rgba(251,191,36,0.25)",
          borderRadius: 24, padding: "52px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center",
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: amber, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {"Founding merchant offer"}
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {"First 10 merchants pay zero fees for 3 months. First 5 get Growth tier free for 12 months."}
            </h2>
            <p style={{ color: muted, fontSize: 15, lineHeight: 1.7, margin: "0 0 28px", fontWeight: 300 }}>
              {"Standard protocol fee is 0.5% per transaction. No monthly fee. No setup fee. No contract. Founding merchants get 0% for their first 3 months plus Growth tier free for 12 months."}
            </p>
            <div style={{ display: "flex", gap: 32 }}>
              {[
                { v: "0%",  l: "Fees · 3 months" },
                { v: "10",  l: "Spots total" },
                { v: "48h", l: "Review time" },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: amber, fontFamily: "'DM Mono', monospace" }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 14, padding: 28 }}>
            {[
              { label: "Months 1–3",        value: "0%",                               color: amber  },
              { label: "Month 4+",           value: "0.5%",                             color: muted  },
              { label: "Monthly fee",      value: "None", color: accent },
              { label: "Setup fee",           value: "None", color: accent },
              { label: "Contract",         value: "None",  color: accent },
              { label: "Growth (12 months)", value: "Free",  color: amber  },
            ].map((row, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "11px 0", borderBottom: i < 5 ? `0.5px solid ${border}` : "none",
              }}>
                <span style={{ fontSize: 13, color: muted }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: row.color, fontFamily: "'DM Mono', monospace" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product Creator ── */}
      <section className="ao-section" style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {"Try it now"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {"Build your first product in 30 seconds."}
            </h2>
            <p style={{ fontSize: 15, color: muted, margin: 0, fontWeight: 300 }}>
              {"See exactly what your subscribers will see before you apply."}
            </p>
          </div>
          <ProductCreator isDark={isDark} border={border} cardBg={cardBg} text={text} muted={muted} accent={accent} />
        </div>
      </section>

      {/* ── Integration Paths ── */}
      <section className="ao-section" style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {"Integration"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
              {"Three ways to get started"}
            </h2>
          </div>
          <div className="ao-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              {
                tag: "No code", tagColor: accent,
                title: "Hosted Pay Link",
                desc: "Get a unique URL to share anywhere. No website, no code, no setup. Start accepting subscriptions in minutes.",
                time: "Ready in 5 minutes",
                example: "authonce.io/pay/yourname",
              },
              {
                tag: "Coming Soon", tagColor: blue,
                title: "Embeddable Widget",
                desc: "One line of code adds a Subscribe button to your existing site. Works on any platform.",
                time: "Ready in 30 minutes",
                example: '<SubscribeButton merchantId="0x..." />',
              },
              {
                tag: "API", tagColor: purple,
                title: "Developer API + Webhooks",
                desc: "Full REST API, webhooks, and AI agent support. ERC-1271 native — smart wallets subscribe and sign each cycle's payment.",
                time: "Live on Base Sepolia",
                example: "POST /api/subscriptions/link",
              },
            ].map((card, i) => (
              <div key={i} style={{
                background: cardBg, border: `0.5px solid ${border}`,
                borderRadius: 16, padding: 28,
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: card.tagColor,
                  background: `${card.tagColor}18`, border: `0.5px solid ${card.tagColor}44`,
                  borderRadius: 99, padding: "3px 10px", alignSelf: "flex-start",
                }}>{card.tag}</span>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.01em" }}>{card.title}</h3>
                <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, margin: 0, fontWeight: 300, flexGrow: 1 }}>{card.desc}</p>
                <div style={{
                  background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)",
                  borderRadius: 6, padding: "8px 12px",
                  fontSize: 11, color: muted, fontFamily: "'DM Mono', monospace",
                }}>{card.example}</div>
                {/* Full code snippet for API card only */}
                {i === 2 && (
                  <div style={{
                    background: isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.06)",
                    borderRadius: 8, padding: "14px 16px",
                    fontSize: 11, color: isDark ? "#94a3b8" : "#475569",
                    fontFamily: "'DM Mono', monospace", lineHeight: 1.8,
                    whiteSpace: "pre",
                    overflowX: "auto",
                  }}>{`// Subscribe an AI agent or user
const res = await fetch(
  "https://api.authonce.io/subscriptions/link",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Merchant-Key": "<your_api_key>"
    },
    body: JSON.stringify({
      tx_hash: "0x...",
      product_slug: "pro-plan",
      subscriber_webhook_url:
        "https://your-agent.com/hooks"
    })
  }
);`}</div>
                )}
                <div style={{ fontSize: 11, color: card.tagColor, fontWeight: 600 }}>{card.time}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROI Calculator ── */}
      <section className="ao-section" style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {"Fee calculator"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {"How much are you leaving on the table?"}
            </h2>
            <p style={{ fontSize: 15, color: muted, margin: 0, fontWeight: 300 }}>
              {"Traditional payment processors charge 2.9% + $0.30 per transaction. AuthOnce charges 0.5% flat."}
            </p>
          </div>

          <ROICalculator isDark={isDark} accent={accent} border={border} cardBg={cardBg} text={text} muted={muted} />
        </div>
      </section>

      {/* ── Objection handling — real questions a skeptical merchant has before trusting a new billing rail ── */}
      <section className="ao-section" style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {"Before you switch"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {"The questions you're actually asking"}
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              {
                q: "What happens if a customer's payment fails?",
                a: "Their subscription enters a grace period (1–30 days, you choose) with automatic daily retries. Nothing is cancelled immediately — most failures are temporary (low balance, momentary issue) and resolve on their own before the grace period ends.",
              },
              {
                q: "Can I change my pricing later?",
                a: "Yes. Price changes require 30 days' notice, enforced on-chain — existing subscribers can't be surprised by a sudden increase. New pricing applies from their next billing cycle after the notice period.",
              },
              {
                q: "Can I get my money out whenever I want?",
                a: "Yes — funds are paid directly to your own wallet on every billing cycle. AuthOnce never holds your revenue at any point, so there's nothing to withdraw or wait on. It's already yours the moment the pull completes.",
              },
              {
                q: "What if AuthOnce disappears or gets hacked?",
                a: "Because the protocol never custodies funds, there's no pool of money to lose — each pull moves directly from subscriber to merchant. The contracts are open and verified on Basescan; a third-party audit is planned ahead of mainnet, pending funding.",
              },
              {
                q: "Is this actually live, or still just an idea?",
                a: "Live and running on Base Sepolia testnet today — the dashboard screenshots above are real, not mocked up. Mainnet is targeted for September 2026, pending the security audit.",
              },
            ].map(({ q, a }, i) => (
              <div key={i} style={{
                padding: "20px 24px", borderRadius: 12,
                background: cardBg, border: `0.5px solid ${border}`,
              }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: text, margin: "0 0 8px" }}>{q}</p>
                <p style={{ fontSize: 14, color: muted, margin: 0, lineHeight: 1.7, fontWeight: 300 }}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Founding Merchants + Apply Form (merged) ── */}
      <section id="apply" style={{
        borderTop: `0.5px solid ${isDark ? "rgba(52,211,153,0.1)" : "rgba(52,211,153,0.15)"}`,
        padding: "80px 40px",
        background: isDark ? "rgba(52,211,153,0.03)" : "rgba(52,211,153,0.04)",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              border: `0.5px solid rgba(52,211,153,0.4)`,
              borderRadius: 99, padding: "6px 18px", marginBottom: 16,
              fontSize: 12, fontWeight: 600, color: isDark ? accent : "#0d9963",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, display: "inline-block", animation: "pulse-dot 2s infinite" }}/>
              {"First 10 get 0% fees for 3 months · First 5 get Growth free for 12 months"}
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {"Founding Merchants"}
            </p>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: text, letterSpacing: "-0.03em", marginBottom: 14, lineHeight: 1.2 }}>
              {"Be one of the first 10 merchants on AuthOnce."}
            </h2>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.7, margin: 0, fontWeight: 300 }}>
              {"Founding merchants get Growth tier free for 12 months (€49/month value), direct access to the founder, and input on the product roadmap."}
            </p>
          </div>

          {/* First 5 spotlight */}
          <div style={{
            background: isDark ? "rgba(52,211,153,0.07)" : "rgba(52,211,153,0.08)",
            border: `1.5px solid rgba(52,211,153,0.35)`,
            borderRadius: 16, padding: "20px 24px", marginBottom: 14,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#34d399",
                background: "rgba(52,211,153,0.15)", border: "0.5px solid rgba(52,211,153,0.4)",
                borderRadius: 99, padding: "3px 10px", letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                {"First 5 merchants only"}
              </span>
              <span style={{ fontSize: 12, color: isDark ? "#34d399" : "#0f6e56", fontWeight: 600 }}>
                {"Most exclusive tier"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { icon: "🎁", title: "Growth tier free for 12 months", sub: "€49/month value" },
                { icon: "✉️", title: "Direct founder access", sub: "WhatsApp / email line" },
                { icon: "🗺️", title: "Roadmap input", sub: "Shape the product" },
                { icon: "🏅", title: "Founding merchant badge", sub: "Permanent recognition" },
              ].map(({ icon, title, sub }) => (
                <div key={title} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: text, margin: "0 0 2px" }}>{title}</p>
                    <p style={{ fontSize: 11, color: muted, margin: 0 }}>{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Next 5 */}
          <div style={{
            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
            border: `0.5px solid ${border}`,
            borderRadius: 16, padding: "14px 24px", marginBottom: 32,
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: muted,
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                borderRadius: 99, padding: "3px 10px", letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                {"Merchants 6–10"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { icon: "💸", text: "0% fees for 3 months" },
                { icon: "✉️", text: "Direct founder access" },
                { icon: "🏅", text: "Founding badge" },
              ].map(({ icon, text: t }) => (
                <span key={t} style={{ fontSize: 12, color: muted, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 13 }}>{icon}</span> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Form */}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 20, padding: 36 }}>
            <ApplyForm isDark={isDark} />
          </div>

          <p style={{ fontSize: 12, color: isDark ? "#64748b" : "#6b7280", textAlign: "center", marginTop: 20 }}>
            {"10 spots available · Mainnet launch September 2026"}
          </p>
        </div>
      </section>

      {/* ── Roadmap ── */}
      <section className="ao-section" style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {"Roadmap"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {"Built in the open. Launching Q3 2026."}
            </h2>
          </div>

          {[
            {
              phase: "Foundation — completed",
              color: "#34d399",
              items: [
                { done: true,  label: "Smart contracts on Base Sepolia", detail: "SubscriptionVault · MerchantRegistry · EIP-2612 · ERC-1271" },
                { done: true,  label: "Keeper bot — automated pulls", detail: "12 successful pulls, verified on-chain" },
                { done: true,  label: "Merchant dashboard", detail: "Vanity slugs · CSV import · Grace period controls" },
                { done: true,  label: "Single on-chain fee", detail: "0.5% protocol fee, hardcoded in executePull() — no off-chain processor" },
                { done: true,  label: "Marketing site + SEO blog", detail: "authonce.io · blog.authonce.io · 11 articles" },
              ],
            },
            {
              phase: "Q3 2026 — in progress",
              color: "#3b82f6",
              items: [
                { done: false, active: true,  label: "Security audit", detail: "5 proposals received · Seeking audit grant funding" },
                { done: false, active: true,  label: "Partnership outreach", detail: "Web3 SaaS platforms · DAO tooling · Analytics providers" },
                { done: false, active: false, label: "WooCommerce + PrestaShop plugins", detail: "Planned post-audit" },
                { done: false, active: false, label: "Keeper bot v2 — parallel scaling", detail: "25 parallel EOAs · Gelato/Chainlink beyond 50 merchants" },
                { done: false, active: false, label: "Base Mainnet launch — September 2026", detail: "Audit-gated · 10 founding spots" },
              ],
            },
            {
              phase: "Phase 2 — post-mainnet",
              color: "#a78bfa",
              items: [
                { done: false, active: false, label: "Embeddable widget + full API", detail: "Self-serve · No-code checkout · Webhooks" },
                { done: false, active: false, label: "DAO treasury integrations", detail: "Snapshot · Tally · Boardroom · Recurring contributor payments" },

              ],
            },
          ].map((phase, pi) => (
            <div key={pi} style={{ marginBottom: 40 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: phase.color, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
                {phase.phase}
              </p>
              {phase.items.map((item, ii) => (
                <div key={ii} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: item.done ? "rgba(52,211,153,0.15)" : item.active ? "rgba(59,130,246,0.15)" : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                    border: `0.5px solid ${item.done ? "rgba(52,211,153,0.4)" : item.active ? "rgba(59,130,246,0.4)" : border}`,
                  }}>
                    <span style={{ fontSize: 11 }}>{item.done ? "✓" : item.active ? "●" : "○"}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: item.done ? text : item.active ? text : muted, margin: "0 0 2px" }}>{item.label}</p>
                    <p style={{ fontSize: 11, color: muted, margin: 0, fontFamily: "'DM Mono', monospace" }}>{item.detail}</p>
                  </div>
                </div>
              ))}
              {pi < 2 && <div style={{ height: "0.5px", background: border, marginTop: 24 }} />}
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `0.5px solid ${border}`, padding: "32px 40px" }}>
        <div className="ao-footer-inner" style={{
          maxWidth: 960, margin: "0 auto",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/logo.svg" alt="AuthOnce" style={{ width: 20, height: 20 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: text }}>
              Auth<span style={{ color: accent }}>Once</span>
            </span>
            <span style={{ fontSize: 11, color: muted, marginLeft: 8 }}>
              {"Recurring payments for Web3."}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { label: "support[at]authonce.io", href: "/contact" },
              { label: "Pricing",             href: "/pricing" },
              { label: "Terms",             href: "/terms" },
              { label: "Privacy",        href: "/privacy" },
              { label: "Refunds",         href: "/legal" },
            ].map((link, i, arr) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <a href={link.href} style={{ fontSize: 12, color: muted, textDecoration: "none" }}>{link.label}</a>
                {i < arr.length - 1 && <span style={{ fontSize: 12, color: isDark ? "#64748b" : "#94a3b8" }}>·</span>}
              </span>
            ))}
            <span style={{ fontSize: 12, color: isDark ? "#64748b" : "#94a3b8" }}>·</span>
            <span style={{ fontSize: 12, color: muted }}>BUSL-1.1</span>
            <span style={{ fontSize: 12, color: isDark ? "#64748b" : "#94a3b8" }}>·</span>
            <span style={{ fontSize: 12, color: muted }}>Base Network</span>
          </div>
        </div>
        <div style={{ maxWidth: 960, margin: "12px auto 0", borderTop: `0.5px solid ${border}`, paddingTop: 12 }}>
          <p style={{ fontSize: 11, color: muted, margin: 0, textAlign: "center" }}>
            {"Testnet only. Smart contracts unaudited. Not financial advice. No uptime guarantees pre-mainnet."}
          </p>
        </div>
      </footer>
    </div>
  );
}
