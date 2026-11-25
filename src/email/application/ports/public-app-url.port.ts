// ===== URL PÚBLICA DE LA APP =====
// The address the links of the emails point to. It comes from the environment
// (the edge); the domain only receives it as data.

export interface PublicAppUrl {
  /** The base URL without a trailing slash, or null when it is not a valid http(s) URL. */
  read(): string | null;
}

export const PUBLIC_APP_URL = Symbol('PUBLIC_APP_URL');
