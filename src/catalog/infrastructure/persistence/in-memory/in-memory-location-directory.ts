import { SeedLocation } from '../../../application/ports/location-directory.contract';
import { LocationDirectory } from '../../../application/ports/location-directory.port';

/** The one location an installation that was never migrated reads as. */
const LEGACY_PRINCIPAL = 'principal';

/** Keeps the locations in memory, only as far as the catalog asks about them. */
export class InMemoryLocationDirectory implements LocationDirectory {
  private locations: SeedLocation[] = [];

  /** Records a location, bypassing the port. */
  seed(location: SeedLocation): void {
    this.locations.push({ ...location });
  }

  activeIds(): Promise<string[]> {
    if (this.locations.length === 0) {
      return Promise.resolve([LEGACY_PRINCIPAL]);
    }
    return Promise.resolve(
      this.locations
        .map((location, index) => ({ location, index }))
        .filter(({ location }) => location.active)
        .sort(
          (a, b) =>
            a.location.createdAt.getTime() - b.location.createdAt.getTime() ||
            a.index - b.index,
        )
        .map(({ location }) => location.id),
    );
  }

  async defaultId(): Promise<string | null> {
    return (await this.activeIds())[0] ?? null;
  }
}
