import { dayOfWeekFromIsoDate } from '../../availability/availability.calculator';

/** All user-facing bot copy (Spanish). Keep short; WhatsApp UIs are small. */

const WEEKDAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/** "Lunes 26/10" from YYYY-MM-DD. */
export function formatDay(isoDate: string): string {
  const dayOfWeek = dayOfWeekFromIsoDate(isoDate);
  const [, month, day] = isoDate.split('-');
  return `${dayOfWeek === null ? '' : `${WEEKDAYS[dayOfWeek]} `}${day}/${month}`;
}

export const formatPrice = (price: number): string => `$${price}`;

export const MESSAGES = {
  unavailable:
    'Por el momento no podemos tomar reservas por este medio. Por favor, inténtalo más tarde.',
  unsupported:
    'Solo puedo leer mensajes de texto y opciones de los menús. Escribe "menu" para empezar a reservar.',
  goodbye:
    'Listo, cancelé tu reserva en curso. Cuando quieras reservar, escribe "menu".',
  failure:
    'Ocurrió un problema al crear tu reserva. Por favor, inténtalo de nuevo en unos minutos.',
  conflict:
    'Lo sentimos, ese horario acaba de ser reservado por otra persona. Elige otro horario.',
  noDays:
    'No hay horarios disponibles en los próximos días para ese servicio. Elige otro servicio.',
  noDaySlots: 'Ese día ya no tiene horarios disponibles. Elige otro día.',
  slotTaken: 'Ese horario ya no está disponible. Elige otro.',
  servicePrompt: '¡Hola! Elige el servicio que quieres reservar:',
  serviceButton: 'Ver servicios',
  dayPrompt: '¿Qué día prefieres?',
  dayButton: 'Ver días',
  timePrompt: '¿A qué hora?',
  timeButton: 'Ver horarios',
  professionalPrompt: '¿Con quién quieres tu cita?',
  professionalButton: 'Ver profesionales',
  confirmButtons: { yes: 'Confirmar', no: 'Cancelar' },
} as const;

export function formatServiceDescription(
  price: number,
  duration: number,
): string {
  return `${formatPrice(price)} · ${duration} min`;
}

export interface BookingSummary {
  service: string;
  date: string;
  time: string;
  professional: string;
  price: number;
}

export function confirmPrompt(summary: BookingSummary): string {
  return [
    'Revisa tu reserva:',
    `• Servicio: ${summary.service}`,
    `• Día: ${formatDay(summary.date)}`,
    `• Hora: ${summary.time}`,
    `• Profesional: ${summary.professional}`,
    `• Precio: ${formatPrice(summary.price)}`,
    '',
    '¿Confirmas?',
  ].join('\n');
}

export function bookingConfirmed(summary: BookingSummary): string {
  return [
    '¡Reserva confirmada! ✅',
    `${summary.service} con ${summary.professional}`,
    `${formatDay(summary.date)} a las ${summary.time}`,
    '',
    'Para hacer otra reserva, escribe "menu".',
  ].join('\n');
}
