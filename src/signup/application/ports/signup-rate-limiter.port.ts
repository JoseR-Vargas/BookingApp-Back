// ===== PUERTO: LÍMITE DE ALTAS =====
// Stops a client from creating businesses in a loop (spec 21). A key is
// usually the IP of the request.

export interface SignupRateLimiter {
  /**
   * Counts one attempt of `key` and answers whether it is allowed. An
   * attempt over the limit is refused and does not extend the window.
   */
  tryConsume(key: string): boolean;
}

export const SIGNUP_RATE_LIMITER = Symbol('SIGNUP_RATE_LIMITER');
