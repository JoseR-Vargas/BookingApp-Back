import { Injectable } from '@nestjs/common';
import {
  AdminLocation,
  PublicAvailabilitySettings,
  WeeklySchedule,
} from './catalog.config';
import { CreateLocationUseCase } from './application/use-cases/locations/create-location.use-case';
import { SaveLocationScheduleUseCase } from './application/use-cases/locations/save-location-schedule.use-case';
import { UpdateLocationUseCase } from './application/use-cases/locations/update-location.use-case';
import { SavePublicAvailabilityUseCase } from './application/use-cases/settings/save-public-availability.use-case';
import { LocationInput, LocationPatch } from './domain/location';
import { scheduleOf } from './domain/location.rules';
import { DayOfWeek, DaySchedule } from '../shared/domain/schedule/schedule';
import { orThrowHttp } from './facade-errors';
import { toAdminLocation } from './infrastructure/http/catalog.presenter';

/**
 * Write side of the catalog for the callers that still expect exceptions:
 * locations, schedules and the public availability settings. Inputs arrive
 * already validated (see `domain/schedule-input.rules.ts` and friends).
 *
 * @deprecated TEMPORARY FACADE (spec 12). It holds no business rule: it wraps
 * the use cases of `application/`, which the admin controllers call directly,
 * and raises the Nest exceptions (400, 404) the callers always got. It is
 * deleted when its last caller migrates.
 */
@Injectable()
export class CatalogAdminService {
  constructor(
    private readonly saveLocationScheduleUseCase: SaveLocationScheduleUseCase,
    private readonly createLocationUseCase: CreateLocationUseCase,
    private readonly updateLocationUseCase: UpdateLocationUseCase,
    private readonly savePublicAvailabilityUseCase: SavePublicAvailabilityUseCase,
  ) {}

  /**
   * Replaces the weekly schedule of the DEFAULT location (the contract of
   * `PUT /admin/schedule`, which predates locations).
   */
  async saveSchedule(
    weekly: Record<DayOfWeek, DaySchedule>,
    startIntervalMinutes?: number,
  ): Promise<WeeklySchedule> {
    return scheduleOf(
      orThrowHttp(
        await this.saveLocationScheduleUseCase.execute({
          weekly,
          startIntervalMinutes,
        }),
      ),
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
    return scheduleOf(
      orThrowHttp(
        await this.saveLocationScheduleUseCase.execute({
          locationId: id,
          weekly,
          startIntervalMinutes,
        }),
      ),
    );
  }

  /** New location: the seed schedule (every 30 minutes), active. */
  async createLocation(input: LocationInput): Promise<AdminLocation> {
    return toAdminLocation(
      orThrowHttp(await this.createLocationUseCase.execute({ input })),
    );
  }

  /** Edits name, address and active; the last active location cannot be deactivated. */
  async updateLocation(
    id: string,
    patch: LocationPatch,
  ): Promise<AdminLocation> {
    return toAdminLocation(
      orThrowHttp(await this.updateLocationUseCase.execute({ id, patch })),
    );
  }

  /** Stores the public availability page settings next to the schedule. */
  async savePublicAvailability(
    settings: PublicAvailabilitySettings,
  ): Promise<PublicAvailabilitySettings> {
    return orThrowHttp(
      await this.savePublicAvailabilityUseCase.execute({ settings }),
    );
  }
}
