import { Err, Result } from '../../shared/domain/result';
import { DomainError } from '../../shared/domain/domain-error';
import {
  ProfessionalHasUpcomingBookingsError,
  ProfessionalIsSoleProviderError,
  ServiceHasUpcomingBookingsError,
} from './catalog.errors';
import {
  ensureProfessionalNotSoleProvider,
  ensureProfessionalHasNoUpcomingBookings,
  ensureServiceHasNoUpcomingBookings,
} from './deletion.rules';
import { Service } from './service';

const service = (name: string, professionals: string[]): Service => ({
  id: name.toLowerCase(),
  name,
  description: '',
  price: 1,
  duration: 30,
  professionals,
  icon: 'i',
  active: true,
});

const errorOf = (result: Result<unknown>): DomainError => {
  expect(result.ok).toBe(false);
  return (result as Err<DomainError>).error;
};

describe('ensureProfessionalHasNoUpcomingBookings', () => {
  it('passes with no upcoming bookings', () => {
    expect(ensureProfessionalHasNoUpcomingBookings('Ana', 0).ok).toBe(true);
  });

  it('refuses with the singular message for one booking', () => {
    const error = errorOf(ensureProfessionalHasNoUpcomingBookings('Ana', 1));
    expect(error).toBeInstanceOf(ProfessionalHasUpcomingBookingsError);
    expect(error.kind).toBe('conflict');
    expect(error.message).toBe(
      'No se puede eliminar a Ana: tiene 1 reserva futura confirmada. Cancélalas o desactiva al profesional.',
    );
  });

  it('refuses with the plural message for several bookings', () => {
    expect(
      errorOf(ensureProfessionalHasNoUpcomingBookings('Ana', 3)).message,
    ).toBe(
      'No se puede eliminar a Ana: tiene 3 reservas futuras confirmadas. Cancélalas o desactiva al profesional.',
    );
  });
});

describe('ensureProfessionalNotSoleProvider', () => {
  it('passes when every offered service has other professionals', () => {
    expect(
      ensureProfessionalNotSoleProvider('Ana', [
        service('Mixto', ['ana', 'luis']),
      ]).ok,
    ).toBe(true);
    expect(ensureProfessionalNotSoleProvider('Ana', []).ok).toBe(true);
  });

  it('refuses naming the first service only this professional offers', () => {
    const error = errorOf(
      ensureProfessionalNotSoleProvider('Ana', [
        service('Mixto', ['ana', 'luis']),
        service('Corte', ['ana']),
        service('Tinte', ['ana']),
      ]),
    );
    expect(error).toBeInstanceOf(ProfessionalIsSoleProviderError);
    expect(error.kind).toBe('conflict');
    expect(error.message).toBe(
      'No se puede eliminar a Ana: el servicio "Corte" solo lo ofrece este profesional. Asígnale otro profesional o desactiva el servicio.',
    );
  });
});

describe('ensureServiceHasNoUpcomingBookings', () => {
  it('passes with no upcoming bookings', () => {
    expect(ensureServiceHasNoUpcomingBookings('Corte', 0).ok).toBe(true);
  });

  it('refuses with the singular and the plural message', () => {
    const one = errorOf(ensureServiceHasNoUpcomingBookings('Corte', 1));
    expect(one).toBeInstanceOf(ServiceHasUpcomingBookingsError);
    expect(one.kind).toBe('conflict');
    expect(one.message).toBe(
      'No se puede eliminar el servicio "Corte": tiene 1 reserva futura confirmada. Cancélalas o desactiva el servicio.',
    );
    expect(
      errorOf(ensureServiceHasNoUpcomingBookings('Corte', 2)).message,
    ).toBe(
      'No se puede eliminar el servicio "Corte": tiene 2 reservas futuras confirmadas. Cancélalas o desactiva el servicio.',
    );
  });
});
