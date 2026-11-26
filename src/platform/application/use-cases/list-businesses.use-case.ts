// The list of the businesses of the installation, as the owner of the system
// sees it (spec 25). Only signals and aggregates: never the data of a client.

import { Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { PlatformBusiness } from '../../domain/platform-business';
import { PlatformBusinessReader } from '../platform-business-reader';

@Injectable()
export class ListBusinessesUseCase {
  constructor(private readonly reader: PlatformBusinessReader) {}

  async execute(): Promise<Result<PlatformBusiness[]>> {
    return ok(await this.reader.list());
  }
}
