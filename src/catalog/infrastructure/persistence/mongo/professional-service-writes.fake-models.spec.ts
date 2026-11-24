import { respond } from '../../../../shared/infrastructure/http/respond';
import {
  ProfessionalNotFoundError,
  ServiceNotFoundError,
} from '../../../domain/catalog.errors';
import { ProfessionalInput } from '../../../domain/professional.rules';
import { ServiceInput } from '../../../domain/service.rules';
import { createFakeCatalog } from '../../../catalog.testing';
import { PhotoUpload } from '../../../domain/professional';
import {
  toAdminProfessional,
  toAdminService,
} from '../../http/catalog.presenter';

/**
 * The write side of professionals and services through the use cases and the
 * MongoDB adapters over the fake Mongo models (what `CatalogAdminService`
 * used to do itself): ids, collisions, concurrent inserts, existing
 * documents. The assertions are the ones of the old service spec.
 */
describe('professional and service writes (use cases over MongoDB adapters)', () => {
  let fake: ReturnType<typeof createFakeCatalog>;

  /** The use cases behind the old method names; a business failure is thrown, as the HTTP edge does. */
  const admin = {
    createProfessional: async (
      input: ProfessionalInput,
      photo: PhotoUpload | null = null,
    ) =>
      toAdminProfessional(
        respond(
          await fake.useCases.createProfessional.execute({ input, photo }),
        ),
      ),
    updateProfessional: async (id: string, patch: Partial<ProfessionalInput>) =>
      toAdminProfessional(
        respond(await fake.useCases.updateProfessional.execute({ id, patch })),
      ),
    createService: async (input: ServiceInput) =>
      toAdminService(respond(await fake.useCases.createService.execute(input))),
    updateService: async (id: string, patch: Partial<ServiceInput>) =>
      toAdminService(
        respond(await fake.useCases.updateService.execute({ id, patch })),
      ),
  };

  beforeEach(async () => {
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
  });

  describe('createProfessional', () => {
    it('stores the professional with a slug id and the default rating/avatar', async () => {
      const created = await admin.createProfessional({
        name: 'Ana Ruiz',
        specialty: 'Colorist',
        experience: '3 años',
        active: true,
      });

      expect(created).toEqual({
        id: 'ana-ruiz',
        name: 'Ana Ruiz',
        specialty: 'Colorist',
        experience: '3 años',
        rating: 5,
        avatar: 'fas fa-user',
        photoUrl: null,
        active: true,
        locations: ['principal'],
      });
      expect(fake.professionalModel.docs).toHaveLength(3);
      expect(fake.professionalModel.docs[2]).toMatchObject({ id: 'ana-ruiz' });
    });

    it('suffixes -2, -3 on slug collisions and never overwrites', async () => {
      const input = {
        name: 'Alex García',
        specialty: '',
        experience: '',
        active: true,
      };

      const second = await admin.createProfessional(input);
      const third = await admin.createProfessional(input);

      expect(second.id).toBe('alex-garcia-2');
      expect(third.id).toBe('alex-garcia-3');
      expect(fake.professionalModel.docs[0]).toMatchObject({
        id: 'alex-garcia',
        specialty: 'Especialista',
        rating: 4.9,
      });
    });

    it('collides with inactive professionals too', async () => {
      fake.professionalModel.docs[0].active = false;

      const created = await admin.createProfessional({
        name: 'Alex Garcia',
        specialty: '',
        experience: '',
        active: true,
      });

      expect(created.id).toBe('alex-garcia-2');
    });

    it('moves to the next suffix when a concurrent insert wins the key', async () => {
      const duplicate = Object.assign(new Error('E11000'), { code: 11000 });
      fake.professionalModel.updateOne.mockImplementationOnce(() => ({
        exec: () => Promise.reject(duplicate),
      }));

      const created = await admin.createProfessional({
        name: 'Ana',
        specialty: '',
        experience: '',
        active: true,
      });

      expect(created.id).toBe('ana-2');
    });

    it('falls back to a generic id when the name has no alphanumerics', async () => {
      const created = await admin.createProfessional({
        name: '???',
        specialty: '',
        experience: '',
        active: true,
      });

      expect(created.id).toBe('professional');
    });
  });

  describe('updateProfessional', () => {
    it('updates only the given fields and keeps the id', async () => {
      const updated = await admin.updateProfessional('maria-lopez', {
        name: 'María L.',
        active: false,
      });

      expect(updated).toEqual({
        id: 'maria-lopez',
        name: 'María L.',
        specialty: 'Consultora',
        experience: '6 años',
        rating: 4.8,
        avatar: 'fas fa-user',
        photoUrl: null,
        active: false,
        locations: ['principal'],
      });
    });

    it('can reactivate a deactivated professional', async () => {
      await admin.updateProfessional('maria-lopez', { active: false });

      const updated = await admin.updateProfessional('maria-lopez', {
        active: true,
      });

      expect(updated.active).toBe(true);
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(
        admin.updateProfessional('nobody', { name: 'x' }),
      ).rejects.toThrow(ProfessionalNotFoundError);
    });
  });

  describe('createService', () => {
    const input = {
      name: 'Corte Clásico',
      description: 'Corte a tijera',
      price: 1500,
      duration: 45,
      professionals: ['alex-garcia'],
      active: true,
    };

    it('stores the service with a slug id and the default icon', async () => {
      const created = await admin.createService(input);

      expect(created).toEqual({
        id: 'corte-clasico',
        ...input,
        icon: 'fas fa-star',
      });
      expect(fake.serviceModel.docs[4]).toMatchObject({ id: 'corte-clasico' });
    });

    it('suffixes the id on collision', async () => {
      await admin.createService(input);

      const second = await admin.createService(input);

      expect(second.id).toBe('corte-clasico-2');
    });

    it('rejects professionals that do not exist, without inserting', async () => {
      await expect(
        admin.createService({
          ...input,
          professionals: ['alex-garcia', 'ghost', 'phantom'],
        }),
      ).rejects.toThrow(/professionals not found: ghost, phantom/);
      expect(fake.serviceModel.docs).toHaveLength(4);
    });

    it('accepts inactive professionals as existing', async () => {
      fake.professionalModel.docs[1].active = false;

      await expect(
        admin.createService({ ...input, professionals: ['maria-lopez'] }),
      ).resolves.toMatchObject({ professionals: ['maria-lopez'] });
    });
  });

  describe('updateService', () => {
    it('updates the given fields only', async () => {
      const updated = await admin.updateService('servicio-basico', {
        price: 1300,
        duration: 75,
        professionals: ['maria-lopez'],
      });

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

    it('toggles active', async () => {
      const off = await admin.updateService('sesion-expres', { active: false });
      const on = await admin.updateService('sesion-expres', { active: true });

      expect(off.active).toBe(false);
      expect(on.active).toBe(true);
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(admin.updateService('nope', { price: 1 })).rejects.toThrow(
        ServiceNotFoundError,
      );
    });

    it('rejects unknown professionals and leaves the service untouched', async () => {
      await expect(
        admin.updateService('servicio-basico', { professionals: ['ghost'] }),
      ).rejects.toMatchObject({ kind: 'validation' });
      expect(fake.serviceModel.docs[1].professionals).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
    });
  });
});
