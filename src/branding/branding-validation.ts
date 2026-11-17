import { BadRequestException } from '@nestjs/common';
import { MAX_IMAGE_BYTES, parseImageDataUrl } from '../common/image-data-url';
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
  button: 'Botones',
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
  buttonContrast:
    'El color de los botones no contrasta lo suficiente con el fondo (mínimo 2:1).',
  invalidBusinessName: 'El nombre del negocio debe ser texto.',
  businessNameTooLong: 'El nombre del negocio puede tener hasta 60 caracteres.',
  invalidLogo: 'El logo debe ser PNG, JPG o WebP de hasta 200 KB.',
} as const;

export const MAX_BUSINESS_NAME_LENGTH = 60;
export const MAX_LOGO_BYTES = MAX_IMAGE_BYTES;
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_ACCENT_CONTRAST = 3;
/**
 * A button is a filled shape with its own label, whose color the front picks
 * (white or black) for readability, so against the page it only has to stand out.
 */
export const MIN_BUTTON_CONTRAST = 2;

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
    button:
      raw.button === undefined || raw.button === null
        ? null
        : color(raw.button, 'button'),
  };

  if (contrastRatio(colors.text, colors.background) < MIN_TEXT_CONTRAST) {
    fail(BRANDING_MESSAGES.textContrast);
  }
  if (contrastRatio(colors.accent, colors.background) < MIN_ACCENT_CONTRAST) {
    fail(BRANDING_MESSAGES.accentContrast);
  }
  if (
    colors.button !== null &&
    contrastRatio(colors.button, colors.background) < MIN_BUTTON_CONTRAST
  ) {
    fail(BRANDING_MESSAGES.buttonContrast);
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

/**
 * Body of `PUT /admin/branding/logo`: `{ dataUrl: 'data:image/png;base64,...' }`.
 * Only PNG, JPEG and WebP up to MAX_LOGO_BYTES are accepted, and the declared
 * type must match the file signature.
 */
export function parseLogoDataUrl(body: unknown): LogoInput {
  return parseImageDataUrl(
    isObject(body) ? body.dataUrl : undefined,
    BRANDING_MESSAGES.invalidLogo,
  );
}
