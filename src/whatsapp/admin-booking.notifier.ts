import { Injectable, Logger } from '@nestjs/common';
import {
  AdminNotifiableBooking,
  buildAdminTemplateParams,
} from './admin-booking.params';
import { WhatsappClient } from './whatsapp.client';
import { WhatsappConfig } from './whatsapp.config';

/**
 * Tells the admin on WhatsApp (utility templates) that a booking was created
 * or cancelled. Best effort: it never throws, so a notification problem can
 * never break the booking flow that calls it.
 */
@Injectable()
export class AdminBookingNotifier {
  private readonly logger = new Logger(AdminBookingNotifier.name);

  constructor(
    private readonly config: WhatsappConfig,
    private readonly client: WhatsappClient,
  ) {}

  async notifyNewBooking(booking: AdminNotifiableBooking): Promise<void> {
    await this.notify(this.config.adminTemplateName, booking);
  }

  /** Same message shape as a new booking, with the cancel template. */
  async notifyCancelledBooking(booking: AdminNotifiableBooking): Promise<void> {
    const templateName = this.config.adminCancelTemplateName;
    if (!templateName) {
      this.logger.warn(
        'Admin cancellation notice skipped: WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME is unset',
      );
      return;
    }
    await this.notify(templateName, booking);
  }

  private async notify(
    templateName: string,
    booking: AdminNotifiableBooking,
  ): Promise<void> {
    try {
      const adminNumber = this.config.adminNumber;
      if (!adminNumber) {
        this.logger.warn(
          'Admin notification skipped: ADMIN_WHATSAPP_NUMBER is unset or not a valid number (8-15 digits)',
        );
        return;
      }
      if (!this.config.isSendingConfigured()) {
        this.logger.warn(
          'Admin notification skipped: WhatsApp sending is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)',
        );
        return;
      }

      await this.client.sendTemplate(
        adminNumber,
        templateName,
        this.config.adminTemplateLang,
        buildAdminTemplateParams(booking),
      );
    } catch (error) {
      // Only the message is logged: API errors carry no credentials.
      this.logger.error(
        `Admin notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
