import { DomainError } from '../../../shared/domain/domain-error';
import { FakePlanGate } from '../../../shared/testing/fake-plan-gate.testing';
import { buildBookings } from '../../bookings.testing';
import { CreateBookingUseCase } from './create-booking.use-case';

const LIMIT =
  'Alcanzaste el límite de reservas al mes del plan Pro (500 reservas al mes).';

describe('CreateBookingUseCase under a plan (spec 23)', () => {
  const input = {
    client: {
      name: 'Juan Pérez',
      email: 'juan@example.com',
      phone: '1234567890',
    },
    services: [{ id: 'corte' }],
    professional: { id: 'alex', name: 'Alex García' },
    date: '2026-03-25',
    time: '10:00',
  };

  const build = () => {
    const b = buildBookings();
    const plans = new FakePlanGate();
    const useCase = new CreateBookingUseCase(
      b.catalog,
      b.repository,
      b.repository,
      b.tokens,
      b.notifier,
      b.trial,
      undefined,
      plans,
    );
    return { b, plans, useCase };
  };

  it('refuses with the message of the plan, stores nothing and notifies nobody', async () => {
    const { b, plans, useCase } = build();
    plans.refuse.set('booking', new DomainError('forbidden', LIMIT));

    const result = await useCase.execute(input);

    expect(!result.ok && result.error.kind).toBe('forbidden');
    expect(!result.ok && result.error.message).toBe(LIMIT);
    expect(plans.asked).toEqual(['booking']);
    expect(b.notifier.created_).toEqual([]);
    expect(await b.list.execute()).toEqual({ ok: true, value: [] });
  });

  it('books when the plan allows', async () => {
    const { plans, useCase } = build();
    plans.verdict = { governs: true };
    expect((await useCase.execute(input)).ok).toBe(true);
  });

  it('a plan that governs replaces the trial: a paying business is not blocked by its old trial', async () => {
    const { b, plans, useCase } = build();
    b.trial.open = false;
    plans.verdict = { governs: true };
    expect((await useCase.execute(input)).ok).toBe(true);
  });

  it('without a plan governing, the trial still blocks (as before)', async () => {
    const { b, useCase } = build();
    b.trial.open = false;
    const result = await useCase.execute(input);
    expect(!result.ok && result.error.message).toBe(
      'Este negocio alcanzó el límite de su prueba.',
    );
  });

  it('the storage quota still applies under a plan', async () => {
    const b = buildBookings();
    const plans = new FakePlanGate();
    plans.verdict = { governs: true };
    const useCase = new CreateBookingUseCase(
      b.catalog,
      b.repository,
      b.repository,
      b.tokens,
      b.notifier,
      b.trial,
      { allowsNewData: () => Promise.resolve(false) },
      plans,
    );
    const result = await useCase.execute(input);
    expect(!result.ok && result.error.message).toBe(
      'Este negocio alcanzó el límite de almacenamiento de su plan.',
    );
  });
});
