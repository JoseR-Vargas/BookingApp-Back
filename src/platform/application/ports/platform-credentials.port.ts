// ===== PUERTO: CREDENCIALES DE PLATAFORMA =====
// The key of the owner of the system. It is NOT the admin key of a business:
// the two never open each other's routes (spec 25).

export interface PlatformCredentials {
  /**
   * Whether the key the request carries is the platform key. It fails closed:
   * without a configured key nothing is ever valid.
   */
  isValid(providedKey: string | undefined): boolean;
}

export const PLATFORM_CREDENTIALS = Symbol('PLATFORM_CREDENTIALS');
