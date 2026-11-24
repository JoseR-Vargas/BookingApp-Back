/** The current time, injected so use cases never read the system clock. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');
