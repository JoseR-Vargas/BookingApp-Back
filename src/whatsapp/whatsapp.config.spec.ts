import { ConfigService } from '@nestjs/config';
import { WhatsappConfig } from './whatsapp.config';

const build = (env: Record<string, string | undefined>) =>
  new WhatsappConfig({
    get: (key: string) => env[key],
  } as unknown as ConfigService);

describe('WhatsappConfig', () => {
  it('is unconfigured and uses the default API version with an empty env', () => {
    const config = build({});

    expect(config.accessToken).toBeUndefined();
    expect(config.phoneNumberId).toBeUndefined();
    expect(config.appSecret).toBeUndefined();
    expect(config.verifyToken).toBeUndefined();
    expect(config.apiVersion).toBe('v21.0');
    expect(config.isSendingConfigured()).toBe(false);
  });

  it('reads every variable from the environment', () => {
    const config = build({
      WHATSAPP_ACCESS_TOKEN: 'token',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_APP_SECRET: 'secret',
      WHATSAPP_VERIFY_TOKEN: 'verify',
      WHATSAPP_API_VERSION: 'v22.0',
    });

    expect(config.accessToken).toBe('token');
    expect(config.phoneNumberId).toBe('123');
    expect(config.appSecret).toBe('secret');
    expect(config.verifyToken).toBe('verify');
    expect(config.apiVersion).toBe('v22.0');
    expect(config.isSendingConfigured()).toBe(true);
  });

  it('treats blank values as unset', () => {
    const config = build({
      WHATSAPP_ACCESS_TOKEN: '   ',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_API_VERSION: '',
    });

    expect(config.accessToken).toBeUndefined();
    expect(config.apiVersion).toBe('v21.0');
    expect(config.isSendingConfigured()).toBe(false);
  });

  it('needs both the token and the phone number id to send', () => {
    expect(build({ WHATSAPP_ACCESS_TOKEN: 't' }).isSendingConfigured()).toBe(
      false,
    );
    expect(build({ WHATSAPP_PHONE_NUMBER_ID: '1' }).isSendingConfigured()).toBe(
      false,
    );
  });
});
