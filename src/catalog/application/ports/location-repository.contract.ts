import { WeeklySchedule } from '../../../shared/domain/schedule/schedule';
import { Location, NewLocation } from '../../domain/location';
import { slugCandidates } from '../../domain/slug.rules';
import { SEED_SCHEDULE } from '../../domain/seed-schedule';
import { LocationReader } from './location.reader';
import { LocationWriter } from './location.writer';

/** A location as the contract stores it; a field set to `undefined` is left out, like in an old document. */
export type SeedLocation = { id: string } & {
  [K in keyof Omit<Location, 'id'>]?: Location[K] | undefined;
};

/** A `business_settings` schedule document as an old installation stored it. */
export interface StoredLegacySchedule {
  weekly: WeeklySchedule['weekly'];
  slotIntervalMinutes: number;
  startIntervalMinutes?: number;
}

/** What the contract needs from the adapters under test, on an EMPTY store. */
export interface LocationRepositoryFixture {
  reader: LocationReader;
  writer: LocationWriter;
  /** Stores a location exactly as given, bypassing the port. */
  seed(location: SeedLocation): Promise<void>;
  /** Stores the legacy schedule document, bypassing the port. */
  seedLegacySchedule(schedule: StoredLegacySchedule): Promise<void>;
  /** How many locations the store holds (the virtual "principal" is not stored). */
  count(): Promise<number>;
}

const at = (n: number) => new Date(1_700_000_000_000 + n * 1000);

const draft = (overrides: Partial<NewLocation> = {}): NewLocation => ({
  name: 'Centro',
  address: 'Av. Central 123',
  active: true,
  weekly: SEED_SCHEDULE.weekly,
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
  createdAt: at(10),
  ...overrides,
});

const only = (...ids: string[]): AsyncIterable<string> =>
  (async function* () {
    for (const id of ids) yield await Promise.resolve(id);
  })();

const unlimited = (base: string): AsyncIterable<string> =>
  (async function* () {
    for (const id of slugCandidates(base)) yield await Promise.resolve(id);
  })();

const ids = (locations: Location[]) => locations.map((l) => l.id);

const CUSTOM_WEEK: WeeklySchedule['weekly'] = {
  ...SEED_SCHEDULE.weekly,
  1: { closed: false, open: '10:00', close: '14:00', starts: ['10:30'] },
  6: { closed: true },
};

/**
 * Behavior every LocationReader + LocationWriter adapter must honor. Each
 * adapter's spec calls it with a factory that answers a fixture over an EMPTY
 * store (in-memory for `npm test`, MongoDB for `npm run test:int`).
 */
