import {
  InvalidDate,
  InvalidServiceIds,
} from '../../domain/availability.errors';
import { cleanQueryValue, parseAvailabilityQuery } from './availability.input';

const failure = (date: unknown, serviceIds: unknown, locationId?: unknown) => {
  const result = parseAvailabilityQuery(date, serviceIds, locationId);
  if (result.ok) throw new Error('expected an Err');
  return result.error;
};

describe('parseAvailabilityQuery', () => {
  it('splits and trims the service ids and trims the location', () => {
    expect(parseAvailabilityQuery('2026-10-19', 'a, b ,c', ' centro ')).toEqual(
      {
        ok: true,
        value: {
          date: '2026-10-19',
          serviceIds: ['a', 'b', 'c'],
          locationId: 'centro',
        },
      },
    );
  });

  it.each([undefined, '', '   ', ['x'], 42])(
    'ignores a blank or non-string locationId (%p)',
    (locationId) => {
      const result = parseAvailabilityQuery('2026-10-19', 'a', locationId);
      expect(result.ok && result.value.locationId).toBeUndefined();
    },
  );

  it.each([undefined, '', 'abc', '2026-13-40', '2026-02-30', ['2026-10-19']])(
    'fails with InvalidDate for date %p',
    (date) => {
      expect(failure(date, 'a')).toBeInstanceOf(InvalidDate);
    },
  );

  it.each([undefined, '', '   ', ['a', 'b'], 7])(
    'fails with "serviceIds is required" for %p',
    (serviceIds) => {
      const error = failure('2026-10-19', serviceIds);
      expect(error).toBeInstanceOf(InvalidServiceIds);
      expect(error.message).toBe('serviceIds is required');
    },
  );

  it.each(['a,,b', 'a, ', ',a'])(
    'fails with the list message for %p',
    (serviceIds) => {
      expect(failure('2026-10-19', serviceIds).message).toBe(
        'serviceIds must be a comma-separated list of service ids',
      );
    },
  );

  it('answers the date message first when both date and service ids are wrong', () => {
    expect(failure('abc', '').message).toBe(
      'date must be a valid YYYY-MM-DD date',
    );
  });
});

describe('cleanQueryValue', () => {
  it('trims a string and drops anything else', () => {
    expect(cleanQueryValue(' x ')).toBe('x');
    expect(cleanQueryValue('  ')).toBeUndefined();
    expect(cleanQueryValue(undefined)).toBeUndefined();
    expect(cleanQueryValue(['x'])).toBeUndefined();
  });
});
