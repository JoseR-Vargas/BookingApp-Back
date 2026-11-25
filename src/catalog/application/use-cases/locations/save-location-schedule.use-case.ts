import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import {
  DayOfWeek,
  DaySchedule,
} from '../../../../shared/domain/schedule/schedule';
import { Location } from '../../../domain/location';
import {
  LastActiveLocation,
  LocationNotFound,
} from '../../../domain/location.errors';
import {
  defaultLocationId,
  scheduleChange,
} from '../../../domain/location.rules';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';
import { LOCATION_WRITER, LocationWriter } from '../../ports/location.writer';
import { EnsurePrincipalLocationUseCase } from './ensure-principal-location.use-case';

export interface SaveLocationScheduleCommand {
  /** The location to change (active or not); absent = the DEFAULT location. */
  locationId?: string;
  /** Already validated (see `validateScheduleInput`). */
  weekly: Record<DayOfWeek, DaySchedule>;
  /** Absent keeps the stored value. */
  startIntervalMinutes?: number;
}

/**
 * Replaces the weekly schedule of one location; the occupancy slot interval
 * stays fixed. Without `locationId` it acts on the default location (the
 * contract of `PUT /admin/schedule`, which predates locations), migrating a
 * store that was never migrated first.
 */
@Injectable()
export class SaveLocationScheduleUseCase {
  constructor(
    @Inject(LOCATION_READER) private readonly reader: LocationReader,
    @Inject(LOCATION_WRITER) private readonly writer: LocationWriter,
    private readonly ensurePrincipal: EnsurePrincipalLocationUseCase,
  ) {}

  async execute(
    command: SaveLocationScheduleCommand,
  ): Promise<Result<Location>> {
    const id = command.locationId ?? (await this.defaultId());
    if (id === null) return err(new LastActiveLocation());
    const saved = await this.writer.saveSchedule(
      id,
      scheduleChange(command.weekly, command.startIntervalMinutes),
    );
    return saved ? ok(saved) : err(new LocationNotFound(id));
  }

  /** A store that was never migrated has no stored location to update. */
  private async defaultId(): Promise<string | null> {
    await this.ensurePrincipal.execute();
    return defaultLocationId(await this.reader.list());
  }
}
