// ===== PLANTILLA: CORREO DE BIENVENIDA =====
// The email a new business owner gets after the signup (spec 21): a pure
// function. Without a public URL the button is left out instead of pointing
// nowhere.

import { AppUrl, BookingEmail } from './booking-email.templates';

const escapeHtml = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const BUTTON_STYLE =
  'display:inline-block;background-color:#1a1a2e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;';

/**
 * @param options.panelUrl the address of the panel of the business, or null
 * when the public URL of the app is not known.
 */
export function welcomeEmail(options: {
  adminName: string;
  businessName: string;
  panelUrl: AppUrl;
}): BookingEmail {
  const { adminName, businessName, panelUrl } = options;
  const button = panelUrl
    ? `<a href="${escapeHtml(panelUrl)}" style="${BUTTON_STYLE}">Entrar al panel</a>`
    : '';
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#1a1a2e;padding:32px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:1px;">BookingApp</h1>
              <p style="color:#a0a0b0;margin:8px 0 0;font-size:13px;">Bienvenida</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;text-align:center;">
              <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:20px;">¡Tu negocio ya está creado!</h2>
              <p style="color:#6b7280;margin:0 0 24px;font-size:15px;">
                Hola <strong>${escapeHtml(adminName)}</strong>, <strong>${escapeHtml(businessName)}</strong> ya puede recibir reservas.
                Entra al panel para cargar tus servicios, profesionales y horarios.
              </p>
              ${button}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                BookingApp &middot; Este es un correo automático, por favor no respondas.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject: `Bienvenido a BookingApp — ${businessName}`, html };
}
