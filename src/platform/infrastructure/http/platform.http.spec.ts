// The API of the owner of the system (spec 25) over the in-memory adapters:
// the routes, the shape of the answers and the key that opens them.
import { Controller, Get, UseGuards } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { configureApp } from '../../../main';
import { PlatformBusinessReader } from '../../application/platform-business-reader';
import { PLATFORM_CREDENTIALS } from '../../application/ports/platform-credentials.port';
import { ChangePlanUseCase } from '../../application/use-cases/change-plan.use-case';
import { DeleteBusinessUseCase } from '../../application/use-cases/delete-business.use-case';
import { ExtendTrialUseCase } from '../../application/use-cases/extend-trial.use-case';
import { GetBusinessDetailUseCase } from '../../application/use-cases/get-business-detail.use-case';
import { GetPlatformMetricsUseCase } from '../../application/use-cases/get-platform-metrics.use-case';
import { ListBusinessesUseCase } from '../../application/use-cases/list-businesses.use-case';
import { ReactivateBusinessUseCase } from '../../application/use-cases/reactivate-business.use-case';
import { SuspendBusinessUseCase } from '../../application/use-cases/suspend-business.use-case';
import { EnvPlatformCredentials } from '../credentials/env-platform-credentials';
import { PlatformKeyGuard } from './platform-key.guard';
import { PlatformMetricsController } from './platform-metrics.controller';
import { PlatformTenantActionsController } from './platform-tenant-actions.controller';
import { PlatformTenantsController } from './platform-tenants.controller';
import {
  IN_TWO_DAYS,
  aSubscription,
  aTenant,
  buildPlatform,
} from '../../platform.testing';

/** A route of a business, to check that the platform key does not open it. */
@Controller('admin/probe')
@UseGuards(AdminKeyGuard)
class AdminProbeController {
  @Get()
  probe(): { ok: boolean } {
    return { ok: true };
  }
}

