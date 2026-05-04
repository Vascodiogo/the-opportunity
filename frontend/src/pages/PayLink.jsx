// src/pages/PayLink.jsx — UI only, Web3Auth coming next session
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const INTERVAL_NAMES = { 0: "Weekly", 1: "Monthly", 2: "Yearly" };

export default function PayLink() {
  const { merchantId, productId } = useParams();
  const [product, setProduct] = useState(null);
  const [step, setStep] = useState("details");

  useEffect(() => {
    const products = JSON.parse(localStorage.getItem(`products_${merchantId}`) || "[]");
    const found = products.find(p =>
      p.id === productId ||
      p.name.toLowerCase().replace(/\s+/g, "-") === productId
    );
    if (found) setProduct(found);
  }, [merchantId, productId]);

  const s = {
    page: {
      minHeight: "100vh",
      background: "#080c14",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "'DM Sans', sans-serif",
    },
    card: {
      background: "rgba(255,255,255,0.03)",
      border: "0.5px solid rgba(255,255,255,0.08)",
      borderRadius: 20,
      padding: "36px 32px",
      width: "100%",
      maxWidth: 440,
      boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
    },
    logo: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      justifyContent: "center",
      marginBottom: 32,
    },
    btn: {
      width: "100%",
      padding: "14px 20px",
      borderRadius: 12,
      border: "none",
      fontSize: 15,
      fontWeight: 700,
      cursor: "pointer",
      background: "linear-gradient(135deg, #34d399, #3b82f6)",
      color: "#080c14",
      marginTop: 24,
    },
    divider: {
      height: "0.5px",
      background: "rgba(255,255,255,0.06)",
      margin: "24px 0",
    },
    featureRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 0",
      fontSize: 13,
      color: "#64748b",
    },
    dot: {
      width: 6, height: 6,
      borderRadius: "50%",
      background: "#34d399",
      flexShrink: 0,
    },
  };

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={s.card}>

        {/* Logo */}
        <div style={s.logo}>
          <img src="/logo.svg" alt="AuthOnce" style={{ width: 24, height: 24 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>
            Auth<span style={{ color: "#34d399" }}>Once</span>
          </span>
        </div>

        {/* Product info */}
        <div style={{ textAlign: "center", marginBottom: 8, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {merchantId}
        </div>
        <div style={{ textAlign: "center", fontSize: 24, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
          {product?.name || "Subscription"}
        </div>
        <div style={{ textAlign: "center", fontSize: 40, fontWeight: 700, color: "#34d399", fontFamily: "monospace" }}>
          ${product?.amount?.toFixed(2) || "—"}
        </div>
        <div style={{ textAlign: "center", fontSize: 13, color: "#475569", marginBottom: 8 }}>
          per {INTERVAL_NAMES[product?.interval]?.toLowerCase() || "month"} · USDC
        </div>

        <div style={s.divider} />

        {/* Features */}
        {[
          "Authorise once — never enter details again",
          "Cancel anytime from authonce.io/my-subscriptions",
          "3-day notice before every payment",
          "Secured by Base Network",
        ].map(f => (
          <div key={f} style={s.featureRow}>
            <div style={s.dot} />
            {f}
          </div>
        ))}

        <div style={s.divider} />

        {/* CTA */}
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>
          Sign in to subscribe — no crypto knowledge needed.
        </div>
        <button style={s.btn} onClick={() => alert("Web3Auth login — coming next session ✅")}>
          Sign in with Google or Email →
        </button>
        <div style={{ fontSize: 11, color: "#334155", textAlign: "center", marginTop: 12 }}>
          No MetaMask required · Powered by AuthOnce
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, fontSize: 11, color: "#334155" }}>
        <a href="https://authonce.io" style={{ color: "#475569", textDecoration: "none" }}>authonce.io</a>
        {" · "}
        <a href="https://authonce.io/legal.html" style={{ color: "#475569", textDecoration: "none" }}>Terms</a>
        {" · "}
        <a href="https://authonce.io/legal.html" style={{ color: "#475569", textDecoration: "none" }}>Privacy</a>
      </div>
    </div>
  );
}