/**
 * The occupancy rules live in `domain/occupancy.rules.ts` (spec 13) and the
 * schedule rules in `shared/domain/schedule` (spec 12). They are re-exported so
 * the modules that are not migrated yet (`bookings`, `admin`, the WhatsApp bot)
 * keep importing them from here.
 *
 * @deprecated TEMPORARY re-export, deleted when `bookings` (spec 14), `admin`
 * (spec 17) and the bot (spec 26) import the rules from their new home.
 */
export {
  buildDaySlots,
  dayOfWeekFromIsoDate,
  offeredStarts,
  slotsRequired,
  toMinutes,
} from '../shared/domain/schedule/schedule.rules';
export {
  freeStartTimes,
  occupiedSlots,
  windowSlots,
} from './domain/occupancy.rules';
export type { OccupyingBooking } from './domain/occupancy.rules';
