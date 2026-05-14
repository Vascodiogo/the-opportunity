import { Buffer } from 'buffer';
window.Buffer = Buffer;
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "wagmi/chains";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Standalone routes — no wallet provider needed */}
        <Route path="/pricing" element={<Pricing />} />

        {/* Wallet-enabled routes */}
        <Route path="*" element={
          <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
              <RainbowKitProvider theme={darkTheme()}>
                <Routes>
                  <Route path="/pay/:merchantAddress/:productSlug" element={<PayPage />} />
                  <Route path="*" element={<App />} />
                </Routes>
              </RainbowKitProvider>
            </QueryClientProvider>
          </WagmiProvider>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
