import { DomainError } from '../../../../shared/domain/domain-error';
import { Err, Ok, Result } from '../../../../shared/domain/result';
import {
  InvalidCatalogDataError,
  ServiceHasUpcomingBookingsError,
  ServiceNotFoundError,
} from '../../../domain/catalog.errors';
import { inMemoryCatalog } from '../../../infrastructure/in-memory-catalog.testing';

const valueOf = <T>(result: Result<T, DomainError>): T => {
  expect(result.ok).toBe(true);
  return (result as Ok<T>).value;
};

const errorOf = (result: Result<unknown, DomainError>): DomainError => {
  expect(result.ok).toBe(false);
  return (result as Err<DomainError>).error;
};

const INPUT = {
  name: 'Corte Clásico',
  description: 'Corte a tijera',
  price: 1500,
  duration: 45,
  professionals: ['alex-garcia'],
  active: true,
};

function setup() {
  const kit = inMemoryCatalog();
  kit.professionals.seed({ id: 'alex-garcia', name: 'Alex García' });
  kit.professionals.seed({ id: 'maria-lopez', name: 'María López' });
  kit.services.seed({
    id: 'servicio-basico',
    name: 'Servicio Básico',
    price: 1200,
    duration: 60,
    professionals: ['alex-garcia', 'maria-lopez'],
  });
  return kit;
}

