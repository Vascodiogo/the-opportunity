// scripts/resend-domains.js
// =============================================================================
//  AuthOnce — Merchant Custom Sender Domain Management
//
//  Allows Business+ tier merchants to send emails from their own domain
//  e.g. noreply@fitclub.com instead of notifications@authonce.io
//
//  Flow:
//    1. Merchant submits their domain via dashboard
//    2. AuthOnce calls Resend API to register the domain
//    3. Resend returns DNS records (SPF + DKIM CNAMEs)
//    4. AuthOnce stores records and shows them to merchant
//    5. Merchant adds DNS records at their registrar
//    6. Merchant clicks "Verify" in dashboard
//    7. AuthOnce calls Resend verify endpoint
//    8. Once verified — emails send from merchant's domain
//
//  Tier requirements:
//    Starter:  notifications@authonce.io (AuthOnce branding)
//    Growth:   notifications@authonce.io (merchant branding in email content)
//    Business: noreply@{merchant_domain} (full custom sender domain)
//
//  DB table: merchant_email_domains
//    merchant_address  TEXT PRIMARY KEY
//    domain            TEXT NOT NULL
//    resend_domain_id  TEXT NOT NULL
//    status            TEXT  -- not_started | pending | verified | failed
//    dns_records       JSONB -- SPF + DKIM records from Resend
//    sender_email      TEXT  -- e.g. noreply@fitclub.com
//    created_at        TIMESTAMPTZ
//    verified_at       TIMESTAMPTZ
// =============================================================================

require("dotenv").config();
const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ─── Schema init ─────────────────────────────────────────────────────────────

