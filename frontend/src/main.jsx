import { Buffer } from 'buffer';
window.Buffer = Buffer;
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, connectorsForWallets, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { metaMaskWallet, walletConnectWallet, rainbowWallet } from "@rainbow-me/rainbowkit/wallets";
import { baseSepolia } from "wagmi/chains";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import "@fontsource-variable/dm-sans";
import PayPage from "./components/PayPage.jsx";
import Pricing from "./components/Pricing.jsx";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";

// [WALLET LIST FIX Nov 2026] Previously built via RainbowKit's getDefaultConfig(),
// which pulls in its own default wallet list — including "Coinbase Wallet",
// now rebranded "Base Account" and backed by the @base-org/account SDK.
// Two independent problems with that, found the same day (AUTHONCE-BACKLOG.md T51):
// (1) On mobile, that SDK's own reconnect handshake was redirecting the
//     ENTIRE page to keys.coinbase.com/onboarding on every refresh, once a
//     visitor had ever selected it — not a popup, a full top-level navigation
//     away from the site, triggered by wagmi's default reconnectOnMount
//     silently retrying the last-used connector.
// (2) Coinbase Wallet/Base Account is a smart contract wallet by default.
//     T16 (unresolved) means the keeper has no working recurring-pull path
//     for most contract wallets yet — a subscriber connecting with it could
//     sign up and then silently never be billed again, with no on-chain
//     error to signal why.
// Switched to RainbowKit's documented connectorsForWallets() + wagmi's
// createConfig() specifically so the wallet list can be curated explicitly
// (getDefaultConfig has no documented way to do this). MetaMask,
// WalletConnect (covers every WalletConnect-compatible wallet, including
// mobile MetaMask via QR/deep link), and Rainbow kept — all plain EOA
// wallets, matching this project's actual EIP-2612/EOA-first architecture.
// Revisit only once T16 actually ships a working contract-wallet pull path.
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, walletConnectWallet, rainbowWallet],
    },
  ],
  { appName: "AuthOnce", projectId: "ef9eec0d711f2f3100ef8c4ae8336b31" }
);
const config = createConfig({
  chains: [baseSepolia],
  connectors,
  // No explicit RPC URL — same as before (getDefaultConfig also left this
  // unset), so viem falls back to baseSepolia's own built-in default RPC.
  // This is NOT the same thing as RPC_URLS in config.js, which is only used
  // by individual components' own createPublicClient() calls for direct
  // contract reads (see AUTHONCE-BACKLOG.md T5/T44-T47 for that RPC story).
  transports: {
    [baseSepolia.id]: http(),
  },
});
const queryClient = new QueryClient();

// Theme lives here, not inside App.jsx, so RainbowKitProvider (which wraps
// App) and the wallet-connect modal it renders can react to the same
// light/dark toggle App.jsx exposes via the sun/moon button — previously
// this provider was hardcoded to darkTheme() regardless of that toggle.
// App.jsx still owns the toggle UI and the localStorage/documentElement
// side effects; this is just the single source of truth both now share.
function Root() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
    // No explicit user choice saved yet — respect the OS/browser setting.
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  });

  return (
    <StrictMode>
      <HelmetProvider>
        <BrowserRouter>
          <Routes>
            {/* Standalone routes — no wallet provider needed */}
            <Route path="/pricing" element={<Pricing />} />

            {/* Wallet-enabled routes */}
            <Route path="*" element={
              <WagmiProvider config={config}>
                <QueryClientProvider client={queryClient}>
                  <RainbowKitProvider theme={theme === "dark" ? darkTheme() : lightTheme()}>
                    <Routes>
                      <Route path="/pay/:merchantAddress/:productSlug" element={
                        // This page has no light/dark toggle — it is always dark by
                        // design. It sits inside the shared RainbowKitProvider above
                        // (themed from the main app's toggle state), so without this
                        // override its wallet-connect modal would inherit whatever
                        // theme the visitor last set on the main app, mismatching
                        // this always-dark page. Nesting a second RainbowKitProvider
                        // here, pinned to darkTheme(), restores the original (and
                        // correct) pairing for this specific route only.
                        <RainbowKitProvider theme={darkTheme()}>
                          <PayPage />
                        </RainbowKitProvider>
                      } />
                      <Route path="*" element={<App theme={theme} setTheme={setTheme} />} />
                    </Routes>
                  </RainbowKitProvider>
                </QueryClientProvider>
              </WagmiProvider>
            } />
          </Routes>
        </BrowserRouter>
      </HelmetProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById("root")).render(<Root />);
