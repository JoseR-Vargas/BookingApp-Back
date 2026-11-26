import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { EMAIL_SENDER } from './application/ports/email-sender.port';
import { PUBLIC_APP_URL } from './application/ports/public-app-url.port';
import { SendBookingConfirmationUseCase } from './application/use-cases/send-booking-confirmation.use-case';
import { SendWelcomeEmailUseCase } from './application/use-cases/send-welcome-email.use-case';
import { SendCancellationConfirmationUseCase } from './application/use-cases/send-cancellation-confirmation.use-case';
import { TenancyModule } from '../tenancy/tenancy.module';
import { TenantPublicAppUrl } from './infrastructure/tenant-public-app-url';
import { MailerEmailSender } from './infrastructure/mailer-email-sender';

@Module({
  imports: [
    TenancyModule,
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: config.get<string>('GMAIL_USER'),
            pass: config.get<string>('GMAIL_APP_PASSWORD'),
          },
        },
        defaults: {
          from: config.get<string>('MAIL_FROM'),
        },
      }),
    }),
  ],
  providers: [
    { provide: EMAIL_SENDER, useClass: MailerEmailSender },
    { provide: PUBLIC_APP_URL, useClass: TenantPublicAppUrl },
    SendBookingConfirmationUseCase,
    SendCancellationConfirmationUseCase,
    SendWelcomeEmailUseCase,
    EmailService,
  ],
  exports: [
    EmailService,
    SendWelcomeEmailUseCase,
    // The reminders of spec 24 send through the same mailer and build their
    // links with the same public URL.
    EMAIL_SENDER,
    PUBLIC_APP_URL,
  ],
})
export class EmailModule {}
