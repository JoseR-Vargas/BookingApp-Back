/**
 * Modules already migrated to the light hexagonal layout. The architecture
 * test enforces the layer rules on `src/shared` and on each module listed
 * here; a module joins the list in the spec that migrates it.
 */
export const MIGRATED_MODULES: readonly string[] = [
  'branding',
  'catalog',
  'availability',
  'auth',
  'signup',
  'tenancy',
  'billing',
  'reminders',
];
