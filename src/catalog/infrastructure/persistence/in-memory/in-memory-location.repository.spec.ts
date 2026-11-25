import { describeLocationRepositoryContract } from '../../../application/ports/location-repository.contract';
import { InMemoryBusinessSettings } from './in-memory-business-settings';
import { InMemoryLocationRepository } from './in-memory-location.repository';

describeLocationRepositoryContract('in-memory', () => {
  const settings = new InMemoryBusinessSettings();
  const repo = new InMemoryLocationRepository(settings);
  return Promise.resolve({
    reader: repo,
    writer: repo,
    seed: (location) => {
      repo.seed(location);
      return Promise.resolve();
    },
    seedLegacySchedule: (schedule) => {
      settings.seed(schedule);
      return Promise.resolve();
    },
    count: () => Promise.resolve(repo.count),
  });
});
