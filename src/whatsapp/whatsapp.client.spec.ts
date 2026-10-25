/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
   requests are inspected as parsed JSON of a mocked fetch */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappApiError, WhatsappClient } from './whatsapp.client';
import { WhatsappConfig } from './whatsapp.config';

const TOKEN = 'secret-access-token';

const buildClient = (env: Record<string, string | undefined>) =>
  new WhatsappClient(
    new WhatsappConfig({
      get: (key: string) => env[key],
    } as unknown as ConfigService),
  );

const configuredEnv = {
  WHATSAPP_ACCESS_TOKEN: TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: '555',
};

const okResponse = (body: unknown = { messages: [{ id: 'wamid.out' }] }) =>
  ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

describe('WhatsappClient', () => {
  let fetchMock: jest.Mock;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const lastRequest = () => {
    const [url, init] = fetchMock.mock.calls[0];
    return {
      url: url as string,
      init: init as RequestInit,
      body: JSON.parse(init.body as string),
    };
  };

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('when not configured', () => {
    it.each([
      ['sendText', (c: WhatsappClient) => c.sendText('549', 'hi')],
      [
        'sendInteractiveButtons',
        (c: WhatsappClient) =>
          c.sendInteractiveButtons('549', 'hi', [{ id: 'a', title: 'A' }]),
      ],
      [
        'sendInteractiveList',
        (c: WhatsappClient) =>
          c.sendInteractiveList('549', 'hi', 'Open', [{ id: 'a', title: 'A' }]),
      ],
      [
        'sendTemplate',
        (c: WhatsappClient) => c.sendTemplate('549', 'tpl', 'es', ['x']),
      ],
      ['markAsRead', (c: WhatsappClient) => c.markAsRead('wamid.1')],
    ])('%s is skipped without calling the API or throwing', async (_n, run) => {
      const result = await run(buildClient({}));

      expect(result).toEqual({ status: 'skipped', reason: 'not_configured' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('when configured', () => {
    const client = () => buildClient(configuredEnv);

    it('POSTs a text message with bearer auth to the versioned endpoint', async () => {
      const result = await client().sendText('549', 'hola');

      const { url, init, body } = lastRequest();
      expect(url).toBe('https://graph.facebook.com/v21.0/555/messages');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      });
      expect(body).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '549',
        type: 'text',
        text: { body: 'hola', preview_url: false },
      });
      expect(result).toEqual({ status: 'sent', messageId: 'wamid.out' });
    });

    it('uses the configured API version', async () => {
      await buildClient({
        ...configuredEnv,
        WHATSAPP_API_VERSION: 'v22.0',
      }).sendText('549', 'hola');

      expect(lastRequest().url).toBe(
        'https://graph.facebook.com/v22.0/555/messages',
      );
    });

    it('truncates the text body defensively', async () => {
      await client().sendText('549', 'x'.repeat(5000));

      expect(lastRequest().body.text.body).toHaveLength(4096);
    });

    it('builds an interactive reply-button message', async () => {
      await client().sendInteractiveButtons('549', 'Confirm?', [
        { id: 'yes', title: 'Yes' },
        { id: 'no', title: 'No' },
      ]);

      expect(lastRequest().body).toMatchObject({
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Confirm?' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'yes', title: 'Yes' } },
              { type: 'reply', reply: { id: 'no', title: 'No' } },
            ],
          },
        },
      });
    });

    it('truncates button titles to 20 chars and the body to 1024', async () => {
      await client().sendInteractiveButtons('549', 'b'.repeat(2000), [
        { id: 'a', title: 'T'.repeat(40) },
      ]);

      const { interactive } = lastRequest().body;
      expect(interactive.body.text).toHaveLength(1024);
      expect(interactive.action.buttons[0].reply.title).toHaveLength(20);
    });

    it('rejects more than 3 buttons or none, without calling the API', async () => {
      const four = [1, 2, 3, 4].map((n) => ({ id: `${n}`, title: `B${n}` }));

      await expect(
        client().sendInteractiveButtons('549', 'x', four),
      ).rejects.toBeInstanceOf(RangeError);
      await expect(
        client().sendInteractiveButtons('549', 'x', []),
      ).rejects.toBeInstanceOf(RangeError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('builds an interactive list message', async () => {
      await client().sendInteractiveList('549', 'Pick one', 'Options', [
        { id: 's1', title: 'Corte', description: '60 min' },
        { id: 's2', title: 'Barba' },
      ]);

      expect(lastRequest().body.interactive).toEqual({
        type: 'list',
        body: { text: 'Pick one' },
        action: {
          button: 'Options',
          sections: [
            {
              rows: [
                { id: 's1', title: 'Corte', description: '60 min' },
                { id: 's2', title: 'Barba' },
              ],
            },
          ],
        },
      });
    });

    it('truncates list label, titles, descriptions and body to WhatsApp limits', async () => {
      await client().sendInteractiveList(
        '549',
        'b'.repeat(2000),
        'L'.repeat(40),
        [{ id: 'a', title: 'T'.repeat(50), description: 'D'.repeat(200) }],
      );

      const { interactive } = lastRequest().body;
      expect(interactive.body.text).toHaveLength(1024);
      expect(interactive.action.button).toHaveLength(20);
      expect(interactive.action.sections[0].rows[0].title).toHaveLength(24);
      expect(interactive.action.sections[0].rows[0].description).toHaveLength(
        72,
      );
    });

    it('rejects more than 10 rows or none, without calling the API', async () => {
      const rows = Array.from({ length: 11 }, (_, i) => ({
        id: `${i}`,
        title: `R${i}`,
      }));

      await expect(
        client().sendInteractiveList('549', 'x', 'Open', rows),
      ).rejects.toBeInstanceOf(RangeError);
      await expect(
        client().sendInteractiveList('549', 'x', 'Open', []),
      ).rejects.toBeInstanceOf(RangeError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('builds a template message with body parameters', async () => {
      await client().sendTemplate('549', 'nueva_reserva', 'es', [
        'Ana',
        'line one\nline two',
      ]);

      expect(lastRequest().body).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '549',
        type: 'template',
        template: {
          name: 'nueva_reserva',
          language: { code: 'es' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'Ana' },
                { type: 'text', text: 'line one line two' },
              ],
            },
          ],
        },
      });
    });

    it('omits components for a template without parameters', async () => {
      await client().sendTemplate('549', 'hello', 'en', []);

      expect(lastRequest().body.template).toEqual({
        name: 'hello',
        language: { code: 'en' },
      });
    });

    it('marks a message as read', async () => {
      await client().markAsRead('wamid.in');

      expect(lastRequest().body).toEqual({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: 'wamid.in',
      });
    });

    it('throws a typed error with status and Meta body on non-2xx, never leaking the token', async () => {
      const metaBody = { error: { message: 'Invalid parameter', code: 100 } };
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify(metaBody)),
      } as Response);

      const error = await client()
        .sendText('549', 'hola')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(WhatsappApiError);
      const apiError = error as WhatsappApiError;
      expect(apiError.status).toBe(400);
      expect(apiError.body).toEqual(metaBody);
      expect(apiError.message).toContain('400');
      expect(apiError.message).toContain('Invalid parameter');
      expect(apiError.message).not.toContain(TOKEN);
      const logged = JSON.stringify([
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]);
      expect(logged).not.toContain(TOKEN);
    });

    it('keeps the raw text when the error body is not JSON', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
      } as Response);

      const error = (await client()
        .sendText('549', 'hola')
        .catch((e: unknown) => e)) as WhatsappApiError;

      expect(error.status).toBe(502);
      expect(error.body).toBe('Bad Gateway');
    });

    it('tolerates a 2xx response without a message id', async () => {
      fetchMock.mockResolvedValue(okResponse({}));

      await expect(client().sendText('549', 'hola')).resolves.toEqual({
        status: 'sent',
        messageId: undefined,
      });
    });
  });
});
