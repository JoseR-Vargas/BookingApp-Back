import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingDto } from './dto/create-booking.dto';

// Messages produced by BookingsService that are client (400) errors.
const BUSINESS_ERROR_MARKERS = [
  'Ya existe una reserva',
  'Ya tienes una reserva',
  'es requerido',
  'Error de validación',
];

// Use 'bookings' because a global prefix 'api' is set in main.ts
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

  @Get('statistics')
  getStatistics() {
    return this.bookingsService.getStatistics();
  }

  @Post('availability')
  checkAvailability(
    @Body() body: { date: string; time: string; professionalId: string },
  ) {
    return this.bookingsService.checkAvailability(
      body.date,
      body.time,
      body.professionalId,
    );
  }

  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

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
