import { Injectable, Logger } from '@nestjs/common';
import { SendWelcomeEmailUseCase } from '../../email/application/use-cases/send-welcome-email.use-case';
import {
  WelcomeMessage,
  WelcomeNotifier,
} from '../application/ports/welcome-notifier.port';

/**
 * Sends the welcome through the email module without making the signup wait
 * for the mail server. Without mail configured, or when the send fails, it
 * only logs a warning: the business is already created and usable.
 */
@Injectable()
export class EmailWelcomeNotifier implements WelcomeNotifier {
  private readonly logger = new Logger(EmailWelcomeNotifier.name);

  constructor(private readonly welcome: SendWelcomeEmailUseCase) {}

  send(message: WelcomeMessage): Promise<void> {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      this.logger.warn(
        `Mail is not configured: the welcome email for "${message.businessName}" was not sent.`,
      );
      return Promise.resolve();
    }
    // Started inside the scope of the new business, so the link names it.
    this.welcome.execute(message).catch((error: unknown) => {
      this.logger.warn(
        `The welcome email for "${message.businessName}" could not be sent: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return Promise.resolve();
  }
}
