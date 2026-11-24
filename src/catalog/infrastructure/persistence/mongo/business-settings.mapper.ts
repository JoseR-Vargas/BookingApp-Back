import { WeeklySchedule } from '../../../../shared/domain/schedule/schedule';
import { toWeeklySchedule } from '../../../domain/location.rules';
import { SEED_SCHEDULE } from '../../../domain/seed-schedule';
import { BusinessSettingsRecord } from './business-settings.entity';

/**
 * The schedule of the legacy single-location installation: the settings
 * document's, or the seed when it holds none. A start interval stored without
 * reads as 30.
 */
export const toLegacySchedule = (
  record: BusinessSettingsRecord | null,
): WeeklySchedule =>
  record?.weekly ? toWeeklySchedule(record) : SEED_SCHEDULE;
