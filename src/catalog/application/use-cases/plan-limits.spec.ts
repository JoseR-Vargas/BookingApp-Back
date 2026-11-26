import { DomainError } from '../../../shared/domain/domain-error';
import { FakePlanGate } from '../../../shared/testing/fake-plan-gate.testing';
import { CreateLocationUseCase } from './locations/create-location.use-case';
import { CreateProfessionalUseCase } from './professionals/create-professional.use-case';
import {
  fixedClock,
  inMemoryCatalog,
} from '../../infrastructure/in-memory-catalog.testing';

const PRO_LIMIT =
  'Alcanzaste el límite de profesionales del plan Gratis (1 profesional).';
const LOC_LIMIT = 'Alcanzaste el límite de locales del plan Gratis (1 local).';

describe('creating professionals and locations under a plan (spec 23)', () => {
  const professionalInput = {
    input: { name: 'Ana Ruiz', specialty: '', experience: '', active: true },
    photo: null,
  };
  const locationInput = {
    input: { name: 'Sucursal Norte' },
  } as unknown as Parameters<CreateLocationUseCase['execute']>[0];

  const build = () => {
    const clock = fixedClock(new Date('2026-11-26T10:00:00Z'));
    const c = inMemoryCatalog(clock);
    c.locations.seed({ id: 'principal', createdAt: new Date(0) });
    const plans = new FakePlanGate();
    return {
      c,
      plans,
      createProfessional: new CreateProfessionalUseCase(
        c.professionals,
        c.locations,
        c.activity,
        clock,
        plans,
      ),
      createLocation: new CreateLocationUseCase(c.locations, clock, plans),
    };
  };

  it('refuses a professional with the message of the limit and stores nothing', async () => {
    const { c, plans, createProfessional } = build();
    const before = c.professionals.count;
    plans.refuse.set('professional', new DomainError('forbidden', PRO_LIMIT));

    const result = await createProfessional.execute(professionalInput);

    expect(!result.ok && result.error.kind).toBe('forbidden');
    expect(!result.ok && result.error.message).toBe(PRO_LIMIT);
    expect(plans.asked).toEqual(['professional']);
    expect(c.professionals.count).toEqual(before);
  });

  it('creates a professional when the plan allows or there is no plan', async () => {
    const { plans, createProfessional } = build();
    expect((await createProfessional.execute(professionalInput)).ok).toBe(true);
    plans.verdict = { governs: true };
    expect((await createProfessional.execute(professionalInput)).ok).toBe(true);
  });

  it('refuses a location with the message of the limit', async () => {
    const { plans, createLocation } = build();
    plans.refuse.set('location', new DomainError('forbidden', LOC_LIMIT));
    const result = await createLocation.execute(locationInput);
    expect(!result.ok && result.error.message).toBe(LOC_LIMIT);
    expect(plans.asked).toEqual(['location']);
  });

  it('creates a location when the plan allows', async () => {
    const { createLocation } = build();
    expect((await createLocation.execute(locationInput)).ok).toBe(true);
  });
});
