import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdminBookingNotifier } from './admin-booking.notifier';
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
    'ADMIN_WHATSAPP_NUMBER',
    'WHATSAPP_ADMIN_TEMPLATE_NAME',
    'WHATSAPP_ADMIN_TEMPLATE_LANG',
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

  it('exports the admin notifier, which skips quietly without any env', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        WhatsappApiModule,
      ],
    }).compile();
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const notifier = moduleRef.get(AdminBookingNotifier);

    await expect(
      notifier.notifyNewBooking({
        client: { name: 'Ana', phone: '1234567890' },
        services: [{ name: 'Servicio' }],
        professional: { name: 'Alex' },
        date: '2026-03-25',
        time: '10:00',
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
