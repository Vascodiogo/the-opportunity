// src/components/AdminLogin.jsx — Visual redesign May 2026
// Logic: unchanged. Visual: CSS variables, solid green button.
import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://the-opportunity-production.up.railway.app";

export default function AdminLogin({ onLogin, isDark }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Invalid email or password."); setLoading(false); return; }
      sessionStorage.setItem("admin_token", data.token);
      sessionStorage.setItem("admin_email", email);
      onLogin(data.token);
    } catch {
      setError("Cannot connect to server. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "var(--bg-primary)", padding: 24,
      fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif",
    }}>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img src="/logo.svg" alt="AuthOnce" style={{ width: 48, height: 48, marginBottom: 12 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
          Auth<span style={{ color: "var(--green)" }}>Once</span>
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4, fontWeight: 300 }}>
          Admin Portal
        </p>
      </div>

      {/* Login card */}
      <div style={{
        background: "var(--bg-card)", border: "0.5px solid var(--border)",
        borderRadius: 16, padding: 36, width: "100%", maxWidth: 380,
        boxShadow: "var(--shadow)",
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px", letterSpacing: "-0.01em" }}>
          Sign in to your account
        </h2>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vasco@authonce.io"
              required
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(248,113,113,0.1)", border: "0.5px solid rgba(248,113,113,0.3)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 13, color: "var(--red)",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", background: "var(--green)", border: "none",
              borderRadius: 8, padding: "12px",
              color: "var(--bg-primary)", fontSize: 14, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontFamily: "inherit", letterSpacing: "-0.01em",
            }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>
      </div>

      <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 24, textAlign: "center" }}>
        Admin access only · AuthOnce Protocol · BUSL-1.1
      </p>
    </div>
  );
}
