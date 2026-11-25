import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { configureApp } from '../../../main';
import { DomainError, DomainErrorKind } from '../../domain/domain-error';

/** What the probe route throws next; each test sets it. */
let thrown: Error = new Error('unset');

@Controller('probe')
class ProbeController {
  @Get(':kind')
  fail(): never {
    throw thrown;
  }
}

/** The body Nest itself would send for the equivalent HTTP exception. */
const nestBody = {
  validation: new BadRequestException('Mensaje del dominio').getResponse(),
  'not-found': new NotFoundException('Mensaje del dominio').getResponse(),
  conflict: new ConflictException('Mensaje del dominio').getResponse(),
  forbidden: new ForbiddenException('Mensaje del dominio').getResponse(),
  unavailable: new ServiceUnavailableException(
    'Mensaje del dominio',
  ).getResponse(),
  tenant: new InternalServerErrorException('Mensaje del dominio').getResponse(),
};

const STATUS: Record<DomainErrorKind, number> = {
  validation: 400,
  'not-found': 404,
  conflict: 409,
  forbidden: 403,
  unavailable: 503,
  tenant: 500,
};

describe('DomainErrorFilter (registered by configureApp)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it.each(Object.keys(STATUS) as DomainErrorKind[])(
    'answers a "%s" domain error with its status and the same body Nest uses',
    async (kind) => {
      thrown = new DomainError(kind, 'Mensaje del dominio');

      const res = await request(app.getHttpServer()).get('/api/probe/x');

      expect(res.status).toBe(STATUS[kind]);
      expect(res.body).toEqual(nestBody[kind]);
    },
  );

  it('keeps the exact message, accents included', async () => {
    thrown = new DomainError(
      'validation',
      'El nombre debe tener 1 a 80 caracteres ñ.',
    );

    const res = await request(app.getHttpServer()).get('/api/probe/x');

    expect((res.body as { message: string }).message).toBe(
      'El nombre debe tener 1 a 80 caracteres ñ.',
    );
  });

  it('leaves every other error to Nest (an unknown error is still a 500)', async () => {
    thrown = new Error('boom');

    const res = await request(app.getHttpServer()).get('/api/probe/x');

    expect(res.status).toBe(500);
  });

  it('leaves HttpExceptions untouched', async () => {
    thrown = new BadRequestException('Otro mensaje');

    const res = await request(app.getHttpServer()).get('/api/probe/x');

    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toBe('Otro mensaje');
  });
});
