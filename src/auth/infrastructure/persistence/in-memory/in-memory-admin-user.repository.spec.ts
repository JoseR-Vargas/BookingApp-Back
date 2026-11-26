import { describeAdminUserRepositoryContract } from '../../../application/ports/admin-user-repository.contract';
import { inTenant } from '../../../../shared/infrastructure/tenancy/tenant-partition.testing';
import { InMemoryAdminUserRepository } from './in-memory-admin-user.repository';

describeAdminUserRepositoryContract('in-memory', () => {
  const repo = new InMemoryAdminUserRepository();
  return Promise.resolve({
    reader: repo,
    writer: repo,
    inOtherBusiness: (fn) => inTenant('other-business', fn),
  });
});
