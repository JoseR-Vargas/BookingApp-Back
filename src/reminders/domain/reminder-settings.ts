// ===== REGLAS DE LA CONFIGURACIÓN DE RECORDATORIOS =====
// What the owner may save about the reminders of the business (spec 24).
// Pure: the settings it is given come in, the settings that are accepted come
// out. The Spanish messages are the ones the panel shows.

import {
  REMINDER_CHANNELS,
  ReminderChannel,
  ReminderSettings,
} from '../../shared/domain/reminders';
import { Result, err, ok } from '../../shared/domain/result';
import { InvalidReminderSettings } from './reminder.errors';

/** The longest text a business may save. */
export const MAX_REMINDER_TEMPLATE_LENGTH = 1000;

/** The farthest anticipation a business may ask for (30 days). */
export const MAX_REMINDER_HOURS_BEFORE = 24 * 30;

const isChannel = (value: unknown): value is ReminderChannel =>
  typeof value === 'string' &&
  (REMINDER_CHANNELS as readonly string[]).includes(value);

/**
 * The settings the owner sent on top of the ones the business already has.
 * Every field is optional: an absent one keeps its current value, and a
 * present one must be valid. Unknown fields are ignored.
 */
export function mergeReminderSettings(
  current: ReminderSettings,
  input: unknown,
): Result<ReminderSettings, InvalidReminderSettings> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(
      new InvalidReminderSettings(
        'La configuración de recordatorios no es válida.',
      ),
    );
  }
  const sent = input as Record<string, unknown>;

  const enabled = readEnabled(sent.enabled, current.enabled);
  if (!enabled.ok) return enabled;
  const channels = readChannels(sent.channels, current.channels);
  if (!channels.ok) return channels;
  const hoursBefore = readHoursBefore(sent.hoursBefore, current.hoursBefore);
  if (!hoursBefore.ok) return hoursBefore;
  const template = readTemplate(sent.template, current.template);
  if (!template.ok) return template;

  return ok({
    enabled: enabled.value,
    channels: channels.value,
    hoursBefore: hoursBefore.value,
    template: template.value,
  });
}

function readEnabled(
  value: unknown,
  current: boolean,
): Result<boolean, InvalidReminderSettings> {
  if (value === undefined) return ok(current);
  if (typeof value !== 'boolean') {
    return err(
      new InvalidReminderSettings(
        'El interruptor de recordatorios debe ser verdadero o falso.',
      ),
    );
  }
  return ok(value);
}

function readChannels(
  value: unknown,
  current: ReminderChannel[],
): Result<ReminderChannel[], InvalidReminderSettings> {
  if (value === undefined) return ok(current);
  if (!Array.isArray(value)) {
    return err(
      new InvalidReminderSettings(
        'Los canales de recordatorio deben ser una lista.',
      ),
    );
  }
  const channels: ReminderChannel[] = [];
  for (const entry of value) {
    if (!isChannel(entry)) {
      return err(
        new InvalidReminderSettings(
          `El canal "${String(entry)}" no existe. Usa "email".`,
        ),
      );
    }
    if (!channels.includes(entry)) {
      channels.push(entry);
    }
  }
  return ok(channels);
}

function readHoursBefore(
  value: unknown,
  current: number[],
): Result<number[], InvalidReminderSettings> {
  if (value === undefined) return ok(current);
  if (!Array.isArray(value)) {
    return err(
      new InvalidReminderSettings(
        'La anticipación de los recordatorios debe ser una lista de horas.',
      ),
    );
  }
  const hours: number[] = [];
  for (const entry of value) {
    if (
      typeof entry !== 'number' ||
      !Number.isInteger(entry) ||
      entry <= 0 ||
      entry > MAX_REMINDER_HOURS_BEFORE
    ) {
      return err(
        new InvalidReminderSettings(
          `La anticipación "${String(entry)}" no es válida: usa un número entero de horas entre 1 y ${MAX_REMINDER_HOURS_BEFORE}.`,
        ),
      );
    }
    if (!hours.includes(entry)) {
      hours.push(entry);
    }
  }
  return ok(hours);
}

function readTemplate(
  value: unknown,
  current: string,
): Result<string, InvalidReminderSettings> {
  if (value === undefined) return ok(current);
  if (typeof value !== 'string' || value.trim() === '') {
    return err(
      new InvalidReminderSettings(
        'La plantilla del recordatorio no puede estar vacía.',
      ),
    );
  }
  if (value.length > MAX_REMINDER_TEMPLATE_LENGTH) {
    return err(
      new InvalidReminderSettings(
        `La plantilla del recordatorio no puede pasar de ${MAX_REMINDER_TEMPLATE_LENGTH} caracteres.`,
      ),
    );
  }
  return ok(value);
}

/** The settings of a business that never saved any. */
export { defaultReminderSettings } from '../../shared/domain/reminders';
