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

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage({ lang, onLaunchApp, isDark, onToggleTheme }) {
  const bg      = isDark ? "#0a0f1a"                : "#ffffff";
  const heroBg  = isDark ? "#080c14"                : "#f8fafc";
  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9"                : "#0f172a";
  const muted   = isDark ? "#94a3b8"                : "#64748b";
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

      {/* ── HERO — Full screen with gradient ── */}
      <section style={{
        position: "relative", minHeight: "calc(100vh - 64px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", background: heroBg,
      }}>
        <GradientCanvas isDark={isDark} />
        <div style={{
          position: "absolute", inset: 0,
          background: isDark
            ? "linear-gradient(to bottom, rgba(8,12,20,0.15) 0%, rgba(8,12,20,0.55) 100%)"
            : "linear-gradient(to bottom, rgba(248,250,252,0.1) 0%, rgba(248,250,252,0.5) 100%)",
        }} />

        <div className="ao-hero-content" style={{
          position: "relative", zIndex: 2,
          maxWidth: 780, margin: "0 auto",
          padding: "100px 40px 80px", textAlign: "center",
        }}>
          <div className="ao-fade-in" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: isDark ? "rgba(8,12,20,0.7)" : "rgba(255,255,255,0.85)",
            border: `0.5px solid rgba(52,211,153,0.5)`,
            borderRadius: 99, padding: "6px 18px", marginBottom: 36,
            fontSize: 12, fontWeight: 600, color: isDark ? accent : "#0d9963",
            backdropFilter: "blur(10px)",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: accent,
              display: "inline-block", animation: "pulse-dot 2s infinite",
            }}/>
            {lang === "en"
              ? "First 10 get 0% fees for 3 months - First 5 get lifetime Growth free"
              : "Primeiros 10: 0% taxas 3 meses - Primeiros 5: Growth vitalicio gratis"}
          </div>

          <h1 className="ao-hero-h1 ao-fade-in-2" style={{
            fontSize: "clamp(44px, 6vw, 76px)", fontWeight: 800,
            color: text, lineHeight: 1.05, letterSpacing: "-0.035em", margin: "0 0 28px",
          }}>
            {lang === "en" ? (
              <>Recurring payments<br/>
              <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                for Web3.
              </span></>
            ) : (
              <>Pagamentos recorrentes<br/>
              <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                para Web3.
              </span></>
            )}
          </h1>

          <p className="ao-fade-in-3" style={{
            fontSize: 18, color: muted, maxWidth: 560,
            margin: "0 auto 14px", lineHeight: 1.7, fontWeight: 300,
          }}>
            {lang === "en"
              ? "A non-custodial subscription protocol on Base Network. Subscribers authorise once — USDC, USDT, DAI or EURC pulled automatically every billing cycle, straight to your wallet."
              : "Um protocolo de subscrição não custodial na Base Network. Os subscritores autorizam uma vez — USDC, USDT, DAI ou EURC cobrado automaticamente a cada ciclo, diretamente para a sua carteira."}
          </p>

          <p className="ao-fade-in-3" style={{
            fontSize: 13, color: muted, maxWidth: 480, margin: "0 auto 40px",
            fontFamily: "'DM Mono', monospace", letterSpacing: "0.01em", opacity: 0.75,
            whiteSpace: "pre-line",
          }}>
            {lang === "en"
              ? "0.5% flat · No intermediary · No custody ·\nOn-chain · AI agent ready"
              : "0,5% fixo · Sem intermediários · Sem custódia ·\nOn-chain · Pronto para IA"}
          </p>

          <div className="ao-hero-btns ao-fade-in-4" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={scrollToApply} style={{
              background: "linear-gradient(135deg, #34d399, #3b82f6)",
              border: "none", borderRadius: 12, padding: "16px 36px",
              color: "#080c14", fontSize: 16, fontWeight: 800, cursor: "pointer",
              letterSpacing: "-0.01em",
            }}>
              {lang === "en" ? "Apply as founding merchant →" : "Registar como parceiro fundador →"}
            </button>
            <a href="#how-it-works" style={{
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              border: `0.5px solid ${border}`,
              borderRadius: 12, padding: "16px 28px",
              color: text, fontSize: 15, fontWeight: 600, cursor: "pointer",
              textDecoration: "none", display: "inline-flex", alignItems: "center",
            }}>
              {lang === "en" ? "See how it works" : "Como funciona"}
            </a>
          </div>

          <div style={{
            position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.4,
          }}>
            <span style={{ fontSize: 10, color: muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Scroll</span>
            <div style={{ width: 1, height: 24, background: `linear-gradient(to bottom, ${muted}, transparent)` }} />
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
          <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 16, textTransform: "uppercase" }}>
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
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
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

      {/* ── Full Subscription Management ── */}
      <section className="ao-section" style={{ borderBottom: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="ao-founding-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
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
          <p style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, whiteSpace: "nowrap" }}>
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
          <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
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
            <p style={{ fontSize: 11, fontWeight: 700, color: amber, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
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

      {/* ── Integration Paths ── */}
      <section className="ao-section" style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
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
                title: lang === "en" ? "Developer API" : "API para Programadores",
                desc: lang === "en"
                  ? "Full REST API and webhooks. Built for developers and AI agent integrations. Complete server-side control."
                  : "API REST completa e webhooks. Para programadores e integrações com agentes IA. Controlo total do lado do servidor.",
                time: lang === "en" ? "Ready in 1–2 days" : "Pronto em 1–2 dias",
                example: "POST /api/subscriptions",
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
                <div style={{ fontSize: 11, color: card.tagColor, fontWeight: 600 }}>{card.time}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Apply Form ── */}
      <section id="apply" style={{
        borderTop: `0.5px solid ${border}`, padding: "80px 40px",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.025)",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Apply today" : "Registar hoje"}
            </p>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {lang === "en" ? "Become a founding merchant" : "Torne-se um parceiro fundador"}
            </h2>
            <p style={{ color: muted, fontSize: 15, margin: 0, fontWeight: 300 }}>
              {lang === "en"
                ? "We review every application personally. First 10 approved merchants get 0% fees for 3 months."
                : "Analisamos cada registo pessoalmente. Os primeiros 10 aprovados pagam 0% de taxas durante 3 meses."}
            </p>
          </div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 20, padding: 36 }}>
            <ApplyForm lang={lang} isDark={isDark} />
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{
        padding: "80px 40px",
        background: isDark ? "rgba(52,211,153,0.03)" : "rgba(52,211,153,0.04)",
        borderTop: `0.5px solid ${isDark ? "rgba(52,211,153,0.1)" : "rgba(52,211,153,0.15)"}`,
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
            {lang === "en" ? "Founding Merchants" : "Comerciantes Fundadores"}
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 800, color: text, letterSpacing: "-0.03em", marginBottom: 16, lineHeight: 1.2 }}>
            {lang === "en" ? "Be one of the first 10 merchants on AuthOnce." : "Seja um dos primeiros 10 comerciantes no AuthOnce."}
          </h2>
          <p style={{ fontSize: 16, color: muted, lineHeight: 1.8, marginBottom: 32, fontWeight: 300 }}>
            {lang === "en"
              ? "Founding merchants get lifetime Growth tier free (€49/month value), direct access to the founder, and input on the product roadmap."
              : "Os comerciantes fundadores recebem o plano Growth gratuito para sempre (valor €49/mês), acesso direto ao fundador e participação no roadmap do produto."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
            {[
              { icon: "🎁", text: lang === "en" ? "Lifetime Growth tier free" : "Growth gratuito para sempre" },
              { icon: "✉️", text: lang === "en" ? "Direct founder access"    : "Acesso direto ao fundador" },
              { icon: "🗺️", text: lang === "en" ? "Roadmap input"            : "Participação no roadmap" },
              { icon: "🏅", text: lang === "en" ? "Founding merchant badge"  : "Distintivo de fundador" },
            ].map(({ icon, text: t }) => (
              <div key={t} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderRadius: 99,
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                border: `0.5px solid ${border}`,
              }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span style={{ fontSize: 13, color: muted, fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="#apply"
              style={{
                background: "linear-gradient(135deg, #34d399, #3b82f6)",
                border: "none", borderRadius: 12, color: "#080c14",
                fontWeight: 800, fontSize: 15, padding: "14px 28px",
                textDecoration: "none", display: "inline-block", letterSpacing: "-0.01em",
              }}
            >
              {lang === "en" ? "Apply as founding merchant →" : "Candidatar-se como fundador →"}
            </a>
            <a
              href="#apply"
              style={{
                background: "none", border: `0.5px solid ${border}`,
                borderRadius: 12, color: muted, fontWeight: 600, fontSize: 15,
                padding: "14px 28px", textDecoration: "none", display: "inline-block",
              }}
            >
              {lang === "en" ? "Ask a question" : "Fazer uma pergunta"}
            </a>
          </div>
          <p style={{ fontSize: 12, color: isDark ? "#64748b" : "#6b7280", marginTop: 20 }}>
            {lang === "en" ? "10 spots available · Mainnet launch September 2026" : "10 vagas disponíveis · Lançamento mainnet setembro 2026"}
          </p>
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
      </footer>
    </div>
  );
}
