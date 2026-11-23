import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BookingsService } from './bookings.service';
import { BookingsGateway } from './bookings.gateway';
import { Booking } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { EmailService } from '../email/email.service';
import { CatalogService } from '../catalog/catalog.service';
import { createFakeCatalog } from '../catalog/catalog.testing';
import { AdminBookingNotifier } from '../whatsapp/admin-booking.notifier';
import { SCHEDULE, Service } from '../catalog/catalog.config';
import { generateCancelToken, hashCancelToken } from './cancellation';

const SERVICES: Service[] = [
  {
    id: 'servicio-basico',
    name: 'Servicio Básico',
    description: '',
    price: 1200,
    duration: 60,
    professionals: ['alex-garcia', 'maria-lopez'],
    icon: '',
  },
  {
    id: 'servicio-premium',
    name: 'Servicio Premium',
    description: '',
    price: 2500,
    duration: 90,
    professionals: ['alex-garcia', 'maria-lopez'],
    icon: '',
  },
  {
    id: 'servicio-exclusivo',
    name: 'Servicio Exclusivo',
    description: '',
    price: 3000,
    duration: 60,
    professionals: ['alex-garcia'],
    icon: '',
  },
  {
    id: 'sesion-expres',
    name: 'Sesión Exprés',
    description: '',
    price: 700,
    duration: 20,
    professionals: ['alex-garcia', 'maria-lopez'],
    icon: '',
  },
];

// 2026-03-25 is a Wednesday; 2026-03-29 is a Sunday.
const mockBookingDto: CreateBookingDto = {
  client: {
    name: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '1234567890',
  },
  services: [{ id: 'servicio-basico' }],
  professional: {
    id: 'alex-garcia',
    name: 'Alex García',
  },
  date: '2026-03-25',
  time: '10:00',
};

const mockBooking = {
  _id: '507f1f77bcf86cd799439011',
  ...mockBookingDto,
  services: [
    {
      id: 'servicio-basico',
      name: 'Servicio Básico',
      price: 1200,
      duration: 60,
    },
  ],
  totalPrice: 1200,
  totalDuration: 60,
  slots: ['10:00', '10:30'],
  notes: '',
  status: 'confirmed',
  createdAt: '2026-03-21T10:00:00.000Z',
  updatedAt: '2026-03-21T10:00:00.000Z',
};

/** What `create` returns: the booking plus the one-time cancel token. */
const createdBooking = { ...mockBooking, cancelToken: expect.any(String) };

/** A Mongoose query stub supporting both `.exec()` and `.lean().exec()`. */
const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
  lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }),
});

const duplicateKeyError = () =>
  Object.assign(new Error('E11000 duplicate key error collection: bookings'), {
    code: 11000,
  });

