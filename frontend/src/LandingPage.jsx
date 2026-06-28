// src/LandingPage.jsx — AuthOnce Merchant Landing Page v3
// Light mode default · Dark mode toggle · Full screen hero · Web3 native

import { useState, useEffect, useRef } from "react";

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
function ApplyForm({ lang, isDark }) {
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
          {lang === "en" ? "Application received!" : "Registo recebido!"}
        </h3>
        <p style={{ color: muted, fontSize: 14, margin: 0, fontWeight: 300 }}>
          {lang === "en"
            ? "We'll review your application and get back to you within 48 hours."
            : "Vamos analisar o seu registo e responder em 48 horas."}
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
          <label style={labelStyle}>{lang === "en" ? "Business name" : "Nome da empresa"}</label>
          <input type="text" required value={form.business_name}
            onChange={e => setForm(p => ({ ...p, business_name: e.target.value }))}
            placeholder={lang === "en" ? "Acme Inc." : "Exemplo Lda."}
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === "en" ? "Business email" : "Email profissional"}</label>
          <input type="email" required value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="you@company.com"
            style={inputStyle} />
        </div>
      </div>

      <div className="ao-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>{lang === "en" ? "Wallet address (optional)" : "Endereço de carteira (opcional)"}</label>
          <input type="text" value={form.wallet_address}
            onChange={e => setForm(p => ({ ...p, wallet_address: e.target.value }))}
            placeholder="0x..."
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === "en" ? "Website (optional)" : "Website (opcional)"}</label>
          <input type="url" value={form.website}
            onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
            placeholder="https://yoursite.com"
            style={inputStyle} />
        </div>
      </div>

      <p style={{ fontSize: 11, color: muted, margin: "0 0 16px", lineHeight: 1.6 }}>
        {lang === "en"
          ? <>Use any exchange deposit address — <a href="https://coinbase.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Coinbase</a>, <a href="https://binance.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Binance</a>, <a href="https://kraken.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Kraken</a>, or any other. Stablecoins land directly and you can convert to EUR and withdraw to your bank in two clicks.</>
          : <>Use o endereço de depósito de qualquer exchange — <a href="https://coinbase.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Coinbase</a>, <a href="https://binance.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Binance</a>, <a href="https://kraken.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Kraken</a>, ou qualquer outra. As stablecoins chegam diretamente.</>}
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>{lang === "en" ? "How will you use AuthOnce?" : "Como vai usar o AuthOnce?"}</label>
        <textarea required rows={3} value={form.use_case}
          onChange={e => setForm(p => ({ ...p, use_case: e.target.value }))}
          placeholder={lang === "en"
            ? "Tell us about your business and how you plan to use recurring crypto payments..."
            : "Conte-nos sobre o seu negócio e como planeia usar pagamentos recorrentes em cripto..."}
          style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      {status === "error" && (
        <div style={{
          background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          fontSize: 13, color: "#f87171",
        }}>{message || (lang === "en" ? "Something went wrong. Please try again." : "Algo correu mal. Tente novamente.")}</div>
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
          ? (lang === "en" ? "Submitting…" : "A enviar…")
          : (lang === "en" ? "Apply for founding merchant access →" : "Registar-me como parceiro fundador →")}
      </button>

      <p style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 12, marginBottom: 0 }}>
        {lang === "en"
          ? "We review every application personally. You'll hear from us within 48 hours."
          : "Analisamos cada registo pessoalmente. Responderemos em 48 horas."}
      </p>
    </form>
  );
}

