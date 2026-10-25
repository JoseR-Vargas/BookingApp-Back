import { ConversationStateSchema } from './conversation-state.schema';
import { ProcessedMessageSchema } from './processed-message.schema';

type IndexDef = [Record<string, unknown>, Record<string, unknown>];

const indexes = (schema: { indexes(): unknown[] }) =>
  schema.indexes() as IndexDef[];

describe('WhatsApp schemas', () => {
  it('ProcessedMessage has a unique messageId and a 48h TTL on createdAt', () => {
    expect(indexes(ProcessedMessageSchema)).toEqual(
      expect.arrayContaining([
        [{ messageId: 1 }, expect.objectContaining({ unique: true })],
        [
          { createdAt: 1 },
          expect.objectContaining({ expireAfterSeconds: 172800 }),
        ],
      ]),
    );
  });

  it('ConversationState has a unique phone and a 24h TTL on updatedAt', () => {
    expect(indexes(ConversationStateSchema)).toEqual(
      expect.arrayContaining([
        [{ phone: 1 }, expect.objectContaining({ unique: true })],
        [
          { updatedAt: 1 },
          expect.objectContaining({ expireAfterSeconds: 86400 }),
        ],
      ]),
    );
  });
});
