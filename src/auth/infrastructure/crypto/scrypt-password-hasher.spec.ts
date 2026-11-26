import { ScryptPasswordHasher } from './scrypt-password-hasher';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('verifies the password it hashed', async () => {
    const hash = await hasher.hash('correct horse battery');
    await expect(hasher.verify('correct horse battery', hash)).resolves.toBe(
      true,
    );
  });

  it('rejects a different password, a prefix and the empty string', async () => {
    const hash = await hasher.hash('correct horse battery');
    await expect(hasher.verify('correct horse batter', hash)).resolves.toBe(
      false,
    );
    await expect(hasher.verify('wrong', hash)).resolves.toBe(false);
    await expect(hasher.verify('', hash)).resolves.toBe(false);
  });

  it('never stores the password and salts every hash', async () => {
    const a = await hasher.hash('same-password-1');
    const b = await hasher.hash('same-password-1');
    expect(a).not.toContain('same-password-1');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
  });

  it('answers false (never throws) for a missing or malformed hash', async () => {
    await expect(hasher.verify('anything-at-all', null)).resolves.toBe(false);
    await expect(hasher.verify('anything-at-all', '')).resolves.toBe(false);
    await expect(hasher.verify('anything-at-all', 'scrypt$x$y')).resolves.toBe(
      false,
    );
    await expect(
      hasher.verify('anything-at-all', 'bcrypt$a$b$c$d$e'),
    ).resolves.toBe(false);
  });

  it('does the work of a real check when there is no hash', async () => {
    const hash = await hasher.hash('correct horse battery');
    const time = async (fn: () => Promise<unknown>) => {
      const start = process.hrtime.bigint();
      await fn();
      return Number(process.hrtime.bigint() - start) / 1e6;
    };
    await hasher.verify('x', null); // warm the lazily built dummy hash
    const real = await time(() => hasher.verify('wrong-password', hash));
    const none = await time(() => hasher.verify('wrong-password', null));
    expect(none).toBeGreaterThan(real / 4);
  });
});