describe('service use cases (in-memory adapters)', () => {
  describe('CreateServiceUseCase', () => {
    it('stores the service with a slug id and the default icon', async () => {
      const { useCases, services } = setup();
      const created = valueOf(await useCases.createService.execute(INPUT));
      expect(created).toEqual({
        id: 'corte-clasico',
        ...INPUT,
        icon: 'fas fa-star',
      });
      expect(services.count).toBe(2);
    });

    it('suffixes the id on collision and never overwrites', async () => {
      const { useCases, services } = setup();
      await useCases.createService.execute(INPUT);
      const second = valueOf(await useCases.createService.execute(INPUT));
      const third = valueOf(await useCases.createService.execute(INPUT));
      expect([second.id, third.id]).toEqual([
        'corte-clasico-2',
        'corte-clasico-3',
      ]);
      expect(services.count).toBe(4);
    });

    it('rejects professionals that do not exist, listing them, without inserting', async () => {
      const { useCases, services } = setup();
      const error = errorOf(
        await useCases.createService.execute({
          ...INPUT,
          professionals: ['alex-garcia', 'ghost', 'phantom'],
        }),
      );
      expect(error).toBeInstanceOf(InvalidCatalogDataError);
      expect(error.kind).toBe('validation');
      expect(error.message).toBe('professionals not found: ghost, phantom');
      expect(services.count).toBe(1);
    });

    it('accepts inactive professionals as existing', async () => {
      const { useCases, professionals } = setup();
      await professionals.update('maria-lopez', { active: false });
      const created = valueOf(
        await useCases.createService.execute({
          ...INPUT,
          professionals: ['maria-lopez'],
        }),
      );
      expect(created.professionals).toEqual(['maria-lopez']);
    });

    it('does not reuse the id of a deleted service that still has bookings', async () => {
      const { useCases, services, activity } = setup();
      activity.seed({
        professionalId: 'zzz',
        serviceIds: ['servicio-basico'],
        date: '2000-01-01',
        status: 'cancelled',
      });
      await services.delete('servicio-basico');
      const created = valueOf(
        await useCases.createService.execute({
          ...INPUT,
          name: 'Servicio Básico',
        }),
      );
      expect(created.id).toBe('servicio-basico-2');
    });

    it('reuses the id of a deleted service without bookings', async () => {
      const { useCases, services } = setup();
      await services.delete('servicio-basico');
      const created = valueOf(
        await useCases.createService.execute({
          ...INPUT,
          name: 'Servicio Básico',
        }),
      );
      expect(created.id).toBe('servicio-basico');
    });

    it('two simultaneous creations with the same name get different ids', async () => {
      const { useCases } = setup();
      const created = await Promise.all([
        useCases.createService.execute(INPUT),
        useCases.createService.execute(INPUT),
      ]);
      expect(created.map((r) => valueOf(r).id).sort()).toEqual([
        'corte-clasico',
        'corte-clasico-2',
      ]);
    });
  });

  describe('UpdateServiceUseCase', () => {
    it('updates the given fields only', async () => {
      const { useCases } = setup();
      const updated = valueOf(
        await useCases.updateService.execute({
          id: 'servicio-basico',
          patch: { price: 1300, duration: 75, professionals: ['maria-lopez'] },
        }),
      );
      expect(updated).toMatchObject({
        id: 'servicio-basico',
        name: 'Servicio Básico',
        price: 1300,
        duration: 75,
        professionals: ['maria-lopez'],
        icon: 'fas fa-star',
        active: true,
      });
    });

    it('answers not-found for an unknown id, with the current message', async () => {
      const { useCases } = setup();
      const error = errorOf(
        await useCases.updateService.execute({
          id: 'nope',
          patch: { price: 1 },
        }),
      );
      expect(error).toBeInstanceOf(ServiceNotFoundError);
      expect(error.kind).toBe('not-found');
      expect(error.message).toBe('Service "nope" not found');
    });

    it('rejects unknown professionals and leaves the service untouched', async () => {
      const { useCases, services } = setup();
      const error = errorOf(
        await useCases.updateService.execute({
          id: 'servicio-basico',
          patch: { professionals: ['ghost'] },
        }),
      );
      expect(error.message).toBe('professionals not found: ghost');
      expect((await services.find('servicio-basico'))?.professionals).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
    });

    it('checks the professionals before the service: unknown id with unknown professionals is a validation error', async () => {
      const { useCases } = setup();
      const error = errorOf(
        await useCases.updateService.execute({
          id: 'nope',
          patch: { professionals: ['ghost'] },
        }),
      );
      expect(error).toBeInstanceOf(InvalidCatalogDataError);
    });
  });

  describe('DeactivateServiceUseCase', () => {
    it('sets active to false and keeps the service, and answers not-found for an unknown id', async () => {
      const { useCases, services } = setup();
      const off = valueOf(
        await useCases.deactivateService.execute('servicio-basico'),
      );
      expect(off.active).toBe(false);
      expect(services.count).toBe(1);
      expect(
        errorOf(await useCases.deactivateService.execute('nope')),
      ).toBeInstanceOf(ServiceNotFoundError);
    });
  });

  describe('DeleteServicePermanentlyUseCase', () => {
    const TODAY = '2030-06-15';
    const booking = (
      serviceIds: string[],
      date: string,
      status: 'confirmed' | 'cancelled' = 'confirmed',
    ) => ({ professionalId: 'zzz', serviceIds, date, status });

    it('answers not-found for an unknown service', async () => {
      const { useCases } = setup();
      const error = errorOf(
        await useCases.deleteServicePermanently.execute({
          id: 'nope',
          today: TODAY,
        }),
      );
      expect(error.kind).toBe('not-found');
      expect(error.message).toBe('Service "nope" not found');
    });

    it('refuses with a conflict while it has upcoming confirmed bookings, deleting nothing', async () => {
      const { useCases, services, activity } = setup();
      activity.seed(booking(['servicio-basico'], TODAY));
      activity.seed(booking(['x', 'servicio-basico'], '2999-01-01'));
      const error = errorOf(
        await useCases.deleteServicePermanently.execute({
          id: 'servicio-basico',
          today: TODAY,
        }),
      );
      expect(error).toBeInstanceOf(ServiceHasUpcomingBookingsError);
      expect(error.kind).toBe('conflict');
      expect(error.message).toBe(
        'No se puede eliminar el servicio "Servicio Básico": tiene 2 reservas futuras confirmadas. Cancélalas o desactiva el servicio.',
      );
      expect(services.count).toBe(1);
    });

    it('is not blocked by past, cancelled or other services bookings', async () => {
      const { useCases, services, activity } = setup();
      activity.seed(booking(['servicio-basico'], '2000-01-01'));
      activity.seed(booking(['servicio-basico'], '2999-01-01', 'cancelled'));
      activity.seed(booking(['otro'], '2999-01-01'));
      const done = valueOf(
        await useCases.deleteServicePermanently.execute({
          id: 'servicio-basico',
          today: TODAY,
        }),
      );
      expect(done).toEqual({ id: 'servicio-basico', deleted: true });
      expect(services.count).toBe(0);
    });

    it('deletes an inactive service and leaves the professionals untouched', async () => {
      const { useCases, professionals, services } = setup();
      await services.update('servicio-basico', { active: false });
      valueOf(
        await useCases.deleteServicePermanently.execute({
          id: 'servicio-basico',
          today: TODAY,
        }),
      );
      expect(professionals.count).toBe(2);
    });
  });

  describe('ListServicesUseCase', () => {
    it('lists all of them or only the active ones, in creation order', async () => {
      const { useCases, services } = setup();
      services.seed({ id: 'off', name: 'Off', active: false });
      services.seed({ id: 'last', name: 'Last' });
      expect(
        valueOf(await useCases.listServices.execute({ scope: 'all' })).map(
          (s) => s.id,
        ),
      ).toEqual(['servicio-basico', 'off', 'last']);
      expect(
        valueOf(await useCases.listServices.execute({ scope: 'active' })).map(
          (s) => s.id,
        ),
      ).toEqual(['servicio-basico', 'last']);
    });
  });

  describe('FindActiveServiceUseCase', () => {
    it('answers the service, or null for an unknown or inactive one', async () => {
      const { useCases, services } = setup();
      expect(
        valueOf(await useCases.findActiveService.execute('servicio-basico'))
          ?.id,
      ).toBe('servicio-basico');
      expect(
        valueOf(await useCases.findActiveService.execute('nope')),
      ).toBeNull();
      await services.update('servicio-basico', { active: false });
      expect(
        valueOf(await useCases.findActiveService.execute('servicio-basico')),
      ).toBeNull();
    });
  });

  describe('a failing store is not a business error', () => {
    it('lets an infrastructure failure of the repository escape as an exception', async () => {
      const { useCases, services } = setup();
      jest
        .spyOn(services, 'insert')
        .mockRejectedValue(new Error('connection lost'));
      await expect(useCases.createService.execute(INPUT)).rejects.toThrow(
        'connection lost',
      );
    });
  });
});
