import { Connection } from 'mongoose';
import { connectTestMongo } from '../../shared/testing/mongo-test-connection';
import { ConversationStateSchema } from './conversation-state.schema';
import { ProcessedMessageSchema } from './processed-message.schema';

/**
 * The TTL monitor of Mongo runs every 60 s, so a test that waits for a
 * deleted document would be slow and flaky: this checks that the real
 * database holds the TTL indexes (`listIndexes`), which is what deletes them.
 */
describe('bot collections have a TTL index (integration)', () => {
  let connection: Connection;
  beforeAll(async () => {
    connection = await connectTestMongo();
  });
  afterAll(() => connection.close());

  const ttlIndexes = async (collection: string) => {
    const indexes = await connection
      .collection(collection)
      .listIndexes()
      .toArray()
      .catch(() => [] as { expireAfterSeconds?: number }[]); // a collection that does not exist has no indexes
    return indexes.filter((index) => index.expireAfterSeconds !== undefined);
  };

  it('processed_messages expires on createdAt and conversation_states on updatedAt', async () => {
    const processed = connection.model(
      'PM',
      ProcessedMessageSchema,
      'processed_messages',
    );
    const states = connection.model(
      'CS',
      ConversationStateSchema,
      'conversation_states',
    );
    await processed.init();
    await states.init();

    expect(await ttlIndexes('processed_messages')).toEqual([
      expect.objectContaining({
        key: { createdAt: 1 },
        expireAfterSeconds: 172800,
      }),
    ]);
    expect(await ttlIndexes('conversation_states')).toEqual([
      expect.objectContaining({
        key: { updatedAt: 1 },
        expireAfterSeconds: 86400,
      }),
    ]);
    expect(await ttlIndexes('bookings')).toEqual([]);
  });
});
