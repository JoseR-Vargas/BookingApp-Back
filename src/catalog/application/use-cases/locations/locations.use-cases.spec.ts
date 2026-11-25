import { SEED_SCHEDULE } from '../../../domain/seed-schedule';
import {
  fixedClock,
  inMemoryCatalog,
} from '../../../infrastructure/in-memory-catalog.testing';
import { Location } from '../../../domain/location';
import { Result } from '../../../../shared/domain/result';

const at = (n: number) => new Date(1_700_000_000_000 + n * 1000);
const NOW = new Date(1_800_000_000_000);

const WEEK: Location['weekly'] = {
  ...SEED_SCHEDULE.weekly,
  1: { closed: false, open: '10:00', close: '14:00' },
  6: { closed: true },
};

const valueOf = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(`expected Ok, got ${result.error.message}`);
  return result.value;
};

const errorOf = (result: Result<unknown>) => {
  if (result.ok) throw new Error('expected Err');
  return result.error;
};

describe('location use cases (in-memory)', () => {
  let kit: ReturnType<typeof inMemoryCatalog>;

  beforeEach(() => {
    kit = inMemoryCatalog(fixedClock(NOW));
  });

  describe('ListLocationsUseCase', () => {
    beforeEach(() => {
      kit.locations.seed({ id: 'norte', createdAt: at(2) });
      kit.locations.seed({ id: 'centro', active: false, createdAt: at(1) });
      kit.locations.seed({ id: 'sur', createdAt: at(3) });
    });

    it('lists every location in creation order for the admin', async () => {
      const list = valueOf(await kit.useCases.listLocations.execute('all'));
      expect(list.map((l) => [l.id, l.active])).toEqual([
        ['norte', true],
        ['centro', false],
        ['sur', true],
      ]);
    });

    it('lists the active ones, oldest first, for the public', async () => {
      const list = valueOf(await kit.useCases.listLocations.execute('active'));
      expect(list.map((l) => l.id)).toEqual(['norte', 'sur']);
    });

    it('lists the virtual "principal" for a store that was never migrated', async () => {
      const fresh = inMemoryCatalog();
      const list = valueOf(await fresh.useCases.listLocations.execute('all'));
      expect(list.map((l) => l.id)).toEqual(['principal']);
    });
  });

  describe('GetLocationUseCase', () => {
    beforeEach(() => {
      kit.locations.seed({ id: 'principal', createdAt: at(1) });
      kit.locations.seed({
        id: 'centro',
        startIntervalMinutes: 60,
        createdAt: at(2),
      });
      kit.locations.seed({ id: 'norte', active: false, createdAt: at(3) });
    });

    it('answers the default location without an id', async () => {
      expect(valueOf(await kit.useCases.getLocation.execute()).id).toBe(
        'principal',
      );
    });

    it('answers an active location by id', async () => {
      const found = valueOf(await kit.useCases.getLocation.execute('centro'));
      expect(found.startIntervalMinutes).toBe(60);
    });

    it.each(['norte', 'nope'])(
      'fails with LocationNotFound for the inactive or unknown id %s',
      async (id) => {
        const error = errorOf(await kit.useCases.getLocation.execute(id));
        expect(error).toMatchObject({
          kind: 'not-found',
          locationId: id,
          message: `Location "${id}" not found`,
        });
      },
    );

    it('fails for "principal" when no location is active and no id is given', async () => {
      const none = inMemoryCatalog();
      none.locations.seed({ id: 'centro', active: false });
      const error = errorOf(await none.useCases.getLocation.execute());
      expect(error).toMatchObject({
        kind: 'not-found',
        message: 'Location "principal" not found',
      });
    });
  });

  describe('ResolveDefaultLocationUseCase', () => {
    it('is the OLDEST active location, creation order breaking ties', async () => {
      kit.locations.seed({ id: 'a', active: false, createdAt: at(1) });
      kit.locations.seed({ id: 'c', createdAt: at(3) });
      kit.locations.seed({ id: 'b', createdAt: at(2) });
      kit.locations.seed({ id: 'b2', createdAt: at(2) });
      expect(
        valueOf(await kit.useCases.resolveDefaultLocation.execute()).id,
      ).toBe('b');
    });

    it('fails when none is active', async () => {
      kit.locations.seed({ id: 'a', active: false });
      const error = errorOf(
        await kit.useCases.resolveDefaultLocation.execute(),
      );
      expect(error.kind).toBe('validation');
      expect(error.message).toBe('Debe quedar al menos un local activo.');
    });
  });

  describe('EnsurePrincipalLocationUseCase', () => {
    it('stores "principal" with a COPY of the legacy schedule and the clock time', async () => {
      kit.settings.seed({
        weekly: WEEK,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 90,
      });

      expect(
        valueOf(await kit.useCases.ensurePrincipalLocation.execute()),
      ).toBe(true);

      expect(await kit.locations.hasAny()).toBe(true);
      expect(await kit.locations.list()).toEqual([
        {
          id: 'principal',
          name: 'Principal',
          address: '',
          active: true,
          weekly: WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 90,
          createdAt: NOW,
        },
      ]);
      // Copy, not move: the legacy document keeps its schedule.
      expect(kit.settings.stored()).toEqual({
        weekly: WEEK,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 90,
      });
    });

    it('uses the seed schedule when none was ever stored', async () => {
      await kit.useCases.ensurePrincipalLocation.execute();
      const [principal] = await kit.locations.list();
      expect(principal).toMatchObject({
        id: 'principal',
        weekly: SEED_SCHEDULE.weekly,
        startIntervalMinutes: 30,
      });
    });

    it('is idempotent: running twice stores one location', async () => {
      await kit.useCases.ensurePrincipalLocation.execute();
      expect(
        valueOf(await kit.useCases.ensurePrincipalLocation.execute()),
      ).toBe(false);
      expect(kit.locations.count).toBe(1);
    });

    it('never touches a populated collection', async () => {
      kit.locations.seed({ id: 'centro', name: 'Centro' });

      expect(
        valueOf(await kit.useCases.ensurePrincipalLocation.execute()),
      ).toBe(false);

      expect((await kit.locations.list()).map((l) => l.id)).toEqual(['centro']);
    });

    it('concurrent runs create it once', async () => {
      await Promise.all([
        kit.useCases.ensurePrincipalLocation.execute(),
        kit.useCases.ensurePrincipalLocation.execute(),
      ]);
      expect(kit.locations.count).toBe(1);
    });
  });

  describe('CreateLocationUseCase', () => {
    it('creates an active location with the seed schedule under a slug id', async () => {
      const created = valueOf(
        await kit.useCases.createLocation.execute({
          input: { name: 'Centro Ñandú', address: 'Av. 1' },
        }),
      );
      expect(created).toEqual({
        id: 'centro-nandu',
        name: 'Centro Ñandú',
        address: 'Av. 1',
        active: true,
        weekly: SEED_SCHEDULE.weekly,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 30,
        createdAt: NOW,
      });
    });

    it('numbers a repeated name and falls back to "location" for an empty slug', async () => {
      const create = async (name: string) =>
        valueOf(
          await kit.useCases.createLocation.execute({
            input: { name, address: '' },
          }),
        ).id;
      expect(await create('Centro')).toBe('centro');
      expect(await create('Centro')).toBe('centro-2');
      expect(await create('Centro!')).toBe('centro-3');
      expect(await create('!!!')).toBe('location');
    });
  });

  describe('UpdateLocationUseCase', () => {
    beforeEach(() => {
      kit.locations.seed({ id: 'principal', createdAt: at(1) });
      kit.locations.seed({ id: 'centro', createdAt: at(2) });
    });

    it('changes only the given fields', async () => {
      const updated = valueOf(
        await kit.useCases.updateLocation.execute({
          id: 'centro',
          patch: { name: 'Casa central' },
        }),
      );
      expect(updated).toMatchObject({
        id: 'centro',
        name: 'Casa central',
        address: '',
        active: true,
      });
    });

    it('fails with LocationNotFound for an unknown id', async () => {
      const error = errorOf(
        await kit.useCases.updateLocation.execute({
          id: 'nope',
          patch: { name: 'X' },
        }),
      );
      expect(error).toMatchObject({
        kind: 'not-found',
        message: 'Location "nope" not found',
      });
    });

    it('can deactivate one while another stays active, but not the last one', async () => {
      valueOf(
        await kit.useCases.updateLocation.execute({
          id: 'principal',
          patch: { active: false },
        }),
      );
      const error = errorOf(
        await kit.useCases.updateLocation.execute({
          id: 'centro',
          patch: { active: false },
        }),
      );
      expect(error.message).toBe('Debe quedar al menos un local activo.');
      expect((await kit.locations.list()).map((l) => l.active)).toEqual([
        false,
        true,
      ]);
    });

    it('stores nothing when the change is refused', async () => {
      await kit.useCases.updateLocation.execute({
        id: 'principal',
        patch: { active: false },
      });
      await kit.useCases.updateLocation.execute({
        id: 'centro',
        patch: { name: 'Nuevo', active: false },
      });
      expect((await kit.locations.list())[1].name).toBe('centro');
    });

    it('allows reactivating an inactive location', async () => {
      await kit.useCases.updateLocation.execute({
        id: 'centro',
        patch: { active: false },
      });
      const back = valueOf(
        await kit.useCases.updateLocation.execute({
          id: 'centro',
          patch: { active: true },
        }),
      );
      expect(back.active).toBe(true);
    });
  });

  describe('SaveLocationScheduleUseCase', () => {
    beforeEach(() => {
      kit.locations.seed({ id: 'principal', createdAt: at(1) });
      kit.locations.seed({
        id: 'centro',
        startIntervalMinutes: 60,
        createdAt: at(2),
      });
    });

    it('replaces the schedule of a given location and keeps the fixed slot interval', async () => {
      const saved = valueOf(
        await kit.useCases.saveLocationSchedule.execute({
          locationId: 'centro',
          weekly: WEEK,
          startIntervalMinutes: 180,
        }),
      );
      expect(saved).toMatchObject({
        id: 'centro',
        weekly: WEEK,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 180,
      });
    });

    it('omitting the start interval keeps the stored value', async () => {
      const saved = valueOf(
        await kit.useCases.saveLocationSchedule.execute({
          locationId: 'centro',
          weekly: WEEK,
        }),
      );
      expect(saved.startIntervalMinutes).toBe(60);
    });

    it('acts on the DEFAULT location when no id is given', async () => {
      const saved = valueOf(
        await kit.useCases.saveLocationSchedule.execute({ weekly: WEEK }),
      );
      expect(saved.id).toBe('principal');
      expect((await kit.locations.list())[1].weekly).toEqual(
        SEED_SCHEDULE.weekly,
      );
    });

    it('fails with LocationNotFound for an unknown id and stores nothing', async () => {
      const error = errorOf(
        await kit.useCases.saveLocationSchedule.execute({
          locationId: 'nope',
          weekly: WEEK,
        }),
      );
      expect(error).toMatchObject({
        kind: 'not-found',
        message: 'Location "nope" not found',
      });
      expect(kit.locations.count).toBe(2);
    });

    it('migrates a never-migrated store before saving the default schedule', async () => {
      const fresh = inMemoryCatalog(fixedClock(NOW));
      const saved = valueOf(
        await fresh.useCases.saveLocationSchedule.execute({ weekly: WEEK }),
      );
      expect(saved).toMatchObject({ id: 'principal', weekly: WEEK });
      expect(fresh.locations.count).toBe(1);
    });

    it('fails with the last-active message when no location is active', async () => {
      const none = inMemoryCatalog();
      none.locations.seed({ id: 'centro', active: false });
      const error = errorOf(
        await none.useCases.saveLocationSchedule.execute({ weekly: WEEK }),
      );
      expect(error.message).toBe('Debe quedar al menos un local activo.');
    });
  });
});
