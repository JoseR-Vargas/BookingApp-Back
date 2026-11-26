import { AvailabilityInvalidator } from '../../application/availability-invalidator.port';

type AsyncMethod = (...args: never[]) => Promise<unknown>;

/**
 * Wraps a writer port so that, after each of the listed write methods ends
 * (done or failed), the availability cache of the business in force is
 * invalidated (spec 22). A decorator at the binding: the use cases and the
 * Mongo adapters do not know about the cache. Invalidating after a failure is
 * harmless and covers a write that landed before the error. Without an
 * invalidator (a module tested alone) the writer is returned as it is.
 */
export function invalidatingWriter<W extends object>(
  writer: W,
  invalidator: AvailabilityInvalidator | undefined,
  methods: readonly {
    [K in keyof W]: W[K] extends AsyncMethod ? K : never;
  }[keyof W][],
): W {
  if (!invalidator) return writer;
  const listed = new Set<PropertyKey>(methods);
  return new Proxy(writer, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (!listed.has(property) || typeof value !== 'function') return value;
      const method = value as (...a: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]): Promise<unknown> => {
        try {
          return await method.apply(target, args);
        } finally {
          invalidator.invalidateBusiness();
        }
      };
    },
  });
}
