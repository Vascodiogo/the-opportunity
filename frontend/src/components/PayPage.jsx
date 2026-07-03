// src/components/PayPage.jsx — Visual redesign May 2026
// Logic: unchanged. Visual: CSS variables, solid green CTAs, no hardcoded colors.
import { VAULT_ADDRESS, USDC_ADDRESS, VAULT_ABI, INTERVAL_NAMES, TOKEN_ADDRESSES } from "../config.js";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  useAccount, useDisconnect,
  useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useChainId, useSwitchChain,
  useSignTypedData,
} from "wagmi";
import { parseUnits } from "viem";
import { baseSepolia } from "wagmi/chains";

import PermissionSteps from "./PermissionSteps";

const API_BASE = "https://the-opportunity-production.up.railway.app";

const USDC_APPROVE_ABI = [
  {
    name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nonces", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// ─── EIP-2612 permit support ──────────────────────────────────────────────────
// Only USDC and EURC support permit() on Base (both are Circle FiatToken
// contracts). DAI uses a non-standard permit interface (bool allowed, not
// value) — not wired up here, falls back to approve+subscribe. USDT has no
// permit() at all on any chain — always falls back to approve+subscribe.
// Tokens not listed here automatically use the two-step flow.
const PERMIT_SUPPORTED_TOKENS = {
  usdc: { name: "USDC", version: "2" },
  eurc: { name: "EURC", version: "2" },
};

const VAULT_PERMIT_ABI = [
  {
    name: "createSubscriptionWithPermit", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "merchant",         type: "address" },
      { name: "safeVault",        type: "address" },
      { name: "token",            type: "address" },
      { name: "amount",           type: "uint256" },
      { name: "introAmount",      type: "uint256" },
      { name: "introPulls",       type: "uint256" },
      { name: "interval",         type: "uint8"   },
      { name: "guardian",         type: "address" },
      { name: "trialDays",        type: "uint256" },
      { name: "gracePeriodDays_", type: "uint256" },
      { name: "dataVaultId_",     type: "bytes32" },
      { name: "permitDeadline",   type: "uint256" },
      { name: "v",                type: "uint8"   },
      { name: "r",                type: "bytes32" },
      { name: "s",                type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const INTERVAL_MAP = { weekly: 0, monthly: 1, yearly: 2 };

// ─── Network-aware token map ─────────────────────────────────────────────────
// TOKEN_ADDRESSES imported from config.js — keyed by network string.
// VITE_NETWORK must be "base-sepolia" or "base-mainnet".
const NETWORK = import.meta.env.VITE_NETWORK || "base-sepolia";
const NETWORK_TOKENS = TOKEN_ADDRESSES[NETWORK] || TOKEN_ADDRESSES["base-sepolia"];

const TOKEN_META = {
  usdc: { label: "USDC", icon: "⬡", decimals: 6 },
  eurc: { label: "EURC", icon: "€",  decimals: 6 },
  usdt: { label: "USDT", icon: "₮",  decimals: 6 },
  dai:  { label: "DAI",  icon: "◈", decimals: 18 },
};

// Stablecoins available for subscriber token selection — derived from network whitelist.
// On Sepolia only USDC is whitelisted. On mainnet: USDC, USDT, DAI, EURC.
const SELECTABLE_TOKENS = Object.keys(NETWORK_TOKENS);

function getTrialDays() {
  const raw = new URLSearchParams(window.location.search).get("trial");
  if (!raw) return 0;
  const n = parseInt(raw);
  if (isNaN(n) || n < 1) return 0;
  return Math.min(n, 60);
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  const steps = ["Sign in", "Payment", "Authorize"];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 28 }}>
      {steps.map((label, i) => {
        const idx    = i + 1;
        const done   = idx < current;
        const active = idx === current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: done ? "rgba(29,158,117,0.2)" : active ? "rgba(29,158,117,0.12)" : "var(--bg-tag)",
                border: `1.5px solid ${done ? "rgba(29,158,117,0.5)" : active ? "rgba(29,158,117,0.4)" : "var(--border)"}`,
                color: done ? "var(--green)" : active ? "var(--green)" : "var(--text-muted)",
              }}>
                {done ? "✓" : idx}
              </div>
              <span style={{ fontSize: 10, color: done ? "var(--green)" : active ? "var(--text-primary)" : "var(--text-faint)", fontWeight: active ? 600 : 400, letterSpacing: "0.02em" }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 48, height: 1, background: done ? "rgba(29,158,117,0.3)" : "var(--border)", margin: "0 4px", marginBottom: 16 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Merchant Avatar ──────────────────────────────────────────────────────────
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

// ─── Trust Row ────────────────────────────────────────────────────────────────
function TrustRow({ icon, text }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ─── Step Dot ─────────────────────────────────────────────────────────────────
function Step({ n, label, active, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
        background: done ? "rgba(29,158,117,0.2)" : active ? "rgba(29,158,117,0.1)" : "var(--bg-tag)",
        border: `1px solid ${done ? "rgba(29,158,117,0.4)" : active ? "rgba(29,158,117,0.3)" : "var(--border)"}`,
        color: done ? "var(--green)" : active ? "var(--green)" : "var(--text-muted)",
      }}>
        {done ? "✓" : n}
      </div>
      <span style={{ fontSize: 13, color: done ? "var(--green)" : active ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
      {active && !done && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--green)" }}>In progress</span>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
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
  const [selectedToken, setSelectedToken]   = useState("usdc"); // crypto token choice
  const [subscriberEmail, setSubscriberEmail] = useState("");    // optional payment alert email
  const [agentWebhookUrl, setAgentWebhookUrl] = useState("");    // AI agent webhook endpoint
  const [isContractAddress, setIsContractAddress] = useState(false); // true if subscriber is a smart contract

  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { disconnect }           = useDisconnect();
  const { switchChain }          = useSwitchChain();
  const { writeContractAsync }   = useWriteContract();
  const { signTypedDataAsync }   = useSignTypedData();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveTxHash, query: { enabled: !!approveTxHash },
  });
  const { isSuccess: subscribeConfirmed } = useWaitForTransactionReceipt({
    hash: subscribeTxHash, query: { enabled: !!subscribeTxHash },
  });

  const isYearly     = selectedInterval === "yearly" && product?.yearly_amount;
  const baseAmount   = isYearly ? product.yearly_amount : product?.amount;
  const cryptoDiscountPct = product?.crypto_discount_pct || 0;
  const activeAmount = (paymentMethod === "crypto" && cryptoDiscountPct > 0 && baseAmount)
    ? baseAmount * (1 - cryptoDiscountPct / 100)
    : baseAmount;
  const selectedTokenAddress = NETWORK_TOKENS[selectedToken] || USDC_ADDRESS;
  const selectedTokenMeta    = TOKEN_META[selectedToken] || TOKEN_META.usdc;

  const fiatCurrency = (product?.fiat_currency || "usd").toLowerCase();
  const FIAT_SYMBOLS = { usd: "$", eur: "€", gbp: "£", chf: "Fr ", sek: "kr ", nok: "kr ", dkk: "kr ", aud: "A$", cad: "C$", brl: "R$", sgd: "S$", hkd: "HK$", inr: "₹", jpy: "¥", krw: "₩" };
  const fiatSymbol   = FIAT_SYMBOLS[fiatCurrency] || "$";

  // Crypto tokens this product accepts, in display order.
  // Uses product.payment_methods directly — NOT filtered by SELECTABLE_TOKENS,
  // which is a network contract whitelist, not a UI filter.
  const CRYPTO_TOKEN_ORDER = ["usdc", "usdt", "dai", "eurc"];
  const productCryptoTokens = product
    ? CRYPTO_TOKEN_ORDER.filter(t => (product.payment_methods || ["usdc"]).includes(t))
    : ["usdc"];
  const amountRaw    = activeAmount
    ? parseUnits(activeAmount.toString(), selectedTokenMeta.decimals)
    : 0n;

  const { data: currentAllowance } = useReadContract({
    address: selectedTokenAddress, abi: USDC_APPROVE_ABI, functionName: "allowance",
    args: [address, VAULT_ADDRESS], query: { enabled: !!address && !!product },
  });

  // Whether the selected token supports EIP-2612 permit (USDC, EURC only).
  // Everything else (USDT, DAI) falls back to the existing two-step flow.
  const tokenSupportsPermit = !!PERMIT_SUPPORTED_TOKENS[selectedToken];

  // Subscriber's current permit nonce on the token contract — required to
  // build a valid EIP-712 signature. Only fetched for permit-capable tokens.
  const { data: permitNonce } = useReadContract({
    address: selectedTokenAddress, abi: USDC_APPROVE_ABI, functionName: "nonces",
    args: [address], query: { enabled: !!address && !!product && tokenSupportsPermit },
  });

  // Detect if connected wallet is a smart contract (AI agent) or EOA
  useEffect(() => {
    if (!address) { setIsContractAddress(false); return; }
    fetch(`${import.meta.env.VITE_RPC_URL || "https://sepolia.base.org"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getCode", params: [address, "latest"], id: 1 }),
    })
      .then(r => r.json())
      .then(data => setIsContractAddress(data?.result && data.result !== "0x"))
      .catch(() => setIsContractAddress(false));
  }, [address]);

  useEffect(() => {
    if (!resolvedAddress || !productSlug) return;
    fetch(`${API_BASE}/api/products/${resolvedAddress}/${productSlug}`)
      .then(r => { if (r.status === 451) throw new Error("451"); if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(data => {
        const p = {
          ...data,
          interval:      INTERVAL_MAP[data.interval] ?? data.interval,
          intro_amount:  parseFloat(data.intro_amount || 0),
          intro_pulls:   parseInt(data.intro_pulls || 0),
          yearly_amount: data.yearly_amount ? parseFloat(data.yearly_amount) : null,
        };
        setProduct(p);
        // Reset selectedToken to first crypto token the product accepts.
        // Guards against stale state if user navigates between pay links.
        const CRYPTO_TOKENS = ["usdc", "usdt", "dai", "eurc"];
        const acceptedCrypto = (p.payment_methods || []).filter(m => CRYPTO_TOKENS.includes(m));
        if (acceptedCrypto.length > 0 && !acceptedCrypto.includes("usdc")) {
          setSelectedToken(acceptedCrypto[0]);
        }
      })
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
      .then(data => { if (data) { setAvailableMethods(data.methods); setPaymentMethod("crypto"); } })
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
    if (subscribeConfirmed && flowStatus === "subscribing") {
      // Link product_slug to subscription by tx_hash
      if (subscribeTxHash && productSlug && resolvedAddress) {
        fetch(`${API_BASE}/api/subscriptions/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_hash: subscribeTxHash,
            product_slug: productSlug,
            merchant_address: resolvedAddress,
            subscriber_email: subscriberEmail || null,
            subscriber_webhook_url: agentWebhookUrl || null,
            is_contract_vault: isContractAddress || false,
          }),
        }).catch(err => console.warn("[PayPage] Could not link product_slug:", err));
      }
      setFlowStatus("success");
    }
  }, [subscribeConfirmed]);

  const isWrongNetwork = isConnected && chainId !== baseSepolia.id;
  const hasTrial       = trialDays > 0;
  const hasIntro       = product?.intro_amount > 0 && product?.intro_pulls > 0;

  // ─── One-signature subscribe via EIP-2612 permit ─────────────────────────
  // Used for USDC and EURC. Subscriber signs a single EIP-712 typed message
  // (no gas, no separate transaction) authorising the vault to pull `amount`.
  // That signature is submitted on-chain inside createSubscriptionWithPermit,
  // which calls the token's permit() then creates the subscription in the
  // same transaction. Net result: one wallet prompt, one confirmation.
  const handleSubscribeWithPermit = async () => {
    if (!product || !address || !resolvedAddress) {
      setErrorMsg("Could not resolve merchant. Please refresh."); return;
    }
    setErrorMsg("");
    setFlowStatus("subscribing");
    try {
      const tokenDomain = PERMIT_SUPPORTED_TOKENS[selectedToken];
      const deadline     = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 min validity
      const nonce        = permitNonce ?? 0n;

      const signature = await signTypedDataAsync({
        domain: {
          name: tokenDomain.name,
          version: tokenDomain.version,
          chainId: baseSepolia.id,
          verifyingContract: selectedTokenAddress,
        },
        types: {
          Permit: [
            { name: "owner",    type: "address" },
            { name: "spender",  type: "address" },
            { name: "value",    type: "uint256" },
            { name: "nonce",    type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: {
          owner: address,
          spender: VAULT_ADDRESS,
          value: amountRaw,
          nonce,
          deadline,
        },
      });

      // Split the 65-byte signature into v, r, s for the contract call.
      const sig = signature.slice(2);
      const r = `0x${sig.slice(0, 64)}`;
      const s = `0x${sig.slice(64, 128)}`;
      const v = parseInt(sig.slice(128, 130), 16);

      const introAmountRaw = hasIntro && !isYearly ? parseUnits(product.intro_amount.toString(), selectedTokenMeta.decimals) : 0n;
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS, abi: VAULT_PERMIT_ABI, functionName: "createSubscriptionWithPermit",
        args: [
          resolvedAddress,
          address,
          selectedTokenAddress,
          amountRaw,
          introAmountRaw,
          isYearly ? 0n : BigInt(product.intro_pulls || 0),
          isYearly ? 2 : product.interval,
          ZERO_ADDRESS,
          BigInt(trialDays),
          0n,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          deadline,
          v, r, s,
        ],
      });
      setSubscribeTxHash(hash);
    } catch (err) {
      // Permit signature rejected, or token's permit() failed on-chain
      // (PermitFailed revert) — fall back to the standard two-step flow
      // rather than leaving the subscriber stuck.
      console.warn("[PayPage] Permit flow failed, falling back to approve+subscribe:", err);
      setFlowStatus("connected");
      await handleApprove(true);
    }
  };

  const handleApprove = async (skipPermitAttempt = false) => {
    if (!product || !address || !resolvedAddress) {
      setErrorMsg("Could not resolve merchant. Please refresh."); return;
    }
    setErrorMsg("");

    // Prefer the one-signature permit flow for supported tokens, unless this
    // call is itself the fallback path after a permit attempt already failed.
    if (!skipPermitAttempt && tokenSupportsPermit && (currentAllowance === undefined || currentAllowance < amountRaw)) {
      await handleSubscribeWithPermit(); return;
    }

    if (currentAllowance !== undefined && currentAllowance >= amountRaw) {
      await handleCreateSubscription(); return;
    }
    setFlowStatus("approving");
    try {
      const hash = await writeContractAsync({
        address: selectedTokenAddress, abi: USDC_APPROVE_ABI, functionName: "approve",
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
      const introAmountRaw = hasIntro && !isYearly ? parseUnits(product.intro_amount.toString(), selectedTokenMeta.decimals) : 0n;
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "createSubscription",
        args: [
         resolvedAddress,                                        // merchant
         address,                                                // safeVault
         selectedTokenAddress,                                   // token (subscriber choice)
         amountRaw,                                              // amount
         introAmountRaw,                                         // introAmount
         isYearly ? 0n : BigInt(product.intro_pulls || 0),       // introPulls
         isYearly ? 2 : product.interval,                        // interval
         ZERO_ADDRESS,                                           // guardian
         BigInt(trialDays),                                      // trialDays
         0n,                                                     // gracePeriodDays_
         "0x0000000000000000000000000000000000000000000000000000000000000000", // dataVaultId_
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
  const currentStep     = flowStatus === "idle" ? 1 : (flowStatus === "connected" || flowStatus === "approving" || flowStatus === "subscribing") ? (approvedDone ? 3 : 2) : 3;

  // Drives PermissionSteps + the pending-status text below.
  // Your handleApprove() actually has THREE distinct on-chain paths, not two:
  //   1. "permit"  — fresh allowance, permit-capable token → 1 signature + 1 tx
  //   2. "legacy"  — fresh allowance, non-permit token      → approve tx + subscribe tx
  //   3. "direct"  — allowance ALREADY sufficient, any token → single tx, no signing, no approve step
  // Missing case 3 is what caused the USDC test to show "sign a message" copy
  // when nothing was actually signed — allowance was already sufficient from
  // an earlier test, so handleApprove() skipped straight to handleCreateSubscription().
  const hasSufficientAllowance = currentAllowance !== undefined && currentAllowance >= amountRaw;
  // approveTxHash is only ever set inside the pure-legacy / post-permit-failure
  // branch, so its presence reliably means "we fell back to legacy," even if
  // tokenSupportsPermit or hasSufficientAllowance would otherwise say otherwise.
  const usedLegacyFallback = !!approveTxHash;
  const flowMode = usedLegacyFallback
    ? "legacy"
    : hasSufficientAllowance
    ? "direct"
    : tokenSupportsPermit
    ? "permit"
    : "legacy";

  const permissionStep =
    flowMode === "direct"
      ? (subscribedDone ? 2 : (stepSubscribe ? 1 : 0))
      : flowMode === "permit"
      ? (subscribedDone ? 3 : subscribeTxHash ? 2 : (stepSubscribe ? 1 : 0))
      : (subscribedDone ? 3 : stepSubscribe ? 2 : stepApprove ? 1 : 0);

  // CTA button style — used in multiple places
  const ctaBtn = (disabled) => ({
    width: "100%", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15,
    padding: "14px 24px", cursor: disabled ? "not-allowed" : "pointer",
    background: "var(--green)", color: "var(--bg-primary)",
    opacity: disabled ? 0.5 : 1, letterSpacing: "-0.01em", fontFamily: "inherit",
  });

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-primary)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: "'DM Sans Variable', 'DM Sans', system-ui, sans-serif",
    }}>

      {/* Ambient glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(29,158,117,0.07) 0%, transparent 70%)",
      }} />

      {/* AuthOnce wordmark */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "var(--green)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: "var(--bg-primary)",
          }}>A</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Auth<span style={{ color: "var(--green)" }}>Once</span>
          </span>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "rgba(29,158,117,0.1)", color: "var(--green)", fontWeight: 600 }}>
            verified
          </span>
        </div>
      </div>

      {/* Main card */}
      <div style={{
        background: "var(--bg-card)", border: "0.5px solid var(--border)",
        borderRadius: 20, padding: "36px 36px 28px", width: "100%", maxWidth: 440,
        position: "relative", boxShadow: "0 40px 100px rgba(0,0,0,0.4)",
      }}>
        {/* Top shimmer line */}
        <div style={{
          position: "absolute", top: 0, left: 40, right: 40, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(29,158,117,0.35), transparent)",
        }} />

        {/* ── Loading ── */}
        {productLoading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>
            Loading...
          </div>
        )}

        {/* ── Not found / geofenced ── */}
        {!productLoading && !product && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            {productError === "451" ? (
              <>
                <div style={{ fontSize: 36, marginBottom: 14 }}>🚫</div>
                <div style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Service unavailable in your region</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6 }}>This service is not available due to applicable sanctions regulations.</div>
                <div style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 12 }}>HTTP 451 — Unavailable For Legal Reasons</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 14 }}>🔍</div>
                <div style={{ color: "var(--text-primary)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Product not found</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>This pay link may be invalid or expired.</div>
              </>
            )}
          </div>
        )}

        {/* ── Success ── */}
        {!productLoading && product && flowStatus === "success" && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%", margin: "0 auto 20px",
              background: "rgba(29,158,117,0.1)", border: "1.5px solid rgba(29,158,117,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
            }}>✓</div>
            <div style={{ color: "var(--green)", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>You're subscribed!</div>
            {hasTrial && (
              <div style={{ fontSize: 12, padding: "4px 14px", borderRadius: 99, display: "inline-block", background: "rgba(251,191,36,0.12)", color: "var(--amber)", fontWeight: 600, marginBottom: 12 }}>
                🎁 {trialDays}-day free trial starts today
              </div>
            )}
            <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
              Your subscription to <strong style={{ color: "var(--text-primary)" }}>{product.name}</strong> is active. Payments are collected automatically.
            </div>
            {subscribeTxHash && (
              <a href={`https://sepolia.basescan.org/tx/${subscribeTxHash}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: "var(--green)", textDecoration: "none" }}>
                View on Basescan ↗
              </a>
            )}
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-faint)" }}>
              Manage at{" "}
              <a href="/my-subscriptions" style={{ color: "var(--green)", textDecoration: "none" }}>authonce.io/my-subscriptions</a>
            </div>
          </div>
        )}

        {/* ── Main flow ── */}
        {!productLoading && product && flowStatus !== "success" && (
          <>
            {/* Merchant header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, paddingBottom: 20, borderBottom: "0.5px solid var(--border)" }}>
              <MerchantAvatar name={merchantName} size={44} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{merchantName}</div>
                <div style={{ fontSize: 11, color: "var(--green)", marginTop: 2 }}>✓ AuthOnce verified merchant</div>
              </div>
            </div>

            <StepIndicator current={currentStep} />

            {/* Product box */}
            <div style={{
              background: "var(--bg-tag)",
              border: (hasTrial || hasIntro) ? "0.5px solid rgba(251,191,36,0.25)" : "0.5px solid var(--border)",
              borderRadius: 14, padding: "18px 20px", marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>{product.name}</div>

              {/* Yearly toggle */}
              {product.yearly_amount && (
                <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "var(--bg-card)", borderRadius: 8, padding: 4, border: "0.5px solid var(--border)" }}>
                  {["monthly", "yearly"].map(iv => (
                    <button key={iv} onClick={() => setSelectedInterval(iv)} style={{
                      flex: 1, background: selectedInterval === iv ? "rgba(29,158,117,0.12)" : "none",
                      border: selectedInterval === iv ? "0.5px solid rgba(29,158,117,0.3)" : "none",
                      borderRadius: 6, color: selectedInterval === iv ? "var(--green)" : "var(--text-muted)",
                      fontSize: 12, fontWeight: 600, padding: "6px 0", cursor: "pointer", fontFamily: "inherit",
                    }}>
                      {iv === "yearly" ? (
                        <span>Yearly <span style={{ marginLeft: 4, fontSize: 10, background: "rgba(29,158,117,0.15)", color: "var(--green)", padding: "1px 6px", borderRadius: 99 }}>
                          save {Math.round((1 - product.yearly_amount / (product.amount * 12)) * 100)}%
                        </span></span>
                      ) : "Monthly"}
                    </button>
                  ))}
                </div>
              )}

              {/* Badges */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {hasTrial && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, background: "rgba(251,191,36,0.12)", color: "var(--amber)", fontWeight: 600 }}>🎁 {trialDays}-day free trial</span>}
                {hasIntro && !isYearly && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, background: "rgba(251,191,36,0.12)", color: "var(--amber)", fontWeight: 600 }}>🎁 Intro: ${product.intro_amount.toFixed(2)} × {product.intro_pulls}</span>}
              </div>

              {/* Price */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: "var(--green)", fontFamily: "monospace", letterSpacing: "-0.03em" }}>
                  {paymentMethod === "crypto" ? "" : fiatSymbol}{activeAmount?.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>/ {isYearly ? "year" : intervalLabel} · {paymentMethod === "crypto" ? selectedTokenMeta.label : (product.fiat_currency || "usd").toUpperCase()}</span>
              </div>

              {isYearly && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{paymentMethod === "crypto" ? "" : fiatSymbol}{(product.yearly_amount / 12).toFixed(2)}/month equivalent · billed annually</div>}
              {!isYearly && hasTrial && !hasIntro && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Free for {trialDays} days, then {paymentMethod === "crypto" ? "" : fiatSymbol}{product.amount?.toFixed(2)}/{intervalLabel}</div>}
              {!isYearly && !hasTrial && hasIntro && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{paymentMethod === "crypto" ? "" : fiatSymbol}{product.intro_amount.toFixed(2)}/{intervalLabel} for {product.intro_pulls} {intervalPlural}, then {paymentMethod === "crypto" ? "" : fiatSymbol}{product.amount?.toFixed(2)}</div>}
            </div>

            {/* Network error */}
            {isWrongNetwork && (
              <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 16 }}>
                Wrong network. AuthOnce runs on Base Network.{" "}
                <button onClick={() => switchChain({ chainId: baseSepolia.id })} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontWeight: 700, textDecoration: "underline", padding: 0, fontFamily: "inherit" }}>
                  Switch now
                </button>
              </div>
            )}

            {errorMsg && (
              <div style={{ background: "rgba(248,113,113,0.08)", border: "0.5px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}

            {/* Payment method selector */}
            {(flowStatus === "idle" || flowStatus === "connected") && availableMethods && availableMethods.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Pay with</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {availableMethods.map(method => {
                    const cfg = {
                      crypto:     { label: "Crypto wallet", icon: "⛓" },
                      card:       { label: "Card",          icon: "💳" },
                      sepa:       { label: "SEPA Transfer", icon: "🏦" },
                      ideal:      { label: "iDEAL",         icon: "🇳🇱" },
                      bancontact: { label: "Bancontact",    icon: "🇧🇪" },
                      eps:        { label: "EPS",           icon: "🇦🇹" },
                      klarna:     { label: "Klarna",        icon: "🛍" },
                      blik:       { label: "BLIK",          icon: "🇵🇱" },
                      mbway:      { label: "MB Way",        icon: "📱" },
                      multibanco: { label: "Multibanco",    icon: "🏧" },
                    }[method] || { label: method, icon: "💳" };
                    const sel = paymentMethod === method;
                    const showDiscount = method === "crypto" && cryptoDiscountPct > 0 && baseAmount;
                    const methodPrice = showDiscount
                      ? (baseAmount * (1 - cryptoDiscountPct / 100))
                      : baseAmount;
                    return (
                      <div key={method} onClick={() => setPaymentMethod(method)} style={{
                        display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px",
                        borderRadius: 10, cursor: "pointer",
                        border: `0.5px solid ${sel ? "rgba(29,158,117,0.4)" : "var(--border)"}`,
                        background: sel ? "rgba(29,158,117,0.06)" : "var(--bg-tag)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: sel ? "var(--green)" : "var(--text-secondary)" }}>{cfg.label}</span>
                        </div>
                        {methodPrice != null && (
                          <div style={{ fontSize: 11, color: sel ? "var(--green)" : "var(--text-muted)", paddingLeft: 28 }}>
                            {method === "crypto" ? "" : fiatSymbol}{methodPrice.toFixed(showDiscount ? 4 : 2)}
                            {showDiscount && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>(-{cryptoDiscountPct}%)</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stripe flow */}
            {(flowStatus === "idle" || flowStatus === "connected") && paymentMethod !== "crypto" && (
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
                style={ctaBtn(stripeLoading)}
              >
                {stripeLoading ? "Redirecting..." : `Pay ${isYearly ? `${fiatSymbol}${product?.yearly_amount?.toFixed(2)}/year` : `${fiatSymbol}${product?.amount?.toFixed(2)}/${intervalLabel}`} →`}
              </button>
            )}

            {/* Crypto — token selector + wallet connect (idle) */}
            {flowStatus === "idle" && paymentMethod === "crypto" && (
              <div style={{ textAlign: "center" }}>
                {/* Token selector — idle, crypto path */}
                {productCryptoTokens.length > 1 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                      Pay with token
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      {productCryptoTokens.map(tokenId => {
                        const meta = TOKEN_META[tokenId];
                        const sel  = selectedToken === tokenId;
                        return (
                          <button
                            key={tokenId}
                            onClick={() => setSelectedToken(tokenId)}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                              border: `0.5px solid ${sel ? "rgba(29,158,117,0.4)" : "var(--border)"}`,
                              background: sel ? "rgba(29,158,117,0.08)" : "var(--bg-tag)",
                              fontFamily: "inherit",
                            }}
                          >
                            <span style={{ fontSize: 15 }}>{meta.icon}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: sel ? "var(--green)" : "var(--text-secondary)" }}>
                              {meta.label}
                            </span>
                            {sel && <span style={{ fontSize: 10, color: "var(--green)" }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>Connect your wallet to subscribe</div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ConnectButton />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 10 }}>MetaMask · Coinbase Wallet · WalletConnect</div>
              </div>
            )}

            {/* Connected — steps + subscribe button */}
            {(flowStatus === "connected" || flowStatus === "approving" || flowStatus === "subscribing") && paymentMethod === "crypto" && (
              <>
                {/* Wallet badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(29,158,117,0.06)", border: "0.5px solid rgba(29,158,117,0.18)",
                  borderRadius: 10, padding: "10px 14px", marginBottom: 16,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: "var(--green)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "var(--bg-primary)",
                  }}>
                    {address?.slice(2, 4).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "monospace" }}>
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--green)" }}>✓ Wallet connected</div>
                  </div>
                  <button onClick={() => { disconnect(); setFlowStatus("idle"); setErrorMsg(""); }}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                    Disconnect
                  </button>
                </div>

                {/* Token selector — connected, crypto path */}
                {flowStatus === "connected" && productCryptoTokens.length > 1 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Pay with token</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {productCryptoTokens.map(tokenId => {
                        const meta = TOKEN_META[tokenId];
                        const sel  = selectedToken === tokenId;
                        return (
                          <button key={tokenId} onClick={() => setSelectedToken(tokenId)} style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "7px 12px",
                            borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                            border: `0.5px solid ${sel ? "rgba(29,158,117,0.4)" : "var(--border)"}`,
                            background: sel ? "rgba(29,158,117,0.08)" : "var(--bg-tag)",
                          }}>
                            <span style={{ fontSize: 13 }}>{meta.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: sel ? "var(--green)" : "var(--text-secondary)" }}>{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Transaction steps */}
                <div style={{ marginBottom: 18 }}>
                  <Step n={1} label={`Approve ${activeAmount?.toFixed(2)} ${selectedTokenMeta.label}`} active={stepApprove} done={approvedDone} />
                  <Step n={2} label="Create subscription on-chain" active={stepSubscribe} done={subscribedDone} />
                </div>

                {/* Notification opt-in — email for humans, webhook for AI agents */}
                {flowStatus === "connected" && (
                  <div style={{
                    background: "var(--bg-tag)", border: "0.5px solid var(--border)",
                    borderRadius: 10, padding: "12px 14px", marginBottom: 14,
                  }}>
                    {isContractAddress ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                          🤖 AI agent detected
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                          Receive payment alerts via webhook (optional)
                        </div>
                        <input
                          type="url"
                          placeholder="https://your-agent.com/authonce-webhook"
                          value={agentWebhookUrl}
                          onChange={e => setAgentWebhookUrl(e.target.value)}
                          style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }}
                        />
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                          🔔 Payment alerts (optional)
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                          Get notified if a payment fails or your grace period starts. Otherwise we'll send a wallet notification via Push Protocol.
                        </div>
                        <input
                          type="email"
                          placeholder="you@example.com"
                          value={subscriberEmail}
                          onChange={e => setSubscriberEmail(e.target.value)}
                          style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }}
                        />
                      </>
                    )}
                  </div>
                )}

                {/* Permission steps — what the subscriber will be asked to approve */}
                {(flowStatus === "connected" || flowStatus === "approving" || flowStatus === "subscribing") && (
                  <PermissionSteps
                    tokenSymbol={selectedTokenMeta.label}
                    activeStep={permissionStep}
                    mode={flowMode}
                  />
                )}

                {/* Trust signals */}
                {flowStatus === "connected" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, padding: "14px 16px", background: "var(--bg-tag)", borderRadius: 10, border: "0.5px solid var(--border)" }}>
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
                    background: "rgba(29,158,117,0.06)", border: "0.5px solid rgba(29,158,117,0.18)",
                    borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--green)",
                    textAlign: "center", marginBottom: 16,
                  }}>
                    {flowMode === "legacy" && stepApprove && !approveConfirmed && "Waiting for approval confirmation..."}
                    {flowMode === "legacy" && approveConfirmed && stepSubscribe && "Approved. Creating subscription..."}
                    {flowMode === "legacy" && stepSubscribe && !subscribeConfirmed && !approveConfirmed && "Creating subscription on-chain..."}

                    {flowMode === "permit" && stepSubscribe && !subscribeTxHash && "Confirm the signature in your wallet..."}
                    {flowMode === "permit" && stepSubscribe && subscribeTxHash && !subscribeConfirmed && "Signed. Confirming on-chain..."}

                    {flowMode === "direct" && stepSubscribe && !subscribeConfirmed && "Confirming on-chain..."}
                  </div>
                )}

                {!resolvedAddress && !merchantAddress?.startsWith("0x") && (
                  <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12, textAlign: "center" }}>Resolving merchant... please wait.</div>
                )}

                {flowStatus === "connected" && (
                  <button
                    style={ctaBtn(isWrongNetwork || !resolvedAddress)}
                    onClick={() => handleApprove()}
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
                  <button style={{ ...ctaBtn(true) }} disabled>
                    {stepApprove && !approveConfirmed ? `Approving ${selectedTokenMeta.label}...` : "Creating subscription..."}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
        Powered by <span style={{ color: "var(--green)" }}>AuthOnce</span> · Non-custodial · Base Network
      </div>
    </div>
  );
}
