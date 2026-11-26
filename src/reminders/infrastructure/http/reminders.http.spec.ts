import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { ROLES_KEY } from '../../../auth/infrastructure/http/roles.decorator';
import { configureApp } from '../../../main';
import { GetReminderSettingsUseCase } from '../../application/use-cases/get-reminder-settings.use-case';
import { SaveReminderSettingsUseCase } from '../../application/use-cases/save-reminder-settings.use-case';
import { buildReminders } from '../../reminders.testing';
import { RemindersController } from './reminders.controller';

/** The controller over the in-memory adapters; the admin guard is replaced by a pass-through. */
describe('reminders HTTP (in-memory adapters)', () => {
  let app: NestExpressApplication;
  let b: ReturnType<typeof buildReminders>;

  beforeEach(async () => {
    b = buildReminders();
    const moduleRef = await Test.createTestingModule({
      controllers: [RemindersController],
      providers: [
        { provide: GetReminderSettingsUseCase, useValue: b.settings },
        { provide: SaveReminderSettingsUseCase, useValue: b.save },
      ],
    })
      .overrideGuard(AdminKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app);
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());

  it('is a route of the owner', () => {
    expect(Reflect.getMetadata(ROLES_KEY, RemindersController)).toEqual([
      'owner',
    ]);
  });

  describe('GET /api/admin/reminders', () => {
    it('answers the configuration, the plan and the counters', async () => {
      const res = await http().get('/api/admin/reminders');

      expect(res.status).toBe(200);
      const body = res.body as {
        config: {
          enabled: boolean;
          channels: string[];
          hoursBefore: number[];
          template: string;
        };
        allowsReminders: boolean;
        counters: { days: number; sent: number; failed: number };
        recent: unknown[];
      };
      expect(body.config.enabled).toBe(true);
      expect(body.config.channels).toEqual(['whatsapp', 'email']);
      expect(body.config.hoursBefore).toEqual([24, 3]);
      expect(typeof body.config.template).toBe('string');
      expect(body.allowsReminders).toBe(true);
      expect(body.counters).toEqual({ days: 30, sent: 0, failed: 0 });
      expect(body.recent).toEqual([]);
    });

    it('answers the reminders that were sent and the ones that failed', async () => {
      await b.store({ client: { name: 'Ana', phone: '099123456' } });
      await b.sendDue.execute();

      const res = await http().get('/api/admin/reminders');

      expect(res.status).toBe(200);
      expect((res.body as { counters: unknown }).counters).toEqual({
        days: 30,
        sent: 1,
        failed: 0,
      });
      expect((res.body as { recent: unknown[] }).recent).toHaveLength(1);
      expect(
        (res.body as { recent: { kind: string }[] }).recent[0],
      ).toMatchObject({
        kind: '24h',
        channel: 'whatsapp',
        ok: true,
        error: null,
        attempts: 1,
      });
    });
  });

  describe('PUT /api/admin/reminders', () => {
    it('saves the configuration and answers it', async () => {
      const res = await http()
        .put('/api/admin/reminders')
        .send({
          enabled: true,
          channels: ['whatsapp'],
          hoursBefore: [12],
          template: 'Hola {cliente}, tu cita es el {fecha} a las {hora}.',
        });

      expect(res.status).toBe(200);
      expect((res.body as { config: unknown }).config).toEqual({
        enabled: true,
        channels: ['whatsapp'],
        hoursBefore: [12],
        template: 'Hola {cliente}, tu cita es el {fecha} a las {hora}.',
      });
      expect(b.tenant.settings.channels).toEqual(['whatsapp']);
    });

    it('answers 400 when the configuration is not valid', async () => {
      const res = await http()
        .put('/api/admin/reminders')
        .send({ channels: ['sms'] });

      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain('sms');
    });
  });
});
