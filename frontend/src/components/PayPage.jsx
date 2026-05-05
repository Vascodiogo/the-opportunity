// src/components/PayPage.jsx
// Subscriber pay link page — authonce.io/pay/:merchantAddress/:productSlug
// Web3Auth Google/email login → invisible wallet → subscribe

import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { VAULT_ADDRESS, INTERVAL_NAMES } from "../config.js";

const API_BASE = "https://the-opportunity-production.up.railway.app";
const WEB3AUTH_CLIENT_ID = import.meta.env.VITE_WEB3AUTH_CLIENT_ID || "BP0M4iPUqWUUdUAHlPekAVRS5gvHnjy1zQbICL-Fth7f3EKOfiyvm6uKIcYlmHQ_DLQVNFEqhc2xVZg1jmhUIRs";
export default function PayPage() {
  const { merchantAddress, productSlug } = useParams();

  const [merchant, setMerchant] = useState(null);
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | logging_in | ready | subscribing | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [user, setUser] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [web3auth, setWeb3auth] = useState(null);
  const initRef = useRef(false);

  // Load merchant info from API
  useEffect(() => {
    if (!merchantAddress) return;
    fetch(`${API_BASE}/api/merchants/${merchantAddress}`)
      .then(r => r.json())
      .then(data => setMerchant(data))
      .catch(() => setMerchant({ business_name: null }));
  }, [merchantAddress]);

  // Load product from localStorage
  useEffect(() => {
    if (!merchantAddress || !productSlug) return;
    const saved = JSON.parse(localStorage.getItem(`products_${merchantAddress}`) || "[]");
    const found = saved.find(p => p.name.toLowerCase().replace(/\s+/g, "-") === productSlug);
    setProduct(found || null);
  }, [merchantAddress, productSlug]);

  // Initialise Web3Auth lazily — only load when user clicks login
  const initWeb3Auth = async () => {
    if (initRef.current && web3auth) return web3auth;
    initRef.current = true;

    try {
      console.log("window.Modal:", window.Modal, "window.EthereumProvider:", window.EthereumProvider);
      const EthereumPrivateKeyProvider = window.EthereumProvider?.EthereumPrivateKeyProvider;

      const chainConfig = {
        chainNamespace: "eip155",
        chainId: "0x14a34",
        rpcTarget: "https://sepolia.base.org",
        displayName: "Base Sepolia",
        blockExplorerUrl: "https://sepolia.basescan.org",
        ticker: "ETH",
        tickerName: "Ethereum",
      };

      const privateKeyProvider = new EthereumPrivateKeyProvider({
        config: { chainConfig },
      });

      const auth = new Web3Auth({
        clientId: WEB3AUTH_CLIENT_ID,
        web3AuthNetwork: "sapphire_devnet",
        privateKeyProvider,
      });

      await auth.initModal();
      setWeb3auth(auth);

      if (auth.connected) {
        const accounts = await auth.provider.request({ method: "eth_accounts" });
        setWalletAddress(accounts[0]);
        const userInfo = await auth.getUserInfo();
        setUser(userInfo);
        setStatus("ready");
      }

      return auth;
    } catch (err) {
      console.error("Web3Auth init error:", err);
      setErrorMsg("Failed to initialise login. Please refresh and try again.");
      setStatus("error");
      return null;
    }
  };

  const handleLogin = async () => {
    setStatus("logging_in");
    setErrorMsg("");
    try {
      const auth = await initWeb3Auth();
      if (!auth) return;

      const provider = await auth.connect();
      const accounts = await provider.request({ method: "eth_accounts" });
      setWalletAddress(accounts[0]);
      const userInfo = await auth.getUserInfo();
      setUser(userInfo);
      setStatus("ready");
    } catch (err) {
      console.error("Login error:", err);
      if (err.message !== "User closed the modal") {
        setErrorMsg("Login failed. Please try again.");
      }
      setStatus("idle");
    }
  };

  const handleLogout = async () => {
    if (web3auth) await web3auth.logout();
    setUser(null);
    setWalletAddress(null);
    setStatus("idle");
    initRef.current = false;
    setWeb3auth(null);
  };

  const handleSubscribe = async () => {
    if (!walletAddress || !product) return;
    setStatus("subscribing");
    setErrorMsg("");
    try {
      // TODO: Stripe Crypto Checkout — fund vault then createSubscription
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
      marginBottom: 0,
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
      width: 32,
      height: 32,
      borderRadius: "50%",
      background: "linear-gradient(135deg, #34d399, #3b82f6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 13,
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
        {!product ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Product not found</div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>This pay link may be invalid or expired.</div>
          </div>

        ) : status === "success" ? (
          /* Success */
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
              <a href="https://authonce.io/my-subscriptions" style={{ color: "#34d399" }}>
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

            {/* Idle — show login button */}
            {status === "idle" && (
              <>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleLogin}>
                  Sign in with Google or Email →
                </button>
                <div style={{ fontSize: 11, color: "#334155", textAlign: "center", marginTop: 12 }}>
                  No MetaMask required · No crypto knowledge needed
                </div>
              </>
            )}

            {/* Logging in */}
            {status === "logging_in" && (
              <button style={{ ...s.btn, ...s.btnDisabled }} disabled>
                Opening login...
              </button>
            )}

            {/* Ready — show user badge + subscribe */}
            {status === "ready" && (
              <>
                <div style={s.userBadge}>
                  <div style={s.avatar}>
                    {user?.profileImage ? (
                      <img src={user.profileImage} alt="" style={{ width: 32, height: 32, objectFit: "cover" }} />
                    ) : (
                      (user?.name || user?.email || "U")[0].toUpperCase()
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                      {user?.name || user?.email}
                    </div>
                    <div style={{ fontSize: 11, color: "#34d399" }}>✓ Signed in</div>
                  </div>
                </div>

                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleSubscribe}>
                  Subscribe — ${product.amount?.toFixed(2)} / {intervalLabel} →
                </button>

                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleLogout}>
                  Sign out
                </button>

                <div style={{ fontSize: 11, color: "#334155", textAlign: "center", marginTop: 12 }}>
                  Wallet: {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)} · Secured by Base Network
                </div>
              </>
            )}

            {/* Subscribing */}
            {status === "subscribing" && (
              <button style={{ ...s.btn, ...s.btnDisabled }} disabled>
                Processing...
              </button>
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
