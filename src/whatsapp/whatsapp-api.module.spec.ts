import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { WhatsappApiModule } from './whatsapp-api.module';
import { WhatsappClient } from './whatsapp.client';
import { WhatsappConfig } from './whatsapp.config';

describe('WhatsappApiModule (no WHATSAPP_* env vars)', () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_API_VERSION',
  ];

  beforeAll(() => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of keys) {
      if (saved[key] !== undefined) process.env[key] = saved[key];
    }
  });

  it('boots, resolves the exports and skips sends instead of throwing', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        WhatsappApiModule,
      ],
    }).compile();
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const config = moduleRef.get(WhatsappConfig);
    const client = moduleRef.get(WhatsappClient);

    expect(config.isSendingConfigured()).toBe(false);
    await expect(client.sendText('549', 'hi')).resolves.toEqual({
      status: 'skipped',
      reason: 'not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
