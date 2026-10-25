import { createHmac } from 'crypto';
import { safeEqual, verifySignature } from './whatsapp.security';

const SECRET = 'app-secret';
const sign = (body: Buffer, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('verifySignature', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');

  it('accepts a correct signature of the raw body', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('accepts an uppercase hex digest', () => {
    const digest = sign(body).slice('sha256='.length).toUpperCase();
    expect(verifySignature(body, `sha256=${digest}`, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(
      verifySignature(Buffer.from('{"object":"other"}'), sign(body), SECRET),
    ).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifySignature(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('fails closed when the app secret is not configured', () => {
    expect(verifySignature(body, sign(body), undefined)).toBe(false);
    expect(verifySignature(body, sign(body), '')).toBe(false);
  });

  it('fails closed when the raw body is unavailable', () => {
    expect(verifySignature(undefined, sign(body), SECRET)).toBe(false);
  });

  it.each([
    undefined,
    '',
    'sha256=',
    'sha256=abc',
    'sha1=' + 'a'.repeat(40),
    'a'.repeat(64),
    'sha256=' + 'z'.repeat(64),
    'sha256=' + 'a'.repeat(65),
  ])('rejects a missing or malformed header %p', (header) => {
    expect(verifySignature(body, header, SECRET)).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compares equal strings', () => {
    expect(safeEqual('token', 'token')).toBe(true);
  });

  it('rejects different strings, including different lengths', () => {
    expect(safeEqual('token', 'tokeX')).toBe(false);
    expect(safeEqual('token', 'token-longer')).toBe(false);
    expect(safeEqual('', 'token')).toBe(false);
  });
});
