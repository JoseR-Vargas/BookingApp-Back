import { DomainError } from '../../../../shared/domain/domain-error';
import { Err, Ok, Result } from '../../../../shared/domain/result';
import {
  InvalidCatalogDataError,
  InvalidProfessionalLocationsError,
  NoActiveLocationError,
  PhotoNotFoundError,
  ProfessionalHasUpcomingBookingsError,
  ProfessionalIsSoleProviderError,
  ProfessionalNotFoundError,
} from '../../../domain/catalog.errors';
import { PhotoUpload } from '../../../domain/professional';
import {
  fixedClock,
  inMemoryCatalog,
} from '../../../infrastructure/in-memory-catalog.testing';

const NOW = new Date('2025-11-17T12:00:00.000Z');
const PNG: PhotoUpload = {
  mimeType: 'image/png',
  data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
};

const valueOf = <T>(result: Result<T, DomainError>): T => {
  expect(result.ok).toBe(true);
  return (result as Ok<T>).value;
};

const errorOf = (result: Result<unknown, DomainError>): DomainError => {
  expect(result.ok).toBe(false);
  return (result as Err<DomainError>).error;
};

const input = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  specialty: '',
  experience: '',
  active: true,
  ...extra,
});

function setup() {
  const kit = inMemoryCatalog(fixedClock(NOW));
  kit.professionals.seed({
    id: 'alex-garcia',
    name: 'Alex García',
    specialty: 'Especialista',
    rating: 4.9,
  });
  kit.professionals.seed({ id: 'maria-lopez', name: 'María López' });
  return kit;
}

