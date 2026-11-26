import { Controller, Get, Optional, Req, UseGuards } from '@nestjs/common';
import { GetSubscriptionStatusUseCase } from '../billing/application/use-cases/get-subscription-status.use-case';
import {
  PublicPlan,
  toPublicPlan,
} from '../billing/infrastructure/http/subscription.presenter';
import { respond } from '../shared/infrastructure/http/respond';
import { GetStorageStatusUseCase } from '../tenancy/application/use-cases/get-storage-status.use-case';
import { GetTrialStatusUseCase } from '../tenancy/application/use-cases/get-trial-status.use-case';
import { AdminKeyGuard } from './admin-key.guard';
import { AdminRequest } from './infrastructure/http/admin-actor';
import {
  PublicAdminUser,
  toPublicAdminUser,
} from './infrastructure/http/admin-user.presenter';
import {
  PublicStorage,
  toPublicStorage,
} from './infrastructure/http/storage.presenter';
import {
  PublicTrial,
  toPublicTrial,
} from './infrastructure/http/trial.presenter';

/** The answer of the session of an account. */
export interface SessionState {
  ok: true;
  user: PublicAdminUser;
  trial: PublicTrial | null;
  storage?: PublicStorage | null;
  /** The plan of the business; null while it has no subscription (spec 23). */
  plan?: PublicPlan | null;
}

/**
 * Status of the admin session. With the shared key it answers `{ ok: true }`
 * (what the panel has always checked); with a session cookie it also answers
 * the account, without any secret, and the state of the free trial of the
 * business (`null` when it has none, spec 21) and of its storage quota
 * (`null` when it has no cap, spec 22) and its plan (`null` when it has no
 * subscription, spec 23).
 */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminSessionController {
  constructor(
    @Optional() private readonly trial?: GetTrialStatusUseCase,
    @Optional() private readonly storage?: GetStorageStatusUseCase,
    @Optional() private readonly plans?: GetSubscriptionStatusUseCase,
  ) {}

  @Get('session')
  getSession(
    @Req() request?: AdminRequest,
  ): { ok: true } | Promise<SessionState> {
    const actor = request?.adminActor;
    if (actor?.kind !== 'session') return { ok: true };
    return this.sessionState(actor.user);
  }

  private async sessionState(
    user: Parameters<typeof toPublicAdminUser>[0],
  ): Promise<SessionState> {
    const status = this.trial ? respond(await this.trial.execute()) : null;
    const storage = this.storage
      ? respond(await this.storage.execute())
      : undefined;
    const plan = this.plans ? respond(await this.plans.execute()) : undefined;
    return {
      ok: true,
      user: toPublicAdminUser(user),
      trial: status ? toPublicTrial(status) : null,
      // Absent only where the use case is not wired (isolated specs).
      ...(this.storage
        ? { storage: storage ? toPublicStorage(storage) : null }
        : {}),
      // Absent only where the use case is not wired (isolated specs).
      ...(this.plans ? { plan: plan ? toPublicPlan(plan) : null } : {}),
    };
  }
}
