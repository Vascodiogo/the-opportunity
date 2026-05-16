// src/i18n.js — AuthOnce translations
export const translations = {
  en: {
    nav_subscriptions: "My Subscriptions",
    nav_merchant: "Merchant Portal",
    nav_launch: "Launch App",
    tagline: "Authorize once. Pay forever. Stay in control.",
    connect_description: "Connect your wallet to manage your subscriptions on Base Network.",
    network_hint: "Make sure you're on the",
    network_name: "Base Network",
    network_suffix: "network",
    vault_verified: "SubscriptionVault verified",
    registry_verified: "MerchantRegistry verified",
  },
  pt: {
    nav_subscriptions: "As Minhas Subscrições",
    nav_merchant: "Portal do Comerciante",
    nav_launch: "Abrir App",
    tagline: "Autorize uma vez. Pague para sempre. Mantenha o controlo.",
    connect_description: "Ligue a sua carteira para gerir as suas subscrições na Base Sepolia.",
    network_hint: "Certifique-se de que está na rede",
    network_name: "Base Sepolia",
    network_suffix: "",
    vault_verified: "SubscriptionVault verificado",
    registry_verified: "MerchantRegistry verificado",
  },
};

export function detectLang() {
  const path = window.location.pathname;
  if (path.startsWith("/pt")) return "pt";
  const browser = navigator.language || navigator.userLanguage || "en";
  return browser.toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function t(lang, key) {
  return translations[lang]?.[key] || translations.en[key] || key;
}
