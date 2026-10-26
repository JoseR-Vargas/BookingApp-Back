import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BookingsService } from './bookings.service';
import { BookingsGateway } from './bookings.gateway';
import { Booking } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { EmailService } from '../email/email.service';
import { CatalogService } from '../catalog/catalog.service';
import { AdminBookingNotifier } from '../whatsapp/admin-booking.notifier';
import { Professional, SCHEDULE, Service } from '../catalog/catalog.config';

const PROFESSIONALS: Professional[] = [
  {
    id: 'alex-garcia',
    name: 'Alex García',
    specialty: 'Especialista',
    experience: '8 años',
    rating: 4.9,
    avatar: '',
    available: true,
  },
  {
    id: 'maria-lopez',
    name: 'María López',
    specialty: 'Consultora',
    experience: '6 años',
    rating: 4.8,
    avatar: '',
    available: true,
  },
];

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
];

// 2026-03-25 is a Wednesday; 2026-03-29 is a Sunday.
const mockBookingDto: CreateBookingDto = {
  client: {
    name: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '1234567890',
  },
  service: {
    id: 'servicio-basico',
    name: 'Nombre enviado por el cliente',
    price: 1,
    duration: 1,
  },
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
  service: {
    id: 'servicio-basico',
    name: 'Servicio Básico',
    price: 1200,
    duration: 60,
  },
  slots: ['10:00'],
  notes: '',
  status: 'confirmed',
  createdAt: '2026-03-21T10:00:00.000Z',
  updatedAt: '2026-03-21T10:00:00.000Z',
};

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
  mockBookingModel.countDocuments = jest.fn();
  mockBookingModel.aggregate = jest.fn();

  const mockGateway = {
    notifyNewBooking: jest.fn(),
  };

  const mockEmailService = {
    sendBookingConfirmation: jest.fn(),
  };

  const mockAdminNotifier = {
    notifyNewBooking: jest.fn(),
  };

  const mockCatalogService = {
    findService: jest.fn((id: string) => SERVICES.find((s) => s.id === id)),
    findProfessional: jest.fn((id: string) =>
      PROFESSIONALS.find((p) => p.id === id),
    ),
    getCatalog: jest.fn(() => ({
      professionals: PROFESSIONALS,
      services: SERVICES,
      schedule: SCHEDULE,
    })),
  };

  const savedDoc = () => mockBookingModel.mock.calls[0][0];

  beforeEach(async () => {
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
    mockEmailService.sendBookingConfirmation.mockResolvedValue(undefined);
    mockAdminNotifier.notifyNewBooking.mockResolvedValue(undefined);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('debería crear una reserva exitosamente', async () => {
      const result = await service.create(mockBookingDto);

      expect(result).toEqual(mockBooking);
      expect(mockGateway.notifyNewBooking).toHaveBeenCalledWith(mockBooking);
      expect(mockEmailService.sendBookingConfirmation).toHaveBeenCalledWith(
        mockBooking,
      );
    });

    it('debería guardar los slots calculados y los datos del catálogo', async () => {
      await service.create({
        ...mockBookingDto,
        service: { id: 'servicio-premium', name: 'x', price: 1, duration: 30 },
        professional: { id: 'alex-garcia', name: 'Nombre falso' },
        time: '11:00',
      });

      const doc = savedDoc();
      expect(doc.slots).toEqual(['11:00', '12:00']);
      expect(doc.service).toEqual({
        id: 'servicio-premium',
        name: 'Servicio Premium',
        price: 2500,
        duration: 90,
      });
      expect(doc.professional).toEqual({
        id: 'alex-garcia',
        name: 'Alex García',
      });
      expect(doc.status).toBe('confirmed');
    });

    it('no debería confiar en los slots enviados por el cliente', async () => {
      await service.create({ ...mockBookingDto, slots: ['18:00'] } as any);

      expect(savedDoc().slots).toEqual(['10:00']);
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

    it('debería lanzar error si falta el servicio', async () => {
      const dtoSinServicio = { ...mockBookingDto, service: null } as any;

      await expect(service.create(dtoSinServicio)).rejects.toThrow(
        'Servicio es requerido',
      );
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

      expect(result).toEqual(sinEmail);
      expect(mockEmailService.sendBookingConfirmation).not.toHaveBeenCalled();
      expect(mockGateway.notifyNewBooking).toHaveBeenCalledWith(sinEmail);
    });

    it('debería rechazar un servicio desconocido', async () => {
      const dto = {
        ...mockBookingDto,
        service: {
          id: 'corte-cabello',
          name: 'Corte',
          price: 450,
          duration: 45,
        },
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Error de validación: el servicio seleccionado no existe',
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

    it('debería rechazar un profesional que no ofrece el servicio', async () => {
      const dto = {
        ...mockBookingDto,
        service: {
          id: 'servicio-exclusivo',
          name: 'x',
          price: 1,
          duration: 60,
        },
        professional: { id: 'maria-lopez', name: 'María López' },
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Error de validación: María López no ofrece Servicio Exclusivo',
      );
    });

    it('debería rechazar una hora fuera de la grilla (10:30)', async () => {
      await expect(
        service.create({ ...mockBookingDto, time: '10:30' }),
      ).rejects.toThrow(
        'Error de validación: el horario 10:30 no está disponible para Servicio Básico el 2026-03-25',
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('debería rechazar un servicio de 90 min que cruza el almuerzo (12:00)', async () => {
      const dto = {
        ...mockBookingDto,
        service: { id: 'servicio-premium', name: 'x', price: 1, duration: 90 },
        time: '12:00',
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Error de validación: el horario 12:00 no está disponible para Servicio Premium el 2026-03-25',
      );
    });

    it('debería rechazar un servicio de 90 min que cruza el cierre (19:00)', async () => {
      const dto = {
        ...mockBookingDto,
        service: { id: 'servicio-premium', name: 'x', price: 1, duration: 90 },
        time: '19:00',
      };

      await expect(service.create(dto)).rejects.toThrow('Error de validación');
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
        query([
          { time: '10:00', service: { duration: 90 }, status: 'confirmed' },
        ]),
      );

      await expect(
        service.create({ ...mockBookingDto, time: '11:00' }),
      ).rejects.toThrow(
        'Ya existe una reserva para Alex García el 2026-03-25 a las 11:00',
      );
    });

    it('debería rechazar si un servicio largo pisa una reserva posterior', async () => {
      mockBookingModel.find.mockReturnValue(
        query([
          { time: '11:00', service: { duration: 60 }, status: 'confirmed' },
        ]),
      );
      const dto = {
        ...mockBookingDto,
        service: { id: 'servicio-premium', name: 'x', price: 1, duration: 90 },
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

      expect(result).toEqual(mockBooking);
    });

    it('debería guardar la reserva aún si el email falla', async () => {
      mockEmailService.sendBookingConfirmation.mockRejectedValue(
        new Error('SMTP caído'),
      );

      const result = await service.create(mockBookingDto);

      expect(result).toEqual(mockBooking);
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
          mockBooking,
        );
      });

      it('still returns the booking when the notifier throws synchronously', async () => {
        mockAdminNotifier.notifyNewBooking.mockImplementation(() => {
          throw new Error('boom');
        });

        await expect(service.create(mockBookingDto)).resolves.toEqual(
          mockBooking,
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
        await expect(pending).resolves.toEqual(mockBooking);
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

  describe('update', () => {
    const id = '507f1f77bcf86cd799439011';
    const updatePayload = () =>
      mockBookingModel.findByIdAndUpdate.mock.calls[0][1];

    it('debería actualizar una reserva cambiando la hora y re-validar', async () => {
      const updatedBooking = {
        ...mockBooking,
        time: '11:00',
        slots: ['11:00'],
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
          slots: ['11:00'],
          service: {
            id: 'servicio-basico',
            name: 'Servicio Básico',
            price: 1200,
            duration: 60,
          },
        }),
      );
      expect(mockBookingModel.findByIdAndUpdate.mock.calls[0][2]).toEqual({
        new: true,
        runValidators: true,
      });
    });

    it('debería rechazar un cambio de hora fuera de la grilla', async () => {
      await expect(service.update(id, { time: '10:30' })).rejects.toThrow(
        'Error de validación',
      );
      expect(mockBookingModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('debería rechazar un cambio de hora que se superpone con otra reserva', async () => {
      mockBookingModel.find.mockReturnValue(
        query([
          { time: '11:00', service: { duration: 90 }, status: 'confirmed' },
        ]),
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
      mockBookingModel.find.mockReturnValue(
        query([
          { time: '10:00', service: { duration: 60 }, status: 'confirmed' },
        ]),
      );

      await expect(service.update(id, { status: 'confirmed' })).rejects.toThrow(
        'Ya existe una reserva',
      );
    });

    it('no debería re-validar si solo cambian las notas', async () => {
      await service.update(id, { notes: 'Llego 5 min tarde' });

      expect(mockBookingModel.find).not.toHaveBeenCalled();
      expect(updatePayload()).toEqual({ notes: 'Llego 5 min tarde' });
    });

    it('no debería aceptar slots ni servicio del cliente sin re-validar', async () => {
      await service.update(id, {
        ...mockBookingDto,
        service: { ...mockBookingDto.service, price: 1 },
        slots: ['18:00'],
      } as any);

      const payload = updatePayload();
      expect(payload.slots).toBeUndefined();
      expect(payload.service).toBeUndefined();
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
    it('debería retornar available: true cuando no hay reserva', async () => {
      const result = await service.checkAvailability(
        '2026-03-25',
        '10:00',
        'alex-garcia',
      );

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

      const result = await service.checkAvailability(
        '2026-03-25',
        '10:00',
        'alex-garcia',
      );

      expect(result).toEqual({ available: false });
    });

    it('debería detectar la superposición con una reserva de 90 min', async () => {
      mockBookingModel.find.mockReturnValue(
        query([
          { time: '10:00', service: { duration: 90 }, status: 'confirmed' },
        ]),
      );

      const result = await service.checkAvailability(
        '2026-03-25',
        '11:00',
        'alex-garcia',
      );

      expect(result).toEqual({ available: false });
    });

    it('debería ignorar reservas canceladas', async () => {
      mockBookingModel.find.mockReturnValue(
        query([
          { time: '10:00', service: { duration: 60 }, status: 'cancelled' },
        ]),
      );

      const result = await service.checkAvailability(
        '2026-03-25',
        '10:00',
        'alex-garcia',
      );

      expect(result).toEqual({ available: true });
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

    it('debería usar $sum: service.price en la agregación', async () => {
      mockBookingModel.countDocuments.mockResolvedValue(0);
      mockBookingModel.aggregate.mockResolvedValue([
        { _id: null, total: 3000 },
      ]);

      await service.getStatistics();

      expect(mockBookingModel.aggregate).toHaveBeenCalledWith([
        {
          $group: {
            _id: null,
            total: { $sum: '$service.price' },
          },
        },
      ]);
    });
  });
});
