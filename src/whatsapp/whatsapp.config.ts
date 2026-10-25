import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_API_VERSION = 'v21.0';

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

  isSendingConfigured(): boolean {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  private read(key: string): string | undefined {
    const value = this.config.get<string>(key)?.trim();
    return value ? value : undefined;
  }
}
