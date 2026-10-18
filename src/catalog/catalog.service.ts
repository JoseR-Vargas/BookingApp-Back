import { Injectable } from '@nestjs/common';
import {
  Catalog,
  PROFESSIONALS,
  Professional,
  SCHEDULE,
  SERVICES,
  Service,
} from './catalog.config';

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
