// api/leads.js
// Runs server-side on Vercel. Reads leads/lead_events with the service_role
// key so the anon key never needs read access to lead data (no anon policy
// exists on either table). Gated the same way as api/team-members.js: a
// shared admin token, since index.html has no real login yet (Phase 4).

import { timingSafeEqual } from "crypto";

const SUPABASE_URL = "https://aadlqagpxwshpdccxwto.supabase.co";

function isAuthorized(req) {
  const token = req.headers["x-admin-token"];
  const expected = process.env.ADMIN_API_TOKEN;
  if (!token || !expected) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY" });

  const headers = { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` };

  try {
    // One row per registration (lead_events), with the parent lead's profile embedded,
    // newest first — this is what the portal's Leads list renders directly.
    const url = `${SUPABASE_URL}/rest/v1/lead_events?select=*,leads(*)&order=registered_at.desc`;
    const r = await fetch(url, { headers });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || `Read failed (${r.status})`);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
