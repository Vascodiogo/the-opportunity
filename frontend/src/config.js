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
  `https://base-sepolia.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_KEY}`,
  "https://sepolia.base.org",
  "https://84532.rpc.thirdweb.com",
];

// ─── Contract addresses ───────────────────────────────────────────────────────
export const VAULT_ADDRESS    = "0x55180314174B30e778f35357035d49cAEF55C835"; // v6
export const REGISTRY_ADDRESS = "0x989376ff6195be2e76871535Db21CB8BdC9175D4"; // v3
export const USDC_ADDRESS     = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // USDC Base Sepolia
export const ADMIN_ADDRESS    = "0x00df2Dbb2455C372204EdD901894E27281fA02C0";

// ─── Subscription token addresses by network ─────────────────────────────────
// Sepolia: only USDC is whitelisted on the vault — others not yet deployed
// Mainnet: all four stablecoins whitelisted at deploy time (see deploy.js)
export const TOKEN_ADDRESSES = {
  "base-sepolia": {
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  "base-mainnet": {
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    dai:  "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    eurc: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
  },
};

// ─── SubscriptionVault v6 ABI ─────────────────────────────────────────────────
export const VAULT_ABI = [
  {
    name: "subscriptions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "owner",              type: "address" },
      { name: "guardian",           type: "address" },
      { name: "merchant",           type: "address" },
      { name: "safeVault",          type: "address" },
      { name: "token",              type: "address" },
      { name: "amount",             type: "uint256" },
      { name: "introAmount",        type: "uint256" },
      { name: "introPulls",         type: "uint256" },
      { name: "pullCount",          type: "uint256" },
      { name: "interval",           type: "uint8"   },
      { name: "lastPulledAt",       type: "uint256" },
      { name: "billingPausedUntil", type: "uint256" }, // v6: merchant billing pause end
      { name: "pausedAt",           type: "uint256" },
      { name: "expiresAt",          type: "uint256" },
      { name: "trialEndsAt",        type: "uint256" },
      { name: "gracePeriodDays",    type: "uint256" },
      { name: "dataVaultId",        type: "bytes32" },
      { name: "status",             type: "uint8"   },
      { name: "isContractVault",    type: "bool"    }, // v6: vault type flag (SV-01)
    ],
  },
  {
    name: "createSubscription",
    type: "function",
    stateMutability: "nonpayable",
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
    name: "nextPullDue",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "daysUntilTrialEnds",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "daysUntilExpiry",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approvedTokens",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "approvedTokenList",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    name: "subscriptionToken",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "pullAuthorisationDigest",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "id",       type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
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
  // approvedMerchants and approveMerchant moved to MerchantRegistry v2 in v5
  // Use REGISTRY_ABI.isApproved() to check merchant approval status
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
      { name: "id",              type: "uint256", indexed: true  },
      { name: "owner",           type: "address", indexed: true  },
      { name: "merchant",        type: "address", indexed: true  },
      { name: "safeVault",       type: "address", indexed: false },
      { name: "token",           type: "address", indexed: false },
      { name: "amount",          type: "uint256", indexed: false },
      { name: "introAmount",     type: "uint256", indexed: false },
      { name: "introPulls",      type: "uint256", indexed: false },
      { name: "interval",        type: "uint8",   indexed: false },
      { name: "guardian",        type: "address", indexed: false },
      { name: "trialEndsAt",     type: "uint256", indexed: false },
      { name: "gracePeriodDays", type: "uint256", indexed: false },
      { name: "isContractVault", type: "bool",    indexed: false }, // v6 new field
    ],
  },
  {
    name: "PaymentExecuted",
    type: "event",
    inputs: [
      { name: "id",               type: "uint256", indexed: true  },
      { name: "token",            type: "address", indexed: true  },
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
      { name: "token",       type: "address", indexed: true  },
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
      { name: "token",     type: "address", indexed: true  },
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

// ─── MerchantRegistry v3 ABI ─────────────────────────────────────────────────
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
    // v3: live count of currently approved merchants — O(1)
    name: "approvedMerchantCount",
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
    // v3: paginated merchant list — offset + limit (max 200)
    name: "getMerchantsPage",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit",  type: "uint256" },
    ],
    outputs: [
      { name: "page",  type: "address[]" },
      { name: "total", type: "uint256"   },
    ],
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
    // v3: skipBlacklisted param — true = skip silently, false = revert on blacklisted
    name: "batchApproveMerchants",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "merchants",        type: "address[]" },
      { name: "skipBlacklisted",  type: "bool"      },
    ],
    outputs: [],
  },
  {
    name: "batchRevokeMerchants",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "merchants", type: "address[]" }],
    outputs: [],
  },
  {
    name: "blacklistMerchant",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [],
  },
  {
    name: "blacklistedMerchants",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "selfRegister",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "setSelfServe",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "enabled", type: "bool" }],
    outputs: [],
  },
  {
    name: "selfServeEnabled",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "proposeAdminTransfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newAdmin", type: "address" }],
    outputs: [],
  },
  {
    name: "acceptAdminTransfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "admin",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "pendingAdmin",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
];

// ─── ERC-20 ABI — generic token (USDC, USDT, DAI, EURC) ─────────────────────
// Used for all subscription tokens — not just USDC
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

// TOKEN_ABI is the same as USDC_ABI — generic ERC-20 for any subscription token
export const TOKEN_ABI = USDC_ABI;

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
