import { DomainError } from '../../../shared/domain/domain-error';
import {
  parseCreateLocationInput,
  parsePublicAvailabilityInput,
  parseScheduleInput,
  parseUpdateLocationInput,
} from './location.input';

const week = () => ({
  0: { closed: true },
  1: { closed: false, open: '09:00', close: '20:00' },
  2: { closed: false, open: '09:00', close: '20:00' },
  3: { closed: false, open: '09:00', close: '20:00' },
  4: { closed: false, open: '09:00', close: '20:00' },
  5: { closed: false, open: '09:00', close: '20:00' },
  6: { closed: true },
});

/** The inputs hand the body to the domain rules; a broken rule leaves as a domain error. */
describe('location inputs', () => {
  it('parses the body of "create location"', () => {
    expect(parseCreateLocationInput({ name: ' Centro ' })).toEqual({
      name: 'Centro',
      address: '',
    });
  });

  it('throws the domain error of a broken create body (400)', () => {
    expect.assertions(2);
    try {
      parseCreateLocationInput({});
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        kind: 'validation',
        message: 'El nombre del local es obligatorio (máximo 80 caracteres).',
      });
    }
  });

  it('parses the body of "edit location": only the given fields', () => {
    expect(parseUpdateLocationInput({ active: false, foo: 1 })).toEqual({
      active: false,
    });
    expect(() => parseUpdateLocationInput({})).toThrow(
      'body must include at least one editable field (name, address, active)',
    );
  });

  it('parses a schedule body: the week, then the optional interval', () => {
    const parsed = parseScheduleInput({
      weekly: week(),
      startIntervalMinutes: 60,
    });
    expect(parsed.startIntervalMinutes).toBe(60);
    expect(Object.keys(parsed.weekly)).toHaveLength(7);
    expect(parseScheduleInput({ weekly: week() }).startIntervalMinutes).toBe(
      undefined,
    );
    expect(() =>
      parseScheduleInput({ weekly: week(), startIntervalMinutes: 45 }),
    ).toThrow(
      'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.',
    );
  });

  it('parses the settings of the public availability page', () => {
    expect(
      parsePublicAvailabilityInput({
        enabled: true,
        days: 3,
        serviceIds: null,
      }),
    ).toEqual({ enabled: true, days: 3, serviceIds: null });
    expect(() => parsePublicAvailabilityInput({})).toThrow(
      'El estado de la página pública debe ser verdadero o falso.',
    );
  });
});
