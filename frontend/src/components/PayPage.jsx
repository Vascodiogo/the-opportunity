// src/components/PayPage.jsx
// Subscriber pay link page — authonce.io/pay/:merchantAddress/:productSlug
//
// Crypto-native flow: connect wallet → approve USDC → createSubscription on-chain
// Trial support:      ?trial=N in URL → N free days before first payment
// Intro pricing:      loaded from product API (introAmount, introPulls)

import { VAULT_ADDRESS, USDC_ADDRESS, VAULT_ABI, INTERVAL_NAMES } from "../config.js";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  useAccount, useDisconnect,
  useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useChainId, useSwitchChain,
} from "wagmi";
import { parseUnits } from "viem";
import { baseSepolia } from "wagmi/chains";

const API_BASE = "https://the-opportunity-production.up.railway.app";

const USDC_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const INTERVAL_MAP = { weekly: 0, monthly: 1, yearly: 2 };

function getTrialDays() {
  const raw = new URLSearchParams(window.location.search).get("trial");
  if (!raw) return 0;
  const n = parseInt(raw);
  if (isNaN(n) || n < 1) return 0;
  return Math.min(n, 60);
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  const steps = ["Sign in", "Payment", "Authorize"];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 28 }}>
      {steps.map((label, i) => {
        const idx     = i + 1;
        const done    = idx < current;
        const active  = idx === current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: done ? "rgba(52,211,153,0.2)" : active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                border: `1.5px solid ${done ? "rgba(52,211,153,0.5)" : active ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.1)"}`,
                color: done ? "#34d399" : active ? "#3b82f6" : "#475569",
              }}>
                {done ? "✓" : idx}
              </div>
              <span style={{ fontSize: 10, color: done ? "#34d399" : active ? "#f1f5f9" : "#334155", fontWeight: active ? 600 : 400, letterSpacing: "0.02em" }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 48, height: 1, background: done ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.06)", margin: "0 4px", marginBottom: 16 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Merchant avatar ──────────────────────────────────────────────────────────
function MerchantAvatar({ name, size = 44 }) {
  const initials = name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  const colors = [
    ["#1e3a5f", "#3b82f6"],
    ["#1a3a2e", "#34d399"],
    ["#3b1a2e", "#ec4899"],
    ["#2e1a3b", "#a78bfa"],
    ["#3b2a1a", "#f59e0b"],
  ];
  const pick = colors[(initials.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: 12,
      background: `linear-gradient(135deg, ${pick[0]}, ${pick[1]}22)`,
      border: `1px solid ${pick[1]}33`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, color: pick[1], flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ─── Trust signal row ─────────────────────────────────────────────────────────
function TrustRow({ icon, text }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ─── Step dot ────────────────────────────────────────────────────────────────
function Step({ n, label, active, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "0.5px solid rgba(255,255,255,0.04)" }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
        background: done ? "rgba(52,211,153,0.2)" : active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${done ? "rgba(52,211,153,0.4)" : active ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)"}`,
        color: done ? "#34d399" : active ? "#3b82f6" : "#475569",
      }}>
        {done ? "✓" : n}
      </div>
      <span style={{ fontSize: 13, color: done ? "#34d399" : active ? "#f1f5f9" : "#475569" }}>{label}</span>
      {active && !done && <span style={{ marginLeft: "auto", fontSize: 11, color: "#3b82f6" }}>In progress</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PayPage() {
  const { merchantAddress, productSlug } = useParams();

  const [resolvedAddress, setResolvedAddress] = useState(
    () => merchantAddress?.startsWith("0x") ? merchantAddress.toLowerCase() : null
  );

  const [trialDays] = useState(() => getTrialDays());

  useEffect(() => {
    if (!merchantAddress || merchantAddress.startsWith("0x")) return;
    fetch(`${API_BASE}/api/handle/${merchantAddress}`)
      .then(r => { if (!r.ok) throw new Error("Handle not found"); return r.json(); })
      .then(data => setResolvedAddress(data.wallet_address))
      .catch(() => setProductError("Pay link not found."));
  }, [merchantAddress]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setFlowStatus("success");
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const [product, setProduct]               = useState(null);
  const [merchant, setMerchant]             = useState(null);
  const [productLoading, setProductLoading] = useState(true);
  const [productError, setProductError]     = useState("");
  const [flowStatus, setFlowStatus]         = useState("idle");
  const [errorMsg, setErrorMsg]             = useState("");
  const [approveTxHash, setApproveTxHash]   = useState(null);
  const [subscribeTxHash, setSubscribeTxHash] = useState(null);
  const [selectedInterval, setSelectedInterval] = useState("monthly");
  const [paymentMethod, setPaymentMethod]   = useState("crypto");
  const [availableMethods, setAvailableMethods] = useState(null);
  const [stripeLoading, setStripeLoading]   = useState(false);

  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { disconnect }           = useDisconnect();
  const { switchChain }          = useSwitchChain();
  const { writeContractAsync }   = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash, query: { enabled: !!approveTxHash },
  });
  const { isSuccess: subscribeConfirmed } = useWaitForTransactionReceipt({
    hash: subscribeTxHash, query: { enabled: !!subscribeTxHash },
  });

  const isYearly     = selectedInterval === "yearly" && product?.yearly_amount;
  const activeAmount = isYearly ? product.yearly_amount : product?.amount;
  const amountRaw    = activeAmount ? parseUnits(activeAmount.toString(), 6) : 0n;

  const { data: currentAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: USDC_APPROVE_ABI, functionName: "allowance",
    args: [address, VAULT_ADDRESS], query: { enabled: !!address && !!product },
  });

  useEffect(() => {
    if (!resolvedAddress || !productSlug) return;
    fetch(`${API_BASE}/api/products/${resolvedAddress}/${productSlug}`)
      .then(r => { if (r.status === 451) throw new Error("451"); if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => setProduct({
        ...data,
        interval:      INTERVAL_MAP[data.interval] ?? data.interval,
        intro_amount:  parseFloat(data.intro_amount || 0),
        intro_pulls:   parseInt(data.intro_pulls || 0),
        yearly_amount: data.yearly_amount ? parseFloat(data.yearly_amount) : null,
      }))
      .catch(err => { setProductError(err.message); setProduct(null); })
      .finally(() => setProductLoading(false));
  }, [resolvedAddress, productSlug]);

  useEffect(() => {
    if (!resolvedAddress) return;
    fetch(`${API_BASE}/api/merchants/${resolvedAddress}`)
      .then(r => r.json())
      .then(data => setMerchant(data))
      .catch(() => setMerchant({ business_name: null }));
  }, [resolvedAddress]);

  useEffect(() => {
    if (!resolvedAddress || !productSlug) return;
    fetch(`${API_BASE}/api/products/${resolvedAddress}/${productSlug}/payment-methods`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) { setAvailableMethods(data.methods); setPaymentMethod("crypto"); }
      })
      .catch(() => setAvailableMethods(["crypto"]));
  }, [resolvedAddress, productSlug]);

  useEffect(() => {
    if (isConnected && flowStatus === "idle") setFlowStatus("connected");
    if (!isConnected && flowStatus === "connected") setFlowStatus("idle");
  }, [isConnected]);

  useEffect(() => {
    if (approveConfirmed && flowStatus === "approving") handleCreateSubscription();
  }, [approveConfirmed]);

  useEffect(() => {
    if (subscribeConfirmed && flowStatus === "subscribing") setFlowStatus("success");
  }, [subscribeConfirmed]);

  const isWrongNetwork = isConnected && chainId !== baseSepolia.id;
  const hasTrial       = trialDays > 0;
  const hasIntro       = product?.intro_amount > 0 && product?.intro_pulls > 0;

  const handleApprove = async () => {
    if (!product || !address || !resolvedAddress) {
      setErrorMsg("Could not resolve merchant. Please refresh."); return;
    }
    setErrorMsg("");
    if (currentAllowance !== undefined && currentAllowance >= amountRaw) {
      await handleCreateSubscription(); return;
    }
    setFlowStatus("approving");
    try {
      const hash = await writeContractAsync({
        address: USDC_ADDRESS, abi: USDC_APPROVE_ABI, functionName: "approve",
        args: [VAULT_ADDRESS, amountRaw],
      });
      setApproveTxHash(hash);
    } catch (err) {
      setErrorMsg(err.shortMessage || err.message || "Approval rejected.");
      setFlowStatus("connected");
    }
  };

  const handleCreateSubscription = async () => {
    if (!product || !address) return;
    setFlowStatus("subscribing");
    setErrorMsg("");
    try {
      const introAmountRaw = hasIntro && !isYearly ? parseUnits(product.intro_amount.toString(), 6) : 0n;
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "createSubscription",
        args: [
          resolvedAddress, address, amountRaw, introAmountRaw,
          isYearly ? 0n : BigInt(product.intro_pulls || 0),
          isYearly ? 2 : product.interval,
          ZERO_ADDRESS, BigInt(trialDays), 0n,
        ],
      });
      setSubscribeTxHash(hash);
    } catch (err) {
      setErrorMsg(err.shortMessage || err.message || "Transaction failed.");
      setFlowStatus("connected");
    }
  };

  const intervalLabel   = product ? INTERVAL_NAMES[product.interval] : "";
  const intervalPlural  = { weekly: "weeks", monthly: "months", yearly: "years" }[
    Object.keys(INTERVAL_MAP).find(k => INTERVAL_MAP[k] === product?.interval) || "monthly"
  ] || "months";
  const merchantName    = merchant?.business_name || `${(resolvedAddress || merchantAddress)?.slice(0, 6)}...${(resolvedAddress || merchantAddress)?.slice(-4)}`;
  const stepApprove     = flowStatus === "approving";
  const stepSubscribe   = flowStatus === "subscribing";
  const approvedDone    = approveConfirmed || (currentAllowance !== undefined && currentAllowance >= amountRaw && flowStatus !== "idle");
  const subscribedDone  = subscribeConfirmed;

  // Determine step indicator step
  const currentStep = flowStatus === "idle" ? 1 : (flowStatus === "connected" || flowStatus === "approving" || flowStatus === "subscribing") ? (approvedDone ? 3 : 2) : 3;

  return (
    <div style={{
      minHeight: "100vh", background: "#080c14",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Ambient glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(52,211,153,0.07) 0%, transparent 70%)",
      }} />

      {/* AuthOnce wordmark */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: "#080c14",
          }}>A</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: "#34d399" }}>Once</span>
          </span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "rgba(52,211,153,0.1)", color: "#34d399", fontWeight: 600 }}>
            verified
          </span>
        </div>
      </div>

      {/* Main card */}
      <div style={{
        background: "rgba(255,255,255,0.025)", border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 20, padding: "36px 36px 28px", width: "100%", maxWidth: 440,
        position: "relative", boxShadow: "0 40px 100px rgba(0,0,0,0.5)",
      }}>
        {/* Top shimmer line */}
        <div style={{
          position: "absolute", top: 0, left: 40, right: 40, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(52,211,153,0.35), transparent)",
        }} />

        {/* ── Loading ── */}
        {productLoading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#475569", fontSize: 13 }}>
            Loading...
          </div>
        )}

        {/* ── Not found / geofenced ── */}
        {!productLoading && !product && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            {productError === "451" ? (
              <>
                <div style={{ fontSize: 36, marginBottom: 14 }}>🚫</div>
                <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Service unavailable in your region</div>
                <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>This service is not available due to applicable sanctions regulations.</div>
                <div style={{ color: "#334155", fontSize: 11, marginTop: 12 }}>HTTP 451 — Unavailable For Legal Reasons</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 14 }}>🔍</div>
                <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Product not found</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>This pay link may be invalid or expired.</div>
              </>
            )}
          </div>
        )}

        {/* ── Success ── */}
        {!productLoading && product && flowStatus === "success" && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%", margin: "0 auto 20px",
              background: "rgba(52,211,153,0.1)", border: "1.5px solid rgba(52,211,153,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
            }}>✓</div>
            <div style={{ color: "#34d399", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>You're subscribed!</div>
            {hasTrial && (
              <div style={{ fontSize: 12, padding: "4px 14px", borderRadius: 99, display: "inline-block", background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600, marginBottom: 12 }}>
                🎁 {trialDays}-day free trial starts today
              </div>
            )}
            <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
              Your subscription to <strong style={{ color: "#f1f5f9" }}>{product.name}</strong> is active. Payments are collected automatically.
            </div>
            {subscribeTxHash && (
              <a href={`https://sepolia.basescan.org/tx/${subscribeTxHash}`} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 12, color: "#34d399", textDecoration: "none" }}>
                View on Basescan ↗
              </a>
            )}
            <div style={{ marginTop: 16, fontSize: 12, color: "#334155" }}>
              Manage at{" "}
              <a href="/my-subscriptions" style={{ color: "#34d399", textDecoration: "none" }}>authonce.io/my-subscriptions</a>
            </div>
          </div>
        )}

        {/* ── Main flow ── */}
        {!productLoading && product && flowStatus !== "success" && (
          <>
            {/* Merchant header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, paddingBottom: 20, borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}>
              <MerchantAvatar name={merchantName} size={44} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.01em" }}>{merchantName}</div>
                <div style={{ fontSize: 11, color: "#34d399", marginTop: 2 }}>✓ AuthOnce verified merchant</div>
              </div>
            </div>

            {/* Step indicator */}
            <StepIndicator current={currentStep} />

            {/* Product box */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: (hasTrial || hasIntro) ? "0.5px solid rgba(251,191,36,0.25)" : "0.5px solid rgba(255,255,255,0.06)",
              borderRadius: 14, padding: "18px 20px", marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", marginBottom: 10 }}>{product.name}</div>

              {/* Yearly toggle */}
              {product.yearly_amount && (
                <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 4 }}>
                  {["monthly", "yearly"].map(iv => (
                    <button key={iv} onClick={() => setSelectedInterval(iv)} style={{
                      flex: 1, background: selectedInterval === iv ? "rgba(52,211,153,0.12)" : "none",
                      border: selectedInterval === iv ? "0.5px solid rgba(52,211,153,0.3)" : "none",
                      borderRadius: 6, color: selectedInterval === iv ? "#34d399" : "#475569",
                      fontSize: 12, fontWeight: 600, padding: "6px 0", cursor: "pointer",
                    }}>
                      {iv === "yearly" ? (
                        <span>Yearly <span style={{ marginLeft: 4, fontSize: 10, background: "rgba(52,211,153,0.15)", color: "#34d399", padding: "1px 6px", borderRadius: 99 }}>
                          save {Math.round((1 - product.yearly_amount / (product.amount * 12)) * 100)}%
                        </span></span>
                      ) : "Monthly"}
                    </button>
                  ))}
                </div>
              )}

              {/* Badges */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {hasTrial && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600 }}>🎁 {trialDays}-day free trial</span>}
                {hasIntro && !isYearly && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600 }}>🎁 Intro: ${product.intro_amount.toFixed(2)} × {product.intro_pulls}</span>}
              </div>

              {/* Price */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: "#34d399", fontFamily: "monospace", letterSpacing: "-0.03em" }}>
                  ${activeAmount?.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, color: "#64748b" }}>/ {isYearly ? "year" : intervalLabel} · USDC</span>
              </div>

              {isYearly && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  ${(product.yearly_amount / 12).toFixed(2)}/month equivalent · billed annually
                </div>
              )}
              {!isYearly && hasTrial && !hasIntro && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Free for {trialDays} days, then ${product.amount?.toFixed(2)}/{intervalLabel}</div>
              )}
              {!isYearly && !hasTrial && hasIntro && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  ${product.intro_amount.toFixed(2)}/{intervalLabel} for {product.intro_pulls} {intervalPlural}, then ${product.amount?.toFixed(2)}
                </div>
              )}
            </div>

            {/* Network error */}
            {isWrongNetwork && (
              <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f87171", textAlign: "center", marginBottom: 16 }}>
                Wrong network. AuthOnce runs on Base Network (testnet).{" "}
                <button onClick={() => switchChain({ chainId: baseSepolia.id })} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontWeight: 700, textDecoration: "underline", padding: 0 }}>
                  Switch now
                </button>
              </div>
            )}

            {errorMsg && (
              <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f87171", textAlign: "center", marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}

            {/* ── STEP 1: Payment method selector (idle only) ── */}
            {flowStatus === "idle" && availableMethods && availableMethods.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Pay with</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {availableMethods.map(method => {
                    const cfg = {
                      crypto:     { label: "USDC wallet",     icon: "⛓" },
                      card:       { label: "Card",            icon: "💳" },
                      sepa:       { label: "SEPA Transfer",   icon: "🏦" },
                      ideal:      { label: "iDEAL",           icon: "🇳🇱" },
                      bancontact: { label: "Bancontact",      icon: "🇧🇪" },
                      eps:        { label: "EPS",             icon: "🇦🇹" },
                      klarna:     { label: "Klarna",          icon: "🛍" },
                      blik:       { label: "BLIK",            icon: "🇵🇱" },
                      mbway:      { label: "MB Way",          icon: "📱" },
                      multibanco: { label: "Multibanco",      icon: "🏧" },
                    }[method] || { label: method, icon: "💳" };
                    const sel = paymentMethod === method;
                    return (
                      <div key={method} onClick={() => setPaymentMethod(method)} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        borderRadius: 10, cursor: "pointer",
                        border: `0.5px solid ${sel ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.07)"}`,
                        background: sel ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.02)",
                      }}>
                        <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: sel ? "#34d399" : "#94a3b8" }}>{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stripe flow */}
            {flowStatus === "idle" && paymentMethod !== "crypto" && (
              <button
                onClick={async () => {
                  setStripeLoading(true); setErrorMsg("");
                  try {
                    const res = await fetch(`${API_BASE}/api/stripe/checkout`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        merchant_address: resolvedAddress, product_slug: productSlug,
                        payment_method: paymentMethod, interval: isYearly ? "yearly" : "monthly",
                        success_url: `${window.location.origin}/pay/${merchantAddress}/${productSlug}?checkout=success`,
                        cancel_url: window.location.href,
                      }),
                    });
                    const data = await res.json();
                    if (data.url) window.location.href = data.url;
                    else setErrorMsg(data.message || "Could not create checkout session.");
                  } catch { setErrorMsg("Could not reach server."); }
                  finally { setStripeLoading(false); }
                }}
                disabled={stripeLoading}
                style={{
                  width: "100%", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15,
                  padding: "14px 24px", cursor: stripeLoading ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg, #34d399, #3b82f6)", color: "#080c14",
                  opacity: stripeLoading ? 0.6 : 1, letterSpacing: "-0.01em",
                }}
              >
                {stripeLoading ? "Redirecting..." : `Pay ${isYearly ? `$${product?.yearly_amount?.toFixed(2)}/year` : `$${product?.amount?.toFixed(2)}/${intervalLabel}`} →`}
              </button>
            )}

            {/* Crypto — wallet connect (idle) */}
            {flowStatus === "idle" && paymentMethod === "crypto" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>Connect your wallet to subscribe</div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ConnectButton />
                </div>
                <div style={{ fontSize: 11, color: "#334155", marginTop: 10 }}>MetaMask · Coinbase Wallet · WalletConnect</div>
              </div>
            )}

            {/* Connected — steps + subscribe button */}
            {(flowStatus === "connected" || flowStatus === "approving" || flowStatus === "subscribing") && (
              <>
                {/* Wallet badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(52,211,153,0.06)", border: "0.5px solid rgba(52,211,153,0.18)",
                  borderRadius: 10, padding: "10px 14px", marginBottom: 16,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, #34d399, #3b82f6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#080c14",
                  }}>
                    {address?.slice(2, 4).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" }}>
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </div>
                    <div style={{ fontSize: 11, color: "#34d399" }}>✓ Wallet connected</div>
                  </div>
                  <button onClick={() => { disconnect(); setFlowStatus("idle"); setErrorMsg(""); }}
                    style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 11 }}>
                    Disconnect
                  </button>
                </div>

                {/* Transaction steps */}
                <div style={{ marginBottom: 18 }}>
                  <Step n={1} label={`Approve ${activeAmount?.toFixed(2)} USDC`} active={stepApprove} done={approvedDone} />
                  <Step n={2} label="Create subscription on-chain" active={stepSubscribe} done={subscribedDone} />
                </div>

                {/* Trust signals */}
                {flowStatus === "connected" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, padding: "14px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "0.5px solid rgba(255,255,255,0.05)" }}>
                    <TrustRow icon="⚡" text="Two transactions — approve USDC, then subscribe" />
                    {isYearly && <TrustRow icon="📅" text={`Billed annually · $${(product.yearly_amount / 12).toFixed(2)}/month equivalent`} />}
                    {hasTrial && <TrustRow icon="🎁" text={`${trialDays}-day free trial — first payment after trial ends`} />}
                    {hasIntro && !hasTrial && !isYearly && <TrustRow icon="🎁" text={`Intro $${product.intro_amount.toFixed(2)} for ${product.intro_pulls} ${intervalPlural}, then $${product.amount?.toFixed(2)}`} />}
                    <TrustRow icon="🔔" text="3-day notice before every payment" />
                    <TrustRow icon="🛡️" text="Cancel anytime at authonce.io/my-subscriptions" />
                    <TrustRow icon="🔒" text="AuthOnce never holds your funds" />
                  </div>
                )}

                {/* Pending status */}
                {(stepApprove || stepSubscribe) && (
                  <div style={{
                    background: "rgba(59,130,246,0.06)", border: "0.5px solid rgba(59,130,246,0.18)",
                    borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#93c5fd",
                    textAlign: "center", marginBottom: 16,
                  }}>
                    {stepApprove && !approveConfirmed && "Waiting for approval confirmation..."}
                    {approveConfirmed && stepSubscribe && "Approved. Creating subscription..."}
                    {stepSubscribe && !subscribeConfirmed && !approveConfirmed && "Creating subscription on-chain..."}
                  </div>
                )}

                {!resolvedAddress && !merchantAddress?.startsWith("0x") && (
                  <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12, textAlign: "center" }}>Resolving merchant... please wait.</div>
                )}

                {flowStatus === "connected" && (
                  <button
                    style={{
                      width: "100%", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15,
                      padding: "14px 24px", cursor: isWrongNetwork || !resolvedAddress ? "not-allowed" : "pointer",
                      background: "linear-gradient(135deg, #34d399, #3b82f6)", color: "#080c14",
                      opacity: isWrongNetwork || !resolvedAddress ? 0.5 : 1, letterSpacing: "-0.01em",
                    }}
                    onClick={handleApprove}
                    disabled={isWrongNetwork || !resolvedAddress}
                  >
                    {hasTrial && !isYearly
                      ? `Start ${trialDays}-day free trial →`
                      : isYearly
                      ? `Subscribe yearly — $${product.yearly_amount?.toFixed(2)} →`
                      : hasIntro
                      ? `Subscribe — $${product.intro_amount?.toFixed(2)}/${intervalLabel} →`
                      : `Subscribe — $${product.amount?.toFixed(2)}/${intervalLabel} →`
                    }
                  </button>
                )}

                {(stepApprove || stepSubscribe) && (
                  <button style={{
                    width: "100%", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15,
                    padding: "14px 24px", cursor: "not-allowed",
                    background: "linear-gradient(135deg, #34d399, #3b82f6)", color: "#080c14",
                    opacity: 0.45, letterSpacing: "-0.01em",
                  }} disabled>
                    {stepApprove && !approveConfirmed ? "Approving USDC..." : "Creating subscription..."}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: "#1e293b", textAlign: "center" }}>
        Powered by <span style={{ color: "#34d399" }}>AuthOnce</span> · Non-custodial · Base Network
      </div>
    </div>
  );
}
