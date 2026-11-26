// ===== CREDENCIALES DE PLATAFORMA (ENTORNO) =====
// The key of the owner of the system, read from `PLATFORM_API_KEY` and
// compared in constant time. It is NOT the admin key of a business: the two
// never open each other's routes (spec 25).

import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PlatformCredentials } from '../../application/ports/platform-credentials.port';
import { isPlatformKeyConfigured } from '../../domain/platform-key.rules';

/** Fixed-length digests make the comparison independent of the key length. */
const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

/** True when `provided` is a string equal to `expected` (constant time). */
const matches = (provided: string | undefined, expected: string): boolean =>
  provided !== undefined && timingSafeEqual(digest(provided), digest(expected));

@Injectable()
export class EnvPlatformCredentials implements PlatformCredentials {
  isValid(providedKey: string | undefined): boolean {
    const configured = process.env.PLATFORM_API_KEY;
    // The comparison always runs, so neither the answer nor the timing tells
    // whether the key is configured.
    const equal = matches(providedKey, configured ?? '');
    return equal && isPlatformKeyConfigured(configured);
  }
}
