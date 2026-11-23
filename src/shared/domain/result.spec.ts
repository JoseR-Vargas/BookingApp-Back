import { DomainError } from './domain-error';
import {
  Result,
  andThen,
  err,
  map,
  mapErr,
  match,
  ok,
  unwrapOr,
} from './result';

class RuleError extends DomainError {
  constructor(message = 'rule broken') {
    super('validation', message);
  }
}

const half = (n: number): Result<number, RuleError> =>
  n % 2 === 0 ? ok(n / 2) : err(new RuleError('odd'));

describe('Result', () => {
  describe('ok / err', () => {
    it('ok carries the value and is discriminated by ok: true', () => {
      expect(ok(3)).toEqual({ ok: true, value: 3 });
    });

    it('err carries the error and is discriminated by ok: false', () => {
      const error = new RuleError();
      expect(err(error)).toEqual({ ok: false, error });
      expect(err(error).error).toBe(error);
    });

    it('narrows the type on the ok flag', () => {
      const result = half(4);
      if (result.ok) {
        const value: number = result.value;
        expect(value).toBe(2);
      } else {
        const error: RuleError = result.error;
        throw error;
      }
      const failed = half(3);
      if (!failed.ok) {
        const error: RuleError = failed.error;
        expect(error.message).toBe('odd');
      } else {
        throw new Error('unreachable');
      }
    });

    it('does not allow reading value without narrowing', () => {
      const result = half(2);
      // @ts-expect-error `value` only exists on Ok: the compiler forces the check
      expect(result.value).toBe(1);
    });
  });

  describe('map', () => {
    it('transforms an ok value', () => {
      expect(map(ok(2), (n) => n + 1)).toEqual(ok(3));
    });

    it('leaves an err untouched and never calls the callback', () => {
      const failed = err(new RuleError());
      const f = jest.fn();
      expect(map(failed, f)).toBe(failed);
      expect(f).not.toHaveBeenCalled();
    });
  });

  describe('andThen', () => {
    it('chains a function that returns a Result', () => {
      expect(andThen(half(8), half)).toEqual(ok(2));
    });

    it('short-circuits on the first err, in order', () => {
      const second = jest.fn(half);
      const first = andThen(half(3), second);
      expect(first).toEqual(err(new RuleError('odd')));
      expect(second).not.toHaveBeenCalled();
      expect(andThen(half(6), half)).toEqual(err(new RuleError('odd')));
    });
  });

  describe('mapErr', () => {
    it('transforms the error', () => {
      const mapped = mapErr(half(3), (e) => new RuleError(`${e.message}!`));
      expect(mapped).toEqual(err(new RuleError('odd!')));
    });

    it('leaves an ok untouched and never calls the callback', () => {
      const good = ok(1);
      const f = jest.fn();
      expect(mapErr(good, f)).toBe(good);
      expect(f).not.toHaveBeenCalled();
    });
  });

  describe('match', () => {
    it('runs the ok handler for an ok', () => {
      expect(
        match(half(4), { ok: (v) => `ok ${v}`, err: (e) => e.message }),
      ).toBe('ok 2');
    });

    it('runs the err handler for an err', () => {
      expect(
        match(half(3), { ok: (v) => `ok ${v}`, err: (e) => e.message }),
      ).toBe('odd');
    });
  });

  describe('unwrapOr', () => {
    it('answers the value of an ok', () => {
      expect(unwrapOr(ok(5), 0)).toBe(5);
    });

    it('answers the fallback for an err', () => {
      expect(unwrapOr(half(3), 0)).toBe(0);
    });
  });

  describe('helpers never throw by themselves', () => {
    it('accepts odd values: undefined, null, NaN, objects', () => {
      const odd = [undefined, null, NaN, {}, [], Symbol('s')];
      for (const value of odd) {
        const r = ok(value);
        expect(() => map(r, (v) => v)).not.toThrow();
        expect(() => andThen(r, (v) => ok(v))).not.toThrow();
        expect(() => mapErr(r, (e) => e)).not.toThrow();
        expect(() => match(r, { ok: (v) => v, err: (e) => e })).not.toThrow();
        expect(() => unwrapOr(r, undefined)).not.toThrow();
      }
      const failed = err(new RuleError());
      expect(() => map(failed, (v) => v)).not.toThrow();
      expect(() => unwrapOr(failed, null)).not.toThrow();
      expect(unwrapOr(ok(undefined), 'fallback')).toBeUndefined();
    });
  });
});
