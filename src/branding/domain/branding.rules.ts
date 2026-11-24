import {
  BrandColors,
  BrandingContent,
  DEFAULT_COLORS,
  LogoMimeType,
} from './branding';
import {
  BRANDING_MESSAGES,
  ColorField,
  InvalidBrandingError,
  InvalidLogoError,
} from './branding.errors';
import { Err, Result, err, ok } from '../../shared/domain/result';

/** Pure branding rules: no framework, no I/O, no clock. */

export const MAX_BUSINESS_NAME_LENGTH = 60;
export const MAX_LOGO_BYTES = 200 * 1024;
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_ACCENT_CONTRAST = 3;
/**
 * A button is a filled shape with its own label, whose color the front picks
 * (white or black) for readability, so against the page it only has to stand out.
 */
export const MIN_BUTTON_CONTRAST = 2;

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Untrusted colors as they arrive: any value may be missing or of any type. */
export type ColorsDraft = Partial<Record<ColorField, unknown>>;

/** Untrusted name and colors, to be checked by `validateBranding`. */
export interface BrandingDraft {
  businessName?: unknown;
  colors: ColorsDraft;
}

const fail = (message: string): Err<InvalidBrandingError> =>
  err(new InvalidBrandingError(message));

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

const color = (
  value: unknown,
  field: ColorField,
): Result<string, InvalidBrandingError> => {
  if (value === undefined || value === null) {
    return fail(BRANDING_MESSAGES.requiredColor[field]);
  }
  if (typeof value !== 'string' || !COLOR.test(value)) {
    return fail(BRANDING_MESSAGES.invalidColor[field]);
  }
  return ok(value.toLowerCase());
};

const optionalColor = (
  value: unknown,
  field: ColorField,
): Result<string | null, InvalidBrandingError> =>
  value === undefined || value === null ? ok(null) : color(value, field);

/** Checks accent, background, text, button in that order, then the contrasts. */
function validateColors(
  raw: ColorsDraft,
): Result<BrandColors, InvalidBrandingError> {
  const accent = color(raw.accent, 'accent');
  if (!accent.ok) return accent;
  const background = color(raw.background, 'background');
  if (!background.ok) return background;
  const text = color(raw.text, 'text');
  if (!text.ok) return text;
  const button = optionalColor(raw.button, 'button');
  if (!button.ok) return button;

  const colors: BrandColors = {
    accent: accent.value,
    background: background.value,
    text: text.value,
    button: button.value,
  };

  if (contrastRatio(colors.text, colors.background) < MIN_TEXT_CONTRAST) {
    return fail(BRANDING_MESSAGES.textContrast);
  }
  if (contrastRatio(colors.accent, colors.background) < MIN_ACCENT_CONTRAST) {
    return fail(BRANDING_MESSAGES.accentContrast);
  }
  if (
    colors.button !== null &&
    contrastRatio(colors.button, colors.background) < MIN_BUTTON_CONTRAST
  ) {
    return fail(BRANDING_MESSAGES.buttonContrast);
  }
  return ok(colors);
}

function validateBusinessName(
  value: unknown,
): Result<string | null, InvalidBrandingError> {
  if (value === undefined || value === null) {
    return ok(null);
  }
  if (typeof value !== 'string') {
    return fail(BRANDING_MESSAGES.invalidBusinessName);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_BUSINESS_NAME_LENGTH) {
    return fail(BRANDING_MESSAGES.businessNameTooLong);
  }
  return ok(trimmed === '' ? null : trimmed);
}

/**
 * Normalises name and colors (trimmed name, lowercase `#rrggbb`) or answers an
 * Err(InvalidBrandingError). The name is checked first, then each color, then contrast.
 */
export function validateBranding(
  draft: BrandingDraft,
): Result<BrandingContent, InvalidBrandingError> {
  const businessName = validateBusinessName(draft.businessName);
  if (!businessName.ok) return businessName;
  const colors = validateColors(draft.colors);
  if (!colors.ok) return colors;
  return ok({ businessName: businessName.value, colors: colors.value });
}

const LOGO_SIGNATURES: Record<LogoMimeType, (data: Buffer) => boolean> = {
  'image/png': (data) =>
    startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (data) => startsWith(data, [0xff, 0xd8, 0xff]),
  'image/webp': (data) =>
    startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8),
};

function startsWith(data: Buffer, bytes: number[], offset = 0): boolean {
  return (
    data.length >= offset + bytes.length &&
    bytes.every((byte, i) => data[offset + i] === byte)
  );
}

function ascii(text: string): number[] {
  return [...Buffer.from(text, 'ascii')];
}

const isLogoMimeType = (value: string): value is LogoMimeType =>
  Object.keys(LOGO_SIGNATURES).includes(value);

/**
 * Only PNG, JPEG and WebP up to MAX_LOGO_BYTES; the file content decides the
 * type (magic bytes), and SVG is never accepted.
 */
export function validateLogo(
  mimeType: string,
  data: Buffer,
): Result<{ mimeType: LogoMimeType; data: Buffer }, InvalidLogoError> {
  if (
    !isLogoMimeType(mimeType) ||
    data.length === 0 ||
    data.length > MAX_LOGO_BYTES ||
    !LOGO_SIGNATURES[mimeType](data)
  ) {
    return err(new InvalidLogoError());
  }
  return ok({ mimeType, data });
}

/**
 * Fills the colors of a stored branding. Nothing stored: the defaults. A
 * branding saved before the button color existed has no `button`: its buttons
 * used the accent, so they keep following it (`button: null`).
 */
export function completeColors(
  stored: Partial<BrandColors> | undefined,
): BrandColors {
  if (!stored) return { ...DEFAULT_COLORS };
  return {
    accent: stored.accent ?? DEFAULT_COLORS.accent,
    background: stored.background ?? DEFAULT_COLORS.background,
    text: stored.text ?? DEFAULT_COLORS.text,
    button: stored.button ?? null,
  };
}
