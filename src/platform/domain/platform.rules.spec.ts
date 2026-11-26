import {
  MAX_TRIAL_EXTENSION_DAYS,
  canChangePlan,
  canExtendTrial,
  canReactivateBusiness,
  canSuspendBusiness,
  parseTrialDays,
} from './platform.rules';

const NOW = new Date('2026-11-26T10:00:00.000Z');
const IN_TWO_DAYS = new Date('2026-11-28T10:00:00.000Z');
const LAST_WEEK = new Date('2026-11-19T10:00:00.000Z');
/** The deadline of a trial that starts again: 14 days (the trial of the signup). */
const NEW_TRIAL = new Date('2026-12-10T10:00:00.000Z');

describe('the rules of the owner panel (spec 25)', () => {
  describe('suspending a business', () => {
    it('allows it when the installation keeps another business answering', () => {
      const result = canSuspendBusiness({ status: 'active' }, 3);

      expect(result.ok).toBe(true);
    });

    it('refuses to suspend the only active business of the system', () => {
      const result = canSuspendBusiness({ status: 'active' }, 1);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe(
        'No se puede suspender el único negocio activo del sistema.',
      );
      expect(result.error.kind).toBe('conflict');
    });

    it('refuses a business that is suspended already', () => {
      const result = canSuspendBusiness({ status: 'suspended' }, 3);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('Este negocio ya está suspendido.');
    });
  });

  describe('reactivating a business', () => {
    it('brings a suspended business back', () => {
      const result = canReactivateBusiness(
        { status: 'suspended', trialEndsAt: IN_TWO_DAYS },
        NOW,
      );

      expect(result).toEqual({
        ok: true,
        value: { statusChanged: true, trialEndsAt: null },
      });
    });

    it('starts again the trial of a suspended business whose trial expired', () => {
      const result = canReactivateBusiness(
        { status: 'suspended', trialEndsAt: LAST_WEEK },
        NOW,
      );

      expect(result).toEqual({
        ok: true,
        value: { statusChanged: true, trialEndsAt: NEW_TRIAL },
      });
    });

    it('starts again the trial of an active business whose trial expired', () => {
      const result = canReactivateBusiness(
        { status: 'active', trialEndsAt: LAST_WEEK },
        NOW,
      );

      expect(result).toEqual({
        ok: true,
        value: { statusChanged: false, trialEndsAt: NEW_TRIAL },
      });
    });

    it('refuses an active business whose trial is still running', () => {
      const result = canReactivateBusiness(
        { status: 'active', trialEndsAt: IN_TWO_DAYS },
        NOW,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('Este negocio ya está activo.');
    });

    it('refuses an active business without a trial', () => {
      const result = canReactivateBusiness(
        { status: 'active', trialEndsAt: null },
        NOW,
      );

      expect(result.ok).toBe(false);
    });
  });

  describe('extending the trial', () => {
    it('allows it for a business whose trial is still running', () => {
      const result = canExtendTrial({ trialEndsAt: IN_TWO_DAYS }, 7, NOW);

      expect(result).toEqual({ ok: true, value: 7 });
    });

    it('refuses a trial that expired: the business must be reactivated first', () => {
      const result = canExtendTrial({ trialEndsAt: LAST_WEEK }, 7, NOW);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe(
        'La prueba de este negocio ya venció: reactívalo antes de extenderla.',
      );
      expect(result.error.kind).toBe('conflict');
    });

    it('refuses a business without a trial', () => {
      const result = canExtendTrial({ trialEndsAt: null }, 7, NOW);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe(
        'Este negocio no tiene una prueba gratuita para extender.',
      );
    });

    it.each([
      [0],
      [-3],
      [MAX_TRIAL_EXTENSION_DAYS + 1],
      [1.5],
      ['abc'],
      [null],
      [undefined],
      [{}],
    ])('refuses %p days', (days) => {
      const result = canExtendTrial({ trialEndsAt: IN_TWO_DAYS }, days, NOW);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe(
        'Los días de la prueba deben ser un número entero entre 1 y 365.',
      );
      expect(result.error.kind).toBe('validation');
    });

    it('accepts the boundaries and a numeric string', () => {
      expect(parseTrialDays(1)).toEqual({ ok: true, value: 1 });
      expect(parseTrialDays(MAX_TRIAL_EXTENSION_DAYS)).toEqual({
        ok: true,
        value: MAX_TRIAL_EXTENSION_DAYS,
      });
      expect(parseTrialDays('30')).toEqual({ ok: true, value: 30 });
    });
  });

  describe('changing the plan by hand', () => {
    it('allows a different plan', () => {
      const result = canChangePlan({ planId: 'gratis' }, 'pro');

      expect(result).toEqual({ ok: true, value: 'pro' });
    });

    it('allows a plan for a business without a subscription', () => {
      const result = canChangePlan({ planId: null }, 'negocio');

      expect(result).toEqual({ ok: true, value: 'negocio' });
    });

    it('refuses a plan that does not exist', () => {
      const result = canChangePlan({ planId: 'gratis' }, 'platino');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('El plan elegido no existe.');
      expect(result.error.kind).toBe('validation');
    });

    it('refuses a change that changes nothing', () => {
      const result = canChangePlan({ planId: 'pro' }, 'pro');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('Este negocio ya está en el plan Pro.');
    });
  });
});
