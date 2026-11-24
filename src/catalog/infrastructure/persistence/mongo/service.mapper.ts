import { NewService, Service, ServicePatch } from '../../../domain/service';
import { ServiceRecord } from './service.entity';

/** Entity -> domain. */
export const toService = (record: ServiceRecord): Service => ({
  id: record.id,
  name: record.name,
  description: record.description,
  price: record.price,
  duration: record.duration,
  professionals: [...record.professionals],
  icon: record.icon,
  active: record.active,
});

/** Domain -> the fields of a new document (everything but the id). */
export const toNewServiceRecord = (draft: NewService) => ({
  name: draft.name,
  description: draft.description,
  price: draft.price,
  duration: draft.duration,
  professionals: [...draft.professionals],
  icon: draft.icon,
  active: draft.active,
});

/** The `$set` of an edit: only the fields it carries. */
export function toServiceSetFields(
  patch: ServicePatch,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
}
