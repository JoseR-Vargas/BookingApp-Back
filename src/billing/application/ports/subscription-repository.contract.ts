import { Subscription } from '../../domain/subscription';
import {
  SubscriptionReader,
  SubscriptionWriter,
} from './subscription.repository';

export interface SubscriptionRepositoryFixture {
  reader: SubscriptionReader;
  writer: SubscriptionWriter;
  /** Runs `fn` as another business (a different tenant context). */
  inOtherBusiness<T>(fn: () => Promise<T>): Promise<T>;
}

const CREATED = new Date('2026-10-25T10:00:00.000Z');

const subscription = (over: Partial<Subscription> = {}): Subscription => ({
  planId: 'pro',
  status: 'active',
  currentPeriodEnd: new Date('2026-12-25T10:00:00.000Z'),
  cancelAtPeriodEnd: false,
  externalPaymentId: 'pay_1',
  createdAt: CREATED,
  updatedAt: CREATED,
  ...over,
});

/** Behavior every SubscriptionReader + SubscriptionWriter adapter must honor. */
export function describeSubscriptionRepositoryContract(
  name: string,
  factory: () => Promise<SubscriptionRepositoryFixture>,
): void {
  describe(`SubscriptionReader + SubscriptionWriter contract: ${name}`, () => {
    let repo: SubscriptionRepositoryFixture;

    beforeEach(async () => {
      repo = await factory();
    });

    it('answers null while the business has no subscription', async () => {
      await expect(repo.reader.find()).resolves.toBeNull();
    });

    it('stores a subscription and reads it back as given', async () => {
      await repo.writer.save(subscription());
      await expect(repo.reader.find()).resolves.toEqual(subscription());
    });

    it('keeps null as the external payment id', async () => {
      await repo.writer.save(subscription({ externalPaymentId: null }));
      await expect(repo.reader.find()).resolves.toMatchObject({
        externalPaymentId: null,
      });
    });

    it('replaces the subscription of the business (still one) and keeps its createdAt', async () => {
      await repo.writer.save(subscription());
      const later = new Date('2026-11-25T10:00:00.000Z');
      await repo.writer.save(
        subscription({
          planId: 'negocio',
          status: 'past_due',
          cancelAtPeriodEnd: true,
          updatedAt: later,
          createdAt: later,
        }),
      );
      await expect(repo.reader.find()).resolves.toEqual(
        subscription({
          planId: 'negocio',
          status: 'past_due',
          cancelAtPeriodEnd: true,
          updatedAt: later,
          createdAt: CREATED,
        }),
      );
    });

    it('does not show the subscription of another business, and keeps one each', async () => {
      await repo.writer.save(subscription());
      await expect(
        repo.inOtherBusiness(() => repo.reader.find()),
      ).resolves.toBeNull();
      await repo.inOtherBusiness(() =>
        repo.writer.save(subscription({ planId: 'gratis' })),
      );
      await expect(repo.reader.find()).resolves.toMatchObject({
        planId: 'pro',
      });
      await expect(
        repo.inOtherBusiness(() => repo.reader.find()),
      ).resolves.toMatchObject({ planId: 'gratis' });
    });
  });
}
