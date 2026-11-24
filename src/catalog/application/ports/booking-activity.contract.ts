import { BookingActivity } from './booking-activity.port';

/** A booking as the contract needs it: who, what, when and its status. */
export interface SeedBooking {
  professionalId: string;
  serviceIds: string[];
  /** 'YYYY-MM-DD' */
  date: string;
  status: 'confirmed' | 'cancelled';
}

/** What the contract needs from the adapter under test, on a store without bookings. */
export interface BookingActivityFixture {
  activity: BookingActivity;
  /** Stores a booking in the adapter's source, bypassing the port. */
  seed(booking: SeedBooking): Promise<void>;
}

const TODAY = '2030-06-15';
const PAST = '2030-06-14';
const FUTURE = '2030-06-16';

const booking = (overrides: Partial<SeedBooking> = {}): SeedBooking => ({
  professionalId: 'ana',
  serviceIds: ['corte'],
  date: FUTURE,
  status: 'confirmed',
  ...overrides,
});

/**
 * Behavior every BookingActivity adapter must honor. The adapter reads
 * wherever bookings live; the fixture seeds that source.
 */
export function describeBookingActivityContract(
  name: string,
  factory: () => Promise<BookingActivityFixture>,
): void {
  describe(`BookingActivity contract: ${name}`, () => {
    let fixture: BookingActivityFixture;

    beforeEach(async () => {
      fixture = await factory();
    });

    describe('professionals', () => {
      it('counts nothing without bookings', async () => {
        const { activity } = fixture;
        await expect(
          activity.countUpcomingConfirmed('ana', TODAY),
        ).resolves.toBe(0);
        await expect(activity.hasAny('ana')).resolves.toBe(false);
      });

      it('counts the confirmed bookings from today on, today included', async () => {
        await fixture.seed(booking({ date: TODAY }));
        await fixture.seed(booking({ date: FUTURE }));
        await fixture.seed(booking({ date: '2999-01-01' }));
        await expect(
          fixture.activity.countUpcomingConfirmed('ana', TODAY),
        ).resolves.toBe(3);
      });

      it('ignores past bookings, cancelled ones and other professionals', async () => {
        await fixture.seed(booking({ date: PAST }));
        await fixture.seed(booking({ status: 'cancelled' }));
        await fixture.seed(booking({ professionalId: 'luis' }));
        await expect(
          fixture.activity.countUpcomingConfirmed('ana', TODAY),
        ).resolves.toBe(0);
      });

      it('hasAny is true for any booking, of any status or date', async () => {
        await fixture.seed(booking({ date: PAST, status: 'cancelled' }));
        await expect(fixture.activity.hasAny('ana')).resolves.toBe(true);
        await expect(fixture.activity.hasAny('luis')).resolves.toBe(false);
      });

      it('treats an odd id as plain text', async () => {
        await fixture.seed(booking());
        await expect(
          fixture.activity.countUpcomingConfirmed('$ne', TODAY),
        ).resolves.toBe(0);
        await expect(fixture.activity.hasAny('$ne')).resolves.toBe(false);
      });
    });

    describe('services', () => {
      it('counts nothing without bookings', async () => {
        await expect(
          fixture.activity.countUpcomingConfirmedForService('corte', TODAY),
        ).resolves.toBe(0);
        await expect(fixture.activity.hasAnyForService('corte')).resolves.toBe(
          false,
        );
      });

      it('counts the confirmed bookings from today on that include the service', async () => {
        await fixture.seed(booking({ date: TODAY }));
        await fixture.seed(
          booking({ date: FUTURE, serviceIds: ['tinte', 'corte'] }),
        );
        await fixture.seed(booking({ professionalId: 'luis' }));
        await expect(
          fixture.activity.countUpcomingConfirmedForService('corte', TODAY),
        ).resolves.toBe(3);
      });

      it('counts a booking that lists the service twice once', async () => {
        await fixture.seed(booking({ serviceIds: ['corte', 'corte'] }));
        await expect(
          fixture.activity.countUpcomingConfirmedForService('corte', TODAY),
        ).resolves.toBe(1);
      });

      it('ignores past bookings, cancelled ones and other services', async () => {
        await fixture.seed(booking({ date: PAST }));
        await fixture.seed(booking({ status: 'cancelled' }));
        await fixture.seed(booking({ serviceIds: ['tinte'] }));
        await expect(
          fixture.activity.countUpcomingConfirmedForService('corte', TODAY),
        ).resolves.toBe(0);
      });

      it('hasAnyForService is true for any booking, of any status or date', async () => {
        await fixture.seed(booking({ date: PAST, status: 'cancelled' }));
        await expect(fixture.activity.hasAnyForService('corte')).resolves.toBe(
          true,
        );
        await expect(fixture.activity.hasAnyForService('tinte')).resolves.toBe(
          false,
        );
      });
    });
  });
}
