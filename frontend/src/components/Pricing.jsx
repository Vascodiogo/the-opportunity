// src/components/Pricing.jsx — AuthOnce Pricing Page
import { useState } from "react";

const TIERS = [
  {
    name:     { en: "Starter",  pt: "Starter"  },
    price:    { en: "Free",     pt: "Grátis"   },
    sub:      { en: "Forever",  pt: "Para sempre" },
    fee:      "1.0%",
    feeLabel: { en: "per transaction", pt: "por transação" },
    accent:   "#64748b",
    highlight: false,
    cta:      { en: "Apply Today →",   pt: "Registar →"      },
    features: {
      en: [
        "Hosted pay link",
        "Up to 100 active subscribers",
        "USDC direct to your wallet",
        "Basic email notifications",
        "7-day grace period & dunning",
        "Webhook delivery (5 retries)",
        "CSV export",
      ],
      pt: [
        "Link de pagamento alojado",
        "Até 100 subscritores ativos",
        "USDC direto para a sua carteira",
        "Notificações básicas por email",
        "Período de graça de 7 dias",
        "Entrega de webhooks (5 tentativas)",
        "Exportação CSV",
      ],
    },
  },
  {
    name:     { en: "Growth",   pt: "Growth"   },
    price:    { en: "€49",      pt: "€49"      },
    sub:      { en: "/ month",  pt: "/ mês"    },
    fee:      "0.5%",
    feeLabel: { en: "per transaction", pt: "por transação" },
    accent:   "#34d399",
    highlight: true,
    cta:      { en: "Apply Today →",   pt: "Registar →"      },
    features: {
      en: [
        "Everything in Starter",
        "Unlimited active subscribers",
        "Branded email notifications",
        "Embeddable Subscribe widget",
        "Stripe fiat onramp (card / MB Way / SEPA)",
        "1–30 day configurable grace period",
        "Priority support",
      ],
      pt: [
        "Tudo do Starter",
        "Subscritores ilimitados",
        "Emails com a sua marca",
        "Widget de subscrição incorporável",
        "Onramp fiat via Stripe (cartão / MB Way / SEPA)",
        "Período de graça configurável (1–30 dias)",
        "Suporte prioritário",
      ],
    },
  },
  {
    name:     { en: "Business", pt: "Business" },
    price:    { en: "€199",     pt: "€199"     },
    sub:      { en: "/ month",  pt: "/ mês"    },
    fee:      "0.3%",
    feeLabel: { en: "per transaction", pt: "por transação" },
    accent:   "#3b82f6",
    highlight: false,
    cta:      { en: "Apply Today →",   pt: "Registar →"      },
    features: {
      en: [
        "Everything in Growth",
        "Full REST API access",
        "Multi-product catalogue",
        "Custom webhook endpoints",
        "Fiat settlement (USD/EUR via Circle)",
        "SLA uptime guarantee",
        "Dedicated onboarding",
      ],
      pt: [
        "Tudo do Growth",
        "Acesso completo à API REST",
        "Catálogo multi-produto",
        "Webhooks personalizados",
        "Liquidação fiat (USD/EUR via Circle)",
        "Garantia de uptime SLA",
        "Integração dedicada",
      ],
    },
  },
];

