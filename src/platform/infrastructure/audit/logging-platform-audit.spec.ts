import { Logger } from '@nestjs/common';
import { LoggingPlatformAudit } from './logging-platform-audit';

describe('LoggingPlatformAudit (spec 25)', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => log.mockRestore());

  const audit = new LoggingPlatformAudit();

  it('records a manual change of the plan with the business, the old plan and the new one', async () => {
    await audit.record({
      businessId: '6a1b2c3d4e5f60718293a4b5',
      action: 'change-plan',
      from: 'gratis',
      to: 'pro',
      detail: 'cambio manual, sin pasarela de pago',
    });

    expect(log).toHaveBeenCalledTimes(1);
    const message = String(log.mock.calls[0][0]);
    expect(message).toContain('6a1b2c3d4e5f60718293a4b5');
    expect(message).toContain('gratis');
    expect(message).toContain('pro');
  });

  it('records a suspension, a reactivation and an extension of a trial', async () => {
    await audit.record({
      businessId: 'abc',
      action: 'suspend',
      from: 'active',
      to: 'suspended',
      detail: null,
    });
    await audit.record({
      businessId: 'abc',
      action: 'reactivate',
      from: 'suspended',
      to: 'active',
      detail: null,
    });
    await audit.record({
      businessId: 'abc',
      action: 'extend-trial',
      from: null,
      to: null,
      detail: '7 días (nuevo límite 2026-12-05T10:00:00.000Z)',
    });

    expect(log).toHaveBeenCalledTimes(3);
    expect(String(log.mock.calls[0][0])).toContain('abc');
    expect(String(log.mock.calls[1][0])).toContain('abc');
    expect(String(log.mock.calls[2][0])).toContain('7 días');
  });
});
