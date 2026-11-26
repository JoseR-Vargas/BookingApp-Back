// The rule of the key of the owner of the system (spec 25): it is configured
// in the environment and it fails closed. Pure: the value comes in, the
// answer comes out.

/**
 * Whether the platform key is configured. Without it nothing is ever valid:
 * the routes of the owner stay closed instead of opening for anybody.
 */
export function isPlatformKeyConfigured(key: string | undefined): boolean {
  return typeof key === 'string' && key.trim() !== '';
}
