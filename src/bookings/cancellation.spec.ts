import {
  CANCEL_TOKEN_LENGTH,
  cancelWindow,
  generateCancelToken,
  hashCancelToken,
} from './cancellation';

describe('generateCancelToken', () => {
  it('returns a 43 character base64url token (256 bits)', () => {
    const token = generateCancelToken();

    expect(token).toHaveLength(CANCEL_TOKEN_LENGTH);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateCancelToken()),
    );

    expect(tokens.size).toBe(200);
  });
});

describe('hashCancelToken', () => {
  it('is the SHA-256 hex digest of the token', () => {
    expect(hashCancelToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic and never equals the token', () => {
    const token = generateCancelToken();

    expect(hashCancelToken(token)).toBe(hashCancelToken(token));
    expect(hashCancelToken(token)).not.toBe(token);
    expect(hashCancelToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('cancelWindow', () => {
  // Buenos Aires is UTC-3 all year: 10:00 local is 13:00 UTC.
  const ZONE = 'America/Argentina/Buenos_Aires';
  const at = (utc: string) => new Date(utc);

  it('is open up to exactly 60 seconds before the start', () => {
    // Start 2026-11-20 10:00 local = 13:00:00Z. 09:59:00 local = 12:59:00Z.
    expect(
      cancelWindow('2026-11-20', '10:00', ZONE, at('2026-11-20T12:59:00Z')),
    ).toBe('open');
  });

  it('is closed 59 seconds before the start', () => {
    expect(
      cancelWindow('2026-11-20', '10:00', ZONE, at('2026-11-20T12:59:01Z')),
    ).toBe('closed');
  });

  it('is closed at the start and after it', () => {
    expect(
      cancelWindow('2026-11-20', '10:00', ZONE, at('2026-11-20T13:00:00Z')),
    ).toBe('closed');
    expect(
      cancelWindow('2026-11-20', '10:00', ZONE, at('2026-11-20T15:30:00Z')),
    ).toBe('closed');
  });

  it('is open on an earlier day and closed on a later day', () => {
    expect(
      cancelWindow('2026-11-20', '09:00', ZONE, at('2026-11-19T23:59:59Z')),
    ).toBe('open');
    expect(
      cancelWindow('2026-11-20', '09:00', ZONE, at('2026-11-21T12:00:00Z')),
    ).toBe('closed');
  });

  it('uses the business day, not the UTC day', () => {
    // 2026-11-20T01:30Z is still 2026-11-19 22:30 in Buenos Aires.
    expect(
      cancelWindow('2026-11-19', '23:00', ZONE, at('2026-11-20T01:30:00Z')),
    ).toBe('open');
    // 2026-11-20T02:30Z is 2026-11-19 23:30 there, already past 23:00.
    expect(
      cancelWindow('2026-11-19', '23:00', ZONE, at('2026-11-20T02:30:00Z')),
    ).toBe('closed');
  });

  it('accepts a single digit hour', () => {
    // 9:00 local = 12:00Z; 08:59 local = 11:59Z.
    expect(
      cancelWindow('2026-11-20', '9:00', ZONE, at('2026-11-20T11:59:00Z')),
    ).toBe('open');
  });

  it('is unknown when the timezone is unset, blank or invalid', () => {
    const now = at('2026-11-20T12:00:00Z');

    expect(cancelWindow('2026-11-20', '10:00', undefined, now)).toBe('unknown');
    expect(cancelWindow('2026-11-20', '10:00', '  ', now)).toBe('unknown');
    expect(cancelWindow('2026-11-20', '10:00', 'Not/AZone', now)).toBe(
      'unknown',
    );
  });

  it('fails closed on a malformed time', () => {
    const now = at('2026-11-19T12:00:00Z');

    expect(cancelWindow('2026-11-20', 'noon', ZONE, now)).toBe('closed');
    expect(cancelWindow('2026-11-20', '25:00', ZONE, now)).toBe('closed');
    expect(cancelWindow('2026-11-20', '', ZONE, now)).toBe('closed');
  });
});
