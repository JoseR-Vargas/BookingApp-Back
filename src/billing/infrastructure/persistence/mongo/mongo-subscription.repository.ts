import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SubscriptionReader,
  SubscriptionWriter,
} from '../../../application/ports/subscription.repository';
import { Subscription } from '../../../domain/subscription';
import { SubscriptionRecord } from './subscription.entity';

/** Reads and writes `subscriptions` (scoped by business: the plugin adds `tenantId`). */
@Injectable()
export class MongoSubscriptionRepository
  implements SubscriptionReader, SubscriptionWriter
{
  constructor(
    @InjectModel(SubscriptionRecord.name)
    private readonly model: Model<SubscriptionRecord>,
  ) {}

  async find(): Promise<Subscription | null> {
    const record = await this.model
      .findOne({})
      .lean<SubscriptionRecord>()
      .exec();
    return record ? toSubscription(record) : null;
  }

  async save(subscription: Subscription): Promise<void> {
    const { createdAt, ...fields } = subscription;
    await this.model
      .updateOne(
        {},
        { $set: fields, $setOnInsert: { createdAt } },
        { upsert: true },
      )
      .exec();
  }
}

const toSubscription = (record: SubscriptionRecord): Subscription => ({
  planId: record.planId,
  status: record.status,
  currentPeriodEnd: record.currentPeriodEnd,
  cancelAtPeriodEnd: record.cancelAtPeriodEnd,
  externalPaymentId: record.externalPaymentId ?? null,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
