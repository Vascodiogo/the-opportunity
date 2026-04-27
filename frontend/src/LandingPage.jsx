// src/LandingPage.jsx — AuthOnce bilingual landing page
import { t } from "./i18n.js";

export default function LandingPage({ lang, onLaunchApp, isDark, onToggleTheme }) {
  const bg = isDark ? "#080c14" : "#f8fafc";
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text = isDark ? "#f1f5f9" : "#0f172a";
  const muted = isDark ? "#64748b" : "#94a3b8";
  const accent = "#34d399";
  const blue = "#3b82f6";
  const otherLang = lang === "en" ? "pt" : "en";
  const otherLabel = lang === "en" ? "PT" : "EN";

  const features = [
    { icon: "⚡", title: t(lang, "feature_1_title"), desc: t(lang, "feature_1_desc") },
    { icon: "🔒", title: t(lang, "feature_2_title"), desc: t(lang, "feature_2_desc") },
    { icon: "🛡️", title: t(lang, "feature_3_title"), desc: t(lang, "feature_3_desc") },
    { icon: "🔔", title: t(lang, "feature_4_title"), desc: t(lang, "feature_4_desc") },
  ];

  const stats = [
    { value: t(lang, "stat_1"), label: t(lang, "stat_1_label") },
    { value: t(lang, "stat_2"), label: t(lang, "stat_2_label") },
    { value: t(lang, "stat_3"), label: t(lang, "stat_3_label") },
    { value: t(lang, "stat_4"), label: t(lang, "stat_4_label") },
  ];

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Google Font */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 64,
        borderBottom: `0.5px solid ${border}`,
        background: isDark ? "rgba(8,12,20,0.9)" : "rgba(248,250,252,0.9)",
        backdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 17, fontWeight: 700, color: text, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: accent }}>Once</span>
          </span>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Language switcher */}
          <a
            href={`/${otherLang === "en" ? "" : otherLang}`}
            style={{
              fontSize: 12, fontWeight: 600, color: muted,
              padding: "4px 10px", borderRadius: 6,
              border: `0.5px solid ${border}`,
              textDecoration: "none",
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
            }}
          >
            {otherLabel}
          </a>
          {/* Theme toggle */}
          <button onClick={onToggleTheme} style={{
            background: "none", border: `0.5px solid ${border}`,
            borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 14,
          }}>
            {isDark ? "☀️" : "🌙"}
          </button>
          {/* Launch app */}
          <button onClick={onLaunchApp} style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            border: "none", borderRadius: 8, padding: "8px 18px",
            color: "#080c14", fontSize: 13, fontWeight: 700, cursor: "pointer",
            letterSpacing: "-0.01em",
          }}>
            {t(lang, "nav_launch")} →
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        maxWidth: 900, margin: "0 auto", padding: "100px 32px 80px",
        textAlign: "center",
      }}>
        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: isDark ? "rgba(52,211,153,0.1)" : "rgba(52,211,153,0.12)",
          border: "0.5px solid rgba(52,211,153,0.3)",
          borderRadius: 99, padding: "6px 14px", marginBottom: 32,
          fontSize: 12, fontWeight: 600, color: accent, letterSpacing: "0.02em",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, display: "inline-block" }}/>
          Base Sepolia Testnet
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 700,
          color: text, lineHeight: 1.1, letterSpacing: "-0.03em",
          margin: "0 0 24px",
        }}>
          {t(lang, "hero_title_1")}<br/>
          <span style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            {t(lang, "hero_title_2")}
          </span>
        </h1>

        {/* Description */}
        <p style={{
          fontSize: 18, color: muted, maxWidth: 580, margin: "0 auto 48px",
          lineHeight: 1.7, fontWeight: 300,
        }}>
          {t(lang, "hero_description")}
        </p>

        {/* CTA Buttons */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onLaunchApp} style={{
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            border: "none", borderRadius: 10, padding: "14px 32px",
            color: "#080c14", fontSize: 15, fontWeight: 700, cursor: "pointer",
            letterSpacing: "-0.01em",
          }}>
            {t(lang, "get_started")} →
          </button>
          <a
            href="https://github.com/Vascodiogo/the-opportunity"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: cardBg, border: `0.5px solid ${border}`,
              borderRadius: 10, padding: "14px 32px",
              color: text, fontSize: 15, fontWeight: 500, cursor: "pointer",
              textDecoration: "none", display: "inline-block",
            }}
          >
            {t(lang, "learn_more")}
          </a>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{
        borderTop: `0.5px solid ${border}`, borderBottom: `0.5px solid ${border}`,
        padding: "32px 32px",
      }}>
        <div style={{
          maxWidth: 800, margin: "0 auto",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{
              textAlign: "center", padding: "0 16px",
              borderRight: i < 3 ? `0.5px solid ${border}` : "none",
            }}>
              <div style={{
                fontSize: 26, fontWeight: 700, color: text,
                letterSpacing: "-0.02em", fontFamily: "'DM Mono', monospace",
              }}>{s.value}</div>
              <div style={{ fontSize: 12, color: muted, marginTop: 4, fontWeight: 400 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24,
        }}>
          {features.map((f, i) => (
            <div key={i} style={{
              background: cardBg, border: `0.5px solid ${border}`,
              borderRadius: 16, padding: 28,
            }}>
              <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: text, margin: "0 0 10px", letterSpacing: "-0.01em" }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 14, color: muted, lineHeight: 1.6, margin: 0, fontWeight: 300 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Flow diagram */}
      <section style={{
        maxWidth: 700, margin: "0 auto", padding: "0 32px 80px",
        textAlign: "center",
      }}>
        <div style={{
          background: cardBg, border: `0.5px solid ${border}`,
          borderRadius: 20, padding: 40,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, flexWrap: "wrap" }}>
            {[
              { label: lang === "en" ? "You sign once" : "Assina uma vez", color: accent },
              { arrow: true },
              { label: lang === "en" ? "Keeper pulls" : "Keeper cobra", color: blue },
              { arrow: true },
              { label: lang === "en" ? "Merchant paid" : "Comerciante pago", color: accent },
            ].map((item, i) =>
              item.arrow ? (
                <div key={i} style={{ color: muted, fontSize: 20, padding: "0 8px" }}>→</div>
              ) : (
                <div key={i} style={{
                  background: `${item.color}18`,
                  border: `0.5px solid ${item.color}44`,
                  borderRadius: 10, padding: "10px 18px",
                  fontSize: 13, fontWeight: 600, color: item.color,
                }}>
                  {item.label}
                </div>
              )
            )}
          </div>
          <p style={{ color: muted, fontSize: 13, marginTop: 20, marginBottom: 0, fontWeight: 300 }}>
            {lang === "en"
              ? "Non-custodial · On-chain · Auditable"
              : "Não custodial · On-chain · Auditável"}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: `0.5px solid ${border}`,
        padding: "32px 32px",
        textAlign: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>
            Auth<span style={{ color: accent }}>Once</span>
          </span>
        </div>
        <p style={{ color: muted, fontSize: 12, margin: "0 0 8px", fontWeight: 300 }}>
          {t(lang, "footer_tagline")}
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          {[t(lang, "footer_contract"), t(lang, "footer_license"), t(lang, "footer_testnet")].map((item, i) => (
            <span key={i} style={{ fontSize: 11, color: isDark ? "#334155" : "#94a3b8" }}>{item}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}
