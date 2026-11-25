import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { PublicAvailabilitySettings } from '../../../domain/public-availability';
import { ensurePublishedServicesExist } from '../../../domain/public-availability.rules';
import {
  PUBLIC_AVAILABILITY_WRITER,
  PublicAvailabilityWriter,
} from '../../ports/public-availability.writer';
import { SERVICE_READER, ServiceReader } from '../../ports/service.reader';

export interface SavePublicAvailabilityCommand {
  /** Already validated (see `validatePublicAvailability`). */
  settings: PublicAvailabilitySettings;
}

/**
 * Stores the settings of the public availability page. Every published
 * service must exist (active or not); nothing is saved otherwise.
 */
@Injectable()
export class SavePublicAvailabilityUseCase {
  constructor(
    @Inject(SERVICE_READER) private readonly services: ServiceReader,
    @Inject(PUBLIC_AVAILABILITY_WRITER)
    private readonly writer: PublicAvailabilityWriter,
  ) {}

  async execute(
    command: SavePublicAvailabilityCommand,
  ): Promise<Result<PublicAvailabilitySettings>> {
    const { settings } = command;
    // `null` publishes every service: nothing to look up.
    const existing =
      settings.serviceIds === null
        ? []
        : (await this.services.list('all')).map((service) => service.id);
    const checked = ensurePublishedServicesExist(settings, existing);
    if (!checked.ok) return checked;
    await this.writer.save(settings);
    return ok(settings);
  }
}
