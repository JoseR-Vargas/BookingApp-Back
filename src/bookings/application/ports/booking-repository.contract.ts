import { DomainError } from '../../../shared/domain/domain-error';
import { ReminderRecord } from '../../../shared/domain/reminders';
import { Booking, NewBooking } from '../../domain/booking';
import { BookingReader } from './booking.reader';
import { BookingWriter } from './booking.writer';

/** What the contract needs from the adapter under test, on a store without bookings. */
export interface BookingRepositoryFixture {
  reader: BookingReader;
  writer: BookingWriter;
}

/** The error the caller prepares for a taken block; the adapter must answer this very instance. */
class TakenSignal extends DomainError {
  constructor() {
    super('validation', 'bloque ocupado');
  }
}

/** An id no booking has, valid for every store. */
export const ABSENT_ID = '507f1f77bcf86cd799439011';

const DAY = '2030-06-17';

export const newBooking = (
  overrides: Partial<NewBooking> = {},
): NewBooking => ({
  client: {
    name: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '1234567890',
  },
  services: [{ id: 'corte', name: 'Corte', price: 1200, duration: 60 }],
  totalPrice: 1200,
  totalDuration: 60,
  professional: { id: 'ana', name: 'Ana' },
  location: { id: 'principal', name: 'Principal' },
  date: DAY,
  time: '10:00',
  slots: ['10:00', '10:30'],
  status: 'confirmed',
  ...overrides,
});

let hashCounter = 0;
const nextHash = () => `hash-${Date.now()}-${++hashCounter}`;

/** One entry of the log of reminders of a booking (spec 24). */
const reminder = (over: Partial<ReminderRecord> = {}): ReminderRecord => ({
  kind: '24h',
  channel: 'whatsapp',
  sentAt: new Date('2026-03-24T10:00:00Z'),
  ok: true,
  attempts: 1,
  ...over,
});

/**
 * Behavior every BookingReader + BookingWriter adapter must honor: what is
 * stored comes back as a domain booking without its cancel-token hash, the
 * store refuses a second confirmed booking in a taken block, and cancelling
 * is atomic on the status.
 */
