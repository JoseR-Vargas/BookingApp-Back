import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdminLocation,
  Catalog,
  PROFESSIONALS,
  PUBLIC_AVAILABILITY,
  Professional,
  PublicAvailabilitySettings,
  PublicLocation,
  SCHEDULE,
  SERVICES,
  Service,
  WeeklySchedule,
} from './catalog.config';
import { toBuffer } from '../shared/infrastructure/mongo/to-buffer';
import { insertIfAbsent } from './insert-if-absent';
import {
  BusinessSettingsRecord,
  SCHEDULE_KEY,
} from './schemas/business-settings.schema';
import { LocationRecord } from './schemas/location.schema';
import {
  LocationNotFoundError,
  PRINCIPAL_LOCATION,
  activeLocations,
  ensurePrincipalLocation,
  loadLocations,
  professionalLocationIds,
  toWeeklySchedule,
} from './locations';
import { ProfessionalRecord } from './schemas/professional.schema';
import { ServiceRecord } from './schemas/service.schema';
import { ServiceSelection, ServiceSelectionError } from './service-selection';

/** Admin view of a professional: the stored fields, `active` included. */
export type AdminProfessional = Omit<
  Professional,
  'available' | 'photoUrl' | 'locations'
> & {
  active: boolean;
  photoUrl: string | null;
  /** Stored location ids (inactive ones included); absent = the default. */
  locations: string[];
};

/** Admin view of a service: the public fields plus `active`. */
export type AdminService = Service & { active: boolean };

export interface AdminCatalog {
  professionals: AdminProfessional[];
  services: AdminService[];
  /** The default location's schedule (legacy clients). */
  schedule: WeeklySchedule;
  /** Every location, inactive ones included. */
  locations: AdminLocation[];
  publicAvailability: PublicAvailabilitySettings;
}

/** Projection that keeps the photo bytes out of every professional query. */
export const WITHOUT_PHOTO_BYTES = '-photo.data';

export interface StoredPhoto {
  mimeType: string;
  data: Buffer;
}

const photoUrlOf = (record: ProfessionalRecord): string | null =>
  record.photo
    ? `/api/catalog/professionals/${record.id}/photo?v=${new Date(record.photo.updatedAt).getTime()}`
    : null;

/** Natural creation order: seeded defaults first, then admin additions. */
const CREATION_ORDER = { _id: 1 } as const;

export const toAdminProfessional = (
  record: ProfessionalRecord,
  defaultLocationId: string,
): AdminProfessional => ({
  id: record.id,
  name: record.name,
  specialty: record.specialty,
  experience: record.experience,
  rating: record.rating,
  avatar: record.avatar,
  active: record.active,
  photoUrl: photoUrlOf(record),
  locations: professionalLocationIds(record, defaultLocationId),
});

export const toAdminLocation = (record: LocationRecord): AdminLocation => ({
  ...toPublicLocation(record),
  active: record.active,
});

export const toAdminService = (record: ServiceRecord): AdminService => ({
  id: record.id,
  name: record.name,
  description: record.description,
  price: record.price,
  duration: record.duration,
  professionals: [...record.professionals],
  icon: record.icon,
  active: record.active,
});

export const toPublicLocation = (record: LocationRecord): PublicLocation => ({
  id: record.id,
  name: record.name,
  address: record.address ?? '',
  schedule: toWeeklySchedule(record),
});

const toPublicProfessional = (record: ProfessionalRecord): Professional => ({
  id: record.id,
  name: record.name,
  specialty: record.specialty,
  experience: record.experience,
  rating: record.rating,
  avatar: record.avatar,
  available: true,
  photoUrl: photoUrlOf(record),
});

const toPublicService = (record: ServiceRecord): Service => ({
  id: record.id,
  name: record.name,
  description: record.description,
  price: record.price,
  duration: record.duration,
  professionals: [...record.professionals],
  icon: record.icon,
});

