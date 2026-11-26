// ===== ADAPTADOR: DIRECTORIO DE SUSCRIPCIONES =====
// The subscription of every business of the installation, for the owner of
// the system (spec 25). The collection is scoped by business, so the read
// runs inside the explicit `unscoped` escape.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import {
  SubscriptionDirectory,
  SubscriptionOfBusiness,
} from '../../../application/ports/subscription-directory.port';
import { SubscriptionRecord } from './subscription.entity';
import { toSubscription } from './mongo-subscription.repository';

@Injectable()
export class MongoSubscriptionDirectory implements SubscriptionDirectory {
  constructor(
    @InjectModel(SubscriptionRecord.name)
    private readonly model: Model<SubscriptionRecord>,
  ) {}

  async list(): Promise<SubscriptionOfBusiness[]> {
    const records = await unscoped(
      'the directory of the subscriptions of the installation',
      () => this.model.find().lean<SubscriptionRecord[]>().exec(),
    );
    return records
      .filter((record) => Boolean(record.tenantId))
      .map((record) => ({
        tenantId: String(record.tenantId),
        subscription: toSubscription(record),
      }));
  }
}
