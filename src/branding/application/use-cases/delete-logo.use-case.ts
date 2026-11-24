import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { Branding } from '../../domain/branding';
import { BRANDING_WRITER, BrandingWriter } from '../ports/branding.writer';

/** Removes the logo and keeps name and colors. */
@Injectable()
export class DeleteLogoUseCase {
  constructor(
    @Inject(BRANDING_WRITER) private readonly writer: BrandingWriter,
  ) {}

  async execute(): Promise<Result<Branding>> {
    return ok(await this.writer.deleteLogo());
  }
}
