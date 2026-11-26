import { Injectable } from '@nestjs/common';
import { GetTrialStatusUseCase } from '../../../tenancy/application/use-cases/get-trial-status.use-case';
import { TrialGate } from '../../application/ports/trial-gate.port';

/**
 * Asks the tenancy for the trial of the business in force. A business without
 * a trial is never blocked. If the business cannot be resolved the gate stays
 * open: the request would have failed earlier, and a booking is never lost to
 * a lookup failure.
 */
@Injectable()
export class TenancyTrialGate implements TrialGate {
  constructor(private readonly trial: GetTrialStatusUseCase) {}

  async allowsNewBookings(): Promise<boolean> {
    const status = await this.trial.execute();
    return !(status.ok && status.value?.blocked === true);
  }
}
