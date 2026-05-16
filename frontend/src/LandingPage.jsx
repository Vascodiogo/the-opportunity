// src/LandingPage.jsx — AuthOnce Merchant Landing Page v2
// Merchant-first. Clean. No noise.

import { useState } from "react";
import { t } from "./i18n.js";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks({ lang, isDark }) {
  const border  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const text    = isDark ? "#f1f5f9" : "#0f172a";
  const muted   = isDark ? "#64748b" : "#94a3b8";
  const subtle  = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  const accent  = "#34d399";
  const tealBg  = isDark ? "rgba(29,158,117,0.12)" : "rgba(29,158,117,0.08)";
  const amberBg = isDark ? "rgba(186,117,23,0.15)" : "rgba(186,117,23,0.08)";
  const amber   = "#BA7517";
  const teal    = "#1D9E75";

  const labels = lang === "en" ? [
    { n: "01", title: "Apply",            sub: "Submit your business details", note: "Wallet optional" },
    { n: "02", title: "Get approved",     sub: "We review and whitelist you",  note: "Within 48 hours" },
    { n: "03", title: "Share your link",  sub: "authonce.io/pay/yourname",     note: "No website needed" },
    { n: "04", title: "Get paid",         sub: "USDC direct to your wallet",   note: "Every billing cycle" },
  ] : [
    { n: "01", title: "Registar",         sub: "Envie os seus dados",          note: "Carteira opcional" },
    { n: "02", title: "Ser aprovado",     sub: "Analisamos e aprovamos",       note: "Em 48 horas" },
    { n: "03", title: "Partilhar o link", sub: "authonce.io/pay/seunome",      note: "Sem website" },
    { n: "04", title: "Receber",          sub: "USDC direto para si",          note: "Cada ciclo" },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        viewBox="0 0 680 280"
        style={{ width: "100%", display: "block" }}
        aria-label="How AuthOnce works in 4 steps"
      >
        {/* Arrow marker */}
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
        </defs>

        {/* Step separators */}
        {[170,340,510].map(x => (
          <line key={x} x1={x} y1="40" x2={x} y2="248" stroke={border} strokeWidth="0.5"/>
        ))}

        {/* ── STEP 1 — Apply (form) ── */}
        <text x="85" y="56" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: teal, letterSpacing: "0.12em", fontFamily: "monospace" }}>01</text>
        <rect x="48" y="68" width="74" height="86" rx="6" fill="none" stroke={subtle} strokeWidth="1"/>
        <rect x="58" y="80" width="54" height="7" rx="2" fill={teal} opacity="0.8"/>
        <rect x="58" y="94" width="36" height="5" rx="1.5" fill={subtle}/>
        <rect x="58" y="106" width="42" height="5" rx="1.5" fill={subtle}/>
        <rect x="58" y="118" width="30" height="5" rx="1.5" fill={subtle}/>
        <rect x="58" y="132" width="44" height="10" rx="3" fill={teal} opacity="0.7"/>
        <line x1="96" y1="72" x2="110" y2="66" stroke={muted} strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="93" y1="75" x2="96" y2="72" stroke={muted} strokeWidth="1.5" strokeLinecap="round"/>
        <text x="85" y="176" textAnchor="middle" style={{ fontSize: 14, fontWeight: 600, fill: text }}>{labels[0].title}</text>
        <text x="85" y="194" textAnchor="middle" style={{ fontSize: 12, fill: muted }}>{labels[0].sub}</text>
        <text x="85" y="212" textAnchor="middle" style={{ fontSize: 11, fill: muted, opacity: 0.6 }}>{labels[0].note}</text>

        {/* Arrow 1→2 */}
        <line x1="130" y1="111" x2="150" y2="111" stroke={subtle} strokeWidth="1" markerEnd="url(#arr)"/>

        {/* ── STEP 2 — Approved (shield + check) ── */}
        <text x="255" y="56" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: teal, letterSpacing: "0.12em", fontFamily: "monospace" }}>02</text>
        <path d="M255 68 L228 81 L228 109 Q228 131 255 142 Q282 131 282 109 L282 81 Z" fill={tealBg} stroke={subtle} strokeWidth="1"/>
        <path d="M243 105 L251 113 L268 96" fill="none" stroke={teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <text x="255" y="176" textAnchor="middle" style={{ fontSize: 14, fontWeight: 600, fill: text }}>{labels[1].title}</text>
        <text x="255" y="194" textAnchor="middle" style={{ fontSize: 12, fill: muted }}>{labels[1].sub}</text>
        <text x="255" y="212" textAnchor="middle" style={{ fontSize: 11, fill: muted, opacity: 0.6 }}>{labels[1].note}</text>

        {/* Arrow 2→3 */}
        <line x1="300" y1="105" x2="320" y2="105" stroke={subtle} strokeWidth="1" markerEnd="url(#arr)"/>

        {/* ── STEP 3 — Share link (chain + URL bar) ── */}
        <text x="425" y="56" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: teal, letterSpacing: "0.12em", fontFamily: "monospace" }}>03</text>
        <rect x="390" y="86" width="36" height="16" rx="8" fill="none" stroke={subtle} strokeWidth="1.5"/>
        <rect x="414" y="94" width="36" height="16" rx="8" fill="none" stroke={subtle} strokeWidth="1.5"/>
        <rect x="388" y="120" width="74" height="18" rx="4" fill={tealBg} stroke={subtle} strokeWidth="0.8"/>
        <text x="425" y="133" textAnchor="middle" style={{ fontSize: 9, fill: muted, fontFamily: "monospace" }}>authonce.io/pay/you</text>
        <line x1="450" y1="88" x2="462" y2="76" stroke={muted} strokeWidth="1.2" strokeLinecap="round" markerEnd="url(#arr)"/>
        <text x="425" y="176" textAnchor="middle" style={{ fontSize: 14, fontWeight: 600, fill: text }}>{labels[2].title}</text>
        <text x="425" y="194" textAnchor="middle" style={{ fontSize: 12, fill: muted }}>{labels[2].sub}</text>
        <text x="425" y="212" textAnchor="middle" style={{ fontSize: 11, fill: muted, opacity: 0.6 }}>{labels[2].note}</text>

        {/* Arrow 3→4 */}
        <line x1="472" y1="111" x2="492" y2="111" stroke={subtle} strokeWidth="1" markerEnd="url(#arr)"/>

        {/* ── STEP 4 — Get paid (coin stack) ── */}
        <text x="595" y="56" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: amber, letterSpacing: "0.12em", fontFamily: "monospace" }}>04</text>
        <ellipse cx="595" cy="138" rx="28" ry="8" fill={amberBg} stroke={amber} strokeWidth="0.5" opacity="0.7"/>
        <rect x="567" y="118" width="56" height="20" fill={amberBg}/>
        <ellipse cx="595" cy="118" rx="28" ry="8" fill={amberBg} stroke={amber} strokeWidth="0.5" opacity="0.85"/>
        <rect x="567" y="100" width="56" height="18" fill={amberBg}/>
        <ellipse cx="595" cy="100" rx="28" ry="8" fill={amberBg} stroke={amber} strokeWidth="0.8"/>
        <text x="595" y="105" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 14, fontWeight: 500, fill: amber }}>€</text>
        <line x1="595" y1="70" x2="595" y2="88" stroke={amber} strokeWidth="1.5" markerEnd="url(#arr)"/>
        <text x="595" y="66" textAnchor="middle" style={{ fontSize: 10, fill: amber }}>99.5%</text>
        <text x="595" y="176" textAnchor="middle" style={{ fontSize: 14, fontWeight: 600, fill: text }}>{labels[3].title}</text>
        <text x="595" y="194" textAnchor="middle" style={{ fontSize: 12, fill: muted }}>{labels[3].sub}</text>
        <text x="595" y="212" textAnchor="middle" style={{ fontSize: 11, fill: muted, opacity: 0.6 }}>{labels[3].note}</text>

      </svg>
    </div>
  );
}

