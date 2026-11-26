/** Hashes and checks passwords. The algorithm lives in the adapter. */
export interface PasswordHasher {
  /** A self-describing hash (algorithm, parameters and salt included). */
  hash(plain: string): Promise<string>;
  /**
   * Whether `plain` matches `hash`, compared in constant time. With no hash
   * (an account that does not exist) it does the same work and answers false,
   * so the answer takes as long as a real check.
   */
  verify(plain: string, hash: string | null): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
