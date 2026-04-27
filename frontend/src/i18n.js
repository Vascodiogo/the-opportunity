// src/i18n.js — AuthOnce translations
export const translations = {
  en: {
    // Nav
    nav_subscriptions: "My Subscriptions",
    nav_merchant: "Merchant Portal",
    nav_launch: "Launch App",

    // Landing
    tagline: "Authorize once. Pay forever. Stay in control.",
    hero_title_1: "Crypto subscriptions,",
    hero_title_2: "without the complexity.",
    hero_description: "AuthOnce lets merchants accept recurring USDC payments on Base Network. Non-custodial, transparent, and unstoppable.",
    get_started: "Get Started",
    learn_more: "Learn more",
    connect_wallet: "Connect Wallet",
    connect_description: "Connect your wallet to manage your subscriptions on Base Sepolia.",
    network_hint: "Make sure you're on the",
    network_name: "Base Sepolia",
    network_suffix: "network",

    // Features
    feature_1_title: "Authorize Once",
    feature_1_desc: "Sign a single intent. Payments run automatically on schedule — no manual action needed.",
    feature_2_title: "Full Custody",
    feature_2_desc: "Your USDC stays in your own Safe vault. The protocol never holds your funds.",
    feature_3_title: "Hard Caps",
    feature_3_desc: "Spending limits are enforced on-chain. Merchants can never pull more than you agreed to.",
    feature_4_title: "Instant Alerts",
    feature_4_desc: "Get notified before every payment. Cancel anytime with one click.",

    // Stats
    stat_1: "0.5%",
    stat_1_label: "Protocol fee",
    stat_2: "7 days",
    stat_2_label: "Grace period",
    stat_3: "Base Network",
    stat_3_label: "Chain",
    stat_4: "USDC",
    stat_4_label: "Token",

    // Footer
    footer_tagline: "The future of recurring payments.",
    footer_contract: "Smart contracts verified on Basescan",
    footer_license: "Licensed under BUSL-1.1",
    footer_testnet: "Currently on Base Sepolia testnet",

    // Status
    vault_verified: "SubscriptionVault verified",
    registry_verified: "MerchantRegistry verified",
  },

  pt: {
    // Nav
    nav_subscriptions: "As Minhas Subscrições",
    nav_merchant: "Portal do Comerciante",
    nav_launch: "Abrir App",

    // Landing
    tagline: "Autorize uma vez. Pague para sempre. Mantenha o controlo.",
    hero_title_1: "Subscrições cripto,",
    hero_title_2: "sem a complexidade.",
    hero_description: "O AuthOnce permite que os comerciantes aceitem pagamentos recorrentes em USDC na Base Network. Não custodial, transparente e imparável.",
    get_started: "Começar",
    learn_more: "Saber mais",
    connect_wallet: "Ligar Carteira",
    connect_description: "Ligue a sua carteira para gerir as suas subscrições na Base Sepolia.",
    network_hint: "Certifique-se de que está na rede",
    network_name: "Base Sepolia",
    network_suffix: "",

    // Features
    feature_1_title: "Autorize Uma Vez",
    feature_1_desc: "Assine uma única intenção. Os pagamentos correm automaticamente — sem ação manual.",
    feature_2_title: "Custódia Total",
    feature_2_desc: "O seu USDC fica no seu próprio cofre Safe. O protocolo nunca detém os seus fundos.",
    feature_3_title: "Limites Rígidos",
    feature_3_desc: "Os limites de gastos são aplicados on-chain. Os comerciantes nunca podem cobrar mais do que o acordado.",
    feature_4_title: "Alertas Imediatos",
    feature_4_desc: "Receba notificações antes de cada pagamento. Cancele a qualquer momento com um clique.",

    // Stats
    stat_1: "0,5%",
    stat_1_label: "Taxa do protocolo",
    stat_2: "7 dias",
    stat_2_label: "Período de graça",
    stat_3: "Base Network",
    stat_3_label: "Rede",
    stat_4: "USDC",
    stat_4_label: "Token",

    // Footer
    footer_tagline: "O futuro dos pagamentos recorrentes.",
    footer_contract: "Contratos inteligentes verificados no Basescan",
    footer_license: "Licenciado sob BUSL-1.1",
    footer_testnet: "Atualmente na testnet Base Sepolia",

    // Status
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
