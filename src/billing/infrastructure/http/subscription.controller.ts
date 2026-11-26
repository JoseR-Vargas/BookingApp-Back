import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { Roles } from '../../../auth/infrastructure/http/roles.decorator';
import { respond } from '../../../shared/infrastructure/http/respond';
import { CancelSubscriptionUseCase } from '../../application/use-cases/cancel-subscription.use-case';
import { GetSubscriptionStatusUseCase } from '../../application/use-cases/get-subscription-status.use-case';
import { ResumeSubscriptionUseCase } from '../../application/use-cases/resume-subscription.use-case';
import { StartCheckoutUseCase } from '../../application/use-cases/start-checkout.use-case';
import {
  PublicPlan,
  PublicPlanCatalogEntry,
  publicPlanCatalog,
  toPublicPlan,
} from './subscription.presenter';

/** The plans and the plan of the business (null: no subscription). */
export interface SubscriptionState {
  plans: PublicPlanCatalogEntry[];
  subscription: PublicPlan | null;
}

/**
 * The plan of the business (spec 23). Owner only, like every other route of
 * the plan: reading it, contracting, canceling and resuming.
 */
@Controller('admin/subscription')
@UseGuards(AdminKeyGuard)
@Roles('owner')
export class SubscriptionController {
  constructor(
    private readonly status: GetSubscriptionStatusUseCase,
    private readonly checkout: StartCheckoutUseCase,
    private readonly cancelSubscription: CancelSubscriptionUseCase,
    private readonly resumeSubscription: ResumeSubscriptionUseCase,
  ) {}

  @Get()
  get(): Promise<SubscriptionState> {
    return this.state();
  }

  @Post('checkout')
  @HttpCode(200)
  async startCheckout(
    @Body() body: { planId?: unknown } | undefined,
  ): Promise<{ checkoutUrl: string }> {
    const { checkoutUrl } = respond(
      await this.checkout.execute({ planId: body?.planId }),
    );
    return { checkoutUrl };
  }

  @Post('cancel')
  @HttpCode(200)
  async cancel(): Promise<SubscriptionState> {
    respond(await this.cancelSubscription.execute());
    return this.state();
  }

  @Post('resume')
  @HttpCode(200)
  async resume(): Promise<SubscriptionState> {
    respond(await this.resumeSubscription.execute());
    return this.state();
  }

  private async state(): Promise<SubscriptionState> {
    const plan = respond(await this.status.execute());
    return {
      plans: publicPlanCatalog(),
      subscription: plan ? toPublicPlan(plan) : null,
    };
  }
}
