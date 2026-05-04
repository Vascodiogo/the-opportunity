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
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <BrowserRouter>
            <Routes>
              <Route path="/pay/:merchantAddress/:productSlug" element={<PayPage />} />
              <Route path="*" element={<App />} />
            </Routes>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
