import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Catalog,
  PROFESSIONALS,
  Professional,
  SCHEDULE,
  SERVICES,
  Service,
  WeeklySchedule,
} from './catalog.config';
import { toBuffer } from '../branding/branding.service';
import { insertIfAbsent } from './insert-if-absent';
import {
  BusinessSettingsRecord,
  SCHEDULE_KEY,
} from './schemas/business-settings.schema';
import { ProfessionalRecord } from './schemas/professional.schema';
import { ServiceRecord } from './schemas/service.schema';
import { ServiceSelection, ServiceSelectionError } from './service-selection';

/** Admin view of a professional: the stored fields, `active` included. */
export type AdminProfessional = Omit<Professional, 'available' | 'photoUrl'> & {
  active: boolean;
  photoUrl: string | null;
};

/** Admin view of a service: the public fields plus `active`. */
export type AdminService = Service & { active: boolean };

export interface AdminCatalog {
  professionals: AdminProfessional[];
  services: AdminService[];
  schedule: WeeklySchedule;
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
): AdminProfessional => ({
  id: record.id,
  name: record.name,
  specialty: record.specialty,
  experience: record.experience,
  rating: record.rating,
  avatar: record.avatar,
  active: record.active,
  photoUrl: photoUrlOf(record),
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
      },
    );
  }

  /** Public catalog: active professionals and services only. */
  async getCatalog(): Promise<Catalog> {
    const [professionals, services, schedule] = await Promise.all([
      this.activeProfessionals(),
      this.activeServices(),
      this.getSchedule(),
    ]);
    const activeIds = new Set(professionals.map(({ id }) => id));
    return {
      professionals: professionals.map(toPublicProfessional),
      services: services.map((record) => ({
        ...toPublicService(record),
        professionals: record.professionals.filter((id) => activeIds.has(id)),
      })),
      schedule,
    };
  }

  /** Admin catalog: everything, inactive items included. */
  async getAdminCatalog(): Promise<AdminCatalog> {
    const [professionals, services, schedule] = await Promise.all([
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
      this.getSchedule(),
    ]);
    return {
      professionals: professionals.map(toAdminProfessional),
      services: services.map(toAdminService),
      schedule,
    };
  }

  /** The weekly schedule; the seeded defaults if it was never stored. */
  async getSchedule(): Promise<WeeklySchedule> {
    const stored = await this.settingsModel
      .findOne({ key: SCHEDULE_KEY })
      .lean<BusinessSettingsRecord | null>()
      .exec();
    return stored
      ? {
          weekly: stored.weekly,
          slotIntervalMinutes: stored.slotIntervalMinutes,
        }
      : SCHEDULE;
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
   * (or inactive) id.
   */
  async resolveServices(serviceIds: string[]): Promise<ServiceSelection> {
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
    return {
      services,
      professionals: professionals
        .filter((professional) =>
          services.every((s) => s.professionals.includes(professional.id)),
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
