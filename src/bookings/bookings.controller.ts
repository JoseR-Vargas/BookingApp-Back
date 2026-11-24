import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingDto } from './dto/create-booking.dto';

// Messages produced by BookingsService that are client (400) errors.
const BUSINESS_ERROR_MARKERS = [
  'Ya existe una reserva',
  'Ya tienes una reserva',
  'es requerido',
  'Error de validación',
];

// Use 'bookings' because a global prefix 'api' is set in main.ts.
// Public: creating a booking, checking availability and the token-based cancel
// routes. Everything that reads or changes bookings in general is admin only.
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async create(@Body() createBookingDto: CreateBookingDto) {
    try {
      return await this.bookingsService.create(createBookingDto);
    } catch (error) {
      throw this.toHttpException(error, 'Error al crear reserva:');
    }
  }

  /**
   * Public cancel page for the client. Authorised by the secret token in the
   * URL alone, so these two routes stay outside the admin guard. Declared
   * before ':id'; its two segments never collide with it anyway.
   */
  @Get('cancel/:token')
  getCancellation(@Param('token') token: string) {
    return this.bookingsService.getCancellation(token);
  }

  @Post('cancel/:token')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('token') token: string) {
    return this.bookingsService.cancelByToken(token);
  }

  @UseGuards(AdminKeyGuard)
  @Get('statistics')
  getStatistics() {
    return this.bookingsService.getStatistics();
  }

  @Post('availability')
  async checkAvailability(
    @Body()
    body: {
      date: string;
      time: string;
      professionalId: string;
      serviceIds: string[];
      locationId?: string;
    },
  ) {
    try {
      return await this.bookingsService.checkAvailability(
        body.date,
        body.time,
        body.professionalId,
        body.serviceIds,
        body.locationId,
      );
    } catch (error) {
      throw this.toHttpException(error, 'Error al consultar disponibilidad:');
    }
  }

  @UseGuards(AdminKeyGuard)
  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }

  @UseGuards(AdminKeyGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @UseGuards(AdminKeyGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateBookingDto: UpdateBookingDto,
  ) {
    try {
      return await this.bookingsService.update(id, updateBookingDto);
    } catch (error) {
      throw this.toHttpException(error, 'Error al actualizar reserva:');
    }
  }

  @UseGuards(AdminKeyGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bookingsService.remove(id);
  }

  /** Business errors map to 400, HttpExceptions pass through, the rest is 500. */
  private toHttpException(error: unknown, logLabel: string): HttpException {
    const err = error as { message?: string; stack?: string; name?: string };
    // Log completo del error para debugging
    console.error(logLabel, {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      error,
    });

    const message = err?.message;
    if (message && BUSINESS_ERROR_MARKERS.some((m) => message.includes(m))) {
      return new HttpException(message, HttpStatus.BAD_REQUEST);
    }

    if (error instanceof HttpException) {
      return error;
    }

    // Para otros errores, devolver 500
    return new HttpException(
      message || 'Error interno del servidor al procesar la reserva',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