// ─── Apply Form ───────────────────────────────────────────────────────────────
function ApplyForm({ lang, isDark }) {
  const [form, setForm] = useState({
    business_name: "", email: "", wallet_address: "", website: "", use_case: "",
  });
  const [status, setStatus]   = useState("idle");
  const [message, setMessage] = useState("");

  const border  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9"                : "#0f172a";
  const muted   = isDark ? "#64748b"                : "#94a3b8";
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
      // Notify admin via email
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
      {/* Row 1 — Business name + Email */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
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

      {/* Row 2 — Wallet + Website */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>
            {lang === "en" ? "Wallet address (optional)" : "Endereço de carteira (opcional)"}
          </label>
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

      {/* Wallet guidance note */}
      <p style={{ fontSize: 11, color: muted, margin: "0 0 16px", lineHeight: 1.6 }}>
        {lang === "en"
          ? <>Use any exchange deposit address — <a href="https://coinbase.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Coinbase</a>, <a href="https://binance.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Binance</a>, <a href="https://kraken.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Kraken</a>, or any other. USDC lands directly there and you can convert to EUR and withdraw to your bank in two clicks. No wallet app needed.</>
          : <>Use o endereço de depósito de qualquer exchange — <a href="https://coinbase.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Coinbase</a>, <a href="https://binance.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Binance</a>, <a href="https://kraken.com" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none" }}>Kraken</a>, ou qualquer outra. O USDC chega diretamente e pode converter para EUR e levantar para a sua conta bancária em dois cliques. Não precisa de app de carteira.</>}
      </p>

      {/* Use case */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>
          {lang === "en" ? "How will you use AuthOnce?" : "Como vai usar o AuthOnce?"}
        </label>
        <textarea required rows={3} value={form.use_case}
          onChange={e => setForm(p => ({ ...p, use_case: e.target.value }))}
          placeholder={lang === "en"
            ? "Tell us about your business and how you plan to use recurring USDC payments..."
            : "Conte-nos sobre o seu negócio e como planeia usar pagamentos recorrentes em USDC..."}
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
  const bg     = isDark ? "#080c14"                : "#f8fafc";
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text   = isDark ? "#f1f5f9"                : "#0f172a";
  const muted  = isDark ? "#64748b"                : "#94a3b8";
  const accent = "#34d399";
  const blue   = "#3b82f6";
  const otherLang  = lang === "en" ? "pt" : "en";
  const otherLabel = lang === "en" ? "PT" : "EN";

  const scrollToApply = () => {
    document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* ── Nav ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: 64,
        borderBottom: `0.5px solid ${border}`,
        background: isDark ? "rgba(8,12,20,0.9)" : "rgba(248,250,252,0.9)",
        backdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 17, fontWeight: 700, color: text, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: accent }}>Once</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href={`/${otherLang === "en" ? "" : otherLang}`} style={{
            fontSize: 12, fontWeight: 600, color: muted,
            padding: "4px 10px", borderRadius: 6,
            border: `0.5px solid ${border}`, textDecoration: "none",
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          }}>{otherLabel}</a>
          <a href="/pricing" style={{
            fontSize: 12, fontWeight: 600, color: muted, textDecoration: "none",
          }}>
            {lang === "en" ? "Pricing" : "Preços"}
          </a>
          <button onClick={onToggleTheme} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 14,
          }}>{isDark ? "☀️" : "🌙"}</button>
          <button onClick={scrollToApply} style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            border: "none", borderRadius: 8, padding: "8px 20px",
            color: "#080c14", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {lang === "en" ? "Apply Today →" : "Registar →"}
          </button>
          <button onClick={onLaunchApp} style={{
            background: "none",
            border: `0.5px solid ${border}`,
            borderRadius: 8, padding: "8px 16px",
            color: text, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {lang === "en" ? "Launch App →" : "Abrir App →"}
          </button>
        </div>
      </nav>
      {/* ── Hero ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "96px 40px 72px", textAlign: "center" }}>
        {/* Founding badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: isDark ? "rgba(251,191,36,0.1)" : "rgba(251,191,36,0.12)",
          border: "0.5px solid rgba(251,191,36,0.4)",
          borderRadius: 99, padding: "6px 16px", marginBottom: 32,
          fontSize: 12, fontWeight: 600, color: "#fbbf24",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }}/>
          {lang === "en"
            ? "Founding merchant offer · First 10 only · 0% fees for 3 months"
            : "Oferta fundadora · Primeiros 10 · 0% taxas durante 3 meses"}
        </div>

        <h1 style={{
          fontSize: "clamp(38px, 5.5vw, 68px)", fontWeight: 700,
          color: text, lineHeight: 1.08, letterSpacing: "-0.03em", margin: "0 0 28px",
        }}>
          {lang === "en" ? (
            <>Accept recurring crypto payments.<br/>
            <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Without the complexity.
            </span></>
          ) : (
            <>Aceite pagamentos Crypto recorrentes.<br/>
            <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Sem a complexidade.
            </span></>
          )}
        </h1>

        <p style={{ fontSize: 18, color: muted, maxWidth: 580, margin: "0 auto 48px", lineHeight: 1.7, fontWeight: 300 }}>
          {lang === "en"
            ? "AuthOnce gives merchants a pay link, an embeddable widget, and a full API to collect recurring USDC subscriptions on Base Network. 99.5% of every payment goes directly to you."
            : "O AuthOnce dá aos comerciantes um link de pagamento, um widget e uma API completa para cobrar subscrições recorrentes em USDC na Base Network. 99,5% de cada pagamento vai diretamente para si."}
        </p>

        <button onClick={scrollToApply} style={{
          background: "linear-gradient(135deg, #34d399, #3b82f6)",
          border: "none", borderRadius: 10, padding: "15px 40px",
          color: "#080c14", fontSize: 16, fontWeight: 700, cursor: "pointer",
          letterSpacing: "-0.01em",
        }}>
          {lang === "en" ? "Apply Today →" : "Registar Hoje →"}
        </button>
      </section>

      {/* ── What is AuthOnce ── */}
      <section style={{
        borderTop: `0.5px solid ${border}`, borderBottom: `0.5px solid ${border}`,
        padding: "48px 40px",
        background: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 16, textTransform: "uppercase" }}>
            {lang === "en" ? "What is AuthOnce" : "O que é o AuthOnce"}
          </p>
          <p style={{ fontSize: 17, color: text, lineHeight: 1.8, margin: 0, fontWeight: 300 }}>
            {lang === "en"
              ? "AuthOnce is a non-custodial subscription protocol built on Base Network. Subscribers authorise a one-time payment intent — their USDC is held in their own wallet and pulled automatically on schedule. Merchants receive funds directly, with no intermediary. Everything is on-chain, auditable, and unstoppable."
              : "O AuthOnce é um protocolo de subscrição não custodial construído na Base Network. Os subscritores autorizam uma intenção de pagamento única — o seu USDC fica guardado na sua própria carteira e é cobrado automaticamente. Os comerciantes recebem os fundos diretamente, sem intermediários. Tudo é on-chain, auditável e imparável."}
          </p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "80px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
            {lang === "en" ? "How it works" : "Como funciona"}
          </p>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
            {lang === "en" ? "Four steps to your first payment" : "Quatro passos até ao primeiro pagamento"}
          </h2>
        </div>
        <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 20, overflow: "hidden" }}>
          <HowItWorks isDark={isDark} lang={lang} />
        </div>
        <p style={{ textAlign: "center", color: muted, fontSize: 13, marginTop: 20, fontStyle: "italic", fontWeight: 300 }}>
          {lang === "en"
            ? "Founding merchants are approved personally by the AuthOnce team within 48 hours."
            : "Os parceiros fundadores são aprovados pessoalmente pela equipa AuthOnce em 48 horas."}
        </p>
      </section>

      {/* ── Founding Offer ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 40px 80px" }}>
        <div style={{
          background: isDark ? "rgba(251,191,36,0.06)" : "rgba(251,191,36,0.04)",
          border: "0.5px solid rgba(251,191,36,0.25)",
          borderRadius: 20, padding: "48px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center",
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Founding merchant offer" : "Oferta fundadora"}
            </p>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {lang === "en"
                ? "First 10 merchants pay zero fees for 3 months."
                : "Os primeiros 10 comerciantes pagam zero taxas durante 3 meses."}
            </h2>
            <p style={{ color: muted, fontSize: 14, lineHeight: 1.7, margin: "0 0 24px", fontWeight: 300 }}>
              {lang === "en"
                ? "Standard protocol fee is 0.5% per transaction. No monthly fee. No setup fee. No contract. Founding merchants get 0% for their first 3 months."
                : "A taxa padrão do protocolo é 0,5% por transação. Sem taxa mensal. Sem taxa de adesão. Sem contrato. Os parceiros fundadores pagam 0% nos primeiros 3 meses."}
            </p>
            <div style={{ display: "flex", gap: 28 }}>
              {[
                { v: "0%",  l: lang === "en" ? "Fees · 3 months" : "Taxas · 3 meses" },
                { v: "10",  l: lang === "en" ? "Spots total"     : "Vagas totais" },
                { v: "48h", l: lang === "en" ? "Review time"     : "Tempo de resposta" },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24", fontFamily: "'DM Mono', monospace" }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 12, padding: 24 }}>
            {[
              { label: lang === "en" ? "Months 1–3"   : "Meses 1–3",   value: "0%",                                color: "#fbbf24" },
              { label: lang === "en" ? "Month 4+"     : "Mês 4+",      value: "0.5%",                              color: muted },
              { label: lang === "en" ? "Monthly fee"  : "Taxa mensal", value: lang === "en" ? "None" : "Nenhuma",  color: accent },
              { label: lang === "en" ? "Setup fee"    : "Adesão",      value: lang === "en" ? "None" : "Nenhuma",  color: accent },
              { label: lang === "en" ? "Contract"     : "Contrato",    value: lang === "en" ? "None" : "Nenhum",   color: accent },
            ].map((row, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0",
                borderBottom: i < 4 ? `0.5px solid ${border}` : "none",
              }}>
                <span style={{ fontSize: 13, color: muted }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: row.color, fontFamily: "'DM Mono', monospace" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integration Paths ── */}
      <section style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Integration" : "Integração"}
            </p>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
              {lang === "en" ? "Three ways to get started" : "Três formas de começar"}
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              {
                tag: lang === "en" ? "No code" : "Sem código", tagColor: accent,
                title: lang === "en" ? "Hosted Pay Link" : "Link de Pagamento",
                desc: lang === "en"
                  ? "Get a unique URL to share anywhere. No website needed."
                  : "Obtenha um URL único para partilhar. Sem website necessário.",
                time: lang === "en" ? "Ready in 5 minutes" : "Pronto em 5 minutos",
                example: "authonce.io/pay/yourname",
              },
              {
                tag: lang === "en" ? "Copy-paste" : "Copiar e colar", tagColor: blue,
                title: lang === "en" ? "Embeddable Widget" : "Widget Incorporável",
                desc: lang === "en"
                  ? "One line of code adds a Subscribe button to your existing site."
                  : "Uma linha de código adiciona um botão de subscrição ao seu site.",
                time: lang === "en" ? "Ready in 30 minutes" : "Pronto em 30 minutos",
                example: "<SubscribeButton merchantId=\"0x...\" />",
              },
              {
                tag: "API", tagColor: "#a78bfa",
                title: lang === "en" ? "Developer API" : "API para Programadores",
                desc: lang === "en"
                  ? "Full REST API and webhooks for complete server-side control."
                  : "API REST completa e webhooks para controlo total do lado do servidor.",
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
                <h3 style={{ fontSize: 15, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.01em" }}>{card.title}</h3>
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
        background: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Apply today" : "Registar hoje"}
            </p>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
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

      {/* ── Founding Merchants CTA ── */}
      <section style={{ padding: "80px 40px", background: isDark ? "rgba(52,211,153,0.03)" : "rgba(52,211,153,0.04)", borderTop: `0.5px solid ${isDark ? "rgba(52,211,153,0.1)" : "rgba(52,211,153,0.15)"}` }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
            {lang === "en" ? "Founding Merchants" : "Comerciantes Fundadores"}
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: text, letterSpacing: "-0.03em", marginBottom: 16, lineHeight: 1.2 }}>
            {lang === "en" ? "Be one of the first 5 merchants on AuthOnce" : "Seja um dos primeiros 5 comerciantes no AuthOnce"}
          </h2>
          <p style={{ fontSize: 16, color: muted, lineHeight: 1.8, marginBottom: 32, fontWeight: 300 }}>
            {lang === "en"
              ? "Founding merchants get lifetime Growth tier free (€49/month value), direct access to the founder, and input on the product roadmap."
              : "Os comerciantes fundadores recebem o plano Growth gratuito para sempre (valor €49/mês), acesso direto ao fundador e participação no roadmap do produto."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 32 }}>
            {[
              { icon: "🎁", text: lang === "en" ? "Lifetime Growth tier free" : "Growth gratuito para sempre" },
              { icon: "📞", text: lang === "en" ? "Direct founder access" : "Acesso direto ao fundador" },
              { icon: "🗺️", text: lang === "en" ? "Roadmap input" : "Participação no roadmap" },
              { icon: "🏅", text: lang === "en" ? "Founding merchant badge" : "Distintivo de fundador" },
            ].map(({ icon, text: t }) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 99, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", border: `0.5px solid ${border}` }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span style={{ fontSize: 13, color: muted, fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="mailto:vasco@authonce.io?subject=Founding Merchant Application&body=Hi Vasco, I'm interested in becoming a founding merchant on AuthOnce. Here's a bit about my business:"
              style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", border: "none", borderRadius: 12, color: "#080c14", fontWeight: 800, fontSize: 15, padding: "14px 28px", textDecoration: "none", display: "inline-block", letterSpacing: "-0.01em" }}
            >
              {lang === "en" ? "Apply as founding merchant →" : "Candidatar-se como fundador →"}
            </a>
            <a
              href="mailto:vasco@authonce.io"
              style={{ background: "none", border: `0.5px solid ${border}`, borderRadius: 12, color: muted, fontWeight: 600, fontSize: 15, padding: "14px 28px", textDecoration: "none", display: "inline-block" }}
            >
              {lang === "en" ? "Ask a question" : "Fazer uma pergunta"}
            </a>
          </div>
          <p style={{ fontSize: 12, color: isDark ? "#334155" : "#94a3b8", marginTop: 20 }}>
            {lang === "en" ? "5 spots available · Mainnet launch September 2026" : "5 vagas disponíveis · Lançamento mainnet setembro 2026"}
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `0.5px solid ${border}`, padding: "32px 40px" }}>
        <div style={{
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
              {lang === "en" ? "The future of recurring payments." : "O futuro dos pagamentos recorrentes."}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <a href="mailto:support@authonce.io" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>
              support@authonce.io
            </a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <a href="/legal.html" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>
              {lang === "en" ? "Terms" : "Termos"}
            </a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <a href="/legal.html" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>
              {lang === "en" ? "Privacy" : "Privacidade"}
            </a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <a href="/legal.html" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>
              {lang === "en" ? "Refunds" : "Reembolsos"}
            </a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <span style={{ fontSize: 12, color: muted }}>BUSL-1.1</span>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <span style={{ fontSize: 12, color: muted }}>
              {lang === "en" ? "Base Network" : " Base Network"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
