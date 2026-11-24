import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LOCATION_MESSAGES, LocationInput } from './catalog-validation';
import {
  AdminLocation,
  DayOfWeek,
  DaySchedule,
  PublicAvailabilitySettings,
  SCHEDULE,
  WeeklySchedule,
} from './catalog.config';
import { slugify } from './domain/slug.rules';
import { toAdminLocation } from './catalog.service';
import { insertIfAbsent } from './insert-if-absent';
import {
  BusinessSettingsRecord,
  SCHEDULE_KEY,
} from './schemas/business-settings.schema';
import { LocationRecord } from './schemas/location.schema';
import {
  activeLocations,
  ensurePrincipalLocation,
  loadLocations,
  toWeeklySchedule,
} from './locations';
import { ServiceRecord } from './schemas/service.schema';

/**
 * Write side of the catalog for the admin panel: locations, schedules and the
 * public availability settings. Inputs arrive already validated (see
 * catalog-validation.ts).
 *
 * @deprecated TEMPORARY, until spec 12 migrates locations. The professional
 * and service methods are gone: their routes call the use cases under
 * `application/` directly.
 */
@Injectable()
export class CatalogAdminService {
  constructor(
    @InjectModel(ServiceRecord.name)
    private readonly serviceModel: Model<ServiceRecord>,
    @InjectModel(BusinessSettingsRecord.name)
    private readonly settingsModel: Model<BusinessSettingsRecord>,
    @InjectModel(LocationRecord.name)
    private readonly locationModel: Model<LocationRecord>,
  ) {}

  /**
   * Replaces the weekly schedule of the DEFAULT location (the contract of
   * `PUT /admin/schedule`, which predates locations).
   */
  async saveSchedule(
    weekly: Record<DayOfWeek, DaySchedule>,
    startIntervalMinutes?: number,
  ): Promise<WeeklySchedule> {
    // A database that was never migrated has no stored location to update.
    await ensurePrincipalLocation(this.locationModel, this.settingsModel);
    return this.saveLocationSchedule(
      await this.defaultLocationId(),
      weekly,
      startIntervalMinutes,
    );
  }

  /**
   * Replaces the weekly schedule of one location (active or not); the
   * occupancy slot interval stays fixed. An undefined `startIntervalMinutes`
   * keeps the stored value.
   */
  async saveLocationSchedule(
    id: string,
    weekly: Record<DayOfWeek, DaySchedule>,
    startIntervalMinutes?: number,
  ): Promise<WeeklySchedule> {
    const slotIntervalMinutes = SCHEDULE.slotIntervalMinutes;
    const stored = await this.locationModel
      .findOneAndUpdate(
        { id },
        {
          $set: {
            weekly,
            slotIntervalMinutes,
            ...(startIntervalMinutes === undefined
              ? {}
              : { startIntervalMinutes }),
          },
        },
        { new: true },
      )
      .lean<LocationRecord | null>()
      .exec();
    if (!stored) {
      throw new NotFoundException(`Location "${id}" not found`);
    }
    return toWeeklySchedule(stored);
  }

  /** New location: the seed schedule (every 30 minutes), active. */
  async createLocation(input: LocationInput): Promise<AdminLocation> {
    const fields = {
      ...input,
      active: true,
      weekly: SCHEDULE.weekly,
      slotIntervalMinutes: SCHEDULE.slotIntervalMinutes,
      startIntervalMinutes: SCHEDULE.startIntervalMinutes,
      createdAt: new Date(),
    };
    const id = await this.insertWithUniqueId(
      this.locationModel,
      slugify(input.name, 'location'),
      fields,
    );
    return toAdminLocation({ id, ...fields });
  }

  /**
   * Edits name, address and active. The last active location cannot be
   * deactivated (the check and the write are not one transaction: two admins
   * deactivating the last two locations at once could both pass).
   */
  async updateLocation(
    id: string,
    patch: Partial<LocationInput & { active: boolean }>,
  ): Promise<AdminLocation> {
    const all = await loadLocations(this.locationModel, this.settingsModel);
    const current = all.find((location) => location.id === id);
    if (!current) {
      throw new NotFoundException(`Location "${id}" not found`);
    }
    const othersActive = all.some(
      (location) => location.active && location.id !== id,
    );
    if (patch.active === false && current.active && !othersActive) {
      throw new BadRequestException(LOCATION_MESSAGES.lastActive);
    }
    const updated = await this.locationModel
      .findOneAndUpdate({ id }, { $set: patch }, { new: true })
      .lean<LocationRecord | null>()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Location "${id}" not found`);
    }
    return toAdminLocation(updated);
  }

  /** Stores the public availability page settings next to the schedule. */
  async savePublicAvailability(
    settings: PublicAvailabilitySettings,
  ): Promise<PublicAvailabilitySettings> {
    if (settings.serviceIds) {
      const found = await this.serviceModel
        .find({ id: { $in: settings.serviceIds } })
        .lean<ServiceRecord[]>()
        .exec();
      if (found.length !== settings.serviceIds.length) {
        throw new BadRequestException(
          'Alguno de los servicios publicados no existe.',
        );
      }
    }
    await this.settingsModel
      .updateOne(
        { key: SCHEDULE_KEY },
        { $set: { publicAvailability: settings } },
        { upsert: true },
      )
      .exec();
    return settings;
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

  /** Id of the default location: the oldest active one. */
  private async defaultLocationId(): Promise<string> {
    const [defaultLocation] = activeLocations(
      await loadLocations(this.locationModel, this.settingsModel),
    );
    if (!defaultLocation) {
      throw new BadRequestException(LOCATION_MESSAGES.lastActive);
    }
    return defaultLocation.id;
  }
}
