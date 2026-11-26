/** A freshly issued session token: the plain one goes to the client only. */
export interface IssuedToken {
  token: string;
  tokenHash: string;
}

/** Issues opaque session tokens and hashes them for storage. */
export interface SessionTokens {
  /** A new unguessable token (32 random bytes) and its hash. */
  issue(): IssuedToken;
  /** The hash under which a token is stored and looked up. */
  hash(token: string): string;
}

export const SESSION_TOKENS = Symbol('SESSION_TOKENS');
