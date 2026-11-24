import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { Branding, defaultBranding } from '../../domain/branding';
import { BRANDING_READER, BrandingReader } from '../ports/branding.reader';

/** The branding to show: the saved one, or the defaults while nothing is saved. */
@Injectable()
export class GetBrandingUseCase {
  constructor(
    @Inject(BRANDING_READER) private readonly reader: BrandingReader,
  ) {}

  async execute(): Promise<Result<Branding>> {
    return ok((await this.reader.find()) ?? defaultBranding());
  }
}
