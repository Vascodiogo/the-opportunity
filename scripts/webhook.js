// scripts/webhook.js
// =============================================================================
//  AuthOnce — Webhook Dispatcher
//
//  Fires HMAC-SHA256 signed POST requests to merchant webhook endpoints.
//  Falls back to email (Resend) for merchants with no webhook configured.
//
//  Retry policy: 10s → 1min → 5min → 30min → 2hr (5 attempts max)
// =============================================================================

require("dotenv").config();
const crypto = require("crypto");
const { getMerchantWebhook, logWebhookDelivery } = require("./db");

const RETRY_DELAYS_MS = [10_000, 60_000, 300_000, 1_800_000, 7_200_000];
const WEBHOOK_TIMEOUT_MS = 10_000;

// -----------------------------------------------------------------------------
// Sign payload with HMAC-SHA256
// -----------------------------------------------------------------------------

function signPayload(payload, secret) {
  return "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

// -----------------------------------------------------------------------------
// Fire a single webhook attempt
// -----------------------------------------------------------------------------

async function fireWebhook(url, secret, payload, attempt = 1) {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AuthOnce-Signature": signature,
        "X-AuthOnce-Event": payload.event,
        "X-AuthOnce-Timestamp": String(payload.timestamp),
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await res.text().catch(() => "");
    const delivered = res.ok;

    await logWebhookDelivery({
      merchantAddress: payload.data?.merchant_address || payload.data?.vault_address || "unknown",
      eventType: payload.event,
      payload,
      responseStatus: res.status,
      responseBody: responseBody.substring(0, 500),
      attempt,
      delivered,
    });

    if (delivered) {
      console.log(`[WEBHOOK] ✓ ${payload.event} → ${url} (${res.status})`);
      return true;
    } else {
      console.warn(`[WEBHOOK] ✗ ${payload.event} → ${url} (${res.status})`);
      return false;
    }
  } catch (err) {
    clearTimeout(timeout);
    console.error(`[WEBHOOK] Error on attempt ${attempt}:`, err.message);
    await logWebhookDelivery({
      merchantAddress: payload.data?.merchant_address || "unknown",
      eventType: payload.event,
      payload,
      responseStatus: null,
      responseBody: err.message,
      attempt,
      delivered: false,
    });
    return false;
  }
}

// -----------------------------------------------------------------------------
// Fire webhook with retry logic
// -----------------------------------------------------------------------------

async function dispatchWebhook(merchantAddress, event, data) {
  const merchant = await getMerchantWebhook(merchantAddress);

  const payload = {
    event,
    timestamp: Math.floor(Date.now() / 1000),
    data,
  };

  // No webhook configured — fall back to email
  if (!merchant?.webhook_url) {
    console.log(`[WEBHOOK] No webhook for ${merchantAddress} — falling back to email`);
    await sendEmailFallback(merchantAddress, event, data);
    return;
  }

  const { webhook_url, webhook_secret } = merchant;

  // Try up to 5 times with exponential backoff
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    const success = await fireWebhook(webhook_url, webhook_secret, payload, attempt);
    if (success) return;

    if (attempt <= RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      console.log(`[WEBHOOK] Retrying in ${delay / 1000}s (attempt ${attempt + 1}/5)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.error(`[WEBHOOK] All 5 attempts failed for ${event} → ${merchantAddress}`);
  // After all retries fail, send email alert to merchant
  await sendEmailFallback(merchantAddress, event, data);
}

// -----------------------------------------------------------------------------
// Email fallback (Resend) — for no-code merchants or failed webhooks
// -----------------------------------------------------------------------------

async function sendEmailFallback(merchantAddress, event, data) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.log(`[EMAIL] No Resend key configured — skipping email fallback`);
    return;
  }

  const subjects = {
    "subscription.created":  `New subscriber — vault ${data.vault_address?.substring(0, 10)}...`,
    "payment.success":       `Payment received — ${data.amount_usdc} USDC`,
    "payment.failed":        `⚠️ Payment failed — subscriber needs to top up`,
    "subscription.cancelled":`Subscription cancelled`,
    "subscription.expired":  `Subscription expired — grace period ended`,
    "subscription.resumed":  `Subscription resumed`,
    "subscription.paused":   `Subscription paused`,
  };

  const subject = subjects[event] || `AuthOnce event: ${event}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AuthOnce <notifications@authonce.io>",
        to: [NOTIFY_EMAIL],
        subject,
        html: `
          <h2>${subject}</h2>
          <p><strong>Event:</strong> ${event}</p>
          <p><strong>Merchant:</strong> ${merchantAddress}</p>
          <pre>${JSON.stringify(data, null, 2)}</pre>
          <hr>
          <p><small>AuthOnce Protocol — authonce.io</small></p>
        `,
      }),
    });

    if (res.ok) {
      console.log(`[EMAIL] ✓ Fallback email sent for ${event}`);
    } else {
      console.error(`[EMAIL] ✗ Resend error:`, res.status);
    }
  } catch (err) {
    console.error(`[EMAIL] Error sending fallback email:`, err.message);
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

module.exports = { dispatchWebhook };
