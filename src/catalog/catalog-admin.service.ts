import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParsedImage } from '../common/image-data-url';
import { ProfessionalInput, ServiceInput, slugify } from './catalog-validation';
import {
  DayOfWeek,
  DaySchedule,
  SCHEDULE,
  WeeklySchedule,
} from './catalog.config';
import {
  AdminProfessional,
  AdminService,
  toAdminProfessional,
  WITHOUT_PHOTO_BYTES,
  toAdminService,
} from './catalog.service';
import { insertIfAbsent } from './insert-if-absent';
import {
  BusinessSettingsRecord,
  SCHEDULE_KEY,
} from './schemas/business-settings.schema';
import { ProfessionalRecord } from './schemas/professional.schema';
import { ServiceRecord } from './schemas/service.schema';

const DEFAULT_RATING = 5;
const DEFAULT_AVATAR = 'fas fa-user';
const DEFAULT_ICON = 'fas fa-star';

/**
 * Write side of the catalog for the admin panel. Inputs arrive already
 * validated (see catalog-validation.ts); this service enforces what needs the
 * database: unique ids, existing professionals and existing documents.
 */
@Injectable()
export class CatalogAdminService {
  constructor(
    @InjectModel(ProfessionalRecord.name)
    private readonly professionalModel: Model<ProfessionalRecord>,
    @InjectModel(ServiceRecord.name)
    private readonly serviceModel: Model<ServiceRecord>,
    @InjectModel(BusinessSettingsRecord.name)
    private readonly settingsModel: Model<BusinessSettingsRecord>,
  ) {}

  /** The photo, already validated, is stored in the same insert. */
  async createProfessional(
    input: ProfessionalInput,
    photo: ParsedImage | null = null,
  ): Promise<AdminProfessional> {
    const fields = {
      ...input,
      rating: DEFAULT_RATING,
      avatar: DEFAULT_AVATAR,
      photo: photo ? { ...photo, updatedAt: new Date() } : null,
    };
    const id = await this.insertWithUniqueId(
      this.professionalModel,
      slugify(input.name, 'professional'),
      fields,
    );
    return toAdminProfessional({ id, ...fields });
  }

  async updateProfessional(
    id: string,
    patch: Partial<ProfessionalInput>,
  ): Promise<AdminProfessional> {
    return this.setProfessionalFields(id, patch);
  }

  setProfessionalPhoto(
    id: string,
    photo: ParsedImage,
  ): Promise<AdminProfessional> {
    return this.setProfessionalFields(id, {
      photo: { ...photo, updatedAt: new Date() },
    });
  }

  removeProfessionalPhoto(id: string): Promise<AdminProfessional> {
    return this.setProfessionalFields(id, { photo: null });
  }

  private async setProfessionalFields(
    id: string,
    fields: Partial<ProfessionalRecord>,
  ): Promise<AdminProfessional> {
    const updated = await this.professionalModel
      .findOneAndUpdate({ id }, { $set: fields }, { new: true })
      .select(WITHOUT_PHOTO_BYTES)
      .lean<ProfessionalRecord | null>()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Professional "${id}" not found`);
    }
    return toAdminProfessional(updated);
  }

  async createService(input: ServiceInput): Promise<AdminService> {
    await this.assertProfessionalsExist(input.professionals);
    const fields = { ...input, icon: DEFAULT_ICON };
    const id = await this.insertWithUniqueId(
      this.serviceModel,
      slugify(input.name, 'service'),
      fields,
    );
    return toAdminService({ id, ...fields });
  }

  async updateService(
    id: string,
    patch: Partial<ServiceInput>,
  ): Promise<AdminService> {
    if (patch.professionals) {
      await this.assertProfessionalsExist(patch.professionals);
    }
    const updated = await this.serviceModel
      .findOneAndUpdate({ id }, { $set: patch }, { new: true })
      .lean<ServiceRecord | null>()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Service "${id}" not found`);
    }
    return toAdminService(updated);
  }

  /** Replaces the weekly schedule; the slot interval stays fixed. */
  async saveSchedule(
    weekly: Record<DayOfWeek, DaySchedule>,
  ): Promise<WeeklySchedule> {
    const slotIntervalMinutes = SCHEDULE.slotIntervalMinutes;
    await this.settingsModel
      .findOneAndUpdate(
        { key: SCHEDULE_KEY },
        { $set: { weekly, slotIntervalMinutes } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return { weekly, slotIntervalMinutes };
  }

  /**
   * Inserts `fields` under the first free id of `base`, `base-2`, `base-3`...
   * The insert is atomic, so two concurrent requests can never share an id.
   */
  private async insertWithUniqueId<T>(
    model: Model<T>,
    base: string,
    fields: Record<string, unknown>,
  ): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      const id = attempt === 1 ? base : `${base}-${attempt}`;
      if (await insertIfAbsent(model, { id }, fields)) {
        return id;
      }
    }
  }

  /** Every id must belong to an existing professional (active or not). */
  private async assertProfessionalsExist(ids: string[]): Promise<void> {
    const found = await this.professionalModel
      .find({ id: { $in: ids } })
      .select('id')
      .lean<ProfessionalRecord[]>()
      .exec();
    const known = new Set(found.map((record) => record.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `professionals not found: ${missing.join(', ')}`,
      );
    }
  }
}
