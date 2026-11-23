import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { Branding } from '../../domain/branding';
import { BrandingDraft, validateBranding } from '../../domain/branding.rules';
import { BRANDING_WRITER, BrandingWriter } from '../ports/branding.writer';

/** Validates and saves name and colors; an existing logo is kept. */
@Injectable()
export class SaveBrandingUseCase {
  constructor(
    @Inject(BRANDING_WRITER) private readonly writer: BrandingWriter,
  ) {}

  /** Answers Err(InvalidBrandingError) when the draft breaks a rule; nothing is saved then. */
  async execute(draft: BrandingDraft): Promise<Result<Branding>> {
    const content = validateBranding(draft);
    if (!content.ok) return content;
    return ok(await this.writer.saveBranding(content.value));
  }
}