export function describeLocationRepositoryContract(
  name: string,
  factory: () => Promise<LocationRepositoryFixture>,
): void {
  describe(`Location reader + writer contract: ${name}`, () => {
    let repo: LocationRepositoryFixture;

    beforeEach(async () => {
      repo = await factory();
    });

    describe('reader', () => {
      it('reads a store that was never migrated as one virtual "principal" with the seed schedule', async () => {
        await expect(repo.reader.list()).resolves.toEqual([
          {
            id: 'principal',
            name: 'Principal',
            address: '',
            active: true,
            weekly: SEED_SCHEDULE.weekly,
            slotIntervalMinutes: 30,
            startIntervalMinutes: 30,
            createdAt: new Date(0),
          },
        ]);
        await expect(repo.reader.hasAny()).resolves.toBe(false);
        await expect(repo.count()).resolves.toBe(0);
      });

      it('the virtual "principal" carries the legacy schedule when one is stored', async () => {
        await repo.seedLegacySchedule({
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 90,
        });
        const [principal, ...rest] = await repo.reader.list();
        expect(rest).toEqual([]);
        expect(principal).toMatchObject({
          id: 'principal',
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 90,
        });
      });

      it('a legacy schedule stored without a start interval reads as 30', async () => {
        await repo.seedLegacySchedule({
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
        });
        const [principal] = await repo.reader.list();
        expect(principal.startIntervalMinutes).toBe(30);
      });

      it('lists every location in creation order, inactive ones included', async () => {
        await repo.seed({ id: 'norte', createdAt: at(1) });
        await repo.seed({ id: 'centro', active: false, createdAt: at(2) });
        await repo.seed({ id: 'sur', createdAt: at(3) });
        const list = await repo.reader.list();
        expect(ids(list)).toEqual(['norte', 'centro', 'sur']);
        expect(list.map((l) => l.active)).toEqual([true, false, true]);
        await expect(repo.reader.hasAny()).resolves.toBe(true);
      });

      it('once a location is stored, the virtual "principal" is gone', async () => {
        await repo.seed({ id: 'centro', createdAt: at(1) });
        expect(ids(await repo.reader.list())).toEqual(['centro']);
      });

      it('reads a location with all its fields', async () => {
        await repo.seed({
          id: 'centro',
          name: 'Centro',
          address: 'Av. Central 123',
          active: true,
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 60,
          createdAt: at(4),
        });
        await expect(repo.reader.list()).resolves.toEqual([
          {
            id: 'centro',
            name: 'Centro',
            address: 'Av. Central 123',
            active: true,
            weekly: CUSTOM_WEEK,
            slotIntervalMinutes: 30,
            startIntervalMinutes: 60,
            createdAt: at(4),
          },
        ]);
      });

      it('a location stored without address nor start interval reads as "" and 30', async () => {
        await repo.seed({
          id: 'viejo',
          address: undefined,
          startIntervalMinutes: undefined,
        });
        const [viejo] = await repo.reader.list();
        expect(viejo.address).toBe('');
        expect(viejo.startIntervalMinutes).toBe(30);
      });
    });

    describe('writer: insert', () => {
      it('stores the draft under the first candidate and answers it', async () => {
        const created = await repo.writer.insert(only('centro'), draft());
        expect(created).toEqual({ id: 'centro', ...draft() });
        await expect(repo.reader.list()).resolves.toEqual([created]);
      });

      it('skips the taken ids and never touches the existing location', async () => {
        await repo.seed({ id: 'centro', name: 'Original', createdAt: at(1) });
        const created = await repo.writer.insert(unlimited('centro'), draft());
        expect(created.id).toBe('centro-2');
        const list = await repo.reader.list();
        expect(list.map((l) => [l.id, l.name])).toEqual([
          ['centro', 'Original'],
          ['centro-2', 'Centro'],
        ]);
      });

      it('two concurrent inserts of the same name get different ids', async () => {
        const [a, b] = await Promise.all([
          repo.writer.insert(unlimited('centro'), draft({ name: 'A' })),
          repo.writer.insert(unlimited('centro'), draft({ name: 'B' })),
        ]);
        expect([a.id, b.id].sort()).toEqual(['centro', 'centro-2']);
        await expect(repo.count()).resolves.toBe(2);
      });

      it('an insert into a never-migrated store replaces the virtual "principal" by itself', async () => {
        await repo.writer.insert(only('centro'), draft());
        expect(ids(await repo.reader.list())).toEqual(['centro']);
      });
    });

    describe('writer: insertIfAbsent', () => {
      const principal = (): Location => ({
        id: 'principal',
        name: 'Principal',
        address: '',
        active: true,
        weekly: CUSTOM_WEEK,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 90,
        createdAt: at(5),
      });

      it('stores a location that is absent and says so', async () => {
        await expect(repo.writer.insertIfAbsent(principal())).resolves.toBe(
          true,
        );
        await expect(repo.reader.list()).resolves.toEqual([principal()]);
      });

      it('never modifies an existing location and says so', async () => {
        await repo.seed({ id: 'principal', name: 'Casa central' });
        await expect(repo.writer.insertIfAbsent(principal())).resolves.toBe(
          false,
        );
        const [stored] = await repo.reader.list();
        expect(stored.name).toBe('Casa central');
        await expect(repo.count()).resolves.toBe(1);
      });

      it('concurrent calls store it once: exactly one says so', async () => {
        const results = await Promise.all([
          repo.writer.insertIfAbsent(principal()),
          repo.writer.insertIfAbsent(principal()),
          repo.writer.insertIfAbsent(principal()),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
        await expect(repo.count()).resolves.toBe(1);
      });
    });

    describe('writer: update', () => {
      it('sets only the given fields and answers the stored location', async () => {
        await repo.seed({
          id: 'centro',
          name: 'Centro',
          address: 'Av. 1',
          weekly: CUSTOM_WEEK,
          startIntervalMinutes: 60,
          createdAt: at(3),
        });
        const updated = await repo.writer.update('centro', {
          name: 'Casa central',
          active: false,
        });
        expect(updated).toEqual({
          id: 'centro',
          name: 'Casa central',
          address: 'Av. 1',
          active: false,
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 60,
          createdAt: at(3),
        });
        await expect(repo.reader.list()).resolves.toEqual([updated]);
      });

      it('an empty address is a value to store', async () => {
        await repo.seed({ id: 'centro', address: 'Av. 1' });
        const updated = await repo.writer.update('centro', { address: '' });
        expect(updated?.address).toBe('');
      });

      it('answers null for an unknown id and stores nothing', async () => {
        await expect(
          repo.writer.update('nope', { name: 'X' }),
        ).resolves.toBeNull();
        await expect(repo.count()).resolves.toBe(0);
      });

      it('does not touch the other locations', async () => {
        await repo.seed({ id: 'a', name: 'A', createdAt: at(1) });
        await repo.seed({ id: 'b', name: 'B', createdAt: at(2) });
        await repo.writer.update('a', { name: 'A2' });
        const list = await repo.reader.list();
        expect(list.map((l) => l.name)).toEqual(['A2', 'B']);
      });
    });

    describe('writer: saveSchedule', () => {
      it('replaces the week and the slot interval, and stores a given start interval', async () => {
        await repo.seed({ id: 'centro', startIntervalMinutes: 30 });
        const saved = await repo.writer.saveSchedule('centro', {
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 180,
        });
        expect(saved).toMatchObject({
          id: 'centro',
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 180,
        });
        await expect(repo.reader.list()).resolves.toEqual([saved]);
      });

      it('keeps the stored start interval when none is given', async () => {
        await repo.seed({ id: 'centro', startIntervalMinutes: 90 });
        const saved = await repo.writer.saveSchedule('centro', {
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
        });
        expect(saved?.startIntervalMinutes).toBe(90);
        expect(saved?.weekly).toEqual(CUSTOM_WEEK);
      });

      it('works on an inactive location and leaves its other fields alone', async () => {
        await repo.seed({
          id: 'centro',
          name: 'Centro',
          active: false,
          createdAt: at(2),
        });
        const saved = await repo.writer.saveSchedule('centro', {
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
        });
        expect(saved).toMatchObject({
          name: 'Centro',
          active: false,
          createdAt: at(2),
        });
      });

      it('answers null for an unknown id and stores nothing', async () => {
        await expect(
          repo.writer.saveSchedule('nope', {
            weekly: CUSTOM_WEEK,
            slotIntervalMinutes: 30,
          }),
        ).resolves.toBeNull();
        await expect(repo.count()).resolves.toBe(0);
      });

      it('does not touch the other locations', async () => {
        await repo.seed({ id: 'a', createdAt: at(1) });
        await repo.seed({ id: 'b', createdAt: at(2) });
        await repo.writer.saveSchedule('a', {
          weekly: CUSTOM_WEEK,
          slotIntervalMinutes: 30,
        });
        const [, b] = await repo.reader.list();
        expect(b.weekly).toEqual(SEED_SCHEDULE.weekly);
      });
    });
  });
}
