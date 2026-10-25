import { parseWebhookPayload } from './whatsapp.payload.parser';

const wrap = (value: unknown) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value }] }],
});

const contacts = [{ wa_id: '5491100000000', profile: { name: 'Ana' } }];

describe('parseWebhookPayload', () => {
  it('parses a text message with the contact profile name', () => {
    const result = parseWebhookPayload(
      wrap({
        contacts,
        messages: [
          {
            id: 'wamid.1',
            from: '5491100000000',
            timestamp: '1760000000',
            type: 'text',
            text: { body: 'hola' },
          },
        ],
      }),
    );

    expect(result).toEqual([
      {
        messageId: 'wamid.1',
        from: '5491100000000',
        profileName: 'Ana',
        timestamp: 1760000000,
        type: 'text',
        text: 'hola',
      },
    ]);
  });

  it('parses a button reply', () => {
    const [message] = parseWebhookPayload(
      wrap({
        contacts,
        messages: [
          {
            id: 'wamid.2',
            from: '5491100000000',
            timestamp: '1760000001',
            type: 'interactive',
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'confirm', title: 'Confirmar' },
            },
          },
        ],
      }),
    );

    expect(message).toMatchObject({
      messageId: 'wamid.2',
      type: 'interactive_reply',
      replyId: 'confirm',
      replyTitle: 'Confirmar',
    });
    expect(message.text).toBeUndefined();
  });

  it('parses a list reply', () => {
    const [message] = parseWebhookPayload(
      wrap({
        messages: [
          {
            id: 'wamid.3',
            from: '549',
            timestamp: '1',
            type: 'interactive',
            interactive: {
              type: 'list_reply',
              list_reply: { id: 'svc-1', title: 'Corte', description: 'x' },
            },
          },
        ],
      }),
    );

    expect(message).toMatchObject({
      type: 'interactive_reply',
      replyId: 'svc-1',
      replyTitle: 'Corte',
    });
    expect(message.profileName).toBeUndefined();
  });

  it('marks other message types as unsupported', () => {
    const [message] = parseWebhookPayload(
      wrap({
        messages: [
          { id: 'wamid.4', from: '549', timestamp: '1', type: 'image' },
        ],
      }),
    );

    expect(message).toMatchObject({
      messageId: 'wamid.4',
      type: 'unsupported',
    });
  });

  it('marks an interactive message without a usable reply as unsupported', () => {
    const [message] = parseWebhookPayload(
      wrap({
        messages: [
          {
            id: 'wamid.5',
            from: '549',
            timestamp: '1',
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 5 } },
          },
        ],
      }),
    );

    expect(message.type).toBe('unsupported');
  });

  it('ignores status updates without error', () => {
    expect(
      parseWebhookPayload(
        wrap({ statuses: [{ id: 'wamid.9', status: 'delivered' }] }),
      ),
    ).toEqual([]);
  });

  it('collects messages across several entries and changes', () => {
    const message = (id: string) => ({
      id,
      from: '549',
      timestamp: '1',
      type: 'text',
      text: { body: id },
    });
    const result = parseWebhookPayload({
      entry: [
        {
          changes: [
            { value: { messages: [message('a'), message('b')] } },
            { value: { messages: [message('c')] } },
          ],
        },
        { changes: [{ value: { messages: [message('d')] } }] },
      ],
    });

    expect(result.map((m) => m.messageId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('skips messages without id or sender and tolerates a bad timestamp', () => {
    const result = parseWebhookPayload(
      wrap({
        messages: [
          { from: '549', type: 'text', text: { body: 'no id' } },
          { id: 'wamid.6', type: 'text', text: { body: 'no from' } },
          null,
          'junk',
          {
            id: 'wamid.7',
            from: '549',
            timestamp: 'not-a-number',
            type: 'text',
            text: { body: 'ok' },
          },
        ],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe('wamid.7');
    expect(Number.isFinite(result[0].timestamp)).toBe(true);
  });

  it.each([
    undefined,
    null,
    'text',
    42,
    [],
    {},
    { entry: 'x' },
    { entry: [null, 1, {}] },
    { entry: [{ changes: 'x' }] },
    { entry: [{ changes: [{ value: null }] }] },
    { entry: [{ changes: [{ value: { messages: 'x', contacts: 'y' } }] }] },
  ])('returns an empty list for odd payload %p', (payload) => {
    expect(parseWebhookPayload(payload)).toEqual([]);
  });
});
