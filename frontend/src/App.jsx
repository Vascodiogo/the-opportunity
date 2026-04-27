// src/App.jsx — AuthOnce Protocol
import { useState, useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { shortAddress, ADMIN_ADDRESS } from "./config.js";
import Dashboard from "./components/Dashboard.jsx";
import MerchantDashboard from "./components/MerchantDashboard.jsx";
import LandingPage from "./LandingPage.jsx";
import { detectLang, t } from "./i18n.js";

export default function App() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  const [view, setView] = useState("subscriber");
  const [showApp, setShowApp] = useState(false);

  // Language detection
  const [lang, setLang] = useState(() => detectLang());

  // Auto-redirect Portuguese browsers to /pt
  useEffect(() => {
    const browser = navigator.language || navigator.userLanguage || "en";
    const isPt = browser.toLowerCase().startsWith("pt");
    const isOnPtPath = window.location.pathname.startsWith("/pt");
    if (isPt && !isOnPtPath) {
      window.history.replaceState({}, "", "/pt");
      setLang("pt");
    }
  }, []);

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-dark", "theme-light");
    root.classList.add(`theme-${theme}`);
    localStorage.setItem("theme", theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const isDark = theme === "dark";

  // Theme-aware styles
  const navBg = isDark ? "rgba(8,12,20,0.95)" : "rgba(248,250,252,0.95)";
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const textPrimary = isDark ? "#f1f5f9" : "#0f172a";
  const textMuted = isDark ? "#475569" : "#94a3b8";
  const switcherBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
  const switcherActiveBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  // Show landing page if not connected and not explicitly launched
  if (!isConnected && !showApp) {
    return (
      <LandingPage
        lang={lang}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLaunchApp={() => setShowApp(true)}
      />
    );
  }

  // Connect wallet screen (after clicking Get Started)
  if (!isConnected && showApp) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        minHeight: "100vh", gap: 24, padding: 24,
        background: isDark ? "#080c14" : "#f8fafc",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

        <div style={{ position: "absolute", top: 20, right: 24, display: "flex", gap: 10 }}>
          <button onClick={() => setShowApp(false)} style={{
            background: "none", border: `0.5px solid ${borderColor}`,
            borderRadius: 6, padding: "6px 12px", cursor: "pointer",
            color: textMuted, fontSize: 12,
          }}>← {lang === "en" ? "Back" : "Voltar"}</button>
          <button onClick={toggleTheme} style={{
            background: "none", border: `0.5px solid ${borderColor}`,
            borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 14,
          }}>{isDark ? "☀️" : "🌙"}</button>
        </div>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 56, height: 56, marginBottom: 16 }} />
          <h1 style={{ fontSize: 28, fontWeight: 700, color: textPrimary, letterSpacing: "-0.02em", margin: 0 }}>
            Auth<span style={{ color: "#34d399" }}>Once</span>
          </h1>
          <p style={{ color: textMuted, marginTop: 8, fontSize: 15, fontWeight: 300 }}>
            {t(lang, "tagline")}
          </p>
        </div>

        <div style={{
          background: cardBg, border: `0.5px solid ${borderColor}`,
          borderRadius: 16, padding: 32, width: "100%", maxWidth: 380,
          textAlign: "center",
        }}>
          <p style={{ color: textMuted, marginBottom: 24, fontSize: 14, fontWeight: 300 }}>
            {t(lang, "connect_description")}
          </p>
          <ConnectButton />
          <p style={{ color: isDark ? "#334155" : "#94a3b8", fontSize: 12, marginTop: 16 }}>
            {t(lang, "network_hint")} <strong style={{ color: textMuted }}>{t(lang, "network_name")}</strong> {t(lang, "network_suffix")}
          </p>
        </div>

        <div style={{ display: "flex", gap: 24, fontSize: 12, color: isDark ? "#334155" : "#94a3b8" }}>
          <span>{t(lang, "vault_verified")} ✅</span>
          <span>{t(lang, "registry_verified")} ✅</span>
          <span>Base Sepolia</span>
        </div>
      </div>
    );
  }

  // Connected — full dashboard
  return (
    <div style={{ minHeight: "100vh", background: isDark ? "#080c14" : "#f8fafc", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 58,
        borderBottom: `0.5px solid ${borderColor}`,
        background: navBg, backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: textPrimary, letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: "#34d399" }}>Once</span>
          </span>
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 99,
            background: "rgba(59,130,246,0.15)", color: "#3b82f6", fontWeight: 600,
          }}>Base Sepolia</span>
          {isAdmin && (
            <span style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 99,
              background: "rgba(251,191,36,0.15)", color: "#d97706", fontWeight: 600,
            }}>Admin</span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, background: switcherBg, borderRadius: 8, padding: 4 }}>
          <button onClick={() => setView("subscriber")} style={{
            background: view === "subscriber" ? switcherActiveBg : "none",
            border: "none", borderRadius: 6, padding: "5px 14px",
            color: view === "subscriber" ? textPrimary : textMuted,
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>
            {t(lang, "nav_subscriptions")}
          </button>
          <button onClick={() => setView("merchant")} style={{
            background: view === "merchant" ? switcherActiveBg : "none",
            border: "none", borderRadius: 6, padding: "5px 14px",
            color: view === "merchant" ? textPrimary : textMuted,
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>
            {t(lang, "nav_merchant")}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={toggleTheme} style={{
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            border: isDark ? "0.5px solid rgba(255,255,255,0.1)" : "0.5px solid rgba(0,0,0,0.1)",
            borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 15,
          }}>{isDark ? "☀️" : "🌙"}</button>
          <ConnectButton />
        </div>
      </nav>

      {view === "subscriber" && <Dashboard address={address} isAdmin={isAdmin} isDark={isDark} />}
      {view === "merchant" && <MerchantDashboard address={address} isDark={isDark} />}
    </div>
  );
}
