import { randomUUID } from "crypto";
// api/create-invoice.js
// Runs server-side on Vercel. Holds the Square token (never exposed to browser).

const SQUARE_BASE = "https://connect.squareupsandbox.com";
const SQUARE_VERSION = "2026-05-20";

async function square(path, body) {
  const res = await fetch(`${SQUARE_BASE}/v2/${path}`, {
    method: "POST",
    headers: {
      "Square-Version": SQUARE_VERSION,
      "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data.errors || data));
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { jobId, customerName, customerEmail, amountCents, note } = req.body;
    const locationId = process.env.SQUARE_LOCATION_ID;
    const idem = () => crypto.randomUUID();

    const { customer } = await square("customers", {
      idempotency_key: idem(),
      given_name: customerName,
      email_address: customerEmail,
    });

    const { order } = await square("orders", {
      idempotency_key: idem(),
      order: {
        location_id: locationId,
        customer_id: customer.id,
        line_items: [{
          name: note || "OJO Luxe ground transportation",
          quantity: "1",
          base_price_money: { amount: amountCents, currency: "USD" },
        }],
      },
    });

    const { invoice: draft } = await square("invoices", {
      idempotency_key: idem(),
      invoice: {
        location_id: locationId,
        order_id: order.id,
        primary_recipient: { customer_id: customer.id },
        delivery_method: "EMAIL",
        accepted_payment_methods: { card: true },
        payment_requests: [{
          request_type: "BALANCE",
          due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          tipping_enabled: true,
          automatic_payment_source: "NONE",
        }],
      },
    });

    const { invoice } = await square(`invoices/${draft.id}/publish`, {
      idempotency_key: idem(),
      version: draft.version,
    });

    res.status(200).json({
      invoiceId: invoice.id,
      payUrl: invoice.public_url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
