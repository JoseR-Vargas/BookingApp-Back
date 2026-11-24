import {
  NewProfessional,
  Professional,
  StoredPhoto,
} from '../../domain/professional';
import { slugCandidates } from '../../domain/slug.rules';
import { ProfessionalPhotoStore } from './professional-photo.store';
import { ProfessionalReader } from './professional.reader';
import { ProfessionalWriter } from './professional.writer';

/** A professional as an adapter's store may hold it, bypassing the port. */
export interface SeedProfessionalDocument {
  id: string;
  name: string;
  specialty?: string;
  experience?: string;
  rating?: number;
  avatar?: string;
  active?: boolean;
  /** Absent or null = no photo. */
  photo?: {
    mimeType: StoredPhoto['mimeType'];
    data: Buffer;
    updatedAt: Date;
  } | null;
  /** Absent = stored before locations existed. */
  locationIds?: string[];
}

/** What the contract needs from the adapters under test, on an EMPTY store. */
export interface ProfessionalRepositoryFixture {
  reader: ProfessionalReader;
  writer: ProfessionalWriter;
  photos: ProfessionalPhotoStore;
  /** Stores the document exactly as given, bypassing the port. */
  seed(document: SeedProfessionalDocument): Promise<void>;
  /** How many professionals the store holds. */
  count(): Promise<number>;
}

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);
const UPDATED_AT = new Date(1_700_000_000_123);

const photo = (updatedAt = UPDATED_AT): StoredPhoto => ({
  mimeType: 'image/png',
  data: PNG_BYTES,
  updatedAt,
});

