import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { BrandLogo } from '../../domain/branding';
import { LogoNotFoundError } from '../../domain/branding.errors';
import { BRANDING_READER, BrandingReader } from '../ports/branding.reader';

/** The saved logo, or an Err(LogoNotFoundError) when there is none. */
@Injectable()
export class GetLogoUseCase {
  constructor(
    @Inject(BRANDING_READER) private readonly reader: BrandingReader,
  ) {}

  async execute(): Promise<Result<BrandLogo>> {
    const logo = (await this.reader.find())?.logo;
    return logo ? ok(logo) : err(new LogoNotFoundError());
  }
}
