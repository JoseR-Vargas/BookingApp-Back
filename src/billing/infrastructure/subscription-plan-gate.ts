import { Injectable } from '@nestjs/common';
import {
  PlanGate,
  PlanResource,
  PlanVerdict,
} from '../../shared/application/plan-gate.port';
import { DomainError } from '../../shared/domain/domain-error';
import { Result } from '../../shared/domain/result';
import { CheckPlanLimitUseCase } from '../application/use-cases/check-plan-limit.use-case';

/** The `PlanGate` that catalog and bookings ask: it delegates to the billing use case. */
@Injectable()
export class SubscriptionPlanGate implements PlanGate {
  constructor(private readonly limit: CheckPlanLimitUseCase) {}

  check(resource: PlanResource): Promise<Result<PlanVerdict, DomainError>> {
    return this.limit.execute(resource);
  }
}
