import { describeProfessionalRepositoryContract } from '../../../application/ports/professional-repository.contract';
import { InMemoryProfessionalRepository } from './in-memory-professional.repository';

describeProfessionalRepositoryContract('in-memory', () => {
  const repo = new InMemoryProfessionalRepository();
  return Promise.resolve({
    reader: repo,
    writer: repo,
    photos: repo,
    seed: (document) => {
      repo.seed(document);
      return Promise.resolve();
    },
    count: () => Promise.resolve(repo.count),
  });
});
