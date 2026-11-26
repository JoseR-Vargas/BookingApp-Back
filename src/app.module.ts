import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookingsModule } from './bookings/bookings.module';
import { EmailModule } from './email/email.module';
import { CatalogModule } from './catalog/catalog.module';
import { AvailabilityModule } from './availability/availability.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { BrandingModule } from './branding/branding.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { SignupModule } from './signup/signup.module';
import { AvailabilityCacheModule } from './availability/infrastructure/cache/availability-cache.module';
import { PublicRateLimitModule } from './shared/infrastructure/rate-limit/public-rate-limit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/booking',
    ),
    BookingsModule,
    EmailModule,
    CatalogModule,
    AvailabilityModule,
    WhatsappModule,
    AuthModule,
    AdminModule,
    BrandingModule,
    TenancyModule,
    SignupModule,
    PublicRateLimitModule,
    AvailabilityCacheModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
