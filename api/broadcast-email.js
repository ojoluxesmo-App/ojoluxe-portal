// api/broadcast-email.js
// Admin-only endpoint: send a composed email to a selected set of trade-show
// leads and record full send history in email_broadcasts /
// email_broadcast_recipients (see Step A migration
// 20260905130705_add_email_broadcast_tables).
//
// Gated by the same shared x-admin-token pattern already used in
// api/leads.js -- no new auth mechanism. Reads leads.id/full_name/email
// (read-only, by id) to resolve who to send to; never inserts, updates, or
// deletes anything in leads, lead_events, events, clients, jobs,
// commissions, or attribution data, and never touches the existing
// thank-you-email flow in api/trade-show-lead.js.
//
// POST only for now -- broadcast history GET/list is not implemented in
// this step; it isn't needed structurally until a UI reads it back.
// Body: { lead_ids: string[], subject: string, body: string, link?: string }

import { timingSafeEqual } from "crypto";

const SUPABASE_URL = "https://aadlqagpxwshpdccxwto.supabase.co";

const MAX_RECIPIENTS = 500;
const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 20000;
const MAX_LINK_LEN = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Copied from api/leads.js's isAuthorized() rather than imported, so this
// new file has no runtime dependency on an existing production file.
function isAuthorized(req) {
  const token = req.headers["x-admin-token"];
  const expected = process.env.ADMIN_API_TOKEN;
  if (!token || !expected) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sbHeaders(serviceKey, extra) {
  return { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}`, ...extra };
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Caps length and drops anything shaped like a leaked key/token, so a
// provider error string can never carry a secret or raw stack trace back to
// the client or into the stored history row.
function sanitizeErrorMessage(reason) {
  if (!reason) return "Send failed";
  let msg = String(reason).replace(/\b(sk|re|sb_secret)_[A-Za-z0-9_-]+\b/gi, "[redacted]");
  if (msg.length > 300) msg = msg.slice(0, 300) + "...";
  return msg;
}

// Same Resend integration / env vars as api/trade-show-lead.js's
// sendThankYouEmail() -- that file and its templates are untouched.
async function sendBroadcastEmail(to, subject, bodyText, link) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PARTNER_EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, reason: "email not configured" };

  const text = link ? `${bodyText}\n\n${link}` : bodyText;
  const htmlBody = escapeHtml(bodyText).replace(/\n/g, "<br>");
  const htmlLink = link
    ? `<p style="margin-top:20px;"><a href="${escapeHtml(link)}" style="color:#C9A84C;">${escapeHtml(link)}</a></p>`
    : "";
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1A1712;line-height:1.5;">` +
    `<div>${htmlBody}</div>${htmlLink}` +
    `<p style="margin-top:24px;font-size:11px;color:#6B6150;">OJO Luxe &middot; Premium Transportation Services</p>` +
    `</div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { sent: false, reason: data.message || `send failed (${r.status})` };
    return { sent: true, id: data.id || null };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY" });

  const headers = sbHeaders(serviceKey);
  const body = req.body || {};

  // ---- Validation --------------------------------------------------------
  const rawLeadIds = Array.isArray(body.lead_ids) ? body.lead_ids : null;
  if (!rawLeadIds || !rawLeadIds.length) return res.status(400).json({ error: "lead_ids must be a non-empty array" });

  const leadIds = [...new Set(rawLeadIds.filter(Boolean).map(String))];
  if (leadIds.length > MAX_RECIPIENTS) return res.status(400).json({ error: `lead_ids exceeds the maximum of ${MAX_RECIPIENTS} recipients per broadcast` });

  const malformed = leadIds.filter(id => !UUID_RE.test(id));
  if (malformed.length) return res.status(400).json({ error: "lead_ids contains malformed id(s)", invalid_ids: malformed });

  const subject = String(body.subject || "").trim();
  if (!subject) return res.status(400).json({ error: "subject is required" });
  if (subject.length > MAX_SUBJECT_LEN) return res.status(400).json({ error: `subject exceeds ${MAX_SUBJECT_LEN} characters` });

  const emailBody = String(body.body || "").trim();
  if (!emailBody) return res.status(400).json({ error: "body is required" });
  if (emailBody.length > MAX_BODY_LEN) return res.status(400).json({ error: `body exceeds ${MAX_BODY_LEN} characters` });

  let link = null;
  if (body.link !== undefined && body.link !== null && String(body.link).trim() !== "") {
    link = String(body.link).trim();
    if (link.length > MAX_LINK_LEN) return res.status(400).json({ error: `link exceeds ${MAX_LINK_LEN} characters` });
    if (!isValidHttpUrl(link)) return res.status(400).json({ error: "link must be a valid http:// or https:// URL" });
  }

  try {
    // ---- Recipient lookup (read-only against `leads`) ---------------------
    // Emails are never trusted from the browser -- only what's on file in
    // `leads` right now is used, and only id/full_name/email are read.
    const idsFilter = leadIds.map(id => encodeURIComponent(id)).join(",");
    const leadsUrl = `${SUPABASE_URL}/rest/v1/leads?select=id,full_name,email&id=in.(${idsFilter})`;
    const leadsRes = await fetch(leadsUrl, { headers });
    const foundLeads = await leadsRes.json();
    if (!leadsRes.ok) throw new Error(foundLeads.message || "Lead lookup failed");

    const validLeads = (Array.isArray(foundLeads) ? foundLeads : [])
      .filter(l => l.email && EMAIL_RE.test(String(l.email).trim()));

    if (!validLeads.length) return res.status(400).json({ error: "No matching leads with a valid email address" });

    // ---- 1. Create the broadcast header row --------------------------------
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/email_broadcasts`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
        subject,
        body: emailBody,
        link,
        sent_by: "admin",
        recipient_count: validLeads.length,
        success_count: 0,
        failure_count: 0,
      }),
    });
    const createdBroadcast = await createRes.json();
    if (!createRes.ok) throw new Error(createdBroadcast.message || "Failed to create broadcast record");
    const broadcast = createdBroadcast[0];

    // ---- 2. Create one pending recipient row per valid lead ---------------
    const pendingRows = validLeads.map(l => ({
      broadcast_id: broadcast.id,
      lead_id: l.id,
      email: l.email,
      status: "pending",
    }));
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/email_broadcast_recipients`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify(pendingRows),
    });
    const recipientRows = await insertRes.json();
    if (!insertRes.ok) throw new Error(recipientRows.message || "Failed to record recipient rows");

    // ---- 3. Send each email; one recipient's failure never stops the rest -
    let successCount = 0, failureCount = 0;
    const results = [];

    for (const row of recipientRows) {
      let outcome;
      try {
        outcome = await sendBroadcastEmail(row.email, subject, emailBody, link);
      } catch (err) {
        outcome = { sent: false, reason: err.message };
      }

      const patch = outcome.sent
        ? { status: "sent", provider_message_id: outcome.id || null, sent_at: new Date().toISOString() }
        : { status: "failed", error_message: sanitizeErrorMessage(outcome.reason) };

      if (outcome.sent) successCount++; else failureCount++;

      try {
        await fetch(`${SUPABASE_URL}/rest/v1/email_broadcast_recipients?id=eq.${row.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patch),
        });
      } catch {
        // The send already happened (or failed); a logging hiccup here
        // shouldn't fail the whole broadcast -- it's reflected in `results`
        // below regardless.
      }

      results.push({
        lead_id: row.lead_id,
        email: row.email,
        status: patch.status,
        ...(patch.status === "failed" ? { error_message: patch.error_message } : {}),
      });
    }

    // ---- 4. Finalize the header row ----------------------------------------
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/email_broadcasts?id=eq.${broadcast.id}`, {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({ success_count: successCount, failure_count: failureCount, completed_at: new Date().toISOString() }),
    });
    const updatedBroadcast = await updateRes.json().catch(() => null);
    if (!updateRes.ok) throw new Error((updatedBroadcast && updatedBroadcast.message) || "Failed to finalize broadcast record");

    return res.status(200).json({
      success: true,
      broadcast_id: broadcast.id,
      recipient_count: validLeads.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
    });
  } catch (err) {
    // Server-side detail stays in the Vercel function log; the client only
    // ever gets a generic message -- no provider payloads, no stack traces.
    console.error("broadcast-email error:", err);
    return res.status(500).json({ error: "Broadcast failed. Check server logs for details." });
  }
}
