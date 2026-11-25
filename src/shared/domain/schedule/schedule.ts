/** 0 = Sunday ... 6 = Saturday, matching Date.prototype.getDay(). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DaySchedule =
  | { closed: true }
  /** `open` and `close` are 'HH:mm' wall-clock strings; `close` is exclusive. */
  | {
      closed: false;
      open: string;
      close: string;
      /**
       * Start times offered that day ('HH:mm', on the 30-minute grid, inside
       * [open, close), sorted). Absent = the global start interval applies.
       */
      starts?: string[];
    };

export interface WeeklySchedule {
  weekly: Record<DayOfWeek, DaySchedule>;
  slotIntervalMinutes: number;
  /** Minutes between the start times offered to the public; a multiple of 30. */
  startIntervalMinutes: number;
}
