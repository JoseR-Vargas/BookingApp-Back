import { BadRequestException } from '@nestjs/common';
import { BrandColors, LogoMimeType } from './schemas/branding.schema';

/**
 * Manual payload validation for the admin branding endpoints (the project does
 * not use class-validator). Parsers return normalised values or throw a
 * BadRequestException with a Spanish, user-facing message.
 */

type ColorField = keyof BrandColors;

const COLOR_LABELS: Record<ColorField, string> = {
  accent: 'Acento',
  background: 'Fondo',
  text: 'Texto',
  accentSecondary: 'Acento secundario',
};

const byField = (build: (label: string) => string) =>
  Object.fromEntries(
    Object.entries(COLOR_LABELS).map(([field, label]) => [field, build(label)]),
  ) as Record<ColorField, string>;

export const BRANDING_MESSAGES = {
  invalidBody: 'Los datos de la marca no son válidos.',
  requiredColor: byField((label) => `El color "${label}" es obligatorio.`),
  invalidColor: byField(
    (label) => `El color "${label}" debe tener el formato #rrggbb.`,
  ),
  textContrast:
    'El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).',
  accentContrast:
    'El acento no contrasta lo suficiente con el fondo (mínimo 3:1).',
  accentSecondaryContrast:
    'El acento secundario no contrasta lo suficiente con el fondo (mínimo 3:1).',
  invalidBusinessName: 'El nombre del negocio debe ser texto.',
  businessNameTooLong: 'El nombre del negocio puede tener hasta 60 caracteres.',
  invalidLogo: 'El logo debe ser PNG, JPG o WebP de hasta 200 KB.',
} as const;

export const MAX_BUSINESS_NAME_LENGTH = 60;
export const MAX_LOGO_BYTES = 200 * 1024;
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_ACCENT_CONTRAST = 3;

const COLOR = /^#[0-9a-fA-F]{6}$/;

export interface BrandingInput {
  businessName: string | null;
  colors: BrandColors;
}

export interface LogoInput {
  mimeType: LogoMimeType;
  data: Buffer;
}

const fail = (message: string): never => {
  throw new BadRequestException(message);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** sRGB channel (0-255) to its linear value, as defined by WCAG 2.1. */
const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * linear((n >> 16) & 0xff) +
    0.7152 * linear((n >> 8) & 0xff) +
    0.0722 * linear(n & 0xff)
  );
};

/** WCAG 2.1 contrast ratio between two '#rrggbb' colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const color = (value: unknown, field: ColorField): string => {
  if (value === undefined || value === null) {
    return fail(BRANDING_MESSAGES.requiredColor[field]);
  }
  if (typeof value !== 'string' || !COLOR.test(value)) {
    return fail(BRANDING_MESSAGES.invalidColor[field]);
  }
  return value.toLowerCase();
};

const parseColors = (value: unknown): BrandColors => {
  const raw = isObject(value) ? value : {};
  const colors: BrandColors = {
    accent: color(raw.accent, 'accent'),
    background: color(raw.background, 'background'),
    text: color(raw.text, 'text'),
    accentSecondary:
      raw.accentSecondary === undefined || raw.accentSecondary === null
        ? null
        : color(raw.accentSecondary, 'accentSecondary'),
  };

  if (contrastRatio(colors.text, colors.background) < MIN_TEXT_CONTRAST) {
    fail(BRANDING_MESSAGES.textContrast);
  }
  if (contrastRatio(colors.accent, colors.background) < MIN_ACCENT_CONTRAST) {
    fail(BRANDING_MESSAGES.accentContrast);
  }
  if (
    colors.accentSecondary !== null &&
    contrastRatio(colors.accentSecondary, colors.background) <
      MIN_ACCENT_CONTRAST
  ) {
    fail(BRANDING_MESSAGES.accentSecondaryContrast);
  }
  return colors;
};

const parseBusinessName = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return fail(BRANDING_MESSAGES.invalidBusinessName);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_BUSINESS_NAME_LENGTH) {
    return fail(BRANDING_MESSAGES.businessNameTooLong);
  }
  return trimmed === '' ? null : trimmed;
};

/** Body of `PUT /admin/branding`: `{ businessName, colors }`. */
export function parseBrandingInput(body: unknown): BrandingInput {
  if (!isObject(body)) {
    return fail(BRANDING_MESSAGES.invalidBody);
  }
  return {
    businessName: parseBusinessName(body.businessName),
    colors: parseColors(body.colors),
  };
}

const startsWith = (data: Buffer, bytes: number[], offset = 0): boolean =>
  data.length >= offset + bytes.length &&
  bytes.every((byte, i) => data[offset + i] === byte);

const ascii = (text: string): number[] => [...Buffer.from(text, 'ascii')];

/** Magic-byte checks: the file content decides the type, not its name. */
const SIGNATURES: Record<LogoMimeType, (data: Buffer) => boolean> = {
  'image/png': (data) =>
    startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (data) => startsWith(data, [0xff, 0xd8, 0xff]),
  'image/webp': (data) =>
    startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8),
};

const DATA_URL =
  /^data:(image\/(?:png|jpeg|webp));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/;

/** Upper bound of the base64 length of a MAX_LOGO_BYTES file. */
const MAX_BASE64_LENGTH = Math.ceil(MAX_LOGO_BYTES / 3) * 4;

/**
 * Body of `PUT /admin/branding/logo`: `{ dataUrl: 'data:image/png;base64,...' }`.
 * Only PNG, JPEG and WebP up to MAX_LOGO_BYTES are accepted, and the declared
 * type must match the file signature.
 */
export function parseLogoDataUrl(body: unknown): LogoInput {
  const dataUrl = isObject(body) ? body.dataUrl : undefined;
  if (typeof dataUrl !== 'string') {
    return fail(BRANDING_MESSAGES.invalidLogo);
  }
  const base64Start = dataUrl.indexOf(',') + 1;
  if (base64Start === 0 || dataUrl.length - base64Start > MAX_BASE64_LENGTH) {
    return fail(BRANDING_MESSAGES.invalidLogo);
  }
  const match = DATA_URL.exec(dataUrl);
  if (!match || match[2] === '') {
    return fail(BRANDING_MESSAGES.invalidLogo);
  }
  const mimeType = match[1] as LogoMimeType;
  const data = Buffer.from(match[2], 'base64');
  if (data.length > MAX_LOGO_BYTES || !SIGNATURES[mimeType](data)) {
    return fail(BRANDING_MESSAGES.invalidLogo);
  }
  return { mimeType, data };
}
