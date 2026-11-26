import type { OccupiedBooking } from '../../domain/availability';
import type { OccupiedSlotsReader } from './occupied-slots.reader';

/** A booking as the contract needs it: who, when, what blocks and its status. */
export interface SeedOccupancy {
  professionalId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** Slot start times the booking blocks. */
  slots: string[];
  status: 'confirmed' | 'cancelled';
  /** Where it happens; absent on legacy bookings. */
  location?: { id: string; name: string };
  /** The services performed back to back (default: one). */
  serviceIds?: string[];
}

/** What the contract needs from the adapter under test, on a store without bookings. */
export interface OccupiedSlotsFixture {
  reader: OccupiedSlotsReader;
  /** Stores a booking in the adapter's source, bypassing the port. */
  seed(booking: SeedOccupancy): Promise<void>;
}

const DAY = '2030-06-17';
const OTHER_DAY = '2030-06-18';

const booking = (overrides: Partial<SeedOccupancy> = {}): SeedOccupancy => ({
  professionalId: 'ana',
  date: DAY,
  slots: ['10:00'],
  status: 'confirmed',
  ...overrides,
});

/** Every slot blocked for one professional, sorted, whatever booking blocks it. */
const blocked = (found: OccupiedBooking[], professionalId: string): string[] =>
  found
    .filter((b) => b.professionalId === professionalId)
    .flatMap((b) => b.slots)
    .sort();

/**
 * Behavior every OccupiedSlotsReader adapter must honor. The adapter reads
 * wherever bookings live; the fixture seeds that source.
 */
export function describeOccupiedSlotsReaderContract(
  name: string,
  factory: () => Promise<OccupiedSlotsFixture>,
): void {
  describe(`OccupiedSlotsReader contract: ${name}`, () => {
    let fixture: OccupiedSlotsFixture;

    beforeEach(async () => {
      fixture = await factory();
    });

    it('answers nothing without bookings', async () => {
      await expect(fixture.reader.findOccupied(DAY, ['ana'])).resolves.toEqual(
        [],
      );
    });

    it('answers the slots of a confirmed booking, with its professional', async () => {
      await fixture.seed(booking({ slots: ['10:00', '10:30'] }));

      await expect(fixture.reader.findOccupied(DAY, ['ana'])).resolves.toEqual([
        { professionalId: 'ana', slots: ['10:00', '10:30'] },
      ]);
    });

    it('answers only the date asked', async () => {
      await fixture.seed(booking({ date: OTHER_DAY, slots: ['09:00'] }));
      await fixture.seed(booking({ slots: ['11:00'] }));

      const found = await fixture.reader.findOccupied(DAY, ['ana']);

      expect(blocked(found, 'ana')).toEqual(['11:00']);
    });

    it('answers only the professionals asked', async () => {
      await fixture.seed(booking({ professionalId: 'ana', slots: ['10:00'] }));
      await fixture.seed(booking({ professionalId: 'beto', slots: ['11:00'] }));
      await fixture.seed(booking({ professionalId: 'cris', slots: ['12:00'] }));

      const found = await fixture.reader.findOccupied(DAY, ['ana', 'beto']);

      expect(blocked(found, 'ana')).toEqual(['10:00']);
      expect(blocked(found, 'beto')).toEqual(['11:00']);
      expect(blocked(found, 'cris')).toEqual([]);
    });

    it('answers nothing for no professionals', async () => {
      await fixture.seed(booking());

      await expect(fixture.reader.findOccupied(DAY, [])).resolves.toEqual([]);
    });

    it('does not count cancelled bookings as occupied', async () => {
      await fixture.seed(booking({ status: 'cancelled', slots: ['10:00'] }));
      await fixture.seed(booking({ status: 'confirmed', slots: ['11:00'] }));

      const found = await fixture.reader.findOccupied(DAY, ['ana']);

      expect(blocked(found, 'ana')).toEqual(['11:00']);
    });

    it('the same professional at two locations occupies the same blocks', async () => {
      await fixture.seed(
        booking({
          slots: ['10:00'],
          location: { id: 'principal', name: 'Principal' },
        }),
      );
      await fixture.seed(
        booking({
          slots: ['12:00'],
          location: { id: 'centro', name: 'Centro' },
        }),
      );
      await fixture.seed(booking({ slots: ['14:00'] })); // legacy: no location

      const found = await fixture.reader.findOccupied(DAY, ['ana']);

      expect(blocked(found, 'ana')).toEqual(['10:00', '12:00', '14:00']);
    });

    it('a multi-service booking occupies every one of its blocks', async () => {
      await fixture.seed(
        booking({
          serviceIds: ['corte', 'barba', 'tinte'],
          slots: ['10:00', '10:30', '11:00', '11:30'],
        }),
      );

      const found = await fixture.reader.findOccupied(DAY, ['ana']);

      expect(found).toEqual([
        { professionalId: 'ana', slots: ['10:00', '10:30', '11:00', '11:30'] },
      ]);
    });
  });
}
