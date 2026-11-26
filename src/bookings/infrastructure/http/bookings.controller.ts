// ===== CONTROLADOR DE RESERVAS =====
// The HTTP edge of the bookings module: same routes, same guards, same messages. The status now
// comes from the `kind` of the error (validation 400, not-found 404, conflict 409, unavailable
// 503) instead of looking for words inside the message.

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { Roles } from '../../../auth/infrastructure/http/roles.decorator';
import { DomainError } from '../../../shared/domain/domain-error';
import { Result } from '../../../shared/domain/result';
import { PublicRateLimitGuard } from '../../../shared/infrastructure/http/public-rate-limit.guard';
import { CancelBookingByTokenUseCase } from '../../application/use-cases/cancel-booking-by-token.use-case';
import { CheckSlotUseCase } from '../../application/use-cases/check-slot.use-case';
import { CreateBookingUseCase } from '../../application/use-cases/create-booking.use-case';
import { DeleteBookingUseCase } from '../../application/use-cases/delete-booking.use-case';
import { GetBookingUseCase } from '../../application/use-cases/get-booking.use-case';
import { GetCancellationUseCase } from '../../application/use-cases/get-cancellation.use-case';
import { GetStatisticsUseCase } from '../../application/use-cases/get-statistics.use-case';
import { ListBookingsUseCase } from '../../application/use-cases/list-bookings.use-case';
import { ListRecentBookingIdsUseCase } from '../../application/use-cases/list-recent-booking-ids.use-case';
import { UpdateBookingUseCase } from '../../application/use-cases/update-booking.use-case';
import { toBookingJson, toCreatedBookingJson } from './booking.presenter';

/** The Nest exception each kind means: the body is the one the API has always sent. */
const BY_KIND = {
  validation: (message: string) => new BadRequestException(message),
  'not-found': (message: string) => new NotFoundException(message),
  conflict: (message: string) => new ConflictException(message),
  forbidden: (message: string) => new ForbiddenException(message),
  unavailable: (message: string) => new ServiceUnavailableException(message),
} as const;

/** A domain failure keeps its message and gets the status its kind means. */
function toHttpException(error: unknown): HttpException {
  if (error instanceof DomainError) {
    const build = BY_KIND[error.kind] ?? BY_KIND.validation;
    return build(error.message);
  }
  if (error instanceof HttpException) {
    return error;
  }
  const message = (error as { message?: string })?.message;
  return new HttpException(
    message || 'Error interno del servidor al procesar la reserva',
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

/** Runs a use case and unwraps its Result, or fails with the matching HTTP error. */
async function unwrap<T>(run: () => Promise<Result<T>>): Promise<T> {
  try {
    const result = await run();
    if (!result.ok) throw toHttpException(result.error);
    return result.value;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw toHttpException(error);
  }
}

// Use 'bookings' because a global prefix 'api' is set in main.ts.
// Public: creating a booking, checking availability and the token-based cancel
// routes. Everything that reads or changes bookings in general is admin only.
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly listBookings: ListBookingsUseCase,
    private readonly listRecentIds: ListRecentBookingIdsUseCase,
    private readonly getBooking: GetBookingUseCase,
    private readonly updateBooking: UpdateBookingUseCase,
    private readonly deleteBooking: DeleteBookingUseCase,
    private readonly getCancellationUseCase: GetCancellationUseCase,
    private readonly cancelBookingUseCase: CancelBookingByTokenUseCase,
    private readonly checkSlot: CheckSlotUseCase,
    private readonly getStatisticsUseCase: GetStatisticsUseCase,
  ) {}

  @Post()
  @UseGuards(PublicRateLimitGuard)
  async create(@Body() body: unknown) {
    const created = await unwrap(() =>
      this.createBooking.execute(body as never),
    );
    return toCreatedBookingJson(created.booking, created.cancelToken);
  }

  /**
   * Public cancel page for the client. Authorised by the secret token in the
   * URL alone, so these two routes stay outside the admin guard.
   */
  @Get('cancel/:token')
  getCancellation(@Param('token') token: string) {
    return unwrap(() => this.getCancellationUseCase.execute(token));
  }

  @Post('cancel/:token')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('token') token: string) {
    return unwrap(() => this.cancelBookingUseCase.execute(token));
  }

  @UseGuards(AdminKeyGuard)
  @Get('statistics')
  getStatistics() {
    return unwrap(() => this.getStatisticsUseCase.execute());
  }

  @Post('availability')
  checkAvailability(
    @Body()
    body: {
      date: string;
      time: string;
      professionalId: string;
      serviceIds: string[];
      locationId?: string;
    },
  ) {
    return unwrap(() => this.checkSlot.execute(body));
  }

  @UseGuards(AdminKeyGuard)
  @Get()
  async findAll() {
    const bookings = await unwrap(() => this.listBookings.execute());
    return bookings.map(toBookingJson);
  }

  /**
   * The ids of the latest bookings: what the panel polls to know that a
   * booking arrived (there is no live socket in a serverless deployment).
   * It carries no data of the client.
   */
  @UseGuards(AdminKeyGuard)
  @Get('ids')
  async findRecentIds() {
    const ids = await unwrap(() => this.listRecentIds.execute());
    return { ids };
  }

  @UseGuards(AdminKeyGuard)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    // A malformed id fails inside the store: the error escapes to Nest, as it always did.
    const booking = await this.getBooking.execute(id).then((result) => {
      if (!result.ok) throw toHttpException(result.error);
      return result.value;
    });
    return booking ? toBookingJson(booking) : null;
  }

  @UseGuards(AdminKeyGuard)
  @Roles('staff', 'owner')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const booking = await unwrap(() =>
      this.updateBooking.execute(id, body as never),
    );
    return booking ? toBookingJson(booking) : null;
  }

  @UseGuards(AdminKeyGuard)
  @Roles('staff', 'owner')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const booking = await this.deleteBooking.execute(id).then((result) => {
      if (!result.ok) throw toHttpException(result.error);
      return result.value;
    });
    return booking ? toBookingJson(booking) : null;
  }
}
