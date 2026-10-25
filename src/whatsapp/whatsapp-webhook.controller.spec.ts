import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { ProcessedMessageService } from './processed-message.service';
import { InboundMessage } from './whatsapp.types';
import { WhatsappConfig } from './whatsapp.config';
import { WhatsappMessageHandler } from './whatsapp-message.handler';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

const APP_SECRET = 'app-secret';
const VERIFY_TOKEN = 'verify-me';
const URL = '/api/webhook/whatsapp';

const sign = (raw: string, secret = APP_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

const textMessage = (id: string, body = 'hola') => ({
  id,
  from: '5491100000000',
  timestamp: '1760000000',
  type: 'text',
  text: { body },
});

const payload = (messages: unknown[] = [], extra: object = {}) =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: '5491100000000', profile: { name: 'Ana' } }],
              messages,
              ...extra,
            },
          },
        ],
      },
    ],
  });

describe('WhatsappWebhookController', () => {
  let app: INestApplication;
  const handler = { handle: jest.fn() };
  const processed = { claim: jest.fn() };

  const createApp = async (env: Record<string, string | undefined>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WhatsappWebhookController],
      providers: [
        {
          provide: WhatsappConfig,
          useValue: new WhatsappConfig({
            get: (key: string) => env[key],
          } as unknown as ConfigService),
        },
        { provide: ProcessedMessageService, useValue: processed },
        { provide: WhatsappMessageHandler, useValue: handler },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
    return app;
  };

  const post = (raw: string, signature?: string) => {
    const req = request(app.getHttpServer() as App)
      .post(URL)
      .set('Content-Type', 'application/json');
    if (signature) req.set('X-Hub-Signature-256', signature);
    return req.send(raw);
  };

  beforeEach(() => {
    jest.resetAllMocks();
    processed.claim.mockResolvedValue(true);
    handler.handle.mockResolvedValue(undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  describe('GET verification', () => {
    const verify = (query: Record<string, string>) =>
      request(app.getHttpServer() as App)
        .get(URL)
        .query(query);

    it('echoes the challenge as plain text when the token matches', async () => {
      await createApp({ WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN });

      const res = await verify({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '1158201444',
      }).expect(200);

      expect(res.text).toBe('1158201444');
      expect(res.headers['content-type']).toMatch(/text\/plain/);
    });

    it.each([
      [
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong',
          'hub.challenge': '1',
        },
      ],
      [
        {
          'hub.mode': 'unsubscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': '1',
        },
      ],
      [{ 'hub.mode': 'subscribe', 'hub.challenge': '1' }],
      [{ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN }],
      [{}],
    ])('responds 403 for %p', async (query) => {
      await createApp({ WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN });

      await verify(query as Record<string, string>).expect(403);
    });

    it('responds 403 when WHATSAPP_VERIFY_TOKEN is not configured', async () => {
      await createApp({});

      await verify({
        'hub.mode': 'subscribe',
        'hub.verify_token': '',
        'hub.challenge': '1',
      }).expect(403);
      await verify({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'undefined',
        'hub.challenge': '1',
      }).expect(403);
    });
  });

  describe('POST inbound messages', () => {
    it('responds 401 when WHATSAPP_APP_SECRET is not configured', async () => {
      await createApp({});
      const raw = payload([textMessage('wamid.1')]);

      await post(raw, sign(raw)).expect(401);
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('responds 401 when the signature header is missing', async () => {
      await createApp({ WHATSAPP_APP_SECRET: APP_SECRET });

      await post(payload([textMessage('wamid.1')])).expect(401);
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('responds 401 for a malformed or mismatching signature', async () => {
      await createApp({ WHATSAPP_APP_SECRET: APP_SECRET });
      const raw = payload([textMessage('wamid.1')]);

      await post(raw, 'sha256=nothex').expect(401);
      await post(raw, sign(raw, 'other-secret')).expect(401);
      await post(raw, sign(raw + ' ')).expect(401);
      expect(processed.claim).not.toHaveBeenCalled();
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('verifies the signature against the raw bytes, not re-serialized JSON', async () => {
      await createApp({ WHATSAPP_APP_SECRET: APP_SECRET });
      const raw = payload([textMessage('wamid.1')]).replace(/,/g, ', ');

      await post(raw, sign(raw)).expect(200);
      expect(handler.handle).toHaveBeenCalledTimes(1);
    });

    it('hands each normalized, non-duplicate message to the handler', async () => {
      await createApp({ WHATSAPP_APP_SECRET: APP_SECRET });
      processed.claim.mockImplementation((id: string) =>
        Promise.resolve(id !== 'dup'),
      );
      const raw = payload([
        textMessage('wamid.1', 'hola'),
        textMessage('dup'),
        textMessage('wamid.2', 'chau'),
      ]);

      await post(raw, sign(raw)).expect(200);

      const handled = handler.handle.mock.calls.map(
        ([m]: [InboundMessage]) => m,
      );
      expect(handled).toEqual([
        {
          messageId: 'wamid.1',
          from: '5491100000000',
          profileName: 'Ana',
          timestamp: 1760000000,
          type: 'text',
          text: 'hola',
        },
        expect.objectContaining({ messageId: 'wamid.2', text: 'chau' }),
      ]);
      expect(processed.claim).toHaveBeenCalledTimes(3);
    });

    it('isolates handler failures per message and still responds 200', async () => {
      await createApp({ WHATSAPP_APP_SECRET: APP_SECRET });
      handler.handle
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);
      const raw = payload([textMessage('wamid.1'), textMessage('wamid.2')]);

      await post(raw, sign(raw)).expect(200);
      expect(handler.handle).toHaveBeenCalledTimes(2);
    });

    it('still responds 200 when idempotency storage fails', async () => {
      await createApp({ WHATSAPP_APP_SECRET: APP_SECRET });
      processed.claim.mockRejectedValue(new Error('mongo down'));
      const raw = payload([textMessage('wamid.1')]);

      await post(raw, sign(raw)).expect(200);
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('acknowledges status updates without invoking the handler', async () => {
      await createApp({ WHATSAPP_APP_SECRET: APP_SECRET });
      const raw = payload([], {
        statuses: [{ id: 'wamid.9', status: 'sent' }],
      });

      await post(raw, sign(raw)).expect(200);
      expect(processed.claim).not.toHaveBeenCalled();
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it.each(['{"entry":"nope"}', '[]', '{}'])(
      'never 5xx on a validly signed odd payload %p',
      async (raw) => {
        await createApp({ WHATSAPP_APP_SECRET: APP_SECRET });

        await post(raw, sign(raw)).expect(200);
        expect(handler.handle).not.toHaveBeenCalled();
      },
    );
  });
});
