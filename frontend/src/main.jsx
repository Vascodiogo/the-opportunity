import { Buffer } from 'buffer';
window.Buffer = Buffer;
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "wagmi/chains";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import "@fontsource-variable/dm-sans";
import PayPage from "./components/PayPage.jsx";
import Pricing from "./components/Pricing.jsx";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";

const config = getDefaultConfig({
  appName: "AuthOnce",
  projectId: "ef9eec0d711f2f3100ef8c4ae8336b31",
  chains: [baseSepolia],
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
                      <Route path="/pay/:merchantAddress/:productSlug" element={<PayPage />} />
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
