// ===== PLANTILLAS DE CORREO =====
// The two emails of a booking, as pure functions: the data of the booking and the public URL of
// the app come in; the subject and the HTML come out. Nothing is sent from here, and the bytes
// are the ones the app has always sent.

/**
 * What the emails need of a booking: the same fields the stored booking has,
 * but without the bookkeeping (ids, hashes), so any booking can be rendered.
 */
export interface BookingEmailData {
  client: { name: string; email?: string };
  services: { name: string }[];
  totalPrice: number;
  professional: { name: string };
  date: string;
  time: string;
  notes?: string;
}

const escapeHtml = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 'YYYY-MM-DD' as a long Spanish date, e.g. 'Miércoles, 25 de marzo de 2026'. */
function formatLongDate(date: string): string {
  const [year, month, day] = date.split('-');
  const formatted = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  ).toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Public base URL of the frontend (`PUBLIC_APP_URL`), without a trailing
 * slash, or null when it is missing or is not an http(s) URL. Emails link to
 * it, so nothing else is ever put in an href.
 */
const BUTTON_STYLE =
  'display:inline-block;background-color:#1a1a2e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;';

/** The public base URL of the app, or null when it is unknown (no link is offered then). */
export type AppUrl = string | null;

export interface BookingEmail {
  subject: string;
  html: string;
}

/**
 * `cancelToken` is the one-time secret of the booking; with it (and a valid public URL) the email
 * carries the cancel link. Without either, the cancel block is left out entirely rather than
 * promising a way to cancel that the client cannot use.
 */
export function bookingConfirmationEmail(
  booking: BookingEmailData,
  options: { appUrl: AppUrl; cancelToken?: string },
): BookingEmail {
  const { appUrl, cancelToken } = options;

  const { client, services, totalPrice, professional, date, time, notes } =
    booking;
  const serviceNames = services.map((service) => service.name);

  const capitalizedDate = formatLongDate(date);
  const escape = escapeHtml;

  const servicesBlock = services
    .map(
      (service) =>
        `<strong style="color:#1a1a2e;font-size:16px;display:block;">${escape(service.name)}</strong>`,
    )
    .join('');

  const cancelBlock =
    cancelToken && appUrl
      ? `<p style="color:#6b7280;font-size:13px;margin:0 0 16px;">
                Si necesitas cancelar tu cita, puedes hacerlo hasta 1 minuto antes de la hora de inicio.
              </p>
              <a href="${escape(`${appUrl}/cancelar/${cancelToken}`)}" style="${BUTTON_STYLE}">Cancelar mi reserva</a>`
      : '';

  const notesBlock = notes
    ? `<tr>
          <td style="padding:16px 20px;">
            <span style="color:#6b7280;font-size:13px;">NOTAS</span><br>
            <strong style="color:#1a1a2e;font-size:15px;">${escape(notes)}</strong>
          </td>
        </tr>`
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
              <p style="color:#a0a0b0;margin:8px 0 0;font-size:13px;">Confirmación de Reserva</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 0;text-align:center;">
              <div style="width:64px;height:64px;background-color:#22c55e;border-radius:50%;margin:0 auto;line-height:64px;">
                <span style="color:white;font-size:36px;line-height:64px;">✓</span>
              </div>
              <h2 style="color:#1a1a2e;margin:16px 0 8px;font-size:20px;">¡Reserva Confirmada!</h2>
              <p style="color:#6b7280;margin:0;font-size:15px;">
                Hola <strong>${escape(client.name)}</strong>, tu cita ha sido registrada exitosamente.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:12px;">${services.length > 1 ? 'SERVICIOS' : 'SERVICIO'}</span><br>
                    ${servicesBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:12px;">PROFESIONAL</span><br>
                    <strong style="color:#1a1a2e;font-size:16px;">${escape(professional.name)}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:12px;">FECHA</span><br>
                    <strong style="color:#1a1a2e;font-size:16px;">${escape(capitalizedDate)}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:12px;">HORA</span><br>
                    <strong style="color:#1a1a2e;font-size:16px;">${escape(time)}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;${notesBlock ? 'border-bottom:1px solid #e5e7eb;' : ''}">
                    <span style="color:#6b7280;font-size:12px;">PRECIO</span><br>
                    <strong style="color:#1a1a2e;font-size:16px;">$${totalPrice.toLocaleString('es-AR')}</strong>
                  </td>
                </tr>
                ${notesBlock}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;text-align:center;">
              ${cancelBlock}
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
  const subject = `Confirmación de reserva — ${serviceNames.join(', ')}`;
  return { subject, html };
}

/** The email that tells the client the booking was cancelled. */
export function cancellationEmail(
  booking: BookingEmailData,
  options: { appUrl: AppUrl },
): BookingEmail {
  const { appUrl } = options;

  const { client, services, professional, date, time } = booking;
  const serviceNames = services.map((service) => service.name);

  const bookAgain = appUrl
    ? `<a href="${escapeHtml(appUrl)}" style="${BUTTON_STYLE}">Reservar de nuevo</a>`
    : '';
  const detail = (label: string, value: string) =>
    `<p style="margin:0 0 8px;color:#1a1a2e;font-size:15px;"><span style="color:#6b7280;font-size:12px;">${label}</span><br><strong>${escapeHtml(value)}</strong></p>`;

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
              <p style="color:#a0a0b0;margin:8px 0 0;font-size:13px;">Reserva cancelada</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:20px;text-align:center;">Reserva cancelada</h2>
              <p style="color:#6b7280;margin:0 0 24px;font-size:15px;text-align:center;">
                Hola <strong>${escapeHtml(client.name)}</strong>, tu reserva fue cancelada y el horario quedó libre.
              </p>
              ${detail(services.length > 1 ? 'SERVICIOS' : 'SERVICIO', serviceNames.join(', '))}
              ${detail('PROFESIONAL', professional.name)}
              ${detail('FECHA', formatLongDate(date))}
              ${detail('HORA', time)}
              <div style="text-align:center;margin-top:24px;">${bookAgain}</div>
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
  const subject = `Reserva cancelada — ${serviceNames.join(', ')}`;
  return { subject, html };
}
