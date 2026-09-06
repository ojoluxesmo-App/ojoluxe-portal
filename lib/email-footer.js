// lib/email-footer.js
// Shared branded OJO Luxe footer for every portal-generated outbound email
// (partner thank-you, broadcast/direct compose). Content only -- no
// sending, auth, or CRM/attribution logic lives here. Lives outside /api
// so Vercel's zero-config builder never treats it as its own route; it is
// only ever imported by the function files under /api.

const SITE_URL = "https://ojoluxe.com";
const SUPPORT_PHONE_TEL = "+13104066692";
const SUPPORT_PHONE_DISPLAY = "+1 (310) 406-6692";

export function buildOjoLuxeEmailFooterHtml() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="background:#0C0B09;padding:28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#cccccc;">
      <p style="margin:0;color:#F0E8D5;font-weight:bold;letter-spacing:0.5px;">OJO LUXE LLC</p>
      <p style="margin:2px 0 16px 0;">Open Journey On Demand Luxury</p>
      <p style="margin:0 0 6px 0;">&#127760;&nbsp;<a href="${SITE_URL}" style="color:#C9A84C;text-decoration:none;">www.ojoluxe.com</a></p>
      <p style="margin:0 0 6px 0;">&#9993;&nbsp;<a href="mailto:info@ojoluxe.com" style="color:#C9A84C;text-decoration:none;">info@ojoluxe.com</a></p>
      <p style="margin:0 0 6px 0;">&#128222;&nbsp;<a href="tel:${SUPPORT_PHONE_TEL}" style="color:#C9A84C;text-decoration:none;">${SUPPORT_PHONE_DISPLAY}</a></p>
      <p style="margin:0;">&#128248;&nbsp;<a href="https://instagram.com/ojo.luxe" style="color:#C9A84C;text-decoration:none;">@ojo.luxe</a></p>
    </td>
  </tr>
</table>`;
}

export function buildOjoLuxeEmailFooterText() {
  return [
    "--",
    "OJO LUXE LLC",
    "Open Journey On Demand Luxury",
    "Website: ojoluxe.com",
    "Email: info@ojoluxe.com",
    `Phone: ${SUPPORT_PHONE_DISPLAY}`,
    "Instagram: @ojo.luxe",
  ].join("\n");
}
