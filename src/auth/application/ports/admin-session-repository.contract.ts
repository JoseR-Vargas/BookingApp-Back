import { NewAdminSession } from '../../domain/admin-user';
import { AdminSessionReader } from './admin-session.reader';
import { AdminSessionWriter } from './admin-session.writer';

export interface AdminSessionRepositoryFixture {
  reader: AdminSessionReader;
  writer: AdminSessionWriter;
  /** Runs `fn` as another business (a different tenant context). */
  inOtherBusiness<T>(fn: () => Promise<T>): Promise<T>;
}

const CREATED_AT = new Date('2026-01-01T10:00:00.000Z');
const EXPIRES_AT = new Date('2026-01-08T10:00:00.000Z');

const draft = (overrides: Partial<NewAdminSession> = {}): NewAdminSession => ({
  userId: '0123456789abcdef01234567',
  tokenHash: 'hash-a',
  createdAt: CREATED_AT,
  expiresAt: EXPIRES_AT,
  userAgent: 'jest',
  ...overrides,
});

/** Behavior every AdminSessionReader + AdminSessionWriter adapter must honor. */
export function describeAdminSessionRepositoryContract(
  name: string,
  factory: () => Promise<AdminSessionRepositoryFixture>,
): void {
  describe(`AdminSessionReader + AdminSessionWriter contract: ${name}`, () => {
    let repo: AdminSessionRepositoryFixture;

    beforeEach(async () => {
      repo = await factory();
    });

    it('stores a session and finds it by the hash of its token', async () => {
      const created = await repo.writer.create(draft());
      expect(created).toEqual({
        id: expect.any(String) as string,
        userId: '0123456789abcdef01234567',
        tokenHash: 'hash-a',
        createdAt: CREATED_AT,
        expiresAt: EXPIRES_AT,
        userAgent: 'jest',
      });
      await expect(repo.reader.findByTokenHash('hash-a')).resolves.toEqual(
        created,
      );
    });

    it('answers null for an unknown hash', async () => {
      await expect(repo.reader.findByTokenHash('nope')).resolves.toBeNull();
    });

    it('does not find the session of another business', async () => {
      await repo.writer.create(draft());
      await expect(
        repo.inOtherBusiness(() => repo.reader.findByTokenHash('hash-a')),
      ).resolves.toBeNull();
    });

    it('revokes one session and leaves the others', async () => {
      await repo.writer.create(draft());
      await repo.writer.create(draft({ tokenHash: 'hash-b' }));
      await repo.writer.revokeByTokenHash('hash-a');
      await expect(repo.reader.findByTokenHash('hash-a')).resolves.toBeNull();
      await expect(
        repo.reader.findByTokenHash('hash-b'),
      ).resolves.not.toBeNull();
      await expect(
        repo.writer.revokeByTokenHash('hash-a'),
      ).resolves.toBeUndefined();
    });

    it('revokes every session of an account only', async () => {
      await repo.writer.create(draft());
      await repo.writer.create(draft({ tokenHash: 'hash-b' }));
      await repo.writer.create(
        draft({ tokenHash: 'hash-c', userId: '111111111111111111111111' }),
      );
      await repo.inOtherBusiness(() =>
        repo.writer.create(draft({ tokenHash: 'hash-d' })),
      );

      await repo.writer.revokeAllOfUser('0123456789abcdef01234567');

      await expect(repo.reader.findByTokenHash('hash-a')).resolves.toBeNull();
      await expect(repo.reader.findByTokenHash('hash-b')).resolves.toBeNull();
      await expect(
        repo.reader.findByTokenHash('hash-c'),
      ).resolves.not.toBeNull();
      await expect(
        repo.inOtherBusiness(() => repo.reader.findByTokenHash('hash-d')),
      ).resolves.not.toBeNull();
    });
  });
}
