import { StoredSettings } from '../../../application/ports/business-settings.contract';
import { LegacyScheduleReader } from '../../../application/ports/legacy-schedule.reader';
import { PublicAvailabilityReader } from '../../../application/ports/public-availability.reader';
import { PublicAvailabilityWriter } from '../../../application/ports/public-availability.writer';
import { PublicAvailabilitySettings } from '../../../domain/public-availability';
import { DEFAULT_PUBLIC_AVAILABILITY } from '../../../domain/public-availability';
import { toWeeklySchedule } from '../../../domain/location.rules';
import { SEED_SCHEDULE } from '../../../domain/seed-schedule';
import { WeeklySchedule } from '../../../../shared/domain/schedule/schedule';

/**
 * Keeps the singleton settings document in memory. One class answers the
 * three ports that share it, like the MongoDB adapters share the collection.
 */
export class InMemoryBusinessSettings
  implements
    PublicAvailabilityReader,
    PublicAvailabilityWriter,
    LegacyScheduleReader
{
  private doc: StoredSettings | null = null;

  /** Puts the document in the store as given, bypassing the ports. */
  seed(settings: StoredSettings): void {
    this.doc = structuredClone(settings);
  }

  stored(): StoredSettings | null {
    return this.doc ? structuredClone(this.doc) : null;
  }

  read(): Promise<PublicAvailabilitySettings> {
    return Promise.resolve(
      structuredClone(
        this.doc?.publicAvailability ?? DEFAULT_PUBLIC_AVAILABILITY,
      ),
    );
  }

  save(settings: PublicAvailabilitySettings): Promise<void> {
    this.doc = { ...this.doc, publicAvailability: structuredClone(settings) };
    return Promise.resolve();
  }

  readSchedule(): Promise<WeeklySchedule> {
    const doc = this.doc;
    return Promise.resolve(
      doc?.weekly
        ? structuredClone(
            toWeeklySchedule({
              weekly: doc.weekly,
              slotIntervalMinutes:
                doc.slotIntervalMinutes ?? SEED_SCHEDULE.slotIntervalMinutes,
              startIntervalMinutes: doc.startIntervalMinutes,
            }),
          )
        : structuredClone(SEED_SCHEDULE),
    );
  }
}
