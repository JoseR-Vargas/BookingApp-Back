import { ListScope } from '../../../application/ports/list-scope';
import { ServiceReader } from '../../../application/ports/service.reader';
import { ServiceWriter } from '../../../application/ports/service.writer';
import { NewService, Service, ServicePatch } from '../../../domain/service';

const copy = (service: Service): Service => ({
  ...service,
  professionals: [...service.professionals],
});

/**
 * Keeps the services in memory, in creation order. It honors the same port
 * contract as the MongoDB adapter; use-case and HTTP tests run on it.
 */
export class InMemoryServiceRepository implements ServiceReader, ServiceWriter {
  private rows: Service[] = [];

  /** Puts a service in the store as given (missing fields default), bypassing the port. */
  seed(service: Partial<Service> & { id: string }): void {
    this.rows.push(
      copy({
        name: service.id,
        description: '',
        price: 0,
        duration: 30,
        professionals: [],
        icon: 'fas fa-star',
        active: true,
        ...service,
      }),
    );
  }

  get count(): number {
    return this.rows.length;
  }

  list(scope: ListScope): Promise<Service[]> {
    return Promise.resolve(
      this.rows.filter((row) => scope === 'all' || row.active).map(copy),
    );
  }

  find(id: string): Promise<Service | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    return Promise.resolve(row ? copy(row) : null);
  }

  findActive(id: string): Promise<Service | null> {
    const row = this.rows.find(
      (candidate) => candidate.id === id && candidate.active,
    );
    return Promise.resolve(row ? copy(row) : null);
  }

  findActiveByIds(ids: string[]): Promise<Service[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.active && ids.includes(row.id)).map(copy),
    );
  }

  offeredBy(professionalId: string): Promise<Service[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.professionals.includes(professionalId))
        .map(copy),
    );
  }

  async insert(
    candidates: AsyncIterable<string>,
    draft: NewService,
  ): Promise<Service> {
    for await (const id of candidates) {
      // Checking and pushing happen in one synchronous step: atomic.
      if (this.rows.some((row) => row.id === id)) continue;
      const row = copy({ id, ...draft });
      this.rows.push(row);
      return copy(row);
    }
    throw new Error('The candidates ended before one was free');
  }

  update(id: string, patch: ServicePatch): Promise<Service | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return Promise.resolve(null);
    Object.assign(row, patch);
    if (patch.professionals) row.professionals = [...patch.professionals];
    return Promise.resolve(copy(row));
  }

  delete(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
    return Promise.resolve();
  }

  removeProfessional(professionalId: string): Promise<void> {
    for (const row of this.rows) {
      row.professionals = row.professionals.filter(
        (id) => id !== professionalId,
      );
    }
    return Promise.resolve();
  }
}
