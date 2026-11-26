import { BookingSchema } from '../../bookings/schemas/booking.schema';
import {
  CONVERSATION_STATE_TTL_SECONDS,
  ConversationStateSchema,
} from './conversation-state.schema';
import {
  PROCESSED_MESSAGE_TTL_SECONDS,
  ProcessedMessageSchema,
} from './processed-message.schema';

/** Spec 22: the bot collections never keep a document more than 90 days. */
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

const ttlOf = (schema: { indexes(): unknown[] }) =>
  (
    schema.indexes() as [
      Record<string, number>,
      { expireAfterSeconds?: number },
    ][]
  )
    .filter(([, options]) => options.expireAfterSeconds !== undefined)
    .map(([key, options]) => [key, options.expireAfterSeconds]);

describe('bot data retention (spec 22)', () => {
  it('forgets processed messages and conversations well before 90 days', () => {
    expect(PROCESSED_MESSAGE_TTL_SECONDS).toBeLessThanOrEqual(
      NINETY_DAYS_SECONDS,
    );
    expect(CONVERSATION_STATE_TTL_SECONDS).toBeLessThanOrEqual(
      NINETY_DAYS_SECONDS,
    );
    expect(ttlOf(ProcessedMessageSchema)).toEqual([
      [{ createdAt: 1 }, PROCESSED_MESSAGE_TTL_SECONDS],
    ]);
    expect(ttlOf(ConversationStateSchema)).toEqual([
      [{ updatedAt: 1 }, CONVERSATION_STATE_TTL_SECONDS],
    ]);
  });

  it('never expires a booking', () => {
    expect(ttlOf(BookingSchema)).toEqual([]);
  });
});
