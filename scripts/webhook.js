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
const { getMerchantWebhook, logWebhookDelivery, getMerchant } = require("./db");
const { templates } = require("./email-templates");

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

  if (!RESEND_API_KEY) {
    console.log(`[EMAIL] No Resend key configured — skipping email fallback`);
    return;
  }

  // Get merchant email dynamically — send to actual merchant, not a fixed address
  let merchantEmail = process.env.NOTIFY_EMAIL; // admin fallback only
  try {
    const merchant = await getMerchant(merchantAddress);
    if (merchant?.email) merchantEmail = merchant.email;
  } catch (err) {
    console.warn(`[EMAIL] Could not fetch merchant email for ${merchantAddress}:`, err.message);
  }

  if (!merchantEmail) {
    console.log(`[EMAIL] No email found for merchant ${merchantAddress} — skipping`);
    return;
  }

  // Plain-English event descriptions for non-technical merchants
  const eventInfo = {
    "subscription.created": {
      subject:     `New subscriber — $${data.amount_usdc || "?"} USDC/${data.interval || "month"}`,
      description: "A new subscriber has authorised a recurring payment. Their wallet is now linked to your product. The keeper bot will pull the subscription amount automatically on each billing date.",
      action:      null,
      badge:       "success",
    },
    "payment.success": {
      subject:     `Payment received — $${data.merchant_received_usdc || data.amount_usdc || "?"} USDC`,
      description: `Payment collected for subscription #${data.subscription_id || "?"}${data.product_name ? ` (${data.product_name})` : ""}. $${data.merchant_received_usdc || data.amount_usdc || "?"} USDC transferred to your wallet after the 0.5% protocol fee.`,
      action:      null,
      badge:       "success",
    },
    "payment.failed": {
      subject:     `⚠️ Payment failed — subscription #${data.subscription_id || "?"}`,
      description: data.reason === "insufficient_allowance"
        ? `Subscription #${data.subscription_id || "?"}: the subscriber's USDC approval has expired or was revoked. The keeper cannot pull funds without it. The subscriber has been notified by email and asked to re-approve.`
        : `Subscription #${data.subscription_id || "?"}: the subscriber's wallet did not have enough USDC (required: $${data.required_usdc || "?"}, available: $${data.available_usdc || "?"}). The subscription has entered the grace period. The keeper will retry automatically once they top up. The subscriber has been notified.`,
      action:      `No action needed from you. Grace period ends: ${data.grace_period_ends_at ? new Date(data.grace_period_ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "see event data"}. If the subscriber does not act before then, the subscription will expire automatically.`,
      badge:       "warning",
    },
    "payment.upcoming": {
      subject:     `Payment reminder — $${data.amount_usdc || "?"} USDC due in ${data.days_until || "?"} days`,
      description: "A subscriber has an upcoming payment in the next 3 days. They have been notified by email to ensure their wallet is funded.",
      action:      null,
      badge:       "info",
    },
    "subscription.paused": {
      subject:     `Subscription paused`,
      description: `A subscription has been paused. Reason: ${data.reason || "manual pause"}. No payments will be collected while paused. The keeper will retry if it was paused due to a failed payment.`,
      action:      null,
      badge:       "warning",
    },
    "subscription.cancelled": {
      subject:     `Subscription #${data.subscription_id || "?"} cancelled`,
      description: `Subscription #${data.subscription_id || "?"} has been cancelled. No further payments will be collected. Cancelled by: ${data.cancelled_by || "subscriber or guardian"} — merchants cannot cancel subscriptions on AuthOnce.`,
      action:      null,
      badge:       "danger",
    },
    "subscription.expired": {
      subject:     `Subscription #${data.subscription_id || "?"} expired`,
      description: `Subscription #${data.subscription_id || "?"} expired — the grace period ended without a successful payment. The subscription has been permanently closed. No further payments will be collected. The subscriber was notified by email.`,
      action:      null,
      badge:       "danger",
    },
    "subscription.resumed": {
      subject:     `Subscription resumed`,
      description: "A subscription that was paused during the grace period has been successfully resumed. The subscriber topped up their wallet and the payment was collected. Billing will continue as normal.",
      action:      null,
      badge:       "success",
    },
    "subscription.expiring": {
      subject:     `Price change notice sent — ${data.days_until || "?"} days remaining`,
      description: `You set a product expiry date (${data.expires_at ? new Date(data.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "see event data"}). The subscriber has been notified of the upcoming change and given the option to cancel. This is required by AuthOnce's 30-day notice rule.`,
      action:      null,
      badge:       "info",
    },
    "test.ping": {
      subject:     `Webhook test — delivery confirmed`,
      description: "This is a test event sent to verify your notification setup is working correctly. No action required.",
      action:      null,
      badge:       "info",
    },
  };

  const info    = eventInfo[event] || {
    subject:     `AuthOnce event: ${event}`,
    description: "A protocol event occurred on your AuthOnce account.",
    action:      null,
    badge:       "info",
  };

  const badgeColors = {
    success: { bg: "rgba(52,211,153,0.12)", color: "#059669" },
    warning: { bg: "rgba(251,191,36,0.12)", color: "#d97706" },
    danger:  { bg: "rgba(248,113,113,0.12)", color: "#dc2626" },
    info:    { bg: "rgba(59,130,246,0.12)", color: "#2563eb" },
  };
  const badge = badgeColors[info.badge] || badgeColors.info;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AuthOnce <noreply@authonce.io>", replyTo: "support@authonce.io",
        to:   [merchantEmail],
        subject: info.subject,
        html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <div style="background:#080c14;padding:20px 28px;">
    <span style="font-size:20px;font-weight:700;color:#ffffff;">Auth<span style="color:#34d399;">Once</span></span>
    <span style="font-size:11px;color:#475569;margin-left:12px;text-transform:uppercase;letter-spacing:0.06em;">Merchant Notification</span>
  </div>
  <div style="padding:28px;">
    <div style="display:inline-block;padding:4px 12px;border-radius:99px;background:${badge.bg};color:${badge.color};font-size:12px;font-weight:600;margin-bottom:16px;font-family:monospace;">${event}</div>
    <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#0f172a;">${info.subject}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">${info.description}</p>
    ${info.action ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#92400e;"><strong>What to do:</strong> ${info.action}</p>
    </div>` : ""}
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Technical details</div>
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;"><strong>Merchant:</strong> ${merchantAddress}</p>
      <p style="margin:0 0 8px;font-size:12px;color:#64748b;"><strong>Event time:</strong> ${new Date().toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC</p>
      <pre style="margin:8px 0 0;font-size:11px;color:#334155;background:#f1f5f9;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all;overflow:auto;">${JSON.stringify(data, null, 2)}</pre>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:0;">You are receiving this email because no webhook URL is configured for your account. <a href="https://authonce.io" style="color:#34d399;text-decoration:none;">Set up webhooks →</a></p>
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">AuthOnce Protocol · <a href="https://authonce.io" style="color:#64748b;text-decoration:none;">authonce.io</a> · <a href="mailto:support@authonce.io" style="color:#64748b;text-decoration:none;">support@authonce.io</a></p>
    <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;">This is an automated message. For help, contact <a href="mailto:support@authonce.io" style="color:#64748b;">support@authonce.io</a></p>
    <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;">© 2026 AuthOnce · BUSL-1.1 · Base Network</p>
  </div>
</div>
</body></html>`,
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