export default function Pricing({ lang = "en", isDark = true, onToggleTheme, onLaunchApp }) {
  const [billing, setBilling] = useState("monthly"); // reserved for future yearly toggle

  const bg      = isDark ? "#080c14"                : "#f8fafc";
  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9"                : "#0f172a";
  const muted   = isDark ? "#64748b"                : "#94a3b8";
  const accent  = "#34d399";
  const otherLang  = lang === "en" ? "pt" : "en";
  const otherLabel = lang === "en" ? "PT" : "EN";

  const scrollToApply = () => {
    window.location.href = `/${lang === "pt" ? "pt" : ""}#apply`;
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
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 17, fontWeight: 700, color: text, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: accent }}>Once</span>
          </span>
        </a>
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
            {lang === "en" ? "Apply Today →" : "Registar →"}
          </button>
          <button onClick={onLaunchApp} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 8, padding: "8px 16px",
            color: text, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {lang === "en" ? "Launch App →" : "Abrir App →"}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "80px 40px 56px", textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 16, textTransform: "uppercase" }}>
          {lang === "en" ? "Pricing" : "Preços"}
        </p>
        <h1 style={{
          fontSize: "clamp(32px, 4.5vw, 52px)", fontWeight: 700,
          color: text, lineHeight: 1.1, letterSpacing: "-0.03em", margin: "0 0 20px",
        }}>
          {lang === "en" ? (
            <>Simple pricing.<br/>
            <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              No surprises.
            </span></>
          ) : (
            <>Preços simples.<br/>
            <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Sem surpresas.
            </span></>
          )}
        </h1>
        <p style={{ fontSize: 17, color: muted, maxWidth: 520, margin: "0 auto", lineHeight: 1.7, fontWeight: 300 }}>
          {lang === "en"
            ? "Start free. Scale as you grow. Subscribers always pay exactly the price you set — we never add fees on top."
            : "Comece grátis. Cresça sem limites. Os subscritores pagam sempre o preço que definiu — nunca adicionamos taxas extra."}
        </p>
      </section>

      {/* ── Founding Offer Banner ── */}
      <div style={{ maxWidth: 960, margin: "0 auto 48px", padding: "0 40px" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          background: isDark ? "rgba(251,191,36,0.08)" : "rgba(251,191,36,0.06)",
          border: "0.5px solid rgba(251,191,36,0.3)",
          borderRadius: 12, padding: "14px 24px",
          fontSize: 13, color: "#fbbf24", fontWeight: 500,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block", flexShrink: 0 }}/>
          {lang === "en"
            ? "Founding merchant offer · First 10 approved merchants get 0% protocol fees for 3 months on any plan."
            : "Oferta fundadora · Os primeiros 10 comerciantes aprovados pagam 0% de taxas durante 3 meses em qualquer plano."}
        </div>
      </div>

      {/* ── Tier Cards ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 40px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 20 }}>
          {TIERS.map((tier, i) => (
            <div key={i} style={{
              background: tier.highlight
                ? isDark ? "rgba(52,211,153,0.05)" : "rgba(52,211,153,0.04)"
                : cardBg,
              border: tier.highlight
                ? "0.5px solid rgba(52,211,153,0.35)"
                : `0.5px solid ${border}`,
              borderRadius: 20, padding: 32,
              display: "flex", flexDirection: "column", gap: 0,
              position: "relative",
            }}>
              {/* Popular badge */}
              {tier.highlight && (
                <div style={{
                  position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #34d399, #3b82f6)",
                  borderRadius: 99, padding: "4px 14px",
                  fontSize: 11, fontWeight: 700, color: "#080c14",
                  whiteSpace: "nowrap",
                }}>
                  {lang === "en" ? "Most Popular" : "Mais Popular"}
                </div>
              )}

              {/* Tier name */}
              <p style={{ fontSize: 11, fontWeight: 700, color: tier.accent, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 16px" }}>
                {tier.name[lang]}
              </p>

              {/* Price */}
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: text, letterSpacing: "-0.03em", fontFamily: "'DM Mono', monospace" }}>
                  {tier.price[lang]}
                </span>
                <span style={{ fontSize: 14, color: muted, marginLeft: 4, fontWeight: 300 }}>
                  {tier.sub[lang]}
                </span>
              </div>

              {/* Protocol fee */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: `${tier.accent}14`,
                border: `0.5px solid ${tier.accent}33`,
                borderRadius: 8, padding: "5px 10px",
                marginBottom: 24, alignSelf: "flex-start",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: tier.accent, fontFamily: "'DM Mono', monospace" }}>{tier.fee}</span>
                <span style={{ fontSize: 12, color: muted }}>{tier.feeLabel[lang]}</span>
              </div>

              {/* Divider */}
              <div style={{ height: "0.5px", background: border, marginBottom: 24 }} />

              {/* Features */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flexGrow: 1, marginBottom: 28 }}>
                {tier.features[lang].map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ color: tier.accent, fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 13, color: j === 0 && i > 0 ? text : muted, fontWeight: j === 0 && i > 0 ? 500 : 300, lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={scrollToApply}
                style={{
                  width: "100%",
                  background: tier.highlight
                    ? "linear-gradient(135deg, #34d399, #3b82f6)"
                    : "none",
                  border: tier.highlight
                    ? "none"
                    : `0.5px solid ${border}`,
                  borderRadius: 10, padding: "13px",
                  color: tier.highlight ? "#080c14" : text,
                  fontSize: 14, fontWeight: 700,
                  cursor: "pointer", letterSpacing: "-0.01em",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {tier.cta[lang]}
              </button>
            </div>
          ))}
        </div>

        {/* Enterprise row */}
        <div style={{
          background: cardBg, border: `0.5px solid ${border}`,
          borderRadius: 16, padding: "28px 32px", marginTop: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20,
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 6px" }}>Enterprise</p>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: text, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
              {lang === "en" ? "Custom volume pricing" : "Preços por volume"}
            </h3>
            <p style={{ fontSize: 13, color: muted, margin: 0, fontWeight: 300 }}>
              {lang === "en"
                ? "0.1–0.2% protocol fee · Dedicated SLA · White-label option · Plugin licencing for WooCommerce & PrestaShop"
                : "0,1–0,2% de taxa · SLA dedicado · Opção white-label · Licenciamento de plugin para WooCommerce & PrestaShop"}
            </p>
          </div>
          <a href="mailto:vasco@authonce.io" style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 10, padding: "12px 24px",
            color: text, fontSize: 14, fontWeight: 700,
            cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {lang === "en" ? "Contact us →" : "Contactar →"}
          </a>
        </div>
      </section>

      {/* ── Fee Comparison ── */}
      <section style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
              {lang === "en" ? "How the math works" : "Como funciona o cálculo"}
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
              {lang === "en" ? "99.5% of every payment goes to you." : "99,5% de cada pagamento vai para si."}
            </h2>
          </div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 16, overflow: "hidden" }}>
            {[
              { label: lang === "en" ? "Subscriber pays"        : "Subscritor paga",         value: "€100.00", color: text,    mono: true  },
              { label: lang === "en" ? "AuthOnce protocol fee"  : "Taxa de protocolo",        value: "− €0.50", color: "#f87171", mono: true },
              { label: lang === "en" ? "You receive (Growth)"   : "Recebe (Growth)",          value: "€99.50",  color: accent,  mono: true, bold: true  },
              { label: lang === "en" ? "Monthly platform fee"   : "Taxa mensal da plataforma",value: "− €49",   color: muted,   mono: false },
              { label: lang === "en" ? "Break-even (Growth)"    : "Break-even (Growth)",      value: lang === "en" ? "98 subscribers" : "98 subscritores", color: muted, mono: false },
            ].map((row, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 24px",
                borderBottom: i < 4 ? `0.5px solid ${border}` : "none",
                background: i === 2 ? (isDark ? "rgba(52,211,153,0.04)" : "rgba(52,211,153,0.03)") : "none",
              }}>
                <span style={{ fontSize: 13, color: muted, fontWeight: 300 }}>{row.label}</span>
                <span style={{
                  fontSize: 13, color: row.color,
                  fontWeight: row.bold ? 700 : 500,
                  fontFamily: row.mono ? "'DM Mono', monospace" : "'DM Sans', sans-serif",
                }}>{row.value}</span>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", color: muted, fontSize: 12, marginTop: 16, fontStyle: "italic", fontWeight: 300 }}>
            {lang === "en"
              ? "Example based on €100/month subscription · Growth plan · Starter plan has no monthly fee."
              : "Exemplo baseado numa subscrição de €100/mês · Plano Growth · O plano Starter não tem taxa mensal."}
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
              FAQ
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
              {lang === "en" ? "Common questions" : "Perguntas frequentes"}
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(lang === "en" ? [
              { q: "Do subscribers pay any fees?",         a: "No. Subscribers always pay exactly the price you set. All fees are absorbed by the merchant." },
              { q: "What currency do I receive?",          a: "USDC on Base Network by default. Growth and Business merchants can enable automatic fiat settlement (USD/EUR) via Circle — funds arrive in your bank account." },
              { q: "What happens if a payment fails?",     a: "AuthOnce has a built-in grace period (7 days by default, configurable 1–30 days on Growth+). The keeper bot retries daily and notifies the subscriber automatically. Subscriptions only cancel after the grace period expires." },
              { q: "Can I change my plan later?",          a: "Yes. You can upgrade or downgrade at any time. Changes take effect at the start of the next billing cycle." },
              { q: "Is there a setup fee or contract?",    a: "No setup fee. No contract. Cancel any time." },
              { q: "What is the protocol fee charged on?", a: "The protocol fee is charged on each successful subscription pull — not on the monthly platform fee." },
            ] : [
              { q: "Os subscritores pagam taxas?",              a: "Não. Os subscritores pagam sempre exatamente o preço que definiu. Todas as taxas são absorvidas pelo comerciante." },
              { q: "Em que moeda recebo?",                       a: "USDC na Base Network por padrão. Os planos Growth e Business podem ativar liquidação fiat automática (USD/EUR) via Circle — os fundos chegam à sua conta bancária." },
              { q: "O que acontece se um pagamento falhar?",     a: "O AuthOnce tem um período de graça integrado (7 dias por padrão, configurável de 1 a 30 dias no Growth+). O keeper bot tenta diariamente e notifica o subscritor automaticamente." },
              { q: "Posso mudar de plano?",                      a: "Sim. Pode fazer upgrade ou downgrade a qualquer momento. As alterações entram em vigor no início do próximo ciclo de faturação." },
              { q: "Existe taxa de adesão ou contrato?",         a: "Sem taxa de adesão. Sem contrato. Cancele quando quiser." },
              { q: "Sobre o que é cobrada a taxa de protocolo?", a: "A taxa de protocolo é cobrada em cada cobrança de subscrição bem-sucedida — não sobre a taxa mensal da plataforma." },
            ]).map((item, i, arr) => (
              <div key={i} style={{
                borderBottom: i < arr.length - 1 ? `0.5px solid ${border}` : "none",
                padding: "20px 0",
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: text, margin: "0 0 8px", letterSpacing: "-0.01em" }}>{item.q}</p>
                <p style={{ fontSize: 13, color: muted, margin: 0, lineHeight: 1.7, fontWeight: 300 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        borderTop: `0.5px solid ${border}`,
        padding: "80px 40px",
        background: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)",
        textAlign: "center",
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 16, textTransform: "uppercase" }}>
          {lang === "en" ? "Ready to start?" : "Pronto para começar?"}
        </p>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em" }}>
          {lang === "en" ? "Become a founding merchant." : "Torne-se um parceiro fundador."}
        </h2>
        <p style={{ color: muted, fontSize: 15, margin: "0 auto 36px", maxWidth: 480, fontWeight: 300, lineHeight: 1.7 }}>
          {lang === "en"
            ? "First 10 approved merchants get 0% protocol fees for 3 months. We review every application personally."
            : "Os primeiros 10 aprovados pagam 0% de taxas durante 3 meses. Analisamos cada registo pessoalmente."}
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
            <a href="mailto:support@authonce.io" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>support@authonce.io</a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <a href="/legal.html" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>{lang === "en" ? "Terms" : "Termos"}</a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <a href="/legal.html" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>{lang === "en" ? "Privacy" : "Privacidade"}</a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <span style={{ fontSize: 12, color: muted }}>BUSL-1.1</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
