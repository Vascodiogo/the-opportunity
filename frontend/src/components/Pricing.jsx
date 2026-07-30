// src/components/Pricing.jsx — AuthOnce Pricing Page
import { useState } from "react";
import { Helmet } from "react-helmet-async";

const TIERS = [
  {
    name:     "Starter",
    price:    "Free",
    sub:      "Forever",
    fee:      "0.5%",
    feeLabel: "per transaction",
    accent:   "#64748b",
    highlight: false,
    cta:      "Apply Today →",
    features: [
        "3 active products",
        "Up to 100 active subscribers",
        "USDC direct to your wallet",
        "Hosted pay link",
        "7-day grace period & dunning",
        "Basic email notifications",
        "Webhook delivery (5 retries, HMAC-SHA256)",
        "Basescan transaction verification",
        "CSV export",
      ],
  },
  {
    name:     "Growth",
    price:    "€49",
    sub:      "/ month",
    fee:      "0.5%",
    feeLabel: "per transaction",
    accent:   "#34d399",
    highlight: true,
    cta:      "Apply Today →",
    features: [
        "Everything in Starter",
        "Unlimited products & subscribers",
        "Trial periods & intro pricing",
        "Configurable grace period (1–30 days)",
        "Branded email notifications",
        "3-day pre-payment subscriber alerts",
        "Embeddable subscribe widget",
        "QR code physical access control ✦",
        "Priority support",
      ],
  },
  {
    name:     "Business",
    price:    "€199",
    sub:      "/ month",
    fee:      "0.5%",
    feeLabel: "per transaction",
    accent:   "#3b82f6",
    highlight: false,
    cta:      "Apply Today →",
    features: [
        "Everything in Growth",
        "Full REST API access",
        "Revenue analytics & MRR dashboard",
        "Fiat settlement (EUR/USD via Circle) ✦",
        "Custom webhook endpoints",
        "Subscriber portal white-label ✦",
        "DataOnce early access ✦",
        "SLA uptime guarantee",
        "Dedicated onboarding",
      ],
  },
];

