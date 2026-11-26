import { STORAGE_LIMIT_MESSAGE } from '../../../shared/domain/storage-limit.error';
import { StorageGate } from '../../../shared/application/storage-gate.port';
import { buildBookings } from '../../bookings.testing';
import { CreateBookingUseCase } from './create-booking.use-case';

describe('CreateBookingUseCase over the storage quota (spec 22)', () => {
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

  const withGate = (allows: boolean) => {
    const b = buildBookings();
    const asked: string[] = [];
    const gate: StorageGate = {
      allowsNewData: () => {
        asked.push('storage');
        return Promise.resolve(allows);
      },
    };
    const useCase = new CreateBookingUseCase(
      b.catalog,
      b.repository,
      b.repository,
      b.tokens,
      b.notifier,
      b.trial,
      gate,
    );
    return { b, useCase, asked };
  };

  it('answers a forbidden failure with the exact message and stores nothing', async () => {
    const { b, useCase } = withGate(false);

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('forbidden');
    expect(result.error.message).toBe(
      'Este negocio alcanzó el límite de almacenamiento de su plan.',
    );
    expect(STORAGE_LIMIT_MESSAGE).toBe(result.error.message);
    expect(b.notifier.created_).toEqual([]);
    expect(await b.list.execute()).toEqual({ ok: true, value: [] });
    expect(b.catalog.calls).toEqual({});
  });

  it('books normally when the business has room', async () => {
    const { useCase, asked } = withGate(true);
    expect((await useCase.execute(input)).ok).toBe(true);
    expect(asked).toEqual(['storage']);
  });

  it('keeps the trial message first when both limits apply', async () => {
    const { b, useCase, asked } = withGate(false);
    b.trial.open = false;
    const result = await useCase.execute(input);
    expect(!result.ok && result.error.message).toBe(
      'Este negocio alcanzó el límite de su prueba.',
    );
    expect(asked).toEqual([]);
  });

  it('works without a gate (as before)', async () => {
    const b = buildBookings();
    expect((await b.create.execute(input)).ok).toBe(true);
  });
});