describe('BookingsService', () => {
  let service: BookingsService;

  const mockSave = jest.fn();

  // Mock del modelo como función constructora con métodos estáticos
  const mockBookingModel: any = jest.fn().mockImplementation(() => ({
    save: mockSave,
  }));
  mockBookingModel.find = jest.fn();
  mockBookingModel.findById = jest.fn();
  mockBookingModel.findByIdAndUpdate = jest.fn();
  mockBookingModel.findByIdAndDelete = jest.fn();
  mockBookingModel.findOne = jest.fn();
  mockBookingModel.findOneAndUpdate = jest.fn();
  mockBookingModel.countDocuments = jest.fn();
  mockBookingModel.aggregate = jest.fn();

  const mockGateway = {
    notifyNewBooking: jest.fn(),
    notifyBookingCancelled: jest.fn(),
  };

  const mockEmailService = {
    sendBookingConfirmation: jest.fn(),
    sendCancellationConfirmation: jest.fn(),
  };

  const mockAdminNotifier = {
    notifyNewBooking: jest.fn(),
    notifyCancelledBooking: jest.fn(),
  };

  // Real catalog logic over in-memory models with a controlled service list.
  let mockCatalogService: CatalogService;

  const savedDoc = () => mockBookingModel.mock.calls[0][0];

  beforeEach(async () => {
    const fake = createFakeCatalog({
      services: SERVICES.map((s) => ({ ...s, active: true })),
    });
    mockCatalogService = fake.catalog;
    await mockCatalogService.onModuleInit();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getModelToken(Booking.name), useValue: mockBookingModel },
        { provide: BookingsGateway, useValue: mockGateway },
        { provide: EmailService, useValue: mockEmailService },
        { provide: CatalogService, useValue: mockCatalogService },
        { provide: AdminBookingNotifier, useValue: mockAdminNotifier },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    jest.clearAllMocks();
    mockBookingModel.find.mockReturnValue(query([]));
    mockBookingModel.findById.mockReturnValue(query(mockBooking));
    mockBookingModel.findByIdAndUpdate.mockReturnValue(query(mockBooking));
    mockBookingModel.findByIdAndDelete.mockReturnValue(query(mockBooking));
    mockBookingModel.countDocuments.mockResolvedValue(10);
    mockBookingModel.aggregate.mockResolvedValue([{ _id: null, total: 5000 }]);
    mockSave.mockResolvedValue(mockBooking);
    mockGateway.notifyNewBooking.mockImplementation(() => undefined);
    mockGateway.notifyBookingCancelled.mockImplementation(() => undefined);
    mockEmailService.sendBookingConfirmation.mockResolvedValue(undefined);
    mockEmailService.sendCancellationConfirmation.mockResolvedValue(undefined);
    mockAdminNotifier.notifyNewBooking.mockResolvedValue(undefined);
    mockAdminNotifier.notifyCancelledBooking.mockResolvedValue(undefined);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('debería crear una reserva exitosamente', async () => {
      const result = await service.create(mockBookingDto);

      expect(result).toEqual(createdBooking);
      expect(mockGateway.notifyNewBooking).toHaveBeenCalledWith(mockBooking);
      expect(mockEmailService.sendBookingConfirmation).toHaveBeenCalledWith(
        mockBooking,
        result.cancelToken,
      );
    });

    describe('cancel token', () => {
      // A saved Mongoose document still carries the hash even with select:false.
      const HASH_IN_DOC = 'f'.repeat(64);
      const savedDocument = () => ({
        ...mockBooking,
        cancelTokenHash: HASH_IN_DOC,
        toObject() {
          const { toObject: _omit, ...plain } = this as Record<string, unknown>;
          return plain;
        },
      });

      beforeEach(() => {
        mockSave.mockResolvedValue(savedDocument());
      });

      it('stores only the SHA-256 hash of the token, never the token', async () => {
        const { cancelToken } = await service.create(mockBookingDto);

        const doc = savedDoc();
        expect(doc.cancelTokenHash).toBe(hashCancelToken(cancelToken));
        expect(doc.cancelTokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(doc)).not.toContain(cancelToken);
      });

      it('returns a 43 character token and no hash', async () => {
        const result = await service.create(mockBookingDto);

        expect(result.cancelToken).toEqual(expect.any(String));
        expect(result.cancelToken).toHaveLength(43);
        expect(result).not.toHaveProperty('cancelTokenHash');
        expect(JSON.stringify(result)).not.toContain(HASH_IN_DOC);
      });

      it('generates a different token for every booking', async () => {
        const first = await service.create(mockBookingDto);
        const second = await service.create(mockBookingDto);

        expect(first.cancelToken).not.toBe(second.cancelToken);
      });

      it('gives the confirmation email the token as its own argument', async () => {
        const { cancelToken } = await service.create(mockBookingDto);

        const [booking, token] =
          mockEmailService.sendBookingConfirmation.mock.calls[0];
        expect(token).toBe(cancelToken);
        expect(booking).not.toHaveProperty('cancelToken');
      });

      it('never hands the hash or the token to the socket, the email or the admin notifier', async () => {
        const { cancelToken } = await service.create(mockBookingDto);

        const sent = [
          mockGateway.notifyNewBooking.mock.calls[0][0],
          mockEmailService.sendBookingConfirmation.mock.calls[0][0],
          mockAdminNotifier.notifyNewBooking.mock.calls[0][0],
        ];
        for (const booking of sent) {
          expect(booking).not.toHaveProperty('cancelTokenHash');
          expect(JSON.stringify(booking)).not.toContain(HASH_IN_DOC);
          expect(JSON.stringify(booking)).not.toContain(cancelToken);
        }
      });
    });

    it('debería guardar los slots calculados y los datos del catálogo', async () => {
      await service.create({
        ...mockBookingDto,
        services: [{ id: 'servicio-premium', name: 'x', price: 1 } as any],
        professional: { id: 'alex-garcia', name: 'Nombre falso' },
        time: '11:00',
      });

      const doc = savedDoc();
      expect(doc.slots).toEqual(['11:00', '11:30', '12:00']);
      expect(doc.services).toEqual([
        {
          id: 'servicio-premium',
          name: 'Servicio Premium',
          price: 2500,
          duration: 90,
        },
      ]);
      expect(doc.totalPrice).toBe(2500);
      expect(doc.totalDuration).toBe(90);
      expect(doc.professional).toEqual({
        id: 'alex-garcia',
        name: 'Alex García',
      });
      expect(doc.status).toBe('confirmed');
    });

    it('debería reservar varios servicios seguidos en slots consecutivos', async () => {
      await service.create({
        ...mockBookingDto,
        services: [{ id: 'servicio-basico' }, { id: 'servicio-premium' }],
      });

      const doc = savedDoc();
      expect(doc.services.map((line: { id: string }) => line.id)).toEqual([
        'servicio-basico',
        'servicio-premium',
      ]);
      expect(doc.totalPrice).toBe(3700);
      expect(doc.totalDuration).toBe(150);
      expect(doc.slots).toEqual(['10:00', '10:30', '11:00', '11:30', '12:00']);
    });

    it('no debería confiar en los slots enviados por el cliente', async () => {
      await service.create({ ...mockBookingDto, slots: ['18:00'] } as any);

      expect(savedDoc().slots).toEqual(['10:00', '10:30']);
    });

    it('debería lanzar error si falta fecha y hora', async () => {
      const dtoSinFecha = { ...mockBookingDto, date: '', time: '' };

      await expect(service.create(dtoSinFecha)).rejects.toThrow(
        'Fecha y hora son requeridas',
      );
    });

    it('debería lanzar error si falta el profesional', async () => {
      const dtoSinProfesional = {
        ...mockBookingDto,
        professional: null,
      } as any;

      await expect(service.create(dtoSinProfesional)).rejects.toThrow(
        'Profesional es requerido',
      );
    });

    it('debería lanzar error si falta profesional.id', async () => {
      const dtoSinProfId = {
        ...mockBookingDto,
        professional: { id: '', name: 'Alex' },
      };

      await expect(service.create(dtoSinProfId)).rejects.toThrow(
        'Profesional es requerido',
      );
    });

    it.each([null, []])(
      'debería lanzar error si no hay servicios (%p)',
      async (services) => {
        const dtoSinServicios = { ...mockBookingDto, services } as any;

        await expect(service.create(dtoSinServicios)).rejects.toThrow(
          'Error de validación: debes seleccionar al menos un servicio',
        );
      },
    );

    it('debería rechazar servicios duplicados', async () => {
      const dto = {
        ...mockBookingDto,
        services: [{ id: 'servicio-basico' }, { id: 'servicio-basico' }],
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Error de validación: el servicio servicio-basico está repetido',
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('debería lanzar error si falta el cliente', async () => {
      const dtoSinCliente = { ...mockBookingDto, client: null } as any;

      await expect(service.create(dtoSinCliente)).rejects.toThrow(
        'Datos del cliente son requeridos',
      );
    });

    it('debería lanzar error si falta el teléfono del cliente', async () => {
      const dtoSinTelefono = {
        ...mockBookingDto,
        client: { name: 'Juan', email: 'juan@example.com', phone: '' },
      };

      await expect(service.create(dtoSinTelefono)).rejects.toThrow(
        'Datos del cliente son requeridos',
      );
    });

    it('debería crear la reserva sin email y omitir el email de confirmación', async () => {
      const dtoSinEmail = {
        ...mockBookingDto,
        client: { name: 'Juan', phone: '5491100000000' },
      };
      const sinEmail = { ...mockBooking, client: dtoSinEmail.client };
      mockSave.mockResolvedValue(sinEmail);

      const result = await service.create(dtoSinEmail);

      expect(result).toEqual({ ...sinEmail, cancelToken: expect.any(String) });
      expect(mockEmailService.sendBookingConfirmation).not.toHaveBeenCalled();
      expect(mockGateway.notifyNewBooking).toHaveBeenCalledWith(sinEmail);
    });

    it('debería rechazar un servicio desconocido', async () => {
      const dto = {
        ...mockBookingDto,
        services: [{ id: 'servicio-basico' }, { id: 'corte-cabello' }],
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Error de validación: el servicio corte-cabello no existe',
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('debería rechazar un profesional desconocido', async () => {
      const dto = {
        ...mockBookingDto,
        professional: { id: 'cesar-viloria', name: 'Cesar Viloria' },
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Error de validación: el profesional seleccionado no existe',
      );
    });

    it('debería rechazar un profesional que no ofrece todos los servicios', async () => {
      const dto = {
        ...mockBookingDto,
        services: [{ id: 'servicio-basico' }, { id: 'servicio-exclusivo' }],
        professional: { id: 'maria-lopez', name: 'María López' },
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Error de validación: María López no ofrece Servicio Exclusivo',
      );
    });

    it.each(['09:15', '10:10', '10:45'])(
      'debería rechazar una hora fuera de la grilla de 30 min (%s)',
      async (time) => {
        await expect(
          service.create({ ...mockBookingDto, time }),
        ).rejects.toThrow(
          `Error de validación: el horario ${time} no está disponible para Servicio Básico el 2026-03-25`,
        );
        expect(mockSave).not.toHaveBeenCalled();
      },
    );

    it('debería aceptar una hora en punto y y media (10:30)', async () => {
      await service.create({ ...mockBookingDto, time: '10:30' });

      expect(savedDoc().slots).toEqual(['10:30', '11:00']);
    });

    it('debería aceptar un servicio de 90 min a mediodía (3 bloques de 30 min)', async () => {
      await service.create({
        ...mockBookingDto,
        services: [{ id: 'servicio-premium' }],
        time: '12:00',
      });

      expect(savedDoc().slots).toEqual(['12:00', '12:30', '13:00']);
    });

    describe('grilla de 30 minutos', () => {
      const createAt = (serviceId: string, time: string, date?: string) =>
        service.create({
          ...mockBookingDto,
          services: [{ id: serviceId }],
          time,
          ...(date ? { date } : {}),
        });

      it('un servicio de 20 min a las 09:00 ocupa un bloque y libera 09:30', async () => {
        await createAt('sesion-expres', '09:00');
        expect(savedDoc().slots).toEqual(['09:00']);

        mockBookingModel.find.mockReturnValue(query([{ slots: ['09:00'] }]));
        mockBookingModel.mockClear();
        await createAt('sesion-expres', '09:30');
        expect(savedDoc().slots).toEqual(['09:30']);
      });

      it('una reserva de 90 min a las 09:00 bloquea 09:30 y 10:00 y libera 10:30', async () => {
        await createAt('servicio-premium', '09:00');
        expect(savedDoc().slots).toEqual(['09:00', '09:30', '10:00']);

        mockBookingModel.find.mockReturnValue(
          query([{ slots: ['09:00', '09:30', '10:00'] }]),
        );
        await expect(createAt('sesion-expres', '09:30')).rejects.toThrow(
          'Ya existe una reserva',
        );
        await expect(createAt('sesion-expres', '10:00')).rejects.toThrow(
          'Ya existe una reserva',
        );

        mockBookingModel.mockClear();
        await createAt('sesion-expres', '10:30');
        expect(savedDoc().slots).toEqual(['10:30']);
      });

      it('una reserva que termina exactamente a las :30 libera esa hora sin hueco', async () => {
        // 60 min from 09:30 ends at 10:30.
        mockBookingModel.find.mockReturnValue(
          query([{ slots: ['09:30', '10:00'] }]),
        );

        await createAt('servicio-basico', '10:30');

        expect(savedDoc().slots).toEqual(['10:30', '11:00']);
      });

      it.each([
        ['servicio-basico', '19:00', '19:30', '2026-03-25'],
        ['servicio-premium', '18:30', '19:00', '2026-03-25'],
        ['servicio-basico', '17:00', '17:30', '2026-03-28'],
        ['servicio-premium', '16:30', '17:00', '2026-03-28'],
      ])(
        '%s: %s es el último inicio válido y %s ya no entra (%s)',
        async (serviceId, lastValid, tooLate, date) => {
          await createAt(serviceId, lastValid, date);
          expect(mockSave).toHaveBeenCalledTimes(1);

          await expect(createAt(serviceId, tooLate, date)).rejects.toThrow(
            'Error de validación',
          );
          expect(mockSave).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('debería rechazar un servicio de 90 min que cruza el cierre (19:00)', async () => {
      const dto = {
        ...mockBookingDto,
        services: [{ id: 'servicio-premium' }],
        time: '19:00',
      };

      await expect(service.create(dto)).rejects.toThrow('Error de validación');
    });

    it('debería rechazar varios servicios cuyo bloque total cruza el cierre', async () => {
      const dto = {
        ...mockBookingDto,
        services: [{ id: 'servicio-basico' }, { id: 'servicio-premium' }],
        time: '18:00',
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Error de validación: el horario 18:00 no está disponible para Servicio Básico, Servicio Premium el 2026-03-25',
      );
    });

    it('debería rechazar un domingo', async () => {
      await expect(
        service.create({ ...mockBookingDto, date: '2026-03-29' }),
      ).rejects.toThrow(
        'Error de validación: el horario 10:00 no está disponible para Servicio Básico el 2026-03-29',
      );
    });

    it('debería rechazar una fecha inválida', async () => {
      await expect(
        service.create({ ...mockBookingDto, date: '2026-02-30' }),
      ).rejects.toThrow(
        'Error de validación: la fecha 2026-02-30 no es válida',
      );
    });

    it('debería lanzar error si ya existe una reserva en el mismo horario', async () => {
      mockBookingModel.find.mockReturnValue(query([mockBooking]));

      await expect(service.create(mockBookingDto)).rejects.toThrow(
        'Ya existe una reserva para Alex García el 2026-03-25 a las 10:00',
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('debería rechazar el segundo slot de una reserva existente de 90 min', async () => {
      mockBookingModel.find.mockReturnValue(
        query([{ slots: ['10:00', '10:30', '11:00'] }]),
      );

      await expect(
        service.create({ ...mockBookingDto, time: '11:00' }),
      ).rejects.toThrow(
        'Ya existe una reserva para Alex García el 2026-03-25 a las 11:00',
      );
    });

    it('debería rechazar si el bloque de servicios pisa una reserva posterior', async () => {
      mockBookingModel.find.mockReturnValue(query([{ slots: ['12:00'] }]));
      const dto = {
        ...mockBookingDto,
        services: [{ id: 'servicio-basico' }, { id: 'servicio-premium' }],
        time: '10:00',
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Ya existe una reserva',
      );
    });

    it('debería consultar solo reservas no canceladas del profesional y fecha', async () => {
      await service.create(mockBookingDto);

      expect(mockBookingModel.find).toHaveBeenCalledWith(
        {
          date: '2026-03-25',
          'professional.id': 'alex-garcia',
          status: { $ne: 'cancelled' },
        },
        expect.any(Object),
      );
    });

    it('debería mapear el error de clave duplicada (11000) a "Ya existe una reserva"', async () => {
      mockSave.mockRejectedValue(duplicateKeyError());

      await expect(service.create(mockBookingDto)).rejects.toThrow(
        'Ya existe una reserva para Alex García el 2026-03-25 a las 10:00',
      );
    });

    it('debería guardar la reserva aún si WebSocket falla', async () => {
      mockGateway.notifyNewBooking.mockImplementation(() => {
        throw new Error('WebSocket error');
      });

      const result = await service.create(mockBookingDto);

      expect(result).toEqual(createdBooking);
    });

    it('debería guardar la reserva aún si el email falla', async () => {
      mockEmailService.sendBookingConfirmation.mockRejectedValue(
        new Error('SMTP caído'),
      );

      const result = await service.create(mockBookingDto);

      expect(result).toEqual(createdBooking);
    });

    it('debería manejar errores de validación de Mongoose', async () => {
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      (validationError as any).errors = {
        'client.name': { message: 'client.name es requerido' },
      };
      mockSave.mockRejectedValue(validationError);

      await expect(service.create(mockBookingDto)).rejects.toThrow(
        'Error de validación: client.name es requerido',
      );
    });

    it('debería re-lanzar errores que no son de validación', async () => {
      mockSave.mockRejectedValue(new Error('Error de conexión'));

      await expect(service.create(mockBookingDto)).rejects.toThrow(
        'Error de conexión',
      );
    });

    describe('admin notification', () => {
      afterEach(() => jest.useRealTimers());

      it('notifies the admin once with the saved booking', async () => {
        await service.create(mockBookingDto);

        expect(mockAdminNotifier.notifyNewBooking).toHaveBeenCalledTimes(1);
        expect(mockAdminNotifier.notifyNewBooking).toHaveBeenCalledWith(
          mockBooking,
        );
      });

      it('notifies after the websocket event and the confirmation email', async () => {
        await service.create(mockBookingDto);

        const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
        expect(order(mockAdminNotifier.notifyNewBooking)).toBeGreaterThan(
          order(mockGateway.notifyNewBooking),
        );
        expect(order(mockAdminNotifier.notifyNewBooking)).toBeGreaterThan(
          order(mockEmailService.sendBookingConfirmation),
        );
      });

      it('still returns the booking when the notifier rejects', async () => {
        mockAdminNotifier.notifyNewBooking.mockRejectedValue(new Error('boom'));

        await expect(service.create(mockBookingDto)).resolves.toEqual(
          createdBooking,
        );
      });

      it('still returns the booking when the notifier throws synchronously', async () => {
        mockAdminNotifier.notifyNewBooking.mockImplementation(() => {
          throw new Error('boom');
        });

        await expect(service.create(mockBookingDto)).resolves.toEqual(
          createdBooking,
        );
      });

      it('stops waiting for a notifier slower than the timeout', async () => {
        jest.useFakeTimers();
        mockAdminNotifier.notifyNewBooking.mockReturnValue(
          new Promise(() => undefined),
        );
        let settled = false;

        const pending = service.create(mockBookingDto).then((booking) => {
          settled = true;
          return booking;
        });
        await jest.advanceTimersByTimeAsync(4999);
        expect(settled).toBe(false);

        await jest.advanceTimersByTimeAsync(1);
        await expect(pending).resolves.toEqual(createdBooking);
      });

      it('does not leave the timeout timer pending after a fast notification', async () => {
        jest.useFakeTimers();

        await service.create(mockBookingDto);

        expect(jest.getTimerCount()).toBe(0);
      });

      it('does not notify when the booking is not saved (conflict)', async () => {
        mockSave.mockRejectedValue(duplicateKeyError());

        await expect(service.create(mockBookingDto)).rejects.toThrow(
          'Ya existe una reserva',
        );
        expect(mockAdminNotifier.notifyNewBooking).not.toHaveBeenCalled();
      });
    });
  });

  describe('findAll', () => {
    it('debería retornar todas las reservas', async () => {
      mockBookingModel.find.mockReturnValue(query([mockBooking]));

      const result = await service.findAll();

      expect(result).toEqual([mockBooking]);
      expect(mockBookingModel.find).toHaveBeenCalled();
    });

    it('debería retornar array vacío si no hay reservas', async () => {
      mockBookingModel.find.mockReturnValue(query([]));

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('debería retornar una reserva por ID', async () => {
      const result = await service.findOne('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockBooking);
      expect(mockBookingModel.findById).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
    });

    it('debería retornar null si la reserva no existe', async () => {
      mockBookingModel.findById.mockReturnValue(query(null));

      const result = await service.findOne('id-inexistente');

      expect(result).toBeNull();
    });
  });

  describe('cancel by token', () => {
    // Buenos Aires is UTC-3: the booking starts at 10:00 local = 13:00:00Z.
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
          price: 1200,
          duration: 60,
        },
      ],
      professional: { id: 'alex-garcia', name: 'Alex García' },
      date: '2026-03-25',
      time: '10:00',
      slots: ['10:00', '10:30'],
      status: 'confirmed',
    };
    const summary = (state: string) => ({
      state,
      services: [{ name: 'Servicio Básico' }],
      professional: { name: 'Alex García' },
      date: '2026-03-25',
      time: '10:00',
    });
    const at = (utc: string) =>
      jest.useFakeTimers({
        now: new Date(utc),
        // Only the clock is frozen; promises and timers keep running.
        doNotFake: [
          'nextTick',
          'setImmediate',
          'clearImmediate',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
        ],
      });

    const originalZone = process.env.BUSINESS_TIMEZONE;
    beforeEach(() => {
      process.env.BUSINESS_TIMEZONE = ZONE;
      at('2026-03-25T12:00:00Z'); // 09:00 local, one hour before the start
      mockBookingModel.findOne.mockReturnValue(query(booking));
      mockBookingModel.findOneAndUpdate.mockReturnValue(
        query({ ...booking, status: 'cancelled' }),
      );
    });
    afterEach(() => {
      jest.useRealTimers();
      if (originalZone === undefined) {
        delete process.env.BUSINESS_TIMEZONE;
      } else {
        process.env.BUSINESS_TIMEZONE = originalZone;
      }
    });

    describe('getCancellation', () => {
      it('looks the booking up by the hash of the token', async () => {
        await service.getCancellation(token);

        expect(mockBookingModel.findOne).toHaveBeenCalledWith({
          cancelTokenHash: hashCancelToken(token),
        });
      });

      it('summarises a cancellable booking without any client data or ids', async () => {
        await expect(service.getCancellation(token)).resolves.toEqual(
          summary('cancellable'),
        );
      });

      it('is still cancellable exactly 60 seconds before the start', async () => {
        at('2026-03-25T12:59:00Z');

        await expect(service.getCancellation(token)).resolves.toMatchObject({
          state: 'cancellable',
        });
      });

      it('is closed 59 seconds before the start, at the start and after it', async () => {
        for (const now of [
          '2026-03-25T12:59:01Z',
          '2026-03-25T13:00:00Z',
          '2026-03-25T16:00:00Z',
        ]) {
          at(now);
          await expect(service.getCancellation(token)).resolves.toMatchObject({
            state: 'closed',
          });
        }
      });

      it('reports a cancelled booking as cancelled without needing the timezone', async () => {
        delete process.env.BUSINESS_TIMEZONE;
        mockBookingModel.findOne.mockReturnValue(
          query({ ...booking, status: 'cancelled' }),
        );

        await expect(service.getCancellation(token)).resolves.toEqual(
          summary('cancelled'),
        );
      });

      it('answers 404 for a token that matches no booking', async () => {
        mockBookingModel.findOne.mockReturnValue(query(null));

        await expect(service.getCancellation(token)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('answers 404 for a malformed token without touching the database', async () => {
        for (const bad of ['', 'abc', 'x'.repeat(44), `${token.slice(1)}!`]) {
          await expect(service.getCancellation(bad)).rejects.toBeInstanceOf(
            NotFoundException,
          );
        }
        expect(mockBookingModel.findOne).not.toHaveBeenCalled();
      });

      it('answers 503 when BUSINESS_TIMEZONE is unset or invalid', async () => {
        delete process.env.BUSINESS_TIMEZONE;
        await expect(service.getCancellation(token)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );

        process.env.BUSINESS_TIMEZONE = 'Not/AZone';
        await expect(service.getCancellation(token)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      });
    });

    describe('cancelByToken', () => {
      it('cancels a confirmed booking atomically and returns the summary', async () => {
        const result = await service.cancelByToken(token);

        expect(mockBookingModel.findOneAndUpdate).toHaveBeenCalledWith(
          { _id: booking._id, status: 'confirmed' },
          { status: 'cancelled' },
          { new: true },
        );
        expect(result).toEqual(summary('cancelled'));
      });

      it('is accepted exactly 60 seconds before the start', async () => {
        at('2026-03-25T12:59:00Z');

        await expect(service.cancelByToken(token)).resolves.toMatchObject({
          state: 'cancelled',
        });
      });

      it('answers 409 and changes nothing once the cutoff has passed', async () => {
        for (const now of ['2026-03-25T12:59:01Z', '2026-03-25T13:30:00Z']) {
          at(now);
          await expect(service.cancelByToken(token)).rejects.toBeInstanceOf(
            ConflictException,
          );
        }
        expect(mockBookingModel.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it('is idempotent: cancelling an already cancelled booking answers the summary', async () => {
        mockBookingModel.findOne.mockReturnValue(
          query({ ...booking, status: 'cancelled' }),
        );

        await expect(service.cancelByToken(token)).resolves.toEqual(
          summary('cancelled'),
        );
        expect(mockBookingModel.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it('treats losing a race to a concurrent cancel as already cancelled', async () => {
        mockBookingModel.findOneAndUpdate.mockReturnValue(query(null));

        await expect(service.cancelByToken(token)).resolves.toEqual(
          summary('cancelled'),
        );
      });

      it('tells the admin panel over the socket, with the id only, when it cancels', async () => {
        await service.cancelByToken(token);

        expect(mockGateway.notifyBookingCancelled).toHaveBeenCalledTimes(1);
        expect(mockGateway.notifyBookingCancelled).toHaveBeenCalledWith(
          booking._id,
        );
      });

      it('does not emit when nothing changed: closed, already cancelled or lost race', async () => {
        at('2026-03-25T13:30:00Z');
        await expect(service.cancelByToken(token)).rejects.toBeInstanceOf(
          ConflictException,
        );

        at('2026-03-25T12:00:00Z');
        mockBookingModel.findOne.mockReturnValue(
          query({ ...booking, status: 'cancelled' }),
        );
        await service.cancelByToken(token);

        mockBookingModel.findOne.mockReturnValue(query(booking));
        mockBookingModel.findOneAndUpdate.mockReturnValue(query(null));
        await service.cancelByToken(token);

        expect(mockGateway.notifyBookingCancelled).not.toHaveBeenCalled();
      });

      it('still cancels when the socket fails', async () => {
        mockGateway.notifyBookingCancelled.mockImplementation(() => {
          throw new Error('socket down');
        });
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        await expect(service.cancelByToken(token)).resolves.toEqual(
          summary('cancelled'),
        );

        consoleSpy.mockRestore();
      });

      it('emails the client the cancellation when the booking has an email', async () => {
        await service.cancelByToken(token);

        expect(
          mockEmailService.sendCancellationConfirmation,
        ).toHaveBeenCalledTimes(1);
        expect(
          mockEmailService.sendCancellationConfirmation,
        ).toHaveBeenCalledWith({ ...booking, status: 'cancelled' });
      });

      it('sends no email to a booking without one', async () => {
        const { email: _omit, ...clientWithoutEmail } = booking.client;
        mockBookingModel.findOne.mockReturnValue(
          query({ ...booking, client: clientWithoutEmail }),
        );
        mockBookingModel.findOneAndUpdate.mockReturnValue(
          query({
            ...booking,
            client: clientWithoutEmail,
            status: 'cancelled',
          }),
        );

        await service.cancelByToken(token);

        expect(
          mockEmailService.sendCancellationConfirmation,
        ).not.toHaveBeenCalled();
      });

      it('sends no email when nothing changed: closed, already cancelled or lost race', async () => {
        at('2026-03-25T13:30:00Z');
        await expect(service.cancelByToken(token)).rejects.toBeInstanceOf(
          ConflictException,
        );

        at('2026-03-25T12:00:00Z');
        mockBookingModel.findOne.mockReturnValue(
          query({ ...booking, status: 'cancelled' }),
        );
        await service.cancelByToken(token);

        mockBookingModel.findOne.mockReturnValue(query(booking));
        mockBookingModel.findOneAndUpdate.mockReturnValue(query(null));
        await service.cancelByToken(token);

        expect(
          mockEmailService.sendCancellationConfirmation,
        ).not.toHaveBeenCalled();
      });

      it('still cancels when the email fails', async () => {
        mockEmailService.sendCancellationConfirmation.mockRejectedValue(
          new Error('smtp down'),
        );
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        await expect(service.cancelByToken(token)).resolves.toEqual(
          summary('cancelled'),
        );

        consoleSpy.mockRestore();
      });

      it('tells the admin on WhatsApp once, with the cancelled booking', async () => {
        await service.cancelByToken(token);

        expect(mockAdminNotifier.notifyCancelledBooking).toHaveBeenCalledTimes(
          1,
        );
        expect(mockAdminNotifier.notifyCancelledBooking).toHaveBeenCalledWith({
          ...booking,
          status: 'cancelled',
        });
        expect(mockAdminNotifier.notifyNewBooking).not.toHaveBeenCalled();
      });

      it('does not tell the admin when nothing changed: closed, already cancelled or lost race', async () => {
        at('2026-03-25T13:30:00Z');
        await expect(service.cancelByToken(token)).rejects.toBeInstanceOf(
          ConflictException,
        );

        at('2026-03-25T12:00:00Z');
        mockBookingModel.findOne.mockReturnValue(
          query({ ...booking, status: 'cancelled' }),
        );
        await service.cancelByToken(token);

        mockBookingModel.findOne.mockReturnValue(query(booking));
        mockBookingModel.findOneAndUpdate.mockReturnValue(query(null));
        await service.cancelByToken(token);

        expect(mockAdminNotifier.notifyCancelledBooking).not.toHaveBeenCalled();
      });

      it('still cancels when the admin notice rejects or throws', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        mockAdminNotifier.notifyCancelledBooking.mockRejectedValue(
          new Error('boom'),
        );
        await expect(service.cancelByToken(token)).resolves.toEqual(
          summary('cancelled'),
        );

        mockAdminNotifier.notifyCancelledBooking.mockImplementation(() => {
          throw new Error('boom');
        });
        await expect(service.cancelByToken(token)).resolves.toEqual(
          summary('cancelled'),
        );

        consoleSpy.mockRestore();
      });

      it('stops waiting for a notifier slower than the timeout', async () => {
        jest.useRealTimers();
        mockAdminNotifier.notifyCancelledBooking.mockReturnValue(
          new Promise(() => undefined),
        );
        const clock = jest.useFakeTimers({
          now: new Date('2026-03-25T12:00:00Z'),
          doNotFake: ['nextTick', 'setImmediate', 'clearImmediate'],
        });
        void clock;

        const pending = service.cancelByToken(token);
        await jest.advanceTimersByTimeAsync(5000);

        await expect(pending).resolves.toEqual(summary('cancelled'));
      });

      it('answers 404 for an unknown token and 503 without a valid timezone', async () => {
        mockBookingModel.findOne.mockReturnValue(query(null));
        await expect(service.cancelByToken(token)).rejects.toBeInstanceOf(
          NotFoundException,
        );

        mockBookingModel.findOne.mockReturnValue(query(booking));
        delete process.env.BUSINESS_TIMEZONE;
        await expect(service.cancelByToken(token)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        expect(mockBookingModel.findOneAndUpdate).not.toHaveBeenCalled();
      });
    });
  });

  describe('update', () => {
    const id = '507f1f77bcf86cd799439011';
    const updatePayload = () =>
      mockBookingModel.findByIdAndUpdate.mock.calls[0][1];

    it('debería actualizar una reserva cambiando la hora y re-validar', async () => {
      const updatedBooking = {
        ...mockBooking,
        time: '11:00',
        slots: ['11:00', '11:30'],
      };
      mockBookingModel.findByIdAndUpdate.mockReturnValue(query(updatedBooking));

      const result = await service.update(id, {
        ...mockBookingDto,
        time: '11:00',
      });

      expect(result).toEqual(updatedBooking);
      expect(mockBookingModel.find).toHaveBeenCalledWith(
        {
          date: '2026-03-25',
          'professional.id': 'alex-garcia',
          status: { $ne: 'cancelled' },
          _id: { $ne: id },
        },
        expect.any(Object),
      );
      expect(updatePayload()).toEqual(
        expect.objectContaining({
          time: '11:00',
          slots: ['11:00', '11:30'],
          services: mockBooking.services,
          totalPrice: 1200,
          totalDuration: 60,
        }),
      );
      expect(mockBookingModel.findByIdAndUpdate.mock.calls[0][2]).toEqual({
        new: true,
        runValidators: true,
      });
    });

    it('debería rechazar un cambio de hora fuera de la grilla', async () => {
      await expect(service.update(id, { time: '10:15' })).rejects.toThrow(
        'Error de validación',
      );
      expect(mockBookingModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('debería rechazar un cambio de hora que se superpone con otra reserva', async () => {
      mockBookingModel.find.mockReturnValue(
        query([{ slots: ['11:00', '11:30', '12:00'] }]),
      );

      await expect(service.update(id, { time: '12:00' })).rejects.toThrow(
        'Ya existe una reserva para Alex García el 2026-03-25 a las 12:00',
      );
    });

    it('no debería validar disponibilidad al cancelar', async () => {
      mockBookingModel.find.mockReturnValue(query([mockBooking]));

      await service.update(id, { status: 'cancelled' });

      expect(mockBookingModel.find).not.toHaveBeenCalled();
      expect(updatePayload()).toEqual({ status: 'cancelled' });
    });

    it('debería re-validar al reactivar una reserva cancelada', async () => {
      mockBookingModel.findById.mockReturnValue(
        query({ ...mockBooking, status: 'cancelled' }),
      );
      mockBookingModel.find.mockReturnValue(query([{ slots: ['10:00'] }]));

      await expect(service.update(id, { status: 'confirmed' })).rejects.toThrow(
        'Ya existe una reserva',
      );
    });

    it('no debería re-validar si solo cambian las notas', async () => {
      await service.update(id, { notes: 'Llego 5 min tarde' });

      expect(mockBookingModel.find).not.toHaveBeenCalled();
      expect(updatePayload()).toEqual({ notes: 'Llego 5 min tarde' });
    });

    it('no debería aceptar slots, servicios ni totales del cliente sin re-validar', async () => {
      await service.update(id, {
        ...mockBookingDto,
        slots: ['18:00'],
        totalPrice: 1,
        totalDuration: 1,
      } as any);

      const payload = updatePayload();
      expect(payload.slots).toBeUndefined();
      expect(payload.services).toBeUndefined();
      expect(payload.totalPrice).toBeUndefined();
      expect(payload.totalDuration).toBeUndefined();
    });

    it('never lets a request set the cancel token hash', async () => {
      await service.update(id, {
        notes: 'x',
        cancelTokenHash: 'a'.repeat(64),
      } as any);

      expect(updatePayload()).toEqual({ notes: 'x' });
    });

    it('debería re-resolver los servicios y slots al cambiar la lista de servicios', async () => {
      await service.update(id, {
        services: [{ id: 'servicio-basico' }, { id: 'servicio-premium' }],
      });

      expect(updatePayload()).toEqual(
        expect.objectContaining({
          slots: ['10:00', '10:30', '11:00', '11:30', '12:00'],
          totalPrice: 3700,
          totalDuration: 150,
        }),
      );
      expect(updatePayload().services).toHaveLength(2);
    });

    it('debería rechazar servicios duplicados al actualizar', async () => {
      await expect(
        service.update(id, {
          services: [{ id: 'servicio-basico' }, { id: 'servicio-basico' }],
        }),
      ).rejects.toThrow('Error de validación');
      expect(mockBookingModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('debería mapear el error 11000 al actualizar', async () => {
      mockBookingModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockRejectedValue(duplicateKeyError()),
      });

      await expect(service.update(id, { time: '11:00' })).rejects.toThrow(
        'Ya existe una reserva para Alex García el 2026-03-25 a las 11:00',
      );
    });

    it('debería retornar null si la reserva no existe', async () => {
      mockBookingModel.findById.mockReturnValue(query(null));

      const result = await service.update('id-inexistente', mockBookingDto);

      expect(result).toBeNull();
      expect(mockBookingModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('debería eliminar una reserva exitosamente', async () => {
      const result = await service.remove('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockBooking);
      expect(mockBookingModel.findByIdAndDelete).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
    });

    it('debería retornar null si la reserva no existe', async () => {
      mockBookingModel.findByIdAndDelete.mockReturnValue(query(null));

      const result = await service.remove('id-inexistente');

      expect(result).toBeNull();
    });
  });

  describe('checkAvailability', () => {
    const check = (time: string, serviceIds: string[]) =>
      service.checkAvailability('2026-03-25', time, 'alex-garcia', serviceIds);

    it('debería retornar available: true cuando no hay reserva', async () => {
      const result = await check('10:00', ['servicio-basico']);

      expect(result).toEqual({ available: true });
      expect(mockBookingModel.find).toHaveBeenCalledWith(
        {
          date: '2026-03-25',
          'professional.id': 'alex-garcia',
          status: { $ne: 'cancelled' },
        },
        expect.any(Object),
      );
    });

    it('debería retornar available: false cuando ya hay reserva', async () => {
      mockBookingModel.find.mockReturnValue(query([mockBooking]));

      expect(await check('10:00', ['servicio-basico'])).toEqual({
        available: false,
      });
    });

    it('debería detectar la superposición con una reserva de 90 min', async () => {
      mockBookingModel.find.mockReturnValue(
        query([{ slots: ['10:00', '10:30', '11:00'] }]),
      );

      expect(await check('11:00', ['servicio-basico'])).toEqual({
        available: false,
      });
    });

    it('debería exigir libre toda la ventana de varios servicios', async () => {
      mockBookingModel.find.mockReturnValue(query([{ slots: ['12:00'] }]));

      expect(
        await check('10:00', ['servicio-basico', 'servicio-premium']),
      ).toEqual({ available: false });
      expect(await check('10:00', ['servicio-basico'])).toEqual({
        available: true,
      });
    });

    it('debería retornar available: false si la ventana no entra en el horario', async () => {
      expect(
        await check('18:00', ['servicio-basico', 'servicio-premium']),
      ).toEqual({ available: false });
    });

    it('debería retornar available: false si el profesional no ofrece todos los servicios', async () => {
      const result = await service.checkAvailability(
        '2026-03-25',
        '10:00',
        'maria-lopez',
        ['servicio-basico', 'servicio-exclusivo'],
      );

      expect(result).toEqual({ available: false });
    });

    it('debería rechazar servicios inválidos con error de validación', async () => {
      await expect(check('10:00', [])).rejects.toThrow(
        'Error de validación: debes seleccionar al menos un servicio',
      );
      await expect(check('10:00', ['nope'])).rejects.toThrow(
        'Error de validación: el servicio nope no existe',
      );
    });
  });

  describe('getStatistics', () => {
    it('debería retornar estadísticas correctas', async () => {
      mockBookingModel.countDocuments
        .mockResolvedValueOnce(10) // totalBookings
        .mockResolvedValueOnce(2); // todayBookings
      mockBookingModel.aggregate.mockResolvedValue([
        { _id: null, total: 5000 },
      ]);

      const result = await service.getStatistics();

      expect(result).toEqual({
        totalBookings: 10,
        totalRevenue: 5000,
        todayBookings: 2,
      });
    });

    it('debería retornar totalRevenue 0 si no hay ingresos', async () => {
      mockBookingModel.countDocuments
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockBookingModel.aggregate.mockResolvedValue([]);

      const result = await service.getStatistics();

      expect(result.totalRevenue).toBe(0);
      expect(result.totalBookings).toBe(0);
      expect(result.todayBookings).toBe(0);
    });

    it('debería filtrar reservas de hoy con formato YYYY-MM-DD', async () => {
      mockBookingModel.countDocuments
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3);
      mockBookingModel.aggregate.mockResolvedValue([
        { _id: null, total: 1500 },
      ]);

      await service.getStatistics();

      // La segunda llamada a countDocuments filtra por fecha de hoy
      const todayCall = mockBookingModel.countDocuments.mock.calls[1];
      expect(todayCall[0]).toHaveProperty('date');
      // Verificar formato YYYY-MM-DD
      expect(todayCall[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('debería usar $sum: totalPrice en la agregación', async () => {
      mockBookingModel.countDocuments.mockResolvedValue(0);
      mockBookingModel.aggregate.mockResolvedValue([
        { _id: null, total: 3000 },
      ]);

      await service.getStatistics();

      expect(mockBookingModel.aggregate).toHaveBeenCalledWith([
        {
          $group: {
            _id: null,
            total: { $sum: '$totalPrice' },
          },
        },
      ]);
    });
  });

  describe('start interval', () => {
    beforeEach(() => {
      jest
        .spyOn(mockCatalogService, 'getSchedule')
        .mockResolvedValue({ ...SCHEDULE, startIntervalMinutes: 180 });
    });

    it('rejects a start that is not offered with the usual validation error', async () => {
      await expect(
        service.create({ ...mockBookingDto, time: '10:00' }),
      ).rejects.toThrow(
        'Error de validación: el horario 10:00 no está disponible para Servicio Básico el 2026-03-25',
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('accepts an offered start', async () => {
      await service.create({ ...mockBookingDto, time: '12:00' });

      expect(savedDoc().slots).toEqual(['12:00', '12:30']);
    });
  });

  describe('starts per day', () => {
    beforeEach(() => {
      // 2026-03-25 is a Wednesday (3): open 09:00-20:00 with a lunch break.
      jest.spyOn(mockCatalogService, 'getSchedule').mockResolvedValue({
        ...SCHEDULE,
        weekly: {
          ...SCHEDULE.weekly,
          3: {
            closed: false,
            open: '09:00',
            close: '20:00',
            starts: ['09:00', '15:00'],
          },
        },
      });
    });

    it('rejects a start that is not in the day list', async () => {
      await expect(
        service.create({ ...mockBookingDto, time: '12:00' }),
      ).rejects.toThrow(
        'Error de validación: el horario 12:00 no está disponible para Servicio Básico el 2026-03-25',
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('accepts a start in the day list', async () => {
      await service.create({ ...mockBookingDto, time: '15:00' });

      expect(savedDoc().slots).toEqual(['15:00', '15:30']);
    });
  });
});
