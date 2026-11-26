import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { CancelTokens } from '../../application/ports/cancel-tokens.port';

/** 32 random bytes in base64url (43 characters) and their SHA-256 hex digest. */
@Injectable()
export class NodeCancelTokens implements CancelTokens {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
