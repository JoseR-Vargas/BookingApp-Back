import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { NoActiveLocationError } from '../../../domain/catalog.errors';
import { Location } from '../../../domain/location';
import { defaultLocation } from '../../../domain/location.rules';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';

/** The default location: the oldest active one. Err(NoActiveLocationError) when none is active. */
@Injectable()
export class ResolveDefaultLocationUseCase {
  constructor(
    @Inject(LOCATION_READER) private readonly locations: LocationReader,
  ) {}

  async execute(): Promise<Result<Location>> {
    const found = defaultLocation(await this.locations.list());
    return found ? ok(found) : err(new NoActiveLocationError());
  }
}
