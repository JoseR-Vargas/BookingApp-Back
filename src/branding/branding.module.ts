import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BRANDING_READER } from './application/ports/branding.reader';
import { BRANDING_WRITER } from './application/ports/branding.writer';
import { CLOCK } from './application/ports/clock.port';
import { DeleteLogoUseCase } from './application/use-cases/delete-logo.use-case';
import { GetBrandingUseCase } from './application/use-cases/get-branding.use-case';
import { GetLogoUseCase } from './application/use-cases/get-logo.use-case';
import { SaveBrandingUseCase } from './application/use-cases/save-branding.use-case';
import { SaveLogoUseCase } from './application/use-cases/save-logo.use-case';
import { BrandingAdminController } from './infrastructure/http/branding-admin.controller';
import { BrandingController } from './infrastructure/http/branding.controller';
import {
  BrandingRecord,
  BrandingSchema,
} from './infrastructure/persistence/mongo/branding.entity';
import { MongoBrandingRepository } from './infrastructure/persistence/mongo/mongo-branding.repository';
import { SystemClock } from './infrastructure/system.clock';

/**
 * Composition root of branding: the only place where ports are bound to
 * adapters. Swapping the database means a new adapter and changing these lines.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BrandingRecord.name, schema: BrandingSchema },
    ]),
  ],
  controllers: [BrandingController, BrandingAdminController],
  providers: [
    MongoBrandingRepository,
    { provide: BRANDING_READER, useExisting: MongoBrandingRepository },
    { provide: BRANDING_WRITER, useExisting: MongoBrandingRepository },
    { provide: CLOCK, useClass: SystemClock },
    GetBrandingUseCase,
    GetLogoUseCase,
    SaveBrandingUseCase,
    SaveLogoUseCase,
    DeleteLogoUseCase,
  ],
})
export class BrandingModule {}
