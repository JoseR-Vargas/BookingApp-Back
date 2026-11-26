import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  PLAN_GATE,
  PlanGate,
} from '../../../../shared/application/plan-gate.port';
import { CLOCK, Clock } from '../../../../shared/application/clock.port';
import { Result, ok } from '../../../../shared/domain/result';
import { Location, LocationInput } from '../../../domain/location';
import { newLocation } from '../../../domain/location.rules';
import { slugCandidates, slugify } from '../../../domain/slug.rules';
import { LOCATION_WRITER, LocationWriter } from '../../ports/location.writer';

export interface CreateLocationCommand {
  /** Already validated (see `validateLocationCreate`). */
  input: LocationInput;
}

/**
 * Creates an active location under a slug of its name, with the seed
 * schedule. A business whose plan is at its limit of locations gets a 403
 * (spec 23).
 */
@Injectable()
export class CreateLocationUseCase {
  constructor(
    @Inject(LOCATION_WRITER) private readonly writer: LocationWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    // A business without a subscription is not governed by a plan (spec 23).
    @Optional() @Inject(PLAN_GATE) private readonly plans?: PlanGate,
  ) {}

  async execute(command: CreateLocationCommand): Promise<Result<Location>> {
    const plan = await this.plans?.check('location');
    if (plan && !plan.ok) return plan;
    return ok(
      await this.writer.insert(
        this.candidates(slugify(command.input.name, 'location')),
        newLocation(command.input, this.clock.now()),
      ),
    );
  }

  private async *candidates(base: string): AsyncGenerator<string> {
    for (const id of slugCandidates(base)) yield await Promise.resolve(id);
  }
}
