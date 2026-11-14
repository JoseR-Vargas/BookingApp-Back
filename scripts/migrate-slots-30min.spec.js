const { computeSlots, parseArgs, sameSlots } = require('./migrate-slots-30min');

describe('migrate-slots-30min', () => {
  describe('computeSlots', () => {
    it.each([
      ['09:00', 20, ['09:00']],
      ['09:00', 30, ['09:00']],
      ['09:00', 50, ['09:00', '09:30']],
      ['09:00', 60, ['09:00', '09:30']],
      ['09:00', 90, ['09:00', '09:30', '10:00']],
      ['09:30', 60, ['09:30', '10:00']],
      ['10:00', 150, ['10:00', '10:30', '11:00', '11:30', '12:00']],
      ['9:00', 20, ['09:00']],
    ])('%s for %p min -> %j', (time, duration, expected) => {
      expect(computeSlots(time, duration)).toEqual(expected);
    });

    it('rounds up so a 31-minute booking takes two blocks', () => {
      expect(computeSlots('09:00', 31)).toEqual(['09:00', '09:30']);
    });

    it.each(['09:15', '10:45', '25:00', '09:60', 'abc', '', undefined, null])(
      'returns null for an invalid or off-grid time %p',
      (time) => {
        expect(computeSlots(time, 60)).toBeNull();
      },
    );

    it.each([0, -30, NaN, Infinity, '60', undefined, null])(
      'returns null for an invalid duration %p',
      (duration) => {
        expect(computeSlots('09:00', duration)).toBeNull();
      },
    );

    it('returns null when the window would cross midnight', () => {
      expect(computeSlots('23:30', 60)).toBeNull();
    });

    it('never covers more time than the old hourly window', () => {
      // Old hourly rule: ceil(duration / 60) one-hour slots from `time`.
      for (const duration of [20, 30, 50, 60, 90, 120, 150, 180]) {
        const oldMinutes = Math.ceil(duration / 60) * 60;
        const newMinutes = computeSlots('09:00', duration).length * 30;
        expect(newMinutes).toBeLessThanOrEqual(oldMinutes);
      }
    });
  });

  describe('sameSlots', () => {
    it('compares order and content', () => {
      expect(sameSlots(['09:00'], ['09:00'])).toBe(true);
      expect(sameSlots(['09:00'], ['09:00', '09:30'])).toBe(false);
      expect(sameSlots(undefined, ['09:00'])).toBe(false);
    });
  });

  describe('parseArgs', () => {
    it('defaults to dry run', () => {
      expect(parseArgs([])).toEqual({ apply: false });
      expect(parseArgs(['--dry-run'])).toEqual({ apply: false });
    });

    it('applies only with an explicit --apply', () => {
      expect(parseArgs(['--apply'])).toEqual({ apply: true });
    });

    it('rejects contradictory and unknown flags', () => {
      expect(() => parseArgs(['--apply', '--dry-run'])).toThrow('not both');
      expect(() => parseArgs(['--force'])).toThrow('Unknown argument');
    });
  });
});
