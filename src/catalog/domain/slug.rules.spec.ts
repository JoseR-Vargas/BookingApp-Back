import { slugCandidates, slugify } from './slug.rules';

describe('slugify', () => {
  it.each([
    ['Alex García', 'alex-garcia'],
    ['  María   López  ', 'maria-lopez'],
    ['Sesión Exprés 2x1!', 'sesion-expres-2x1'],
    ['--Corte & Barba--', 'corte-barba'],
    ['ÑANDÚ', 'nandu'],
  ])('turns %p into %p', (name, slug) => {
    expect(slugify(name, 'item')).toBe(slug);
  });

  it('uses the fallback when nothing alphanumeric remains', () => {
    expect(slugify('!!! ???', 'service')).toBe('service');
    expect(slugify('日本語', 'professional')).toBe('professional');
  });
});

describe('slugCandidates', () => {
  it('yields the base, then base-2, base-3 and so on, without end', () => {
    const candidates = slugCandidates('ana');
    const firstFive = Array.from({ length: 5 }, () => candidates.next().value);
    expect(firstFive).toEqual(['ana', 'ana-2', 'ana-3', 'ana-4', 'ana-5']);
  });
});
