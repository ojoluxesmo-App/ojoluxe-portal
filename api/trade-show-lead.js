// api/trade-show-lead.js
// Public endpoint for the future ojoluxe.com/partner registration page.
// Runs server-side on Vercel and holds the Supabase service_role key —
// the public page itself carries NO Supabase credentials of any kind.
// Insert-only: this endpoint can never read companies/clients/jobs/leads.

import { buildOjoLuxeEmailFooterHtml, buildOjoLuxeEmailFooterText } from "../lib/email-footer.js";

const SUPABASE_URL = "https://aadlqagpxwshpdccxwto.supabase.co";
const DUPLICATE_COOLDOWN_MS = 60 * 1000; // block rapid double-submits of the same email

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Branded HTML thank-you email. Design-only upgrade from the old plain-text
// send — registration/CRM/attribution logic elsewhere in this file is
// untouched. English only — no dual-language support.
const LOGO_URL = "https://ojoluxe-portal.vercel.app/assets/ojo-luxe-logo.png";
const SITE_URL = "https://ojoluxe.com";
const EN_SUBJECT = "Welcome to the OJO Luxe Partner Network";

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const COPY = {
  heading: "Thank You for Connecting With OJO Luxe",
  greeting: (name) => `Hi ${name},`,
  intro: "Thank you for registering with OJO Luxe.",
  eventLabel: "Registered through:",
  whatsNext: "What Happens Next",
  steps: [
    "Our team will review your registration.",
    "We may contact you to learn more about your business.",
    "Approved partners can refer clients to OJO Luxe.",
    "We look forward to building a long-term relationship together.",
  ],
  cta: "Visit OJO Luxe",
};

