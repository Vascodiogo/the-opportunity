// src/LandingPage.jsx — AuthOnce Merchant Landing Page
// Merchant-first. Dark, refined, confident. Built to convert.

import { useState } from "react";
import { t } from "./i18n.js";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

// ─── Animated How It Works SVG ────────────────────────────────────────────────
function HowItWorksSVG({ isDark }) {
  const steps = [
    { icon: "✦", label: "Apply", sub: "Submit your business details" },
    { icon: "✓", label: "Get approved", sub: "We whitelist your wallet" },
    { icon: "⟐", label: "Share your link", sub: "authonce.io/pay/you" },
    { icon: "◈", label: "Get paid", sub: "USDC every billing cycle" },
  ];
  const accent = "#34d399";
  const blue   = "#3b82f6";
  const text   = isDark ? "#f1f5f9" : "#0f172a";
  const muted  = isDark ? "#64748b" : "#94a3b8";
  const card   = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: 0, position: "relative",
    }}>
      {steps.map((step, i) => (
        <div key={i} style={{ position: "relative" }}>
          {/* Connector line */}
          {i < steps.length - 1 && (
            <div style={{
              position: "absolute", top: 36, right: 0,
              width: "50%", height: 1,
              background: `linear-gradient(90deg, ${accent}44, ${blue}44)`,
              zIndex: 0,
              display: "none", // hidden on mobile, shown via CSS
            }} className="connector"/>
          )}
          <div style={{
            padding: "28px 24px 24px",
            borderRight: i < steps.length - 1 ? `0.5px solid ${border}` : "none",
            textAlign: "center", position: "relative", zIndex: 1,
          }}>
            {/* Step number */}
            <div style={{
              fontSize: 10, fontWeight: 700, color: accent,
              letterSpacing: "0.1em", marginBottom: 12,
              fontFamily: "'DM Mono', monospace",
            }}>
              0{i + 1}
            </div>
            {/* Icon circle */}
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `linear-gradient(135deg, ${accent}22, ${blue}22)`,
              border: `0.5px solid ${accent}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 20, color: accent,
              animation: `pulse-${i} 3s ease-in-out ${i * 0.5}s infinite`,
            }}>
              {step.icon}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 600, color: text,
              marginBottom: 6, letterSpacing: "-0.01em",
            }}>
              {step.label}
            </div>
            <div style={{ fontSize: 12, color: muted, lineHeight: 1.5, fontWeight: 300 }}>
              {step.sub}
            </div>
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
  const [status, setStatus]   = useState("idle"); // idle | loading | success | error
  const [message, setMessage] = useState("");

  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9"                : "#0f172a";
  const muted   = isDark ? "#64748b"                : "#94a3b8";
  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const accent  = "#34d399";

  const fields = [
    { key: "business_name", label: lang === "en" ? "Business name" : "Nome da empresa", placeholder: lang === "en" ? "Acme Inc." : "Exemplo Lda.", type: "text" },
    { key: "email",         label: lang === "en" ? "Business email" : "Email profissional", placeholder: "you@company.com", type: "email" },
    { key: "wallet_address",label: lang === "en" ? "Wallet address (Base Network)" : "Endereço de carteira (Base Network)", placeholder: "0x...", type: "text" },
    { key: "website",       label: lang === "en" ? "Website (optional)" : "Website (opcional)", placeholder: "https://yoursite.com", type: "url" },
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");

    try {
      // 1. Store in database
      const res = await fetch(`${API_BASE}/api/merchants/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: form.wallet_address,
          business_name:  form.business_name,
          email:          form.email,
          website:        form.website,
          use_case:       form.use_case,
          settlement_preference: "usdc",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Registration failed");
      }

      // 2. Send email notification via API
      await fetch(`${API_BASE}/api/merchants/notify-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      }).catch(() => {}); // fire and forget — don't block on this

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

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {fields.map(f => (
          <div key={f.key} style={{ gridColumn: f.key === "use_case" ? "1 / -1" : "auto" }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {f.label}
            </label>
            <input
              type={f.type}
              value={form[f.key]}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              required={f.key !== "website"}
              style={{
                width: "100%", boxSizing: "border-box",
                background: inputBg, border: `0.5px solid ${border}`,
                borderRadius: 8, padding: "10px 14px",
                color: text, fontSize: 13, outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
        ))}
      </div>

      {/* Use case textarea */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {lang === "en" ? "How will you use AuthOnce?" : "Como vai usar o AuthOnce?"}
        </label>
        <textarea
          value={form.use_case}
          onChange={e => setForm(p => ({ ...p, use_case: e.target.value }))}
          placeholder={lang === "en"
            ? "Tell us about your business and how you plan to use recurring USDC payments..."
            : "Conte-nos sobre o seu negócio e como planeia usar pagamentos recorrentes em USDC..."}
          required
          rows={3}
          style={{
            width: "100%", boxSizing: "border-box",
            background: inputBg, border: `0.5px solid ${border}`,
            borderRadius: 8, padding: "10px 14px",
            color: text, fontSize: 13, outline: "none", resize: "vertical",
            fontFamily: "'DM Sans', sans-serif",
          }}
        />
      </div>

      {status === "error" && (
        <div style={{
          background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          fontSize: 13, color: "#f87171",
        }}>
          {message || (lang === "en" ? "Something went wrong. Please try again." : "Algo correu mal. Tente novamente.")}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        style={{
          width: "100%",
          background: status === "loading" ? "rgba(52,211,153,0.4)" : "linear-gradient(135deg, #34d399, #3b82f6)",
          border: "none", borderRadius: 10, padding: "14px",
          color: "#080c14", fontSize: 15, fontWeight: 700,
          cursor: status === "loading" ? "not-allowed" : "pointer",
          letterSpacing: "-0.01em", fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {status === "loading"
          ? (lang === "en" ? "Submitting…" : "A enviar…")
          : (lang === "en" ? "Apply for founding merchant access →" : "Candidatar-me como comerciante fundador →")}
      </button>

      <p style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 12, marginBottom: 0 }}>
        {lang === "en"
          ? "We review every application manually. You'll hear from us within 48 hours."
          : "Analisamos cada candidatura manualmente. Responderemos em 48 horas."}
      </p>
    </form>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage({ lang, onLaunchApp, isDark, onToggleTheme }) {
  const bg      = isDark ? "#080c14"                : "#f8fafc";
  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9"                : "#0f172a";
  const muted   = isDark ? "#64748b"                : "#94a3b8";
  const accent  = "#34d399";
  const blue    = "#3b82f6";
  const otherLang  = lang === "en" ? "pt" : "en";
  const otherLabel = lang === "en" ? "PT" : "EN";

  const scrollToApply = () => {
    document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
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
            border: "none", borderRadius: 8, padding: "8px 18px",
            color: "#080c14", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {lang === "en" ? "Apply Today →" : "Candidatar →"}
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
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
            : "Oferta para comerciantes fundadores · Primeiros 10 · 0% taxas por 3 meses"}
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: "clamp(38px, 5.5vw, 68px)", fontWeight: 700,
          color: text, lineHeight: 1.08, letterSpacing: "-0.03em",
          margin: "0 0 28px",
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

        {/* Subheadline */}
        <p style={{ fontSize: 18, color: muted, maxWidth: 600, margin: "0 auto 48px", lineHeight: 1.7, fontWeight: 300 }}>
          {lang === "en"
            ? "AuthOnce gives merchants a pay link, an embeddable widget, and a full API to collect recurring USDC subscriptions on Base Network. 99.5% of every payment goes directly to you."
            : "O AuthOnce dá aos comerciantes um link de pagamento, um widget incorporável e uma API completa para cobrar subscrições recorrentes em USDC na Base Network. 99,5% de cada pagamento vai diretamente para si."}
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={scrollToApply} style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            border: "none", borderRadius: 10, padding: "15px 36px",
            color: "#080c14", fontSize: 15, fontWeight: 700, cursor: "pointer",
            letterSpacing: "-0.01em",
          }}>
            {lang === "en" ? "Apply Today →" : "Candidatar Hoje →"}
          </button>
          <button onClick={onLaunchApp} style={{
            background: cardBg, border: `0.5px solid ${border}`,
            borderRadius: 10, padding: "15px 36px",
            color: text, fontSize: 15, fontWeight: 500, cursor: "pointer",
          }}>
            {lang === "en" ? "Open App" : "Abrir App"}
          </button>
        </div>
      </section>

      {/* ── What is AuthOnce ──────────────────────────────────────────────── */}
      <section style={{
        borderTop: `0.5px solid ${border}`, borderBottom: `0.5px solid ${border}`,
        padding: "48px 40px",
        background: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)",
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 16, textTransform: "uppercase" }}>
            {lang === "en" ? "What is AuthOnce" : "O que é o AuthOnce"}
          </p>
          <p style={{ fontSize: 17, color: text, lineHeight: 1.75, margin: 0, fontWeight: 300 }}>
            {lang === "en"
              ? "AuthOnce is a non-custodial subscription protocol built on Base Network. Subscribers authorise a one-time payment intent — their USDC is held in their own wallet and pulled automatically on schedule. Merchants receive funds directly, with no intermediary holding money in between. Everything is on-chain, auditable, and unstoppable."
              : "O AuthOnce é um protocolo de subscrição não custodial construído na Base Network. Os subscritores autorizam uma intenção de pagamento única — o seu USDC fica guardado na sua própria carteira e é cobrado automaticamente no calendário definido. Os comerciantes recebem os fundos diretamente, sem intermediários. Tudo é on-chain, auditável e imparável."}
          </p>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "80px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
            {lang === "en" ? "How it works" : "Como funciona"}
          </p>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
            {lang === "en" ? "Four steps to your first payment" : "Quatro passos até ao primeiro pagamento"}
          </h2>
        </div>
        <div style={{
          background: cardBg, border: `0.5px solid ${border}`,
          borderRadius: 20, overflow: "hidden",
        }}>
          <HowItWorksSVG isDark={isDark} lang={lang} />
        </div>
        <p style={{ textAlign: "center", color: muted, fontSize: 13, marginTop: 20, fontStyle: "italic", fontWeight: 300 }}>
          {lang === "en"
            ? "Founding merchants are approved personally by the AuthOnce team within 48 hours."
            : "Os comerciantes fundadores são aprovados pessoalmente pela equipa AuthOnce em 48 horas."}
        </p>
      </section>

      {/* ── Founding Merchant Offer ───────────────────────────────────────── */}
      <section style={{
        maxWidth: 960, margin: "0 auto", padding: "0 40px 80px",
      }}>
        <div style={{
          background: isDark ? "rgba(251,191,36,0.06)" : "rgba(251,191,36,0.05)",
          border: "0.5px solid rgba(251,191,36,0.25)",
          borderRadius: 20, padding: "48px 48px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40,
          alignItems: "center",
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "Founding merchant offer" : "Oferta fundadora"}
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {lang === "en" ? "First 10 merchants pay zero fees for 3 months." : "Os primeiros 10 comerciantes pagam zero taxas durante 3 meses."}
            </h2>
            <p style={{ color: muted, fontSize: 15, lineHeight: 1.7, margin: "0 0 24px", fontWeight: 300 }}>
              {lang === "en"
                ? "Standard protocol fee is 0.5% per transaction. Founding merchants get 0% for their first 3 months — no catch, no contract."
                : "A taxa padrão do protocolo é 0,5% por transação. Os comerciantes fundadores pagam 0% nos primeiros 3 meses — sem condições, sem contrato."}
            </p>
            <div style={{ display: "flex", gap: 24 }}>
              {[
                { v: "0%", l: lang === "en" ? "Fees · 3 months" : "Taxas · 3 meses" },
                { v: "10", l: lang === "en" ? "Spots total" : "Vagas totais" },
                { v: "48h", l: lang === "en" ? "Review time" : "Tempo de resposta" },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24", fontFamily: "'DM Mono', monospace" }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{
            background: cardBg, border: `0.5px solid ${border}`,
            borderRadius: 12, padding: 24,
          }}>
            {[
              { label: lang === "en" ? "Months 1–3" : "Meses 1–3", value: "0%", color: "#fbbf24" },
              { label: lang === "en" ? "Month 4+" : "Mês 4+", value: "0.5%", color: muted },
              { label: lang === "en" ? "Monthly fee" : "Taxa mensal", value: lang === "en" ? "None" : "Nenhuma", color: accent },
              { label: lang === "en" ? "Setup fee" : "Taxa de adesão", value: lang === "en" ? "None" : "Nenhuma", color: accent },
              { label: lang === "en" ? "Contract" : "Contrato", value: lang === "en" ? "None" : "Nenhum", color: accent },
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

      {/* ── Integration Paths ─────────────────────────────────────────────── */}
      <section style={{
        borderTop: `0.5px solid ${border}`,
        padding: "80px 40px",
      }}>
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
                tag: lang === "en" ? "No code" : "Sem código",
                tagColor: accent,
                title: lang === "en" ? "Hosted Pay Link" : "Link de Pagamento",
                desc: lang === "en"
                  ? "Get a unique URL to share anywhere. Your subscribers complete the full flow in one page — no website needed."
                  : "Obtenha um URL único para partilhar em qualquer lugar. Os seus subscritores completam o processo numa página — sem website necessário.",
                time: lang === "en" ? "Ready in 5 minutes" : "Pronto em 5 minutos",
                example: "authonce.io/pay/yourname",
              },
              {
                tag: lang === "en" ? "Copy-paste" : "Copiar e colar",
                tagColor: blue,
                title: lang === "en" ? "Embeddable Widget" : "Widget Incorporável",
                desc: lang === "en"
                  ? "Drop a Subscribe button into your existing website. One line of code opens the full payment modal."
                  : "Adicione um botão de Subscrição ao seu website. Uma linha de código abre o modal de pagamento completo.",
                time: lang === "en" ? "Ready in 30 minutes" : "Pronto em 30 minutos",
                example: "<SubscribeButton merchantId=\"0x...\" />",
              },
              {
                tag: "API",
                tagColor: "#a78bfa",
                title: lang === "en" ? "Developer API" : "API para Programadores",
                desc: lang === "en"
                  ? "Full REST API and webhooks for server-side control. Trigger subscriptions from your own backend logic."
                  : "API REST completa e webhooks para controlo total. Acione subscrições a partir da sua própria lógica de backend.",
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
                  letterSpacing: "0.05em",
                }}>
                  {card.tag}
                </span>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.01em" }}>
                  {card.title}
                </h3>
                <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, margin: 0, fontWeight: 300, flexGrow: 1 }}>
                  {card.desc}
                </p>
                <div style={{
                  background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.04)",
                  borderRadius: 6, padding: "8px 12px",
                  fontSize: 11, color: muted, fontFamily: "'DM Mono', monospace",
                }}>
                  {card.example}
                </div>
                <div style={{ fontSize: 11, color: card.tagColor, fontWeight: 600 }}>
                  {card.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Apply Form ────────────────────────────────────────────────────── */}
      <section id="apply" style={{
        borderTop: `0.5px solid ${border}`,
        padding: "80px 40px",
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
                : "Analisamos cada candidatura pessoalmente. Os primeiros 10 comerciantes aprovados pagam 0% de taxas durante 3 meses."}
            </p>
          </div>
          <div style={{
            background: cardBg, border: `0.5px solid ${border}`,
            borderRadius: 20, padding: 36,
          }}>
            <ApplyForm lang={lang} isDark={isDark} />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `0.5px solid ${border}`, padding: "32px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/logo.svg" alt="AuthOnce" style={{ width: 20, height: 20 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: text }}>
              Auth<span style={{ color: accent }}>Once</span>
            </span>
            <span style={{ fontSize: 11, color: muted, marginLeft: 8 }}>
              {lang === "en" ? "The future of recurring payments." : "O futuro dos pagamentos recorrentes."}
            </span>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { label: lang === "en" ? "Contracts verified" : "Contratos verificados", href: "https://sepolia.basescan.org/address/0x6188D6Bdb9D4DF130914A35aFA2bE66a59Ba25EA" },
              { label: "BUSL-1.1", href: "https://github.com/Vascodiogo/the-opportunity/blob/main/LICENSE" },
              { label: "GitHub", href: "https://github.com/Vascodiogo/the-opportunity" },
            ].map((link, i) => (
              <a key={i} href={link.href} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: muted, textDecoration: "none" }}>
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
