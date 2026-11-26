import { StorageGate } from '../../../../shared/application/storage-gate.port';
import { Professional } from '../../../domain/professional';
import { LocationReader } from '../../ports/location.reader';
import { ProfessionalPhotoStore } from '../../ports/professional-photo.store';
import { SetProfessionalPhotoUseCase } from './set-professional-photo.use-case';

describe('SetProfessionalPhotoUseCase over the storage quota (spec 22)', () => {
  const saved: string[] = [];
  const store = {
    savePhoto: (id: string) => {
      saved.push(id);
      return Promise.resolve({
        id,
        name: 'Alex',
        locationIds: [],
      } as unknown as Professional);
    },
  } as unknown as ProfessionalPhotoStore;
  const locations = {
    list: () =>
      Promise.resolve([
        {
          id: 'principal',
          name: 'Principal',
          active: true,
          createdAt: new Date(0),
        },
      ]),
  } as unknown as LocationReader;
  const clock = { now: () => new Date('2026-11-26T10:00:00Z') };
  const photo = { contentType: 'image/png', data: Buffer.from('x') } as never;
  const gate = (allows: boolean): StorageGate => ({
    allowsNewData: () => Promise.resolve(allows),
  });

  beforeEach(() => (saved.length = 0));

  it('refuses the upload with the storage message and saves nothing', async () => {
    const useCase = new SetProfessionalPhotoUseCase(
      store,
      locations,
      clock,
      gate(false),
    );

    const result = await useCase.execute({ id: 'alex', photo });

    expect(!result.ok && result.error.kind).toBe('forbidden');
    expect(!result.ok && result.error.message).toBe(
      'Este negocio alcanzó el límite de almacenamiento de su plan.',
    );
    expect(saved).toEqual([]);
  });

  it('saves the photo when the business has room', async () => {
    const useCase = new SetProfessionalPhotoUseCase(
      store,
      locations,
      clock,
      gate(true),
    );
    await useCase.execute({ id: 'alex', photo });
    expect(saved).toEqual(['alex']);
  });

  it('saves the photo without a gate (as before)', async () => {
    const useCase = new SetProfessionalPhotoUseCase(store, locations, clock);
    await useCase.execute({ id: 'alex', photo });
    expect(saved).toEqual(['alex']);
  });
});
