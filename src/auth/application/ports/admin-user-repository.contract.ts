import { NewAdminUser } from '../../domain/admin-user';
import { AdminUserReader } from './admin-user.reader';
import { AdminUserWriter } from './admin-user.writer';

/** What the contract needs from an adapter under test, on an empty store. */
export interface AdminUserRepositoryFixture {
  reader: AdminUserReader;
  writer: AdminUserWriter;
  /** Runs `fn` as another business (a different tenant context). */
  inOtherBusiness<T>(fn: () => Promise<T>): Promise<T>;
}

const CREATED_AT = new Date('2026-01-01T10:00:00.000Z');

const draft = (overrides: Partial<NewAdminUser> = {}): NewAdminUser => ({
  email: 'ana@example.com',
  name: 'Ana',
  passwordHash: 'hash-1',
  role: 'owner',
  createdAt: CREATED_AT,
  ...overrides,
});

/**
 * Behavior every AdminUserReader + AdminUserWriter adapter must honor. Each
 * adapter's spec calls it with a factory that answers a fixture over an EMPTY
 * store (in-memory for `npm test`, MongoDB for `npm run test:int`).
 */
export function describeAdminUserRepositoryContract(
  name: string,
  factory: () => Promise<AdminUserRepositoryFixture>,
): void {
  describe(`AdminUserReader + AdminUserWriter contract: ${name}`, () => {
    let repo: AdminUserRepositoryFixture;

    beforeEach(async () => {
      repo = await factory();
    });

    it('creates an active account without secrets and reads it back', async () => {
      const created = await repo.writer.create(draft());
      expect(created).toEqual({
        id: expect.any(String) as string,
        email: 'ana@example.com',
        name: 'Ana',
        role: 'owner',
        active: true,
        createdAt: CREATED_AT,
        lastLoginAt: null,
      });
      expect(created).not.toHaveProperty('passwordHash');
      await expect(repo.reader.findById(created!.id)).resolves.toEqual(created);
    });

    it('answers null for an email already taken and keeps one account', async () => {
      await repo.writer.create(draft());
      await expect(
        repo.writer.create(draft({ name: 'Other', passwordHash: 'hash-2' })),
      ).resolves.toBeNull();
      const all = await repo.reader.list();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Ana');
    });

    it('allows the same email in another business as a separate account', async () => {
      const mine = await repo.writer.create(draft());
      const theirs = await repo.inOtherBusiness(() =>
        repo.writer.create(draft({ name: 'Ana B' })),
      );
      expect(theirs).not.toBeNull();
      expect(theirs!.id).not.toBe(mine!.id);
      await expect(repo.reader.list()).resolves.toHaveLength(1);
      await expect(
        repo.inOtherBusiness(() => repo.reader.list()),
      ).resolves.toHaveLength(1);
    });

    it('gives the hash only through the credentials lookup', async () => {
      const created = await repo.writer.create(draft());
      await expect(
        repo.reader.findCredentialsByEmail('ana@example.com'),
      ).resolves.toEqual({ user: created, passwordHash: 'hash-1' });
      await expect(
        repo.reader.findCredentialsByEmail('nobody@example.com'),
      ).resolves.toBeNull();
    });

    it('does not see the accounts of another business', async () => {
      const created = await repo.writer.create(draft());
      await expect(
        repo.inOtherBusiness(() => repo.reader.findById(created!.id)),
      ).resolves.toBeNull();
      await expect(
        repo.inOtherBusiness(() =>
          repo.reader.findCredentialsByEmail('ana@example.com'),
        ),
      ).resolves.toBeNull();
      await expect(
        repo.inOtherBusiness(() =>
          repo.writer.update(created!.id, { name: 'Hijack' }),
        ),
      ).resolves.toBeNull();
      await expect(repo.reader.findById(created!.id)).resolves.toMatchObject({
        name: 'Ana',
      });
    });

    it('answers null for an unknown or malformed id', async () => {
      await expect(repo.reader.findById('nope')).resolves.toBeNull();
      await expect(
        repo.reader.findById('0123456789abcdef01234567'),
      ).resolves.toBeNull();
      await expect(
        repo.writer.update('nope', { name: 'X' }),
      ).resolves.toBeNull();
    });

    it('lists the accounts oldest first', async () => {
      await repo.writer.create(
        draft({
          email: 'b@example.com',
          createdAt: new Date(CREATED_AT.getTime() + 1000),
        }),
      );
      await repo.writer.create(draft({ email: 'a@example.com' }));
      const all = await repo.reader.list();
      expect(all.map((user) => user.email)).toEqual([
        'a@example.com',
        'b@example.com',
      ]);
    });

    it('updates only the given fields', async () => {
      const created = await repo.writer.create(draft());
      const loginAt = new Date('2026-02-02T00:00:00.000Z');
      const updated = await repo.writer.update(created!.id, {
        role: 'staff',
        active: false,
        name: 'Ana B',
        lastLoginAt: loginAt,
        passwordHash: 'hash-2',
      });
      expect(updated).toEqual({
        ...created,
        role: 'staff',
        active: false,
        name: 'Ana B',
        lastLoginAt: loginAt,
      });
      await expect(
        repo.reader.findCredentialsByEmail('ana@example.com'),
      ).resolves.toMatchObject({ passwordHash: 'hash-2' });
      await expect(
        repo.writer.update(created!.id, { role: 'viewer' }),
      ).resolves.toMatchObject({
        role: 'viewer',
        name: 'Ana B',
        active: false,
      });
    });

    it('counts only the active owners of the business', async () => {
      await expect(repo.reader.countActiveOwners()).resolves.toBe(0);
      const a = await repo.writer.create(draft({ email: 'a@example.com' }));
      await repo.writer.create(draft({ email: 'b@example.com' }));
      await repo.writer.create(
        draft({ email: 'c@example.com', role: 'staff' }),
      );
      await repo.inOtherBusiness(() => repo.writer.create(draft()));
      await expect(repo.reader.countActiveOwners()).resolves.toBe(2);
      await repo.writer.update(a!.id, { active: false });
      await expect(repo.reader.countActiveOwners()).resolves.toBe(1);
    });
  });
}