export default function Pricing({ isDark = false, onToggleTheme, onLaunchApp }) {
  const bg      = isDark ? "#080c14"                : "#f8fafc";
  const cardBg  = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border  = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text    = isDark ? "#f1f5f9"                : "#0f172a";
  const muted   = isDark ? "#64748b"                : "#94a3b8";
  const accent  = "#34d399";

  const scrollToApply = () => {
    window.location.href = "/#apply";
  };

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <Helmet>
        <link rel="canonical" href="https://authonce.io/pricing" />
      </Helmet>
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
          <label style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 14,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <input type="checkbox" checked={isDark} onChange={onToggleTheme} style={{ display: "none" }} />
            {isDark ? "☀️" : "🌙"}
          </label>
          <button onClick={scrollToApply} style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            border: "none", borderRadius: 8, padding: "8px 20px",
            color: "#080c14", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            {"Apply Today →"}
          </button>
          <a href="/?launch=true" style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 8, padding: "8px 16px",
            color: text, fontSize: 13, fontWeight: 600, cursor: "pointer",
            textDecoration: "none", display: "inline-block",
          }}>
            {"Launch App →"}
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "80px 40px 56px", textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 16, textTransform: "uppercase" }}>
          {"Pricing"}
        </p>
        <h1 style={{
          fontSize: "clamp(32px, 4.5vw, 52px)", fontWeight: 700,
          color: text, lineHeight: 1.1, letterSpacing: "-0.03em", margin: "0 0 20px",
        }}>
          {<>Simple pricing.<br/>
            <span style={{ background: "linear-gradient(135deg, #34d399, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              No surprises.
            </span></>}
        </h1>
        <p style={{ fontSize: 17, color: muted, maxWidth: 520, margin: "0 auto 16px", lineHeight: 1.7, fontWeight: 300 }}>
          {"Start free. Scale as you grow. Subscribers always pay exactly the price you set — we never add fees on top."}
        </p>
        <p style={{ fontSize: 13, color: muted, margin: "0 auto", fontStyle: "italic", fontWeight: 300 }}>
          {"Full feature availability at mainnet — September 2026."}
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
          {"Founding merchant offer · First 10 approved merchants get 0% protocol fees for 3 months on any plan."}
        </div>
      </div>

      {/* ── Tier Cards ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 40px 24px" }}>
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
              display: "flex", flexDirection: "column",
              position: "relative",
            }}>
              {tier.highlight && (
                <div style={{
                  position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #34d399, #3b82f6)",
                  borderRadius: 99, padding: "4px 14px",
                  fontSize: 11, fontWeight: 700, color: "#080c14", whiteSpace: "nowrap",
                }}>
                  {"Most Popular"}
                </div>
              )}

              <p style={{ fontSize: 11, fontWeight: 700, color: tier.accent, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 16px" }}>
                {tier.name}
              </p>

              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: text, letterSpacing: "-0.03em", fontFamily: "'DM Mono', monospace" }}>
                  {tier.price}
                </span>
                <span style={{ fontSize: 14, color: muted, marginLeft: 4, fontWeight: 300 }}>
                  {tier.sub}
                </span>
              </div>

              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: `${tier.accent}14`, border: `0.5px solid ${tier.accent}33`,
                borderRadius: 8, padding: "5px 10px",
                marginBottom: 24, alignSelf: "flex-start",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: tier.accent, fontFamily: "'DM Mono', monospace" }}>{tier.fee}</span>
                <span style={{ fontSize: 12, color: muted }}>{tier.feeLabel}</span>
              </div>

              <div style={{ height: "0.5px", background: border, marginBottom: 24 }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 10, flexGrow: 1, marginBottom: 28 }}>
                {tier.features.map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ color: tier.accent, fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 13, color: j === 0 && i > 0 ? text : muted, fontWeight: j === 0 && i > 0 ? 500 : 300, lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}
              </div>

              <button onClick={scrollToApply} style={{
                width: "100%",
                background: tier.highlight ? "linear-gradient(135deg, #34d399, #3b82f6)" : "none",
                border: tier.highlight ? "none" : `0.5px solid ${border}`,
                borderRadius: 10, padding: "13px",
                color: tier.highlight ? "#080c14" : text,
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                letterSpacing: "-0.01em", fontFamily: "'DM Sans', sans-serif",
              }}>
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        {/* ✦ footnote */}
        <p style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 20, fontWeight: 300, fontStyle: "italic" }}>
          {"✦ Launching at mainnet — September 2026."}
        </p>

        {/* Enterprise row */}
        <div style={{
          background: cardBg, border: `0.5px solid ${border}`,
          borderRadius: 16, padding: "28px 32px", marginTop: 12,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20,
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 6px" }}>Enterprise</p>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: text, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
              {"Custom volume pricing"}
            </h3>
            <p style={{ fontSize: 13, color: muted, margin: 0, fontWeight: 300 }}>
              {"0.5% protocol fee · Volume discounts negotiable · White-label option · Custom integrations · Dedicated account manager"}
            </p>
          </div>
          <a href="mailto:vasco@authonce.io" style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 10, padding: "12px 24px",
            color: text, fontSize: 14, fontWeight: 700,
            cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {"Contact us →"}
          </a>
        </div>
      </section>

      {/* ── Fee Comparison ── */}
      <section style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px", marginTop: 56 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
              {"How the math works"}
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
              {"99.5% of every payment goes to you."}
            </h2>
          </div>
          <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 16, overflow: "hidden" }}>
            {[
              { label: "Subscriber pays",          value: "€100.00", color: text,      mono: true             },
              { label: "AuthOnce protocol fee",         value: "− €0.50", color: "#f87171", mono: true             },
              { label: "You receive",                    value: "€99.50",  color: accent,    mono: true, bold: true  },
              { label: "Monthly platform fee", value: "− €49",   color: muted,     mono: false            },
              { label: "Break-even (Growth)",       value: "50 subscribers", color: muted, mono: false },
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
            {"Example based on €100/month subscription · Growth plan · Starter plan has no monthly fee."}
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ borderTop: `0.5px solid ${border}`, padding: "80px 40px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>FAQ</p>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
              {"Common questions"}
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {([
              { q: "Do subscribers pay any fees?",         a: "No. Subscribers always pay exactly the price you set. All fees are absorbed by the merchant." },
              { q: "What currency do I receive?",          a: "USDC on Base Network by default. Business merchants can enable automatic fiat settlement (EUR/USD) via Circle — funds arrive in your bank account." },
              { q: "What happens if a payment fails?",     a: "AuthOnce has a built-in grace period (7 days by default, configurable 1–30 days on Growth+). The keeper bot retries daily and notifies the subscriber automatically. Subscriptions only cancel after the grace period expires." },
              { q: "Can I change my plan later?",          a: "Yes. Upgrade or downgrade at any time. Changes take effect at the start of the next billing cycle." },
              { q: "Is there a setup fee or contract?",    a: "No setup fee. No contract. Cancel any time." },
              { q: "What is the protocol fee charged on?", a: "The 0.5% protocol fee is charged on each successful subscription pull — not on the monthly platform fee." },
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
        borderTop: `0.5px solid ${border}`, padding: "80px 40px",
        background: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)",
        textAlign: "center",
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.12em", marginBottom: 16, textTransform: "uppercase" }}>
          {"Ready to start?"}
        </p>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: text, margin: "0 0 16px", letterSpacing: "-0.02em" }}>
          {"Become a founding merchant."}
        </h2>
        <p style={{ color: muted, fontSize: 15, margin: "0 auto 36px", maxWidth: 480, fontWeight: 300, lineHeight: 1.7 }}>
          {"First 10 approved merchants get 0% protocol fees for 3 months. We review every application personally."}
        </p>
        <button onClick={scrollToApply} style={{
          background: "linear-gradient(135deg, #34d399, #3b82f6)",
          border: "none", borderRadius: 10, padding: "15px 40px",
          color: "#080c14", fontSize: 16, fontWeight: 700, cursor: "pointer",
          letterSpacing: "-0.01em",
        }}>
          {"Apply Today →"}
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
              {"The future of recurring payments."}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <a href="mailto:support@authonce.io" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>support@authonce.io</a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <a href="/legal.html" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>{"Terms"}</a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <a href="/legal.html" style={{ fontSize: 12, color: muted, textDecoration: "none" }}>{"Privacy"}</a>
            <span style={{ fontSize: 12, color: isDark ? "#334155" : "#cbd5e1" }}>·</span>
            <span style={{ fontSize: 12, color: muted }}>BUSL-1.1</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
