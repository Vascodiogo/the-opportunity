// scripts/email-templates.js
// =============================================================================
//  AuthOnce — Branded Email Templates
//
//  All transactional emails use emailWrapper() for consistent branding.
//  Compatible with Resend, Gmail, Outlook, Apple Mail.
//  Dark-mode safe via media query.
//  No external images — logo is inline SVG text.
//
//  Usage:
//    const { html, text } = templates.paymentSuccess({ ... })
//    await sendEmail({ to, subject: templates.subjects.paymentSuccess(...), html, text })
// =============================================================================

// ─── Shared wrapper ───────────────────────────────────────────────────────────

// ─── Whitelabel helper ────────────────────────────────────────────────────────
// tier: "starter" | "growth" | "business"
// brandName: merchant business name (Growth+)
// brandColor: hex color e.g. "#34d399" (Growth+)
// senderDomain: verified custom domain e.g. "fitclub.com" (Business+)
//   When set, emails are sent from noreply@{senderDomain}
//   The "from" field in sendEmail() must be updated accordingly.

function emailWrapper({ preheader, body, footerNote = "", tier = "starter", brandName = null, brandColor = "#34d399" }) {
  const isGrowthPlus    = tier === "growth" || tier === "business" || tier === "enterprise";
  const isBusinessPlus  = tier === "business" || tier === "enterprise";

  // Header: whitelabel shows merchant name in their brand color
  // Standard: AuthOnce logo
  const headerContent = isGrowthPlus && brandName
    ? `<div class="logo-text" style="color:#ffffff;">${brandName}</div>
       <div class="logo-tag" style="color:rgba(255,255,255,0.4);">Subscription payments</div>`
    : `<div class="logo-text">Auth<span class="logo-accent" style="color:${brandColor};">Once</span></div>
       <div class="logo-tag">Non-custodial subscription protocol</div>`;

  // Footer: business+ can hide AuthOnce branding
  const footerBranding = isBusinessPlus && brandName
    ? `<p>${brandName}</p>`
    : isGrowthPlus && brandName
    ? `<p>${brandName} · <span style="opacity:0.6;">Powered by <a href="https://authonce.io" style="color:#64748b;">AuthOnce</a></span></p>`
    : `<p><a href="https://authonce.io">authonce.io</a> &nbsp;·&nbsp; <a href="mailto:support@authonce.io">support@authonce.io</a></p>
       <p style="margin-top:8px;">© 2026 AuthOnce Protocol · BUSL-1.1 · Base Network</p>`;

  // Header background: brand color for whitelabel, dark for standard
  const headerBg = isGrowthPlus && brandName ? brandColor : "#080c14";
  // Text color on header depends on brand color brightness — default dark text on light brand
  const headerTextColor = isGrowthPlus && brandName ? "#ffffff" : "#ffffff";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light dark"/>
  <meta name="supported-color-schemes" content="light dark"/>
  <title>${brandName || "AuthOnce"}</title>
  <style>
    body { margin: 0; padding: 0; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { background: #f1f5f9; padding: 40px 16px; }
    .card { background: #ffffff; border-radius: 12px; max-width: 560px; margin: 0 auto; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header { background: #080c14; padding: 24px 32px; text-align: center; }
    .logo-text { font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; }
    .logo-accent { color: #34d399; }
    .logo-tag { font-size: 11px; color: #475569; margin-top: 4px; letter-spacing: 0.06em; text-transform: uppercase; }
    .body { padding: 32px; color: #0f172a; font-size: 15px; line-height: 1.6; }
    .greeting { font-size: 15px; color: #475569; margin: 0 0 20px; }
    .amount-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .amount-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 4px; }
    .amount-value { font-size: 28px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em; margin: 0; font-family: 'SF Mono', 'Fira Code', monospace; }
    .amount-sub { font-size: 13px; color: #64748b; margin: 4px 0 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .detail-label { color: #64748b; }
    .detail-value { color: #0f172a; font-weight: 500; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; }
    .badge-success { background: rgba(52,211,153,0.12); color: #059669; }
    .badge-warning { background: rgba(251,191,36,0.12); color: #d97706; }
    .badge-danger  { background: rgba(248,113,113,0.12); color: #dc2626; }
    .badge-info    { background: rgba(59,130,246,0.12);  color: #2563eb; }
    .cta-button { display: block; text-align: center; background: linear-gradient(135deg, #34d399, #3b82f6); color: #080c14; font-weight: 700; font-size: 14px; padding: 14px 24px; border-radius: 8px; text-decoration: none; margin: 24px 0 0; letter-spacing: -0.01em; }
    .cta-button-outline { display: block; text-align: center; background: none; color: #34d399; font-weight: 600; font-size: 13px; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin: 10px 0 0; border: 1px solid rgba(52,211,153,0.3); }
    .divider { height: 1px; background: #f1f5f9; margin: 24px 0; }
    .notice { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #92400e; margin: 20px 0; }
    .notice-danger { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center; }
    .footer p { font-size: 11px; color: #94a3b8; margin: 4px 0; }
    .footer a { color: #64748b; text-decoration: none; }
    .footer a:hover { color: #34d399; }
    @media (prefers-color-scheme: dark) {
      body, .wrapper { background: #0f172a !important; }
      .card { background: #1e293b !important; box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important; }
      .body { color: #f1f5f9 !important; }
      .greeting { color: #94a3b8 !important; }
      .amount-box { background: #0f172a !important; border-color: #334155 !important; }
      .amount-value { color: #f1f5f9 !important; }
      .amount-sub { color: #94a3b8 !important; }
      .detail-row { border-color: #1e293b !important; }
      .detail-label { color: #94a3b8 !important; }
      .detail-value { color: #f1f5f9 !important; }
      .divider { background: #334155 !important; }
      .footer { background: #0f172a !important; border-color: #334155 !important; }
      .footer p { color: #475569 !important; }
    }
  </style>
</head>
<body>
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;color:#f8fafc;">${preheader}</div>
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header" style="background:${headerBg};">
        ${headerContent}
      </div>
      <!-- Body -->
      <div class="body">
        ${body}
      </div>
      <!-- Footer -->
      <div class="footer">
        ${footerNote ? `<p>${footerNote}</p>` : ""}
        <p><a href="https://authonce.io/my-subscriptions">Manage subscriptions</a></p>
        ${footerBranding}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Subject lines ────────────────────────────────────────────────────────────

const subjects = {
  // Subscriber subjects
  subscriptionConfirmed:   (merchantName) => `Your ${merchantName} subscription is active`,
  paymentReceipt:          (amount, merchantName) => `Payment confirmed — $${amount} USDC to ${merchantName}`,
  paymentReminder:         (amount, daysUntil) => `Payment reminder: $${amount} USDC due ${daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}`,
  paymentFailedFunds:      (merchantName) => `Action required: payment failed for ${merchantName}`,
  paymentFailedAllowance:  (merchantName) => `Action required: approval expired for ${merchantName}`,
  subscriptionCancelled:   (merchantName) => `Subscription cancelled — ${merchantName}`,
  subscriptionExpired:     (merchantName) => `Subscription expired — ${merchantName}`,
  subscriptionResumed:     (merchantName) => `Subscription resumed — ${merchantName}`,
  subscriptionPaused:      (merchantName) => `Subscription paused — ${merchantName}`,
  priceChangeNotice:       (merchantName, date) => `Your ${merchantName} subscription is changing on ${date}`,

  // Merchant subjects
  merchantNewSubscriber:   (amount, interval) => `New subscriber — $${amount} USDC/${interval}`,
  merchantPaymentReceived: (amount) => `Payment received — $${amount} USDC`,
  merchantPaymentFailed:   () => `Payment failed — subscriber needs to act`,
  merchantCancellation:    () => `A subscriber has cancelled`,
  merchantExpired:         () => `Subscription expired — grace period ended`,
  merchantResumed:         () => `Subscription resumed`,
};

// ─── Templates ────────────────────────────────────────────────────────────────

const templates = {

  // ── Subscriber: subscription confirmed ──────────────────────────────────────
  subscriptionConfirmed({ name, merchantName, amountUsdc, interval, trialDays, introAmount, introPulls }) {
    const hasTrial = trialDays > 0;
    const hasIntro = introAmount && introPulls > 0;

    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your subscription to <strong>${merchantName}</strong> is now active.</p>

      <div class="amount-box">
        <p class="amount-label">Subscription amount</p>
        <p class="amount-value">$${amountUsdc} USDC</p>
        <p class="amount-sub">Billed ${interval}</p>
      </div>

      ${hasTrial ? `<div class="notice"><strong>🎁 Free trial active</strong> — Your first payment is due in ${trialDays} days. You won't be charged until then.</div>` : ""}
      ${hasIntro && !hasTrial ? `<div class="notice"><strong>🎁 Intro pricing</strong> — $${introAmount} USDC for the first ${introPulls} ${interval === "monthly" ? "months" : "payments"}, then $${amountUsdc} USDC.</div>` : ""}

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Merchant</span><span class="detail-value">${merchantName}</span></div>
        <div class="detail-row"><span class="detail-label">Billing interval</span><span class="detail-value">${interval}</span></div>
        <div class="detail-row"><span class="detail-label">Grace period</span><span class="detail-value">7 days on failed payment</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-success">Active</span></div>
      </div>

      <a href="https://authonce.io/my-subscriptions" class="cta-button">Manage your subscription →</a>

      <div class="divider"></div>
      <p style="font-size:13px;color:#64748b;">You can cancel anytime from your subscription portal. AuthOnce never holds your funds — your wallet stays in your control.</p>
    `;

    const text = `Your ${merchantName} subscription is active. Amount: $${amountUsdc} USDC/${interval}. Manage at authonce.io/my-subscriptions`;
    return { html: emailWrapper({ preheader: `Your ${merchantName} subscription is now active`, body }), text };
  },

  // ── Subscriber: payment receipt ──────────────────────────────────────────────
  paymentReceipt({ name, merchantName, amountUsdc, date, txHash, basescanUrl }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your payment to <strong>${merchantName}</strong> was processed successfully.</p>

      <div class="amount-box">
        <p class="amount-label">Amount paid</p>
        <p class="amount-value">$${amountUsdc} USDC</p>
        <p class="amount-sub">${date}</p>
      </div>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Merchant</span><span class="detail-value">${merchantName}</span></div>
        <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${date}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-success">Confirmed</span></div>
      </div>

      ${txHash ? `<a href="${basescanUrl}/tx/${txHash}" class="cta-button-outline">View transaction on Basescan →</a>` : ""}
      <a href="https://authonce.io/my-subscriptions" class="cta-button">View subscription →</a>
    `;

    const text = `Payment of $${amountUsdc} USDC to ${merchantName} confirmed on ${date}. ${txHash ? `Tx: ${txHash}` : ""}`;
    return { html: emailWrapper({ preheader: `$${amountUsdc} USDC payment confirmed`, body }), text };
  },

  // ── Subscriber: 3-day payment reminder ───────────────────────────────────────
  paymentReminder({ name, merchantName, amountUsdc, nextDate, daysUntil }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your next payment to <strong>${merchantName}</strong> is coming up ${daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}.</p>

      <div class="amount-box">
        <p class="amount-label">Payment due</p>
        <p class="amount-value">$${amountUsdc} USDC</p>
        <p class="amount-sub">${nextDate}</p>
      </div>

      <div class="notice">
        <strong>Make sure your wallet is funded.</strong> If your wallet has less than $${amountUsdc} USDC on ${nextDate}, your subscription will enter a grace period.
      </div>

      <a href="https://authonce.io/my-subscriptions" class="cta-button">Manage your subscription →</a>
    `;

    const text = `Reminder: $${amountUsdc} USDC payment to ${merchantName} due on ${nextDate}. Make sure your wallet is funded.`;
    return { html: emailWrapper({ preheader: `Payment of $${amountUsdc} USDC due ${daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`}`, body }), text };
  },

  // ── Subscriber: payment failed — insufficient funds ──────────────────────────
  paymentFailedFunds({ name, merchantName, requiredUsdc, availableUsdc, graceDate }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your payment to <strong>${merchantName}</strong> could not be processed.</p>

      <div class="amount-box">
        <p class="amount-label">Payment required</p>
        <p class="amount-value">$${requiredUsdc} USDC</p>
        <p class="amount-sub">Your wallet balance: $${availableUsdc} USDC</p>
      </div>

      <div class="notice notice-danger">
        <strong>⚠️ Action required by ${graceDate}.</strong> Top up your wallet with at least $${requiredUsdc} USDC before ${graceDate} to keep your subscription active. After that date, your subscription will expire.
      </div>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Merchant</span><span class="detail-value">${merchantName}</span></div>
        <div class="detail-row"><span class="detail-label">Amount needed</span><span class="detail-value">$${requiredUsdc} USDC</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Grace period ends</span><span class="detail-value">${graceDate}</span></div>
      </div>

      <a href="https://authonce.io/my-subscriptions" class="cta-button">Top up and restore subscription →</a>
    `;

    const text = `Payment of $${requiredUsdc} USDC to ${merchantName} failed. Your balance: $${availableUsdc} USDC. Top up before ${graceDate} to keep your subscription.`;
    return { html: emailWrapper({ preheader: `Action required: payment failed for ${merchantName}`, body }), text };
  },

  // ── Subscriber: payment failed — insufficient allowance ──────────────────────
  paymentFailedAllowance({ name, merchantName }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your payment to <strong>${merchantName}</strong> could not be processed because your USDC approval has expired or was revoked.</p>

      <div class="notice notice-danger">
        <strong>⚠️ Re-approval required.</strong> Visit your subscription portal to re-approve USDC spending for this subscription.
      </div>

      <a href="https://authonce.io/my-subscriptions" class="cta-button">Re-approve subscription →</a>

      <div class="divider"></div>
      <p style="font-size:13px;color:#64748b;">This happens when a wallet's USDC approval is revoked or expires. Re-approving takes less than a minute.</p>
    `;

    const text = `Your USDC approval for ${merchantName} has expired. Re-approve at authonce.io/my-subscriptions.`;
    return { html: emailWrapper({ preheader: `Action required: re-approval needed for ${merchantName}`, body }), text };
  },

  // ── Subscriber: subscription cancelled ──────────────────────────────────────
  subscriptionCancelled({ name, merchantName }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your subscription to <strong>${merchantName}</strong> has been cancelled.</p>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Merchant</span><span class="detail-value">${merchantName}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-danger">Cancelled</span></div>
      </div>

      <p style="font-size:14px;color:#64748b;">No further payments will be collected. Your funds remain in your wallet.</p>

      <a href="https://authonce.io/my-subscriptions" class="cta-button-outline">View subscription history →</a>
    `;

    const text = `Your ${merchantName} subscription has been cancelled. No further payments will be collected.`;
    return { html: emailWrapper({ preheader: `${merchantName} subscription cancelled`, body }), text };
  },

  // ── Subscriber: subscription expired ─────────────────────────────────────────
  subscriptionExpired({ name, merchantName, expiredDate }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your subscription to <strong>${merchantName}</strong> has expired because the grace period ended without a successful payment.</p>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Merchant</span><span class="detail-value">${merchantName}</span></div>
        <div class="detail-row"><span class="detail-label">Expired on</span><span class="detail-value">${expiredDate}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-danger">Expired</span></div>
      </div>

      <p style="font-size:14px;color:#64748b;">Your funds were never collected. To resubscribe, visit the merchant's pay link.</p>

      <a href="https://authonce.io/my-subscriptions" class="cta-button-outline">View subscription history →</a>
    `;

    const text = `Your ${merchantName} subscription expired on ${expiredDate}. No funds were collected.`;
    return { html: emailWrapper({ preheader: `${merchantName} subscription expired`, body }), text };
  },

  // ── Subscriber: subscription resumed ─────────────────────────────────────────
  subscriptionResumed({ name, merchantName, amountUsdc, interval }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your subscription to <strong>${merchantName}</strong> has been resumed successfully.</p>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Merchant</span><span class="detail-value">${merchantName}</span></div>
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">$${amountUsdc} USDC/${interval}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-success">Active</span></div>
      </div>

      <a href="https://authonce.io/my-subscriptions" class="cta-button">View subscription →</a>
    `;

    const text = `Your ${merchantName} subscription has been resumed. $${amountUsdc} USDC/${interval}.`;
    return { html: emailWrapper({ preheader: `${merchantName} subscription resumed`, body }), text };
  },

  // ── Subscriber: subscription paused (manual) ──────────────────────────────────
  subscriptionPaused({ name, merchantName }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your subscription to <strong>${merchantName}</strong> has been paused.</p>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Merchant</span><span class="detail-value">${merchantName}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-warning">Paused</span></div>
      </div>

      <p style="font-size:14px;color:#64748b;">No payments will be collected while your subscription is paused. You can resume or cancel from your portal.</p>

      <a href="https://authonce.io/my-subscriptions" class="cta-button">Manage subscription →</a>
    `;

    const text = `Your ${merchantName} subscription has been paused. Manage at authonce.io/my-subscriptions.`;
    return { html: emailWrapper({ preheader: `${merchantName} subscription paused`, body }), text };
  },

  // ── Subscriber: price change notice ──────────────────────────────────────────
  priceChangeNotice({ name, merchantName, amountUsdc, expiryDate, daysUntil }) {
    const body = `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>Your subscription to <strong>${merchantName}</strong> will be changing on <strong>${expiryDate}</strong>.</p>

      <div class="amount-box">
        <p class="amount-label">Current price</p>
        <p class="amount-value">$${amountUsdc} USDC</p>
        <p class="amount-sub">Changes on ${expiryDate} (${daysUntil} days from now)</p>
      </div>

      <div class="notice">
        <strong>You have ${daysUntil} days to decide.</strong> If you'd like to cancel before the price changes, you can do so from your subscription portal at no cost.
      </div>

      <a href="https://authonce.io/my-subscriptions" class="cta-button">Review and manage subscription →</a>
    `;

    const text = `Your ${merchantName} subscription price will change on ${expiryDate}. Current price: $${amountUsdc} USDC. Cancel at authonce.io/my-subscriptions if needed.`;
    return { html: emailWrapper({ preheader: `${merchantName} subscription changing on ${expiryDate}`, body }), text };
  },

  // ── Merchant: new subscriber ──────────────────────────────────────────────────
  merchantNewSubscriber({ amountUsdc, interval, subscriptionId, vaultAddress, txHash, basescanUrl }) {
    const body = `
      <p style="margin:0 0 20px;color:#0f172a;">A new subscriber has joined.</p>

      <div class="amount-box">
        <p class="amount-label">Subscription value</p>
        <p class="amount-value">$${amountUsdc} USDC</p>
        <p class="amount-sub">Billed ${interval} · 99.5% to you after protocol fee</p>
      </div>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Subscription ID</span><span class="detail-value">#${subscriptionId}</span></div>
        <div class="detail-row"><span class="detail-label">Interval</span><span class="detail-value">${interval}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-success">Active</span></div>
      </div>

      ${txHash ? `<a href="${basescanUrl}/tx/${txHash}" class="cta-button-outline">View on Basescan →</a>` : ""}
    `;

    const text = `New subscriber: $${amountUsdc} USDC/${interval}. Subscription #${subscriptionId}.`;
    return { html: emailWrapper({ preheader: `New subscriber — $${amountUsdc} USDC/${interval}`, body }), text };
  },

  // ── Merchant: payment received ────────────────────────────────────────────────
  merchantPaymentReceived({ amountUsdc, merchantReceivedUsdc, merchantReceivedEur, date, subscriptionId, txHash, basescanUrl }) {
    const eurStr = merchantReceivedEur ? ` (≈ €${merchantReceivedEur})` : "";
    const body = `
      <p style="margin:0 0 20px;color:#0f172a;">A subscription payment has been collected.</p>

      <div class="amount-box">
        <p class="amount-label">You received</p>
        <p class="amount-value">$${merchantReceivedUsdc} USDC${eurStr}</p>
        <p class="amount-sub">${date}</p>
      </div>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Subscription ID</span><span class="detail-value">#${subscriptionId}</span></div>
        <div class="detail-row"><span class="detail-label">Total collected</span><span class="detail-value">$${amountUsdc} USDC</span></div>
        <div class="detail-row"><span class="detail-label">Protocol fee (0.5%)</span><span class="detail-value">$${(parseFloat(amountUsdc) - parseFloat(merchantReceivedUsdc)).toFixed(4)} USDC</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-success">Confirmed</span></div>
      </div>

      ${txHash ? `<a href="${basescanUrl}/tx/${txHash}" class="cta-button-outline">View transaction on Basescan →</a>` : ""}
    `;

    const text = `Payment received: $${merchantReceivedUsdc} USDC${eurStr} for subscription #${subscriptionId}.`;
    return { html: emailWrapper({ preheader: `Payment received — $${merchantReceivedUsdc} USDC`, body }), text };
  },

  // ── Merchant: payment failed ──────────────────────────────────────────────────
  merchantPaymentFailed({ requiredUsdc, graceDate, reason, subscriptionId }) {
    const reasonText = reason === "insufficient_allowance"
      ? "The subscriber's USDC approval has expired."
      : "The subscriber's wallet had insufficient USDC.";

    const body = `
      <p style="margin:0 0 20px;color:#0f172a;">A subscription payment could not be collected.</p>

      <div class="notice notice-danger">
        <strong>⚠️ ${reasonText}</strong> The subscription has entered a grace period. The subscriber has been notified and asked to act.
      </div>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Subscription ID</span><span class="detail-value">#${subscriptionId}</span></div>
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">$${requiredUsdc} USDC</span></div>
        <div class="detail-row"><span class="detail-label">Grace period ends</span><span class="detail-value">${graceDate}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-warning">Grace period</span></div>
      </div>

      <p style="font-size:13px;color:#64748b;">The keeper bot will retry automatically once the subscriber funds their wallet. If they don't act before ${graceDate}, the subscription will expire.</p>
    `;

    const text = `Payment failed for subscription #${subscriptionId}. $${requiredUsdc} USDC. Grace period ends ${graceDate}. Subscriber has been notified.`;
    return { html: emailWrapper({ preheader: `Payment failed — subscriber needs to act`, body }), text };
  },

  // ── Merchant: cancellation ────────────────────────────────────────────────────
  merchantCancellation({ subscriptionId, cancelledBy }) {
    const body = `
      <p style="margin:0 0 20px;color:#0f172a;">A subscriber has cancelled their subscription.</p>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Subscription ID</span><span class="detail-value">#${subscriptionId}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-danger">Cancelled</span></div>
      </div>

      <p style="font-size:13px;color:#64748b;">No further payments will be collected for this subscription.</p>
    `;

    const text = `Subscription #${subscriptionId} has been cancelled. No further payments will be collected.`;
    return { html: emailWrapper({ preheader: `Subscription #${subscriptionId} cancelled`, body }), text };
  },

  // ── Merchant: subscription expired ───────────────────────────────────────────
  merchantExpired({ subscriptionId, expiredDate }) {
    const body = `
      <p style="margin:0 0 20px;color:#0f172a;">A subscription has expired after the grace period ended.</p>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Subscription ID</span><span class="detail-value">#${subscriptionId}</span></div>
        <div class="detail-row"><span class="detail-label">Expired on</span><span class="detail-value">${expiredDate}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-danger">Expired</span></div>
      </div>

      <p style="font-size:13px;color:#64748b;">No further payments will be collected. The subscriber was notified.</p>
    `;

    const text = `Subscription #${subscriptionId} expired on ${expiredDate}. Grace period ended without payment.`;
    return { html: emailWrapper({ preheader: `Subscription #${subscriptionId} expired`, body }), text };
  },

  // ── Merchant: subscription resumed ───────────────────────────────────────────
  merchantResumed({ subscriptionId, amountUsdc, interval }) {
    const body = `
      <p style="margin:0 0 20px;color:#0f172a;">A subscriber has resumed their subscription.</p>

      <div style="margin: 20px 0;">
        <div class="detail-row"><span class="detail-label">Subscription ID</span><span class="detail-value">#${subscriptionId}</span></div>
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value">$${amountUsdc} USDC/${interval}</span></div>
        <div class="detail-row" style="border:none;"><span class="detail-label">Status</span><span class="status-badge badge-success">Active</span></div>
      </div>
    `;

    const text = `Subscription #${subscriptionId} resumed. $${amountUsdc} USDC/${interval}.`;
    return { html: emailWrapper({ preheader: `Subscription #${subscriptionId} resumed`, body }), text };
  },

  subjects,
};

module.exports = { templates, emailWrapper };
