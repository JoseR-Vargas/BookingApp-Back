import { Professional } from './professional';
import { locationIdsOf } from './professional.rules';
import { Service } from './service';

/** The public catalog shows only the active locations a professional works at. */
export function publicLocationIds(
  professional: Professional,
  defaultLocationId: string,
  activeLocationIds: Iterable<string>,
): string[] {
  const active = new Set(activeLocationIds);
  return locationIdsOf(professional, defaultLocationId).filter((id) =>
    active.has(id),
  );
}

/** The public catalog lists only the active professionals of a service. */
export function publicServiceProfessionals(
  service: Pick<Service, 'professionals'>,
  activeProfessionalIds: ReadonlySet<string>,
): string[] {
  return service.professionals.filter((id) => activeProfessionalIds.has(id));
}
