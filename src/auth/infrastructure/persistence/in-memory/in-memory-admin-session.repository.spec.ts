import { describeAdminSessionRepositoryContract } from '../../../application/ports/admin-session-repository.contract';
import { inTenant } from '../../../../shared/infrastructure/tenancy/tenant-partition.testing';
import { InMemoryAdminSessionRepository } from './in-memory-admin-session.repository';

describeAdminSessionRepositoryContract('in-memory', () => {
  const repo = new InMemoryAdminSessionRepository();
  return Promise.resolve({
    reader: repo,
    writer: repo,
    inOtherBusiness: (fn) => inTenant('other-business', fn),
  });
});
