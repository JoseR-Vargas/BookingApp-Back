import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from './schemas/booking.schema';
import { CreateBookingDto, UpdateBookingDto } from './dto/create-booking.dto';
import { BookingsGateway } from './bookings.gateway';
import { EmailService } from '../email/email.service';
import { CatalogService } from '../catalog/catalog.service';
import {
  OccupyingBooking,
  buildDaySlots,
  dayOfWeekFromIsoDate,
  freeStartTimes,
  occupiedSlots,
  slotsRequired,
} from '../availability/availability.calculator';

interface ScheduleRequest {
  service?: { id?: string } | null;
  professional?: { id?: string } | null;
  date?: string;
  time?: string;
}

/** Booking fields derived from the catalog; never trusted from the client. */
interface ResolvedSchedule {
  service: { id: string; name: string; price: number; duration: number };
  professional: { id: string; name: string };
  slots: string[];
}

type ExistingBooking = OccupyingBooking & { slots?: string[] };

const CANCELLED = 'cancelled';

const conflictMessage = (
  professionalName: string,
  date: string,
  time: string,
) => `Ya existe una reserva para ${professionalName} el ${date} a las ${time}`;

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/** Maps Mongoose validation errors to the 'Error de validación' family. */
function toBusinessError(error: unknown): unknown {
  if (error instanceof Error && error.name === 'ValidationError') {
    const errors = (error as Error & { errors?: Record<string, Error> }).errors;
    const messages = Object.values(errors ?? {})
      .map((e) => e.message)
      .join(', ');
    return new Error(`Error de validación: ${messages}`);
  }
  return error;
}

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    private bookingsGateway: BookingsGateway,
    private emailService: EmailService,
    private catalogService: CatalogService,
  ) {}

  async create(createBookingDto: CreateBookingDto): Promise<Booking> {
    try {
      const { client, date, time, notes } = createBookingDto;
      // Validar datos requeridos
      if (!date || !time) {
        throw new Error('Fecha y hora son requeridas');
      }
      if (!createBookingDto.professional?.id) {
        throw new Error('Profesional es requerido');
      }
      if (!createBookingDto.service?.id) {
        throw new Error('Servicio es requerido');
      }
      if (!client?.name || !client?.phone) {
        throw new Error('Datos del cliente son requeridos');
      }

      // NO validamos duplicados por cliente porque un cliente puede reservar
      // con diferentes profesionales en el mismo horario.
      const resolved = await this.resolveSchedule(createBookingDto);

      const createdBooking = new this.bookingModel({
        client,
        date,
        time,
        notes,
        ...resolved,
        status: 'confirmed',
      });
      const savedBooking = await this.withConflictMapping(
        () => createdBooking.save(),
        conflictMessage(resolved.professional.name, date, time),
      );

      // Emitir evento WebSocket cuando se crea una nueva reserva (no crítico si falla)
      try {
        this.bookingsGateway.notifyNewBooking(savedBooking);
      } catch (wsError) {
        console.error(
          'Error al notificar por WebSocket (no crítico):',
          wsError,
        );
      }

      // Enviar email de confirmación (no crítico; las reservas por WhatsApp no tienen email)
      if (savedBooking.client?.email) {
        try {
          await this.emailService.sendBookingConfirmation(savedBooking);
        } catch (emailError) {
          console.error(
            'Error al enviar email de confirmación (no crítico):',
            emailError,
          );
        }
      }

      return savedBooking;
    } catch (error) {
      throw toBusinessError(error);
    }
  }

  async findAll(): Promise<Booking[]> {
    return this.bookingModel.find().exec();
  }

  async findOne(id: string): Promise<Booking | null> {
    return this.bookingModel.findById(id).exec();
  }

  async update(
    id: string,
    updateBookingDto: UpdateBookingDto,
  ): Promise<Booking | null> {
    try {
      const current = await this.bookingModel.findById(id).exec();
      if (!current) {
        return null;
      }

      // Service, professional and slots only change through catalog resolution.
      const changes: Record<string, unknown> = { ...updateBookingDto };
      delete changes.service;
      delete changes.professional;
      delete changes.slots;

      const target = {
        service: updateBookingDto.service ?? current.service,
        professional: updateBookingDto.professional ?? current.professional,
        date: updateBookingDto.date ?? current.date,
        time: updateBookingDto.time ?? current.time,
        status: updateBookingDto.status ?? current.status,
      };
      const scheduleChanged =
        target.date !== current.date ||
        target.time !== current.time ||
        target.service?.id !== current.service?.id ||
        target.professional?.id !== current.professional?.id;
      const reactivated =
        current.status === CANCELLED && target.status !== CANCELLED;

      let professionalName = current.professional?.name;
      if (target.status !== CANCELLED && (scheduleChanged || reactivated)) {
        const resolved = await this.resolveSchedule(target, id);
        Object.assign(changes, resolved);
        professionalName = resolved.professional.name;
      }

      return await this.withConflictMapping(
        () =>
          this.bookingModel
            .findByIdAndUpdate(id, changes, { new: true, runValidators: true })
            .exec(),
        conflictMessage(professionalName, target.date, target.time),
      );
    } catch (error) {
      throw toBusinessError(error);
    }
  }

  async remove(id: string): Promise<Booking | null> {
    return this.bookingModel.findByIdAndDelete(id).exec();
  }

  async checkAvailability(
    date: string,
    time: string,
    professionalId: string,
  ): Promise<{ available: boolean }> {
    const occupied = await this.occupiedSlotsFor(date, professionalId);
    return { available: !occupied.has(time) };
  }

  async getStatistics(): Promise<{
    totalBookings: number;
    totalRevenue: number;
    todayBookings: number;
  }> {
    const totalBookings = await this.bookingModel.countDocuments();

    const totalRevenue = await this.bookingModel.aggregate<{ total: number }>([
      {
        $group: {
          _id: null,
          total: { $sum: '$service.price' },
        },
      },
    ]);

    const today = new Date().toISOString().split('T')[0];
    const todayBookings = await this.bookingModel.countDocuments({
      date: today,
    });

    return {
      totalBookings,
      totalRevenue: totalRevenue[0]?.total || 0,
      todayBookings,
    };
  }

  /**
   * Validates service, professional and start time against the catalog and
   * existing bookings, returning the catalog values and occupied slots.
   */
  private async resolveSchedule(
    request: ScheduleRequest,
    excludeId?: string,
  ): Promise<ResolvedSchedule> {
    const service = this.catalogService.findService(request.service?.id ?? '');
    if (!service) {
      throw new Error(
        'Error de validación: el servicio seleccionado no existe',
      );
    }
    const professional = this.catalogService.findProfessional(
      request.professional?.id ?? '',
    );
    if (!professional) {
      throw new Error(
        'Error de validación: el profesional seleccionado no existe',
      );
    }
    if (!service.professionals.includes(professional.id)) {
      throw new Error(
        `Error de validación: ${professional.name} no ofrece ${service.name}`,
      );
    }

    const date = request.date ?? '';
    const time = request.time ?? '';
    const dayOfWeek = dayOfWeekFromIsoDate(date);
    if (dayOfWeek === null) {
      throw new Error(`Error de validación: la fecha ${date} no es válida`);
    }

    // Valid starts: on the slot grid, with every required slot contiguous
    // (no crossing lunch or closing time; closed days have no slots).
    const { schedule } = this.catalogService.getCatalog();
    const interval = schedule.slotIntervalMinutes;
    const daySlots = buildDaySlots(dayOfWeek, schedule);
    const required = slotsRequired(service.duration, interval);
    const validStarts = freeStartTimes(daySlots, new Set(), required, interval);
    if (!validStarts.includes(time)) {
      throw new Error(
        `Error de validación: el horario ${time} no está disponible para ${service.name} el ${date}`,
      );
    }
    const start = daySlots.indexOf(time);
    const slots = daySlots.slice(start, start + required);

    const occupied = await this.occupiedSlotsFor(
      date,
      professional.id,
      excludeId,
    );
    if (slots.some((slot) => occupied.has(slot))) {
      throw new Error(conflictMessage(professional.name, date, time));
    }

    return {
      service: {
        id: service.id,
        name: service.name,
        price: service.price,
        duration: service.duration,
      },
      professional: { id: professional.id, name: professional.name },
      slots,
    };
  }

  /**
   * Slots blocked by non-cancelled bookings. Legacy bookings without `slots`
   * are covered by computing them from their time and stored duration.
   */
  private async occupiedSlotsFor(
    date: string,
    professionalId: string,
    excludeId?: string,
  ): Promise<Set<string>> {
    const filter: Record<string, unknown> = {
      date,
      'professional.id': professionalId,
      status: { $ne: CANCELLED },
    };
    if (excludeId) {
      filter._id = { $ne: excludeId };
    }
    const bookings = await this.bookingModel
      .find(filter, { time: 1, 'service.duration': 1, slots: 1, status: 1 })
      .lean<ExistingBooking[]>()
      .exec();

    const interval =
      this.catalogService.getCatalog().schedule.slotIntervalMinutes;
    const occupied = occupiedSlots(bookings, interval);
    for (const booking of bookings) {
      if (booking.status === CANCELLED) {
        continue;
      }
      for (const slot of booking.slots ?? []) {
        occupied.add(slot);
      }
    }
    return occupied;
  }

  /** Maps a Mongo duplicate key error (unique slot index) to a business conflict. */
  private async withConflictMapping<T>(
    operation: () => Promise<T>,
    message: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error(message);
      }
      throw error;
    }
  }
}