describe('professional use cases (in-memory adapters)', () => {
  describe('CreateProfessionalUseCase', () => {
    it('stores a professional with a slug id, the default rating and avatar, at the default location', async () => {
      const { useCases, professionals } = setup();
      const view = valueOf(
        await useCases.createProfessional.execute({
          input: input('Ana Ruiz', {
            specialty: 'Colorist',
            experience: '3 años',
          }),
          photo: null,
        }),
      );
      expect(view.professional).toEqual({
        id: 'ana-ruiz',
        name: 'Ana Ruiz',
        specialty: 'Colorist',
        experience: '3 años',
        rating: 5,
        avatar: 'fas fa-user',
        active: true,
        photo: null,
        locationIds: ['principal'],
      });
      expect(view.locationIds).toEqual(['principal']);
      expect(professionals.count).toBe(3);
    });

    it('stores the given locations when they are all active', async () => {
      const { useCases, locations } = setup();
      locations.seed({ id: 'centro', active: true, createdAt: new Date(1) });
      locations.seed({ id: 'norte', active: true, createdAt: new Date(2) });
      const view = valueOf(
        await useCases.createProfessional.execute({
          input: input('Ana', { locations: ['norte'] }),
          photo: null,
        }),
      );
      expect(view.locationIds).toEqual(['norte']);
    });

    it('rejects a location that is not active, storing nothing', async () => {
      const { useCases, professionals, locations } = setup();
      locations.seed({ id: 'centro', active: true, createdAt: new Date(1) });
      locations.seed({ id: 'gone', active: false, createdAt: new Date(2) });
      const result = await useCases.createProfessional.execute({
        input: input('Ana', { locations: ['gone'] }),
        photo: null,
      });
      expect(errorOf(result)).toBeInstanceOf(InvalidProfessionalLocationsError);
      expect(errorOf(result).message).toBe(
        'El profesional debe trabajar en al menos un local activo.',
      );
      expect(professionals.count).toBe(2);
    });

    it('rejects when no location is active', async () => {
      const { useCases, professionals, locations } = setup();
      locations.seed({ id: 'centro', active: false, createdAt: new Date(1) });
      const result = await useCases.createProfessional.execute({
        input: input('Ana'),
        photo: null,
      });
      expect(errorOf(result)).toBeInstanceOf(NoActiveLocationError);
      expect(errorOf(result).message).toBe(
        'Debe quedar al menos un local activo.',
      );
      expect(professionals.count).toBe(2);
    });

    it('stamps the photo with the clock in the same insert', async () => {
      const { useCases, professionals } = setup();
      const view = valueOf(
        await useCases.createProfessional.execute({
          input: input('Pho To'),
          photo: PNG,
        }),
      );
      expect(view.professional.photo).toEqual({
        mimeType: 'image/png',
        updatedAt: NOW,
      });
      const bytes = await professionals.findPhoto('pho-to');
      expect(Buffer.compare(bytes!.data, PNG.data)).toBe(0);
    });

    it('suffixes -2, -3 on a collision and never overwrites', async () => {
      const { useCases, professionals } = setup();
      const create = async () =>
        valueOf(
          await useCases.createProfessional.execute({
            input: input('Alex García'),
            photo: null,
          }),
        ).professional.id;
      expect(await create()).toBe('alex-garcia-2');
      expect(await create()).toBe('alex-garcia-3');
      expect(await professionals.find('alex-garcia')).toMatchObject({
        specialty: 'Especialista',
        rating: 4.9,
      });
    });

    it('collides with an inactive professional too', async () => {
      const { useCases, professionals } = setup();
      await professionals.update('alex-garcia', { active: false });
      const view = valueOf(
        await useCases.createProfessional.execute({
          input: input('Alex Garcia'),
          photo: null,
        }),
      );
      expect(view.professional.id).toBe('alex-garcia-2');
    });

    it('falls back to a generic id when the name has no alphanumerics', async () => {
      const { useCases } = setup();
      const view = valueOf(
        await useCases.createProfessional.execute({
          input: input('???'),
          photo: null,
        }),
      );
      expect(view.professional.id).toBe('professional');
    });

    it('does not reuse the id of a deleted professional that still has bookings', async () => {
      const { useCases, professionals, activity } = setup();
      activity.seed({
        professionalId: 'maria-lopez',
        serviceIds: ['x'],
        date: '2000-01-01',
        status: 'cancelled',
      });
      await professionals.delete('maria-lopez');
      const view = valueOf(
        await useCases.createProfessional.execute({
          input: input('María López'),
          photo: null,
        }),
      );
      expect(view.professional.id).toBe('maria-lopez-2');
    });

    it('reuses the id of a deleted professional without bookings', async () => {
      const { useCases, professionals } = setup();
      await professionals.delete('maria-lopez');
      const view = valueOf(
        await useCases.createProfessional.execute({
          input: input('María López'),
          photo: null,
        }),
      );
      expect(view.professional.id).toBe('maria-lopez');
    });

    it('two simultaneous creations with the same name get different ids', async () => {
      const { useCases } = setup();
      const results = await Promise.all([
        useCases.createProfessional.execute({
          input: input('Ana'),
          photo: null,
        }),
        useCases.createProfessional.execute({
          input: input('Ana'),
          photo: null,
        }),
        useCases.createProfessional.execute({
          input: input('Ana'),
          photo: null,
        }),
      ]);
      expect(results.map((r) => valueOf(r).professional.id).sort()).toEqual([
        'ana',
        'ana-2',
        'ana-3',
      ]);
    });
  });

  describe('UpdateProfessionalUseCase', () => {
    it('updates only the given fields and keeps the id', async () => {
      const { useCases } = setup();
      const view = valueOf(
        await useCases.updateProfessional.execute({
          id: 'maria-lopez',
          patch: { name: 'María L.', active: false },
        }),
      );
      expect(view.professional).toMatchObject({
        id: 'maria-lopez',
        name: 'María L.',
        active: false,
      });
      expect(view.locationIds).toEqual(['principal']);
    });

    it('can reactivate a deactivated professional', async () => {
      const { useCases } = setup();
      await useCases.updateProfessional.execute({
        id: 'maria-lopez',
        patch: { active: false },
      });
      const view = valueOf(
        await useCases.updateProfessional.execute({
          id: 'maria-lopez',
          patch: { active: true },
        }),
      );
      expect(view.professional.active).toBe(true);
    });

    it('answers not-found for an unknown id, with the current message', async () => {
      const { useCases } = setup();
      const error = errorOf(
        await useCases.updateProfessional.execute({
          id: 'nobody',
          patch: { name: 'x' },
        }),
      );
      expect(error).toBeInstanceOf(ProfessionalNotFoundError);
      expect(error.kind).toBe('not-found');
      expect(error.message).toBe('Professional "nobody" not found');
    });

    it('checks the locations before the professional: a bad location on an unknown id is a validation error', async () => {
      const { useCases } = setup();
      const error = errorOf(
        await useCases.updateProfessional.execute({
          id: 'nobody',
          patch: { locations: ['zzz'] },
        }),
      );
      expect(error).toBeInstanceOf(InvalidProfessionalLocationsError);
    });

    it('replaces the locations with active ones', async () => {
      const { useCases, locations } = setup();
      locations.seed({ id: 'centro', active: true, createdAt: new Date(1) });
      locations.seed({ id: 'norte', active: true, createdAt: new Date(2) });
      const view = valueOf(
        await useCases.updateProfessional.execute({
          id: 'maria-lopez',
          patch: { locations: ['norte', 'centro'] },
        }),
      );
      expect(view.locationIds).toEqual(['norte', 'centro']);
    });

    it('keeps the photo and answers the default location for a professional stored without locations', async () => {
      const { useCases, professionals, locations } = setup();
      locations.seed({ id: 'centro', active: true, createdAt: new Date(1) });
      await professionals.savePhoto('maria-lopez', {
        ...PNG,
        updatedAt: NOW,
      });
      const view = valueOf(
        await useCases.updateProfessional.execute({
          id: 'maria-lopez',
          patch: { specialty: 'x' },
        }),
      );
      expect(view.professional.locationIds).toBeNull();
      expect(view.locationIds).toEqual(['centro']);
      expect(view.professional.photo).toEqual({
        mimeType: 'image/png',
        updatedAt: NOW,
      });
    });
  });

  describe('DeactivateProfessionalUseCase', () => {
    it('sets active to false and keeps the professional', async () => {
      const { useCases, professionals } = setup();
      const view = valueOf(
        await useCases.deactivateProfessional.execute('alex-garcia'),
      );
      expect(view.professional.active).toBe(false);
      expect(professionals.count).toBe(2);
    });

    it('answers not-found for an unknown id', async () => {
      const { useCases } = setup();
      expect(
        errorOf(await useCases.deactivateProfessional.execute('nobody')),
      ).toBeInstanceOf(ProfessionalNotFoundError);
    });
  });

  describe('photos', () => {
    it('sets a photo stamped with the clock, and serves it afterwards', async () => {
      const { useCases } = setup();
      const view = valueOf(
        await useCases.setProfessionalPhoto.execute({
          id: 'maria-lopez',
          photo: PNG,
        }),
      );
      expect(view.professional.photo).toEqual({
        mimeType: 'image/png',
        updatedAt: NOW,
      });
      const photo = valueOf(
        await useCases.getProfessionalPhoto.execute('maria-lopez'),
      );
      expect(photo.mimeType).toBe('image/png');
      expect(Buffer.compare(photo.data, PNG.data)).toBe(0);
    });

    it('answers not-found when setting or removing the photo of an unknown professional', async () => {
      const { useCases } = setup();
      expect(
        errorOf(
          await useCases.setProfessionalPhoto.execute({
            id: 'nobody',
            photo: PNG,
          }),
        ).message,
      ).toBe('Professional "nobody" not found');
      expect(
        errorOf(await useCases.removeProfessionalPhoto.execute('nobody'))
          .message,
      ).toBe('Professional "nobody" not found');
    });

    it('removes the photo and leaves the professional active', async () => {
      const { useCases } = setup();
      await useCases.setProfessionalPhoto.execute({
        id: 'maria-lopez',
        photo: PNG,
      });
      const view = valueOf(
        await useCases.removeProfessionalPhoto.execute('maria-lopez'),
      );
      expect(view.professional).toMatchObject({ active: true, photo: null });
      expect(
        errorOf(await useCases.getProfessionalPhoto.execute('maria-lopez')),
      ).toBeInstanceOf(PhotoNotFoundError);
    });

    it('answers "Photo not found" for no photo and for an unknown professional', async () => {
      const { useCases } = setup();
      for (const id of ['maria-lopez', 'nobody']) {
        const error = errorOf(await useCases.getProfessionalPhoto.execute(id));
        expect(error.kind).toBe('not-found');
        expect(error.message).toBe('Photo not found');
      }
    });

    it('serves the photo of an inactive professional', async () => {
      const { useCases } = setup();
      await useCases.setProfessionalPhoto.execute({
        id: 'maria-lopez',
        photo: PNG,
      });
      await useCases.deactivateProfessional.execute('maria-lopez');
      expect(
        valueOf(await useCases.getProfessionalPhoto.execute('maria-lopez'))
          .mimeType,
      ).toBe('image/png');
    });
  });

  describe('DeleteProfessionalPermanentlyUseCase', () => {
    const TODAY = '2030-06-15';
    const booking = (
      professionalId: string,
      date: string,
      status: 'confirmed' | 'cancelled' = 'confirmed',
    ) => ({
      professionalId,
      serviceIds: ['x'],
      date,
      status,
    });

    it('answers not-found for an unknown professional, with the current message', async () => {
      const { useCases } = setup();
      const error = errorOf(
        await useCases.deleteProfessionalPermanently.execute({
          id: 'nobody',
          today: TODAY,
        }),
      );
      expect(error.kind).toBe('not-found');
      expect(error.message).toBe('Professional "nobody" not found');
    });

    it('refuses with a conflict while it has upcoming confirmed bookings, deleting nothing', async () => {
      const { useCases, professionals, activity } = setup();
      activity.seed(booking('alex-garcia', TODAY));
      activity.seed(booking('alex-garcia', '2999-01-01'));
      const error = errorOf(
        await useCases.deleteProfessionalPermanently.execute({
          id: 'alex-garcia',
          today: TODAY,
        }),
      );
      expect(error).toBeInstanceOf(ProfessionalHasUpcomingBookingsError);
      expect(error.kind).toBe('conflict');
      expect(error.message).toBe(
        'No se puede eliminar a Alex García: tiene 2 reservas futuras confirmadas. Cancélalas o desactiva al profesional.',
      );
      expect(professionals.count).toBe(2);
    });

    it('is not blocked by past, cancelled or other professionals bookings', async () => {
      const { useCases, professionals, activity } = setup();
      activity.seed(booking('alex-garcia', '2000-01-01'));
      activity.seed(booking('alex-garcia', '2999-01-01', 'cancelled'));
      activity.seed(booking('maria-lopez', '2999-01-01'));
      valueOf(
        await useCases.deleteProfessionalPermanently.execute({
          id: 'alex-garcia',
          today: TODAY,
        }),
      );
      expect(await professionals.find('alex-garcia')).toBeNull();
    });

    it('refuses with a conflict while it is the only professional of a service, naming the first one', async () => {
      const { useCases, professionals, services } = setup();
      services.seed({
        id: 'mixto',
        name: 'Mixto',
        professionals: ['alex-garcia', 'maria-lopez'],
      });
      services.seed({
        id: 'corte',
        name: 'Corte',
        professionals: ['alex-garcia'],
        active: false,
      });
      services.seed({
        id: 'tinte',
        name: 'Tinte',
        professionals: ['alex-garcia'],
      });
      const error = errorOf(
        await useCases.deleteProfessionalPermanently.execute({
          id: 'alex-garcia',
          today: TODAY,
        }),
      );
      expect(error).toBeInstanceOf(ProfessionalIsSoleProviderError);
      expect(error.message).toBe(
        'No se puede eliminar a Alex García: el servicio "Corte" solo lo ofrece este profesional. Asígnale otro profesional o desactiva el servicio.',
      );
      expect(professionals.count).toBe(2);
    });

    it('checks the bookings before the services', async () => {
      const { useCases, services, activity } = setup();
      services.seed({
        id: 'corte',
        name: 'Corte',
        professionals: ['alex-garcia'],
      });
      activity.seed(booking('alex-garcia', '2999-01-01'));
      const error = errorOf(
        await useCases.deleteProfessionalPermanently.execute({
          id: 'alex-garcia',
          today: TODAY,
        }),
      );
      expect(error).toBeInstanceOf(ProfessionalHasUpcomingBookingsError);
    });

    it('deletes the professional with its photo and pulls the id from the services', async () => {
      const { useCases, professionals, services } = setup();
      await professionals.savePhoto('alex-garcia', { ...PNG, updatedAt: NOW });
      services.seed({
        id: 'mixto',
        name: 'Mixto',
        professionals: ['alex-garcia', 'maria-lopez'],
      });
      services.seed({
        id: 'solo-maria',
        name: 'Solo María',
        professionals: ['maria-lopez'],
      });
      const done = valueOf(
        await useCases.deleteProfessionalPermanently.execute({
          id: 'alex-garcia',
          today: TODAY,
        }),
      );
      expect(done).toEqual({ id: 'alex-garcia', deleted: true });
      expect((await professionals.list('all')).map((p) => p.id)).toEqual([
        'maria-lopez',
      ]);
      expect(await professionals.findPhoto('alex-garcia')).toBeNull();
      expect((await services.list('all')).map((s) => s.professionals)).toEqual([
        ['maria-lopez'],
        ['maria-lopez'],
      ]);
    });
  });

  describe('queries', () => {
    it('ListProfessionalsUseCase lists all or only the active ones, with their locations resolved', async () => {
      const { useCases, professionals } = setup();
      await professionals.update('maria-lopez', {
        active: false,
        locationIds: ['norte'],
      });
      const all = valueOf(
        await useCases.listProfessionals.execute({
          scope: 'all',
          defaultLocationId: 'centro',
        }),
      );
      expect(all.map((v) => [v.professional.id, v.locationIds])).toEqual([
        ['alex-garcia', ['centro']],
        ['maria-lopez', ['norte']],
      ]);
      const active = valueOf(
        await useCases.listProfessionals.execute({
          scope: 'active',
          defaultLocationId: 'centro',
        }),
      );
      expect(active.map((v) => v.professional.id)).toEqual(['alex-garcia']);
    });

    it('FindActiveProfessionalUseCase answers the professional, or null when unknown or inactive', async () => {
      const { useCases, professionals } = setup();
      expect(
        valueOf(await useCases.findActiveProfessional.execute('alex-garcia'))
          ?.id,
      ).toBe('alex-garcia');
      expect(
        valueOf(await useCases.findActiveProfessional.execute('nobody')),
      ).toBeNull();
      await professionals.update('alex-garcia', { active: false });
      expect(
        valueOf(await useCases.findActiveProfessional.execute('alex-garcia')),
      ).toBeNull();
    });

    it('ListProfessionalsForServiceUseCase lists the active professionals of an active service', async () => {
      const { useCases, professionals, services } = setup();
      services.seed({
        id: 'corte',
        name: 'Corte',
        professionals: ['alex-garcia', 'maria-lopez'],
      });
      services.seed({
        id: 'off',
        name: 'Off',
        professionals: ['alex-garcia'],
        active: false,
      });
      await professionals.update('maria-lopez', { active: false });
      const found = valueOf(
        await useCases.listProfessionalsForService.execute('corte'),
      );
      expect(found.map((p) => p.id)).toEqual(['alex-garcia']);
      expect(
        valueOf(await useCases.listProfessionalsForService.execute('off')),
      ).toEqual([]);
      expect(
        valueOf(await useCases.listProfessionalsForService.execute('nope')),
      ).toEqual([]);
    });

    it('ProfessionalWorksAtLocationUseCase checks the stored locations, or the default one when none', async () => {
      const { useCases, professionals, locations } = setup();
      locations.seed({ id: 'centro', active: true, createdAt: new Date(1) });
      await professionals.update('alex-garcia', { locationIds: ['norte'] });
      const works = async (professionalId: string, locationId: string) =>
        valueOf(
          await useCases.professionalWorksAtLocation.execute({
            professionalId,
            locationId,
          }),
        );
      expect(await works('alex-garcia', 'norte')).toBe(true);
      expect(await works('alex-garcia', 'centro')).toBe(false);
      expect(await works('maria-lopez', 'centro')).toBe(true);
      expect(await works('maria-lopez', 'norte')).toBe(false);
      expect(await works('nobody', 'centro')).toBe(false);
      await professionals.update('maria-lopez', { active: false });
      expect(await works('maria-lopez', 'centro')).toBe(false);
    });
  });

  describe('a failing store is not a business error', () => {
    it('lets an infrastructure failure of the repository escape as an exception', async () => {
      const { useCases, professionals } = setup();
      jest
        .spyOn(professionals, 'update')
        .mockRejectedValue(new Error('connection lost'));
      await expect(
        useCases.updateProfessional.execute({
          id: 'alex-garcia',
          patch: { name: 'x' },
        }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('ids are domain errors, not HTTP errors', () => {
    it('InvalidCatalogDataError is a DomainError of kind validation', () => {
      const error = new InvalidCatalogDataError('x');
      expect(error).toBeInstanceOf(DomainError);
      expect(error.kind).toBe('validation');
    });
  });
});
