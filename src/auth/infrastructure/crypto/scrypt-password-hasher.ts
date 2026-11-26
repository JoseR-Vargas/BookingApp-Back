// ===== HASH DE CONTRASEÑAS (scrypt) =====
// Node's built-in scrypt, no extra dependency. The stored string is
// self-describing, `scrypt$N$r$p$salt$hash` (salt and hash in base64), so the
// parameters can change later without breaking the hashes already stored.

import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { PasswordHasher } from '../../application/ports/password-hasher.port';

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** 128 * N * r bytes at the default cost is ~16 MB; the limit leaves room. */
const MAX_MEMORY = 64 * 1024 * 1024;

const derive = (
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelism: number,
  length: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      length,
      { N: cost, r: blockSize, p: parallelism, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });

interface ParsedHash {
  cost: number;
  blockSize: number;
  parallelism: number;
  salt: Buffer;
  key: Buffer;
}

const parse = (hash: string): ParsedHash | null => {
  const parts = hash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [cost, blockSize, parallelism] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const key = Buffer.from(parts[5], 'base64');
  const sane =
    [cost, blockSize, parallelism].every((n) => Number.isInteger(n) && n > 0) &&
    cost <= COST * 4 &&
    salt.length > 0 &&
    key.length > 0;
  return sane ? { cost, blockSize, parallelism, salt, key } : null;
};

@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  /** A real hash of a throwaway password, to spend the same time when there is none. */
  private dummy: Promise<string> | null = null;

  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(
      plain,
      salt,
      COST,
      BLOCK_SIZE,
      PARALLELISM,
      KEY_LENGTH,
    );
    return [
      'scrypt',
      COST,
      BLOCK_SIZE,
      PARALLELISM,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  async verify(plain: string, hash: string | null): Promise<boolean> {
    const parsed = hash ? parse(hash) : null;
    if (!parsed) {
      // Same work as a real check, then a fixed "no".
      this.dummy ??= this.hash('dummy-password-never-matches');
      const dummy = parse(await this.dummy) as ParsedHash;
      await derive(
        plain,
        dummy.salt,
        dummy.cost,
        dummy.blockSize,
        dummy.parallelism,
        dummy.key.length,
      );
      return false;
    }
    const key = await derive(
      plain,
      parsed.salt,
      parsed.cost,
      parsed.blockSize,
      parsed.parallelism,
      parsed.key.length,
    );
    return timingSafeEqual(key, parsed.key);
  }
}
