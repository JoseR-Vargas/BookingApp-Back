import { respond } from '../../../shared/infrastructure/http/respond';
import {
  ServiceInput,
  validateServiceCreate,
  validateServiceUpdate,
} from '../../domain/service.rules';

/**
 * Input DTOs of the service endpoints: the body goes through the domain
 * rules, field by field, and a broken rule leaves as a domain error (400).
 */

/** Body of `POST /admin/services`. */
export const parseCreateServiceInput = (body: unknown): ServiceInput =>
  respond(validateServiceCreate(body));

/** Body of `PATCH /admin/services/:id`; fields that are not editable are ignored. */
export const parseUpdateServiceInput = (body: unknown): Partial<ServiceInput> =>
  respond(validateServiceUpdate(body));
