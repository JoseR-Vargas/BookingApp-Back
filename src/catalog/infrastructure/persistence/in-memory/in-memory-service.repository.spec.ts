import { describeServiceRepositoryContract } from '../../../application/ports/service-repository.contract';
import { InMemoryServiceRepository } from './in-memory-service.repository';

describeServiceRepositoryContract('in-memory', () => {
  const repo = new InMemoryServiceRepository();
  return Promise.resolve({
    reader: repo,
    writer: repo,
    seed: (service) => {
      repo.seed(service);
      return Promise.resolve();
    },
    count: () => Promise.resolve(repo.count),
  });
});
