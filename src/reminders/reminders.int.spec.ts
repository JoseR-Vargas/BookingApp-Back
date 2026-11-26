import { Connection } from 'mongoose';
import {
  Booking,
  BookingSchema,
} from '../bookings/infrastructure/persistence/mongo/booking.entity';
import { MongoBookingRepository } from '../bookings/infrastructure/persistence/mongo/mongo-booking.repository';
import { NodeCancelTokens } from '../bookings/infrastructure/crypto/node-cancel-tokens';
import { Clock } from '../shared/application/clock.port';
import { AsyncLocalStorageTenantContext } from '../shared/infrastructure/tenancy/async-local-storage-tenant-context';
import {
  clearTestCollections,
  closeTestMongo,
  connectTestMongo,
} from '../shared/testing/mongo-test-connection';
import { TEST_TENANT_ID } from '../shared/testing/test-tenant';
import {
  TenantRecord,
  TenantSchema,
} from '../tenancy/infrastructure/persistence/mongo/tenant.entity';
import { MongoTenantReminders } from '../tenancy/infrastructure/persistence/mongo/mongo-tenant-reminders';
import { SendDueRemindersUseCase } from './application/use-cases/send-due-reminders.use-case';
import { SendReminderUseCase } from './application/use-cases/send-reminder.use-case';
import { MessageSenders } from './application/ports/message-sender.port';
import { InMemoryMessageSender } from './infrastructure/messaging/in-memory-message-sender';
import { SystemBusinessTime } from './infrastructure/time/system-business-time';

/** The instant of the test: 2026-03-24 11:00 of Montevideo. */
const NOW = new Date('2026-03-24T14:00:00Z');

/** An appointment at 10:00 of the next day, inside the 24 hours window. */
const TOMORROW = '2026-03-25';
const TOMORROW_TIME = '10:00';

/**
 * The whole flow of the reminders against MongoDB (`npm run test:int`): the
 * booking, the settings of the business and the log of the reminders live in
 * the database.
 */
