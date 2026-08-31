// api/leads.js
// Runs server-side on Vercel. Reads/writes leads/lead_events with the
// service_role key so the anon key never needs access to lead data (no
// anon policy exists on either table). Gated the same way as
// api/team-members.js: a shared admin token, since index.html has no real
// login yet (Phase 4).
//
// GET    -> list registrations (lead_events joined to their lead)
// PATCH  -> edit a lead's profile fields (body: { lead_id, full_name, company_name, position, phone, email, country })
// DELETE -> ?scope=event&id=<lead_event_id> deletes one registration, preserving the lead and its other event history
//           ?scope=lead&id=<lead_id> deletes the lead entirely (cascades to all its lead_events)

import { timingSafeEqual } from "crypto";

const SUPABASE_URL = "https://aadlqagpxwshpdccxwto.supabase.co";
const EDITABLE_FIELDS = ["full_name", "company_name", "position", "phone", "email", "country"];

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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(500).json({ error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY" });

  const headers = { "Content-Type": "application/json", "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` };

  try {
    if (req.method === "GET") {
      // One row per registration (lead_events), with the parent lead's profile embedded,
      // newest first — this is what the portal's Leads list renders directly.
      const url = `${SUPABASE_URL}/rest/v1/lead_events?select=*,leads(*)&order=registered_at.desc`;
      const r = await fetch(url, { headers });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || `Read failed (${r.status})`);
      return res.status(200).json(data);
    }

    if (req.method === "PATCH") {
      const body = req.body || {};
      const leadId = body.lead_id;
      if (!leadId) return res.status(400).json({ error: "Missing lead_id" });

      const payload = {};
      for (const f of EDITABLE_FIELDS) if (body[f] !== undefined) payload[f] = body[f];
      if (!Object.keys(payload).length) return res.status(400).json({ error: "No editable fields provided" });
      payload.updated_at = new Date().toISOString();

      const r = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { ...headers, "Prefer": "return=representation" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || `Update failed (${r.status})`);
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      const scope = req.query.scope;
      const id = req.query.id;
      if (!id || (scope !== "event" && scope !== "lead")) {
        return res.status(400).json({ error: "Requires ?scope=event|lead&id=<id>" });
      }
      // scope=event deletes one lead_events row only — the lead and its other
      // event registrations are untouched. scope=lead deletes the lead row,
      // which cascades to ALL of its lead_events (on delete cascade).
      const table = scope === "event" ? "lead_events" : "leads";
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { ...headers, "Prefer": "return=minimal" },
      });
      if (!r.ok && r.status !== 204) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || `Delete failed (${r.status})`);
      }
      return res.status(204).end();
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).end();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
