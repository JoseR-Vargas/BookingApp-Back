import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookedService, Booking } from './schemas/booking.schema';
import { CreateBookingDto, UpdateBookingDto } from './dto/create-booking.dto';
import { BookingsGateway } from './bookings.gateway';
import { EmailService } from '../email/email.service';
import { Service } from '../catalog/catalog.config';
import { CatalogService } from '../catalog/catalog.service';
import {
  ServiceSelection,
  ServiceSelectionError,
} from '../catalog/service-selection';
import { AdminBookingNotifier } from '../whatsapp/admin-booking.notifier';
import {
  OccupyingBooking,
  buildDaySlots,
  dayOfWeekFromIsoDate,
  occupiedSlots,
  slotsRequired,
  windowSlots,
} from '../availability/availability.calculator';

interface ScheduleRequest {
  serviceIds: string[];
  professionalId: string;
  date: string;
  time: string;
}

/** Booking fields derived from the catalog; never trusted from the client. */
interface ResolvedSchedule {
  services: BookedService[];
  totalPrice: number;
  totalDuration: number;
  professional: { id: string; name: string };
  slots: string[];
}

/** Fields computed by the server; a client can never set them directly. */
const DERIVED_FIELDS = [
  'services',
  'professional',
  'slots',
  'totalPrice',
  'totalDuration',
] as const;

const serviceIdsOf = (services: { id?: string }[] | null | undefined) =>
  Array.isArray(services) ? services.map((service) => service?.id ?? '') : [];

const toBookedService = (service: Service): BookedService => ({
  id: service.id,
  name: service.name,
  price: service.price,
  duration: service.duration,
});

const CANCELLED = 'cancelled';

/**
 * Upper bound for the admin notification. The WhatsApp client aborts at 8s;
 * we stop waiting earlier so the booking response is never held hostage.
 */
const ADMIN_NOTIFY_TIMEOUT_MS = 5000;

