import { DomainError } from './domain-error';

class OutOfStockError extends DomainError {
  constructor() {
    super('conflict', 'Sin stock');
  }
}

describe('DomainError', () => {
  it('is an Error carrying a semantic kind and its message', () => {
    const error = new DomainError('validation', 'Dato inválido');

    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe('validation');
    expect(error.message).toBe('Dato inválido');
  });

  it('takes the name of the concrete class, for logs and assertions', () => {
    expect(new OutOfStockError().name).toBe('OutOfStockError');
    expect(new DomainError('not-found', 'x').name).toBe('DomainError');
  });

  it('can be specialised without losing its kind', () => {
    const error = new OutOfStockError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.kind).toBe('conflict');
  });
});
