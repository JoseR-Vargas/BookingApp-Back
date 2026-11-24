import { ConfigModule } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Booking } from '../bookings/schemas/booking.schema';
import { BookingsModule } from '../bookings/bookings.module';
import { BookingsService } from '../bookings/bookings.service';
import { BusinessSettingsRecord } from '../catalog/schemas/business-settings.schema';
import { LocationRecord } from '../catalog/schemas/location.schema';
import { ProfessionalRecord } from '../catalog/schemas/professional.schema';
import { ServiceRecord } from '../catalog/schemas/service.schema';
import { BotHandler } from './bot/bot.handler';
import { ConversationState } from './schemas/conversation-state.schema';
import { ProcessedMessage } from './schemas/processed-message.schema';
import { AdminBookingNotifier } from './admin-booking.notifier';
import { WhatsappApiModule } from './whatsapp-api.module';
import { WhatsappMessageHandler } from './whatsapp-message.handler';
import { WhatsappModule } from './whatsapp.module';

describe('WhatsappModule wiring (no WHATSAPP_* / BUSINESS_TIMEZONE env)', () => {
  const keys = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_API_VERSION',
    'ADMIN_WHATSAPP_NUMBER',
    'WHATSAPP_ADMIN_TEMPLATE_NAME',
    'WHATSAPP_ADMIN_TEMPLATE_LANG',
    'BUSINESS_TIMEZONE',
  ];
  const saved: Record<string, string | undefined> = {};
  let moduleRef: TestingModule;

  beforeAll(async () => {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    // Mongoose models are mocked so no database connection is needed.
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        WhatsappModule,
      ],
    })
      .overrideProvider(getModelToken(Booking.name))
      .useValue({})
      .overrideProvider(getModelToken(ProcessedMessage.name))
      .useValue({})
      .overrideProvider(getModelToken(ConversationState.name))
      .useValue({})
      .overrideProvider(getModelToken(ProfessionalRecord.name))
      .useValue({})
      .overrideProvider(getModelToken(ServiceRecord.name))
      .useValue({})
      .overrideProvider(getModelToken(BusinessSettingsRecord.name))
      .useValue({})
      .overrideProvider(getModelToken(LocationRecord.name))
      .useValue({})
      .compile();
  }, 30000);

  afterAll(async () => {
    await moduleRef?.close();
    for (const key of keys) {
      if (saved[key] !== undefined) process.env[key] = saved[key];
    }
  });

  it('boots and uses the bot as the inbound message handler', () => {
    const handler = moduleRef.get(WhatsappMessageHandler);
    expect(handler).toBeInstanceOf(BotHandler);
  });

  it('resolves the real BookingsService the bot books with', () => {
    expect(moduleRef.get(BookingsService, { strict: false })).toBeInstanceOf(
      BookingsService,
    );
  });

  it('injects the admin notifier into BookingsService', () => {
    const bookings = moduleRef.get(BookingsService, { strict: false });
    const notifier = moduleRef.get(AdminBookingNotifier, { strict: false });

    expect(
      (bookings as unknown as { adminNotifier: unknown }).adminNotifier,
    ).toBe(notifier);
  });

  it('keeps BookingsModule free of WhatsappModule (no circular import)', () => {
    const imports = Reflect.getMetadata('imports', BookingsModule) as unknown[];

    expect(imports).toContain(WhatsappApiModule);
    expect(imports).not.toContain(WhatsappModule);
  });
});
