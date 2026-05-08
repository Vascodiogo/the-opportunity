// src/components/PayPage.jsx
// Subscriber pay link page — authonce.io/pay/:merchantAddress/:productSlug
// Google OAuth login → JWT token → wallet created server-side → subscribe

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { INTERVAL_NAMES } from "../config.js";

const API_BASE = "https://the-opportunity-production.up.railway.app";

export default function PayPage() {
  const { merchantAddress, productSlug } = useParams();

  const [merchant, setMerchant] = useState(null);
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | ready | subscribing | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [subscriber, setSubscriber] = useState(null);
  const [productLoading, setProductLoading] = useState(true);

  // Load merchant info from API
  useEffect(() => {
    if (!merchantAddress) return;
    fetch(`${API_BASE}/api/merchants/${merchantAddress}`)
      .then(r => r.json())
      .then(data => setMerchant(data))
      .catch(() => setMerchant({ business_name: null }));
  }, [merchantAddress]);

  // Load product from API
  useEffect(() => {
    if (!merchantAddress || !productSlug) return;
    fetch(`${API_BASE}/api/products/${merchantAddress}/${productSlug}`)
      .then(r => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(data => {
        // Normalize interval string to numeric for INTERVAL_NAMES lookup
        const INTERVAL_MAP = { weekly: 0, monthly: 1, yearly: 2 };
        setProduct({ ...data, interval: INTERVAL_MAP[data.interval] ?? data.interval });
      })
      .catch(() => setProduct(null))
      .finally(() => setProductLoading(false));
  }, [merchantAddress, productSlug]);

  // Check for subscriber_token in URL (returned from Google OAuth)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("subscriber_token");
    if (!token) return;

    // Store token
    localStorage.setItem("subscriber_token", token);

    // Remove token from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("subscriber_token");
    window.history.replaceState({}, "", url.toString());

    // Fetch subscriber profile
    fetch(`${API_BASE}/api/subscriber/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setSubscriber(data);
        setStatus("ready");
      })
      .catch(() => setErrorMsg("Login failed. Please try again."));
  }, []);

  // Check for existing token on page load
  useEffect(() => {
    const token = localStorage.getItem("subscriber_token");
    if (!token) return;
    fetch(`${API_BASE}/api/subscriber/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error("Token expired");
        return r.json();
      })
      .then(data => {
        setSubscriber(data);
        setStatus("ready");
      })
      .catch(() => localStorage.removeItem("subscriber_token"));
  }, []);

  const handleLogin = () => {
    const returnTo = window.location.pathname + window.location.search;
    const origin = window.location.origin;
    window.location.href = `${API_BASE}/auth/google?returnTo=${encodeURIComponent(returnTo)}&origin=${encodeURIComponent(origin)}`;
  };

  const handleLogout = () => {
    localStorage.removeItem("subscriber_token");
    setSubscriber(null);
    setStatus("idle");
  };

  const handleSubscribe = async () => {
    if (!subscriber || !product) return;
    setStatus("subscribing");
    setErrorMsg("");
    try {
      // TODO: Stripe Crypto Checkout — fund vault then createSubscription on-chain
      await new Promise(r => setTimeout(r, 1500));
      setStatus("success");
    } catch (err) {
      setErrorMsg(err.message || "Subscription failed. Please try again.");
      setStatus("ready");
    }
  };

  const intervalLabel = product ? INTERVAL_NAMES[product.interval] : "";
  const merchantName = merchant?.business_name || `${merchantAddress?.slice(0, 6)}...${merchantAddress?.slice(-4)}`;
  const isPortuguese = navigator.language?.toLowerCase().startsWith("pt");

  const s = {
    page: {
      minHeight: "100vh",
      background: "#080c14",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    },
    card: {
      background: "rgba(255,255,255,0.03)",
      border: "0.5px solid rgba(255,255,255,0.08)",
      borderRadius: 20,
      padding: 40,
      width: "100%",
      maxWidth: 420,
      position: "relative",
      boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
    },
    btn: {
      width: "100%",
      border: "none",
      borderRadius: 12,
      fontWeight: 800,
      fontSize: 15,
      padding: "14px 24px",
      cursor: "pointer",
      letterSpacing: "-0.01em",
      transition: "opacity 0.15s",
    },
    btnPrimary: {
      background: "linear-gradient(135deg, #34d399, #3b82f6)",
      color: "#080c14",
    },
    btnSecondary: {
      background: "rgba(255,255,255,0.05)",
      border: "0.5px solid rgba(255,255,255,0.1)",
      color: "#94a3b8",
      marginTop: 10,
    },
    btnDisabled: {
      background: "rgba(52,211,153,0.3)",
      color: "#080c14",
      cursor: "not-allowed",
    },
    userBadge: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "rgba(52,211,153,0.08)",
      border: "0.5px solid rgba(52,211,153,0.2)",
      borderRadius: 10,
      padding: "10px 14px",
      marginBottom: 16,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: "50%",
      background: "linear-gradient(135deg, #34d399, #3b82f6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 14,
      fontWeight: 700,
      color: "#080c14",
      flexShrink: 0,
      overflow: "hidden",
    },
  };

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>

      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(52,211,153,0.08) 0%, transparent 70%)",
      }} />

      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, margin: "0 auto 12px",
          background: "linear-gradient(135deg, #34d399, #3b82f6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 800, color: "#080c14",
        }}>A</div>
        <div style={{ fontSize: 13, color: "#94a3b8", letterSpacing: "0.05em" }}>AUTHONCE</div>
      </div>

      {/* Card */}
      <div style={s.card}>
        <div style={{
          position: "absolute", top: 0, left: 40, right: 40, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(52,211,153,0.4), transparent)",
        }} />

        {/* Product not found */}
        {productLoading ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8", fontSize: 13 }}>Loading...</div>
        ) : !product ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Product not found</div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>This pay link may be invalid or expired.</div>
          </div>

        ) : status === "success" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(52,211,153,0.12)",
              border: "1px solid rgba(52,211,153,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, margin: "0 auto 20px",
            }}>✓</div>
            <div style={{ color: "#34d399", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              You're subscribed!
            </div>
            <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              Your subscription to <strong style={{ color: "#f1f5f9" }}>{product.name}</strong> is now active.
              Payments will be collected automatically each period.
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              Manage your subscription at{" "}
              <a href="/my-subscriptions" style={{ color: "#34d399" }}>
                authonce.io/my-subscriptions
              </a>
            </div>
          </div>

        ) : (
          <>
            {/* Merchant */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                Subscribing to
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>
                {merchantName}
              </div>
            </div>

            {/* Product */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "20px 24px", marginBottom: 28,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 6 }}>
                {product.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>
                  ${product.amount?.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>/ {intervalLabel}</span>
              </div>
            </div>

            {/* Steps */}
            <div style={{ marginBottom: 28 }}>
              {[
                ["💳", isPortuguese ? "Pay by card, MB Way, or Multibanco" : "Pay by card — no crypto needed"],
                ["⚡", "Authorise once — payments collected automatically each period"],
                ["🔔", "3-day notice sent before every payment"],
                ["🛡️", "Cancel anytime at authonce.io/my-subscriptions"],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>

            {/* Error */}
            {errorMsg && (
              <div style={{
                background: "rgba(248,113,113,0.08)",
                border: "0.5px solid rgba(248,113,113,0.2)",
                borderRadius: 8, padding: "10px 14px",
                fontSize: 12, color: "#f87171",
                textAlign: "center", marginBottom: 16,
              }}>
                {errorMsg}
              </div>
            )}

            {/* Idle — show Google login button */}
            {status === "idle" && (
              <>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleLogin}>
                  Sign in with Google →
                </button>
                <div style={{ fontSize: 11, color: "#334155", textAlign: "center", marginTop: 12 }}>
                  No MetaMask required · No crypto knowledge needed
                </div>
              </>
            )}

            {/* Ready — show user badge + subscribe */}
            {status === "ready" && subscriber && (
              <>
                <div style={s.userBadge}>
                  <div style={s.avatar}>
                    {subscriber.avatar_url ? (
                      <img src={subscriber.avatar_url} alt="" style={{ width: 36, height: 36, objectFit: "cover" }} />
                    ) : (
                      (subscriber.name || subscriber.email || "U")[0].toUpperCase()
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                      {subscriber.name || subscriber.email}
                    </div>
                    <div style={{ fontSize: 11, color: "#34d399" }}>✓ Signed in with Google</div>
                  </div>
                </div>

                <button
                  style={{ ...s.btn, ...s.btnPrimary, opacity: status === "subscribing" ? 0.7 : 1 }}
                  onClick={handleSubscribe}
                  disabled={status === "subscribing"}
                >
                  {status === "subscribing" ? "Processing..." : `Subscribe — $${product.amount?.toFixed(2)} / ${intervalLabel} →`}
                </button>

                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleLogout}>
                  Sign out
                </button>

                <div style={{ fontSize: 11, color: "#334155", textAlign: "center", marginTop: 12 }}>
                  Wallet: {subscriber.wallet_address?.slice(0, 6)}...{subscriber.wallet_address?.slice(-4)} · Secured by Base Network
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
        Powered by <span style={{ color: "#34d399" }}>AuthOnce</span> · Non-custodial · Base Network
      </div>
    </div>
  );
}
