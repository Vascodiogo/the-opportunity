// src/App.jsx
import { useState, useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { shortAddress, ADMIN_ADDRESS } from "./config.js";
import Dashboard from "./components/Dashboard.jsx";
import MerchantDashboard from "./components/MerchantDashboard.jsx";

export default function App() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  const [view, setView] = useState("subscriber");

  // ── Theme ────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-dark", "theme-light");
    root.classList.add(`theme-${theme}`);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const isDark = theme === "dark";

  // ── Theme-aware styles ───────────────────────────────────────────────
  const navBg = isDark ? "rgba(8,12,20,0.95)" : "rgba(248,250,252,0.95)";
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const textPrimary = isDark ? "#f1f5f9" : "#0f172a";
  const textMuted = isDark ? "#475569" : "#94a3b8";
  const switcherBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
  const switcherActiveBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  // ── Not connected ────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        minHeight: "100vh", gap: 24, padding: 24,
        background: isDark ? "#080c14" : "#f8fafc",
      }}>
        {/* Theme toggle on landing page */}
        <div style={{ position: "absolute", top: 20, right: 24 }}>
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
        </div>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: "#080c14",
          }}>O</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: textPrimary, letterSpacing: "-0.02em" }}>
            The Opportunity
          </h1>
          <p style={{ color: textMuted, marginTop: 8, fontSize: 15 }}>
            Authorize once. Pay forever. Stay in control.
          </p>
        </div>

        <div style={{
          background: cardBg,
          border: `0.5px solid ${borderColor}`,
          borderRadius: 16, padding: 32, width: "100%", maxWidth: 380,
          textAlign: "center",
          boxShadow: isDark ? "none" : "0 4px 24px rgba(0,0,0,0.08)",
        }}>
          <p style={{ color: textMuted, marginBottom: 24, fontSize: 14 }}>
            Connect your wallet to manage your subscriptions on Base Sepolia.
          </p>
          <ConnectButton />
          <p style={{ color: isDark ? "#334155" : "#94a3b8", fontSize: 12, marginTop: 16 }}>
            Make sure you're on the <strong style={{ color: textMuted }}>Base Sepolia</strong> network
          </p>
        </div>

        <div style={{ display: "flex", gap: 24, fontSize: 12, color: isDark ? "#334155" : "#94a3b8" }}>
          <span>SubscriptionVault verified ✅</span>
          <span>MerchantRegistry verified ✅</span>
          <span>Base Sepolia</span>
        </div>
      </div>
    );
  }

  // ── Connected ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: isDark ? "#080c14" : "#f8fafc" }}>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 58,
        borderBottom: `0.5px solid ${borderColor}`,
        background: navBg, backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Left — logo + badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: "#080c14",
          }}>O</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
            The Opportunity
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

        {/* Centre — view switcher */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: switcherBg, borderRadius: 8, padding: 4,
        }}>
          <button
            onClick={() => setView("subscriber")}
            style={{
              background: view === "subscriber" ? switcherActiveBg : "none",
              border: "none", borderRadius: 6, padding: "5px 14px",
              color: view === "subscriber" ? textPrimary : textMuted,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            My Subscriptions
          </button>
          <button
            onClick={() => setView("merchant")}
            style={{
              background: view === "merchant" ? switcherActiveBg : "none",
              border: "none", borderRadius: 6, padding: "5px 14px",
              color: view === "merchant" ? textPrimary : textMuted,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            Merchant Portal
          </button>
        </div>

        {/* Right — theme toggle + connect button */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          <ConnectButton />
        </div>
      </nav>

      {view === "subscriber" && <Dashboard address={address} isAdmin={isAdmin} isDark={isDark} />}
      {view === "merchant" && <MerchantDashboard address={address} isDark={isDark} />}
    </div>
  );
}

// ── Theme Toggle Button ────────────────────────────────────────────────────
function ThemeToggle({ isDark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        border: isDark ? "0.5px solid rgba(255,255,255,0.1)" : "0.5px solid rgba(0,0,0,0.1)",
        borderRadius: 8, padding: "6px 10px", cursor: "pointer",
        fontSize: 15, lineHeight: 1, display: "flex", alignItems: "center",
        transition: "all 0.15s",
      }}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
