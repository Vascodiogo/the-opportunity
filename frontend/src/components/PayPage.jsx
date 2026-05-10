// src/components/PayPage.jsx
// Subscriber pay link page — authonce.io/pay/:merchantAddress/:productSlug
//
// Crypto-native flow: connect wallet → approve USDC → createSubscription on-chain
// Trial support:      ?trial=N in URL → N free days before first payment
// Intro pricing:      loaded from product API (introAmount, introPulls)

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

import {
  VAULT_ADDRESS,
  USDC_ADDRESS,
  VAULT_ABI,
  INTERVAL_NAMES,
} from "../config.js";

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

// Read ?trial=N from URL — clamp 1–60, default 0
function getTrialDays() {
  const raw = new URLSearchParams(window.location.search).get("trial");
  if (!raw) return 0;
  const n = parseInt(raw);
  if (isNaN(n) || n < 1) return 0;
  return Math.min(n, 60);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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
  walletBadge: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(52,211,153,0.08)",
    border: "0.5px solid rgba(52,211,153,0.2)",
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 16,
  },
  stepRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 0",
    borderBottom: "0.5px solid rgba(255,255,255,0.04)",
  },
  stepDot: (active, done) => ({
    width: 28,
    height: 28,
    borderRadius: "50%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    background: done
      ? "rgba(52,211,153,0.2)"
      : active
      ? "rgba(59,130,246,0.2)"
      : "rgba(255,255,255,0.05)",
    border: done
      ? "1px solid rgba(52,211,153,0.4)"
      : active
      ? "1px solid rgba(59,130,246,0.4)"
      : "1px solid rgba(255,255,255,0.08)",
    color: done ? "#34d399" : active ? "#3b82f6" : "#475569",
  }),
  error: {
    background: "rgba(248,113,113,0.08)",
    border: "0.5px solid rgba(248,113,113,0.2)",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 12,
    color: "#f87171",
    textAlign: "center",
    marginBottom: 16,
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function ConnectorButton({ connector, onClick }) {
  const icons = { metaMaskSDK: "🦊", metaMask: "🦊", coinbaseWallet: "🔵", coinbaseWalletSDK: "🔵", walletConnect: "🔗" };
  return (
    <button
      style={{ ...s.btn, ...s.btnSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 }}
      onClick={onClick}
    >
      <span style={{ fontSize: 18 }}>{icons[connector.id] || "💼"}</span>
      {connector.name}
    </button>
  );
}

function Step({ n, label, active, done }) {
  return (
    <div style={s.stepRow}>
      <div style={s.stepDot(active, done)}>{done ? "✓" : n}</div>
      <span style={{ fontSize: 13, color: done ? "#34d399" : active ? "#f1f5f9" : "#475569" }}>
        {label}
      </span>
      {active && !done && (
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#3b82f6" }}>In progress</span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PayPage() {
  const { merchantAddress, productSlug } = useParams();

  const [trialDays] = useState(() => getTrialDays());

  const [product, setProduct]               = useState(null);
  const [merchant, setMerchant]             = useState(null);
  const [productLoading, setProductLoading] = useState(true);
  const [flowStatus, setFlowStatus]         = useState("idle");
  const [errorMsg, setErrorMsg]             = useState("");
  const [approveTxHash, setApproveTxHash]   = useState(null);
  const [subscribeTxHash, setSubscribeTxHash] = useState(null);

  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { disconnect }           = useDisconnect();
  const { switchChain }          = useSwitchChain();
  const { writeContractAsync }   = useWriteContract();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    query: { enabled: !!approveTxHash },
  });

  const { isSuccess: subscribeConfirmed } = useWaitForTransactionReceipt({
    hash: subscribeTxHash,
    query: { enabled: !!subscribeTxHash },
  });

  // For the approve step, we approve the full amount (not intro amount)
  // so the vault can pull the full price when intro period ends
  const amountRaw = product ? parseUnits(product.amount.toString(), 6) : 0n;

  const { data: currentAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_APPROVE_ABI,
    functionName: "allowance",
    args: [address, VAULT_ADDRESS],
    query: { enabled: !!address && !!product },
  });

  // Load product (includes intro_amount, intro_pulls from API)
  useEffect(() => {
    if (!merchantAddress || !productSlug) return;
    fetch(`${API_BASE}/api/products/${merchantAddress}/${productSlug}`)
      .then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => setProduct({
        ...data,
        interval:    INTERVAL_MAP[data.interval] ?? data.interval,
        intro_amount: parseFloat(data.intro_amount || 0),
        intro_pulls:  parseInt(data.intro_pulls || 0),
      }))
      .catch(() => setProduct(null))
      .finally(() => setProductLoading(false));
  }, [merchantAddress, productSlug]);

  // Load merchant name
  useEffect(() => {
    if (!merchantAddress) return;
    fetch(`${API_BASE}/api/merchants/${merchantAddress}`)
      .then(r => r.json())
      .then(data => setMerchant(data))
      .catch(() => setMerchant({ business_name: null }));
  }, [merchantAddress]);

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

  const handleConnect = (connector) => {
    setErrorMsg("");
    connect({ connector });
  };

  const handleApprove = async () => {
    if (!product || !address) return;
    setErrorMsg("");

    if (currentAllowance !== undefined && currentAllowance >= amountRaw) {
      await handleCreateSubscription();
      return;
    }

    setFlowStatus("approving");
    try {
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_APPROVE_ABI,
        functionName: "approve",
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
      const introAmountRaw = hasIntro
        ? parseUnits(product.intro_amount.toString(), 6)
        : 0n;

      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "createSubscription",
        args: [
          merchantAddress,                 // merchant
          address,                         // safeVault — subscriber's own wallet
          amountRaw,                       // full recurring amount
          introAmountRaw,                  // intro amount (0 if no intro pricing)
          BigInt(product.intro_pulls || 0),// intro pulls (0 if no intro pricing)
          product.interval,                // 0=weekly 1=monthly 2=yearly
          ZERO_ADDRESS,                    // guardian — none for MVP
          BigInt(trialDays),               // trial days from ?trial=N
          0n,                              // grace period — contract default (7 days)
        ],
      });
      setSubscribeTxHash(hash);
    } catch (err) {
      setErrorMsg(err.shortMessage || err.message || "Transaction failed.");
      setFlowStatus("connected");
    }
  };

  const intervalLabel  = product ? INTERVAL_NAMES[product.interval] : "";
  const merchantName   = merchant?.business_name
    || `${merchantAddress?.slice(0, 6)}...${merchantAddress?.slice(-4)}`;
  const stepApprove    = flowStatus === "approving";
  const stepSubscribe  = flowStatus === "subscribing";
  const approvedDone   = approveConfirmed || (currentAllowance !== undefined && currentAllowance >= amountRaw && flowStatus !== "idle");
  const subscribedDone = subscribeConfirmed;

  // What subscriber sees as the first price
  const firstPrice = hasIntro
    ? `$${product.intro_amount.toFixed(2)}`
    : hasTrial
    ? "$0.00"
    : `$${product?.amount?.toFixed(2)}`;

  return (
    <div style={s.page}>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

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

      <div style={s.card}>
        <div style={{
          position: "absolute", top: 0, left: 40, right: 40, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(52,211,153,0.4), transparent)",
        }} />

        {/* Loading */}
        {productLoading && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8", fontSize: 13 }}>Loading...</div>
        )}

        {/* Not found */}
        {!productLoading && !product && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Product not found</div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>This pay link may be invalid or expired.</div>
          </div>
        )}

        {/* Success */}
        {!productLoading && product && flowStatus === "success" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, margin: "0 auto 20px",
            }}>✓</div>
            <div style={{ color: "#34d399", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              You're subscribed!
            </div>
            {hasTrial && (
              <div style={{ fontSize: 12, padding: "4px 12px", borderRadius: 99, display: "inline-block", background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600, marginBottom: 12 }}>
                🎁 Your {trialDays}-day free trial starts today
              </div>
            )}
            {hasIntro && !hasTrial && (
              <div style={{ fontSize: 12, padding: "4px 12px", borderRadius: 99, display: "inline-block", background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600, marginBottom: 12 }}>
                🎁 Intro price: ${product.intro_amount.toFixed(2)} for first {product.intro_pulls} {product.intro_pulls === 1 ? intervalLabel.toLowerCase() : ({ Weekly: "weeks", Monthly: "months", Yearly: "years" })[intervalLabel] || intervalLabel.toLowerCase()}
              </div>
            )}
            <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              Your subscription to <strong style={{ color: "#f1f5f9" }}>{product.name}</strong> is
              now active. Payments will be collected automatically.
            </div>
            {subscribeTxHash && (
              <a
                href={`https://sepolia.basescan.org/tx/${subscribeTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "#34d399" }}
              >
                View on Basescan ↗
              </a>
            )}
            <div style={{ marginTop: 16, fontSize: 12, color: "#475569" }}>
              Manage at{" "}
              <a href="/my-subscriptions" style={{ color: "#34d399" }}>authonce.io/my-subscriptions</a>
            </div>
          </div>
        )}

        {/* Main flow */}
        {!productLoading && product && flowStatus !== "success" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                Subscribing to
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>{merchantName}</div>
            </div>

            {/* Product box */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: (hasTrial || hasIntro) ? "0.5px solid rgba(251,191,36,0.3)" : "0.5px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "16px 20px", marginBottom: 24,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>
                {product.name}
              </div>

              {/* Trial badge */}
              {hasTrial && (
                <div style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, display: "inline-block", background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600, marginBottom: 8 }}>
                  🎁 {trialDays}-day free trial
                </div>
              )}

              {/* Intro pricing badge */}
              {hasIntro && !hasTrial && (
                <div style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, display: "inline-block", background: "rgba(251,191,36,0.12)", color: "#fbbf24", fontWeight: 600, marginBottom: 8 }}>
                  🎁 Intro offer
                </div>
              )}

              {/* Price display */}
              {hasIntro && !hasTrial ? (
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 30, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace" }}>
                      ${product.intro_amount.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>
                      / {intervalLabel} · first {product.intro_pulls} {product.intro_pulls === 1 ? intervalLabel.toLowerCase() : intervalLabel.toLowerCase() + "s"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    Then ${product.amount.toFixed(2)} / {intervalLabel}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 30, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>
                      ${product.amount?.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>/ {intervalLabel}</span>
                  </div>
                  {hasTrial && (
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                      Free for {trialDays} days, then ${product.amount?.toFixed(2)} / {intervalLabel}
                    </div>
                  )}
                </div>
              )}
            </div>

            {isWrongNetwork && (
              <div style={{ ...s.error, marginBottom: 16 }}>
                Wrong network. AuthOnce runs on Base Sepolia.{" "}
                <button
                  onClick={() => switchChain({ chainId: baseSepolia.id })}
                  style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontWeight: 700, textDecoration: "underline", padding: 0 }}
                >
                  Switch now
                </button>
              </div>
            )}

            {errorMsg && <div style={s.error}>{errorMsg}</div>}

            {/* Idle — wallet chooser */}
            {flowStatus === "idle" && (
              <>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
                  Connect your wallet to subscribe:
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                  <ConnectButton />
                </div>
                <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 8 }}>
                  MetaMask · Coinbase Wallet · WalletConnect supported
                </div>
              </>
            )}

            {/* Connected */}
            {(flowStatus === "connected" || flowStatus === "approving" || flowStatus === "subscribing") && (
              <>
                <div style={s.walletBadge}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "linear-gradient(135deg, #34d399, #3b82f6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: "#080c14", flexShrink: 0,
                  }}>
                    {address?.slice(2, 4).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9", fontFamily: "monospace" }}>
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </div>
                    <div style={{ fontSize: 11, color: "#34d399" }}>✓ Wallet connected</div>
                  </div>
                  <button
                    onClick={() => { disconnect(); setFlowStatus("idle"); setErrorMsg(""); }}
                    style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 11 }}
                  >
                    Disconnect
                  </button>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <Step n={1} label={`Approve ${product.amount?.toFixed(2)} USDC`} active={stepApprove} done={approvedDone} />
                  <Step n={2} label="Create subscription on-chain" active={stepSubscribe} done={subscribedDone} />
                </div>

                {flowStatus === "connected" && (
                  <div style={{ marginBottom: 20 }}>
                    {[
                      ["⚡", "Two transactions — approve USDC, then subscribe"],
                      hasTrial ? ["🎁", `${trialDays}-day free trial — first payment after trial ends`] : null,
                      hasIntro && !hasTrial ? ["🎁", `Intro price ${firstPrice} for ${product.intro_pulls} ${intervalLabel.toLowerCase()}${product.intro_pulls > 1 ? "s" : ""}, then $${product.amount?.toFixed(2)}`] : null,
                      ["🔔", "3-day notice before every payment"],
                      ["🛡️", "Cancel anytime at authonce.io/my-subscriptions"],
                      ["🔒", "AuthOnce never holds your funds"],
                    ].filter(Boolean).map(([icon, text]) => (
                      <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
                        <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(stepApprove || stepSubscribe) && (
                  <div style={{
                    background: "rgba(59,130,246,0.06)", border: "0.5px solid rgba(59,130,246,0.2)",
                    borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#93c5fd",
                    textAlign: "center", marginBottom: 16,
                  }}>
                    {stepApprove && !approveConfirmed && "Waiting for approval confirmation..."}
                    {approveConfirmed && stepSubscribe && "Approval confirmed. Creating subscription..."}
                    {stepSubscribe && !subscribeConfirmed && !approveConfirmed && "Creating subscription on-chain..."}
                  </div>
                )}

                {flowStatus === "connected" && (
                  <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleApprove} disabled={isWrongNetwork}>
                    {hasTrial
                      ? `Start ${trialDays}-day free trial →`
                      : hasIntro
                      ? `Subscribe — ${firstPrice} / ${intervalLabel} →`
                      : `Subscribe — $${product.amount?.toFixed(2)} / ${intervalLabel} →`
                    }
                  </button>
                )}

                {(stepApprove || stepSubscribe) && (
                  <button style={{ ...s.btn, ...s.btnPrimary, opacity: 0.5, cursor: "not-allowed" }} disabled>
                    {stepApprove && !approveConfirmed ? "Approving USDC..." : "Creating subscription..."}
                  </button>
                )}
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
