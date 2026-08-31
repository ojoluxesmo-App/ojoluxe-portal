// api/trade-show-lead.js
// Public endpoint for the future ojoluxe.com/partner registration page.
// Runs server-side on Vercel and holds the Supabase service_role key —
// the public page itself carries NO Supabase credentials of any kind.
// Insert-only: this endpoint can never read companies/clients/jobs/leads.

const SUPABASE_URL = "https://aadlqagpxwshpdccxwto.supabase.co";
const DUPLICATE_COOLDOWN_MS = 60 * 1000; // block rapid double-submits of the same email

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_TEMPLATE = {
  subject: "Terima kasih telah mendaftar - OJO Luxe",
  body: (name) =>
    `Halo ${name},\n\nTerima kasih telah mendaftar sebagai mitra OJO Luxe. Tim kami akan segera menghubungi Anda.\n\nSalam,\nOJO Luxe`,
};
const EN_TEMPLATE = {
  subject: "Thank you for registering - OJO Luxe",
  body: (name) =>
    `Hi ${name},\n\nThank you for registering as an OJO Luxe partner. Our team will be in touch shortly.\n\nBest,\nOJO Luxe`,
};

function sbHeaders(serviceKey, extra) {
  return { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}`, ...extra };
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.PARTNER_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function sendThankYouEmail(to, name, lang) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PARTNER_EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, reason: "email not configured" };

  const tpl = lang === "id" ? ID_TEMPLATE : EN_TEMPLATE;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject: tpl.subject, text: tpl.body(name) }),
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
    const emailResult = await sendThankYouEmail(email, full_name, lang);

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
