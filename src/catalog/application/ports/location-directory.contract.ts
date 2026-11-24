import { LocationDirectory } from './location-directory.port';

/** A location as the contract needs it. */
export interface SeedLocation {
  id: string;
  active: boolean;
  /** Decides which active location is the default (the oldest one). */
  createdAt: Date;
}

/** What the contract needs from the adapter under test, on a store without locations. */
export interface LocationDirectoryFixture {
  directory: LocationDirectory;
  /** Stores a location in the adapter's source, bypassing the port. */
  seed(location: SeedLocation): Promise<void>;
}

const at = (n: number) => new Date(1_700_000_000_000 + n * 1000);

/** Behavior every LocationDirectory adapter must honor. */
export function describeLocationDirectoryContract(
  name: string,
  factory: () => Promise<LocationDirectoryFixture>,
): void {
  describe(`LocationDirectory contract: ${name}`, () => {
    let fixture: LocationDirectoryFixture;

    beforeEach(async () => {
      fixture = await factory();
    });

    it('reads a store that was never migrated as the one "principal" location', async () => {
      await expect(fixture.directory.activeIds()).resolves.toEqual([
        'principal',
      ]);
      await expect(fixture.directory.defaultId()).resolves.toBe('principal');
    });

    it('lists the active locations oldest first, and the oldest is the default', async () => {
      await fixture.seed({ id: 'norte', active: true, createdAt: at(2) });
      await fixture.seed({ id: 'centro', active: true, createdAt: at(1) });
      await fixture.seed({ id: 'sur', active: true, createdAt: at(3) });
      await expect(fixture.directory.activeIds()).resolves.toEqual([
        'centro',
        'norte',
        'sur',
      ]);
      await expect(fixture.directory.defaultId()).resolves.toBe('centro');
    });

    it('skips the inactive locations, the default included', async () => {
      await fixture.seed({ id: 'centro', active: false, createdAt: at(1) });
      await fixture.seed({ id: 'norte', active: true, createdAt: at(2) });
      await expect(fixture.directory.activeIds()).resolves.toEqual(['norte']);
      await expect(fixture.directory.defaultId()).resolves.toBe('norte');
    });

    it('breaks a tie of creation time by insertion order', async () => {
      await fixture.seed({ id: 'a', active: true, createdAt: at(1) });
      await fixture.seed({ id: 'b', active: true, createdAt: at(1) });
      await expect(fixture.directory.activeIds()).resolves.toEqual(['a', 'b']);
    });

    it('answers no ids and a null default when no location is active', async () => {
      await fixture.seed({ id: 'centro', active: false, createdAt: at(1) });
      await expect(fixture.directory.activeIds()).resolves.toEqual([]);
      await expect(fixture.directory.defaultId()).resolves.toBeNull();
    });
  });
}
