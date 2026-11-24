import { ParsedImage, parseImageDataUrl } from '../../../common/image-data-url';
import { respond } from '../../../shared/infrastructure/http/respond';
import { CreateProfessionalCommand } from '../../application/use-cases/professionals/create-professional.use-case';
import { PhotoUpload } from '../../domain/professional';
import {
  ProfessionalInput,
  validateProfessionalCreate,
  validateProfessionalUpdate,
} from '../../domain/professional.rules';

/**
 * Input DTOs of the professional endpoints (the project does not use
 * class-validator). They hand the body to the domain rules (field by field,
 * the messages are the API's) and decode the uploaded image; the use cases
 * only ever see validated values. A broken rule leaves as a domain error.
 */

export const PHOTO_MESSAGES = {
  invalidPhoto: 'La foto debe ser PNG, JPG o WebP de hasta 200 KB.',
} as const;

const fieldOf = (body: unknown, field: string): unknown =>
  body !== null && typeof body === 'object'
    ? (body as Record<string, unknown>)[field]
    : undefined;

const toUpload = ({ mimeType, data }: ParsedImage): PhotoUpload => ({
  mimeType,
  data,
});

/** Body of `PUT /admin/professionals/:id/photo`: `{ dataUrl }`. */
export const parseProfessionalPhotoInput = (body: unknown): PhotoUpload =>
  toUpload(
    parseImageDataUrl(fieldOf(body, 'dataUrl'), PHOTO_MESSAGES.invalidPhoto),
  );

/**
 * Optional `photoDataUrl` of `POST /admin/professionals`: `null` when absent,
 * a 400 when present but invalid.
 */
function parseOptionalPhoto(body: unknown): PhotoUpload | null {
  const value = fieldOf(body, 'photoDataUrl');
  return value === undefined || value === null
    ? null
    : toUpload(parseImageDataUrl(value, PHOTO_MESSAGES.invalidPhoto));
}

/** Body of `POST /admin/professionals`: the fields first, then the photo. */
export function parseCreateProfessionalInput(
  body: unknown,
): CreateProfessionalCommand {
  const input = respond(validateProfessionalCreate(body));
  return { input, photo: parseOptionalPhoto(body) };
}

/** Body of `PATCH /admin/professionals/:id`; `photo` and `photoDataUrl` are ignored. */
export const parseUpdateProfessionalInput = (
  body: unknown,
): Partial<ProfessionalInput> => respond(validateProfessionalUpdate(body));
