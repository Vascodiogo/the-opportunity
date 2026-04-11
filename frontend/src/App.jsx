import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { shortAddress, ADMIN_ADDRESS } from "./config.js";
import Dashboard from "./components/Dashboard.jsx";

export default function App() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  if (!isConnected) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        minHeight: "100vh", gap: 24, padding: 24,
      }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: "#080c14",
          }}>O</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
            The Opportunity
          </h1>
          <p style={{ color: "#64748b", marginTop: 8, fontSize: 15 }}>
            Authorize once. Pay forever. Stay in control.
          </p>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: 32, width: "100%", maxWidth: 380,
          textAlign: "center",
        }}>
          <p style={{ color: "#94a3b8", marginBottom: 24, fontSize: 14 }}>
            Connect your wallet to manage your subscriptions on Base Sepolia.
          </p>
          <ConnectButton />
          <p style={{ color: "#334155", fontSize: 12, marginTop: 16 }}>
            Make sure you're on the <strong style={{ color: "#475569" }}>Base Sepolia</strong> network
          </p>
        </div>

        <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#334155" }}>
          <span>SubscriptionVault verified ✅</span>
          <span>MerchantRegistry verified ✅</span>
          <span>Base Sepolia</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 58,
        borderBottom: "0.5px solid rgba(255,255,255,0.07)",
        background: "rgba(8,12,20,0.95)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #34d399, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800, color: "#080c14",
          }}>O</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>
            The Opportunity
          </span>
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 99,
            background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontWeight: 600,
          }}>Base Sepolia</span>
          {isAdmin && (
            <span style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 99,
              background: "rgba(251,191,36,0.15)", color: "#fbbf24", fontWeight: 600,
            }}>Admin</span>
          )}
        </div>
        <ConnectButton />
      </nav>
      <Dashboard address={address} isAdmin={isAdmin} />
    </div>
  );
}