// ─── Product Creator ─────────────────────────────────────────────────────────
function ProductCreator({ lang, isDark, border, cardBg, text, muted, accent }) {
  const [name, setName] = useState("Pro Plan");
  const [price, setPrice] = useState(29);
  const [interval, setInterval] = useState("Monthly");
  const [grace, setGrace] = useState(7);
  const [tokens, setTokens] = useState({ usdc: true, usdt: false, dai: false, eurc: false });
  const [fiats, setFiats] = useState({ card: false, mbway: false, mb: false, ideal: false, bancontact: false, klarna: false });
  const [activeTab, setActiveTab] = useState("crypto");
  const [cardNum, setCardNum] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [introPrice, setIntroPrice] = useState(false);
  const [introCycles, setIntroCycles] = useState(3);
  const [introAmt, setIntroAmt] = useState(9);
  const [yearlyOption, setYearlyOption] = useState(false);
  const [cryptoDiscount, setCryptoDiscount] = useState(false);
  const [discountPct, setDiscountPct] = useState(10);

  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const intervalWord = interval === "Monthly" ? "month" : interval === "Weekly" ? "week" : "year";
  const fiatLabels = { card: "Card", mbway: "MB Way", mb: "Multibanco", ideal: "iDEAL", bancontact: "Bancontact", klarna: "Klarna" };
  const activeTokens = Object.entries(tokens).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  const activeFiats = Object.entries(fiats).filter(([, v]) => v).map(([k]) => fiatLabels[k]);
  const displayPrice = introPrice ? introAmt : price;
  const cryptoPrice = cryptoDiscount ? Math.round(price * (1 - discountPct / 100) * 100) / 100 : price;

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

  const fmtCard = (v) => v.replace(/\D/g, "").substring(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const fmtExp = (v) => { const d = v.replace(/\D/g, "").substring(0, 4); return d.length >= 2 ? d.substring(0, 2) + " / " + d.substring(2) : d; };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }} className="ao-form-row">

      {/* Form */}
      <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 16, padding: 24 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: text, margin: "0 0 16px" }}>{lang === "en" ? "New product" : "Novo produto"}</p>

        <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{lang === "en" ? "Product name" : "Nome do produto"}</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", boxSizing: "border-box", marginBottom: 14 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }} className="ao-form-row">
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{lang === "en" ? "Price ($)" : "Preço ($)"}</label>
            <input type="number" value={price} min={1} onChange={e => setPrice(Number(e.target.value))} style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{lang === "en" ? "Interval" : "Intervalo"}</label>
            <select value={interval} onChange={e => setInterval(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }}>
              <option>{lang === "en" ? "Monthly" : "Mensal"}</option>
              <option>{lang === "en" ? "Weekly" : "Semanal"}</option>
              <option>{lang === "en" ? "Yearly" : "Anual"}</option>
            </select>
          </div>
        </div>
        <p style={{ fontSize: 11, color: muted, margin: "0 0 14px" }}>$1 = 1 USDC = 1 USDT = 1 DAI = 1 EURC</p>

        <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{lang === "en" ? "Grace period (days, 1–30)" : "Período de graça (dias, 1–30)"}</label>
        <input type="number" value={grace} min={1} max={30} onChange={e => setGrace(Number(e.target.value))} style={{ width: "100%", boxSizing: "border-box", marginBottom: 4 }} />
        <p style={{ fontSize: 11, color: muted, margin: "0 0 14px" }}>{lang === "en" ? "Keeper retries daily. Expires if unpaid after this window." : "Keeper reenvio diário. Expira se não pago dentro do prazo."}</p>

        <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>{lang === "en" ? "Crypto tokens" : "Tokens cripto"}</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {Object.keys(tokens).map(k => (
            <label key={k} style={toggleStyle(tokens[k], "crypto")}>
              <input type="checkbox" checked={tokens[k]} onChange={e => setTokens(t => ({ ...t, [k]: e.target.checked }))} style={{ width: 14, height: 14, accentColor: "#34d399" }} />
              {k.toUpperCase()}
            </label>
          ))}
        </div>

        <label style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{lang === "en" ? "Fiat payments" : "Pagamentos fiat"}</label>
        <p style={{ fontSize: 11, color: muted, margin: "0 0 8px" }}>{lang === "en" ? "Requires Stripe connected" : "Requer Stripe conectado"}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {Object.keys(fiats).map(k => (
            <label key={k} style={toggleStyle(fiats[k], "fiat")}>
              <input type="checkbox" checked={fiats[k]} onChange={e => setFiats(f => ({ ...f, [k]: e.target.checked }))} style={{ width: 14, height: 14, accentColor: "#3b82f6" }} />
              {fiatLabels[k]}
            </label>
          ))}
        </div>

        {/* Toggle rows */}
        <div style={{ borderTop: `0.5px solid ${border}`, paddingTop: 4 }}>
          <div style={toggleRowStyle(introPrice)}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: text, margin: "0 0 2px" }}>{lang === "en" ? "Introductory pricing" : "Preço introdutório"}</p>
              <p style={{ fontSize: 11, color: muted, margin: 0 }}>{lang === "en" ? "Lower price for first N cycles" : "Preço reduzido para os primeiros N ciclos"}</p>
            </div>
            <button onClick={() => setIntroPrice(v => !v)} style={switchStyle(introPrice)} aria-label="Toggle introductory pricing">
              <span style={{ position: "absolute", top: 2, left: introPrice ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
          {introPrice && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 0" }}>
              <div>
                <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 4 }}>{lang === "en" ? "Intro price ($)" : "Preço intro ($)"}</label>
                <input type="number" value={introAmt} min={1} onChange={e => setIntroAmt(Number(e.target.value))} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 4 }}>{lang === "en" ? "For N cycles" : "Para N ciclos"}</label>
                <input type="number" value={introCycles} min={1} max={12} onChange={e => setIntroCycles(Number(e.target.value))} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>
          )}

          <div style={toggleRowStyle(yearlyOption)}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: text, margin: "0 0 2px" }}>{lang === "en" ? "Yearly billing option" : "Opção anual"}</p>
              <p style={{ fontSize: 11, color: muted, margin: 0 }}>{lang === "en" ? "Annual plan alongside monthly" : "Plano anual ao lado do mensal"}</p>
            </div>
            <button onClick={() => setYearlyOption(v => !v)} style={switchStyle(yearlyOption)} aria-label="Toggle yearly billing">
              <span style={{ position: "absolute", top: 2, left: yearlyOption ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>

          <div style={{ ...toggleRowStyle(cryptoDiscount), borderBottom: "none" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: text, margin: "0 0 2px" }}>{lang === "en" ? "Crypto discount" : "Desconto cripto"}</p>
              <p style={{ fontSize: 11, color: muted, margin: 0 }}>{lang === "en" ? "Incentivise on-chain payment (0–50%)" : "Incentivar pagamento on-chain (0–50%)"}</p>
            </div>
            <button onClick={() => setCryptoDiscount(v => !v)} style={switchStyle(cryptoDiscount)} aria-label="Toggle crypto discount">
              <span style={{ position: "absolute", top: 2, left: cryptoDiscount ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
          {cryptoDiscount && (
            <div style={{ padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <label style={{ fontSize: 11, color: muted }}>{lang === "en" ? "Discount" : "Desconto"}</label>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#34d399" }}>{discountPct}%</span>
              </div>
              <input type="range" min={0} max={50} step={5} value={discountPct} onChange={e => setDiscountPct(Number(e.target.value))} style={{ width: "100%" }} />
            </div>
          )}
        </div>

        <a href="#apply" style={{
          display: "block", width: "100%", boxSizing: "border-box", padding: "12px", marginTop: 16,
          background: "linear-gradient(135deg, #34d399, #3b82f6)", color: "#080c14",
          border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700,
          textAlign: "center", textDecoration: "none",
        }}>
          {lang === "en" ? "Apply to create this product →" : "Candidatar-me para criar este produto →"}
        </a>
      </div>

      {/* Preview */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }}>{lang === "en" ? "Live pay page preview" : "Pré-visualização ao vivo"}</p>
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
          {introPrice && <p style={{ fontSize: 11, color: "#34d399", margin: "0 0 2px", fontWeight: 600 }}>{lang === "en" ? `Intro price for ${introCycles} cycles` : `Preço intro por ${introCycles} ciclos`}</p>}
          <p style={{ fontSize: 12, color: muted, margin: "0 0 8px" }}>{lang === "en" ? "per" : "por"} {intervalWord}</p>

          {yearlyOption && (
            <div style={{ background: isDark ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12 }}>
              <span style={{ color: "#34d399", fontWeight: 600 }}>{lang === "en" ? "Save ~17% with annual" : "Poupe ~17% com anual"}</span>
              <span style={{ color: muted, marginLeft: 8 }}>${Math.round(price * 10)} / {lang === "en" ? "year" : "ano"}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 0, marginBottom: 14, border: `0.5px solid ${border}`, borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setActiveTab("crypto")} style={{ flex: 1, padding: "8px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: activeTab === "crypto" ? "#34d399" : "transparent", color: activeTab === "crypto" ? "#080c14" : muted }}>
              {lang === "en" ? "Crypto wallet" : "Carteira cripto"}
            </button>
            <button onClick={() => setActiveTab("fiat")} style={{ flex: 1, padding: "8px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", borderLeft: `0.5px solid ${border}`, background: activeTab === "fiat" ? "#3b82f6" : "transparent", color: activeTab === "fiat" ? "#fff" : muted }}>
              {lang === "en" ? "Card / Fiat" : "Cartão / Fiat"}
            </button>
          </div>

          {activeTab === "crypto" && (
            <div>
              {cryptoDiscount && (
                <div style={{ background: "rgba(52,211,153,0.08)", border: "0.5px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12 }}>
                  <span style={{ color: "#34d399", fontWeight: 600 }}>{discountPct}% {lang === "en" ? "crypto discount applied" : "desconto cripto aplicado"}</span>
                  <span style={{ color: muted, marginLeft: 8, textDecoration: "line-through" }}>${price}</span>
                  <span style={{ color: text, fontWeight: 700, marginLeft: 6 }}>${cryptoPrice.toFixed(2)}</span>
                </div>
              )}
              <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: muted, margin: "0 0 6px" }}>{lang === "en" ? "Select token" : "Selecionar token"}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {activeTokens.length === 0 && <span style={{ fontSize: 12, color: muted }}>—</span>}
                  {activeTokens.map((t, i) => (
                    <span key={t} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 99, background: i === 0 ? "#34d399" : "transparent", color: i === 0 ? "#080c14" : muted, border: i === 0 ? "none" : `0.5px solid ${border}`, fontWeight: i === 0 ? 600 : 400, cursor: "pointer" }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: muted }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>{lang === "en" ? "Grace period" : "Período de graça"}</span><span style={{ color: text, fontWeight: 600 }}>{grace} {lang === "en" ? "days" : "dias"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>{lang === "en" ? "Protocol fee" : "Taxa protocolo"}</span><span style={{ color: text, fontWeight: 600 }}>0.5%</span></div>
              </div>
              <button style={{ width: "100%", padding: 11, background: "#34d399", color: "#080c14", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "default" }}>
                {lang === "en" ? "Connect wallet to subscribe →" : "Ligar carteira para subscrever →"}
              </button>
              <p style={{ fontSize: 11, color: muted, textAlign: "center", margin: "6px 0 0" }}>{lang === "en" ? "Non-custodial · Base Network · Authorise once" : "Não custodial · Base Network · Autorizar uma vez"}</p>
            </div>
          )}

          {activeTab === "fiat" && (
            <div>
              <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <p style={{ fontSize: 11, color: muted, margin: "0 0 8px" }}>{lang === "en" ? "Card details" : "Dados do cartão"}</p>
                <input type="text" placeholder="1234 5678 9012 3456" value={cardNum} onChange={e => setCardNum(fmtCard(e.target.value))} style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input type="text" placeholder="MM / YY" value={expiry} onChange={e => setExpiry(fmtExp(e.target.value))} style={{ width: "100%", boxSizing: "border-box", fontFamily: "'DM Mono', monospace" }} />
                  <input type="text" placeholder="CVV" value={cvv} maxLength={4} onChange={e => setCvv(e.target.value.replace(/\D/g, ""))} style={{ width: "100%", boxSizing: "border-box", fontFamily: "'DM Mono', monospace" }} />
                </div>
              </div>
              {activeFiats.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {activeFiats.map(f => <span key={f} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 99, background: "rgba(59,130,246,0.1)", color: "#3b82f6", border: "0.5px solid rgba(59,130,246,0.3)", cursor: "pointer" }}>{f}</span>)}
                </div>
              )}
              <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: muted }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>{lang === "en" ? "Processing fee" : "Taxa processamento"}</span><span style={{ color: text, fontWeight: 600 }}>{lang === "en" ? "Standard card rate" : "Taxa padrão cartão"}</span></div>
              </div>
              <button style={{ width: "100%", padding: 11, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "default" }}>
                {lang === "en" ? `Subscribe $${price}/${intervalWord} →` : `Subscrever $${price}/${intervalWord} →`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ROI Calculator ───────────────────────────────────────────────────────────
function ROICalculator({ lang, isDark, accent, border, cardBg, text, muted }) {
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
            {lang === "en" ? "Monthly recurring revenue" : "Receita mensal recorrente"}
          </p>
          <input type="range" min={500} max={50000} step={500} value={mrr}
            onChange={e => setMrr(Number(e.target.value))} style={sliderStyle} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: muted }}>$500</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: text }}>{fmt(mrr)}</span>
            <span style={{ fontSize: 11, color: muted }}>$50k</span>
          </div>
        </div>
        <div>
          <p style={{ fontSize: 12, color: muted, margin: "0 0 8px" }}>
            {lang === "en" ? "Number of subscribers" : "Número de subscritores"}
          </p>
          <input type="range" min={5} max={500} step={5} value={subs}
            onChange={e => setSubs(Number(e.target.value))} style={sliderStyle} />
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
            {lang === "en" ? "Traditional processors" : "Processadores tradicionais"}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: text, margin: "0 0 4px", fontFamily: "'DM Mono', monospace" }}>{fmt(traditional)}</p>
          <p style={{ fontSize: 11, color: muted, margin: "0 0 8px" }}>{lang === "en" ? "per month" : "por mês"}</p>
          <p style={{ fontSize: 11, color: muted, margin: 0 }}>{fmt(traditional * 12)}/{lang === "en" ? "yr" : "ano"}</p>
        </div>
        <div style={{ ...cardStyle, border: `0.5px solid rgba(52,211,153,0.4)` }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>AuthOnce</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: accent, margin: "0 0 4px", fontFamily: "'DM Mono', monospace" }}>{fmt(authonce)}</p>
          <p style={{ fontSize: 11, color: muted, margin: "0 0 8px" }}>{lang === "en" ? "per month" : "por mês"}</p>
          <p style={{ fontSize: 11, color: muted, margin: 0 }}>{fmt(authonce * 12)}/{lang === "en" ? "yr" : "ano"}</p>
        </div>
        <div style={{ ...cardStyle, background: isDark ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.06)", border: `0.5px solid rgba(52,211,153,0.3)` }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#34d399", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>
            {lang === "en" ? "You save" : "Poupa"}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#34d399", margin: "0 0 4px", fontFamily: "'DM Mono', monospace" }}>{fmt(saving)}</p>
          <p style={{ fontSize: 11, color: muted, margin: "0 0 8px" }}>{pct}% {lang === "en" ? "less in fees" : "menos em taxas"}</p>
          <p style={{ fontSize: 11, color: "#34d399", fontWeight: 600, margin: 0 }}>{fmt(saving * 12)}/{lang === "en" ? "yr saved" : "ano poupado"}</p>
        </div>
      </div>
      <p style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 16 }}>
        {lang === "en"
          ? "Traditional processors: 2.9% + $0.30/txn industry standard. AuthOnce: 0.5% flat. Testnet only — not financial advice."
          : "Processadores tradicionais: padrão do setor 2,9% + $0,30/txn. AuthOnce: 0,5% fixo. Apenas testnet — não é aconselhamento financeiro."}
      </p>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage({ lang, onLaunchApp, isDark, onToggleTheme }) {
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

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif" }}>
      <style>{`
        @media (max-width: 768px) {
          .ao-hero-content { padding: 80px 24px 60px !important; }
          .ao-hero-h1 { font-size: clamp(36px, 9vw, 60px) !important; }
          .ao-section { padding: 56px 24px !important; }
          .ao-grid-3 { grid-template-columns: 1fr !important; }
          .ao-grid-4 { grid-template-columns: 1fr 1fr !important; }
          .ao-founding-grid { grid-template-columns: 1fr !important; }
          .ao-form-row { grid-template-columns: 1fr !important; }
          .ao-footer-inner { flex-direction: column !important; align-items: flex-start !important; }
          .ao-nav-text { display: none !important; }
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
        padding: "0 40px", height: 64,
        borderBottom: `0.5px solid ${border}`,
        background: isDark ? "rgba(8,12,20,0.96)" : "rgba(255,255,255,0.96)",
        backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 17, fontWeight: 700, color: text, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: accent }}>Once</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a className="ao-nav-text" href="/pricing" style={{ fontSize: 13, fontWeight: 500, color: muted, textDecoration: "none" }}>
            {lang === "en" ? "Pricing" : "Preços"}
          </a>
          <a className="ao-nav-text" href="#how-it-works" style={{ fontSize: 13, fontWeight: 500, color: muted, textDecoration: "none" }}>
            {lang === "en" ? "How it works" : "Como funciona"}
          </a>
          <a className="ao-nav-text" href="https://blog.authonce.io" style={{ fontSize: 13, fontWeight: 500, color: muted, textDecoration: "none" }}>
            Blog
          </a>
          <button onClick={() => {
            const target = lang === "en" ? "pt" : "en";
            localStorage.setItem("ao_lang", target);
            window.location.href = target === "pt" ? "/pt" : "/";
          }} style={{
            fontSize: 12, fontWeight: 600, color: muted,
            padding: "4px 10px", borderRadius: 6,
            border: `0.5px solid ${border}`, cursor: "pointer",
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          }}>{lang === "en" ? "PT" : "EN"}</button>
          <button onClick={onToggleTheme} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 14,
          }}>{isDark ? "☀️" : "🌙"}</button>
          <button onClick={scrollToApply} style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            border: "none", borderRadius: 8, padding: "9px 20px",
            color: "#080c14", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {lang === "en" ? "Apply Today →" : "Registar →"}
          </button>
          <button onClick={onLaunchApp} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 8, padding: "9px 16px",
            color: text, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {lang === "en" ? "Launch App →" : "Abrir App →"}
          </button>
        </div>
      </nav>

      {/* ── Testnet Banner ── */}
      <div style={{
        background: isDark ? "rgba(234,179,8,0.08)" : "rgba(234,179,8,0.10)",
        borderBottom: `0.5px solid rgba(234,179,8,0.3)`,
        padding: "10px 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: "#eab308",
            display: "inline-block", flexShrink: 0,
          }}/>
          <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#fde68a" : "#92400e" }}>
            {lang === "en"
              ? "Live on Base Sepolia testnet — no real funds at risk. Mainnet targeted September 2026 following security audit."
              : "Ativo na testnet Base Sepolia — sem fundos reais em risco. Mainnet prevista para setembro 2026 após auditoria de segurança."}
          </span>
        </div>
        <a
          href="https://sepolia.basescan.org/address/0x2ED847da7f88231Ac6907196868adF4840A97f49"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: isDark ? "#93c5fd" : "#1d4ed8", textDecoration: "none", whiteSpace: "nowrap", fontWeight: 500 }}
        >
          {lang === "en" ? "View contracts on Basescan →" : "Ver contratos no Basescan →"}
        </a>
      </div>

      {/* ── HERO ── */}
      <section style={{
        background: heroBg, padding: "80px 40px 60px", textAlign: "center",
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          <div className="ao-fade-in" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            border: `0.5px solid rgba(52,211,153,0.4)`,
            borderRadius: 99, padding: "6px 18px", marginBottom: 28,
            fontSize: 12, fontWeight: 600, color: isDark ? accent : "#0d9963",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, display: "inline-block", animation: "pulse-dot 2s infinite" }}/>
            {lang === "en"
              ? "First 10 get 0% fees for 3 months · First 5 get lifetime Growth free"
              : "Primeiros 10: 0% taxas 3 meses · Primeiros 5: Growth vitalício grátis"}
          </div>

          <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 16px" }}>
            {lang === "en" ? "Non-custodial subscription protocol · Base Network" : "Protocolo de subscrição não custodial · Base Network"}
          </p>

          <h1 className="ao-hero-h1 ao-fade-in-2" style={{
            fontSize: "clamp(36px, 5vw, 62px)", fontWeight: 800,
            color: text, lineHeight: 1.1, letterSpacing: "-0.035em", margin: "0 0 32px",
          }}>
            {lang === "en" ? (
              <>{lang === "en" ? "Your subscribers pay on time." : "Os seus subscritores pagam a tempo."}<br/>
              <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {lang === "en" ? "Every cycle. Automatically." : "Cada ciclo. Automaticamente."}
              </span><br/>
              <span style={{ color: muted, fontSize: "clamp(24px, 3.5vw, 40px)" }}>
                {lang === "en" ? "Without you lifting a finger." : "Sem precisar de fazer nada."}
              </span></>
            ) : (
              <>Os seus subscritores pagam a tempo.<br/>
              <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Cada ciclo. Automaticamente.
              </span><br/>
              <span style={{ color: muted, fontSize: "clamp(24px, 3.5vw, 40px)" }}>
                Sem precisar de fazer nada.
              </span></>
            )}
          </h1>

          {/* Pain point cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28, textAlign: "center" }} className="ao-grid-3">
            {[
              { icon: "ti-building-store", title: lang === "en" ? "No intermediary" : "Sem intermediário", sub: lang === "en" ? "Funds move wallet to wallet. No platform holds your money." : "Fundos movem-se de carteira para carteira. Sem plataforma a segurar o seu dinheiro." },
              { icon: "ti-lock", title: lang === "en" ? "No custody risk" : "Sem risco de custódia", sub: lang === "en" ? "Subscribers keep control of their wallet at all times." : "Os subscritores mantêm o controlo da carteira em todo o momento." },
              { icon: "ti-trending-down", title: lang === "en" ? "No churn from failed payments" : "Sem churn por falha de pagamento", sub: lang === "en" ? "Grace periods and auto-retry recover payments automatically." : "Períodos de graça e reenvio automático recuperam pagamentos." },
              { icon: "ti-credit-card", title: lang === "en" ? "Fiat subscriptions too" : "Subscrições em fiat também", sub: lang === "en" ? "Accept card payments alongside crypto. One dashboard, both worlds." : "Aceite pagamentos por cartão ao lado de crypto. Um painel, dois mundos." },
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

          {/* Subheadline */}
          <p className="ao-fade-in-3" style={{ fontSize: 15, color: muted, maxWidth: 520, margin: "0 auto 20px", lineHeight: 1.7, fontWeight: 300 }}>
            {lang === "en"
              ? "Subscribers authorise once. Our keeper bot pulls USDC directly from their wallet every billing cycle — straight to yours. Full merchant suite included."
              : "Os subscritores autorizam uma vez. O nosso keeper bot cobra USDC diretamente da carteira deles a cada ciclo — direto para a sua. Suite completa de comerciante incluída."}
          </p>

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
                {lang === "en" ? "Full merchant suite" : "Suite completa de comerciante"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {[
                { icon: "ti-lock", label: lang === "en" ? "Subscribers keep custody" : "Subscritores mantêm custódia" },
                { icon: "ti-refresh", label: lang === "en" ? "Auto-retry + grace period" : "Reenvio + período de graça" },
                { icon: "ti-coin", label: lang === "en" ? "0.5% flat, nothing else" : "0,5% fixo, mais nada" },
                { icon: "ti-robot", label: lang === "en" ? "AI agent ready" : "Pronto para agentes IA" },
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

          {/* CTAs */}
          <div className="ao-hero-btns ao-fade-in-4" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
            <button onClick={scrollToApply} style={{
              background: "linear-gradient(135deg, #34d399, #3b82f6)",
              border: "none", borderRadius: 12, padding: "15px 34px",
              color: "#080c14", fontSize: 15, fontWeight: 800, cursor: "pointer", letterSpacing: "-0.01em",
            }}>
              {lang === "en" ? "Apply as founding merchant →" : "Registar como parceiro fundador →"}
            </button>
            <a href="#how-it-works" style={{
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              border: `0.5px solid ${border}`, borderRadius: 12, padding: "15px 26px",
              color: text, fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center",
            }}>
              {lang === "en" ? "See how it works" : "Como funciona"}
            </a>
          </div>

          {/* Metrics */}
          <div style={{ borderTop: `0.5px solid ${border}`, paddingTop: 24 }}>
            <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
              {[
                { val: "653",    label: lang === "en" ? "active subscribers" : "subscritores ativos" },
                { val: "$18,200", label: lang === "en" ? "MRR processed" : "MRR processado" },
                { val: "0%",     label: lang === "en" ? "churn rate" : "taxa de churn" },
                { val: "100%",   label: lang === "en" ? "keeper success rate" : "taxa de sucesso do keeper" },
              ].map(({ val, label }, i, arr) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 32 }}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 26, fontWeight: 700, color: text, margin: 0, fontFamily: "'DM Mono', monospace" }}>{val}</p>
                    <p style={{ fontSize: 11, color: muted, margin: "4px 0 0" }}>{label}</p>
                  </div>
                  {i < arr.length - 1 && <div style={{ width: "0.5px", height: 36, background: border }} />}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: muted, margin: 0, fontStyle: "italic" }}>
              {lang === "en" ? "Illustrative figures — testnet simulation only." : "Valores ilustrativos — apenas simulação testnet."}
            </p>
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
            "💵 USDC · USDT · DAI · EURC",
            "🔐 " + (lang === "en" ? "Non-custodial" : "Não custodial"),
            "⏳ " + (lang === "en" ? "Audit Q3 2026" : "Auditoria Q3 2026"),
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
            {lang === "en" ? "What is AuthOnce" : "O que é o AuthOnce"}
          </p>
          <p style={{ fontSize: 18, color: text, lineHeight: 1.8, margin: 0, fontWeight: 300 }}>
            {lang === "en"
              ? "AuthOnce is a non-custodial subscription protocol built on Base Network. Subscribers authorise a one-time payment intent — their tokens stay in their own wallet and are pulled automatically on schedule. Merchants receive funds directly. No intermediary. Everything is on-chain, auditable, and permissionless."
              : "O AuthOnce é um protocolo de subscrição não custodial construído na Base Network. Os subscritores autorizam uma intenção de pagamento única — os seus tokens ficam na sua própria carteira e são cobrados automaticamente. Os comerciantes recebem os fundos diretamente. Sem intermediários. Tudo é on-chain, auditável e sem permissões."}
          </p>
        </div>
      </section>

      {/* ── Built for Web3 ── */}
      <section className="ao-section" style={{ borderBottom: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Built for Web3" : "Construído para Web3"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em" }}>
              {lang === "en" ? "The first recurring payment protocol on Base Network." : "O primeiro protocolo de pagamentos recorrentes na Base Network."}
            </h2>
            <p style={{ fontSize: 16, color: muted, maxWidth: 540, margin: "0 auto", lineHeight: 1.7, fontWeight: 300 }}>
              {lang === "en"
                ? "Not a wrapper. Not a bridge. A native on-chain protocol designed for crypto-native merchants and autonomous AI agents."
                : "Não é um wrapper. Não é uma bridge. Um protocolo on-chain nativo para comerciantes crypto-nativos e agentes IA autónomos."}
            </p>
          </div>
          <div className="ao-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              {
                icon: "🔵", color: blue, tag: "Base Network",
                title: lang === "en" ? "On-chain by design" : "On-chain por design",
                desc: lang === "en"
                  ? "Every subscription lives on Base. Auditable, autonomous, transparent. No database or central server controls your recurring revenue."
                  : "Cada subscrição existe na Base. Auditável, autónomo, transparente. Nenhum servidor central controla a sua receita recorrente.",
                detail: "SubscriptionVault · MerchantRegistry · Audit Q3 2026",
              },
              {
                icon: "🤖", color: purple, tag: lang === "en" ? "AI Agent Ready" : "Pronto para IA",
                title: lang === "en" ? "The agentic economy needs recurring payments" : "A economia agêntica precisa de pagamentos recorrentes",
                desc: lang === "en"
                  ? "AuthOnce is built for AI agents. ERC-1271 native — autonomous agents can subscribe, authorise, and pay without any human intervention."
                  : "O AuthOnce é construído para agentes IA. ERC-1271 nativo — agentes autónomos podem subscrever, autorizar e pagar sem intervenção humana.",
                detail: "ERC-1271 · EIP-712 · Smart wallet native",
              },
              {
                icon: "🔐", color: accent, tag: lang === "en" ? "Non-custodial" : "Não custodial",
                title: lang === "en" ? "Your keys. Your funds. Always." : "As suas chaves. O seu dinheiro. Sempre.",
                desc: lang === "en"
                  ? "AuthOnce never holds your funds. Subscribers hold their own tokens — pulled on schedule, never over-funded. The protocol is smart contracts, not a bank."
                  : "O AuthOnce nunca detém os seus fundos. Os subscritores guardam os próprios tokens. O protocolo é um conjunto de smart contracts, não um banco.",
                detail: lang === "en" ? "No custody · No FINMA licence · BUSL-1.1" : "Sem custódia · Sem licença FINMA · BUSL-1.1",
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

      {/* ── AI Agent Payments ── */}
      <section className="ao-section" style={{ borderBottom: `0.5px solid ${border}`, padding: "80px 40px", background: isDark ? "rgba(59,130,246,0.03)" : "rgba(59,130,246,0.03)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>
              {lang === "en" ? "AI Agent Payments" : "Pagamentos para Agentes IA"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em" }}>
              {lang === "en"
                ? "The first recurring billing protocol built for autonomous AI agents."
                : "O primeiro protocolo de cobrança recorrente construído para agentes IA autónomos."}
            </h2>
            <p style={{ fontSize: 16, color: muted, maxWidth: 580, margin: "0 auto", lineHeight: 1.7, fontWeight: 300 }}>
              {lang === "en"
                ? "AI agents need to pay for APIs, tools, and services — autonomously, without a human approving every transaction. AuthOnce is built for exactly that."
                : "Os agentes IA precisam de pagar por APIs, ferramentas e serviços — de forma autónoma, sem um humano a aprovar cada transação. O AuthOnce foi construído precisamente para isso."}
            </p>
          </div>

          {/* Flow diagram */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 0, marginBottom: 48, flexWrap: "wrap",
          }}>
            {[
              { icon: "ti-robot", label: lang === "en" ? "AI Agent" : "Agente IA", sub: lang === "en" ? "Smart wallet" : "Smart wallet", color: "#3b82f6" },
              { arrow: true },
              { icon: "ti-writing-sign", label: lang === "en" ? "Authorises once" : "Autoriza uma vez", sub: "ERC-1271 · EIP-712", color: "#34d399" },
              { arrow: true },
              { icon: "ti-refresh", label: lang === "en" ? "Keeper pulls" : "Keeper cobra", sub: lang === "en" ? "Every billing cycle" : "Cada ciclo", color: "#34d399" },
              { arrow: true },
              { icon: "ti-webhook", label: lang === "en" ? "Webhook fires" : "Webhook dispara", sub: lang === "en" ? "Agent responds" : "Agente responde", color: "#3b82f6" },
            ].map((item, i) => item.arrow ? (
              <div key={i} style={{ padding: "0 8px", color: muted, fontSize: 18 }}>→</div>
            ) : (
              <div key={i} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                padding: "16px 20px", borderRadius: 12,
                background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                border: `0.5px solid ${item.color === "#3b82f6" ? "rgba(59,130,246,0.3)" : "rgba(52,211,153,0.3)"}`,
                minWidth: 120, textAlign: "center",
              }}>
                <i className={`ti ${item.icon}`} style={{ fontSize: 24, color: item.color }} aria-hidden="true" />
                <p style={{ fontSize: 13, fontWeight: 700, color: text, margin: 0 }}>{item.label}</p>
                <p style={{ fontSize: 10, color: muted, margin: 0, fontFamily: "'DM Mono', monospace" }}>{item.sub}</p>
              </div>
            ))}
          </div>

          {/* Feature grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }} className="ao-form-row">
            {[
              {
                icon: "ti-writing-sign",
                title: lang === "en" ? "ERC-1271 smart wallet support" : "Suporte ERC-1271 para smart wallets",
                body: lang === "en"
                  ? "Smart contract wallets sign subscription authorisations natively. The agent signs once — AuthOnce pulls automatically every cycle with no further interaction required."
                  : "As smart wallets assinam autorizações de subscrição nativamente. O agente assina uma vez — o AuthOnce cobra automaticamente a cada ciclo sem mais interação.",
                color: "#3b82f6",
              },
              {
                icon: "ti-webhook",
                title: lang === "en" ? "Programmatic webhook notifications" : "Notificações webhook programáticas",
                body: lang === "en"
                  ? "When a payment fails or grace period starts, AuthOnce POSTs to your agent's endpoint. No human required — the agent handles recovery autonomously."
                  : "Quando um pagamento falha ou o período de graça começa, o AuthOnce faz POST para o endpoint do agente. Sem humanos — o agente gere a recuperação autonomamente.",
                color: "#3b82f6",
              },
              {
                icon: "ti-lock",
                title: lang === "en" ? "Non-custodial treasury" : "Tesouraria não custodial",
                body: lang === "en"
                  ? "The agent's treasury keeps full custody. AuthOnce only pulls the exact authorised amount on the due date — nothing more, ever."
                  : "A tesouraria do agente mantém custódia total. O AuthOnce cobra apenas o valor autorizado na data de vencimento — nunca mais.",
                color: "#34d399",
              },
              {
                icon: "ti-clock",
                title: lang === "en" ? "Programmable grace period recovery" : "Recuperação programável no período de graça",
                body: lang === "en"
                  ? "Agents can be programmed to top up their wallet during the 1–30 day grace period before expiry. Fully autonomous payment recovery — zero churn."
                  : "Os agentes podem ser programados para carregar a carteira durante o período de graça de 1–30 dias antes do vencimento. Recuperação totalmente autónoma — zero churn.",
                color: "#34d399",
              },
            ].map(({ icon, title, body, color }) => (
              <div key={title} style={{
                padding: 24, borderRadius: 14,
                background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                border: `0.5px solid ${color === "#3b82f6" ? "rgba(59,130,246,0.2)" : "rgba(52,211,153,0.2)"}`,
              }}>
                <i className={`ti ${icon}`} style={{ fontSize: 26, color, display: "block", marginBottom: 12 }} aria-hidden="true" />
                <p style={{ fontSize: 15, fontWeight: 700, color: text, margin: "0 0 8px", lineHeight: 1.3 }}>{title}</p>
                <p style={{ fontSize: 13, color: muted, margin: 0, lineHeight: 1.7 }}>{body}</p>
              </div>
            ))}
          </div>

          {/* Use cases */}
          <div style={{ marginTop: 32, padding: "20px 24px", borderRadius: 12, background: isDark ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.05)", border: "0.5px solid rgba(59,130,246,0.2)" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>
              {lang === "en" ? "Built for" : "Construído para"}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                lang === "en" ? "AI agents paying for API access" : "Agentes IA a pagar por acesso a APIs",
                lang === "en" ? "Autonomous trading bots" : "Bots de trading autónomos",
                lang === "en" ? "DAO-governed agent treasuries" : "Tesourarias de agentes geridas por DAOs",
                lang === "en" ? "On-chain AI service subscriptions" : "Subscrições de serviços IA on-chain",
                lang === "en" ? "Smart wallet billing" : "Faturação para smart wallets",
              ].map(tag => (
                <span key={tag} style={{
                  fontSize: 12, padding: "5px 14px", borderRadius: 99,
                  background: isDark ? "rgba(59,130,246,0.1)" : "rgba(59,130,246,0.08)",
                  border: "0.5px solid rgba(59,130,246,0.25)", color: "#3b82f6", fontWeight: 500,
                }}>{tag}</span>
              ))}
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="#apply" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 28px", borderRadius: 10,
              background: "rgba(59,130,246,0.1)", border: "0.5px solid rgba(59,130,246,0.3)",
              color: "#3b82f6", fontSize: 14, fontWeight: 600, textDecoration: "none",
            }}>
              {lang === "en" ? "Build AI agent billing →" : "Construir faturação para agentes IA →"}
            </a>
          </div>
        </div>
      </section>

      {/* ── Full Subscription Management ── */}
      <section className="ao-section" style={{ borderBottom: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="ao-founding-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
                {lang === "en" ? "Subscription Management" : "Gestão de Subscrições"}
              </p>
              <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {lang === "en"
                  ? "Not just payments. A complete subscription layer."
                  : "Não são apenas pagamentos. Uma camada completa de subscrições."}
              </h2>
              <p style={{ fontSize: 16, color: muted, lineHeight: 1.7, margin: "0 0 28px", fontWeight: 300 }}>
                {lang === "en"
                  ? "AuthOnce gives merchants a full dashboard to manage every aspect of their recurring revenue — from trial periods and grace periods to dunning, webhooks, and tax exports."
                  : "O AuthOnce dá aos comerciantes um dashboard completo para gerir todos os aspetos da sua receita recorrente — desde períodos de teste e graça até à recuperação de pagamentos, webhooks e exportações fiscais."}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { icon: "📊", title: lang === "en" ? "Merchant dashboard" : "Dashboard do comerciante", desc: lang === "en" ? "Full visibility on all subscriptions, revenue, and subscriber status in real time." : "Visibilidade total sobre subscrições, receita e estado dos subscritores em tempo real." },
                  { icon: "🔔", title: lang === "en" ? "Automated notifications" : "Notificações automáticas", desc: lang === "en" ? "Subscribers notified 3 days before each payment. Payment failed alerts and grace period warnings." : "Subscritores notificados 3 dias antes de cada pagamento. Alertas de falha e avisos de período de graça." },
                  { icon: "🔄", title: lang === "en" ? "Dunning & grace periods" : "Recuperação de pagamentos", desc: lang === "en" ? "Configurable 1–30 day grace periods with automatic daily retry logic. Recover failed payments before they churn." : "Períodos de graça configuráveis 1–30 dias com lógica de reintento automática diária." },
                  { icon: "📁", title: lang === "en" ? "Tax exports & webhooks" : "Exportações fiscais e webhooks", desc: lang === "en" ? "XLSX tax reports ready for your accountant. HMAC-signed webhooks for your backend systems." : "Relatórios fiscais XLSX prontos para o seu contabilista. Webhooks assinados HMAC para os seus sistemas." },
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
                { icon: "⏱", label: lang === "en" ? "Trial periods"    : "Períodos de teste",       sub: lang === "en" ? "Up to 90 days"   : "Até 90 dias",       color: blue   },
                { icon: "💰", label: lang === "en" ? "Intro pricing"    : "Preço introdutório",      sub: lang === "en" ? "Up to 12 pulls"  : "Até 12 cobranças",  color: accent },
                { icon: "⚙️", label: lang === "en" ? "Grace periods"    : "Períodos de graça",       sub: "1–30 " + (lang === "en" ? "days" : "dias"),             color: purple },
                { icon: "🌍", label: lang === "en" ? "15 currencies"    : "15 moedas",               sub: "EUR · USD · GBP · CHF…",                                color: amber  },
                { icon: "🔗", label: "Webhooks",                                                      sub: lang === "en" ? "HMAC signed"    : "Assinados HMAC",    color: blue   },
                { icon: "📧", label: lang === "en" ? "Branded emails"   : "Emails com marca",        sub: lang === "en" ? "Growth+ tier"   : "Plano Growth+",     color: accent },
                { icon: "🏷",  label: lang === "en" ? "Custom sender"    : "Remetente próprio",       sub: lang === "en" ? "Business+ tier" : "Plano Business+",   color: purple },
                { icon: "📤", label: lang === "en" ? "Price changes"    : "Alterações de preço",     sub: lang === "en" ? "30-day notice"  : "30 dias de aviso",  color: amber  },
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
            {lang === "en" ? "Accepted tokens" : "Tokens aceites"}
          </p>
          {[
            { symbol: "USDC", color: "#2775CA", desc: "USD Coin" },
            { symbol: "USDT", color: "#26A17B", desc: "Tether USD" },
            { symbol: "DAI",  color: "#F5AC37", desc: "Dai Stablecoin" },
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
            {lang === "en" ? "All on Base Network · More tokens coming" : "Todos na Base Network · Mais tokens em breve"}
          </p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="ao-section" style={{ maxWidth: 960, margin: "0 auto", padding: "80px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
            {lang === "en" ? "How it works" : "Como funciona"}
          </p>
          <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
            {lang === "en" ? "Four steps to your first payment" : "Quatro passos até ao primeiro pagamento"}
          </h2>
        </div>
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 20, overflow: "hidden" }}>
          <div className="ao-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[
              { n: "01", title: lang === "en" ? "Apply"          : "Registar",       sub: lang === "en" ? "Submit your business details" : "Envie os seus dados",     note: lang === "en" ? "Wallet optional"  : "Carteira opcional", c: "#1D9E75" },
              { n: "02", title: lang === "en" ? "Get approved"   : "Ser aprovado",   sub: lang === "en" ? "We review and whitelist you"  : "Analisamos e aprovamos",  note: lang === "en" ? "Within 48 hours" : "Em 48 horas",        c: "#1D9E75" },
              { n: "03", title: lang === "en" ? "Share your link": "Partilhar",      sub: lang === "en" ? "authonce.io/pay/yourname"     : "authonce.io/pay/seunome", note: lang === "en" ? "No website needed": "Sem website",        c: "#1D9E75" },
              { n: "04", title: lang === "en" ? "Get paid"       : "Receber",        sub: lang === "en" ? "Settled in stablecoins"       : "Receba em stablecoins",   note: lang === "en" ? "Every billing cycle": "Cada ciclo",      c: "#BA7517" },
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
          {lang === "en"
            ? "Founding merchants are approved personally by the AuthOnce team within 48 hours. Subscribers can pay with crypto wallet or credit card — no wallet required for card payments."
            : "Os parceiros fundadores são aprovados pessoalmente pela equipa AuthOnce em 48 horas. Os subscritores podem pagar com carteira cripto ou cartão de crédito."}
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
              {lang === "en" ? "Founding merchant offer" : "Oferta fundadora"}
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {lang === "en"
                ? "First 10 merchants pay zero fees for 3 months. First 5 get lifetime Growth tier free."
                : "Os primeiros 10 comerciantes pagam zero taxas durante 3 meses. Os primeiros 5 recebem o plano Growth gratuito para sempre."}
            </h2>
            <p style={{ color: muted, fontSize: 15, lineHeight: 1.7, margin: "0 0 28px", fontWeight: 300 }}>
              {lang === "en"
                ? "Standard protocol fee is 0.5% per transaction. No monthly fee. No setup fee. No contract. Founding merchants get 0% for their first 3 months plus lifetime Growth tier free."
                : "A taxa padrão do protocolo é 0,5% por transação. Sem taxa mensal. Sem adesão. Sem contrato. Os parceiros fundadores pagam 0% nos primeiros 3 meses mais plano Growth gratuito para sempre."}
            </p>
            <div style={{ display: "flex", gap: 32 }}>
              {[
                { v: "0%",  l: lang === "en" ? "Fees · 3 months" : "Taxas · 3 meses" },
                { v: "10",  l: lang === "en" ? "Spots total"     : "Vagas totais" },
                { v: "48h", l: lang === "en" ? "Review time"     : "Tempo de resposta" },
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
              { label: lang === "en" ? "Months 1–3"      : "Meses 1–3",        value: "0%",                               color: amber  },
              { label: lang === "en" ? "Month 4+"        : "Mês 4+",           value: "0.5%",                             color: muted  },
              { label: lang === "en" ? "Monthly fee"     : "Taxa mensal",      value: lang === "en" ? "None" : "Nenhuma", color: accent },
              { label: lang === "en" ? "Setup fee"       : "Adesão",           value: lang === "en" ? "None" : "Nenhuma", color: accent },
              { label: lang === "en" ? "Contract"        : "Contrato",         value: lang === "en" ? "None" : "Nenhum",  color: accent },
              { label: lang === "en" ? "Lifetime Growth" : "Growth vitalício", value: lang === "en" ? "Free" : "Grátis",  color: amber  },
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
              {lang === "en" ? "Try it now" : "Experimente agora"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {lang === "en" ? "Build your first product in 30 seconds." : "Crie o seu primeiro produto em 30 segundos."}
            </h2>
            <p style={{ fontSize: 15, color: muted, margin: 0, fontWeight: 300 }}>
              {lang === "en" ? "See exactly what your subscribers will see before you apply." : "Veja exatamente o que os seus subscritores verão antes de se candidatar."}
            </p>
          </div>
          <ProductCreator lang={lang} isDark={isDark} border={border} cardBg={cardBg} text={text} muted={muted} accent={accent} />
        </div>
      </section>

      {/* ── Integration Paths ── */}
      <section className="ao-section" style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Integration" : "Integração"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
              {lang === "en" ? "Three ways to get started" : "Três formas de começar"}
            </h2>
          </div>
          <div className="ao-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              {
                tag: lang === "en" ? "No code" : "Sem código", tagColor: accent,
                title: lang === "en" ? "Hosted Pay Link" : "Link de Pagamento",
                desc: lang === "en"
                  ? "Get a unique URL to share anywhere. No website, no code, no setup. Start accepting subscriptions in minutes."
                  : "Obtenha um URL único para partilhar. Sem website, sem código. Comece a aceitar subscrições em minutos.",
                time: lang === "en" ? "Ready in 5 minutes" : "Pronto em 5 minutos",
                example: "authonce.io/pay/yourname",
              },
              {
                tag: lang === "en" ? "Coming Soon" : "Em Breve", tagColor: blue,
                title: lang === "en" ? "Embeddable Widget" : "Widget Incorporável",
                desc: lang === "en"
                  ? "One line of code adds a Subscribe button to your existing site. Works on any platform."
                  : "Uma linha de código adiciona um botão de subscrição ao seu site. Funciona em qualquer plataforma.",
                time: lang === "en" ? "Ready in 30 minutes" : "Pronto em 30 minutos",
                example: '<SubscribeButton merchantId="0x..." />',
              },
              {
                tag: "API", tagColor: purple,
                title: lang === "en" ? "Developer API + Webhooks" : "API para Programadores + Webhooks",
                desc: lang === "en"
                  ? "Full REST API, webhooks, and AI agent support. ERC-1271 native — autonomous agents can subscribe and pay without human intervention."
                  : "API REST completa, webhooks e suporte para agentes IA. ERC-1271 nativo — agentes autónomos podem subscrever e pagar sem intervenção humana.",
                time: lang === "en" ? "Live on Base Sepolia" : "Ativo na Base Sepolia",
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
              {lang === "en" ? "Fee calculator" : "Calculadora de taxas"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {lang === "en" ? "How much are you leaving on the table?" : "Quanto está a perder em taxas?"}
            </h2>
            <p style={{ fontSize: 15, color: muted, margin: 0, fontWeight: 300 }}>
              {lang === "en"
                ? "Traditional payment processors charge 2.9% + $0.30 per transaction. AuthOnce charges 0.5% flat."
                : "Os processadores tradicionais cobram 2,9% + $0,30 por transação. O AuthOnce cobra apenas 0,5% fixo."}
            </p>
          </div>

          <ROICalculator lang={lang} isDark={isDark} accent={accent} border={border} cardBg={cardBg} text={text} muted={muted} />
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
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Founding Merchants" : "Comerciantes Fundadores"}
            </p>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: text, letterSpacing: "-0.03em", marginBottom: 14, lineHeight: 1.2 }}>
              {lang === "en" ? "Be one of the first 10 merchants on AuthOnce." : "Seja um dos primeiros 10 comerciantes no AuthOnce."}
            </h2>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.7, margin: 0, fontWeight: 300 }}>
              {lang === "en"
                ? "Founding merchants get lifetime Growth tier free (€49/month value), direct access to the founder, and input on the product roadmap."
                : "Os comerciantes fundadores recebem o plano Growth gratuito para sempre (valor €49/mês), acesso direto ao fundador e participação no roadmap do produto."}
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
                {lang === "en" ? "First 5 merchants only" : "Apenas os primeiros 5"}
              </span>
              <span style={{ fontSize: 12, color: isDark ? "#34d399" : "#0f6e56", fontWeight: 600 }}>
                {lang === "en" ? "Most exclusive tier" : "Nível mais exclusivo"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { icon: "🎁", title: lang === "en" ? "Lifetime Growth tier free" : "Growth vitalício grátis", sub: lang === "en" ? "€49/month value, forever" : "Valor €49/mês, para sempre" },
                { icon: "✉️", title: lang === "en" ? "Direct founder access" : "Acesso direto ao fundador", sub: lang === "en" ? "WhatsApp / email line" : "Linha WhatsApp / email" },
                { icon: "🗺️", title: lang === "en" ? "Roadmap input" : "Participação no roadmap", sub: lang === "en" ? "Shape the product" : "Moldar o produto" },
                { icon: "🏅", title: lang === "en" ? "Founding merchant badge" : "Distintivo de fundador", sub: lang === "en" ? "Permanent recognition" : "Reconhecimento permanente" },
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
                {lang === "en" ? "Merchants 6–10" : "Comerciantes 6–10"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { icon: "💸", text: lang === "en" ? "0% fees for 3 months" : "0% taxas por 3 meses" },
                { icon: "✉️", text: lang === "en" ? "Direct founder access" : "Acesso ao fundador" },
                { icon: "🏅", text: lang === "en" ? "Founding badge" : "Distintivo fundador" },
              ].map(({ icon, text: t }) => (
                <span key={t} style={{ fontSize: 12, color: muted, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 13 }}>{icon}</span> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Form */}
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 20, padding: 36 }}>
            <ApplyForm lang={lang} isDark={isDark} />
          </div>

          <p style={{ fontSize: 12, color: isDark ? "#64748b" : "#6b7280", textAlign: "center", marginTop: 20 }}>
            {lang === "en" ? "10 spots available · Mainnet launch September 2026" : "10 vagas disponíveis · Lançamento mainnet setembro 2026"}
          </p>
        </div>
      </section>

      {/* ── Roadmap ── */}
      <section className="ao-section" style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Roadmap" : "Roteiro"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {lang === "en" ? "Built in the open. Launching Q3 2026." : "Construído de forma transparente. Lançamento Q3 2026."}
            </h2>
          </div>

          {[
            {
              phase: lang === "en" ? "Foundation — completed" : "Fundação — concluído",
              color: "#34d399",
              items: [
                { done: true,  label: lang === "en" ? "Smart contracts on Base Sepolia" : "Smart contracts na Base Sepolia", detail: "SubscriptionVault · MerchantRegistry · EIP-2612 · ERC-1271" },
                { done: true,  label: lang === "en" ? "Keeper bot — automated pulls" : "Keeper bot — cobranças automáticas", detail: lang === "en" ? "47 successful pulls · 100% success rate" : "47 cobranças · 100% de sucesso" },
                { done: true,  label: lang === "en" ? "Merchant dashboard" : "Painel do comerciante", detail: lang === "en" ? "Vanity slugs · CSV import · Grace period controls" : "Slugs personalizados · Importação CSV · Controlo do período de graça" },
                { done: true,  label: lang === "en" ? "Stripe Connect dual-engine" : "Motor duplo Stripe Connect", detail: lang === "en" ? "0.5% on-chain + 0.5% off-chain via Stripe" : "0,5% on-chain + 0,5% off-chain via Stripe" },
                { done: true,  label: lang === "en" ? "Marketing site + SEO blog" : "Site + blog SEO", detail: "authonce.io · blog.authonce.io · 11 articles" },
              ],
            },
            {
              phase: lang === "en" ? "Q3 2026 — in progress" : "Q3 2026 — em curso",
              color: "#3b82f6",
              items: [
                { done: false, active: true,  label: lang === "en" ? "Security audit" : "Auditoria de segurança", detail: lang === "en" ? "5 proposals received · Seeking audit grant funding" : "5 propostas recebidas · A candidatar a financiamento de auditoria" },
                { done: false, active: true,  label: lang === "en" ? "Partnership outreach" : "Parcerias", detail: lang === "en" ? "Web3 SaaS platforms · DAO tooling · Analytics providers" : "Plataformas Web3 SaaS · Ferramentas DAO · Fornecedores de análise" },
                { done: false, active: false, label: lang === "en" ? "WooCommerce + PrestaShop plugins" : "Plugins WooCommerce + PrestaShop", detail: lang === "en" ? "$200 pre-audit safety cap" : "Limite de segurança de $200 pré-auditoria" },
                { done: false, active: false, label: lang === "en" ? "Keeper bot v2 — parallel scaling" : "Keeper bot v2 — escalonamento paralelo", detail: lang === "en" ? "25 parallel EOAs · Gelato/Chainlink beyond 50 merchants" : "25 EOAs paralelos · Gelato/Chainlink acima de 50 comerciantes" },
                { done: false, active: false, label: lang === "en" ? "Base Mainnet launch — September 2026" : "Lançamento Base Mainnet — setembro 2026", detail: lang === "en" ? "Audit-gated · $200 cap lifted · 10 founding spots" : "Condicionado à auditoria · Limite $200 removido · 10 vagas fundadoras" },
              ],
            },
            {
              phase: lang === "en" ? "Phase 2 — post-mainnet" : "Fase 2 — pós-mainnet",
              color: "#a78bfa",
              items: [
                { done: false, active: false, label: lang === "en" ? "Embeddable widget + full API" : "Widget incorporável + API completa", detail: lang === "en" ? "Self-serve · No-code checkout · Webhooks" : "Self-serve · Checkout sem código · Webhooks" },
                { done: false, active: false, label: lang === "en" ? "DAO treasury integrations" : "Integrações com tesouraria DAO", detail: "Snapshot · Tally · Boardroom · Recurring contributor payments" },

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
              {lang === "en" ? "Recurring payments for Web3." : "Pagamentos recorrentes para Web3."}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { label: "support[at]authonce.io", href: "/contact" },
              { label: lang === "en" ? "Pricing"  : "Preços",             href: "/pricing" },
              { label: lang === "en" ? "Terms"    : "Termos",             href: "/terms" },
              { label: lang === "en" ? "Privacy"  : "Privacidade",        href: "/privacy" },
              { label: lang === "en" ? "Refunds"  : "Reembolsos",         href: "/legal" },
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
            {lang === "en"
              ? "Testnet only. Smart contracts unaudited. Not financial advice. No uptime guarantees pre-mainnet."
              : "Apenas testnet. Smart contracts não auditados. Não é aconselhamento financeiro. Sem garantias de disponibilidade pré-mainnet."}
          </p>
        </div>
      </footer>
    </div>
  );
}
