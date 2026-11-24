import { SaveLogoCommand } from '../../application/use-cases/save-logo.use-case';
import { BrandingDraft } from '../../domain/branding.rules';
import {
  BRANDING_MESSAGES,
  InvalidBrandingError,
  InvalidLogoError,
} from '../../domain/branding.errors';
import { MAX_LOGO_BYTES } from '../../domain/branding.rules';

/**
 * Input DTOs of the admin branding endpoints (the project does not use
 * class-validator). They check the SHAPE of the body and the size of the
 * upload, then hand untrusted values to the use cases, which apply the
 * business rules. Failures are domain errors with Spanish, user-facing messages.
 */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Upper bound of the base64 length of a MAX_LOGO_BYTES file. */
const MAX_BASE64_LENGTH = Math.ceil(MAX_LOGO_BYTES / 3) * 4;

const DATA_URL =
  /^data:([^;,]+);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/;

/** Body of `PUT /admin/branding`: `{ businessName, colors }`. */
export function parseBrandingInput(body: unknown): BrandingDraft {
  if (!isObject(body)) {
    throw new InvalidBrandingError(BRANDING_MESSAGES.invalidBody);
  }
  return {
    businessName: body.businessName,
    colors: isObject(body.colors) ? body.colors : {},
  };
}

/**
 * Body of `PUT /admin/branding/logo`: `{ dataUrl: 'data:image/png;base64,...' }`.
 * Decodes the data URL (an oversized payload is refused before decoding);
 * whether the type and bytes are an acceptable logo is a domain rule.
 */
export function parseLogoInput(body: unknown): SaveLogoCommand {
  const dataUrl = isObject(body) ? body.dataUrl : undefined;
  if (typeof dataUrl !== 'string') {
    throw new InvalidLogoError();
  }
  const base64Start = dataUrl.indexOf(',') + 1;
  if (base64Start === 0 || dataUrl.length - base64Start > MAX_BASE64_LENGTH) {
    throw new InvalidLogoError();
  }
  const match = DATA_URL.exec(dataUrl);
  if (!match || match[2] === '') {
    throw new InvalidLogoError();
  }
  return { mimeType: match[1], data: Buffer.from(match[2], 'base64') };
}