describe('the platform API (spec 25)', () => {
  let app: NestExpressApplication;
  let fakes: ReturnType<typeof buildPlatform>;

  let savedPlatformKey: string | undefined;
  let savedAdminKey: string | undefined;

  beforeAll(() => {
    savedPlatformKey = process.env.PLATFORM_API_KEY;
    savedAdminKey = process.env.ADMIN_API_KEY;
    process.env.PLATFORM_API_KEY = 'platform-key-of-the-owner';
    process.env.ADMIN_API_KEY = 'admin-key-of-a-business';
  });

  afterAll(() => {
    if (savedPlatformKey === undefined) delete process.env.PLATFORM_API_KEY;
    else process.env.PLATFORM_API_KEY = savedPlatformKey;
    if (savedAdminKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = savedAdminKey;
  });

  beforeEach(async () => {
    fakes = buildPlatform();
    const reader = new PlatformBusinessReader(
      fakes.tenants,
      fakes.subscriptions,
      fakes.usage,
      fakes.clock,
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [
        PlatformTenantsController,
        PlatformTenantActionsController,
        PlatformMetricsController,
        AdminProbeController,
      ],
      providers: [
        { provide: PLATFORM_CREDENTIALS, useClass: EnvPlatformCredentials },
        PlatformKeyGuard,
        { provide: PlatformBusinessReader, useValue: reader },
        {
          provide: ListBusinessesUseCase,
          useValue: new ListBusinessesUseCase(reader),
        },
        {
          provide: GetBusinessDetailUseCase,
          useValue: new GetBusinessDetailUseCase(
            reader,
            fakes.usage,
            fakes.clock,
          ),
        },
        {
          provide: GetPlatformMetricsUseCase,
          useValue: new GetPlatformMetricsUseCase(
            reader,
            fakes.usage,
            fakes.metricsCache,
            fakes.clock,
          ),
        },
        {
          provide: SuspendBusinessUseCase,
          useValue: new SuspendBusinessUseCase(
            reader,
            fakes.lifecycle,
            fakes.tenantCache,
            fakes.audit,
          ),
        },
        {
          provide: ReactivateBusinessUseCase,
          useValue: new ReactivateBusinessUseCase(
            reader,
            fakes.lifecycle,
            fakes.tenantCache,
            fakes.audit,
            fakes.clock,
          ),
        },
        {
          provide: ExtendTrialUseCase,
          useValue: new ExtendTrialUseCase(
            reader,
            fakes.lifecycle,
            fakes.tenantCache,
            fakes.audit,
            fakes.clock,
          ),
        },
        {
          provide: ChangePlanUseCase,
          useValue: new ChangePlanUseCase(
            reader,
            fakes.admin,
            fakes.audit,
            fakes.clock,
          ),
        },
        {
          provide: DeleteBusinessUseCase,
          useValue: new DeleteBusinessUseCase(
            reader,
            fakes.eraser,
            fakes.tenantCache,
            fakes.audit,
          ),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer() as never);
  const asOwner = (req: request.Test) =>
    req.set('x-platform-key', 'platform-key-of-the-owner');

  describe('the key', () => {
    it('opens the routes of the owner with the platform key', async () => {
      const res = await asOwner(http().get('/api/platform/tenants'));

      expect(res.status).toBe(200);
    });

    it('rejects a request without a key with 401', async () => {
      const res = await http().get('/api/platform/tenants');

      expect(res.status).toBe(401);
      expect((res.body as { message: string }).message).toBe(
        'Clave de plataforma inválida o ausente.',
      );
    });

    it('does not open the platform routes with the admin key of a business', async () => {
      const res = await http()
        .get('/api/platform/tenants')
        .set('Authorization', 'Bearer admin-key-of-a-business');

      expect(res.status).toBe(401);
    });

    it('does not open the routes of a business with the platform key', async () => {
      const res = await http()
        .get('/api/admin/probe')
        .set('x-platform-key', 'platform-key-of-the-owner');

      expect(res.status).toBe(401);
    });

    it('does not open the routes of a business with the platform key as a Bearer token', async () => {
      const res = await http()
        .get('/api/admin/probe')
        .set('Authorization', 'Bearer platform-key-of-the-owner');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/platform/tenants', () => {
    it('answers the signals of every business', async () => {
      fakes.tenants.rows = [
        aTenant({ id: 'id-sur', slug: 'sur', name: 'Barbería Sur' }),
        aTenant({
          id: 'id-norte',
          slug: 'norte',
          name: 'Norte',
          trialEndsAt: IN_TWO_DAYS,
        }),
      ];
      fakes.subscriptions.rows = [
        { tenantId: 'id-sur', subscription: aSubscription('pro') },
      ];
      fakes.usage.bookings.set('id-sur', 12);
      fakes.usage.lastUse.set('id-sur', new Date('2026-11-25T09:00:00.000Z'));

      const res = await asOwner(http().get('/api/platform/tenants'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        businesses: [
          {
            id: 'id-sur',
            slug: 'sur',
            name: 'Barbería Sur',
            status: 'active',
            plan: { id: 'pro', name: 'Pro' },
            subscriptionStatus: 'active',
            trial: null,
            bookingsThisMonth: 12,
            storage: { usedBytes: 1024, quotaBytes: 52428800 },
            lastUseAt: '2026-11-25T09:00:00.000Z',
          },
          {
            id: 'id-norte',
            slug: 'norte',
            name: 'Norte',
            status: 'active',
            plan: null,
            subscriptionStatus: null,
            trial: { endsAt: '2026-11-28T10:00:00.000Z', daysLeft: 2 },
            bookingsThisMonth: 0,
            storage: { usedBytes: 1024, quotaBytes: 52428800 },
            lastUseAt: null,
          },
        ],
      });
    });

    it('never answers the data of a client', async () => {
      fakes.tenants.rows = [aTenant()];

      const res = await asOwner(http().get('/api/platform/tenants'));

      expect(JSON.stringify(res.body)).not.toContain('client');
      expect(JSON.stringify(res.body)).not.toContain('phone');
      expect(JSON.stringify(res.body)).not.toContain('email');
    });
  });

  describe('GET /api/platform/tenants/:id', () => {
    it('answers the business with its breakdown', async () => {
      fakes.tenants.rows = [aTenant()];
      fakes.usage.breakdowns.set('id-sur', {
        professionals: [{ id: 'alex', bookings: 3 }],
        services: [{ id: 'corte', bookings: 3 }],
        locations: [{ id: 'principal', bookings: 3 }],
      });
      fakes.usage.catalog.set('id-sur', {
        professionals: 2,
        services: 4,
        locations: 1,
      });

      const res = await asOwner(http().get('/api/platform/tenants/id-sur'));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        business: { id: 'id-sur', slug: 'sur' },
        breakdown: {
          professionals: [{ id: 'alex', bookings: 3 }],
          services: [{ id: 'corte', bookings: 3 }],
          locations: [{ id: 'principal', bookings: 3 }],
          catalog: { professionals: 2, services: 4, locations: 1 },
        },
      });
    });

    it('answers 404 for a business that does not exist', async () => {
      const res = await asOwner(http().get('/api/platform/tenants/nadie'));

      expect(res.status).toBe(404);
      expect((res.body as { message: string }).message).toBe(
        'Negocio no encontrado.',
      );
    });
  });

  describe('GET /api/platform/metrics', () => {
    it('answers the metrics of the installation', async () => {
      fakes.tenants.rows = [
        aTenant({ id: 'id-sur' }),
        aTenant({ id: 'id-norte', slug: 'norte', trialEndsAt: IN_TWO_DAYS }),
      ];
      fakes.subscriptions.rows = [
        { tenantId: 'id-sur', subscription: aSubscription('pro') },
      ];
      fakes.usage.bookings.set('id-sur', 4);

      const res = await asOwner(http().get('/api/platform/metrics'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        businesses: { total: 2, active: 2, inTrial: 1, suspended: 0 },
        bookings: { today: 4, thisMonth: 4 },
        estimatedRevenueByPlan: [{ planId: 'pro', subscriptions: 1 }],
        generatedAt: '2026-11-26T10:00:00.000Z',
        expiresAt: '2026-11-26T10:01:00.000Z',
      });
    });
  });

  describe('the actions of the owner', () => {
    beforeEach(() => {
      fakes.tenants.rows = [
        aTenant({ id: 'id-sur', trialEndsAt: IN_TWO_DAYS }),
        aTenant({ id: 'id-norte', slug: 'norte' }),
      ];
    });

    it('suspends a business', async () => {
      const res = await asOwner(
        http().post('/api/platform/tenants/id-sur/suspend'),
      );

      expect(res.status).toBe(200);
      expect(
        (res.body as { business: { status: string } }).business.status,
      ).toBe('suspended');
    });

    it('refuses to suspend the only business that answers', async () => {
      fakes.tenants.rows = [aTenant({ id: 'id-sur' })];

      const res = await asOwner(
        http().post('/api/platform/tenants/id-sur/suspend'),
      );

      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        'No se puede suspender el único negocio activo del sistema.',
      );
    });

    it('reactivates a business', async () => {
      fakes.tenants.rows[0].status = 'suspended';

      const res = await asOwner(
        http().post('/api/platform/tenants/id-sur/reactivate'),
      );

      expect(res.status).toBe(200);
      expect(
        (res.body as { business: { status: string } }).business.status,
      ).toBe('active');
    });

    it('deletes a business when the slug is confirmed', async () => {
      fakes.tenants.rows = [
        aTenant({ id: 'id-sur', slug: 'sur' }),
        aTenant({ id: 'id-norte', slug: 'norte' }),
      ];

      const res = await asOwner(
        http()
          .delete('/api/platform/tenants/id-norte')
          .send({ confirm: 'norte' }),
      );

      expect(res.status).toBe(200);
      expect((res.body as { deleted: { slug: string } }).deleted.slug).toBe(
        'norte',
      );
      expect(fakes.eraser.calls).toEqual([{ tenantId: 'id-norte' }]);
    });

    it('refuses a deletion without the confirmation of the slug', async () => {
      fakes.tenants.rows = [
        aTenant({ id: 'id-sur', slug: 'sur' }),
        aTenant({ id: 'id-norte', slug: 'norte' }),
      ];

      const res = await asOwner(
        http()
          .delete('/api/platform/tenants/id-norte')
          .send({ confirm: 'sur' }),
      );

      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain(
        'Confirmá la eliminación',
      );
      expect(fakes.eraser.calls).toEqual([]);
    });

    it('refuses to delete the business that answers when the request names none', async () => {
      fakes.tenants.rows = [
        aTenant({ id: 'id-main', slug: 'principal', isDefault: true }),
        aTenant({ id: 'id-norte', slug: 'norte' }),
      ];

      const res = await asOwner(
        http()
          .delete('/api/platform/tenants/id-main')
          .send({ confirm: 'principal' }),
      );

      expect(res.status).toBe(409);
      expect((res.body as { message: string }).message).toBe(
        'No se puede eliminar el negocio principal del sistema.',
      );
    });

    it('extends the trial of a business', async () => {
      const res = await asOwner(
        http().post('/api/platform/tenants/id-sur/trial').send({ days: 7 }),
      );

      expect(res.status).toBe(200);
      expect(
        (res.body as { business: { trial: { endsAt: string } } }).business.trial
          .endsAt,
      ).toBe('2026-12-05T10:00:00.000Z');
    });

    it('refuses days that are not a whole number of days in range', async () => {
      const res = await asOwner(
        http().post('/api/platform/tenants/id-sur/trial').send({ days: 0 }),
      );

      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe(
        'Los días de la prueba deben ser un número entero entre 1 y 365.',
      );
    });

    it('changes the plan of a business by hand', async () => {
      fakes.subscriptions.rows = [
        { tenantId: 'id-sur', subscription: aSubscription('gratis') },
      ];

      const res = await asOwner(
        http()
          .post('/api/platform/tenants/id-sur/plan')
          .send({ planId: 'pro' }),
      );

      expect(res.status).toBe(200);
      expect(
        (res.body as { business: { plan: { id: string } } }).business.plan.id,
      ).toBe('pro');
      expect(fakes.audit.entries[0]).toMatchObject({
        businessId: 'id-sur',
        action: 'change-plan',
        from: 'gratis',
        to: 'pro',
      });
    });

    it('refuses a plan that does not exist', async () => {
      const res = await asOwner(
        http()
          .post('/api/platform/tenants/id-sur/plan')
          .send({ planId: 'platino' }),
      );

      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe(
        'El plan elegido no existe.',
      );
    });
  });
});