async function initDomainSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS merchant_email_domains (
      merchant_address  TEXT PRIMARY KEY,
      domain            TEXT NOT NULL,
      resend_domain_id  TEXT,
      status            TEXT NOT NULL DEFAULT 'not_started',
      dns_records       JSONB,
      sender_email      TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      verified_at       TIMESTAMPTZ
    )
  `);
  console.log("[RESEND-DOMAINS] Schema ready");
}

// ─── Register a new domain for a merchant ────────────────────────────────────

async function registerMerchantDomain(db, merchantAddress, domain, senderLocalPart = "noreply") {
  if (!resend) throw new Error("RESEND_API_KEY not configured");

  // Validate domain format
  if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?\.[a-z]{2,}$/.test(domain.toLowerCase())) {
    throw new Error("Invalid domain format");
  }

  const senderEmail = `${senderLocalPart}@${domain}`;

  // Check if already registered
  const existing = await db.query(
    "SELECT * FROM merchant_email_domains WHERE merchant_address = $1",
    [merchantAddress.toLowerCase()]
  );

  // If verified domain exists, don't re-register
  if (existing.rows[0]?.status === "verified") {
    throw new Error("Domain already verified. Delete it first to register a new one.");
  }

  // Call Resend API to create domain
  const { data, error } = await resend.domains.create({ name: domain });
  if (error) throw new Error(`Resend domain creation failed: ${error.message}`);

  const dnsRecords = data.records || [];
  const resendDomainId = data.id;

  // Upsert into DB
  await db.query(`
    INSERT INTO merchant_email_domains
      (merchant_address, domain, resend_domain_id, status, dns_records, sender_email, created_at)
    VALUES ($1, $2, $3, 'not_started', $4, $5, NOW())
    ON CONFLICT (merchant_address) DO UPDATE SET
      domain           = EXCLUDED.domain,
      resend_domain_id = EXCLUDED.resend_domain_id,
      status           = 'not_started',
      dns_records      = EXCLUDED.dns_records,
      sender_email     = EXCLUDED.sender_email,
      created_at       = NOW(),
      verified_at      = NULL
  `, [
    merchantAddress.toLowerCase(),
    domain.toLowerCase(),
    resendDomainId,
    JSON.stringify(dnsRecords),
    senderEmail,
  ]);

  console.log(`[RESEND-DOMAINS] Registered domain ${domain} for ${merchantAddress}`);

  return {
    domain,
    sender_email: senderEmail,
    resend_domain_id: resendDomainId,
    status: "not_started",
    dns_records: dnsRecords,
    instructions: buildDnsInstructions(domain, dnsRecords),
  };
}

// ─── Verify a domain ──────────────────────────────────────────────────────────

async function verifyMerchantDomain(db, merchantAddress) {
  if (!resend) throw new Error("RESEND_API_KEY not configured");

  const result = await db.query(
    "SELECT * FROM merchant_email_domains WHERE merchant_address = $1",
    [merchantAddress.toLowerCase()]
  );

  const row = result.rows[0];
  if (!row) throw new Error("No domain registered for this merchant");
  if (row.status === "verified") return { status: "verified", domain: row.domain };

  // Call Resend verify endpoint
  const { data, error } = await resend.domains.verify(row.resend_domain_id);
  if (error) throw new Error(`Resend verification failed: ${error.message}`);

  // Check verification status from Resend
  const { data: domainData } = await resend.domains.get(row.resend_domain_id);
  const isVerified = domainData?.status === "verified";

  await db.query(`
    UPDATE merchant_email_domains
    SET status = $1, verified_at = $2
    WHERE merchant_address = $3
  `, [
    isVerified ? "verified" : "pending",
    isVerified ? new Date() : null,
    merchantAddress.toLowerCase(),
  ]);

  console.log(`[RESEND-DOMAINS] Domain ${row.domain} status: ${isVerified ? "verified ✅" : "pending ⏳"}`);

  return {
    status: isVerified ? "verified" : "pending",
    domain: row.domain,
    sender_email: row.sender_email,
    message: isVerified
      ? "Domain verified. Emails will now send from your domain."
      : "DNS records not yet detected. Propagation can take up to 24 hours. Try again later.",
  };
}

// ─── Get domain status ────────────────────────────────────────────────────────

async function getMerchantDomainStatus(db, merchantAddress) {
  const result = await db.query(
    "SELECT * FROM merchant_email_domains WHERE merchant_address = $1",
    [merchantAddress.toLowerCase()]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    domain:          row.domain,
    sender_email:    row.sender_email,
    status:          row.status,
    dns_records:     row.dns_records,
    instructions:    buildDnsInstructions(row.domain, row.dns_records),
    created_at:      row.created_at,
    verified_at:     row.verified_at,
  };
}

// ─── Delete a domain ──────────────────────────────────────────────────────────

async function deleteMerchantDomain(db, merchantAddress) {
  if (!resend) throw new Error("RESEND_API_KEY not configured");

  const result = await db.query(
    "SELECT * FROM merchant_email_domains WHERE merchant_address = $1",
    [merchantAddress.toLowerCase()]
  );

  const row = result.rows[0];
  if (!row) throw new Error("No domain registered for this merchant");

  // Delete from Resend
  if (row.resend_domain_id) {
    const { error } = await resend.domains.remove(row.resend_domain_id);
    if (error) console.warn(`[RESEND-DOMAINS] Resend delete warning: ${error.message}`);
  }

  await db.query(
    "DELETE FROM merchant_email_domains WHERE merchant_address = $1",
    [merchantAddress.toLowerCase()]
  );

  console.log(`[RESEND-DOMAINS] Deleted domain ${row.domain} for ${merchantAddress}`);
  return { success: true, domain: row.domain };
}

// ─── Get sender for a merchant ────────────────────────────────────────────────
// Used by notifier.js to determine the correct "from" address per merchant

async function getMerchantSender(db, merchantAddress) {
  const result = await db.query(
    "SELECT sender_email, status FROM merchant_email_domains WHERE merchant_address = $1",
    [merchantAddress.toLowerCase()]
  );

  const row = result.rows[0];
  if (row?.status === "verified" && row.sender_email) {
    return {
      from: row.sender_email,
      fromHeader: `${row.sender_email}`, // custom domain — no AuthOnce branding in from field
    };
  }

  // Default AuthOnce sender
  return {
    from: "notifications@authonce.io",
    fromHeader: "AuthOnce <notifications@authonce.io>",
  };
}

// ─── Build human-readable DNS instructions ────────────────────────────────────

function buildDnsInstructions(domain, records) {
  if (!records || records.length === 0) return [];

  return records.map(r => ({
    type:    r.type,
    name:    `${r.name}.${domain}`,
    value:   r.value,
    ttl:     r.ttl || "Auto",
    purpose: r.record === "DKIM" ? "Email authentication (DKIM)" : "Email delivery (SPF)",
    status:  r.status,
  }));
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  initDomainSchema,
  registerMerchantDomain,
  verifyMerchantDomain,
  getMerchantDomainStatus,
  deleteMerchantDomain,
  getMerchantSender,
};
