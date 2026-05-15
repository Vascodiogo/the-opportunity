import { http, fallback, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, metaMask, coinbaseWallet, walletConnect } from "wagmi/connectors";

const projectId = "ef9eec0d711f2f3100ef8c4ae8336b31";

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    metaMask(),
    coinbaseWallet({ appName: "AuthOnce" }),
    walletConnect({ projectId }),
    injected(),
  ],
  transports: {
    [baseSepolia.id]: fallback([
      http(`https://base-sepolia.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_KEY}`), // Alchemy — primary
      http("https://sepolia.base.org"),                                      // Base public — fallback
      http("https://84532.rpc.thirdweb.com"),                               // Thirdweb — tertiary
    ]),
  },
});

// ─── RPC URLs — used by createPublicClient in components ─────────────────────
// Alchemy primary, public fallback, Thirdweb tertiary
export const RPC_URLS = [
  "https://base-sepolia.g.alchemy.com/v2/_uXoDLhLHyfV7jqbsvucT",
  "https://sepolia.base.org",
  "https://84532.rpc.thirdweb.com",
];

// ─── Contract addresses ───────────────────────────────────────────────────────
// Updated after v4 redeploy — replace with new addresses after running deploy.js
export const VAULT_ADDRESS = "0x12ded877546bdaF500A1FeAd66798d5877c42f1d";
export const REGISTRY_ADDRESS = "0xaB9a719AD824CF81Ade886E7987702d62cb3df40"; // unchanged
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // USDC Base Sepolia
export const ADMIN_ADDRESS    = "0x00df2Dbb2455C372204EdD901894E27281fA02C0";

// ─── SubscriptionVault v4 ABI ─────────────────────────────────────────────────
export const VAULT_ABI = [
  {
    name: "subscriptions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "owner",           type: "address" },
      { name: "guardian",        type: "address" },
      { name: "merchant",        type: "address" },
      { name: "safeVault",       type: "address" },
      { name: "amount",          type: "uint256" },
      { name: "introAmount",     type: "uint256" },
      { name: "introPulls",      type: "uint256" },
      { name: "pullCount",       type: "uint256" },
      { name: "interval",        type: "uint8"   },
      { name: "lastPulledAt",    type: "uint256" },
      { name: "pausedAt",        type: "uint256" },
      { name: "expiresAt",       type: "uint256" },
      { name: "trialEndsAt",     type: "uint256" },
      { name: "gracePeriodDays", type: "uint256" },
      { name: "status",          type: "uint8"   },
    ],
  },
  {
    name: "createSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "merchant",         type: "address" },
      { name: "safeVault",        type: "address" },
      { name: "amount",           type: "uint256" },
      { name: "introAmount",      type: "uint256" },
      { name: "introPulls",       type: "uint256" },
      { name: "interval",         type: "uint8"   },
      { name: "guardian",         type: "address" },
      { name: "trialDays",        type: "uint256" },
      { name: "gracePeriodDays_", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "cancelSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "pauseSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "resumeSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "isDue",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "vaultBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "vaultAllowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nextPullAmount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "inTrial",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "inIntroPricing",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "introPullsRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approvedMerchants",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "approveMerchant",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [],
  },
  {
    name: "setProductExpiry",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id",        type: "uint256" },
      { name: "expiresAt", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "merchantPauseSubscription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id",        type: "uint256" },
      { name: "pauseDays", type: "uint256" },
    ],
    outputs: [],
  },
  // Events
  {
    name: "SubscriptionCreated",
    type: "event",
    inputs: [
      { name: "id",          type: "uint256", indexed: true  },
      { name: "owner",       type: "address", indexed: true  },
      { name: "merchant",    type: "address", indexed: true  },
      { name: "safeVault",   type: "address", indexed: false },
      { name: "amount",      type: "uint256", indexed: false },
      { name: "introAmount", type: "uint256", indexed: false },
      { name: "introPulls",  type: "uint256", indexed: false },
      { name: "interval",    type: "uint8",   indexed: false },
      { name: "guardian",    type: "address", indexed: false },
    ],
  },
  {
    name: "PaymentExecuted",
    type: "event",
    inputs: [
      { name: "id",               type: "uint256", indexed: true  },
      { name: "amount",           type: "uint256", indexed: false },
      { name: "merchantReceived", type: "uint256", indexed: false },
      { name: "fee",              type: "uint256", indexed: false },
      { name: "pullCount",        type: "uint256", indexed: false },
      { name: "timestamp",        type: "uint256", indexed: false },
    ],
  },
  {
    name: "InsufficientFunds",
    type: "event",
    inputs: [
      { name: "id",          type: "uint256", indexed: true  },
      { name: "required",    type: "uint256", indexed: false },
      { name: "available",   type: "uint256", indexed: false },
      { name: "pausedUntil", type: "uint256", indexed: false },
    ],
  },
  {
    name: "InsufficientAllowance",
    type: "event",
    inputs: [
      { name: "id",        type: "uint256", indexed: true  },
      { name: "required",  type: "uint256", indexed: false },
      { name: "allowance", type: "uint256", indexed: false },
    ],
  },
  {
    name: "SubscriptionCancelled",
    type: "event",
    inputs: [
      { name: "id",          type: "uint256", indexed: true  },
      { name: "cancelledBy", type: "address", indexed: false },
    ],
  },
  {
    name: "SubscriptionExpired",
    type: "event",
    inputs: [
      { name: "id",        type: "uint256", indexed: true  },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "TrialStarted",
    type: "event",
    inputs: [
      { name: "id",          type: "uint256", indexed: true  },
      { name: "trialEndsAt", type: "uint256", indexed: false },
    ],
  },
];

// ─── MerchantRegistry ABI ────────────────────────────────────────────────────
export const REGISTRY_ABI = [
  {
    name: "isApproved",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "merchantCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getMerchantAt",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "approveMerchant",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [],
  },
  {
    name: "revokeMerchant",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [],
  },
  {
    name: "admin",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
];

// ─── USDC ABI ────────────────────────────────────────────────────────────────
export const USDC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const INTERVAL_NAMES = ["Weekly", "Monthly", "Yearly"];
export const STATUS_NAMES   = ["Active", "Paused", "Cancelled", "Expired"];
export const STATUS_COLORS  = {
  Active:    { bg: "rgba(52,211,153,0.12)",  color: "#34d399" },
  Paused:    { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  Cancelled: { bg: "rgba(248,113,113,0.12)", color: "#f87171" },
  Expired:   { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
};

export function shortAddress(addr) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatUSDC(raw) {
  if (!raw && raw !== 0n) return "$0.00";
  return `$${(parseFloat(raw.toString()) / 1e6).toFixed(2)}`;
}
