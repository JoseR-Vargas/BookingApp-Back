// ===== ADAPTADOR: ADMINISTRACIÓN DE SUSCRIPCIONES =====
// A manual change of the plan, made by the owner of the system without the
// payment gateway (spec 25): it never charges anybody and it never asks the
// gateway. The collection is scoped by business, so the read and the write
// run inside the explicit `unscoped` escape.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import {
  ManualPlanChange,
  SubscriptionAdministrator,
} from '../../../application/ports/subscription-administrator.port';
import { PlanId } from '../../../domain/plans';
import { SubscriptionRecord } from './subscription.entity';

/** How long a manual subscription covers when there was none. */
export const MANUAL_SUBSCRIPTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MongoSubscriptionAdministrator
  implements SubscriptionAdministrator
{
  constructor(
    @InjectModel(SubscriptionRecord.name)
    private readonly model: Model<SubscriptionRecord>,
  ) {}

  /**
   * The plan of the business changes and its subscription becomes active
   * again: the owner says, by hand, that this business pays that plan. The
   * period is kept when there was one; without a subscription the manual
   * change covers 30 days.
   */
  async changePlan(
    tenantId: string,
    planId: PlanId,
    now: Date,
  ): Promise<ManualPlanChange> {
    const tenant = new Types.ObjectId(tenantId);
    const existing = await unscoped(
      'the manual change of the plan of a business',
      () =>
        this.model
          .findOne({ tenantId: tenant })
          .lean<SubscriptionRecord | null>()
          .exec(),
    );
    const previousPlanId = existing ? existing.planId : null;
    const currentPeriodEnd =
      existing?.currentPeriodEnd ??
      new Date(now.getTime() + MANUAL_SUBSCRIPTION_DAYS * DAY_MS);
    await unscoped('the manual change of the plan of a business', () =>
      this.model
        .updateOne(
          { tenantId: tenant },
          {
            $set: {
              planId,
              status: 'active',
              currentPeriodEnd,
              cancelAtPeriodEnd: false,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true },
        )
        .exec(),
    );
    return { previousPlanId, planId };
  }
}
