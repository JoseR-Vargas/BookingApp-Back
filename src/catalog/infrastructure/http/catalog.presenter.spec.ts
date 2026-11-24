import { Professional } from '../../domain/professional';
import { Service } from '../../domain/service';
import {
  toAdminProfessional,
  toAdminService,
  toPublicProfessional,
  toPublicService,
} from './catalog.presenter';

const professional = (overrides: Partial<Professional> = {}): Professional => ({
  id: 'ana',
  name: 'Ana',
  specialty: 'Colorist',
  experience: '3 años',
  rating: 4.8,
  avatar: 'fas fa-user',
  active: true,
  photo: null,
  locationIds: null,
  ...overrides,
});

const service: Service = {
  id: 'corte',
  name: 'Corte',
  description: 'd',
  price: 100,
  duration: 30,
  professionals: ['ana'],
  icon: 'fas fa-star',
  active: false,
};

describe('catalog presenter', () => {
  it('shows an admin professional with its resolved locations and no photo url', () => {
    expect(
      toAdminProfessional({ professional: professional(), locationIds: ['a'] }),
    ).toEqual({
      id: 'ana',
      name: 'Ana',
      specialty: 'Colorist',
      experience: '3 años',
      rating: 4.8,
      avatar: 'fas fa-user',
      active: true,
      photoUrl: null,
      locations: ['a'],
    });
  });

  it('builds the photo url with ?v=<updatedAt in ms>', () => {
    const withPhoto = professional({
      photo: { mimeType: 'image/png', updatedAt: new Date(1_700_000_000_123) },
    });
    expect(toPublicProfessional(withPhoto).photoUrl).toBe(
      '/api/catalog/professionals/ana/photo?v=1700000000123',
    );
    expect(
      toAdminProfessional({ professional: withPhoto, locationIds: [] })
        .photoUrl,
    ).toBe('/api/catalog/professionals/ana/photo?v=1700000000123');
  });

  it('shows a public professional as available, without the admin fields', () => {
    expect(toPublicProfessional(professional({ active: false }))).toEqual({
      id: 'ana',
      name: 'Ana',
      specialty: 'Colorist',
      experience: '3 años',
      rating: 4.8,
      avatar: 'fas fa-user',
      available: true,
      photoUrl: null,
    });
  });

  it('shows a public service without active, and an admin service with it', () => {
    expect(toPublicService(service)).toEqual({
      id: 'corte',
      name: 'Corte',
      description: 'd',
      price: 100,
      duration: 30,
      professionals: ['ana'],
      icon: 'fas fa-star',
    });
    expect(toAdminService(service)).toEqual({
      id: 'corte',
      name: 'Corte',
      description: 'd',
      price: 100,
      duration: 30,
      professionals: ['ana'],
      icon: 'fas fa-star',
      active: false,
    });
  });
});