const draft = (overrides: Partial<NewProfessional> = {}): NewProfessional => ({
  name: 'Ana Ruiz',
  specialty: 'Colorist',
  experience: '3 años',
  active: true,
  rating: 5,
  avatar: 'fas fa-user',
  locationIds: ['centro'],
  photo: null,
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

const ids = (professionals: Professional[]) => professionals.map((p) => p.id);

/**
 * Behavior every ProfessionalReader + ProfessionalWriter + ProfessionalPhotoStore
 * adapter must honor. Each adapter's spec calls it with a factory that answers a
 * fixture over an EMPTY store (in-memory for `npm test`, MongoDB for `npm run test:int`).
 */
export function describeProfessionalRepositoryContract(
  name: string,
  factory: () => Promise<ProfessionalRepositoryFixture>,
): void {
  describe(`Professional reader + writer + photo store contract: ${name}`, () => {
    let repo: ProfessionalRepositoryFixture;

    beforeEach(async () => {
      repo = await factory();
    });

    describe('an empty store', () => {
      it('lists nothing and finds nothing', async () => {
        await expect(repo.reader.list('all')).resolves.toEqual([]);
        await expect(repo.reader.list('active')).resolves.toEqual([]);
        await expect(repo.reader.find('ana')).resolves.toBeNull();
        await expect(repo.reader.findActive('ana')).resolves.toBeNull();
        await expect(repo.reader.existingIds(['ana'])).resolves.toEqual([]);
        await expect(repo.photos.findPhoto('ana')).resolves.toBeNull();
      });
    });

    describe('insert', () => {
      it('stores under the first candidate and answers the stored professional', async () => {
        const saved = await repo.writer.insert(only('ana-ruiz'), draft());
        expect(saved).toEqual({
          id: 'ana-ruiz',
          name: 'Ana Ruiz',
          specialty: 'Colorist',
          experience: '3 años',
          rating: 5,
          avatar: 'fas fa-user',
          active: true,
          photo: null,
          locationIds: ['centro'],
        });
        await expect(repo.reader.find('ana-ruiz')).resolves.toEqual(saved);
        await expect(repo.count()).resolves.toBe(1);
      });

      it('stores the photo in the same insert and answers it without bytes', async () => {
        const saved = await repo.writer.insert(
          only('ana'),
          draft({ photo: photo() }),
        );
        expect(saved.photo).toEqual({
          mimeType: 'image/png',
          updatedAt: UPDATED_AT,
        });
        expect(saved.photo).not.toHaveProperty('data');
        const bytes = await repo.photos.findPhoto('ana');
        expect(bytes?.mimeType).toBe('image/png');
        expect(Buffer.isBuffer(bytes?.data)).toBe(true);
        expect(Buffer.compare(bytes!.data, PNG_BYTES)).toBe(0);
        expect(bytes?.updatedAt.getTime()).toBe(UPDATED_AT.getTime());
      });

      it('moves to the next candidate when the id is taken, and never overwrites', async () => {
        await repo.seed({
          id: 'ana',
          name: 'Original',
          specialty: 'Keep',
          rating: 4.5,
        });
        const saved = await repo.writer.insert(unlimited('ana'), draft());
        expect(saved.id).toBe('ana-2');
        const original = await repo.reader.find('ana');
        expect(original).toMatchObject({
          name: 'Original',
          specialty: 'Keep',
          rating: 4.5,
        });
        await expect(repo.count()).resolves.toBe(2);
      });

      it('suffixes -2, -3 on consecutive collisions', async () => {
        const first = await repo.writer.insert(unlimited('ana'), draft());
        const second = await repo.writer.insert(unlimited('ana'), draft());
        const third = await repo.writer.insert(unlimited('ana'), draft());
        expect([first.id, second.id, third.id]).toEqual([
          'ana',
          'ana-2',
          'ana-3',
        ]);
      });

      it('collides with an inactive professional too', async () => {
        await repo.seed({ id: 'ana', name: 'Ana', active: false });
        const saved = await repo.writer.insert(unlimited('ana'), draft());
        expect(saved.id).toBe('ana-2');
      });

      it('gives two simultaneous inserts of the same name two different ids', async () => {
        const saved = await Promise.all([
          repo.writer.insert(unlimited('ana'), draft({ name: 'First' })),
          repo.writer.insert(unlimited('ana'), draft({ name: 'Second' })),
          repo.writer.insert(unlimited('ana'), draft({ name: 'Third' })),
        ]);
        expect([...ids(saved)].sort()).toEqual(['ana', 'ana-2', 'ana-3']);
        await expect(repo.count()).resolves.toBe(3);
        const names = await Promise.all(
          saved.map(async ({ id }) => (await repo.reader.find(id))?.name),
        );
        expect(names).toEqual(saved.map(({ name: n }) => n));
      });

      it('uses only the candidates it is given (a candidate the caller skipped is never used)', async () => {
        const saved = await repo.writer.insert(only('ana-2'), draft());
        expect(saved.id).toBe('ana-2');
        await expect(repo.reader.find('ana')).resolves.toBeNull();
      });
    });

    describe('reading', () => {
      beforeEach(async () => {
        await repo.seed({ id: 'ana', name: 'Ana', active: true });
        await repo.seed({ id: 'luis', name: 'Luis', active: false });
        await repo.seed({ id: 'zoe', name: 'Zoe', active: true });
      });

      it('lists in creation order, and only the active ones for the public scope', async () => {
        expect(ids(await repo.reader.list('all'))).toEqual([
          'ana',
          'luis',
          'zoe',
        ]);
        expect(ids(await repo.reader.list('active'))).toEqual(['ana', 'zoe']);
      });

      it('lists later additions after the earlier ones', async () => {
        await repo.writer.insert(only('mia'), draft({ name: 'Mia' }));
        expect(ids(await repo.reader.list('all'))).toEqual([
          'ana',
          'luis',
          'zoe',
          'mia',
        ]);
      });

      it('finds by id whatever its status, and findActive only the active ones', async () => {
        await expect(repo.reader.find('luis')).resolves.toMatchObject({
          id: 'luis',
          active: false,
        });
        await expect(repo.reader.findActive('luis')).resolves.toBeNull();
        await expect(repo.reader.findActive('ana')).resolves.toMatchObject({
          id: 'ana',
        });
        await expect(repo.reader.find('nobody')).resolves.toBeNull();
      });

      it('treats an odd id as plain text', async () => {
        await expect(repo.reader.find('%20x$ne')).resolves.toBeNull();
        await expect(repo.reader.existingIds(['$ne'])).resolves.toEqual([]);
      });

      it('answers which of the ids belong to a professional, active or not', async () => {
        const found = await repo.reader.existingIds(['zoe', 'ghost', 'luis']);
        expect([...found].sort()).toEqual(['luis', 'zoe']);
      });
    });

    describe('locations', () => {
      it('reads a professional stored without locations as null', async () => {
        await repo.seed({ id: 'old', name: 'Old' });
        await expect(repo.reader.find('old')).resolves.toMatchObject({
          locationIds: null,
        });
      });

      it('reads the stored locations', async () => {
        await repo.seed({ id: 'ana', name: 'Ana', locationIds: ['a', 'b'] });
        await expect(repo.reader.find('ana')).resolves.toMatchObject({
          locationIds: ['a', 'b'],
        });
      });
    });

    describe('photos on a stored professional', () => {
      it('reads a professional stored with photo: null, or without the field, as having no photo', async () => {
        await repo.seed({ id: 'a', name: 'A', photo: null });
        await repo.seed({ id: 'b', name: 'B' });
        await expect(repo.reader.find('a')).resolves.toMatchObject({
          photo: null,
        });
        await expect(repo.reader.find('b')).resolves.toMatchObject({
          photo: null,
        });
        await expect(repo.photos.findPhoto('a')).resolves.toBeNull();
        await expect(repo.photos.findPhoto('b')).resolves.toBeNull();
      });

      it('answers the photo of an inactive professional', async () => {
        await repo.seed({
          id: 'gone',
          name: 'Gone',
          active: false,
          photo: photo(),
        });
        const found = await repo.photos.findPhoto('gone');
        expect(found?.mimeType).toBe('image/png');
        expect(Buffer.compare(found!.data, PNG_BYTES)).toBe(0);
      });

      it('never puts the bytes in a professional it lists or finds', async () => {
        await repo.seed({ id: 'ana', name: 'Ana', photo: photo() });
        const [listed] = await repo.reader.list('all');
        const found = await repo.reader.find('ana');
        for (const professional of [
          listed,
          found,
          await repo.reader.findActive('ana'),
        ]) {
          expect(professional?.photo).toEqual({
            mimeType: 'image/png',
            updatedAt: UPDATED_AT,
          });
          expect(JSON.stringify(professional)).not.toContain(
            PNG_BYTES.toString('base64'),
          );
        }
      });
    });

    describe('photo store', () => {
      beforeEach(async () => {
        await repo.seed({ id: 'ana', name: 'Ana' });
      });

      it('saves a photo, answers the professional and serves the bytes back', async () => {
        const updated = await repo.photos.savePhoto('ana', photo());
        expect(updated).toMatchObject({
          id: 'ana',
          photo: { mimeType: 'image/png', updatedAt: UPDATED_AT },
        });
        const found = await repo.photos.findPhoto('ana');
        expect(Buffer.compare(found!.data, PNG_BYTES)).toBe(0);
      });

      it('replaces an earlier photo with its new timestamp', async () => {
        await repo.photos.savePhoto('ana', photo());
        const newer = new Date(1_700_000_999_000);
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 9]);
        await repo.photos.savePhoto('ana', {
          mimeType: 'image/jpeg',
          data: jpeg,
          updatedAt: newer,
        });
        const found = await repo.photos.findPhoto('ana');
        expect(found?.mimeType).toBe('image/jpeg');
        expect(Buffer.compare(found!.data, jpeg)).toBe(0);
        expect(found?.updatedAt.getTime()).toBe(newer.getTime());
      });

      it('removes the photo and keeps the rest of the professional', async () => {
        await repo.photos.savePhoto('ana', photo());
        const updated = await repo.photos.removePhoto('ana');
        expect(updated).toMatchObject({ id: 'ana', name: 'Ana', photo: null });
        await expect(repo.photos.findPhoto('ana')).resolves.toBeNull();
      });

      it('answers null for a professional that does not exist', async () => {
        await expect(
          repo.photos.savePhoto('nobody', photo()),
        ).resolves.toBeNull();
        await expect(repo.photos.removePhoto('nobody')).resolves.toBeNull();
        await expect(repo.photos.findPhoto('nobody')).resolves.toBeNull();
        await expect(repo.count()).resolves.toBe(1);
      });
    });

    describe('update', () => {
      beforeEach(async () => {
        await repo.seed({
          id: 'ana',
          name: 'Ana',
          specialty: 'Colorist',
          experience: '3 años',
          rating: 4.8,
          avatar: 'fas fa-user-tie',
          active: true,
          photo: photo(),
          locationIds: ['centro'],
        });
      });

      it('sets only the given fields and keeps the id, rating, avatar and photo', async () => {
        const updated = await repo.writer.update('ana', {
          name: 'Ana L.',
          active: false,
        });
        expect(updated).toEqual({
          id: 'ana',
          name: 'Ana L.',
          specialty: 'Colorist',
          experience: '3 años',
          rating: 4.8,
          avatar: 'fas fa-user-tie',
          active: false,
          photo: { mimeType: 'image/png', updatedAt: UPDATED_AT },
          locationIds: ['centro'],
        });
        await expect(repo.reader.find('ana')).resolves.toEqual(updated);
        const bytes = await repo.photos.findPhoto('ana');
        expect(Buffer.compare(bytes!.data, PNG_BYTES)).toBe(0);
      });

      it('replaces the locations', async () => {
        const updated = await repo.writer.update('ana', {
          locationIds: ['norte', 'sur'],
        });
        expect(updated?.locationIds).toEqual(['norte', 'sur']);
      });

      it('allows clearing the optional text fields', async () => {
        const updated = await repo.writer.update('ana', {
          specialty: '',
          experience: '',
        });
        expect(updated).toMatchObject({ specialty: '', experience: '' });
      });

      it('answers null for a professional that does not exist, creating nothing', async () => {
        await expect(
          repo.writer.update('nobody', { name: 'x' }),
        ).resolves.toBeNull();
        await expect(repo.count()).resolves.toBe(1);
      });
    });

    describe('delete', () => {
      it('removes the professional and its photo, and only that one', async () => {
        await repo.seed({ id: 'ana', name: 'Ana', photo: photo() });
        await repo.seed({ id: 'luis', name: 'Luis' });
        await repo.writer.delete('ana');
        expect(ids(await repo.reader.list('all'))).toEqual(['luis']);
        await expect(repo.photos.findPhoto('ana')).resolves.toBeNull();
      });

      it('is not an error when the professional is already gone', async () => {
        await expect(repo.writer.delete('nobody')).resolves.toBeUndefined();
      });
    });
  });
}
