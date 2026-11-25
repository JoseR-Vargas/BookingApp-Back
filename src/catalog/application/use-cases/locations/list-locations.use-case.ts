import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { Location } from '../../../domain/location';
import { activeLocations } from '../../../domain/location.rules';
import { ListScope } from '../../ports/list-scope';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';

/**
 * The locations: every one in creation order (`all`, the admin panel), or the
 * active ones oldest first (`active`, the public catalog; the first is the
 * default). A store that was never migrated lists the virtual "principal".
 */
@Injectable()
export class ListLocationsUseCase {
  constructor(
    @Inject(LOCATION_READER) private readonly locations: LocationReader,
  ) {}

  async execute(scope: ListScope): Promise<Result<Location[]>> {
    const all = await this.locations.list();
    return ok(scope === 'all' ? all : activeLocations(all));
  }
}
