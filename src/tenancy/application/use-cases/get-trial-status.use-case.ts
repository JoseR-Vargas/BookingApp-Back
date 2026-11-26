// ===== CASO DE USO: ESTADO DE LA PRUEBA =====
// The trial of the business in force: days left, bookings made and whether it
// is blocked. A business without a trial answers null (spec 21).

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import {
  TENANT_CONTEXT,
  TenantContext,
} from '../../../shared/application/tenant-context.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { hasTrial, TrialStatus, trialStatusOf } from '../../domain/trial.rules';
import {
  TENANT_BOOKING_COUNTER,
  TenantBookingCounter,
} from '../ports/tenant-booking-counter.port';
import { TenantService } from '../tenant.service';

@Injectable()
export class GetTrialStatusUseCase {
  constructor(
    private readonly tenants: TenantService,
    @Inject(TENANT_CONTEXT) private readonly context: TenantContext,
    @Inject(TENANT_BOOKING_COUNTER)
    private readonly counter: TenantBookingCounter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<TrialStatus | null>> {
    const current = this.context.current();
    const resolved = await this.tenants.resolve(current.slug);
    if (!resolved.ok) return err(resolved.error);
    const tenant = resolved.value;
    if (!hasTrial(tenant)) return ok(null);
    const made = await this.counter.count(tenant.id);
    return ok(trialStatusOf(tenant, made, this.clock.now()));
  }
}
