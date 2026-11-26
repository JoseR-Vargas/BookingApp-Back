/**
 * Test-only wiring of the reminders (spec 24): the use cases over in-memory
 * adapters, a fixed clock with the timezone of the business and the doubles
 * of the ports that belong to other modules.
 */
import { InMemoryBookingRepository } from '../bookings/infrastructure/persistence/in-memory/in-memory-booking.repository';
import { NewBooking } from '../bookings/domain/booking';
import { PublicAppUrl } from '../email/application/ports/public-app-url.port';
import { CancelTokens } from '../bookings/application/ports/cancel-tokens.port';
import { ReminderSettings } from '../shared/domain/reminders';
import {
  TenantRemindersProfile,
  TenantRemindersReader,
  TenantRemindersWriter,
} from '../tenancy/application/ports/tenant-reminders.port';
import { defaultReminderSettings } from './domain/reminder-settings';
import { BusinessTime } from './application/ports/business-time.port';
import { MessageSenders } from './application/ports/message-sender.port';
import { ReminderPlan } from './application/ports/reminder-plan.port';
import { GetReminderSettingsUseCase } from './application/use-cases/get-reminder-settings.use-case';
import { SaveReminderSettingsUseCase } from './application/use-cases/save-reminder-settings.use-case';
import { SendDueRemindersUseCase } from './application/use-cases/send-due-reminders.use-case';
import { SendReminderUseCase } from './application/use-cases/send-reminder.use-case';
import { InMemoryMessageSender } from './infrastructure/messaging/in-memory-message-sender';

/** The instant every test starts at: 2026-03-24 11:00 of Montevideo. */
export const NOW = new Date('2026-03-24T14:00:00Z');

/** The timezone of the business in the tests: Montevideo, three hours behind UTC. */
export const ZONE_OFFSET_MINUTES = -180;

/**
 * The clock of the business with a fixed offset: the tests do not depend on
 * the zone of the machine they run on.
 */
export class FixedBusinessTime implements BusinessTime {
  constructor(
    private readonly instant: Date,
    private readonly offsetMinutes = ZONE_OFFSET_MINUTES,
  ) {}

  now(): Date {
    return this.instant;
  }

  dateOf(instant: Date): string {
    const shifted = new Date(instant.getTime() + this.offsetMinutes * 60_000);
    return shifted.toISOString().slice(0, 10);
  }

  instantOf(date: string, time: string): Date | null {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!dateMatch || !timeMatch) return null;
    const [year, month, day] = dateMatch.slice(1).map(Number);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (hour > 23 || minute > 59) return null;
    return new Date(
      Date.UTC(year, month - 1, day, hour, minute) -
        this.offsetMinutes * 60_000,
    );
  }
}

/** The business and its reminder settings. */
export class FakeTenantReminders
  implements TenantRemindersReader, TenantRemindersWriter
{
  name = 'Barbería Sur';
  settings: ReminderSettings = defaultReminderSettings();

  profile(): Promise<TenantRemindersProfile> {
    return Promise.resolve({ name: this.name, settings: this.settings });
  }

  save(settings: ReminderSettings): Promise<ReminderSettings> {
    this.settings = settings;
    return Promise.resolve(settings);
  }
}

/** The plan of the business: whether it allows reminders. */
export class FakePlan implements ReminderPlan {
  allowed = true;

  allowsReminders(): Promise<boolean> {
    return Promise.resolve(this.allowed);
  }
}

/** The secrets of the cancel links. */
export class FakeCancelTokens implements CancelTokens {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `token-${this.counter}`.padEnd(43, 'x');
  }

  hash(token: string): string {
    return `hash-${token}`;
  }
}

/** The public address of the app. */
export const appUrl = (value: string | null): PublicAppUrl => ({
  read: () => value,
});

/** A booking of the business, as the store keeps it. */
export const newBooking = (over: Partial<NewBooking> = {}): NewBooking => ({
  client: {
    name: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '099123456',
  },
  services: [{ id: 'corte', name: 'Corte', price: 1200, duration: 60 }],
  totalPrice: 1200,
  totalDuration: 60,
  professional: { id: 'ana', name: 'Beto' },
  location: { id: 'principal', name: 'Principal' },
  date: '2026-03-25',
  time: '10:00',
  slots: ['10:00', '10:30'],
  status: 'confirmed',
  ...over,
});

export function buildReminders(
  options: { now?: Date; settings?: Partial<ReminderSettings> } = {},
) {
  const bookings = new InMemoryBookingRepository();
  const email = new InMemoryMessageSender('email');
  const senders: MessageSenders = { email };
  const tenant = new FakeTenantReminders();
  tenant.settings = { ...tenant.settings, ...(options.settings ?? {}) };
  const plan = new FakePlan();
  const tokens = new FakeCancelTokens();
  const time = new FixedBusinessTime(options.now ?? NOW);
  const url = appUrl('https://app.example.com');

  const sendReminder = new SendReminderUseCase(
    bookings,
    tokens,
    senders,
    time,
    url,
  );
  const sendDue = new SendDueRemindersUseCase(
    bookings,
    tenant,
    plan,
    time,
    sendReminder,
  );
  const settings = new GetReminderSettingsUseCase(bookings, tenant, plan, time);
  const save = new SaveReminderSettingsUseCase(tenant, tenant);

  /** Stores a booking and gives it back. */
  const store = async (over: Partial<NewBooking> = {}) => {
    const result = await bookings.create(
      newBooking(over),
      'hash',
      new Error('bloque ocupado') as never,
    );
    if (!result.ok) throw new Error('could not seed the booking');
    return result.value;
  };

  return {
    bookings,
    email,
    tenant,
    plan,
    tokens,
    time,
    store,
    sendDue,
    sendReminder,
    settings,
    save,
  };
}
