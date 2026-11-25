// ===== CREDENCIALES DE ADMIN =====
// How the installation knows an admin request. PROVISIONAL: today it is the
// shared key from the environment; the accounts of spec 20 answer this port
// from the database.

export interface AdminCredentials {
  /**
   * Whether the request carries the admin credentials. The key is compared in
   * constant time inside the adapter.
   */
  isValid(
    providedKey: string | undefined,
    providedUsername: string | undefined,
  ): boolean;
}

export const ADMIN_CREDENTIALS = Symbol('ADMIN_CREDENTIALS');
