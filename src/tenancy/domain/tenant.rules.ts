// ===== REGLAS DEL NEGOCIO =====
// The rules a business must meet to exist: how its slug looks and which
// slugs are reserved. Pure: they know nothing about the database.

/** The slug of a business: lowercase letters, digits and dashes, 3 to 40 characters. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * The slugs the application keeps for itself: a business cannot take the
 * path of the API, of the admin panel or of the public pages.
 */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'n',
  'login',
  'cancelar',
  'disponibilidad',
  'platform',
  'www',
  'app',
  'static',
  'assets',
];

/** The shortest and the longest slug a business may have. */
export const MIN_SLUG_LENGTH = 3;
export const MAX_SLUG_LENGTH = 40;

/** The name of a business: 1 to 80 characters. */
export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 80;

/** The slug as it is written: trimmed and lowercased. */
export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Whether the slug has the shape a business needs. */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Whether the slug belongs to the application and no business may take it. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(normalizeSlug(slug));
}

/** Whether the name of a business is acceptable. */
export function isValidName(name: string): boolean {
  const length = name.trim().length;
  return length >= MIN_NAME_LENGTH && length <= MAX_NAME_LENGTH;
}
