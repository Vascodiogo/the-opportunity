// src/components/PayPage.jsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAccount, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { VAULT_ADDRESS, VAULT_ABI, INTERVAL_NAMES } from "../config.js";

const API_BASE = "https://the-opportunity-production.up.railway.app";

export default function PayPage() {
  const { merchantAddress, productSlug } = useParams();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [merchant, setMerchant] = useState(null);
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | subscribing | success | error
  const [errorMsg, setErrorMsg] = useState("");

  // Load merchant info from API
  useEffect(() => {
    if (!merchantAddress) return;
    fetch(`${API_BASE}/api/merchants/${merchantAddress}`)
      .then(r => r.json())
      .then(data => setMerchant(data))
      .catch(() => setMerchant({ business_name: null }));
  }, [merchantAddress]);

  // Load product from localStorage (merchant's products are stored there)
  useEffect(() => {
    if (!merchantAddress || !productSlug) return;
    const saved = JSON.parse(localStorage.getItem(`products_${merchantAddress}`) || "[]");
    const found = saved.find(p => p.name.toLowerCase().replace(/\s+/g, "-") === productSlug);
    setProduct(found || null);
  }, [merchantAddress, productSlug]);

  const handleSubscribe = async () => {
    if (!isConnected || !address) return;
    setStatus("subscribing");
    setErrorMsg("");
    try {
      const amountRaw = BigInt(Math.round((product.amount || 0) * 1_000_000));
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: [{ type: "function", name: "createSubscription", stateMutability: "nonpayable", inputs: [{ name: "merchant", type: "address" }, { name: "safeVault", type: "address" }, { name: "amount", type: "uint256" }, { name: "interval", type: "uint8" }, { name: "guardian", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
        functionName: "createSubscription",
        args: [
          merchantAddress,
          address,
          amountRaw,
          Number(product.interval),
          "0x0000000000000000000000000000000000000000",
        ],
      });
      setStatus("success");
    } catch (err) {
      setErrorMsg(err.shortMessage || err.message || "Transaction failed");
      setStatus("error");
    }
  };

  const intervalLabel = product ? INTERVAL_NAMES[product.interval] : "";
  const merchantName = merchant?.business_name || `${merchantAddress?.slice(0, 6)}...${merchantAddress?.slice(-4)}`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c14",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Background glow */}
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
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: 40,
        width: "100%",
        maxWidth: 420,
        position: "relative",
        boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
      }}>

        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: 40, right: 40, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(52,211,153,0.4), transparent)",
        }} />

        {!product ? (
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
            <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6 }}>
              Your subscription to <strong style={{ color: "#94a3b8" }}>{product.name}</strong> is now active.
              Payments will be pulled automatically from your vault.
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
              borderRadius: 12,
              padding: "20px 24px",
              marginBottom: 28,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 6 }}>
                {product.name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>
                  ${product.amount?.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>USDC / {intervalLabel}</span>
              </div>
            </div>

            {/* How it works */}
            <div style={{ marginBottom: 28 }}>
              {[
                ["🔐", "Connect your wallet or create one in seconds"],
                ["💳", "Fund your vault with a credit card"],
                ["⚡", "First payment pulled instantly — then automatically each period"],
                ["🛡️", "Cancel anytime — your funds stay in your wallet"],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>

            {/* Action */}
            {!isConnected ? (
              <div>
                <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 12 }}>
                  Connect your wallet to continue
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ConnectButton />
                </div>
              </div>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={status === "subscribing"}
                style={{
                  width: "100%",
                  background: status === "subscribing"
                    ? "rgba(52,211,153,0.3)"
                    : "linear-gradient(135deg, #34d399, #3b82f6)",
                  border: "none",
                  borderRadius: 12,
                  color: "#080c14",
                  fontWeight: 800,
                  fontSize: 15,
                  padding: "14px 24px",
                  cursor: status === "subscribing" ? "not-allowed" : "pointer",
                  letterSpacing: "-0.01em",
                  transition: "opacity 0.15s",
                }}
              >
                {status === "subscribing" ? "Processing..." : `Subscribe — $${product.amount?.toFixed(2)} USDC/${intervalLabel}`}
              </button>
            )}

            {status === "error" && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#f87171", textAlign: "center" }}>
                {errorMsg}
              </div>
            )}

            {/* Connected wallet info */}
            {isConnected && (
              <div style={{ marginTop: 12, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
                Paying from {address?.slice(0, 6)}...{address?.slice(-4)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
        Powered by <span style={{ color: "#34d399" }}>AuthOnce</span> · Non-custodial · Base Network
      </div>
    </div>
  );
}
