import { PlanLimitReached } from './billing.errors';
import { checkLimit, monthBounds } from './limits.rules';

describe('checkLimit', () => {
  it('allows creating while the count is under the limit', () => {
    expect(checkLimit('gratis', 'professionals', 0).ok).toBe(true);
    expect(checkLimit('pro', 'professionals', 2).ok).toBe(true);
    expect(checkLimit('negocio', 'bookings', 1999).ok).toBe(true);
  });

  it('refuses at the limit naming the limit and the plan that solves it (professionals)', () => {
    const result = checkLimit('gratis', 'professionals', 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(PlanLimitReached);
    expect(result.error.kind).toBe('forbidden');
    expect(result.error.message).toBe(
      'Alcanzaste el límite de profesionales del plan Gratis (1 profesional). Contrata el plan Pro (hasta 3 profesionales) para ampliarlo.',
    );
  });

  it('refuses at the limit (locations)', () => {
    const result = checkLimit('pro', 'locations', 2);
    expect(!result.ok && result.error.message).toBe(
      'Alcanzaste el límite de locales del plan Pro (2 locales). Contrata el plan Negocio (hasta 5 locales) para ampliarlo.',
    );
  });

  it('refuses at the limit (bookings of the month)', () => {
    const result = checkLimit('gratis', 'bookings', 50);
    expect(!result.ok && result.error.message).toBe(
      'Alcanzaste el límite de reservas al mes del plan Gratis (50 reservas al mes). Contrata el plan Pro (hasta 500 reservas al mes) para ampliarlo.',
    );
  });

  it('refuses above the limit too (data that predates the plan)', () => {
    expect(checkLimit('gratis', 'locations', 4).ok).toBe(false);
  });

  it('on the biggest plan it points to support, not to a plan', () => {
    const result = checkLimit('negocio', 'professionals', 10);
    expect(!result.ok && result.error.message).toBe(
      'Alcanzaste el límite de profesionales del plan Negocio (10 profesionales). Contacta con soporte para ampliarlo.',
    );
  });
});

describe('monthBounds (UTC calendar month)', () => {
  it('spans from the first instant of the month to the first of the next', () => {
    const { start, end } = monthBounds(new Date('2026-11-25T10:00:00Z'));
    expect(start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('rolls over the year', () => {
    const { start, end } = monthBounds(new Date('2026-12-31T23:59:59Z'));
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