function buildThankYouHtml(name, eventName) {
  const c = COPY;
  const safeName = escapeHtml(name);
  const eventRow = eventName
    ? `<p style="margin:0 0 16px 0;"><strong style="color:#0C0B09;">${c.eventLabel}</strong> ${escapeHtml(eventName)}</p>`
    : "";
  const stepsHtml = c.steps.map((s, i) => `
        <tr>
          <td width="30" valign="top" style="padding:6px 10px 6px 0;">
            <span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;background:#C9A84C;color:#0C0B09;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;text-align:center;">${i + 1}</span>
          </td>
          <td valign="top" style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#333333;">${escapeHtml(s)}</td>
        </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${c.heading}</title>
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
  body{margin:0;padding:0;width:100%!important;background:#f4f4f4;}
  @media only screen and (max-width:600px){
    .ojo-container{width:100%!important;}
    .ojo-px{padding-left:24px!important;padding-right:24px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:32px 12px;">
<!--[if mso]>
<table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0"><tr><td>
<![endif]-->
<table role="presentation" class="ojo-container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;">
  <tr>
    <td align="center" style="background:#ffffff;padding:36px 24px 28px 24px;">
      <img src="${LOGO_URL}" width="200" alt="OJO Luxe" style="display:block;width:200px;max-width:60%;height:auto;">
    </td>
  </tr>
  <tr>
    <td class="ojo-px" style="padding:40px 40px 0 40px;background:#ffffff;">
      <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#0C0B09;text-align:center;">${c.heading}</h1>
    </td>
  </tr>
  <tr>
    <td class="ojo-px" style="padding:24px 40px 0 40px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#333333;">
      <p style="margin:0 0 16px 0;">${c.greeting(safeName)}</p>
      <p style="margin:0 0 16px 0;">${c.intro}</p>
      ${eventRow}
    </td>
  </tr>
  <tr>
    <td class="ojo-px" style="padding:8px 40px 0 40px;background:#ffffff;">
      <h2 style="margin:0 0 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#0C0B09;border-bottom:2px solid #C9A84C;padding-bottom:8px;">${c.whatsNext}</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${stepsHtml}
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" class="ojo-px" style="padding:32px 40px 40px 40px;background:#ffffff;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="border-radius:4px;background:#C9A84C;">
            <a href="${SITE_URL}" style="display:inline-block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;color:#0C0B09;text-decoration:none;">${c.cta.toUpperCase()}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td>
      ${buildOjoLuxeEmailFooterHtml()}
    </td>
  </tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

function buildThankYouText(name, eventName) {
  const c = COPY;
  const lines = [c.greeting(name), "", c.intro];
  if (eventName) lines.push(`${c.eventLabel} ${eventName}`);
  lines.push("", c.whatsNext.toUpperCase());
  c.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push("", `${c.cta}: ${SITE_URL}`, "", buildOjoLuxeEmailFooterText());
  return lines.join("\n");
}

function sbHeaders(serviceKey, extra) {
  return { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}`, ...extra };
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.PARTNER_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function sendThankYouEmail(to, name, eventName) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PARTNER_EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, reason: "email not configured" };

  const subject = EN_SUBJECT;
  const html = buildThankYouHtml(name, eventName);
  const text = buildThankYouText(name, eventName);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!r.ok) { const data = await r.json().catch(() => ({})); return { sent: false, reason: data.message || `send failed (${r.status})` }; }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(405).json({ error: "Method not allowed" }); }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY" });
  // Accept either key format Supabase issues for server-side use: the legacy
  // service_role JWT (three dot-separated base64 segments, ~200+ chars) or
  // the newer opaque sb_secret_... secret key. Both work as-is in the
  // apikey / Bearer headers below — this is just an early sanity check so a
  // wrong/partial value fails loudly here instead of as an opaque 401 later.
  const looksLikeJwt = serviceKey.split(".").length === 3 && serviceKey.length >= 100;
  const looksLikeSecretKey = serviceKey.startsWith("sb_secret_") && serviceKey.length >= 20;
  if (!looksLikeJwt && !looksLikeSecretKey) {
    return res.status(500).json({ error: `Server misconfigured: SUPABASE_SERVICE_ROLE_KEY does not look like a valid Supabase service_role JWT or sb_secret_ key (length ${serviceKey.length}) — re-copy it from Supabase Dashboard > Project Settings > API Keys` });
  }

  const body = req.body || {};

  // Honeypot: real visitors never fill this hidden field.
  if (body.website) return res.status(200).json({ ok: true });

  const full_name = String(body.full_name || "").trim();
  const company_name = String(body.company_name || "").trim();
  const position = String(body.position || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const country = String(body.country || "").trim();
  const event_source = body.event ? String(body.event).trim() : null;
  const registration_method = ["QR", "Tablet", "Admin"].includes(body.registration_method) ? body.registration_method : "QR";

  if (!full_name || !company_name || !phone || !email || !country) {
    return res.status(400).json({ error: "full_name, company_name, phone, email, and country are required" });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Invalid email address" });
  if (phone.replace(/[^0-9]/g, "").length < 6) return res.status(400).json({ error: "Invalid phone number" });

  const headers = sbHeaders(serviceKey);

  try {
    // Find existing lead by email (case-insensitive dedupe).
    const findUrl = `${SUPABASE_URL}/rest/v1/leads?select=*&email=eq.${encodeURIComponent(email)}`;
    const findRes = await fetch(findUrl, { headers });
    const existing = await findRes.json();
    if (!findRes.ok) throw new Error(existing.message || "Lookup failed");

    let lead = Array.isArray(existing) && existing[0];

    if (lead) {
      // Duplicate-submit cooldown: same email, very recent event, same source — likely a double click.
      const recentUrl = `${SUPABASE_URL}/rest/v1/lead_events?select=registered_at&lead_id=eq.${lead.id}&order=registered_at.desc&limit=1`;
      const recentRes = await fetch(recentUrl, { headers });
      const recent = await recentRes.json();
      if (recentRes.ok && Array.isArray(recent) && recent[0]) {
        const last = new Date(recent[0].registered_at).getTime();
        if (Date.now() - last < DUPLICATE_COOLDOWN_MS) return res.status(200).json({ ok: true, deduped: true });
      }

      // Refresh profile fields — they may have changed since the last registration.
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`, {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify({ full_name, company_name, position, phone, country, updated_at: new Date().toISOString() }),
      });
      const updated = await updateRes.json();
      if (!updateRes.ok) throw new Error(updated.message || "Update failed");
      lead = updated[0];
    } else {
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: "POST",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify({ full_name, company_name, position, phone, email, country }),
      });
      const inserted = await insertRes.json();
      if (!insertRes.ok) throw new Error(inserted.message || "Insert failed");
      lead = inserted[0];
    }

    const lang = country.toLowerCase() === "indonesia" ? "id" : "en";

    // Read-only lookup for the email's "Registered through:" row only — the
    // raw event_source code below still goes into lead_events untouched, so
    // attribution is unaffected whether or not a matching event row exists.
    let eventDisplayName = null;
    if (event_source) {
      try {
        const evRes = await fetch(`${SUPABASE_URL}/rest/v1/events?select=display_name&code=eq.${encodeURIComponent(event_source)}&limit=1`, { headers });
        const evData = await evRes.json();
        if (evRes.ok && Array.isArray(evData) && evData[0] && evData[0].display_name) eventDisplayName = evData[0].display_name;
      } catch (_) { /* non-fatal: email just omits the event row */ }
    }

    const emailResult = await sendThankYouEmail(email, full_name, eventDisplayName);

    const eventRes = await fetch(`${SUPABASE_URL}/rest/v1/lead_events`, {
      method: "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body: JSON.stringify({
        lead_id: lead.id,
        event_source,
        registration_method,
        thank_you_email_lang: lang,
        thank_you_email_status: emailResult.sent ? "sent" : (emailResult.reason === "email not configured" ? "pending" : "failed"),
      }),
    });
    const eventData = await eventRes.json();
    if (!eventRes.ok) throw new Error(eventData.message || "Event insert failed");

    return res.status(201).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