const conflictMessage = (
  professionalName: string,
  date: string,
  time: string,
) => `Ya existe una reserva para ${professionalName} el ${date} a las ${time}`;

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/** Maps validation errors to the 'Error de validación' family. */
function toBusinessError(error: unknown): unknown {
  if (error instanceof ServiceSelectionError) {
    return new Error(`Error de validación: ${error.message}`);
  }
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
    private adminNotifier: AdminBookingNotifier,
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
      if (!client?.name || !client?.phone) {
        throw new Error('Datos del cliente son requeridos');
      }

      // NO validamos duplicados por cliente porque un cliente puede reservar
      // con diferentes profesionales en el mismo horario.
      const resolved = await this.resolveSchedule({
        serviceIds: serviceIdsOf(createBookingDto.services),
        professionalId: createBookingDto.professional.id,
        date,
        time,
      });

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

      await this.notifyAdmin(savedBooking);

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

      // Services, professional, slots and totals only change through catalog
      // resolution.
      const changes: Record<string, unknown> = { ...updateBookingDto };
      for (const field of DERIVED_FIELDS) {
        delete changes[field];
      }

      const currentServiceIds = serviceIdsOf(current.services);
      const target = {
        serviceIds: updateBookingDto.services
          ? serviceIdsOf(updateBookingDto.services)
          : currentServiceIds,
        professionalId:
          updateBookingDto.professional?.id ?? current.professional?.id,
        date: updateBookingDto.date ?? current.date,
        time: updateBookingDto.time ?? current.time,
        status: updateBookingDto.status ?? current.status,
      };
      const scheduleChanged =
        target.date !== current.date ||
        target.time !== current.time ||
        target.serviceIds.join() !== currentServiceIds.join() ||
        target.professionalId !== current.professional?.id;
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

  /** Whether the professional can perform all services starting at `time`. */
  async checkAvailability(
    date: string,
    time: string,
    professionalId: string,
    serviceIds: string[],
  ): Promise<{ available: boolean }> {
    try {
      const selection = await this.catalogService.resolveServices(
        Array.isArray(serviceIds) ? serviceIds : [],
      );
      const slots = await this.windowSlotsFor(
        date,
        time,
        selection.totalDuration,
      );
      const offersAll = selection.professionals.some(
        (professional) => professional.id === professionalId,
      );
      if (!slots || !offersAll) {
        return { available: false };
      }
      const occupied = await this.occupiedSlotsFor(date, professionalId);
      return { available: slots.every((slot) => !occupied.has(slot)) };
    } catch (error) {
      throw toBusinessError(error);
    }
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
          total: { $sum: '$totalPrice' },
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
   * Best-effort WhatsApp message to the admin. It is awaited (with a bound)
   * rather than fired and forgotten because serverless platforms freeze
   * un-awaited work once the response is sent. Never throws.
   */
  private async notifyAdmin(booking: Booking): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ADMIN_NOTIFY_TIMEOUT_MS);
      });
      await Promise.race([
        this.adminNotifier.notifyNewBooking(booking),
        timeout,
      ]);
    } catch (notifyError) {
      console.error(
        'Error al notificar al administrador por WhatsApp (no crítico):',
        notifyError,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Validates services, professional and start time against the catalog and
   * existing bookings, returning the catalog values and occupied slots.
   */
  private async resolveSchedule(
    request: ScheduleRequest,
    excludeId?: string,
  ): Promise<ResolvedSchedule> {
    const selection = await this.catalogService.resolveServices(
      request.serviceIds,
    );
    const professional = await this.resolveProfessional(
      request.professionalId,
      selection,
    );
    const slots = await this.resolveWindow(request, selection);

    const occupied = await this.occupiedSlotsFor(
      request.date,
      professional.id,
      excludeId,
    );
    if (slots.some((slot) => occupied.has(slot))) {
      throw new Error(
        conflictMessage(professional.name, request.date, request.time),
      );
    }

    return {
      services: selection.services.map(toBookedService),
      totalPrice: selection.totalPrice,
      totalDuration: selection.totalDuration,
      professional: { id: professional.id, name: professional.name },
      slots,
    };
  }

  /** The professional must exist and offer every selected service. */
  private async resolveProfessional(
    professionalId: string | undefined,
    selection: ServiceSelection,
  ) {
    const professional = await this.catalogService.findProfessional(
      professionalId ?? '',
    );
    if (!professional) {
      throw new Error(
        'Error de validación: el profesional seleccionado no existe',
      );
    }
    const notOffered = selection.services.filter(
      (service) => !service.professionals.includes(professional.id),
    );
    if (notOffered.length > 0) {
      throw new Error(
        `Error de validación: ${professional.name} no ofrece ${notOffered
          .map((service) => service.name)
          .join(', ')}`,
      );
    }
    return professional;
  }

  /** Slots of the whole service block, which must fit in the day schedule. */
  private async resolveWindow(
    { date, time }: ScheduleRequest,
    selection: ServiceSelection,
  ): Promise<string[]> {
    if (dayOfWeekFromIsoDate(date) === null) {
      throw new Error(`Error de validación: la fecha ${date} no es válida`);
    }
    const slots = await this.windowSlotsFor(
      date,
      time,
      selection.totalDuration,
    );
    if (!slots) {
      const names = selection.services
        .map((service) => service.name)
        .join(', ');
      throw new Error(
        `Error de validación: el horario ${time} no está disponible para ${names} el ${date}`,
      );
    }
    return slots;
  }

  /** Consecutive slots a block of `totalDuration` minutes needs, or null. */
  private async windowSlotsFor(
    date: string,
    time: string,
    totalDuration: number,
  ): Promise<string[] | null> {
    const dayOfWeek = dayOfWeekFromIsoDate(date);
    if (dayOfWeek === null) {
      return null;
    }
    const schedule = await this.catalogService.getSchedule();
    const interval = schedule.slotIntervalMinutes;
    return windowSlots(
      buildDaySlots(dayOfWeek, schedule),
      time,
      slotsRequired(totalDuration, interval),
      interval,
    );
  }

  /** Slots blocked by the non-cancelled bookings of a professional and day. */
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
      .find(filter, { slots: 1 })
      .lean<OccupyingBooking[]>()
      .exec();
    return occupiedSlots(bookings);
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
