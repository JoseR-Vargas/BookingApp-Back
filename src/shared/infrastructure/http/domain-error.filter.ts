import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, DomainErrorKind } from '../../domain/domain-error';

const TO_HTTP: Record<DomainErrorKind, (message: string) => HttpException> = {
  validation: (message) => new BadRequestException(message),
  'not-found': (message) => new NotFoundException(message),
  conflict: (message) => new ConflictException(message),
  forbidden: (message) => new ForbiddenException(message),
};

/**
 * The single place where a domain error becomes an HTTP answer. It builds the
 * equivalent Nest exception and sends its status and body, so the response is
 * byte-for-byte what the module sent before it raised domain errors.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    const exception = TO_HTTP[error.kind](error.message);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.getStatus())
      .json(exception.getResponse());
  }
}
