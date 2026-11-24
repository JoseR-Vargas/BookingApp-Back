import { Injectable, OnModuleInit } from '@nestjs/common';
import { GetPublicCatalogUseCase } from './application/use-cases/get-public-catalog.use-case';
import { GetLocationUseCase } from './application/use-cases/locations/get-location.use-case';
import { ListLocationsUseCase } from './application/use-cases/locations/list-locations.use-case';
import { FindActiveProfessionalUseCase } from './application/use-cases/professionals/find-active-professional.use-case';
import { GetProfessionalPhotoUseCase } from './application/use-cases/professionals/get-professional-photo.use-case';
import { ListProfessionalsForServiceUseCase } from './application/use-cases/professionals/list-professionals-for-service.use-case';
import { ListProfessionalsUseCase } from './application/use-cases/professionals/list-professionals.use-case';
import { ProfessionalWorksAtLocationUseCase } from './application/use-cases/professionals/professional-works-at-location.use-case';
import { ResolveServiceSelectionUseCase } from './application/use-cases/resolve-service-selection.use-case';
import { FindActiveServiceUseCase } from './application/use-cases/services/find-active-service.use-case';
import { GetPublicAvailabilityUseCase } from './application/use-cases/settings/get-public-availability.use-case';
import { ListServicesUseCase } from './application/use-cases/services/list-services.use-case';
import {
  AdminLocation,
  Catalog,
  Professional,
  PublicAvailabilitySettings,
  Service,
  WeeklySchedule,
} from './catalog.config';
import { Location } from './domain/location';
import {
  PRINCIPAL_LOCATION,
  defaultLocation,
  toWeeklySchedule,
} from './domain/location.rules';
import { orThrow } from './facade-errors';
import {
  AdminProfessional,
  AdminService,
  toAdminLocation,
  toAdminProfessional,
  toAdminService,
  toPublicLocation,
  toPublicProfessional,
  toPublicService,
} from './infrastructure/http/catalog.presenter';
import { CatalogSeeder } from './infrastructure/persistence/mongo/catalog.seeder';
import { ServiceSelection } from './service-selection';

export type { AdminProfessional, AdminService };

export interface AdminCatalog {
  professionals: AdminProfessional[];
  services: AdminService[];
  /** The default location's schedule (legacy clients). */
  schedule: WeeklySchedule;
  /** Every location, inactive ones included. */
  locations: AdminLocation[];
  publicAvailability: PublicAvailabilitySettings;
}

export interface StoredPhoto {
  mimeType: string;
  data: Buffer;
}

