import { BadRequestException } from '@nestjs/common';

/**
 * Shared validation of uploaded images sent as `data:` URLs (business logo and
 * professional photo). Only PNG, JPEG and WebP up to MAX_IMAGE_BYTES are
 * accepted, the file content decides the type, and SVG is never accepted.
 */

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ParsedImage {
  mimeType: ImageMimeType;
  data: Buffer;
}

export const MAX_IMAGE_BYTES = 200 * 1024;

const startsWith = (data: Buffer, bytes: number[], offset = 0): boolean =>
  data.length >= offset + bytes.length &&
  bytes.every((byte, i) => data[offset + i] === byte);

const ascii = (text: string): number[] => [...Buffer.from(text, 'ascii')];

/** Magic-byte checks: the file content decides the type, not its name. */
const SIGNATURES: Record<ImageMimeType, (data: Buffer) => boolean> = {
  'image/png': (data) =>
    startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (data) => startsWith(data, [0xff, 0xd8, 0xff]),
  'image/webp': (data) =>
    startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8),
};

const DATA_URL =
  /^data:(image\/(?:png|jpeg|webp));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/;

/** Upper bound of the base64 length of a MAX_IMAGE_BYTES file. */
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

/**
 * Parses `data:image/<type>;base64,...`. Throws a BadRequestException with
 * `message` when the value is not a data URL, is too big, or the declared type
 * does not match the file signature.
 */
export function parseImageDataUrl(
  dataUrl: unknown,
  message: string,
): ParsedImage {
  const fail = (): never => {
    throw new BadRequestException(message);
  };
  if (typeof dataUrl !== 'string') {
    return fail();
  }
  const base64Start = dataUrl.indexOf(',') + 1;
  if (base64Start === 0 || dataUrl.length - base64Start > MAX_BASE64_LENGTH) {
    return fail();
  }
  const match = DATA_URL.exec(dataUrl);
  if (!match || match[2] === '') {
    return fail();
  }
  const mimeType = match[1] as ImageMimeType;
  const data = Buffer.from(match[2], 'base64');
  if (data.length > MAX_IMAGE_BYTES || !SIGNATURES[mimeType](data)) {
    return fail();
  }
  return { mimeType, data };
}
