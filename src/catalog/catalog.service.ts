import { Injectable } from '@nestjs/common';
import {
  Catalog,
  PROFESSIONALS,
  Professional,
  SCHEDULE,
  SERVICES,
  Service,
} from './catalog.config';
import { ServiceSelection, ServiceSelectionError } from './service-selection';

@Injectable()
export class CatalogService {
  getCatalog(): Catalog {
    return {
      professionals: PROFESSIONALS,
      services: SERVICES,
      schedule: SCHEDULE,
    };
  }

  findService(id: string): Service | undefined {
    return SERVICES.find((service) => service.id === id);
  }

  findProfessional(id: string): Professional | undefined {
    return PROFESSIONALS.find((professional) => professional.id === id);
  }

  /**
   * Resolves service ids into a validated selection. Throws a
   * ServiceSelectionError for an empty list, a duplicated id or an unknown id.
   */
  resolveServices(serviceIds: string[]): ServiceSelection {
    if (serviceIds.length === 0) {
      throw new ServiceSelectionError('empty');
    }
    const duplicate = serviceIds.find(
      (id, index) => serviceIds.indexOf(id) !== index,
    );
    if (duplicate !== undefined) {
      throw new ServiceSelectionError('duplicate', duplicate);
    }

    const services = serviceIds.map((id) => {
      const found = this.findService(id);
      if (!found) {
        throw new ServiceSelectionError('unknown', id);
      }
      return found;
    });

    return {
      services,
      professionals: PROFESSIONALS.filter((professional) =>
        services.every((s) => s.professionals.includes(professional.id)),
      ),
      totalPrice: services.reduce((sum, s) => sum + s.price, 0),
      totalDuration: services.reduce((sum, s) => sum + s.duration, 0),
    };
  }

  getProfessionalsForService(serviceId: string): Professional[] {
    const service = this.findService(serviceId);
    if (!service) {
      return [];
    }
    return PROFESSIONALS.filter((professional) =>
      service.professionals.includes(professional.id),
    );
  }
}
