/**
 * Modules whose business failures travel as `Result`. For these, the
 * architecture test also forbids `throw` in `domain/` and in
 * `application/use-cases/`. A module joins the list in the spec that migrates it.
 */
export const RESULT_MODULES: readonly string[] = [
  'branding',
  'catalog',
  'availability',
  'auth',
  'signup',
  'tenancy',
];
