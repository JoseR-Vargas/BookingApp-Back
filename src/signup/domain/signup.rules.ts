// ===== REGLAS DEL ALTA DE UN NEGOCIO =====
// What a person must give to create a business, and how its slug is derived
// from its name (spec 21). Pure: the uniqueness of the slug is checked by the
// tenancy when the business is created.

import {
  normalizeEmail,
  validateName,
  validatePassword,
} from '../../auth/domain/admin-user.rules';
import { DomainError } from '../../shared/domain/domain-error';
import { Result, err, ok } from '../../shared/domain/result';
import {
  InvalidTenantName,
  InvalidTenantSlug,
  ReservedTenantSlug,
} from '../../tenancy/domain/tenant.errors';
import {
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  isReservedSlug,
  isValidName,
  isValidSlug,
  normalizeSlug,
} from '../../tenancy/domain/tenant.rules';

/** What the person typed (untrusted). */
export interface SignupDraft {
  businessName: unknown;
  adminName: unknown;
  email: unknown;
  password: unknown;
  /** Optional: derived from the business name when absent or empty. */
  slug?: unknown;
}

/** A signup that meets every rule. */
export interface ValidSignup {
  businessName: string;
  adminName: string;
  email: string;
  password: string;
  slug: string;
}

/**
 * The slug a business name suggests: lowercase, without accents, words
 * separated by single dashes, at most 40 characters. It may still be too
 * short or reserved: `validateSignup` checks that.
 */
export function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

/** The message when the name gives no usable slug and the person gave none. */
export const DERIVED_SLUG_MESSAGE =
  'No pudimos crear una dirección a partir del nombre: elige una dirección (slug) de 3 a 40 caracteres.';

/** Validates a signup; stops at the first broken rule. */
export function validateSignup(
  draft: SignupDraft,
): Result<ValidSignup, DomainError> {
  const businessName =
    typeof draft.businessName === 'string' ? draft.businessName.trim() : '';
  if (!isValidName(businessName)) {
    return err(
      new InvalidTenantName(
        `El nombre del negocio debe tener de 1 a ${MAX_NAME_LENGTH} caracteres.`,
      ),
    );
  }
  const adminName = validateName(draft.adminName);
  if (!adminName.ok) return adminName;
  const email = normalizeEmail(draft.email);
  if (!email.ok) return email;
  const password = validatePassword(draft.password);
  if (!password.ok) return password;
  const slug = chooseSlug(draft.slug, businessName);
  if (!slug.ok) return slug;
  return ok({
    businessName,
    adminName: adminName.value,
    email: email.value,
    password: password.value,
    slug: slug.value,
  });
}

function chooseSlug(
  given: unknown,
  businessName: string,
): Result<string, DomainError> {
  if (given !== undefined && given !== null && typeof given !== 'string') {
    return err(
      new InvalidTenantSlug(
        'El slug debe tener de 3 a 40 caracteres: letras minúsculas, números y guiones.',
      ),
    );
  }
  const typed = typeof given === 'string' ? normalizeSlug(given) : '';
  if (typed !== '') {
    // The tenancy gives the exact message for a typed slug that is invalid
    // or reserved when it creates the business; the shape is checked here too
    // so nothing is created for a slug that cannot exist.
    if (!isValidSlug(typed)) {
      return err(
        new InvalidTenantSlug(
          'El slug debe tener de 3 a 40 caracteres: letras minúsculas, números y guiones.',
        ),
      );
    }
    return isReservedSlug(typed)
      ? err(new ReservedTenantSlug(typed))
      : ok(typed);
  }
  const derived = slugFromName(businessName);
  return isValidSlug(derived) && !isReservedSlug(derived)
    ? ok(derived)
    : err(new InvalidTenantSlug(DERIVED_SLUG_MESSAGE));
}
