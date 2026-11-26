import {
  SubscriptionReader,
  SubscriptionWriter,
} from '../../../application/ports/subscription.repository';
import { Subscription } from '../../../domain/subscription';
import { TenantRows } from '../../../../shared/infrastructure/tenancy/tenant-partition';

const copy = (subscription: Subscription): Subscription => ({
  ...subscription,
  currentPeriodEnd: new Date(subscription.currentPeriodEnd),
  createdAt: new Date(subscription.createdAt),
  updatedAt: new Date(subscription.updatedAt),
});

/** Keeps one subscription per business in memory. */
export class InMemorySubscriptionRepository
  implements SubscriptionReader, SubscriptionWriter
{
  private readonly rows = new TenantRows<Subscription>();

  find(): Promise<Subscription | null> {
    const found = this.rows.all()[0];
    return Promise.resolve(found ? copy(found) : null);
  }

  save(subscription: Subscription): Promise<void> {
    const existing = this.rows.all()[0];
    this.rows.remove(() => true);
    this.rows.add(
      copy({
        ...subscription,
        createdAt: existing?.createdAt ?? subscription.createdAt,
      }),
    );
    return Promise.resolve();
  }
}
