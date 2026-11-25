/**
 * Test-only wiring of every catalog use case over the in-memory adapters, the
 * same constructors the module uses, with no Nest container and no database.
 */
import { Provider } from '@nestjs/common';
import { CLOCK, Clock } from '../../shared/application/clock.port';
import { BOOKING_ACTIVITY } from '../application/ports/booking-activity.port';
import { LEGACY_SCHEDULE_READER } from '../application/ports/legacy-schedule.reader';
import { LOCATION_READER } from '../application/ports/location.reader';
import { LOCATION_WRITER } from '../application/ports/location.writer';
import { PUBLIC_AVAILABILITY_READER } from '../application/ports/public-availability.reader';
import { PUBLIC_AVAILABILITY_WRITER } from '../application/ports/public-availability.writer';
import { PROFESSIONAL_PHOTO_STORE } from '../application/ports/professional-photo.store';
import { PROFESSIONAL_READER } from '../application/ports/professional.reader';
import { PROFESSIONAL_WRITER } from '../application/ports/professional.writer';
import { SERVICE_READER } from '../application/ports/service.reader';
import { SERVICE_WRITER } from '../application/ports/service.writer';
import { InMemoryBookingActivity } from './persistence/in-memory/in-memory-booking-activity';
import { InMemoryBusinessSettings } from './persistence/in-memory/in-memory-business-settings';
import { InMemoryLocationRepository } from './persistence/in-memory/in-memory-location.repository';
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
import { CreateLocationUseCase } from '../application/use-cases/locations/create-location.use-case';
import { EnsurePrincipalLocationUseCase } from '../application/use-cases/locations/ensure-principal-location.use-case';
import { GetLocationUseCase } from '../application/use-cases/locations/get-location.use-case';
import { ListLocationsUseCase } from '../application/use-cases/locations/list-locations.use-case';
import { ResolveDefaultLocationUseCase } from '../application/use-cases/locations/resolve-default-location.use-case';
import { SaveLocationScheduleUseCase } from '../application/use-cases/locations/save-location-schedule.use-case';
import { UpdateLocationUseCase } from '../application/use-cases/locations/update-location.use-case';
import { GetPublicAvailabilityUseCase } from '../application/use-cases/settings/get-public-availability.use-case';
import { SavePublicAvailabilityUseCase } from '../application/use-cases/settings/save-public-availability.use-case';

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
  const settings = new InMemoryBusinessSettings();
  const locations = new InMemoryLocationRepository(settings);
  const ensurePrincipalLocation = new EnsurePrincipalLocationUseCase(
    locations,
    locations,
    settings,
    clock,
  );

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
    settings,
    useCases: {
      listLocations: new ListLocationsUseCase(locations),
      getLocation: new GetLocationUseCase(locations),
      resolveDefaultLocation: new ResolveDefaultLocationUseCase(locations),
      ensurePrincipalLocation,
      createLocation: new CreateLocationUseCase(locations, clock),
      updateLocation: new UpdateLocationUseCase(locations, locations),
      saveLocationSchedule: new SaveLocationScheduleUseCase(
        locations,
        locations,
        ensurePrincipalLocation,
      ),
      getPublicAvailability: new GetPublicAvailabilityUseCase(settings),
      savePublicAvailability: new SavePublicAvailabilityUseCase(
        services,
        settings,
      ),
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
    { provide: LOCATION_READER, useValue: kit.locations },
    { provide: LOCATION_WRITER, useValue: kit.locations },
    { provide: LEGACY_SCHEDULE_READER, useValue: kit.settings },
    { provide: PUBLIC_AVAILABILITY_READER, useValue: kit.settings },
    { provide: PUBLIC_AVAILABILITY_WRITER, useValue: kit.settings },
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
    ListLocationsUseCase,
    GetLocationUseCase,
    ResolveDefaultLocationUseCase,
    EnsurePrincipalLocationUseCase,
    CreateLocationUseCase,
    UpdateLocationUseCase,
    SaveLocationScheduleUseCase,
    GetPublicAvailabilityUseCase,
    SavePublicAvailabilityUseCase,
  ];
}
