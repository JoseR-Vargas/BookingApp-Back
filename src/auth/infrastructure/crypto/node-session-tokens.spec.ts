import { createHash } from 'node:crypto';
import { NodeSessionTokens } from './node-session-tokens';

describe('NodeSessionTokens', () => {
  const tokens = new NodeSessionTokens();

  it('issues 32 random bytes as base64url, with the SHA-256 hash of the token', () => {
    const { token, tokenHash } = tokens.issue();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(tokens.hash(token)).toBe(tokenHash);
  });

  it('never repeats a token and never stores it as its own hash', () => {
    const a = tokens.issue();
    const b = tokens.issue();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(a.token);
  });
});
