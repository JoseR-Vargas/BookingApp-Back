import { describeBrandingRepositoryContract } from '../../../application/ports/branding-repository.contract';
import { completeColors } from '../../../domain/branding.rules';
import { InMemoryBrandingRepository } from './in-memory-branding.repository';

describeBrandingRepositoryContract('in-memory', () => {
  const repo = new InMemoryBrandingRepository();
  return Promise.resolve({
    reader: repo,
    writer: repo,
    seedLegacyDocument: (doc) => {
      repo.seed({
        businessName: doc.businessName,
        colors: completeColors(doc.colors),
        logo: null,
      });
      return Promise.resolve();
    },
    countDocuments: () => Promise.resolve(repo.docs.length),
  });
});
