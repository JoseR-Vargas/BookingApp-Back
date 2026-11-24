import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { Location, LocationPatch } from '../../../domain/location';
import { LocationNotFound } from '../../../domain/location.errors';
import { ensureCanChange } from '../../../domain/location.rules';
import { LOCATION_READER, LocationReader } from '../../ports/location.reader';
import { LOCATION_WRITER, LocationWriter } from '../../ports/location.writer';

export interface UpdateLocationCommand {
  id: string;
  /** Already validated (see `validateLocationUpdate`). */
  patch: LocationPatch;
}

/**
 * Edits name, address and active. The last active location cannot be
 * deactivated (Err(LastActiveLocation)); the check and the write are not one
 * transaction, as before.
 */
@Injectable()
export class UpdateLocationUseCase {
  constructor(
    @Inject(LOCATION_READER) private readonly reader: LocationReader,
    @Inject(LOCATION_WRITER) private readonly writer: LocationWriter,
  ) {}

  async execute(command: UpdateLocationCommand): Promise<Result<Location>> {
    const all = await this.reader.list();
    const current = all.find((location) => location.id === command.id);
    if (!current) return err(new LocationNotFound(command.id));
    const allowed = ensureCanChange(all, current, command.patch);
    if (!allowed.ok) return allowed;
    const updated = await this.writer.update(command.id, allowed.value);
    return updated ? ok(updated) : err(new LocationNotFound(command.id));
  }
}
