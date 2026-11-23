import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { Branding } from '../../domain/branding';
import { validateLogo } from '../../domain/branding.rules';
import { BRANDING_WRITER, BrandingWriter } from '../ports/branding.writer';
import { CLOCK, Clock } from '../ports/clock.port';

export interface SaveLogoCommand {
  mimeType: string;
  data: Buffer;
}

/** Validates the image and saves it as the logo, stamped with the current time. */
@Injectable()
export class SaveLogoUseCase {
  constructor(
    @Inject(BRANDING_WRITER) private readonly writer: BrandingWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Answers Err(InvalidLogoError) when the image is not accepted; nothing is saved then. */
  async execute(command: SaveLogoCommand): Promise<Result<Branding>> {
    const logo = validateLogo(command.mimeType, command.data);
    if (!logo.ok) return logo;
    return ok(
      await this.writer.saveLogo({
        ...logo.value,
        updatedAt: this.clock.now(),
      }),
    );
  }
}
