import { Inject, Injectable } from '@nestjs/common';
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

/** Creates an active location under a slug of its name, with the seed schedule. */
@Injectable()
export class CreateLocationUseCase {
  constructor(
    @Inject(LOCATION_WRITER) private readonly writer: LocationWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateLocationCommand): Promise<Result<Location>> {
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
