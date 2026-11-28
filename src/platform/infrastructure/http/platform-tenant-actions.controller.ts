// The actions of the owner of the system on a business (spec 25): suspend it,
// reactivate it, extend its trial or change its plan by hand. Every action
// leaves a trace in the log of the system.

import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { respond } from '../../../shared/infrastructure/http/respond';
import { ChangePlanUseCase } from '../../application/use-cases/change-plan.use-case';
import { DeleteBusinessUseCase } from '../../application/use-cases/delete-business.use-case';
import { ExtendTrialUseCase } from '../../application/use-cases/extend-trial.use-case';
import { ReactivateBusinessUseCase } from '../../application/use-cases/reactivate-business.use-case';
import { SuspendBusinessUseCase } from '../../application/use-cases/suspend-business.use-case';
import { PlatformKeyGuard } from './platform-key.guard';
import { PlatformBusinessJson, toBusinessJson } from './platform.presenter';

@Controller('platform/tenants')
@UseGuards(PlatformKeyGuard)
export class PlatformTenantActionsController {
  constructor(
    private readonly suspend: SuspendBusinessUseCase,
    private readonly reactivate: ReactivateBusinessUseCase,
    private readonly extendTrial: ExtendTrialUseCase,
    private readonly changePlan: ChangePlanUseCase,
    private readonly deleteBusiness: DeleteBusinessUseCase,
  ) {}

  /** Suspends the business: its own routes answer 403 and nothing is deleted. */
  @Post(':id/suspend')
  @HttpCode(200)
  async suspendBusiness(
    @Param('id') id: string,
  ): Promise<{ business: PlatformBusinessJson }> {
    return {
      business: toBusinessJson(respond(await this.suspend.execute(id))),
    };
  }

  /** Reactivates the business: it answers requests again. */
  @Post(':id/reactivate')
  @HttpCode(200)
  async reactivateBusiness(
    @Param('id') id: string,
  ): Promise<{ business: PlatformBusinessJson }> {
    return {
      business: toBusinessJson(respond(await this.reactivate.execute(id))),
    };
  }

  /** Extends the trial of the business with the days of the body. */
  @Post(':id/trial')
  @HttpCode(200)
  async extendTrialOfBusiness(
    @Param('id') id: string,
    @Body() body: { days?: unknown } | undefined,
  ): Promise<{ business: PlatformBusinessJson }> {
    return {
      business: toBusinessJson(
        respond(await this.extendTrial.execute(id, body?.days)),
      ),
    };
  }

  /** Changes the plan of the business by hand: no gateway, no charge. */
  @Post(':id/plan')
  @HttpCode(200)
  async changePlanOfBusiness(
    @Param('id') id: string,
    @Body() body: { planId?: unknown } | undefined,
  ): Promise<{ business: PlatformBusinessJson }> {
    return {
      business: toBusinessJson(
        respond(await this.changePlan.execute(id, body?.planId)),
      ),
    };
  }

  /**
   * Deletes the business and everything of it: its bookings, the data of its
   * clients, its catalog, its users and its subscription. The body must carry
   * the slug of the business, so a slip of the mouse does not erase a year of
   * bookings.
   */
  @Delete(':id')
  @HttpCode(200)
  async deleteBusinessOfBusiness(
    @Param('id') id: string,
    @Body() body: { confirm?: unknown } | undefined,
  ): Promise<{ deleted: { id: string; slug: string; name: string } }> {
    return {
      deleted: respond(await this.deleteBusiness.execute(id, body?.confirm)),
    };
  }
}
