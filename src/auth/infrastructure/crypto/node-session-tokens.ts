import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  IssuedToken,
  SessionTokens,
} from '../../application/ports/session-tokens.port';

/**
 * Opaque session tokens: 32 random bytes as base64url. Only their SHA-256
 * hash is stored, so a leaked database cannot be replayed as a cookie.
 */
@Injectable()
export class NodeSessionTokens implements SessionTokens {
  issue(): IssuedToken {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
