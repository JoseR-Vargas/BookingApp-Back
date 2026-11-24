import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GetPublicCatalogUseCase } from './application/use-cases/get-public-catalog.use-case';
import { FindActiveProfessionalUseCase } from './application/use-cases/professionals/find-active-professional.use-case';
import { GetProfessionalPhotoUseCase } from './application/use-cases/professionals/get-professional-photo.use-case';
import { ListProfessionalsForServiceUseCase } from './application/use-cases/professionals/list-professionals-for-service.use-case';
import { ListProfessionalsUseCase } from './application/use-cases/professionals/list-professionals.use-case';
import { ProfessionalWorksAtLocationUseCase } from './application/use-cases/professionals/professional-works-at-location.use-case';
import { ResolveServiceSelectionUseCase } from './application/use-cases/resolve-service-selection.use-case';
import { FindActiveServiceUseCase } from './application/use-cases/services/find-active-service.use-case';
import { ListServicesUseCase } from './application/use-cases/services/list-services.use-case';
import {
  AdminLocation,
  Catalog,
  PUBLIC_AVAILABILITY,
  Professional,
  PublicAvailabilitySettings,
  PublicLocation,
  Service,
  WeeklySchedule,
} from './catalog.config';
import {
  NoActiveLocationError,
  ServiceSelectionFailedError,
} from './domain/catalog.errors';
import {
  AdminProfessional,
  AdminService,
  toAdminProfessional,
  toAdminService,
  toPublicProfessional,
  toPublicService,
} from './infrastructure/http/catalog.presenter';
import { CatalogSeeder } from './infrastructure/persistence/mongo/catalog.seeder';
import {
  LocationNotFoundError,
  PRINCIPAL_LOCATION,
  activeLocations,
  loadLocations,
  toWeeklySchedule,
} from './locations';
import {
  BusinessSettingsRecord,
  SCHEDULE_KEY,
} from './schemas/business-settings.schema';
import { LocationRecord } from './schemas/location.schema';
import { ServiceSelection, ServiceSelectionError } from './service-selection';
import { Result } from '../shared/domain/result';

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

export const toAdminLocation = (record: LocationRecord): AdminLocation => ({
  ...toPublicLocation(record),
  active: record.active,
});

export const toPublicLocation = (record: LocationRecord): PublicLocation => ({
  id: record.id,
  name: record.name,
  address: record.address ?? '',
  schedule: toWeeklySchedule(record),
});

/**
 * Hands a use case's value to a caller that still expects exceptions: the
 * errors the unmigrated modules recognize are rebuilt as they were (a
 * ServiceSelectionError, a LocationNotFoundError); any other business failure
 * is thrown as the domain error and ends in the same HTTP answer.
 */
function orThrow<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  const { error } = result;
  if (error instanceof ServiceSelectionFailedError) {
    throw new ServiceSelectionError(error.failure, error.serviceId);
  }
  if (error instanceof NoActiveLocationError) {
    throw new LocationNotFoundError(PRINCIPAL_LOCATION.id);
  }
  throw error;
}

/**
 * The catalog the modules that are not migrated yet still call.
 *
 * @deprecated TEMPORARY FACADE (spec 11). It holds no business rule: it wraps
 * the use cases of `application/` and answers with the types and exceptions
 * `bookings`, `availability`, `admin` and the WhatsApp bot expect. Locations,
 * schedules and the public availability settings still live here until spec 12;
 * the facade is deleted when each consumer migrates and calls the use cases.
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    private readonly seeder: CatalogSeeder,
    @InjectModel(BusinessSettingsRecord.name)
    private readonly settingsModel: Model<BusinessSettingsRecord>,
    @InjectModel(LocationRecord.name)
    private readonly locationModel: Model<LocationRecord>,
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
      loadLocations(this.locationModel, this.settingsModel),
      this.getPublicAvailability(),
    ]);
    const defaultLocation = activeLocations(locations)[0];
    const defaultLocationId = defaultLocation?.id ?? PRINCIPAL_LOCATION.id;
    const [professionals, services] = await Promise.all([
      this.listProfessionals.execute({ scope: 'all', defaultLocationId }),
      this.listServices.execute({ scope: 'all' }),
    ]);
    return {
      professionals: orThrow(professionals).map(toAdminProfessional),
      services: orThrow(services).map(toAdminService),
      schedule: toWeeklySchedule(defaultLocation ?? locations[0]),
      locations: locations.map(toAdminLocation),
      publicAvailability,
    };
  }

  /** Public availability page settings; the default (off) when none is stored. */
  async getPublicAvailability(): Promise<PublicAvailabilitySettings> {
    const stored = await this.settingsModel
      .findOne({ key: SCHEDULE_KEY })
      .lean<BusinessSettingsRecord | null>()
      .exec();
    return stored?.publicAvailability ?? { ...PUBLIC_AVAILABILITY };
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
  async getActiveLocations(): Promise<LocationRecord[]> {
    return activeLocations(
      await loadLocations(this.locationModel, this.settingsModel),
    );
  }

  /** Id of the default location: the oldest active one. */
  async getDefaultLocationId(): Promise<string> {
    return (await this.getLocation()).id;
  }

  /**
   * An active location by id; the default one when `id` is omitted.
   * @throws LocationNotFoundError for an unknown or inactive location.
   */
  async getLocation(id?: string): Promise<LocationRecord> {
    const active = await this.getActiveLocations();
    const found =
      id === undefined ? active[0] : active.find((l) => l.id === id);
    if (!found) {
      throw new LocationNotFoundError(id ?? PRINCIPAL_LOCATION.id);
    }
    return found;
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
