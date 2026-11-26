// ===== CREDENCIALES DE ADMIN (ENTORNO) =====
// The shared key of the installation, read from the environment and compared in
// constant time. PROVISIONAL: spec 20 replaces it with the accounts of each
// business.

import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AdminCredentials } from '../application/ports/admin-credentials.port';
import { areAdminCredentialsValid } from '../domain/admin-credentials.rules';

/** Fixed-length digests make the comparison independent of the key length. */
const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

/** True when `provided` is a string equal to `expected` (constant time). */
const matches = (provided: string | undefined, expected: string): boolean =>
  provided !== undefined && timingSafeEqual(digest(provided), digest(expected));

@Injectable()
export class EnvAdminCredentials implements AdminCredentials {
  isValid(
    providedKey: string | undefined,
    providedUsername: string | undefined,
  ): boolean {
    const key = process.env.ADMIN_API_KEY;
    const username = process.env.ADMIN_USERNAME;
    if (
      !areAdminCredentialsValid(
        { key, username },
        { key: providedKey, username: providedUsername },
      )
    ) {
      return false;
    }
    // Both checks always run and every failure gives the same 401, so neither
    // the message nor the timing reveals which one failed.
    const keyOk = matches(providedKey, key as string);
    const usernameOk =
      !username ||
      username.trim() === '' ||
      matches(providedUsername, username);
    return keyOk && usernameOk;
  }
}