/**
 * The business catalog (professionals, services and weekly schedule), read
 * from MongoDB on every call: serverless runs several instances, so an
 * in-memory cache would go stale after an admin edit.
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    @InjectModel(ProfessionalRecord.name)
    private readonly professionalModel: Model<ProfessionalRecord>,
    @InjectModel(ServiceRecord.name)
    private readonly serviceModel: Model<ServiceRecord>,
    @InjectModel(BusinessSettingsRecord.name)
    private readonly settingsModel: Model<BusinessSettingsRecord>,
    @InjectModel(LocationRecord.name)
    private readonly locationModel: Model<LocationRecord>,
  ) {}

  /**
   * Seeds the defaults of catalog.config.ts. Each document is inserted only
   * if its key is absent ($setOnInsert), so admin edits survive restarts and
   * concurrent instances can seed at the same time.
   */
  async onModuleInit(): Promise<void> {
    for (const { available, id, ...fields } of PROFESSIONALS) {
      await insertIfAbsent(
        this.professionalModel,
        { id },
        { ...fields, active: available },
      );
    }
    for (const { id, ...fields } of SERVICES) {
      await insertIfAbsent(
        this.serviceModel,
        { id },
        { ...fields, active: true },
      );
    }
    await insertIfAbsent(
      this.settingsModel,
      { key: SCHEDULE_KEY },
      {
        weekly: SCHEDULE.weekly,
        slotIntervalMinutes: SCHEDULE.slotIntervalMinutes,
        startIntervalMinutes: SCHEDULE.startIntervalMinutes,
      },
    );
    // After the settings: "principal" copies their schedule.
    await ensurePrincipalLocation(this.locationModel, this.settingsModel);
  }

  /** Public catalog: active professionals and services only. */
  async getCatalog(): Promise<Catalog> {
    const [professionals, services, locations] = await Promise.all([
      this.activeProfessionals(),
      this.activeServices(),
      this.getActiveLocations(),
    ]);
    const activeIds = new Set(professionals.map(({ id }) => id));
    const activeLocationIds = new Set(locations.map(({ id }) => id));
    const defaultId = locations[0]?.id ?? PRINCIPAL_LOCATION.id;
    return {
      professionals: professionals.map((record) => ({
        ...toPublicProfessional(record),
        locations: professionalLocationIds(record, defaultId).filter((id) =>
          activeLocationIds.has(id),
        ),
      })),
      services: services.map((record) => ({
        ...toPublicService(record),
        professionals: record.professionals.filter((id) => activeIds.has(id)),
      })),
      schedule: locations[0]
        ? toWeeklySchedule(locations[0])
        : await this.getSchedule(),
      locations: locations.map(toPublicLocation),
    };
  }

  /** Admin catalog: everything, inactive items included. */
  async getAdminCatalog(): Promise<AdminCatalog> {
    const [professionals, services, locations, publicAvailability] =
      await Promise.all([
        this.professionalModel
          .find({})
          .select(WITHOUT_PHOTO_BYTES)
          .sort(CREATION_ORDER)
          .lean<ProfessionalRecord[]>()
          .exec(),
        this.serviceModel
          .find({})
          .sort(CREATION_ORDER)
          .lean<ServiceRecord[]>()
          .exec(),
        loadLocations(this.locationModel, this.settingsModel),
        this.getPublicAvailability(),
      ]);
    const defaultLocation = activeLocations(locations)[0];
    return {
      professionals: professionals.map((record) =>
        toAdminProfessional(
          record,
          defaultLocation?.id ?? PRINCIPAL_LOCATION.id,
        ),
      ),
      services: services.map(toAdminService),
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
    const record = await this.professionalModel
      .findOne({ id: professionalId, active: true })
      .select(WITHOUT_PHOTO_BYTES)
      .lean<ProfessionalRecord | null>()
      .exec();
    if (!record) {
      return false;
    }
    const defaultId = await this.getDefaultLocationId();
    return professionalLocationIds(record, defaultId).includes(locationId);
  }

  /** An active service by id. */
  async findService(id: string): Promise<Service | undefined> {
    const record = await this.serviceModel
      .findOne({ id, active: true })
      .lean<ServiceRecord | null>()
      .exec();
    return record ? toPublicService(record) : undefined;
  }

  /** An active professional by id. */
  async findProfessional(id: string): Promise<Professional | undefined> {
    const record = await this.professionalModel
      .findOne({ id, active: true })
      .select(WITHOUT_PHOTO_BYTES)
      .lean<ProfessionalRecord | null>()
      .exec();
    return record ? toPublicProfessional(record) : undefined;
  }

  /** The photo of a professional, active or not; null without photo. */
  async getProfessionalPhoto(id: string): Promise<StoredPhoto | null> {
    const record = await this.professionalModel
      .findOne({ id })
      .lean<ProfessionalRecord | null>()
      .exec();
    const photo = record?.photo;
    return photo
      ? { mimeType: photo.mimeType, data: toBuffer(photo.data) }
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
    if (serviceIds.length === 0) {
      throw new ServiceSelectionError('empty');
    }
    const duplicate = serviceIds.find(
      (id, index) => serviceIds.indexOf(id) !== index,
    );
    if (duplicate !== undefined) {
      throw new ServiceSelectionError('duplicate', duplicate);
    }

    const found = await this.serviceModel
      .find({ id: { $in: serviceIds }, active: true })
      .lean<ServiceRecord[]>()
      .exec();
    const services = serviceIds.map((id) => {
      const record = found.find((candidate) => candidate.id === id);
      if (!record) {
        throw new ServiceSelectionError('unknown', id);
      }
      return toPublicService(record);
    });

    const professionals = await this.activeProfessionals();
    const defaultId =
      locationId === undefined ? '' : await this.getDefaultLocationId();
    return {
      services,
      professionals: professionals
        .filter((professional) =>
          services.every((s) => s.professionals.includes(professional.id)),
        )
        .filter(
          (professional) =>
            locationId === undefined ||
            professionalLocationIds(professional, defaultId).includes(
              locationId,
            ),
        )
        .map(toPublicProfessional),
      totalPrice: services.reduce((sum, s) => sum + s.price, 0),
      totalDuration: services.reduce((sum, s) => sum + s.duration, 0),
    };
  }

  async getProfessionalsForService(serviceId: string): Promise<Professional[]> {
    const service = await this.findService(serviceId);
    if (!service) {
      return [];
    }
    const professionals = await this.activeProfessionals();
    return professionals
      .filter((professional) => service.professionals.includes(professional.id))
      .map(toPublicProfessional);
  }

  private activeProfessionals(): Promise<ProfessionalRecord[]> {
    return this.professionalModel
      .find({ active: true })
      .select(WITHOUT_PHOTO_BYTES)
      .sort(CREATION_ORDER)
      .lean<ProfessionalRecord[]>()
      .exec();
  }

  private activeServices(): Promise<ServiceRecord[]> {
    return this.serviceModel
      .find({ active: true })
      .sort(CREATION_ORDER)
      .lean<ServiceRecord[]>()
      .exec();
  }
}
