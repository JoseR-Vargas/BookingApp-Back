import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BrandingAdminController } from './branding-admin.controller';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { BrandingRecord, BrandingSchema } from './schemas/branding.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BrandingRecord.name, schema: BrandingSchema },
    ]),
  ],
  controllers: [BrandingController, BrandingAdminController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
