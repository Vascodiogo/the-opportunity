// src/components/AdminLogin.jsx — AuthOnce Admin Login
import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

export default function AdminLogin({ onLogin, isDark }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const bg        = isDark ? "#080c14" : "#f8fafc";
  const cardBg    = isDark ? "rgba(255,255,255,0.03)" : "#ffffff";
  const border    = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const text      = isDark ? "#f1f5f9" : "#0f172a";
  const muted     = isDark ? "#64748b" : "#94a3b8";
  const inputBg   = isDark ? "rgba(255,255,255,0.04)" : "#f8fafc";
  const accent    = "#34d399";

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Invalid email or password.");
        setLoading(false);
        return;
      }

      // Store token in sessionStorage (cleared on tab close)
      sessionStorage.setItem("admin_token", data.token);
      sessionStorage.setItem("admin_email", email);
      onLogin(data.token);

    } catch (err) {
      setError("Cannot connect to server. Please try again.");
    }

    setLoading(false);
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: bg, padding: 24,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img src="/logo.svg" alt="AuthOnce" style={{ width: 48, height: 48, marginBottom: 12 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: text, margin: 0, letterSpacing: "-0.02em" }}>
          Auth<span style={{ color: accent }}>Once</span>
        </h1>
        <p style={{ color: muted, fontSize: 13, marginTop: 4, fontWeight: 300 }}>
          Admin Portal
        </p>
      </div>

      {/* Login card */}
      <div style={{
        background: cardBg, border: `0.5px solid ${border}`,
        borderRadius: 16, padding: 36, width: "100%", maxWidth: 380,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: text, margin: "0 0 24px", letterSpacing: "-0.01em" }}>
          Sign in to your account
        </h2>

        <form onSubmit={handleLogin}>
          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: muted, display: "block", marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vasco@authonce.io"
              required
              style={{
                width: "100%", boxSizing: "border-box",
                background: inputBg, border: `0.5px solid ${border}`,
                borderRadius: 8, padding: "10px 14px",
                color: text, fontSize: 14, outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: muted, display: "block", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: "100%", boxSizing: "border-box",
                background: inputBg, border: `0.5px solid ${border}`,
                borderRadius: 8, padding: "10px 14px",
                color: text, fontSize: 14, outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 13, color: "#f87171",
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "rgba(52,211,153,0.5)" : "linear-gradient(135deg, #34d399, #3b82f6)",
              border: "none", borderRadius: 8, padding: "12px",
              color: "#080c14", fontSize: 14, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>
      </div>

      {/* Footer note */}
      <p style={{ color: isDark ? "#334155" : "#94a3b8", fontSize: 11, marginTop: 24, textAlign: "center" }}>
        Admin access only · AuthOnce Protocol · BUSL-1.1
      </p>
    </div>
  );
}
