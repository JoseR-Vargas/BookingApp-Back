import { describeOccupiedSlotsReaderContract } from '../../../application/ports/occupied-slots.reader.contract';
import { InMemoryOccupiedSlotsReader } from './in-memory-occupied-slots.reader';

describeOccupiedSlotsReaderContract('in-memory', () => {
  const reader = new InMemoryOccupiedSlotsReader();
  return Promise.resolve({
    reader,
    seed: (booking) => {
      reader.seed(booking);
      return Promise.resolve();
    },
  });
});
