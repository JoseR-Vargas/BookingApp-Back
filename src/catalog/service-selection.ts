import { Professional, Service } from './catalog.config';

/** A validated set of catalog services performed back-to-back. */
export interface ServiceSelection {
  /** Services in the order the client picked them. */
  services: Service[];
  /** Professionals that offer every selected service. */
  professionals: Professional[];
  totalPrice: number;
  totalDuration: number;
}

export type ServiceSelectionFailure = 'empty' | 'duplicate' | 'unknown';

const FAILURE_MESSAGES: Record<
  ServiceSelectionFailure,
  (serviceId?: string) => string
> = {
  empty: () => 'debes seleccionar al menos un servicio',
  duplicate: (serviceId) => `el servicio ${serviceId} está repetido`,
  unknown: (serviceId) => `el servicio ${serviceId} no existe`,
};

/** A service id list that cannot be turned into a ServiceSelection. */
export class ServiceSelectionError extends Error {
  constructor(
    readonly failure: ServiceSelectionFailure,
    readonly serviceId?: string,
  ) {
    super(FAILURE_MESSAGES[failure](serviceId));
    this.name = 'ServiceSelectionError';
  }
}
