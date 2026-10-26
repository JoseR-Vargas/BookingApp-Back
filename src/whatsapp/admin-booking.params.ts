/** Minimal booking shape the admin notification needs. */
export interface AdminNotifiableBooking {
  client: { name: string; phone: string };
  service: { name: string };
  professional: { name: string };
  date: string;
  time: string;
}

const FALLBACK = '-';

/** '2026-03-05' -> '05/03/2026'. Unexpected formats are returned untouched. */
export function formatAdminDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}

const nonEmpty = (value: string | undefined): string =>
  value?.trim() ? value.trim() : FALLBACK;

/**
 * Body params of the admin utility template, in the fixed order the approved
 * template uses (docs/whatsapp-setup.md must match):
 * {{1}} client name, {{2}} service, {{3}} professional, {{4}} date dd/mm/yyyy,
 * {{5}} time HH:MM, {{6}} client phone.
 */
export function buildAdminTemplateParams(
  booking: AdminNotifiableBooking,
): string[] {
  return [
    nonEmpty(booking.client?.name),
    nonEmpty(booking.service?.name),
    nonEmpty(booking.professional?.name),
    nonEmpty(formatAdminDate(booking.date)),
    nonEmpty(booking.time),
    nonEmpty(booking.client?.phone),
  ];
}
