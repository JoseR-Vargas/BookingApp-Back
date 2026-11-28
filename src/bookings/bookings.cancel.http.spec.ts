import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Provider } from '@nestjs/common';
import * as request from 'supertest';
import { BookingsController } from './infrastructure/http/bookings.controller';
import { buildBookings, businessClock } from './bookings.testing';
import { BlockAlreadyTaken } from './domain/booking.errors';

/** Routing and status codes of the public cancel endpoints, over real HTTP. */
describe('Booking cancel HTTP contract', () => {
  // Buenos Aires is UTC-3: a 10:00 booking starts at 13:00:00Z.
  const ZONE = 'America/Argentina/Buenos_Aires';
  const TOKEN = 'a'.repeat(43);
  const ID = '507f1f77bcf86cd799439011';

  let app: INestApplication;
  let savedZone: string | undefined;
  let bookings: ReturnType<typeof buildBookings>;

  const moduleWith = (overrides: Record<string, unknown>) =>
    Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: bookings.create.constructor, useValue: bookings.create },
        { provide: bookings.list.constructor, useValue: bookings.list },
        {
          provide: bookings.listRecentIds.constructor,
          useValue: bookings.listRecentIds,
        },
        { provide: bookings.get.constructor, useValue: bookings.get },
        { provide: bookings.update.constructor, useValue: bookings.update },
        { provide: bookings.remove.constructor, useValue: bookings.remove },
        {
          provide: bookings.getCancellation.constructor,
          useValue: bookings.getCancellation,
        },
        {
          provide: bookings.cancel.constructor,
          useValue: bookings.cancel,
        },
        {
          provide: bookings.checkSlot.constructor,
          useValue: bookings.checkSlot,
        },
        {
          provide: bookings.statistics.constructor,
          useValue: bookings.statistics,
        },
        ...(Object.entries(overrides) as unknown as Provider[]),
      ],
    });

  const start = async (overrides: Record<string, unknown> = {}) => {
    const moduleRef = await moduleWith(overrides).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BUSINESS_TIMEZONE = ZONE;
    bookings = buildBookings({ clock: businessClock('2999-01-05', '09:00') });
  });

  afterEach(async () => {
    await app?.close();
  });

  afterAll(() => {
    if (savedZone === undefined) delete process.env.BUSINESS_TIMEZONE;
    else process.env.BUSINESS_TIMEZONE = savedZone;
  });

  const seed = async (overrides: Record<string, unknown> = {}) => {
    await bookings.repository.create(
      {
        client: {
          name: 'Juan Pérez',
          email: 'juan@example.com',
          phone: '1234567890',
        },
        services: [
          {
            id: 'servicio-basico',
            name: 'Servicio Básico',
            price: 1,
            duration: 60,
          },
        ],
        totalPrice: 1,
        totalDuration: 60,
        professional: { id: 'alex-garcia', name: 'Alex García' },
        location: { id: 'principal', name: 'Principal' },
        date: '2999-01-05',
        time: '10:00',
        slots: ['10:00', '10:30'],
        notes: '',
        status: 'confirmed',
        ...overrides,
      },
      bookings.tokens.hash(TOKEN),
      new BlockAlreadyTaken('Alex García', '2999-01-05', '10:00'),
    );
  };

  it('GET /api/bookings/cancel/:token answers the summary, not the :id route', async () => {
    await seed();
    await start();

    const response = await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${TOKEN}`)
      .expect(200);

    expect(response.body).toEqual({
      state: 'cancellable',
      services: [{ name: 'Servicio Básico' }],
      professional: { name: 'Alex García' },
      date: '2999-01-05',
      time: '10:00',
    });
  });

  it('never exposes client data', async () => {
    await seed();
    await start();

    const response = await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${TOKEN}`)
      .expect(200);

    const text = JSON.stringify(response.body);
    expect(text).not.toContain('Juan');
    expect(text).not.toContain('juan@example.com');
    expect(text).not.toContain('1234567890');
    expect(text).not.toContain(ID);
  });

  it('POST /api/bookings/cancel/:token cancels and answers 200 (not 201)', async () => {
    await seed();
    await start();

    const response = await request(app.getHttpServer())
      .post(`/api/bookings/cancel/${TOKEN}`)
      .expect(200);

    expect(response.body.state).toBe('cancelled');
    expect(bookings.notifier.cancelled_).toHaveLength(1);
  });

  it('answers 404 for an unknown or malformed token', async () => {
    await start();

    await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${TOKEN}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/bookings/cancel/${TOKEN}`)
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/bookings/cancel/not-a-token')
      .expect(404);
  });

  it('answers 409 on POST once the cutoff has passed, while GET reports closed', async () => {
    bookings = buildBookings({ clock: businessClock('2020-01-02', '09:00') });
    await seed({ date: '2020-01-01' });
    await start();

    await request(app.getHttpServer())
      .post(`/api/bookings/cancel/${TOKEN}`)
      .expect(409);
    const response = await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${TOKEN}`)
      .expect(200);
    expect(response.body.state).toBe('closed');
    expect(bookings.notifier.cancelled_).toHaveLength(0);
  });

  it('answers 503 when the business timezone is unknown', async () => {
    bookings = buildBookings({
      clock: { now: () => ({ today: '2020-01-02', time: null }) },
    });
    await seed();
    await start();

    await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${TOKEN}`)
      .expect(503);
    await request(app.getHttpServer())
      .post(`/api/bookings/cancel/${TOKEN}`)
      .expect(503);
  });
});
