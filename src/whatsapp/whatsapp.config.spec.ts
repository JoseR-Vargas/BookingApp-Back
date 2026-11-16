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

  describe('admin notification settings', () => {
    it('has no admin number and default template name/lang with an empty env', () => {
      const config = build({});

      expect(config.adminNumber).toBeUndefined();
      expect(config.adminTemplateName).toBe('nueva_reserva');
      expect(config.adminTemplateLang).toBe('es');
    });

    it('has no cancel template unless one is configured', () => {
      expect(build({}).adminCancelTemplateName).toBeUndefined();
      expect(
        build({ WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME: '   ' })
          .adminCancelTemplateName,
      ).toBeUndefined();
      expect(
        build({ WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME: ' reserva_cancelada ' })
          .adminCancelTemplateName,
      ).toBe('reserva_cancelada');
    });

    it('reads the admin variables from the environment', () => {
      const config = build({
        ADMIN_WHATSAPP_NUMBER: '5491155551234',
        WHATSAPP_ADMIN_TEMPLATE_NAME: 'otra_plantilla',
        WHATSAPP_ADMIN_TEMPLATE_LANG: 'es_AR',
      });

      expect(config.adminNumber).toBe('5491155551234');
      expect(config.adminTemplateName).toBe('otra_plantilla');
      expect(config.adminTemplateLang).toBe('es_AR');
    });

    it.each([
      ['+54 9 (11) 5555-1234', '5491155551234'],
      ['  +34-600-123-456 ', '34600123456'],
    ])('sanitizes the admin number %p', (raw, expected) => {
      expect(build({ ADMIN_WHATSAPP_NUMBER: raw }).adminNumber).toBe(expected);
    });

    it.each(['1234567', '1234567890123456', 'abc12345678', '+54 9 11 call'])(
      'rejects an invalid admin number %p',
      (raw) => {
        expect(
          build({ ADMIN_WHATSAPP_NUMBER: raw }).adminNumber,
        ).toBeUndefined();
      },
    );

    it('treats blank template settings as defaults', () => {
      const config = build({
        WHATSAPP_ADMIN_TEMPLATE_NAME: '  ',
        WHATSAPP_ADMIN_TEMPLATE_LANG: '',
      });

      expect(config.adminTemplateName).toBe('nueva_reserva');
      expect(config.adminTemplateLang).toBe('es');
    });
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
