// ===== PUERTO: LÍMITE DE PEDIDOS =====
// Counts the requests of a key (usually an IP) and says whether one more is
// allowed (spec 22). Signup keeps its own, stricter instance of the same idea.

export interface RateLimiter {
  /**
   * Counts one attempt of `key` and answers whether it is allowed. An attempt
   * over the limit is refused and does not extend the window.
   */
  tryConsume(key: string): boolean;
}

/** The limiter of the public endpoints (availability and new bookings). */
export const PUBLIC_RATE_LIMITER = Symbol('PUBLIC_RATE_LIMITER');
