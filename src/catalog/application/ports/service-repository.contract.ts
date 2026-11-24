import { NewService, Service } from '../../domain/service';
import { slugCandidates } from '../../domain/slug.rules';
import { ServiceReader } from './service.reader';
import { ServiceWriter } from './service.writer';

/** What the contract needs from the adapters under test, on an EMPTY store. */
export interface ServiceRepositoryFixture {
  reader: ServiceReader;
  writer: ServiceWriter;
  /** Stores the service exactly as given, bypassing the port. */
  seed(service: Partial<Service> & { id: string }): Promise<void>;
  /** How many services the store holds. */
  count(): Promise<number>;
}

const draft = (overrides: Partial<NewService> = {}): NewService => ({
  name: 'Corte',
  description: 'Corte a tijera',
  price: 1500,
  duration: 45,
  professionals: ['ana'],
  icon: 'fas fa-star',
  active: true,
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

const ids = (services: Service[]) => services.map((s) => s.id);

/**
 * Behavior every ServiceReader + ServiceWriter adapter must honor. Each
 * adapter's spec calls it with a factory that answers a fixture over an EMPTY
 * store (in-memory for `npm test`, MongoDB for `npm run test:int`).
 */
export function describeServiceRepositoryContract(
  name: string,
  factory: () => Promise<ServiceRepositoryFixture>,
): void {
  describe(`Service reader + writer contract: ${name}`, () => {
    let repo: ServiceRepositoryFixture;

    beforeEach(async () => {
      repo = await factory();
    });

    it('lists nothing and finds nothing on an empty store', async () => {
      await expect(repo.reader.list('all')).resolves.toEqual([]);
      await expect(repo.reader.find('corte')).resolves.toBeNull();
      await expect(repo.reader.findActive('corte')).resolves.toBeNull();
      await expect(repo.reader.findActiveByIds(['corte'])).resolves.toEqual([]);
      await expect(repo.reader.offeredBy('ana')).resolves.toEqual([]);
    });

    describe('insert', () => {
      it('stores under the first candidate and answers the stored service', async () => {
        const saved = await repo.writer.insert(only('corte'), draft());
        expect(saved).toEqual({ id: 'corte', ...draft() });
        await expect(repo.reader.find('corte')).resolves.toEqual(saved);
      });

      it('moves to the next candidate when the id is taken, and never overwrites', async () => {
        await repo.seed({
          id: 'corte',
          name: 'Original',
          price: 1,
          professionals: [],
        });
        const saved = await repo.writer.insert(unlimited('corte'), draft());
        expect(saved.id).toBe('corte-2');
        await expect(repo.reader.find('corte')).resolves.toMatchObject({
          name: 'Original',
          price: 1,
        });
        await expect(repo.count()).resolves.toBe(2);
      });

      it('suffixes -2, -3 on consecutive collisions', async () => {
        const saved: Service[] = [];
        for (let i = 0; i < 3; i++) {
          saved.push(await repo.writer.insert(unlimited('corte'), draft()));
        }
        expect(ids(saved)).toEqual(['corte', 'corte-2', 'corte-3']);
      });

      it('collides with an inactive service too', async () => {
        await repo.seed({ id: 'corte', name: 'Corte', active: false });
        const saved = await repo.writer.insert(unlimited('corte'), draft());
        expect(saved.id).toBe('corte-2');
      });

      it('gives simultaneous inserts of the same name different ids', async () => {
        const saved = await Promise.all([
          repo.writer.insert(unlimited('corte'), draft()),
          repo.writer.insert(unlimited('corte'), draft()),
          repo.writer.insert(unlimited('corte'), draft()),
        ]);
        expect([...ids(saved)].sort()).toEqual(['corte', 'corte-2', 'corte-3']);
        await expect(repo.count()).resolves.toBe(3);
      });

      it('uses only the candidates it is given', async () => {
        const saved = await repo.writer.insert(only('corte-2'), draft());
        expect(saved.id).toBe('corte-2');
        await expect(repo.reader.find('corte')).resolves.toBeNull();
      });
    });

    describe('reading', () => {
      beforeEach(async () => {
        await repo.seed({ id: 'a', name: 'A', professionals: ['ana', 'luis'] });
        await repo.seed({
          id: 'b',
          name: 'B',
          professionals: ['ana'],
          active: false,
        });
        await repo.seed({ id: 'c', name: 'C', professionals: ['luis'] });
      });

      it('lists in creation order, and only the active ones for the public scope', async () => {
        expect(ids(await repo.reader.list('all'))).toEqual(['a', 'b', 'c']);
        expect(ids(await repo.reader.list('active'))).toEqual(['a', 'c']);
      });

      it('finds by id whatever its status, and findActive only the active ones', async () => {
        await expect(repo.reader.find('b')).resolves.toMatchObject({
          id: 'b',
          active: false,
        });
        await expect(repo.reader.findActive('b')).resolves.toBeNull();
        await expect(repo.reader.findActive('a')).resolves.toMatchObject({
          id: 'a',
        });
        await expect(repo.reader.find('nope')).resolves.toBeNull();
      });

      it('finds the active services among the ids, ignoring inactive and unknown ones', async () => {
        const found = await repo.reader.findActiveByIds(['c', 'b', 'x', 'a']);
        expect([...ids(found)].sort()).toEqual(['a', 'c']);
      });

      it('lists, in creation order, the services (active or not) that name a professional', async () => {
        expect(ids(await repo.reader.offeredBy('ana'))).toEqual(['a', 'b']);
        expect(ids(await repo.reader.offeredBy('luis'))).toEqual(['a', 'c']);
        await expect(repo.reader.offeredBy('zoe')).resolves.toEqual([]);
      });

      it('treats an odd id as plain text', async () => {
        await expect(repo.reader.find('$ne')).resolves.toBeNull();
        await expect(repo.reader.offeredBy('$ne')).resolves.toEqual([]);
      });

      it('copies the professionals list: changing a result changes nothing stored', async () => {
        const [first] = await repo.reader.list('all');
        first.professionals.push('intruder');
        await expect(repo.reader.find('a')).resolves.toMatchObject({
          professionals: ['ana', 'luis'],
        });
      });
    });

    describe('update', () => {
      beforeEach(async () => {
        await repo.seed({
          id: 'corte',
          name: 'Corte',
          description: 'd',
          price: 100,
          duration: 30,
          professionals: ['ana', 'luis'],
          icon: 'fas fa-cut',
          active: true,
        });
      });

      it('sets only the given fields and keeps the id and icon', async () => {
        const updated = await repo.writer.update('corte', {
          price: 1300,
          duration: 75,
          professionals: ['luis'],
        });
        expect(updated).toEqual({
          id: 'corte',
          name: 'Corte',
          description: 'd',
          price: 1300,
          duration: 75,
          professionals: ['luis'],
          icon: 'fas fa-cut',
          active: true,
        });
        await expect(repo.reader.find('corte')).resolves.toEqual(updated);
      });

      it('toggles active', async () => {
        await expect(
          repo.writer.update('corte', { active: false }),
        ).resolves.toMatchObject({ active: false });
        await expect(
          repo.writer.update('corte', { active: true }),
        ).resolves.toMatchObject({ active: true });
      });

      it('answers null for a service that does not exist, creating nothing', async () => {
        await expect(
          repo.writer.update('nope', { price: 1 }),
        ).resolves.toBeNull();
        await expect(repo.count()).resolves.toBe(1);
      });
    });

    describe('delete and removeProfessional', () => {
      it('deletes only that service, and is not an error when it is gone', async () => {
        await repo.seed({ id: 'a', name: 'A' });
        await repo.seed({ id: 'b', name: 'B' });
        await repo.writer.delete('a');
        expect(ids(await repo.reader.list('all'))).toEqual(['b']);
        await expect(repo.writer.delete('a')).resolves.toBeUndefined();
      });

      it('removes a professional from every service that names it, and touches nothing else', async () => {
        await repo.seed({ id: 'a', name: 'A', professionals: ['ana', 'luis'] });
        await repo.seed({ id: 'b', name: 'B', professionals: ['luis'] });
        await repo.seed({
          id: 'c',
          name: 'C',
          professionals: ['ana'],
          active: false,
        });
        await repo.writer.removeProfessional('ana');
        const all = await repo.reader.list('all');
        expect(all.map((s) => s.professionals)).toEqual([
          ['luis'],
          ['luis'],
          [],
        ]);
        expect(all.map((s) => s.active)).toEqual([true, true, false]);
      });
    });
  });
}
