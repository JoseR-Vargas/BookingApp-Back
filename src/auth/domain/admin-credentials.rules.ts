// ===== REGLAS DE CREDENCIALES DE ADMIN =====
// Whether the credentials of a request are the ones the installation expects.
// Pure: the environment is read by the adapter, never here.

/** The credentials the installation expects (both may be absent). */
export interface ConfiguredCredentials {
  /** The shared admin key; without it nothing passes. */
  key: string | undefined;
  /** The admin username; required only when it is configured. */
  username: string | undefined;
}

/** The credentials a request carries. */
export interface ProvidedCredentials {
  /** The bearer token of the request. */
  key: string | undefined;
  /** The `X-Admin-Username` header of the request. */
  username: string | undefined;
}

/**
 * Whether the request may enter as admin.
 *
 * - Without a configured key nothing passes: the installation fails closed.
 * - The key always has to match.
 * - The username only has to match when one is configured; when it is not, the
 *   request does not need to send one.
 *
 * The caller compares the key in constant time: this rule only says what has
 * to be true.
 */
export function areAdminCredentialsValid(
  configured: ConfiguredCredentials,
  provided: ProvidedCredentials,
): boolean {
  const expectedKey = configured.key?.trim() ?? '';
  if (expectedKey === '') {
    return false;
  }
  const expectedUsername = configured.username?.trim() ?? '';
  if (expectedUsername !== '') {
    const given = provided.username?.trim() ?? '';
    if (given !== expectedUsername) {
      return false;
    }
  }
  return (provided.key ?? '') !== '';
}