describe('the reminders against MongoDB', () => {
  let connection: Connection;
  let bookings: MongoBookingRepository;
  let email: InMemoryMessageSender;
  let sendDue: SendDueRemindersUseCase;
  const originalZone = process.env.BUSINESS_TIMEZONE;

  beforeAll(async () => {
    connection = await connectTestMongo();
  });

  afterAll(async () => {
    await closeTestMongo(connection);
    if (originalZone === undefined) {
      delete process.env.BUSINESS_TIMEZONE;
    } else {
      process.env.BUSINESS_TIMEZONE = originalZone;
    }
  });

  beforeEach(async () => {
    process.env.BUSINESS_TIMEZONE = 'America/Montevideo';
    await clearTestCollections(connection);

    const bookingModel = connection.model<Booking>(Booking.name, BookingSchema);
    const tenantModel = connection.model<TenantRecord>(
      TenantRecord.name,
      TenantSchema,
    );
    // The business of the test: it has the default settings of the reminders.
    await tenantModel.create({
      _id: TEST_TENANT_ID,
      slug: 'int-test',
      name: 'Barbería Sur',
      status: 'active',
      isDefault: false,
      createdAt: NOW,
      trialEndsAt: null,
      bookingQuota: null,
      storageQuotaBytes: null,
      storageUsedBytes: 0,
      storageMeasuredAt: null,
    });

    bookings = new MongoBookingRepository(bookingModel);
    email = new InMemoryMessageSender('email');
    const senders: MessageSenders = { email };
    const clock: Clock = { now: () => NOW };
    const time = new SystemBusinessTime(clock);
    const context = new AsyncLocalStorageTenantContext();
    const profile = new MongoTenantReminders(tenantModel, context);
    const tokens = new NodeCancelTokens();

    const sendReminder = new SendReminderUseCase(
      bookings,
      tokens,
      senders,
      time,
      { read: () => 'https://app.example.com' },
    );
    sendDue = new SendDueRemindersUseCase(
      bookings,
      profile,
      { allowsReminders: () => Promise.resolve(true) },
      time,
      sendReminder,
    );
  });

  const store = async (over: Record<string, unknown> = {}) => {
    const created = await bookings.create(
      {
        client: { name: 'Ana', phone: '099123456', email: 'ana@example.com' },
        services: [{ id: 'corte', name: 'Corte', price: 1200, duration: 60 }],
        totalPrice: 1200,
        totalDuration: 60,
        professional: { id: 'ana', name: 'Beto' },
        location: { id: 'principal', name: 'Principal' },
        date: TOMORROW,
        time: TOMORROW_TIME,
        slots: ['10:00'],
        status: 'confirmed',
        ...over,
      } as never,
      'hash',
      new Error('bloque ocupado') as never,
    );
    if (!created.ok) throw new Error('could not seed the booking');
    return created.value;
  };

  it('sends the reminder of a booking once and keeps the log in the booking', async () => {
    const booking = await store();

    const first = await sendDue.execute();
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.sent).toBe(1);
      expect(first.value.failed).toBe(0);
    }
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].body).toContain('Barbería Sur');
    expect(email.sent[0].body).toContain('https://app.example.com/cancelar/');

    const second = await sendDue.execute();
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.sent).toBe(0);
    expect(email.sent).toHaveLength(1);

    const read = await bookings.findById(booking.id);
    expect(read?.reminders).toEqual([
      expect.objectContaining({
        kind: '24h',
        channel: 'email',
        ok: true,
        attempts: 1,
      }),
    ]);
  });

  it('does not remind a cancelled booking', async () => {
    await store({ status: 'cancelled' });

    const result = await sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sent).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it('does not remind a booking in the past', async () => {
    await store({ date: '2026-03-23', time: '10:00', slots: ['10:00'] });

    const result = await sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sent).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it('records a failed send and retries it up to three times', async () => {
    const booking = await store();
    email.failWith = 'smtp down';

    const first = await sendDue.execute();
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value).toEqual({ skipped: null, sent: 0, failed: 1 });
    }

    await sendDue.execute();
    await sendDue.execute();

    const read = await bookings.findById(booking.id);
    expect(read?.reminders).toEqual([
      expect.objectContaining({
        kind: '24h',
        channel: 'email',
        ok: false,
        error: 'smtp down',
        attempts: 3,
      }),
    ]);

    // The fourth round does not try again: the three attempts are spent.
    const fourth = await sendDue.execute();
    expect(fourth.ok).toBe(true);
    if (fourth.ok) {
      expect(fourth.value).toEqual({ skipped: null, sent: 0, failed: 0 });
    }
    const after = await bookings.findById(booking.id);
    expect(after?.reminders?.[0].attempts).toBe(3);
  });

  it('does not remind a client who left no email', async () => {
    await store({
      client: { name: 'Ana', phone: '099123456', email: '' },
    });

    const result = await sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sent).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it('keeps the link of the reminder working: it cancels that booking', async () => {
    const booking = await store();

    await sendDue.execute();

    const token = /cancelar\/([A-Za-z0-9_-]+)/.exec(
      email.sent[0].body,
    )?.[1] as string;
    const tokens = new NodeCancelTokens();
    const found = await bookings.findByCancelTokenHash(tokens.hash(token));

    expect(found?.id).toBe(booking.id);
  });

  it('does not send anything when the business turned the reminders off', async () => {
    await store();
    const tenantModel = connection.model<TenantRecord>(
      TenantRecord.name,
      TenantSchema,
    );
    await tenantModel.updateOne(
      { _id: TEST_TENANT_ID },
      {
        $set: {
          reminders: {
            enabled: false,
            channels: ['email'],
            hoursBefore: [24, 3],
            template: 'Hola {cliente}',
          },
        },
      },
    );

    const result = await sendDue.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ skipped: 'disabled', sent: 0, failed: 0 });
    }
    expect(email.sent).toHaveLength(0);
  });
});