export function describeBookingRepositoryContract(
  name: string,
  factory: () => Promise<BookingRepositoryFixture>,
): void {
  describe(`BookingReader/BookingWriter contract: ${name}`, () => {
    let reader: BookingReader;
    let writer: BookingWriter;
    const taken = new TakenSignal();

    beforeEach(async () => {
      ({ reader, writer } = await factory());
    });

    const store = async (
      overrides: Partial<NewBooking> = {},
      hash = nextHash(),
    ): Promise<Booking> => {
      const result = await writer.create(newBooking(overrides), hash, taken);
      if (!result.ok)
        throw new Error(`could not seed: ${result.error.message}`);
      return result.value;
    };

    describe('create and read', () => {
      it('stores the booking and gives it an id, its status and its timestamps', async () => {
        const created = await store({ notes: 'con nota' });

        expect(created).toMatchObject({
          client: {
            name: 'Juan Pérez',
            email: 'juan@example.com',
            phone: '1234567890',
          },
          services: [{ id: 'corte', name: 'Corte', price: 1200, duration: 60 }],
          totalPrice: 1200,
          totalDuration: 60,
          professional: { id: 'ana', name: 'Ana' },
          location: { id: 'principal', name: 'Principal' },
          date: DAY,
          time: '10:00',
          slots: ['10:00', '10:30'],
          notes: 'con nota',
          status: 'confirmed',
        });
        expect(created.id).toEqual(expect.any(String));
        expect(created.id).not.toBe('');
        expect(created.createdAt).toBeInstanceOf(Date);
        expect(created.updatedAt).toBeInstanceOf(Date);
      });

      it('reads back the same booking by id and in the list', async () => {
        const created = await store();

        await expect(reader.findById(created.id)).resolves.toEqual(created);
        await expect(reader.findAll()).resolves.toEqual([created]);
      });

      it('answers null for an id nobody has, and an empty list without bookings', async () => {
        await expect(reader.findById(ABSENT_ID)).resolves.toBeNull();
        await expect(reader.findAll()).resolves.toEqual([]);
      });

      it('defaults the notes to an empty text', async () => {
        const created = await store({ notes: undefined });

        expect(created.notes).toBe('');
      });

      it('keeps a booking without location (made before locations existed) without one', async () => {
        const created = await store({ location: undefined });

        const read = await reader.findById(created.id);
        expect(read).not.toBeNull();
        expect(read?.location).toBeUndefined();
        expect(read).not.toHaveProperty('location.id');
      });
    });

    describe('cancel token', () => {
      it('finds the booking by the hash of its token and by nothing else', async () => {
        const created = await store({}, 'the-hash');

        await expect(reader.findByCancelTokenHash('the-hash')).resolves.toEqual(
          created,
        );
        await expect(reader.findByCancelTokenHash('other')).resolves.toBeNull();
      });

      it('never exposes the hash, in what it creates, reads, lists or updates', async () => {
        const created = await store({}, 'secret-hash-value');

        const everything = [
          created,
          await reader.findById(created.id),
          await reader.findByCancelTokenHash('secret-hash-value'),
          await reader.findAll(),
          await writer.update(created.id, { notes: 'x' }, taken),
          await writer.cancelIfConfirmed(created.id),
        ];
        for (const view of everything) {
          expect(JSON.stringify(view)).not.toContain('secret-hash-value');
          expect(JSON.stringify(view)).not.toContain('cancelTokenHash');
        }
      });
    });

    describe('the unique block per professional, date and slot', () => {
      it('refuses an overlapping confirmed booking with the error prepared by the caller', async () => {
        await store();

        const result = await writer.create(
          newBooking({ time: '10:30', slots: ['10:30', '11:00'] }),
          nextHash(),
          taken,
        );

        expect(result).toEqual({ ok: false, error: taken });
        expect((result as { error: unknown }).error).toBe(taken);
        await expect(reader.findAll()).resolves.toHaveLength(1);
      });

      it('lets another professional, another date or non-overlapping slots in', async () => {
        await store();

        await store({ professional: { id: 'beto', name: 'Beto' } });
        await store({ date: '2030-06-18' });
        await store({ time: '11:00', slots: ['11:00', '11:30'] });

        await expect(reader.findAll()).resolves.toHaveLength(4);
      });

      it('lets a booking in where the one before was cancelled', async () => {
        const first = await store();
        await writer.cancelIfConfirmed(first.id);

        await expect(store()).resolves.toMatchObject({ status: 'confirmed' });
      });

      it('refuses to move a booking onto a taken block and leaves it where it was', async () => {
        const first = await store();
        const second = await store({
          time: '12:00',
          slots: ['12:00', '12:30'],
        });

        const result = await writer.update(
          second.id,
          { time: '10:30', slots: ['10:30', '11:00'] },
          taken,
        );

        expect(result).toEqual({ ok: false, error: taken });
        await expect(reader.findById(second.id)).resolves.toEqual(second);
        await expect(reader.findById(first.id)).resolves.toEqual(first);
      });

      it('refuses to bring a cancelled booking back onto a taken block', async () => {
        const first = await store();
        await writer.cancelIfConfirmed(first.id);
        await store();

        const result = await writer.update(
          first.id,
          { status: 'confirmed' },
          taken,
        );

        expect(result).toEqual({ ok: false, error: taken });
        expect((await reader.findById(first.id))?.status).toBe('cancelled');
      });
    });

    describe('update', () => {
      it('applies the changes and answers the updated booking', async () => {
        const created = await store();

        const result = await writer.update(
          created.id,
          { notes: 'cambiada', time: '11:00', slots: ['11:00', '11:30'] },
          taken,
        );

        expect(result.ok).toBe(true);
        const updated = result.ok ? result.value : null;
        expect(updated).toMatchObject({
          id: created.id,
          notes: 'cambiada',
          time: '11:00',
          slots: ['11:00', '11:30'],
          professional: created.professional,
        });
        await expect(reader.findById(created.id)).resolves.toEqual(updated);
      });

      it('answers ok(null) for a booking that does not exist', async () => {
        await expect(
          writer.update(ABSENT_ID, { notes: 'x' }, taken),
        ).resolves.toEqual({ ok: true, value: null });
      });

      it('answers a validation error, and stores nothing, for an invalid status', async () => {
        const created = await store();

        const result = await writer.update(
          created.id,
          { status: 'foo' },
          taken,
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.kind).toBe('validation');
          expect(result.error.message).toMatch(/^Error de validación: /);
          expect(result.error).not.toBe(taken);
        }
        await expect(reader.findById(created.id)).resolves.toEqual(created);
      });
    });

    describe('delete', () => {
      it('answers the deleted booking once, then null', async () => {
        const created = await store();

        await expect(writer.delete(created.id)).resolves.toEqual(created);
        await expect(writer.delete(created.id)).resolves.toBeNull();
        await expect(reader.findById(created.id)).resolves.toBeNull();
      });

      it('answers null for an id nobody has', async () => {
        await expect(writer.delete(ABSENT_ID)).resolves.toBeNull();
      });
    });

    describe('cancelIfConfirmed', () => {
      it('cancels a confirmed booking and answers it cancelled', async () => {
        const created = await store();

        const cancelled = await writer.cancelIfConfirmed(created.id);

        expect(cancelled).toMatchObject({
          id: created.id,
          status: 'cancelled',
        });
        expect((await reader.findById(created.id))?.status).toBe('cancelled');
      });

      it('answers null for a cancelled booking and for an id nobody has', async () => {
        const created = await store();
        await writer.cancelIfConfirmed(created.id);

        await expect(writer.cancelIfConfirmed(created.id)).resolves.toBeNull();
        await expect(writer.cancelIfConfirmed(ABSENT_ID)).resolves.toBeNull();
      });

      it('of two simultaneous cancellations only one gets the booking back', async () => {
        const created = await store();

        const outcomes = await Promise.all([
          writer.cancelIfConfirmed(created.id),
          writer.cancelIfConfirmed(created.id),
        ]);

        expect(outcomes.filter((outcome) => outcome !== null)).toHaveLength(1);
        expect((await reader.findById(created.id))?.status).toBe('cancelled');
      });
    });

    describe('findOccupiedSlots', () => {
      it('answers the slots of the confirmed bookings of that professional and date', async () => {
        await store({ slots: ['10:00', '10:30'] });
        await store({ time: '12:00', slots: ['12:00'] });
        await store({
          professional: { id: 'beto', name: 'Beto' },
          slots: ['10:00'],
        });
        await store({ date: '2030-06-18', slots: ['10:00'] });

        const found = await reader.findOccupiedSlots(DAY, 'ana');

        expect(found.flatMap(({ slots }) => slots).sort()).toEqual([
          '10:00',
          '10:30',
          '12:00',
        ]);
      });

      it('leaves out cancelled bookings and the one being edited', async () => {
        const cancelled = await store({ slots: ['09:00'] });
        await writer.cancelIfConfirmed(cancelled.id);
        const edited = await store({ slots: ['10:00'] });
        await store({ slots: ['11:00'] });

        const found = await reader.findOccupiedSlots(DAY, 'ana', edited.id);

        expect(found.flatMap(({ slots }) => slots)).toEqual(['11:00']);
      });

      it('treats an odd professional id as plain text', async () => {
        await store();

        await expect(reader.findOccupiedSlots(DAY, '$ne')).resolves.toEqual([]);
      });
    });

    describe('the log of reminders', () => {
      it('starts without reminders and keeps the ones it is given', async () => {
        const created = await store();

        expect(created.reminders ?? []).toEqual([]);

        const saved = await writer.saveReminders(created.id, [
          reminder(),
          reminder({
            kind: '3h',
            channel: 'email',
            ok: false,
            error: 'smtp down',
            attempts: 2,
          }),
        ]);

        expect(saved.ok).toBe(true);
        const read = await reader.findById(created.id);
        expect(read?.reminders).toEqual([
          reminder(),
          reminder({
            kind: '3h',
            channel: 'email',
            ok: false,
            error: 'smtp down',
            attempts: 2,
          }),
        ]);
      });

      it('replaces the log with the one it is given', async () => {
        const created = await store();
        await writer.saveReminders(created.id, [reminder()]);

        await writer.saveReminders(created.id, [
          reminder({ ok: false, error: 'whatsapp down', attempts: 2 }),
        ]);

        const read = await reader.findById(created.id);
        expect(read?.reminders).toEqual([
          reminder({ ok: false, error: 'whatsapp down', attempts: 2 }),
        ]);
      });

      it('answers ok(null) for a booking that does not exist', async () => {
        await expect(
          writer.saveReminders(ABSENT_ID, [reminder()]),
        ).resolves.toEqual({ ok: true, value: null });
      });

      it('finds the booking by the digest of the secret of its reminder', async () => {
        const created = await store({}, 'the-hash');

        await writer.saveReminders(created.id, [reminder()], 'reminder-hash');

        await expect(
          reader.findByCancelTokenHash('reminder-hash'),
        ).resolves.toEqual(await reader.findById(created.id));
        await expect(reader.findByCancelTokenHash('the-hash')).resolves.toEqual(
          await reader.findById(created.id),
        );
        await expect(reader.findByCancelTokenHash('other')).resolves.toBeNull();
      });
    });

    describe('findByDateRange', () => {
      it('answers the bookings of the days of the range, both included', async () => {
        await store({ date: '2030-06-17' });
        await store({ date: '2030-06-18' });
        await store({ date: '2030-06-19' });

        const found = await reader.findByDateRange('2030-06-17', '2030-06-18');

        expect(found.map((booking) => booking.date)).toEqual([
          '2030-06-17',
          '2030-06-18',
        ]);
      });

      it('answers an empty list when no booking is in the range', async () => {
        await store({ date: '2030-06-17' });

        await expect(
          reader.findByDateRange('2030-07-01', '2030-07-31'),
        ).resolves.toEqual([]);
      });
    });
  });
}
