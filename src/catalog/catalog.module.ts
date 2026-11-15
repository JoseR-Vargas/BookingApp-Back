import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import {
  BusinessSettingsRecord,
  BusinessSettingsSchema,
} from './schemas/business-settings.schema';
import {
  ProfessionalRecord,
  ProfessionalSchema,
} from './schemas/professional.schema';
import { ServiceRecord, ServiceSchema } from './schemas/service.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProfessionalRecord.name, schema: ProfessionalSchema },
      { name: ServiceRecord.name, schema: ServiceSchema },
      { name: BusinessSettingsRecord.name, schema: BusinessSettingsSchema },
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogAdminService],
  exports: [CatalogService, CatalogAdminService],
})
export class CatalogModule {}
