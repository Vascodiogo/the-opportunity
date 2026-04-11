import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, metaMask, coinbaseWallet, walletConnect } from "wagmi/connectors";

const projectId = "ef9eec0d711f2f3100ef8c4ae8336b31";

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    metaMask(),
    coinbaseWallet({ appName: "The Opportunity" }),
    walletConnect({ projectId }),
    injected(),
  ],
  transports: {
    [baseSepolia.id]: http(
      "https://base-sepolia.g.alchemy.com/v2/_uXoDLhLHyfV7jqbsvucT"
    ),
  },
});

export const VAULT_ADDRESS    = "0x2ED847da7f88231Ac6907196868adF4840A97f49";
export const REGISTRY_ADDRESS = "0xE62aF1DcADeF946ecC08978dec565344A63B8f9b";
export const USDC_ADDRESS     = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913";
export const ADMIN_ADDRESS    = "0x44444D60136Cf62804963fA14d62a55c34a96f8F";

export const VAULT_ABI = [
  "function subscriptions(uint256 id) external view returns (address owner, address guardian, address merchant, address safeVault, uint256 amount, uint8 interval, uint256 lastPulledAt, uint256 pausedAt, uint8 status)",
  "function isDue(uint256 id) external view returns (bool)",
  "function vaultBalance(uint256 id) external view returns (uint256)",
  "function approvedMerchants(address) external view returns (bool)",
  "function createSubscription(address merchant, address safeVault, uint256 amount, uint8 interval, address guardian) external returns (uint256)",
  "function cancelSubscription(uint256 id) external",
  "function pauseSubscription(uint256 id) external",
  "function resumeSubscription(uint256 id) external",
  "function approveMerchant(address merchant) external",
  "event SubscriptionCreated(uint256 indexed id, address indexed owner, address indexed merchant, address safeVault, uint256 amount, uint8 interval, address guardian)",
  "event PaymentExecuted(uint256 indexed id, uint256 amount, uint256 merchantReceived, uint256 fee, uint256 timestamp)",
  "event InsufficientFunds(uint256 indexed id, uint256 required, uint256 available, uint256 pausedUntil)",
  "event SubscriptionCancelled(uint256 indexed id, address cancelledBy)",
  "event SubscriptionExpired(uint256 indexed id, uint256 timestamp)",
];

export const REGISTRY_ABI = [
  "function isApproved(address merchant) external view returns (bool)",
  "function merchantCount() external view returns (uint256)",
  "function getMerchantAt(uint256 index) external view returns (address)",
  "function approveMerchant(address merchant) external",
  "function revokeMerchant(address merchant) external",
  "function admin() external view returns (address)",
];

export const USDC_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

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
  return `$${parseFloat(raw.toString() / 1e6).toFixed(2)}`;
}