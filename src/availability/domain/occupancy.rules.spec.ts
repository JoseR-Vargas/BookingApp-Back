import { freeStartTimes, occupiedSlots, windowSlots } from './occupancy.rules';

const day = ['09:00', '09:30', '10:00', '10:30'];

describe('occupancy rules (moved from the calculator)', () => {
  it('occupiedSlots unions the slots of every booking', () => {
    expect(
      occupiedSlots([{ slots: ['09:00'] }, { slots: ['09:00', '10:00'] }]),
    ).toEqual(new Set(['09:00', '10:00']));
  });

  it('freeStartTimes needs `required` contiguous free slots', () => {
    expect(freeStartTimes(day, new Set(['09:30']), 2, 30)).toEqual(['10:00']);
    expect(freeStartTimes(day, new Set(), 4, 30)).toEqual(['09:00']);
  });

  it('windowSlots answers the occupied window, or null when it does not fit', () => {
    expect(windowSlots(day, '09:30', 2, 30)).toEqual(['09:30', '10:00']);
    expect(windowSlots(day, '10:30', 2, 30)).toBeNull();
  });
});
