/**
 * The secret a client holds to cancel one booking. Generating it needs
 * randomness and hashing it needs a digest, so both live behind this port.
 */
export interface CancelTokens {
  /** A new unguessable token (43 base64url characters). */
  generate(): string;
  /** The digest stored in place of the token; the same token always gives the same hash. */
  hash(token: string): string;
}

export const CANCEL_TOKENS = Symbol('CANCEL_TOKENS');