/**
 * The catalog the modules that are not migrated yet still call.
 *
 * @deprecated TEMPORARY FACADE (specs 11 and 12). It holds no business rule:
 * it wraps the use cases of `application/` and answers with the types and
 * exceptions `bookings`, `availability`, `admin` and the WhatsApp bot expect
 * (a `LocationNotFoundError`, a `ServiceSelectionError`). It is deleted when
 * each consumer migrates and calls the use cases.
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    private readonly seeder: CatalogSeeder,
    private readonly listLocations: ListLocationsUseCase,
    private readonly getLocationUseCase: GetLocationUseCase,
    private readonly getPublicAvailabilityUseCase: GetPublicAvailabilityUseCase,
    private readonly getPublicCatalog: GetPublicCatalogUseCase,
    private readonly listProfessionals: ListProfessionalsUseCase,
    private readonly listServices: ListServicesUseCase,
    private readonly findActiveProfessional: FindActiveProfessionalUseCase,
    private readonly findActiveService: FindActiveServiceUseCase,
    private readonly getProfessionalPhotoUseCase: GetProfessionalPhotoUseCase,
    private readonly listProfessionalsForService: ListProfessionalsForServiceUseCase,
    private readonly professionalWorksAtLocation: ProfessionalWorksAtLocationUseCase,
    private readonly resolveServiceSelection: ResolveServiceSelectionUseCase,
  ) {}

  /** Seeds the defaults (professionals, services, settings, then the principal location). */
  async onModuleInit(): Promise<void> {
    await this.seeder.seed();
  }

  /** Public catalog: active professionals and services only. */
  async getCatalog(): Promise<Catalog> {
    const locations = await this.getActiveLocations();
    const catalog = orThrow(
      await this.getPublicCatalog.execute({
        activeLocationIds: locations.map(({ id }) => id),
        defaultLocationId: locations[0]?.id ?? PRINCIPAL_LOCATION.id,
      }),
    );
    return {
      professionals: catalog.professionals.map(
        ({ professional, locationIds }) => ({
          ...toPublicProfessional(professional),
          locations: locationIds,
        }),
      ),
      services: catalog.services.map(toPublicService),
      schedule: locations[0]
        ? toWeeklySchedule(locations[0])
        : await this.getSchedule(),
      locations: locations.map(toPublicLocation),
    };
  }

  /** Admin catalog: everything, inactive items included. */
  async getAdminCatalog(): Promise<AdminCatalog> {
    const [locations, publicAvailability] = await Promise.all([
      this.listLocations.execute('all').then(orThrow),
      this.getPublicAvailability(),
    ]);
    const oldestActive = defaultLocation(locations);
    const defaultLocationId = oldestActive?.id ?? PRINCIPAL_LOCATION.id;
    const [professionals, services] = await Promise.all([
      this.listProfessionals.execute({ scope: 'all', defaultLocationId }),
      this.listServices.execute({ scope: 'all' }),
    ]);
    return {
      professionals: orThrow(professionals).map(toAdminProfessional),
      services: orThrow(services).map(toAdminService),
      schedule: toWeeklySchedule(oldestActive ?? locations[0]),
      locations: locations.map(toAdminLocation),
      publicAvailability,
    };
  }

  /** Public availability page settings; the default (off) when none is stored. */
  async getPublicAvailability(): Promise<PublicAvailabilitySettings> {
    return orThrow(await this.getPublicAvailabilityUseCase.execute());
  }

  /**
   * The weekly schedule of a location; of the default location when
   * `locationId` is omitted.
   * @throws LocationNotFoundError for an unknown or inactive location.
   */
  async getSchedule(locationId?: string): Promise<WeeklySchedule> {
    return toWeeklySchedule(await this.getLocation(locationId));
  }

  /** Active locations, oldest first (the first is the default). */
  async getActiveLocations(): Promise<Location[]> {
    return orThrow(await this.listLocations.execute('active'));
  }

  /** Id of the default location: the oldest active one. */
  async getDefaultLocationId(): Promise<string> {
    return (await this.getLocation()).id;
  }

  /**
   * An active location by id; the default one when `id` is omitted.
   * @throws LocationNotFoundError for an unknown or inactive location.
   */
  async getLocation(id?: string): Promise<Location> {
    return orThrow(await this.getLocationUseCase.execute(id));
  }

  /** Whether an active professional works at the given location. */
  async worksAtLocation(
    professionalId: string,
    locationId: string,
  ): Promise<boolean> {
    return orThrow(
      await this.professionalWorksAtLocation.execute({
        professionalId,
        locationId,
      }),
    );
  }

  /** An active service by id. */
  async findService(id: string): Promise<Service | undefined> {
    const service = orThrow(await this.findActiveService.execute(id));
    return service ? toPublicService(service) : undefined;
  }

  /** An active professional by id. */
  async findProfessional(id: string): Promise<Professional | undefined> {
    const professional = orThrow(await this.findActiveProfessional.execute(id));
    return professional ? toPublicProfessional(professional) : undefined;
  }

  /** The photo of a professional, active or not; null without photo. */
  async getProfessionalPhoto(id: string): Promise<StoredPhoto | null> {
    const result = await this.getProfessionalPhotoUseCase.execute(id);
    return result.ok
      ? { mimeType: result.value.mimeType, data: result.value.data }
      : null;
  }

  /**
   * Resolves service ids into a validated selection. Throws a
   * ServiceSelectionError for an empty list, a duplicated id or an unknown
   * (or inactive) id. With `locationId`, only the professionals assigned to
   * that location are offered.
   */
  async resolveServices(
    serviceIds: string[],
    locationId?: string,
  ): Promise<ServiceSelection> {
    const selection = orThrow(
      await this.resolveServiceSelection.execute({ serviceIds, locationId }),
    );
    return {
      services: selection.services.map(toPublicService),
      professionals: selection.professionals.map(toPublicProfessional),
      totalPrice: selection.totalPrice,
      totalDuration: selection.totalDuration,
    };
  }

  async getProfessionalsForService(serviceId: string): Promise<Professional[]> {
    return orThrow(
      await this.listProfessionalsForService.execute(serviceId),
    ).map(toPublicProfessional);
  }
}
