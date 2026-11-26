import { DomainError } from '../../shared/domain/domain-error';
import { Result } from '../../shared/domain/result';
import {
  DERIVED_SLUG_MESSAGE,
  ValidSignup,
  slugFromName,
  validateSignup,
} from './signup.rules';

const draft = (over: Record<string, unknown> = {}) => ({
  businessName: 'Barbería Sur',
  adminName: 'Ana',
  email: ' Ana@Example.com ',
  password: 'a-long-password',
  ...over,
});

const failure = (result: Result<ValidSignup, DomainError>) => {
  if (result.ok) throw new Error('expected an Err');
  return result.error;
};

describe('slugFromName', () => {
  it.each([
    ['Barbería Sur', 'barberia-sur'],
    ['  Peluquería  "El Corte" !! ', 'peluqueria-el-corte'],
    ['Ñandú & Hijos', 'nandu-hijos'],
    ['A'.repeat(60), 'a'.repeat(40)],
    ['---x---', 'x'],
    ['!!!', ''],
  ])('%j -> %j', (name, slug) => {
    expect(slugFromName(name)).toBe(slug);
  });

  it('does not end with a dash after the cut', () => {
    expect(slugFromName(`${'a'.repeat(39)} b`)).toBe('a'.repeat(39));
  });
});

describe('validateSignup', () => {
  it('accepts a signup and derives the slug from the name', () => {
    const result = validateSignup(draft());
    expect(result).toEqual({
      ok: true,
      value: {
        businessName: 'Barbería Sur',
        adminName: 'Ana',
        email: 'ana@example.com',
        password: 'a-long-password',
        slug: 'barberia-sur',
      },
    });
  });

  it('uses the typed slug, normalized, when there is one', () => {
    const result = validateSignup(draft({ slug: ' Mi-Barberia ' }));
    expect(result.ok && result.value.slug).toBe('mi-barberia');
  });

  it('derives the slug when the typed one is empty', () => {
    const result = validateSignup(draft({ slug: '  ' }));
    expect(result.ok && result.value.slug).toBe('barberia-sur');
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['not a string', 42],
    ['too long', 'x'.repeat(81)],
  ])('rejects a %s business name', (_name, businessName) => {
    const error = failure(validateSignup(draft({ businessName })));
    expect(error.kind).toBe('validation');
    expect(error.message).toBe(
      'El nombre del negocio debe tener de 1 a 80 caracteres.',
    );
  });

  it('rejects a bad admin name, email and password with the account messages', () => {
    expect(failure(validateSignup(draft({ adminName: '' }))).message).toBe(
      'El nombre debe tener entre 1 y 80 caracteres.',
    );
    expect(failure(validateSignup(draft({ email: 'nope' }))).message).toBe(
      'El correo no es válido.',
    );
    expect(failure(validateSignup(draft({ password: 'short' }))).message).toBe(
      'La contraseña debe tener al menos 10 caracteres.',
    );
  });

  it('rejects an invalid typed slug', () => {
    for (const slug of ['a', 'Mi Barberia', '-abc', 'x'.repeat(41), 7]) {
      const error = failure(validateSignup(draft({ slug })));
      expect(error.kind).toBe('validation');
      expect(error.message).toContain('El slug debe tener de 3 a 40');
    }
  });

  it('rejects a reserved typed slug', () => {
    const error = failure(validateSignup(draft({ slug: 'Admin' })));
    expect(error.kind).toBe('validation');
    expect(error.message).toBe('El slug "admin" está reservado.');
  });

  it('asks for a slug when the name gives none usable', () => {
    for (const businessName of ['!!', 'Admin']) {
      expect(failure(validateSignup(draft({ businessName }))).message).toBe(
        DERIVED_SLUG_MESSAGE,
      );
    }
  });

  it('stops at the first broken rule', () => {
    const error = failure(
      validateSignup(draft({ businessName: '', email: 'bad' })),
    );
    expect(error.message).toContain('nombre del negocio');
  });
});
