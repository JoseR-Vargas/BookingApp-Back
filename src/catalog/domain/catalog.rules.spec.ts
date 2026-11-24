import { Professional } from './professional';
import { Service } from './service';
import { publicLocationIds, publicServiceProfessionals } from './catalog.rules';

const professional = (locationIds: string[] | null): Professional => ({
  id: 'ana',
  name: 'Ana',
  specialty: '',
  experience: '',
  rating: 5,
  avatar: 'a',
  active: true,
  photo: null,
  locationIds,
});

describe('publicLocationIds', () => {
  it('keeps only the stored locations that are active', () => {
    expect(
      publicLocationIds(professional(['a', 'gone', 'b']), 'a', ['b', 'a']),
    ).toEqual(['a', 'b']);
  });

  it('uses the default location for a professional stored without locations', () => {
    expect(publicLocationIds(professional(null), 'a', ['a'])).toEqual(['a']);
    expect(publicLocationIds(professional(null), 'a', ['b'])).toEqual([]);
  });
});

describe('publicServiceProfessionals', () => {
  it('lists only the active professionals, in the stored order', () => {
    const service = { professionals: ['x', 'y', 'z'] } as Service;
    expect(publicServiceProfessionals(service, new Set(['z', 'x']))).toEqual([
      'x',
      'z',
    ]);
  });
});
