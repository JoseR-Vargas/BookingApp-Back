import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from '../bookings/schemas/booking.schema';
import { ParsedImage } from '../common/image-data-url';
import {
  LOCATION_MESSAGES,
  LocationInput,
  PROFESSIONAL_LOCATION_MESSAGES,
  ProfessionalInput,
  ServiceInput,
  slugify,
} from './catalog-validation';
import {
  AdminLocation,
  DayOfWeek,
  DaySchedule,
  PublicAvailabilitySettings,
  SCHEDULE,
  WeeklySchedule,
} from './catalog.config';
import {
  AdminProfessional,
  AdminService,
  toAdminLocation,
  toAdminProfessional,
  WITHOUT_PHOTO_BYTES,
  toAdminService,
} from './catalog.service';
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
    /** Read-only here: bookings are never written by the catalog. */
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(LocationRecord.name)
    private readonly locationModel: Model<LocationRecord>,
  ) {}

  /** The photo, already validated, is stored in the same insert. */
  async createProfessional(
    input: ProfessionalInput,
    photo: ParsedImage | null = null,
  ): Promise<AdminProfessional> {
    const { locations, ...rest } = input;
    const defaultLocationId = await this.defaultLocationId();
    const locationIds = locations
      ? await this.assertActiveLocations(locations)
      : [defaultLocationId];
    const fields = {
      ...rest,
      locationIds,
      rating: DEFAULT_RATING,
      avatar: DEFAULT_AVATAR,
      photo: photo ? { ...photo, updatedAt: new Date() } : null,
    };
    const id = await this.insertWithUniqueId(
      this.professionalModel,
      slugify(input.name, 'professional'),
      fields,
      (candidate) => this.isReferencedByBookings(candidate),
    );
    return toAdminProfessional({ id, ...fields }, defaultLocationId);
  }

  async updateProfessional(
    id: string,
    patch: Partial<ProfessionalInput>,
  ): Promise<AdminProfessional> {
    const { locations, ...rest } = patch;
    return this.setProfessionalFields(id, {
      ...rest,
      ...(locations
        ? { locationIds: await this.assertActiveLocations(locations) }
        : {}),
    });
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
    return toAdminProfessional(updated, await this.defaultLocationId());
  }

  /**
   * Permanently deletes a professional (and its photo). Refuses while it has
   * confirmed bookings from `today` on or is the only professional of any
   * service. Services that keep other professionals just lose this id; every
   * booking is left untouched.
   *
   * The checks and the delete are not one transaction: a booking confirmed
   * between them is not detected and would reference a deleted professional.
   */
  async deleteProfessionalPermanently(
    id: string,
    today: string,
  ): Promise<{ id: string; deleted: true }> {
    const professional = await this.professionalModel
      .findOne({ id })
      .select('id name')
      .lean<ProfessionalRecord | null>()
      .exec();
    if (!professional) {
      throw new NotFoundException(`Professional "${id}" not found`);
    }
    const name = professional.name;

    const upcoming = await this.bookingModel
      .countDocuments({
        'professional.id': id,
        status: 'confirmed',
        date: { $gte: today },
      })
      .exec();
    if (upcoming > 0) {
      const plural = upcoming === 1 ? '' : 's';
      throw new ConflictException(
        `No se puede eliminar a ${name}: tiene ${upcoming} reserva${plural} futura${plural} confirmada${plural}. Cancélalas o desactiva al profesional.`,
      );
    }

    const offering = await this.serviceModel
      .find({ professionals: id })
      .sort({ _id: 1 })
      .lean<ServiceRecord[]>()
      .exec();
    const sole = offering.find((service) => service.professionals.length === 1);
    if (sole) {
      throw new ConflictException(
        `No se puede eliminar a ${name}: el servicio "${sole.name}" solo lo ofrece este profesional. Asígnale otro profesional o desactiva el servicio.`,
      );
    }

    await this.professionalModel.deleteOne({ id }).exec();
    await this.serviceModel
      .updateMany({ professionals: id }, { $pull: { professionals: id } })
      .exec();
    return { id, deleted: true };
  }

  /** Whether any booking, of any status or date, points at this professional. */
  private async isReferencedByBookings(id: string): Promise<boolean> {
    const found = await this.bookingModel
      .exists({ 'professional.id': id })
      .exec();
    return found !== null;
  }

  async createService(input: ServiceInput): Promise<AdminService> {
    await this.assertProfessionalsExist(input.professionals);
    const fields = { ...input, icon: DEFAULT_ICON };
    const id = await this.insertWithUniqueId(
      this.serviceModel,
      slugify(input.name, 'service'),
      fields,
      (candidate) => this.isServiceReferencedByBookings(candidate),
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

  /**
   * Permanently deletes a service. Refuses while it has confirmed bookings
   * from `today` on (a booking with several services counts once). Bookings
   * are never written: they keep their own snapshot of the service.
   *
   * The check and the delete are not one transaction: a booking confirmed
   * between them is not detected and would reference a deleted service.
   */
  async deleteServicePermanently(
    id: string,
    today: string,
  ): Promise<{ id: string; deleted: true }> {
    const service = await this.serviceModel
      .findOne({ id })
      .select('id name')
      .lean<ServiceRecord | null>()
      .exec();
    if (!service) {
      throw new NotFoundException(`Service "${id}" not found`);
    }

    const upcoming = await this.bookingModel
      .countDocuments({
        'services.id': id,
        status: 'confirmed',
        date: { $gte: today },
      })
      .exec();
    if (upcoming > 0) {
      const plural = upcoming === 1 ? '' : 's';
      throw new ConflictException(
        `No se puede eliminar el servicio "${service.name}": tiene ${upcoming} reserva${plural} futura${plural} confirmada${plural}. Cancélalas o desactiva el servicio.`,
      );
    }

    await this.serviceModel.deleteOne({ id }).exec();
    return { id, deleted: true };
  }

  /** Whether any booking, of any status or date, includes this service. */
  private async isServiceReferencedByBookings(id: string): Promise<boolean> {
    const found = await this.bookingModel.exists({ 'services.id': id }).exec();
    return found !== null;
  }

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
   * Ids for which `isTaken` answers true are skipped too (used so a deleted
   * professional's or service's id is not handed to someone new while bookings cite it).
   */
  private async insertWithUniqueId<T>(
    model: Model<T>,
    base: string,
    fields: Record<string, unknown>,
    isTaken: (id: string) => Promise<boolean> = () => Promise.resolve(false),
  ): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      const id = attempt === 1 ? base : `${base}-${attempt}`;
      if (await isTaken(id)) {
        continue;
      }
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

  /** Every id must belong to an existing, active location. */
  private async assertActiveLocations(ids: string[]): Promise<string[]> {
    const active = new Set(
      activeLocations(
        await loadLocations(this.locationModel, this.settingsModel),
      ).map((location) => location.id),
    );
    if (!ids.every((id) => active.has(id))) {
      throw new BadRequestException(PROFESSIONAL_LOCATION_MESSAGES.invalid);
    }
    return ids;
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
