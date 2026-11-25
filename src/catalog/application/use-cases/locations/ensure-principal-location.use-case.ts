import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../../shared/application/clock.port';
import { Result, ok } from '../../../../shared/domain/result';
import { principalLocation } from '../../../domain/location.rules';
import {
  LEGACY_SCHEDULE_READER,
  LegacyScheduleReader,
} from '../../ports/legacy-schedule.reader';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';
import { LOCATION_WRITER, LocationWriter } from '../../ports/location.writer';

/**
 * Startup migration. When the store holds no location, stores "principal" with
 * a COPY of the legacy schedule (the settings document is never modified). The
 * insert is atomic on the id, so concurrent instances create it once; a store
 * that already holds a location is never touched. Answers whether THIS call
 * created it.
 */
@Injectable()
export class EnsurePrincipalLocationUseCase {
  constructor(
    @Inject(LOCATION_READER) private readonly reader: LocationReader,
    @Inject(LOCATION_WRITER) private readonly writer: LocationWriter,
    @Inject(LEGACY_SCHEDULE_READER)
    private readonly legacy: LegacyScheduleReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<boolean>> {
    if (await this.reader.hasAny()) return ok(false);
    const principal = principalLocation(
      await this.legacy.readSchedule(),
      this.clock.now(),
    );
    return ok(await this.writer.insertIfAbsent(principal));
  }
}
