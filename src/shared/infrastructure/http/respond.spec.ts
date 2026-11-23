import { DomainError } from '../../domain/domain-error';
import { err, ok } from '../../domain/result';
import { respond } from './respond';

describe('respond', () => {
  it('returns the value of an Ok', () => {
    const value = { id: 1 };
    expect(respond(ok(value))).toBe(value);
  });

  it('throws the very DomainError of an Err, for the DomainErrorFilter', () => {
    const error = new DomainError('conflict', 'Ya existe.');
    expect(() => respond(err(error))).toThrow(error);
    try {
      respond(err(error));
    } catch (thrown) {
      expect(thrown).toBe(error);
    }
  });
});
