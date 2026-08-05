// frontend/src/lib/merchantAuth.js
//
// Handles the merchant login flow against the new POST /api/merchant/login
// endpoint (see scripts/api.js — requireMerchantAuth fix, Aug 2026).
//
// Replaces the old pattern of sending X-Merchant-Address on every request
// (which the backend no longer trusts) with: sign once, get a session JWT,
// send it as Authorization: Bearer <token> on every subsequent call.
//
// Session storage: sessionStorage, not localStorage. A JWT is a bearer
// credential — sessionStorage scopes it to this tab and clears it when the
// tab closes, which is the right lifetime for a login session token (unlike
// e.g. UI preferences, which localStorage would be fine for).

const TOKEN_KEY = "authonce_merchant_jwt";
// No internal API_BASE guess — MerchantDashboard.jsx already defines its own
// API_BASE constant (hardcoded Railway URL, not an env var). Pass the full
// login URL in from the caller so this file doesn't duplicate or drift from
// that constant.

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export function getMerchantToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // sessionStorage can throw in some privacy-mode browser configs
  }
}

function setMerchantToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* non-fatal — worst case, user has to re-sign more often */
  }
}

export function clearMerchantToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

// Decode the wallet address out of the stored JWT without needing a
// verification library client-side (the server already verified it when it
// was issued — this is just for display/UI state, not a trust boundary).
export function getMerchantWalletFromToken() {
  const token = getMerchantToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.wallet || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

/**
 * Signs the expected login message and exchanges it for a session JWT.
 *
 * @param {string} loginUrl - full URL to POST to, e.g. `${API_BASE}/api/merchant/login`
 * @param {string} walletAddress - the connected wallet's address (0x...)
 * @param {(args: {message: string}) => Promise<string>} signMessageAsync -
 *   pass wagmi's useSignMessage().signMessageAsync here (or equivalent).
 *
 * @returns {Promise<{ok: true, wallet: string} | {ok: false, error: string}>}
 */
export async function merchantLogin(loginUrl, walletAddress, signMessageAsync) {
  if (!walletAddress) {
    return { ok: false, error: "No wallet connected." };
  }

  const wallet = walletAddress.toLowerCase();
  const timestamp = Date.now();
  const message = `AuthOnce: merchant login (${wallet}) (${timestamp})`;

  let signature;
  try {
    signature = await signMessageAsync({ message });
  } catch (err) {
    // User rejected the signature request, or wallet error.
    return { ok: false, error: err?.message || "Signature request was rejected or failed." };
  }

  let response;
  try {
    response = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: wallet, signature, timestamp }),
    });
  } catch (err) {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { ok: false, error: data?.message || data?.error || "Login failed." };
  }

  setMerchantToken(data.token);
  return { ok: true, wallet: data.wallet_address };
}

// ---------------------------------------------------------------------------
// Authenticated fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for fetch() on merchant-protected endpoints. Attaches
 * the stored JWT as Authorization: Bearer, and surfaces a clear signal when
 * the session has expired so the UI can prompt a re-login instead of
 * silently failing.
 *
 * Usage: replace calls like
 *   fetch(url, { headers: { "X-Merchant-Address": address }, ... })
 * with
 *   merchantFetch(url, { ...options })
 */
export async function merchantFetch(url, options = {}) {
  const token = getMerchantToken();

  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Session expired or was never established — clear whatever stale
    // token exists so the UI doesn't keep retrying with dead credentials.
    clearMerchantToken();
  }

  return response;
}

/**
 * Convenience check for UI gating — e.g. "show login button" vs
 * "show dashboard". Does not verify the token is still valid server-side
 * (that happens naturally on the next merchantFetch call); this is purely
 * for avoiding a flash of the wrong UI state on page load.
 */
export function isMerchantLoggedIn() {
  return Boolean(getMerchantToken());
}
