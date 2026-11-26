import { describeSubscriptionRepositoryContract } from '../../../application/ports/subscription-repository.contract';
import { describePaymentEventLogContract } from '../../../application/ports/payment-event-log.contract';
import { inTenant } from '../../../../shared/infrastructure/tenancy/tenant-partition.testing';
import { InMemoryPaymentEventLog } from './in-memory-payment-event.log';
import { InMemorySubscriptionRepository } from './in-memory-subscription.repository';

describeSubscriptionRepositoryContract('in-memory', () => {
  const repo = new InMemorySubscriptionRepository();
  return Promise.resolve({
    reader: repo,
    writer: repo,
    inOtherBusiness: (fn) => inTenant('other-business', fn),
  });
});

describePaymentEventLogContract('in-memory', () =>
  Promise.resolve(new InMemoryPaymentEventLog()),
);
