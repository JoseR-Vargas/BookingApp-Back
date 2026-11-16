import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CatalogService } from '../catalog/catalog.service';
import { EmailService } from '../email/email.service';
import { AdminBookingNotifier } from '../whatsapp/admin-booking.notifier';
import { BookingsController } from './bookings.controller';
import { BookingsGateway } from './bookings.gateway';
import { BookingsService } from './bookings.service';
import { generateCancelToken, hashCancelToken } from './cancellation';
import { Booking } from './schemas/booking.schema';

/** Routing and status codes of the public cancel endpoints, over real HTTP. */
describe('Booking cancel HTTP contract', () => {
  // Buenos Aires is UTC-3: a 10:00 booking starts at 13:00:00Z.
  const ZONE = 'America/Argentina/Buenos_Aires';
  const token = generateCancelToken();
  const booking = {
    _id: '507f1f77bcf86cd799439011',
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
    professional: { id: 'alex-garcia', name: 'Alex García' },
    date: '2999-01-05',
    time: '10:00',
    status: 'confirmed',
  };

  let app: INestApplication;
  let savedZone: string | undefined;
  const bookingModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
  };
  const exec = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeAll(async () => {
    savedZone = process.env.BUSINESS_TIMEZONE;
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        BookingsService,
        { provide: getModelToken(Booking.name), useValue: bookingModel },
        {
          provide: BookingsGateway,
          useValue: { notifyBookingCancelled: jest.fn() },
        },
        {
          provide: EmailService,
          useValue: { sendCancellationConfirmation: jest.fn() },
        },
        { provide: CatalogService, useValue: {} },
        { provide: AdminBookingNotifier, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BUSINESS_TIMEZONE = ZONE;
    bookingModel.findOne.mockReturnValue(exec(booking));
    bookingModel.findOneAndUpdate.mockReturnValue(
      exec({ ...booking, status: 'cancelled' }),
    );
  });

  afterAll(async () => {
    await app.close();
    if (savedZone === undefined) delete process.env.BUSINESS_TIMEZONE;
    else process.env.BUSINESS_TIMEZONE = savedZone;
  });

  it('GET /api/bookings/cancel/:token answers the summary, not the :id route', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${token}`)
      .expect(200);

    expect(response.body).toEqual({
      state: 'cancellable',
      services: [{ name: 'Servicio Básico' }],
      professional: { name: 'Alex García' },
      date: '2999-01-05',
      time: '10:00',
    });
    expect(bookingModel.findOne).toHaveBeenCalledWith({
      cancelTokenHash: hashCancelToken(token),
    });
    expect(bookingModel.findById).not.toHaveBeenCalled();
  });

  it('never exposes client data', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${token}`)
      .expect(200);

    const text = JSON.stringify(response.body);
    expect(text).not.toContain('Juan');
    expect(text).not.toContain('juan@example.com');
    expect(text).not.toContain('1234567890');
    expect(text).not.toContain(booking._id);
  });

  it('POST /api/bookings/cancel/:token cancels and answers 200 (not 201)', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/bookings/cancel/${token}`)
      .expect(200);

    expect(response.body.state).toBe('cancelled');
    expect(bookingModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('answers 404 for an unknown or malformed token', async () => {
    bookingModel.findOne.mockReturnValue(exec(null));
    await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/bookings/cancel/${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/bookings/cancel/not-a-token')
      .expect(404);
  });

  it('answers 409 on POST once the cutoff has passed, while GET reports closed', async () => {
    bookingModel.findOne.mockReturnValue(
      exec({ ...booking, date: '2000-01-01' }),
    );

    await request(app.getHttpServer())
      .post(`/api/bookings/cancel/${token}`)
      .expect(409);
    const response = await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${token}`)
      .expect(200);
    expect(response.body.state).toBe('closed');
    expect(bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('answers 503 when BUSINESS_TIMEZONE is not configured', async () => {
    delete process.env.BUSINESS_TIMEZONE;

    await request(app.getHttpServer())
      .get(`/api/bookings/cancel/${token}`)
      .expect(503);
    await request(app.getHttpServer())
      .post(`/api/bookings/cancel/${token}`)
      .expect(503);
  });
});
