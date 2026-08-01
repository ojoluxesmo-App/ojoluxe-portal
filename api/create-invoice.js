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

const AWB_BLOCK_MAX_CHARS = 4000;

function buildAwbBlock({ title, client, date, pickupTime, vehicle, fromLoc, toLoc, stops, reference, notes }) {
  const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());
  const label = (text, width) => (text + ":").padEnd(width);
  const LW = 13;

  const routeLines = [];
  const stopList = Array.isArray(stops) ? stops.filter((s) => clean(s)) : [];
  if (stopList.length) {
    const legs = [clean(fromLoc), ...stopList.map(clean), clean(toLoc)].filter(Boolean);
    legs.forEach((leg, i) => routeLines.push(`${i + 1}. ${leg}`));
  } else if (clean(fromLoc) || clean(toLoc)) {
    routeLines.push(label("Route", LW) + [clean(fromLoc), clean(toLoc)].filter(Boolean).join("  ->  "));
  }

  const lines = [
    clean(client) ? label("Client", LW) + clean(client) : null,
    clean(date) ? label("Date", LW) + clean(date) : null,
    clean(pickupTime) ? label("Pickup", LW) + clean(pickupTime) : null,
    clean(vehicle) ? label("Vehicle", LW) + clean(vehicle) : null,
    ...routeLines,
    clean(reference) ? label("Reference", LW) + clean(reference) : null,
    clean(notes) ? label("Notes", LW) + clean(notes) : null,
  ].filter(Boolean);

  if (!lines.length) return clean(title);

  const divider = "-".repeat(40);
  const body = [clean(title) || null, divider, ...lines].filter(Boolean).join("\n");

  if (body.length <= AWB_BLOCK_MAX_CHARS) return body;

  // Defensive truncation (should not trigger given Square's 65,536-char description limit):
  // trim Notes first, then hard-cut the rest.
  const withoutNotes = [clean(title) || null, divider, ...lines.filter((l) => !l.startsWith(label("Notes", LW)))]
    .filter(Boolean)
    .join("\n");
  return withoutNotes.length <= AWB_BLOCK_MAX_CHARS
    ? withoutNotes
    : withoutNotes.slice(0, AWB_BLOCK_MAX_CHARS);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const {
      jobId, customerName, customerEmail, customerPhone, amountCents, note,
      invoice_number, service_type, service_date, from_loc, to_loc,
      vehicle_class, passenger_name, pax_count, duration, rate_note,
      pickup_time, stops, reference_code, waybill_notes, apply_card_fee,
    } = req.body;
    const applyCardFee = apply_card_fee !== false;
    const CARD_FEE_RATE = 0.039;
    const locationId = process.env.SQUARE_LOCATION_ID;
    const idem = () => crypto.randomUUID();

    const PUBLIC_MESSAGE =
      "Thank you for choosing OJO Luxe.\n\n" +
      "All reservations are subject to availability. Airport fees, tolls, parking, " +
      "and wait time may apply.\n\n" +
      "A 3.9% card processing fee applies to card payments and is itemized above; it " +
      "is waived for cash, Zelle, or bank transfer - contact us for payment instructions.\n\n" +
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
      rate_note       ? "Payment: "   + rate_note       : null,
    ].filter(Boolean).join("\n");

    const awbBlock = buildAwbBlock({
      title: service_type,
      client: customerName || passenger_name,
      date: service_date,
      pickupTime: pickup_time,
      vehicle: vehicle_class,
      fromLoc: from_loc,
      toLoc: to_loc,
      stops,
      reference: reference_code || invoice_number,
      notes: waybill_notes || note,
    });

    const rawPhone = (customerPhone || "").replace(/[\s\-\.\(\)]/g, "");
    const validPhone = rawPhone.length > 0 ? rawPhone : null;
    const contactEmail = customerEmail || (!validPhone ? "info@ojoluxe.com" : null);

    const { customer } = await square("customers", {
      idempotency_key: idem(),
      given_name: customerName,
      ...(contactEmail ? { email_address: contactEmail } : {}),
      ...(validPhone ? { phone_number: validPhone } : {}),
    });

    const { order } = await square("orders", {
      idempotency_key: idem(),
      order: {
        location_id: locationId,
        customer_id: customer.id,
        line_items: [
          {
            name: (service_type || "Luxury Ground Transportation").slice(0, 500),
            quantity: "1",
            base_price_money: { amount: amountCents, currency: "USD" },
            ...(tripNote ? { note: tripNote } : {}),
          },
          ...(applyCardFee ? [{
            name: "Card Processing Fee (3.9%)",
            quantity: "1",
            base_price_money: { amount: Math.round(amountCents * CARD_FEE_RATE), currency: "USD" },
          }] : []),
        ],
      },
    });

    const { invoice: draft } = await square("invoices", {
      idempotency_key: idem(),
      invoice: {
        location_id: locationId,
        order_id: order.id,
        primary_recipient: { customer_id: customer.id },
        delivery_method: "SHARE_MANUALLY",
        accepted_payment_methods: { card: true },
        ...(invoice_number ? { invoice_number } : {}),
        title: "OJO Luxe - Official Invoice",
        description: awbBlock + "\n\n" + PUBLIC_MESSAGE,
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
