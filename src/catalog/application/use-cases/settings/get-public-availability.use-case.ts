import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { PublicAvailabilitySettings } from '../../../domain/public-availability';
import {
  PUBLIC_AVAILABILITY_READER,
  PublicAvailabilityReader,
} from '../../ports/public-availability.reader';

/** The settings of the public availability page; the default (off) when none is stored. */
@Injectable()
export class GetPublicAvailabilityUseCase {
  constructor(
    @Inject(PUBLIC_AVAILABILITY_READER)
    private readonly settings: PublicAvailabilityReader,
  ) {}

  async execute(): Promise<Result<PublicAvailabilitySettings>> {
    return ok(await this.settings.read());
  }
}
