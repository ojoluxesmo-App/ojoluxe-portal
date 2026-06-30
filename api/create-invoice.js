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
    const {
      jobId, customerName, customerEmail, amountCents, note,
      invoice_number, service_type, service_date, from_loc, to_loc,
      vehicle_class, passenger_name, pax_count, duration, rate_note,
    } = req.body;
    const locationId = process.env.SQUARE_LOCATION_ID;
    const idem = () => crypto.randomUUID();

    const PUBLIC_MESSAGE =
      "Thank you for choosing OJO Luxe.\n\n" +
      "All reservations are subject to availability. Airport fees, tolls, parking, " +
      "and wait time may apply.\n\n" +
      "A 3.9% service fee applies to all credit card payments and is included in the " +
      "total shown. Pay by cash, Zelle, or bank transfer to waive this fee - contact " +
      "us for payment instructions.\n\n" +
      "Cancellations within 24 hours of pickup may be subject to a cancellation fee.\n\n" +
      "For assistance:\n" +
      "info@ojoluxe.com  |  www.ojoluxe.com\n\n" +
      "Luxury Transportation - Private Chauffeur - Airport Transfers - Tours - Events\n" +
      "West Coast & Nationwide Service";

    const tripNote = [
      service_date    ? "Date: "      + service_date    : null,
      service_type    ? "Service: "   + service_type    : null,
      from_loc        ? "From: "      + from_loc        : null,
      to_loc          ? "To: "        + to_loc          : null,
      vehicle_class   ? "Vehicle: "   + vehicle_class   : null,
      (passenger_name || pax_count)
        ? "Passenger: " + [passenger_name, pax_count ? "(" + pax_count + " pax)" : null].filter(Boolean).join(" ")
        : null,
      duration        ? "Duration: "  + duration        : null,
      rate_note       ? "Rate: "      + rate_note       : null,
    ].filter(Boolean).join("\n");

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
          name: "Luxury Ground Transportation",
          quantity: "1",
          base_price_money: { amount: amountCents, currency: "USD" },
          ...(tripNote ? { note: tripNote } : {}),
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
        ...(invoice_number ? { invoice_number } : {}),
        title: "OJO Luxe - Official Invoice",
        description: PUBLIC_MESSAGE,
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
