import { createHash, createHmac, timingSafeEqual } from 'crypto';

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

/**
 * Constant-time string comparison. Both sides are hashed first so inputs of
 * different length are compared without leaking their length.
 */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) =>
    createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Validates Meta's `X-Hub-Signature-256` header: `sha256=` + HMAC-SHA256 of
 * the RAW request body keyed with the app secret. Fails closed on any missing
 * or malformed input.
 */
export function verifySignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !rawBody || !header) return false;

  const match = SIGNATURE_PATTERN.exec(header);
  if (!match) return false;

  const received = Buffer.from(match[1], 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return timingSafeEqual(received, expected);
}
