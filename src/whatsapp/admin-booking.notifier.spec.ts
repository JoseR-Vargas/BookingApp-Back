import { Logger } from '@nestjs/common';
import { AdminBookingNotifier } from './admin-booking.notifier';
import { AdminNotifiableBooking } from './admin-booking.params';
import { WhatsappApiError, WhatsappClient } from './whatsapp.client';
import { WhatsappConfig } from './whatsapp.config';

const booking: AdminNotifiableBooking = {
  client: { name: 'Juan Pérez', phone: '1234567890' },
  service: { name: 'Servicio Básico' },
  professional: { name: 'Alex García' },
  date: '2026-03-25',
  time: '10:00',
};

describe('AdminBookingNotifier', () => {
  let settings: {
    adminNumber: string | undefined;
    adminTemplateName: string;
    adminTemplateLang: string;
    isSendingConfigured: jest.Mock;
  };
  let sendTemplate: jest.Mock;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let notifier: AdminBookingNotifier;

  beforeEach(() => {
    settings = {
      adminNumber: '5491155551234',
      adminTemplateName: 'nueva_reserva',
      adminTemplateLang: 'es',
      isSendingConfigured: jest.fn().mockReturnValue(true),
    };
    sendTemplate = jest
      .fn()
      .mockResolvedValue({ status: 'sent', messageId: 'wamid.1' });
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    notifier = new AdminBookingNotifier(
      settings as unknown as WhatsappConfig,
      { sendTemplate } as unknown as WhatsappClient,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends the template to the admin with the 6 ordered params', async () => {
    await notifier.notifyNewBooking(booking);

    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate).toHaveBeenCalledWith(
      '5491155551234',
      'nueva_reserva',
      'es',
      [
        'Juan Pérez',
        'Servicio Básico',
        'Alex García',
        '25/03/2026',
        '10:00',
        '1234567890',
      ],
    );
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('uses the configured template name and language', async () => {
    settings.adminTemplateName = 'otra';
    settings.adminTemplateLang = 'es_AR';

    await notifier.notifyNewBooking(booking);

    expect(sendTemplate).toHaveBeenCalledWith(
      '5491155551234',
      'otra',
      'es_AR',
      expect.any(Array),
    );
  });

  it('does nothing but a single warn when the admin number is unset or invalid', async () => {
    settings.adminNumber = undefined;

    await expect(notifier.notifyNewBooking(booking)).resolves.toBeUndefined();

    expect(sendTemplate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('ADMIN_WHATSAPP_NUMBER'),
    );
  });

  it('does nothing but a single warn when sending is not configured', async () => {
    settings.isSendingConfigured.mockReturnValue(false);

    await expect(notifier.notifyNewBooking(booking)).resolves.toBeUndefined();

    expect(sendTemplate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never throws on a WhatsApp API error and logs it without the token', async () => {
    sendTemplate.mockRejectedValue(
      new WhatsappApiError(400, {
        error: { message: '(#132001) Template name does not exist' },
      }),
    );

    await expect(notifier.notifyNewBooking(booking)).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Template name does not exist'),
    );
    expect(error).not.toHaveBeenCalledWith(
      expect.stringMatching(/bearer|token/i),
    );
  });

  it('never throws on unexpected errors (network, malformed booking)', async () => {
    sendTemplate.mockRejectedValue(new Error('network down'));
    await expect(notifier.notifyNewBooking(booking)).resolves.toBeUndefined();

    sendTemplate.mockClear();
    await expect(
      notifier.notifyNewBooking(null as unknown as AdminNotifiableBooking),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
  });
});
