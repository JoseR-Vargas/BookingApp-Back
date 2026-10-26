import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_API_VERSION = 'v21.0';
const DEFAULT_ADMIN_TEMPLATE_NAME = 'nueva_reserva';
const DEFAULT_ADMIN_TEMPLATE_LANG = 'es';
/** E.164 allows at most 15 digits; below 8 is not a dialable number. */
const PHONE_DIGITS = /^\d{8,15}$/;

/**
 * WhatsApp Cloud API settings. Every value is optional: with none set the
 * app boots, outbound sends are skipped and the webhook fails closed.
 * Values are read lazily so a missing variable never breaks module init.
 */
@Injectable()
export class WhatsappConfig {
  constructor(private readonly config: ConfigService) {}

  get accessToken(): string | undefined {
    return this.read('WHATSAPP_ACCESS_TOKEN');
  }

  get phoneNumberId(): string | undefined {
    return this.read('WHATSAPP_PHONE_NUMBER_ID');
  }

  get appSecret(): string | undefined {
    return this.read('WHATSAPP_APP_SECRET');
  }

  get verifyToken(): string | undefined {
    return this.read('WHATSAPP_VERIFY_TOKEN');
  }

  get apiVersion(): string {
    return this.read('WHATSAPP_API_VERSION') ?? DEFAULT_API_VERSION;
  }

  /**
   * Admin's WhatsApp number as digits only (country code, no `+`). Returns
   * undefined when unset or when it does not look like a phone number.
   */
  get adminNumber(): string | undefined {
    const digits = this.read('ADMIN_WHATSAPP_NUMBER')?.replace(
      /[+\s\-()]/g,
      '',
    );
    return digits && PHONE_DIGITS.test(digits) ? digits : undefined;
  }

  get adminTemplateName(): string {
    return (
      this.read('WHATSAPP_ADMIN_TEMPLATE_NAME') ?? DEFAULT_ADMIN_TEMPLATE_NAME
    );
  }

  get adminTemplateLang(): string {
    return (
      this.read('WHATSAPP_ADMIN_TEMPLATE_LANG') ?? DEFAULT_ADMIN_TEMPLATE_LANG
    );
  }

  isSendingConfigured(): boolean {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  private read(key: string): string | undefined {
    const value = this.config.get<string>(key)?.trim();
    return value ? value : undefined;
  }
}
