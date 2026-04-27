// src/LandingPage.jsx — AuthOnce Merchant Landing Page v2
// Merchant-first. Clean. No noise.

import { useState } from "react";
import { t } from "./i18n.js";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks({ lang, isDark }) {
  const text   = isDark ? "#f1f5f9" : "#0f172a";
  const muted  = isDark ? "#64748b" : "#94a3b8";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const accent = "#34d399";
  const blue   = "#3b82f6";

  const steps = lang === "en" ? [
    { n: "01", icon: "✦", title: "Apply",         sub: "Submit your business details — wallet optional" },
    { n: "02", icon: "✓", title: "Get approved",  sub: "We review and whitelist your wallet personally" },
    { n: "03", icon: "⟐", title: "Share your link", sub: "authonce.io/pay/yourname — ready instantly" },
    { n: "04", icon: "◈", title: "Get paid",       sub: "99.5% of every subscription goes to you" },
  ] : [
    { n: "01", icon: "✦", title: "Candidatar",      sub: "Envie os seus dados — carteira opcional" },
    { n: "02", icon: "✓", title: "Ser aprovado",    sub: "Analisamos e aprovamos pessoalmente" },
    { n: "03", icon: "⟐", title: "Partilhar o link", sub: "authonce.io/pay/seunome — pronto imediatamente" },
    { n: "04", icon: "◈", title: "Receber",          sub: "99,5% de cada subscrição vai para si" },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 0,
    }}>
      {steps.map((step, i) => (
        <div key={i} style={{
          padding: "32px 28px",
          borderRight: i < steps.length - 1 ? `0.5px solid ${border}` : "none",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: accent,
            letterSpacing: "0.12em", marginBottom: 16,
            fontFamily: "'DM Mono', monospace",
          }}>{step.n}</div>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: `linear-gradient(135deg, ${accent}20, ${blue}20)`,
            border: `0.5px solid ${accent}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: 18, color: accent,
          }}>{step.icon}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 8, letterSpacing: "-0.01em" }}>
            {step.title}
          </div>
          <div style={{ fontSize: 12, color: muted, lineHeight: 1.6, fontWeight: 300 }}>
            {step.sub}
          </div>
        </div>
      ))}
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
          {lang === "en" ? "Application received!" : "Candidatura recebida!"}
        </h3>
        <p style={{ color: muted, fontSize: 14, margin: 0, fontWeight: 300 }}>
          {lang === "en"
            ? "We'll review your application and get back to you within 48 hours."
            : "Vamos analisar a sua candidatura e responder em 48 horas."}
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
          : (lang === "en" ? "Apply for founding merchant access →" : "Candidatar-me como comerciante fundador →")}
      </button>

      <p style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 12, marginBottom: 0 }}>
        {lang === "en"
          ? "We review every application personally. You'll hear from us within 48 hours."
          : "Analisamos cada candidatura pessoalmente. Responderemos em 48 horas."}
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
          <button onClick={onToggleTheme} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 14,
          }}>{isDark ? "☀️" : "🌙"}</button>
          <button onClick={scrollToApply} style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            border: "none", borderRadius: 8, padding: "8px 20px",
            color: "#080c14", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {lang === "en" ? "Apply Today →" : "Candidatar →"}
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
            <>Aceite pagamentos cripto recorrentes.<br/>
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
          {lang === "en" ? "Apply Today →" : "Candidatar Hoje →"}
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
            : "Os comerciantes fundadores são aprovados pessoalmente pela equipa AuthOnce em 48 horas."}
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
                : "A taxa padrão do protocolo é 0,5% por transação. Sem taxa mensal. Sem taxa de adesão. Sem contrato. Os comerciantes fundadores pagam 0% nos primeiros 3 meses."}
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
              {lang === "en" ? "Apply today" : "Candidatar hoje"}
            </p>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              {lang === "en" ? "Become a founding merchant" : "Torne-se um comerciante fundador"}
            </h2>
            <p style={{ color: muted, fontSize: 15, margin: 0, fontWeight: 300 }}>
              {lang === "en"
                ? "We review every application personally. First 10 approved merchants get 0% fees for 3 months."
                : "Analisamos cada candidatura pessoalmente. Os primeiros 10 aprovados pagam 0% de taxas durante 3 meses."}
            </p>
          </div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 20, padding: 36 }}>
            <ApplyForm lang={lang} isDark={isDark} />
          </div>
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
          <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <a href="mailto:vasco@authonce.io" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>
              vasco@authonce.io
            </a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <span style={{ fontSize: 12, color: muted }}>BUSL-1.1</span>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <span style={{ fontSize: 12, color: muted }}>
              {lang === "en" ? "Base Sepolia testnet" : "Testnet Base Sepolia"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
