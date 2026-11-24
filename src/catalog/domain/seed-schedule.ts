import {
  DaySchedule,
  WeeklySchedule,
} from '../../shared/domain/schedule/schedule';

const WEEKDAY: DaySchedule = { closed: false, open: '09:00', close: '20:00' };

/**
 * The schedule a new installation and a new location start with: Monday to
 * Friday 09:00-20:00, Saturday 09:00-18:00, a start every 30 minutes.
 */
export const SEED_SCHEDULE: WeeklySchedule = {
  weekly: {
    0: { closed: true },
    1: WEEKDAY,
    2: WEEKDAY,
    3: WEEKDAY,
    4: WEEKDAY,
    5: WEEKDAY,
    6: { closed: false, open: '09:00', close: '18:00' },
  },
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
};
