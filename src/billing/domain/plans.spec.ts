import { PLANS, PLAN_IDS, isPlanId, planById } from './plans';

describe('plans (system configuration)', () => {
  it('defines gratis, pro and negocio with the limits of spec 23', () => {
    expect(PLAN_IDS).toEqual(['gratis', 'pro', 'negocio']);
    expect(planById('gratis').limits).toEqual({
      professionals: 1,
      locations: 1,
      bookingsPerMonth: 50,
      publicPage: false,
      reminders: false,
    });
    expect(planById('pro').limits).toEqual({
      professionals: 3,
      locations: 2,
      bookingsPerMonth: 500,
      publicPage: true,
      reminders: true,
    });
    expect(planById('negocio').limits).toEqual({
      professionals: 10,
      locations: 5,
      bookingsPerMonth: 2000,
      publicPage: true,
      reminders: true,
    });
  });

  it('lists the plans from the smallest to the biggest', () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(PLAN_IDS);
    expect(PLANS.map((plan) => plan.name)).toEqual([
      'Gratis',
      'Pro',
      'Negocio',
    ]);
  });

  it('recognizes only the three plan ids', () => {
    expect(isPlanId('pro')).toBe(true);
    expect(isPlanId('enterprise')).toBe(false);
    expect(isPlanId(undefined)).toBe(false);
    expect(isPlanId(3)).toBe(false);
  });
});
