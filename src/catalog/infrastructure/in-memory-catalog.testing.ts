/**
 * Test-only wiring of every catalog use case over the in-memory adapters, the
 * same constructors the module uses, with no Nest container and no database.
 */
import { Provider } from '@nestjs/common';
import { CLOCK, Clock } from '../../shared/application/clock.port';
import { BOOKING_ACTIVITY } from '../application/ports/booking-activity.port';
import { LOCATION_DIRECTORY } from '../application/ports/location-directory.port';
import { PROFESSIONAL_PHOTO_STORE } from '../application/ports/professional-photo.store';
import { PROFESSIONAL_READER } from '../application/ports/professional.reader';
import { PROFESSIONAL_WRITER } from '../application/ports/professional.writer';
import { SERVICE_READER } from '../application/ports/service.reader';
import { SERVICE_WRITER } from '../application/ports/service.writer';
import { InMemoryBookingActivity } from './persistence/in-memory/in-memory-booking-activity';
import { InMemoryLocationDirectory } from './persistence/in-memory/in-memory-location-directory';
import { InMemoryProfessionalRepository } from './persistence/in-memory/in-memory-professional.repository';
import { InMemoryServiceRepository } from './persistence/in-memory/in-memory-service.repository';
import { CreateProfessionalUseCase } from '../application/use-cases/professionals/create-professional.use-case';
import { DeactivateProfessionalUseCase } from '../application/use-cases/professionals/deactivate-professional.use-case';
import { DeleteProfessionalPermanentlyUseCase } from '../application/use-cases/professionals/delete-professional-permanently.use-case';
import { FindActiveProfessionalUseCase } from '../application/use-cases/professionals/find-active-professional.use-case';
import { GetProfessionalPhotoUseCase } from '../application/use-cases/professionals/get-professional-photo.use-case';
import { ListProfessionalsForServiceUseCase } from '../application/use-cases/professionals/list-professionals-for-service.use-case';
import { ListProfessionalsUseCase } from '../application/use-cases/professionals/list-professionals.use-case';
import { ProfessionalWorksAtLocationUseCase } from '../application/use-cases/professionals/professional-works-at-location.use-case';
import { RemoveProfessionalPhotoUseCase } from '../application/use-cases/professionals/remove-professional-photo.use-case';
import { SetProfessionalPhotoUseCase } from '../application/use-cases/professionals/set-professional-photo.use-case';
import { UpdateProfessionalUseCase } from '../application/use-cases/professionals/update-professional.use-case';
import { GetPublicCatalogUseCase } from '../application/use-cases/get-public-catalog.use-case';
import { ResolveServiceSelectionUseCase } from '../application/use-cases/resolve-service-selection.use-case';
import { CreateServiceUseCase } from '../application/use-cases/services/create-service.use-case';
import { DeactivateServiceUseCase } from '../application/use-cases/services/deactivate-service.use-case';
import { DeleteServicePermanentlyUseCase } from '../application/use-cases/services/delete-service-permanently.use-case';
import { FindActiveServiceUseCase } from '../application/use-cases/services/find-active-service.use-case';
import { ListServicesUseCase } from '../application/use-cases/services/list-services.use-case';
import { UpdateServiceUseCase } from '../application/use-cases/services/update-service.use-case';

/** A clock that always answers the same instant. */
export const fixedClock = (instant: Date): Clock => ({
  now: () => new Date(instant),
});

/** The in-memory adapters, empty, and every use case wired to them. */
export function inMemoryCatalog(
  clock: Clock = fixedClock(new Date(1_700_000_000_000)),
) {
  const professionals = new InMemoryProfessionalRepository();
  const services = new InMemoryServiceRepository();
  const activity = new InMemoryBookingActivity();
  const locations = new InMemoryLocationDirectory();

  const updateProfessional = new UpdateProfessionalUseCase(
    professionals,
    locations,
  );
  const updateService = new UpdateServiceUseCase(services, professionals);
  return {
    professionals,
    services,
    activity,
    locations,
    useCases: {
      listProfessionals: new ListProfessionalsUseCase(professionals),
      createProfessional: new CreateProfessionalUseCase(
        professionals,
        locations,
        activity,
        clock,
      ),
      updateProfessional,
      deactivateProfessional: new DeactivateProfessionalUseCase(
        updateProfessional,
      ),
      setProfessionalPhoto: new SetProfessionalPhotoUseCase(
        professionals,
        locations,
        clock,
      ),
      removeProfessionalPhoto: new RemoveProfessionalPhotoUseCase(
        professionals,
        locations,
      ),
      getProfessionalPhoto: new GetProfessionalPhotoUseCase(professionals),
      deleteProfessionalPermanently: new DeleteProfessionalPermanentlyUseCase(
        professionals,
        professionals,
        services,
        services,
        activity,
      ),
      findActiveProfessional: new FindActiveProfessionalUseCase(professionals),
      listProfessionalsForService: new ListProfessionalsForServiceUseCase(
        services,
        professionals,
      ),
      professionalWorksAtLocation: new ProfessionalWorksAtLocationUseCase(
        professionals,
        locations,
      ),
      listServices: new ListServicesUseCase(services),
      createService: new CreateServiceUseCase(
        services,
        professionals,
        activity,
      ),
      updateService,
      deactivateService: new DeactivateServiceUseCase(updateService),
      deleteServicePermanently: new DeleteServicePermanentlyUseCase(
        services,
        services,
        activity,
      ),
      findActiveService: new FindActiveServiceUseCase(services),
      resolveServiceSelection: new ResolveServiceSelectionUseCase(
        services,
        professionals,
        locations,
      ),
      getPublicCatalog: new GetPublicCatalogUseCase(services, professionals),
    },
  };
}

/**
 * Binds every catalog port to the in-memory adapters of `kit` (the swap proof):
 * the same use cases and tokens as `catalog.module.ts`, with no database.
 */
export function inMemoryCatalogProviders(
  kit: ReturnType<typeof inMemoryCatalog>,
  clock: Clock = fixedClock(new Date()),
): Provider[] {
  return [
    { provide: PROFESSIONAL_READER, useValue: kit.professionals },
    { provide: PROFESSIONAL_WRITER, useValue: kit.professionals },
    { provide: PROFESSIONAL_PHOTO_STORE, useValue: kit.professionals },
    { provide: SERVICE_READER, useValue: kit.services },
    { provide: SERVICE_WRITER, useValue: kit.services },
    { provide: BOOKING_ACTIVITY, useValue: kit.activity },
    { provide: LOCATION_DIRECTORY, useValue: kit.locations },
    { provide: CLOCK, useValue: clock },
    ListProfessionalsUseCase,
    CreateProfessionalUseCase,
    UpdateProfessionalUseCase,
    DeactivateProfessionalUseCase,
    SetProfessionalPhotoUseCase,
    RemoveProfessionalPhotoUseCase,
    GetProfessionalPhotoUseCase,
    DeleteProfessionalPermanentlyUseCase,
    FindActiveProfessionalUseCase,
    ListProfessionalsForServiceUseCase,
    ProfessionalWorksAtLocationUseCase,
    ListServicesUseCase,
    CreateServiceUseCase,
    UpdateServiceUseCase,
    DeactivateServiceUseCase,
    DeleteServicePermanentlyUseCase,
    FindActiveServiceUseCase,
    ResolveServiceSelectionUseCase,
    GetPublicCatalogUseCase,
  ];
}
