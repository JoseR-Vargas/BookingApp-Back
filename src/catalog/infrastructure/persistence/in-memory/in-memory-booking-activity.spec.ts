import { describeBookingActivityContract } from '../../../application/ports/booking-activity.contract';
import { InMemoryBookingActivity } from './in-memory-booking-activity';

describeBookingActivityContract('in-memory', () => {
  const activity = new InMemoryBookingActivity();
  return Promise.resolve({
    activity,
    seed: (booking) => {
      activity.seed(booking);
      return Promise.resolve();
    },
  });
});
